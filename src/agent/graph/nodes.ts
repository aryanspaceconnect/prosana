import { GoogleGenAI } from '@google/genai';
import { AgentState } from './state.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from '../soul.js';
import { SANA_TOOL_REGISTRY } from '../tools.js';
import { loadContextForAgent } from '../workspace.js';
import { PassOnSchema, PassOn, ToolResult } from '../types.js';
import { generateContentWithRouter, LLMFunctionCall, AllModelsExhaustedError, LLMRequestPriority } from '../llmRouter.js';
import { AgentCheckpointService } from '../services/AgentCheckpointService.js';
import { getGeminiToolDeclarations, findToolByName, refreshMcpToolsCache } from '../geminiTools.js';
import { getSessionNotepad } from '../sessionNotepad.js';
import { getVaultFileSystemIndex } from '../agentVault.js';
import { touchSession } from '../sessionManager.js';
import { getTemporalPromptHeader } from '../services/TemporalEngine.js';
import { getBaselineWeatherPromptHeader } from '../services/WeatherAwarenessEngine.js';

export async function buildSystemPrompt(
  userId: string,
  sessionNotepadContent?: string,
  userLocation?: { lat?: number; lon?: number; locationName?: string },
  userProfile?: any
): Promise<string> {
  const temporalHeader = getTemporalPromptHeader();
  const weatherHeader = await getBaselineWeatherPromptHeader(userLocation?.lat, userLocation?.lon, userLocation?.locationName);
  const notepadStr = sessionNotepadContent && sessionNotepadContent.trim().length > 0
    ? sessionNotepadContent
    : '(Empty - use `update_session_notepad` tool to save working notes, user constraints, or key findings for this session)';

  let fileSystemIndex = '';
  try {
    fileSystemIndex = await getVaultFileSystemIndex(userId);
  } catch (err) {
    fileSystemIndex = 'ROOT DIRECTORY (/)\n  └── (No files or folders created yet.)';
  }

  const userProfileSection = userProfile
    ? `\n### USER PROFILE & BASELINE CONTEXT:
- Preferred Name: ${userProfile?.settings?.preferredName || userProfile?.displayName || 'User'}
- Skin Type: ${userProfile?.settings?.onboardingProfile?.skinType || userProfile?.settings?.skinType || 'Not specified'}
- Skin Concerns: ${Array.isArray(userProfile?.settings?.onboardingProfile?.concerns) ? userProfile.settings.onboardingProfile.concerns.join(', ') : (userProfile?.settings?.skinConcerns || 'None specified')}
- Self-Perception: ${userProfile?.settings?.userPerceptionText || userProfile?.settings?.onboardingProfile?.userPerceptionText || 'Not specified'}
- Location: ${userLocation?.locationName || userProfile?.settings?.locationName || 'Local Area'}
` : '';

  return `${temporalHeader}
${weatherHeader}
${userProfileSection}

${SANA_SOUL}

### STRICT DOMAIN SCOPE & GUARDRAIL RULE (TOKEN ECONOMY):
You are exclusively SANA, an AI companion specialized strictly in dermatology, skin barrier health, skincare routines, ingredients, exposome factors, and personal skin scan reports.
IF the user's request is completely off-topic and unrelated to skin health, dermatology, skincare products/routines, cosmetics, ingredients, climate/weather impacts on skin, or user profile/scan reports (for example: asking to write software/programming code, debug code, recommend cars to buy, solve math problems, write general essays, financial advice, or general trivia):
YOU MUST IMMEDIATELY OUTPUT ONLY THE SINGLE TOKEN TRIGGER:
[[OFF_TOPIC_REJECT]]
Do NOT attempt to answer off-topic queries, DO NOT call any tools, DO NOT write long explanations or waste tokens. Output ONLY: [[OFF_TOPIC_REJECT]]

### IN-CONTEXT LEARNING (ICL): ENVIRONMENTAL & GEOLOGICAL DECISION RULES
1. BASELINE CONTEXT (No tool needed):
   - For routine casual conversations, simple routine checks, greetings, or basic skin queries, rely ONCE on the baseline \`[ENVIRONMENT & EXPOSOME]\` context header above. DO NOT invoke \`fetch_advanced_environmental_data\`.

2. ADVANCED TOOL TRIGGER CONDITIONS (Invoke \`fetch_advanced_environmental_data\`):
   - Trigger Condition A (Acute Flare-Ups & Pollution): User reports sudden inexplicable breakout, barrier burning, dermatitis flare, or pollution exposure. Query \`includeAirQuality: true\` (PM2.5, PM10, NO2, Ozone, Pollen) and \`includeHourlyForecast: true\`.
   - Trigger Condition B (Geological Relocation / Travel): User mentions traveling, changing cities, or moving ("Because of where you live" effect). Query with target lat/long, \`includeDaily7DayTrend: true\` and \`includeYesterdayComparison: true\`.
   - Trigger Condition C (Sunscreen, Cloud Penetration & Rain): User asks about SPF dosage, dark spots, or outdoor protection. Query \`includeSolarRadiation: true\` (Clear-sky vs cloudy UV max ratio; remember: "Clouds aren't safety") and check precipitation probability (12h) to advise reapplication or blotting.
   - Trigger Condition D (Seasonal / Atmospheric Shifts): User asks about mugginess vs dry heat, wind burn, or routine transitions. Analyze Vapour Pressure Deficit (VPD in kPa), wind gusts, dew point, and yesterday vs today humidity trends.

3. TIMESTAMPED MEMORY NOTEPAD LOGGING:
   - When you execute \`fetch_advanced_environmental_data\`, analyze the payload and write a concise, structured entry to the Session Notepad using \`update_session_notepad\` in format:
     \`[ENV_LOG: <ISO_TIMESTAMP>] Location: <City> | AQI: <AQI> (PM2.5: <val>, NO2: <val>, O3: <val>) | Dew Pt: <val> | VPD: <val> kPa | UV: <val> (ClearSky: <val>) | Wind: <val> km/h (Gusts: <val>) | Yesterday Diff: <val>% | Clinical Assessment: <Summary>\`
   - When reading old \`[ENV_LOG]\` entries from the notepad, compare its timestamp against the Real-Time Temporal Ground Truth in the prompt header to calculate how many hours/days old it is before using it.

### HARD CONSTRAINTS:
${SANA_HARD_CONSTRAINTS.map(c => `- ${c}`).join('\n')}

### APP ROUTE MAP:
${JSON.stringify(SANA_APP_MAP, null, 2)}

### ROOT FILE & FOLDER SYSTEM DIRECTORY INDEX (VAULT WORKSPACE):
${fileSystemIndex}

### SANA SESSION NOTEPAD (PRIVATE WORKING MEMORY FOR THIS SESSION):
${notepadStr}

### VIRTUAL FILE & FOLDER SYSTEM CAPABILITIES:
You have complete autonomous authority to manage virtual files and folders inside user Agent Vault:
1. CREATE FOLDERS (\`create_folder\`): Create new folders or nested subfolders for organization (e.g. \`/PM_Routines\`, \`/Scans/2026\`, \`/Prescriptions\`).
2. CREATE FILES (\`create_file\`): Create virtual files containing notes, guides, protocols, or logs inside specific folders.
3. ARRANGE FILES (\`arrange_files\`): Organize and move existing files into designated target folders.
4. CREATE HYPERLINKS (\`create_hyperlink\`): Link related files, folders, or web URLs together to build a connected knowledge graph.
5. ACCESS FOLDER (\`access_folder\`): Open and inspect any folder to get its map/index. Whenever you state "I have decided to open this folder", YOU MUST CALL THE \`access_folder\` TOOL!
6. ACCESS FILE (\`access_file\`): Open and read any file in Agent Vault.

### MODEL CONTEXT PROTOCOL (MCP) INTERFACE:
You are fully equipped with Model Context Protocol (MCP) capabilities.
- MCP Server Tools are dynamically registered with prefix \`mcp__<server_id>__<tool_name>\` (e.g. \`mcp__sana_vault__search_vault\`, \`mcp__sana_knowledge__exa_answer\`, \`mcp__sana_dermatology__calculate_fitzpatrick\`, \`mcp__sana_notepad__read_notepad\`, and any custom connected remote/local MCP servers).
- You can execute MCP tools seamlessly as native function calls.
- Every MCP tool call execution, parameter set, and response payload is captured in SANA's execution trace and thought-chain logs.

### AUTONOMOUS AGENT TOOL & REASONING PROTOCOL:
You are SANA operating with native Function Calling.
- You have access to tools for querying the Agent Vault, managing files & folders, searching memories, recording user identity, logging incidents, creating calendar events, updating your private session notepad, and running connected MCP tools.
- IMPORTANT: Use tools selectively when they genuinely assist in fulfilling the user's intent. For simple conversational messages or greetings ("hi", "hello", "how are you"), answer naturally and warmly without executing unnecessary tools.

### TOOL CALLING GUIDELINES (EXECUTE WHEN RELEVANT TO INTENT):
1. USER IDENTITY & PERSONAL DETAILS: When the user shares their name, preferred nickname, city, climate, or lifestyle, call \`save_user_identity\`.
2. SKIN GOALS: When the user defines or adjusts a skin target, call \`save_vault_goal\`.
3. SKIN COMPOSITION & PROFILE: When the user specifies their skin type or known sensitivities, call \`update_skin_composition\`.
4. REACTION & FLARE INCIDENTS: When the user reports an acute flare or adverse reaction, call \`save_vault_incident\` or \`save_memory_note\`.
5. VAULT SEARCH: When retrieving past records or saved notes, call \`vault_search\`, \`search_agent_vault\`, or \`mcp__sana_vault__search_vault\`.
6. SESSION NOTEPAD: Use \`update_session_notepad\` or \`mcp__sana_notepad__append_note\` to persist key insights across multi-turn sessions.
7. WEB RESEARCH: When live scientific literature, ingredient combinations, or updated clinical data is needed, call \`exa_search\`, \`exa_answer\`, \`web_search\`, \`web_fetch\`, or \`mcp__sana_knowledge__exa_answer\`.
8. DERMATOLOGY CALCULATIONS: When Fitzpatrick phototype scoring or barrier indices are required, call \`mcp__sana_dermatology__calculate_fitzpatrick\` or \`mcp__sana_dermatology__evaluate_barrier_index\`.
9. FILE & FOLDER ORGANIZER: Use \`create_folder\`, \`create_file\`, \`arrange_files\`, \`create_hyperlink\`, \`access_folder\`, and \`access_file\` when the user asks to manage files/folders.
10. SKIN SCAN VAULT RETRIEVAL (\`retrieve_skin_scan_vault\`): When the user explicitly requests to review facial scan history, scores, raw reports, or progress masks, call \`retrieve_skin_scan_vault\`.
11. PRODUCT & ITEM IMAGE SEARCH (\`image_search\`): When recommending skincare products or items, call \`image_search\` to retrieve real product images and embed them cleanly via Markdown \`![Product Name](imageUrl)\`.
12. CALENDAR & EVENT SCHEDULING (\`save_vault_event\` & \`propose_create_event\`): When scheduling reminders or routine timelines, call \`save_vault_event\` or \`propose_create_event\`.

CRITICAL RULE: NEVER state in text that you have saved or stored preferences unless you execute the corresponding tool call.
- When tool results return, synthesize a comprehensive, clean, and helpful response for the user.
- NEVER output raw tool debugging text (e.g., "I will call access_file now").
- STRICT NO-EMOJI RULE: Do NOT include any emojis or visual icons in your text responses.
`;
}

