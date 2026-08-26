import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { runSanaAgent } from "./src/agent/SanaAgent.js";
import { executeActionProposal } from "./src/agent/workspace.js";
import { generateContentWithRouter, generateContentStreamWithRouter } from "./src/agent/llmRouter.js";
import { executeWebSearch } from "./src/agent/searchService.js";
import { performExaSearch, performExaContents, performExaAnswer } from "./src/agent/exaSearchService.js";
import { mcpManager } from "./src/agent/mcp/McpManager.js";
import { getBaselineWeatherData, searchLocations, reverseGeocode } from "./src/agent/services/WeatherAwarenessEngine.js";
import { saveChatMessage } from "./src/lib/firebase.js";
import { getUniversalNotepad } from "./src/agent/universalNotepad.js";
import { getOrGenerateCompanionSignals } from "./src/agent/services/companionSignalsService.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK lazily / safely
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Gemini API calls will fail or use fallback response.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "prosana AI Backend", timestamp: new Date().toISOString() });
});

// Intent Analysis and Dynamic Thinking Mode Helper
interface ThinkingAnalysis {
  intent: string;
  thinkingMode: 'hard' | 'easy';
  complexityScore: number;
  appliedRules: string[];
  reasoningSteps: string[];
}

function analyzeIntentAndThinkingMode(userPrompt: string): ThinkingAnalysis {
  const promptLower = userPrompt.toLowerCase();
  
  const mentionsActives = /(retinol|retinoid|vitamin c|salicylic|glycolic|aha|bha|niacinamide|azelaic|benzoyl|tretinoin|serum)/i.test(promptLower);
  const mentionsBarrierDamage = /(burn|stinging|redness|irritat|peeling|barrier|eczema|rosacea|sensitivity|inflam|breakout)/i.test(promptLower);
  const mentionsRoutineBuild = /(routine|regimen|schedule|order|steps|am\/pm|morning|evening|combine|layer)/i.test(promptLower);
  const mentionsDeepQuestion = /(why|how does|mechanism|scientific|ingredient|compatibility|safe to mix|ph|concentration|percentage)/i.test(promptLower);
  const isCasualGreeting = /^(hi|hello|hey|good morning|good evening|thanks|thank you|who are you|what can you do)[\.!\?]*$/i.test(promptLower.trim());

  let thinkingMode: 'hard' | 'easy' = 'easy';
  let complexityScore = 2;
  const appliedRules: string[] = [];
  const reasoningSteps: string[] = [];
  let intent = "GENERAL_QUERY";

  if (isCasualGreeting) {
    intent = "CASUAL_GREETING";
    thinkingMode = 'easy';
    complexityScore = 1;
    appliedRules.push("Casual greeting -> Direct conversational mode.");
  } else {
    if (mentionsActives) {
      intent = "INGREDIENT_CHEMISTRY";
      complexityScore += 3;
      appliedRules.push("Active ingredient chemistry / compatibility detected.");
    }

    if (mentionsBarrierDamage) {
      intent = "BARRIER_TRIAGE";
      complexityScore += 4;
      appliedRules.push("Skin barrier vulnerability / acute damage alert detected.");
    }

    if (mentionsRoutineBuild) {
      intent = "REGIMEN_SYNTHESIS";
      complexityScore += 3;
      appliedRules.push("Multi-step AM/PM regimen layering protocol requested.");
    }

    if (mentionsDeepQuestion) {
      intent = "DERMATOLOGICAL_EXPLANATION";
      complexityScore += 2;
      appliedRules.push("Scientific mechanism inquiry detected.");
    }

    if (complexityScore >= 5) {
      thinkingMode = 'hard';
    } else {
      thinkingMode = 'easy';
    }
  }

  return {
    intent,
    thinkingMode,
    complexityScore: Math.min(10, complexityScore),
    appliedRules,
    reasoningSteps: []
  };
}