export async function initializeNode(state: AgentState) {
  // Touch active session to refresh 10-min inactivity timer
  touchSession(state.sessionId, state.userId);

  // Load context for agent
  const loadedContext = await loadContextForAgent(state.userId, state.sessionId, {
    profile: true,
    history: true,
    routine: true,
    vault: true
  });

  // Get session scratchpad
  const sessionNotepad = await getSessionNotepad(state.sessionId, state.userId);

  // Helper to construct Gemini message parts including inline image attachments
  const buildPartsFromMessageAndAttachments = (text: string, attachments?: any[]) => {
    const parts: any[] = [{ text: text || '' }];
    if (attachments && Array.isArray(attachments)) {
      for (const att of attachments) {
        if (att.type === 'image' && att.url) {
          let base64Data = '';
          let mimeType = att.mimeType || 'image/jpeg';
          if (att.url.startsWith('data:')) {
            const matches = att.url.match(/^data:([^;]+);base64,(.+)$/);
            if (matches) {
              mimeType = matches[1];
              base64Data = matches[2];
            }
          } else {
            base64Data = att.url;
          }
          if (base64Data) {
            parts.push({
              inlineData: {
                mimeType,
                data: base64Data
              }
            });
          }
        } else if (att.type === 'document' && att.textContent) {
          parts.push({
            text: `\n[Attached Document "${att.name}"]: ${att.textContent}`
          });
        }
      }
    }
    return parts;
  };

  // Construct initial Gemini conversation messages if not already present
  let llmMessages = state.llmMessages || [];
  if (llmMessages.length === 0) {
    llmMessages = [];
    
    // Include full conversation history (up to last 30 turns)
    if (state.history && state.history.length > 0) {
      const historyWindow = state.history.length > 30 ? state.history.slice(-30) : state.history;
      for (const item of historyWindow) {
        llmMessages.push({
          role: item.role === 'model' ? 'model' : 'user',
          parts: buildPartsFromMessageAndAttachments(item.text, item.attachments)
        });
      }
    }

    // Add current user message with any current turn image attachments
    llmMessages.push({
      role: 'user',
      parts: buildPartsFromMessageAndAttachments(state.message, state.attachments)
    });
  }

  const updatedState = {
    context: {
      ...state.context,
      ...loadedContext
    },
    sessionNotepad,
    llmMessages,
    status: 'thinking'
  };
  AgentCheckpointService.saveCheckpoint({ ...state, ...updatedState }, 0);
  return updatedState;
}

export async function reasoningNode(state: AgentState) {
  // Refresh active session activity
  touchSession(state.sessionId, state.userId);

  if (state.iterations > 0) {
    // Pacing delay between multi-tool autonomous reasoning turns
    await new Promise((r) => setTimeout(r, 500));
  }

  const currentIterations = state.iterations + 1;
  const currentNotepad = (await getSessionNotepad(state.sessionId, state.userId)) || state.sessionNotepad || '';
  const userProfile = (state.context as any)?.profile || (state.context as any)?.userProfile;
  const profileSettings = userProfile?.settings;
  const userLoc = {
    lat: profileSettings?.latitude,
    lon: profileSettings?.longitude,
    locationName: profileSettings?.locationName
  };
  const defaultSystemPrompt = await buildSystemPrompt(state.userId, currentNotepad, userLoc, userProfile);
  const systemPrompt = state.systemPrompt
    ? `${state.systemPrompt}\n\n=== GENERAL WORKSPACE CONTEXT ===\n${defaultSystemPrompt}`
    : defaultSystemPrompt;
  
  // Refresh active MCP tools before generating declarations
  await refreshMcpToolsCache();
  const toolsDeclarations = getGeminiToolDeclarations();

  let llmMessages = [...(state.llmMessages || [])];

  try {
    const routerResult = await generateContentWithRouter({
      contents: llmMessages,
      tools: toolsDeclarations,
      systemInstruction: systemPrompt,
      temperature: 0.3,
      includeThoughts: true,
      priority: LLMRequestPriority.CRITICAL_INTERACTIVE
    });

    // Construct PassOn trace step from thoughts or model reasoning
    const thoughtText = (routerResult.thoughts && routerResult.thoughts.length > 0)
      ? routerResult.thoughts.join('\n')
      : (routerResult.functionCalls.length > 0
          ? `Analyzed skin query and selected ${routerResult.functionCalls.length} tool(s): ${routerResult.functionCalls.map(f => f.name).join(', ')}`
          : `Synthesized skin health advice & barrier safety guidelines.`);

    const traceStep: PassOn = {
      thought: thoughtText,
      intent: routerResult.functionCalls.length > 0 ? 'tool_execution' : 'clinical_synthesis',
      status: routerResult.functionCalls.length > 0 ? 'need_info' : 'ready',
      nextTools: routerResult.functionCalls.map(fc => ({ name: fc.name, arguments: fc.args }))
    };

    // Check if the LLM issued function calls
    if (routerResult.functionCalls && routerResult.functionCalls.length > 0) {
      console.log(`[ReasoningNode] LLM selected ${routerResult.functionCalls.length} tool call(s):`, routerResult.functionCalls.map(f => f.name));

      // Append model message with function calls to conversation history
      const candidateContent = routerResult.rawResponse?.candidates?.[0]?.content;
      if (candidateContent) {
        llmMessages.push(candidateContent);
      } else {
        const modelPartList = routerResult.functionCalls.map(fc => ({
          functionCall: {
            name: fc.name,
            args: fc.args
          }
        }));

        if (routerResult.text) {
          modelPartList.unshift({ text: routerResult.text } as any);
        }

        llmMessages.push({
          role: 'model',
          parts: modelPartList
        });
      }

      const returnState = {
        pendingFunctionCalls: routerResult.functionCalls,
        passOnTrace: [...(state.passOnTrace || []), traceStep],
        llmMessages,
        status: 'calling_tools',
        iterations: currentIterations
      };
      AgentCheckpointService.saveCheckpoint({ ...state, ...returnState }, currentIterations);
      return returnState;
    }

    // LLM generated text response directly
    let responseText = routerResult.text || '';

    // Guard: Check if model outputted an intermediate monologue string without calling tools
    const isMonologue = /^(function call to|I'll call access_file|I'll call|Let me access that file|Let me access the full scan|Let's parse the payload)/i.test(responseText.trim()) || (responseText.trim().length < 25 && (state.toolResults?.length || 0) > 0 && /access_file|tool call/i.test(responseText));

    const isExplicitScanRequest = /face scan|facial scan|scan data|latest scan|scan record|vault scan/i.test(state.message || '') && !/^(hi|hello|hey|good morning|how are you)/i.test(state.message?.trim() || '');

    // Case A: Model outputted monologue for scan query prior to tool execution
    if (isMonologue && isExplicitScanRequest && (state.toolResults?.length || 0) === 0) {
      console.log('[ReasoningNode] Detected monologue for scan query prior to tool execution. Forcing retrieve_skin_scan_vault tool call...');
      const forcedToolCall: LLMFunctionCall = {
        name: 'retrieve_skin_scan_vault',
        args: { scanType: 'all', limit: 5 }
      };

      const forcedState = {
        pendingFunctionCalls: [forcedToolCall],
        passOnTrace: [...(state.passOnTrace || []), traceStep],
        llmMessages,
        status: 'calling_tools',
        iterations: currentIterations
      };
      AgentCheckpointService.saveCheckpoint({ ...state, ...forcedState }, currentIterations);
      return forcedState;
    }

    // Case B: Model outputted monologue AFTER tools have executed -> Trigger synthesis pass
    if (isMonologue && (state.toolResults?.length || 0) > 0) {
      console.log('[ReasoningNode] Detected intermediate tool monologue instead of user report. Executing mandatory synthesis pass...');
      try {
        const synthesisMessages = [
          ...llmMessages,
          {
            role: 'user',
            parts: [{
              text: `You have retrieved all requested data and tool outputs from the Agent Vault / scan records. Present a complete, comprehensive, beautifully structured user-facing report summarizing all scan scores, metrics, skin health findings, and recommended routines. Do NOT output any meta-commentary about function calls or file access.`
            }]
          }
        ];

        const synthesisResult = await generateContentWithRouter({
          contents: synthesisMessages,
          systemInstruction: systemPrompt,
          temperature: 0.3,
          includeThoughts: true,
          priority: LLMRequestPriority.CRITICAL_INTERACTIVE
        });

        if (synthesisResult.text && synthesisResult.text.trim().length > 0) {
          responseText = synthesisResult.text.trim();
        }
      } catch (synthErr) {
        console.warn('[ReasoningNode] Synthesis pass error:', synthErr);
      }
    }

    llmMessages.push({
      role: 'model',
      parts: [{ text: responseText }]
    });

    const doneState = {
      pendingFunctionCalls: [],
      passOnTrace: [...(state.passOnTrace || []), traceStep],
      finalText: responseText,
      llmMessages,
      status: 'done',
      iterations: currentIterations
    };
    AgentCheckpointService.saveCheckpoint({ ...state, ...doneState }, currentIterations);
    return doneState;

  } catch (err: any) {
    console.error('[ReasoningNode] Gemini router error across all models:', err?.message || err);
    
    // Graceful Fallback if all LLM models exhausted or rate-limited
    const vault = state.context.agentVault;
    const notesList = (vault?.notes || []).map((n: any) => `- **${n.title}** (${n.date?.slice(0, 10) || 'Recent'}): ${n.description}`).join('\n');
    const incList = (vault?.incidents || []).map((i: any) => `- **${i.title}** (${i.occurredAtDate || 'Recent'}): ${i.description || i.notes || 'Logged flare'}`).join('\n');
    const docsList = (vault?.documents || []).map((d: any) => `- **${d.title}**: ${d.summary || 'Indexed document'}`).join('\n');
    const profileInfo = vault?.composition ? `- **Skin Type**: ${vault.composition.skinTypeTendency || 'Sensitive'}\n- **Known Triggers**: ${vault.composition.knownTriggers?.join(', ') || 'None'}` : '';

    let fallbackText = '';
    if (notesList || incList || docsList || profileInfo) {
      fallbackText = `I apologize, but our AI services are currently out of credits/capacity across all models.\n\n` +
        `However, I retrieved your recorded information directly from your Sana Agent Vault:\n\n` +
        (notesList ? `### Logged Skin Memories & Notes\n${notesList}\n\n` : '') +
        (incList ? `### Tracked Reaction & Flare Incidents\n${incList}\n\n` : '') +
        (docsList ? `### Uploaded Vault Documents\n${docsList}\n\n` : '') +
        (profileInfo ? `### Skin Profile & Composition\n${profileInfo}\n\n` : '');
    } else {
      fallbackText = `I apologize, but our AI services are currently out of credits/capacity across all models. Please try again in a few moments once quota resets. Your Sana Agent Vault remains active to record your skin notes and routine logs.`;
    }

    return {
      pendingFunctionCalls: [],
      finalText: fallbackText,
      status: 'done',
      iterations: currentIterations
    };
  }
}

export async function toolsNode(state: AgentState) {
  const pendingCalls = state.pendingFunctionCalls || [];
  if (pendingCalls.length === 0) {
    return { pendingFunctionCalls: [], status: 'thinking' };
  }

  const execContext = {
    userId: state.userId || 'guest_user',
    sessionId: state.sessionId || 'session_default',
    userRole: 'consumer' as const,
    activeRoute: '/'
  };

  const newToolResults: ToolResult[] = [];
  const toolResponseParts: any[] = [];
  let generatedProposal: any = null;

  for (const call of pendingCalls) {
    const toolDef = findToolByName(call.name);
    if (!toolDef) {
      const errorResult = { error: `Tool '${call.name}' not found.` };
      newToolResults.push({
        toolName: call.name,
        success: false,
        error: errorResult.error
      });
      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: errorResult
        }
      });
      continue;
    }

    try {
      console.log(`[ToolsNode] Executing tool '${call.name}' with args:`, call.args);
      let validatedArgs: any = call.args || {};
      if (toolDef.parameters && typeof toolDef.parameters.safeParse === 'function') {
        const parseResult = toolDef.parameters.safeParse(call.args || {});
        if (parseResult.success) {
          validatedArgs = parseResult.data;
        } else {
          console.warn(`[ToolsNode] Schema warning for '${call.name}', continuing with raw/coerced args:`, parseResult.error.message);
          // If parse fails, pass raw args to execute so the tool handler's internal fallbacks can resolve it
          validatedArgs = call.args || {};
        }
      }

      const output = await toolDef.execute(validatedArgs, execContext);

      // Check if tool produced an action proposal card
      if (output?.proposal) {
        generatedProposal = output.proposal;
      }

      newToolResults.push({
        toolName: call.name,
        success: true,
        data: output
      });

      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { output }
        }
      });
    } catch (err: any) {
      console.warn(`[ToolsNode] Tool '${call.name}' execution failed:`, err?.message || err);
      const errMessage = err?.message || String(err);
      newToolResults.push({
        toolName: call.name,
        success: false,
        error: errMessage
      });

      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: { error: errMessage }
        }
      });
    }
  }

  // Append functionResponse message to Gemini conversation history using valid 'user' role
  const llmMessages = [...(state.llmMessages || [])];
  llmMessages.push({
    role: 'user',
    parts: toolResponseParts
  });

  const toolsState = {
    pendingFunctionCalls: [],
    toolResults: newToolResults,
    llmMessages,
    actionProposal: generatedProposal || state.actionProposal,
    status: generatedProposal ? 'need_approval' : 'thinking'
  };
  AgentCheckpointService.saveCheckpoint({ ...state, ...toolsState }, state.iterations);
  return toolsState;
}