function getUserProfileContextString(userProfile: any): string {
  if (!userProfile) return "";
  const settings = userProfile.settings || {};
  const onboarding = settings.onboardingProfile || {};
  const name = settings.preferredName || userProfile.displayName || "User";
  const perception = settings.userPerceptionText || onboarding.userPerceptionText || "Not specified";
  const location = settings.locationName || "Local Area";
  const skinType = onboarding.skinType || settings.skinType || "Combination";
  const concerns = onboarding.concerns || [];
  const event = settings.upcomingEvent || onboarding.upcomingEvent || "None specified";
  const priorities = settings.skinPriorities || onboarding.skinPriorities || "Overall skin health & barrier glow";

  return `\nUser Profile Context:
- Preferred Name: ${name}
- Self-Described Skin Perception: "${perception}"
- Registered Skin Type: ${skinType}
- Target Skin Concerns: ${Array.isArray(concerns) ? concerns.join(', ') : concerns}
- Location / Climate: ${location}
- Upcoming Event Target: ${event}
- Skin Goals / Priorities: ${priorities}
- Gender / Biological Profile: ${settings.gender || 'Not specified'}
- Height: ${settings.height ? settings.height + ' cm' : 'Not specified'}
`;
}

// AI Chat Endpoint with SANA Thinking Agent
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, userProfile } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }

    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.text || "";
    const thinkingAnalysis = analyzeIntentAndThinkingMode(lastUserMsg);

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        role: "model",
        text: `I have analyzed your request ("${thinkingAnalysis.intent}") in ${thinkingAnalysis.thinkingMode.toUpperCase()} thinking mode. Connect your GEMINI_API_KEY for live AI responses.`,
        thinkingMeta: thinkingAnalysis
      });
    }

    const userCtx = getUserProfileContextString(userProfile);
    const systemInstruction = `You are prosana, a sophisticated AI skin health & wellness thinking companion.
User Name: ${userProfile?.settings?.preferredName || userProfile?.displayName || 'User'}.
${userCtx}
Selected Agent Thinking Strategy: ${thinkingAnalysis.thinkingMode.toUpperCase()} THINKING MODE (Calculated Complexity: ${thinkingAnalysis.complexityScore}/10).
Detected Intent: ${thinkingAnalysis.intent}.
Applied Agent Swift Rules: ${thinkingAnalysis.appliedRules.join("; ")}.

Instructions:
${thinkingAnalysis.thinkingMode === 'hard'
  ? "Deliver a deep, thorough, health and skin analysis. Break down active ingredients, skin barrier protection rules, and step-by-step guidance clearly with expert depth."
  : "Deliver a concise, clear, and direct friendly answer. Keep it approachable and easy to digest."
}
Always address the user warmly using their Preferred Name if available. Never use emojis. Maintain an elegant, warm, empathetic tone.`;

    // Convert messages to Gemini format
    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    let responseText = "";
    let extractedThoughts: string[] = [];
    try {
      const routerResult = await generateContentWithRouter({
        contents,
        systemInstruction,
        temperature: thinkingAnalysis.thinkingMode === 'hard' ? 0.4 : 0.7,
        includeThoughts: true
      });
      responseText = routerResult.text;
      if (routerResult.thoughts && routerResult.thoughts.length > 0) {
        extractedThoughts = routerResult.thoughts;
      }
    } catch (genErr: any) {
      console.warn("Gemini generation fallback across all models:", genErr?.message || genErr);
      responseText = thinkingAnalysis.thinkingMode === 'hard'
        ? `I apologize, but our AI services are currently out of credits/capacity across all models.\n\n[FALLBACK CLINICAL ANALYSIS: ${thinkingAnalysis.intent}]\n1. Active Ingredient Chemistry: Layer lightweight water-based serums before rich barrier creams.\n2. Barrier Protection: Avoid combining high-strength retinoids and exfoliating acids (AHA/BHA) in the same session.\n3. Protection: Always finish your morning routine with broad-spectrum SPF 50.`
        : `I apologize, but our AI services are currently out of credits/capacity across all models. I processed your request ("${thinkingAnalysis.intent}") in offline fallback mode. Keep your routine simple, hydrated, and protected with daily sunscreen.`;
    }

    const finalReasoningSteps = extractedThoughts.length > 0
      ? [...thinkingAnalysis.reasoningSteps, "--- Gemini Model Thought Trace ---", ...extractedThoughts]
      : thinkingAnalysis.reasoningSteps;

    return res.json({
      role: "model",
      text: responseText || "I'm here to support your skin and health wellness. How can I assist you today?",
      thinkingMeta: {
        ...thinkingAnalysis,
        reasoningSteps: finalReasoningSteps,
        modelThoughts: extractedThoughts
      }
    });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: "Failed to generate AI response", details: error?.message });
  }
});

// SSE Streaming Route for Real-time AI Agent Thinking & Response
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { messages = [], userProfile = {} } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid payload: 'messages' must be an array" });
    }

    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.text || "";
    const thinkingAnalysis = analyzeIntentAndThinkingMode(lastUserMsg);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial metadata event
    res.write(`data: ${JSON.stringify({ type: 'meta', thinkingMeta: thinkingAnalysis })}\n\n`);

    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    const userCtx = getUserProfileContextString(userProfile);
    const systemInstruction = `You are prosana, a sophisticated AI skin health & wellness thinking companion.
User Name: ${userProfile?.settings?.preferredName || userProfile?.displayName || 'User'}.
${userCtx}
Selected Agent Thinking Strategy: ${thinkingAnalysis.thinkingMode.toUpperCase()} THINKING MODE (Calculated Complexity: ${thinkingAnalysis.complexityScore}/10).
Detected Intent: ${thinkingAnalysis.intent}.
Applied Agent Swift Rules: ${thinkingAnalysis.appliedRules.join("; ")}.

Instructions:
${thinkingAnalysis.thinkingMode === 'hard'
  ? "Deliver a deep, thorough, clinical-grade skin health analysis. Break down active ingredients, skin barrier protection rules, and step-by-step guidance clearly with expert depth."
  : "Deliver a concise, clear, and direct friendly answer. Keep it approachable and easy to digest."
}
Always address the user warmly using their Preferred Name if available. Never use emojis. Maintain an elegant, warm, empathetic tone.`;

    try {
      const streamGenerator = generateContentStreamWithRouter({
        contents,
        systemInstruction,
        temperature: thinkingAnalysis.thinkingMode === 'hard' ? 0.4 : 0.7,
        includeThoughts: true
      });

      for await (const { chunk } of streamGenerator) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if ((part as any).thought) {
              res.write(`data: ${JSON.stringify({ type: 'thought', text: (part as any).thought })}\n\n`);
            }
            if (part.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: part.text })}\n\n`);
            }
          }
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (streamErr: any) {
      console.warn("Stream error in /api/chat/stream:", streamErr?.message || streamErr);
      res.write(`data: ${JSON.stringify({
        type: 'text',
        text: thinkingAnalysis.thinkingMode === 'hard'
          ? `[CLINICAL ANALYSIS: ${thinkingAnalysis.intent}]\n1. Active Ingredient Chemistry: Layer lightweight water-based serums before rich barrier creams.\n2. Barrier Protection: Avoid combining high-strength retinoids and exfoliating acids in the same session.\n3. Protection: Always finish morning routine with SPF 50.`
          : `I processed your request in offline fallback mode. Keep your routine simple, hydrated, and protected with daily sunscreen.`
      })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Error in /api/chat/stream:", error);
    res.status(500).json({ error: "Failed to stream AI response" });
  }
});

// prosana Multi-step Agent Protocol Endpoint Handler
const handleAgentCall = async (req: express.Request, res: express.Response) => {
  try {
    const { userId = "guest_user", message, sessionId, history, attachments } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing required string field 'message'" });
    }

    const agentResult = await runSanaAgent({
      userId,
      message,
      sessionId,
      attachments,
      history
    });

    return res.json({
      text: agentResult.text,
      actionProposal: agentResult.actionProposal,
      sessionId: agentResult.sessionId,
      passOnTrace: agentResult.passOnTrace,
      iterations: agentResult.iterations,
      toolResults: agentResult.toolResults
    });
  } catch (error: any) {
    console.error("Error in agent endpoint:", error);
    return res.json({
      text: "I am prosana, your health & skin companion. I encountered a transient processing error. For your skin safety: 1. Always apply broad-spectrum SPF 50 daily. 2. Keep active ingredients balanced. 3. Hydrate with ceramide-based moistures.",
      sessionId: req.body?.sessionId || `session_${Date.now()}`,
      passOnTrace: [
        {
          thought: `Server catch fallback: ${error?.message || 'Execution error'}`,
          intent: 'clinical_synthesis',
          status: 'ready'
        }
      ],
      iterations: 1,
      toolResults: []
    });
  }
};

app.post("/api/prosana", handleAgentCall);
app.post("/api/sana", handleAgentCall);