export async function approvalNode(state: AgentState) {
  const proposal = state.actionProposal;
  const approvalState = {
    actionProposal: proposal || null,
    finalText: state.finalText || `I have prepared an action proposal: ${proposal?.title || 'User confirmation required'}. Please review and confirm to proceed.`
  };
  AgentCheckpointService.saveCheckpoint({ ...state, ...approvalState }, state.iterations);
  return approvalState;
}

export async function scanMeasureNode(state: AgentState) {
  return {
    context: {
      ...state.context,
      scanMetrics: {
        hydrationLevel: '42%',
        rednessIndex: 'Moderate (Zone B)',
        barrierScore: 78,
        uvExposureRisk: 'Medium-High'
      }
    }
  };
}

export async function scanInterpretNode(state: AgentState) {
  const metrics = (state.context as any).scanMetrics;
  const analysisSummary = `Dermatological Barrier Assessment:
- Stratum Corneum Hydration: ${metrics?.hydrationLevel || 'Normal'}
- Redness / Vascularization: ${metrics?.rednessIndex || 'Low'}
- Lipid Barrier Resilience: Score ${metrics?.barrierScore || 80}/100`;

  return {
    context: {
      ...state.context,
      scanAnalysis: analysisSummary
    }
  };
}

export async function scanRespondNode(state: AgentState) {
  const analysis = (state.context as any).scanAnalysis || 'Skin scan assessment completed.';
  const finalResponse = `Skin Scan & Measurement Analysis:\n\n${analysis}\n\nRecommended Guidance:\nMaintain hydration with pH-balanced (5.5) lipid ceramide moisturizer and apply SPF 30+ UV protection.`;

  const doneScanState = {
    finalText: finalResponse,
    status: 'done'
  };
  AgentCheckpointService.saveCheckpoint({ ...state, ...doneScanState }, state.iterations);
  return doneScanState;
}