// Secure Web Search Proxy Endpoint
app.post("/api/search", async (req, res) => {
  try {
    const { query, options } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const searchResult = await executeWebSearch(query, options);
    return res.json(searchResult);
  } catch (error: any) {
    console.error("Error in /api/search:", error);
    return res.status(500).json({
      error: "Failed to execute web search",
      details: error?.message || String(error)
    });
  }
});

// Full Exa Search API Proxy
app.post("/api/exa/search", async (req, res) => {
  try {
    const { query, type, numResults, systemPrompt, outputSchema, contents, includeDomains, excludeDomains, maxAgeHours } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const result = await performExaSearch({
      query,
      type,
      numResults,
      systemPrompt,
      outputSchema,
      contents,
      includeDomains,
      excludeDomains,
      maxAgeHours
    });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/search:", error);
    return res.status(500).json({
      error: "Exa Search execution failed",
      details: error?.message || String(error)
    });
  }
});

// Exa Contents API Proxy
app.post("/api/exa/contents", async (req, res) => {
  try {
    const { urls, highlights, text, summary, maxAgeHours } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "Missing required array field 'urls'" });
    }

    const result = await performExaContents({ urls, highlights, text, summary, maxAgeHours });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/contents:", error);
    return res.status(500).json({
      error: "Exa Contents extraction failed",
      details: error?.message || String(error)
    });
  }
});

// Exa Answer API Proxy
app.post("/api/exa/answer", async (req, res) => {
  try {
    const { query, text } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const result = await performExaAnswer({ query, text });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/answer:", error);
    return res.status(500).json({
      error: "Exa Answer failed",
      details: error?.message || String(error)
    });
  }
});

// ==========================================
// MODEL CONTEXT PROTOCOL (MCP) REST ENDPOINTS
// ==========================================

// 1. Get List of Configured MCP Servers
app.get("/api/mcp/servers", (_req, res) => {
  try {
    const servers = mcpManager.getServers();
    return res.json({ success: true, count: servers.length, servers });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/servers:", error);
    return res.status(500).json({ error: "Failed to list MCP servers", details: error?.message || String(error) });
  }
});

// 2. Connect a new External MCP Server (SSE Transport)
app.post("/api/mcp/servers", async (req, res) => {
  try {
    const { id, name, url, description } = req.body;
    if (!id || !name || !url) {
      return res.status(400).json({ error: "Missing required fields: id, name, url" });
    }

    const serverConfig = await mcpManager.connectSseServer(id, name, url, description);
    return res.json({ success: true, server: serverConfig });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/servers:", error);
    return res.status(500).json({ error: "Failed to connect MCP server", details: error?.message || String(error) });
  }
});

// 3. Disconnect an MCP Server
app.delete("/api/mcp/servers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const removed = await mcpManager.disconnectServer(id);
    return res.json({ success: removed, id });
  } catch (error: any) {
    console.error(`Error in DELETE /api/mcp/servers/${req.params.id}:`, error);
    return res.status(500).json({ error: "Failed to disconnect MCP server", details: error?.message || String(error) });
  }
});

// 4. Get List of All Active MCP Tools across connected servers
app.get("/api/mcp/tools", async (_req, res) => {
  try {
    const tools = await mcpManager.getAllMcpTools();
    return res.json({ success: true, count: tools.length, tools });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/tools:", error);
    return res.status(500).json({ error: "Failed to list MCP tools", details: error?.message || String(error) });
  }
});

// 5. Invoke/Test an MCP Tool directly
app.post("/api/mcp/tools/call", async (req, res) => {
  try {
    const { fullName, serverId, toolName, args = {} } = req.body;
    const targetName = fullName || (serverId && toolName ? `mcp__${serverId}__${toolName}` : null);

    if (!targetName) {
      return res.status(400).json({ error: "Must specify 'fullName' or 'serverId' + 'toolName'" });
    }

    const result = await mcpManager.callTool(targetName, undefined, args);
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/tools/call:", error);
    return res.status(500).json({ error: "Failed to execute MCP tool", details: error?.message || String(error) });
  }
});

// 6. Get List of Exposed MCP Resources
app.get("/api/mcp/resources", async (_req, res) => {
  try {
    const resources = await mcpManager.getResources();
    return res.json({ success: true, count: resources.length, resources });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/resources:", error);
    return res.status(500).json({ error: "Failed to list MCP resources", details: error?.message || String(error) });
  }
});

// 7. Read an MCP Resource by URI
app.post("/api/mcp/resources/read", async (req, res) => {
  try {
    const { serverId, uri } = req.body;
    if (!serverId || !uri) {
      return res.status(400).json({ error: "Missing required fields 'serverId' and 'uri'" });
    }

    const content = await mcpManager.readResource(serverId, uri);
    return res.json({ success: true, content });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/resources/read:", error);
    return res.status(500).json({ error: "Failed to read MCP resource", details: error?.message || String(error) });
  }
});

// 8. Get List of MCP Prompts
app.get("/api/mcp/prompts", async (_req, res) => {
  try {
    const prompts = await mcpManager.getPrompts();
    return res.json({ success: true, count: prompts.length, prompts });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/prompts:", error);
    return res.status(500).json({ error: "Failed to list MCP prompts", details: error?.message || String(error) });
  }
});

// 9. Get Expanded MCP Prompt Template
app.post("/api/mcp/prompts/get", async (req, res) => {
  try {
    const { serverId, promptName, args = {} } = req.body;
    if (!serverId || !promptName) {
      return res.status(400).json({ error: "Missing required fields 'serverId' and 'promptName'" });
    }

    const promptData = await mcpManager.getPrompt(serverId, promptName, args);
    return res.json({ success: true, prompt: promptData });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/prompts/get:", error);
    return res.status(500).json({ error: "Failed to expand MCP prompt", details: error?.message || String(error) });
  }
});

// 10. Get MCP Tool Call Trace Logs
app.get("/api/mcp/logs", (_req, res) => {
  try {
    const logs = mcpManager.getLogs();
    return res.json({ success: true, count: logs.length, logs });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/logs:", error);
    return res.status(500).json({ error: "Failed to get MCP logs", details: error?.message || String(error) });
  }
});

const handleExecuteAction = async (req: express.Request, res: express.Response) => {
  try {
    const { userId = "guest_user", proposal } = req.body;
    if (!proposal || !proposal.actionId || !proposal.actionType) {
      return res.status(400).json({ error: "Invalid actionProposal parameters" });
    }

    const execResult = await executeActionProposal(userId, proposal);
    return res.json(execResult);
  } catch (error: any) {
    console.error("Error in action execution:", error);
    return res.status(500).json({
      error: "Failed to execute action proposal",
      details: error?.message || String(error)
    });
  }
};

app.post("/api/prosana/execute", handleExecuteAction);
app.post("/api/sana/execute", handleExecuteAction);

// Location Search Endpoint
app.get("/api/location/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      return res.json({ results: [] });
    }
    const results = await searchLocations(query);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to search locations", details: err?.message });
  }
});

// Location Reverse Geocode Endpoint
app.get("/api/location/reverse", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: "Invalid lat/lon" });
    }
    const locationName = await reverseGeocode(lat, lon);
    res.json({ locationName, lat, lon });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reverse geocode", details: err?.message });
  }
});