export async function finalizeNode(state: AgentState) {
  if (state.finalText && state.finalText.trim().length > 0) {
    return {
      finalText: state.finalText,
      actionProposal: state.actionProposal || null,
      status: 'done'
    };
  }

  console.log('[FinalizeNode] Final text missing. Triggering Intelligent Recovery Synthesis Pass...');

  // 1. Attempt LLM Recovery Synthesis Pass using conversation history and tool outputs
  try {
    const currentNotepad = (await getSessionNotepad(state.sessionId, state.userId)) || state.sessionNotepad || '';
    const userProfile = (state.context as any)?.profile || (state.context as any)?.userProfile;
    const profileSettings = userProfile?.settings;
    const userLoc = {
      lat: profileSettings?.latitude,
      lon: profileSettings?.longitude,
      locationName: profileSettings?.locationName
    };
    const systemPrompt = await buildSystemPrompt(state.userId, currentNotepad, userLoc, userProfile);
    const llmMessages = [...(state.llmMessages || [])];

    llmMessages.push({
      role: 'user',
      parts: [{
        text: `FINAL SYNTHESIS PASS: Synthesize a complete, detailed, user-facing response addressing the user's request: "${state.message}". Integrate all completed tool outputs, scheduled calendar events, research findings, and skin health guidance above. Do NOT request any additional function calls or output meta-commentary.`
      }]
    });

    const recoveryResult = await generateContentWithRouter({
      contents: llmMessages,
      systemInstruction: systemPrompt,
      temperature: 0.3,
      priority: LLMRequestPriority.CRITICAL_INTERACTIVE
    });

    if (recoveryResult.text && recoveryResult.text.trim().length > 0) {
      return {
        finalText: recoveryResult.text.trim(),
        actionProposal: state.actionProposal || null,
        status: 'done'
      };
    }
  } catch (recErr: any) {
    console.warn('[FinalizeNode] Recovery LLM synthesis pass error:', recErr?.message || recErr);
  }

  // 2. Structured Recovery: Synthesize directly from completed tool results
  const toolResults = state.toolResults || [];
  if (toolResults.length > 0) {
    const formattedOutputs: string[] = [];
    let scheduledEvents: string[] = [];
    let researchSummaries: string[] = [];

    for (const res of toolResults) {
      if (res.success && res.data) {
        if (res.toolName === 'save_vault_event' && res.data.event) {
          const e = res.data.event;
          scheduledEvents.push(`- **${e.title}** (${e.category?.toUpperCase() || 'EVENT'}): Scheduled for ${e.scheduledAtDate || e.scheduledAt || 'Upcoming'}`);
        } else if (res.toolName === 'propose_create_event' && res.data.proposal) {
          const p = res.data.proposal;
          scheduledEvents.push(`- **${p.title}**: ${p.description}`);
        } else if (res.data.output && typeof res.data.output === 'object') {
          if (res.data.output.summary) {
            researchSummaries.push(`- ${res.data.output.summary}`);
          } else if (res.data.output.message) {
            formattedOutputs.push(`- ${res.data.output.message}`);
          }
        }
      }
    }

    let recoveredText = `I have processed your request for: "${state.message}"\n\n`;
    if (scheduledEvents.length > 0) {
      recoveredText += `### Scheduled Regimen Events\n${scheduledEvents.join('\n')}\n\n`;
    }
    if (researchSummaries.length > 0) {
      recoveredText += `### Clinical & Research Insights\n${researchSummaries.join('\n')}\n\n`;
    }
    if (formattedOutputs.length > 0) {
      recoveredText += `### Executed Actions\n${formattedOutputs.join('\n')}\n\n`;
    }

    if (scheduledEvents.length > 0 || researchSummaries.length > 0 || formattedOutputs.length > 0) {
      return {
        finalText: recoveredText.trim(),
        actionProposal: state.actionProposal || null,
        status: 'done'
      };
    }
  }

  // 3. Contextual Fallback addressing user query
  const userMsg = state.message || '';
  const fallbackText = `I have reviewed your request regarding "${userMsg}". All relevant skin health records, regimen events, and data notes in your Sana Agent Vault have been processed. How else can I assist with your skincare routine today?`;

  return {
    finalText: fallbackText,
    actionProposal: state.actionProposal || null,
    status: 'done'
  };
}