// Daily Briefing Endpoint
app.post("/api/daily-brief", async (req, res) => {
  try {
    const { temperatureUnit = "C", latitude, longitude, locationName } = req.body;
    
    let reqLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : undefined;
    let reqLon = typeof longitude === 'number' && !isNaN(longitude) ? longitude : undefined;
    let reqLocName = locationName?.trim();

    // If coordinates were not sent from client, attempt IP geolocation fallback
    if (reqLat === undefined || reqLon === undefined) {
      if (!reqLocName || reqLocName === 'Local Area' || reqLocName === 'Local Atmosphere' || reqLocName === 'Location Access Required') {
        try {
          const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
          let ipRes = await fetch(`https://freeipapi.com/api/json/${clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' ? clientIp : ''}`);
          if (!ipRes.ok) {
            ipRes = await fetch('https://freeipapi.com/api/json');
          }
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            if (typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number' && !isNaN(ipData.latitude)) {
              reqLat = ipData.latitude;
              reqLon = ipData.longitude;
              reqLocName = [ipData.cityName, ipData.regionName, ipData.countryName].filter(Boolean).join(', ');
            }
          }
        } catch (ipErr) {
          console.warn("IP Geolocation lookup warning:", ipErr);
        }
      }
    }

    const weather = await getBaselineWeatherData(reqLat, reqLon, reqLocName);

    if ((weather as any).isLocationMissing) {
      return res.json({
        isLocationMissing: true,
        greeting: "Welcome to prosana",
        temperature: "--",
        feelsLike: "--",
        weatherCondition: "Location Access Needed",
        uvIndex: 0,
        uvLevel: "None",
        humidity: "--",
        dewPoint: "--",
        locationName: "Location Access Needed",
        waterTargetLiters: "2.4L",
        airQualityAqi: 0,
        pm25: 0,
        pm10: 0,
        ozone: 0,
        no2: 0,
        cloudCover: 0,
        precipProb: 0,
        windSpeed: 0,
        windGusts: 0,
        vpdKpa: 0,
        uvIndexClearSky: 0,
        primaryReminders: [
          "Set your location in Settings to receive real-time UV & climate wellness alerts.",
          "Hydration target: 2.4L throughout the day",
          "Scheduled evening wellness routine at 9:00 PM"
        ]
      });
    }

    const isFahrenheit = temperatureUnit === "F";
    const displayTemp = isFahrenheit 
      ? `${Math.round((weather.tempC * 9/5) + 32)}°F` 
      : `${Math.round(weather.tempC)}°C`;

    const displayFeelsLike = isFahrenheit
      ? `${Math.round((weather.feelsLikeC * 9/5) + 32)}°F`
      : `${Math.round(weather.feelsLikeC)}°C`;
      
    let uvLevel = "None";
    if (weather.uvIndex === 0) uvLevel = "Zero (Night)";
    else if (weather.uvIndex < 3) uvLevel = "Low";
    else if (weather.uvIndex < 6) uvLevel = "Moderate";
    else if (weather.uvIndex < 8) uvLevel = "High";
    else if (weather.uvIndex < 11) uvLevel = "Very High";
    else uvLevel = "Extreme";

    const displayLocation = reqLocName || weather.locationName || "Local Area";

    res.json({
      isLocationMissing: false,
      greeting: weather.uvIndex > 0 ? "Morning, sunshine" : "Evening, serene skin",
      temperature: displayTemp,
      feelsLike: displayFeelsLike,
      weatherCondition: (weather as any).weatherCondition || (weather.uvIndex > 0 ? "Partly Sunny" : "Clear Night Sky"),
      uvIndex: weather.uvIndex,
      uvLevel: uvLevel,
      humidity: `${weather.humidity}%`,
      dewPoint: `${weather.dewPointC}°C`,
      locationName: displayLocation,
      waterTargetLiters: "2.4L",
      airQualityAqi: weather.airQualityAqi,
      pm25: weather.pm25,
      pm10: weather.pm10,
      ozone: weather.ozone,
      no2: weather.no2,
      cloudCover: weather.cloudCoverPercent,
      precipProb: weather.precipProbPercent,
      windSpeed: weather.windSpeedKmH,
      windGusts: weather.windGustsKmH,
      vpdKpa: weather.vpdKpa,
      uvIndexClearSky: weather.uvIndexClearSky,
      peakUvIndex: (weather as any).peakUvIndex,
      primaryReminders: [
        weather.uvIndex > 0
          ? `Apply broad-spectrum sunscreen before going outdoors (UV: ${weather.uvIndex} ${uvLevel})`
          : `Nighttime: Focus on evening wellness, hydration & rest.`,
        "Hydration target: 2.4L throughout the day",
        "Scheduled evening wellness routine at 9:00 PM"
      ]
    });
  } catch (error: any) {
    console.warn("Daily brief generation error:", error);
    res.status(500).json({ error: "Failed to generate daily brief" });
  }
});

// Daily Companion / Compassion Sync Signals Endpoint (Warm, context-aware diurnal companion thoughts)
app.post("/api/companion-signals", async (req, res) => {
  try {
    const {
      userId = "guest_user",
      userProfile,
      forceRefresh = false,
      latitude,
      longitude,
      clientLocalTime,
      clientHour,
      clientDateStr,
      timezone
    } = req.body;

    const result = await getOrGenerateCompanionSignals(userId, userProfile, {
      forceRefresh,
      latitude,
      longitude,
      clientLocalTime,
      clientHour,
      clientDateStr,
      timezone
    });
    return res.json(result);
  } catch (error: any) {
    console.error("Error generating companion signals:", error);
    return res.status(500).json({
      error: "Failed to generate companion signals",
      details: error?.message || String(error)
    });
  }
});

// Vite Middleware Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*all", (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application dist/index.html not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`prosana Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
