import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolDefinition, AgentContext } from '../types.js';
import { loadAgentVault, saveAgentVaultNote, saveVaultIncident } from '../agentVault.js';
import { performExaAnswer } from '../exaSearchService.js';
import { executeWebSearch, executeImageSearch } from '../searchService.js';
import { updateSessionNotepad, getSessionNotepad } from '../sessionNotepad.js';

export interface McpServerConfig {
  id: string;
  name: string;
  type: 'builtin' | 'sse' | 'stdio' | 'custom';
  urlOrCommand?: string;
  description: string;
  icon?: string;
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  errorMessage?: string;
  toolCount: number;
  lastPing?: string;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string; // Original tool name in MCP
  fullName: string; // Fully qualified name, e.g., mcp__server_id__tool_name
  description: string;
  inputSchema: any; // Raw JSON schema
}

export interface McpResource {
  serverId: string;
  serverName: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPrompt {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface McpCallLog {
  id: string;
  timestamp: string;
  serverId: string;
  serverName: string;
  toolName: string;
  args: any;
  result: any;
  durationMs: number;
  status: 'success' | 'error';
  error?: string;
}

/**
 * Converts a JSON Schema object into a standard Zod schema for validation and tool invocation.
 */
function jsonSchemaToZod(schema: any): z.ZodSchema<any> {
  if (!schema || typeof schema !== 'object') {
    return z.record(z.string(), z.any());
  }

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, prop] of Object.entries<any>(properties)) {
    let fieldSchema: z.ZodTypeAny;

    if (prop.type === 'string') {
      if (prop.enum && Array.isArray(prop.enum) && prop.enum.length > 0) {
        fieldSchema = z.enum(prop.enum as [string, ...string[]]);
      } else {
        fieldSchema = z.string();
      }
    } else if (prop.type === 'number' || prop.type === 'integer') {
      fieldSchema = z.number();
    } else if (prop.type === 'boolean') {
      fieldSchema = z.boolean();
    } else if (prop.type === 'array') {
      fieldSchema = z.array(z.any());
    } else if (prop.type === 'object') {
      fieldSchema = z.record(z.string(), z.any());
    } else {
      fieldSchema = z.any();
    }

    if (prop.description) {
      fieldSchema = fieldSchema.describe(prop.description);
    }

    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }

    shape[key] = fieldSchema;
  }

  return z.object(shape).passthrough();
}

class McpManagerService {
  private servers: Map<string, McpServerConfig> = new Map();
  private clients: Map<string, Client> = new Map();
  private logs: McpCallLog[] = [];
  private maxLogs = 200;

  constructor() {
    this.initializeBuiltinServers();
  }

  /**
   * Initializes built-in MCP Servers (Vault, Knowledge, Session Notepad, Dermatology Calculator).
   */
  private async initializeBuiltinServers() {
    try {
      // 1. SANA Vault MCP Server
      await this.registerBuiltinVaultServer();
      // 2. SANA Knowledge MCP Server
      await this.registerBuiltinKnowledgeServer();
      // 3. SANA Session Notepad MCP Server
      await this.registerBuiltinNotepadServer();
      // 4. SANA Clinical & Skin Calculator MCP Server
      await this.registerBuiltinDermatologyServer();

      console.log(`[MCP Manager] Initialized built-in MCP servers. Active count: ${this.servers.size}`);
    } catch (err) {
      console.error('[MCP Manager] Error initializing built-in MCP servers:', err);
    }
  }

  /**
   * Built-in MCP Server 1: SANA Vault MCP Server
   */
  private async registerBuiltinVaultServer() {
    const serverId = 'sana_vault';
    const server = new Server(
      { name: 'SANA Vault MCP Server', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_vault',
          description: 'Query SANA Agent Vault long-term clinical memory, patient scan history, and user profile data.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search term or clinical query' },
              category: { type: 'string', description: 'Category filter (profile, scans, incidents, events, settings)' }
            },
            required: ['query']
          }
        },
        {
          name: 'log_incident',
          description: 'Log a skin reaction, breakout, allergy, or flare-up into Vault memory via MCP.',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Incident title' },
              type: { type: 'string', enum: ['reaction', 'breakout', 'flare', 'allergy', 'other'] },
              severity: { type: 'string', enum: ['mild', 'moderate', 'severe'] },
              description: { type: 'string', description: 'Detailed symptoms or notes' }
            },
            required: ['title']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params || {};
      if (name === 'search_vault') {
        const data = await loadAgentVault('guest_user');
        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        };
      }
      if (name === 'log_incident') {
        const res = await saveVaultIncident('guest_user', {
          title: String(args?.title || 'MCP Skin Incident'),
          type: (args?.type as any) || 'flare',
          severity: (args?.severity as any) || 'mild',
          description: args?.description ? String(args.description) : ''
        });
        return {
          content: [{ type: 'text', text: `Incident '${res.title}' successfully recorded in Vault via MCP.` }]
        };
      }
      throw new Error(`Unknown tool: ${name}`);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'mcp://sana_vault/patient_profile',
          name: 'Patient Profile Data',
          description: 'Structured clinical background, fitzpatrick skin type, and barrier history.',
          mimeType: 'application/json'
        },
        {
          uri: 'mcp://sana_vault/recent_scans',
          name: 'Recent Skin Scans',
          description: 'Latest vision AI scan results and pore/pigmentation scores.',
          mimeType: 'application/json'
        }
      ]
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params || {};
      if (uri === 'mcp://sana_vault/patient_profile') {
        const data = await loadAgentVault('guest_user');
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data.identity || {}, null, 2) }]
        };
      }
      if (uri === 'mcp://sana_vault/recent_scans') {
        const data = await loadAgentVault('guest_user');
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data.events || [], null, 2) }]
        };
      }
      throw new Error(`Resource not found: ${uri}`);
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'SANA Agent Client', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    this.clients.set(serverId, client);
    this.servers.set(serverId, {
      id: serverId,
      name: 'SANA Vault MCP Server',
      type: 'builtin',
      description: 'Provides MCP tools for long-term patient vault, incident records, and profile search.',
      icon: 'Database',
      status: 'connected',
      toolCount: 2,
      lastPing: new Date().toISOString()
    });
  }

  /**
   * Built-in MCP Server 2: SANA Knowledge & Research MCP Server
   */
  private async registerBuiltinKnowledgeServer() {
    const serverId = 'sana_knowledge';
    const server = new Server(
      { name: 'SANA Research & Knowledge MCP Server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'exa_answer',
          description: 'Get direct grounded clinical search answers with verified sources via Exa API.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Medical or ingredient research question' }
            },
            required: ['query']
          }
        },
        {
          name: 'web_search',
          description: 'Perform real-time web search for medical journals, FDA guidelines, or formulation specs.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query string' }
            },
            required: ['query']
          }
        },
        {
          name: 'image_search',
          description: 'Search for verified real skincare product images and item URLs on the web.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Product or item search query string' },
              count: { type: 'number', description: 'Number of image URLs to return' }
            },
            required: ['query']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params || {};
      if (name === 'exa_answer') {
        const res = await performExaAnswer({ query: String(args?.query || '') });
        return {
          content: [{ type: 'text', text: `Answer: ${res.answer}\n\nCitations:\n${(res.citations || []).map((c: any) => `- ${c.title || c.url}: ${c.url}`).join('\n')}` }]
        };
      }
      if (name === 'web_search') {
        const res = await executeWebSearch(String(args?.query || ''));
        return {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
        };
      }
      if (name === 'image_search') {
        const res = await executeImageSearch(String(args?.query || ''), Number(args?.count || 4));
        return {
          content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
        };
      }
      throw new Error(`Unknown tool: ${name}`);
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'SANA Agent Client', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    this.clients.set(serverId, client);
    this.servers.set(serverId, {
      id: serverId,
      name: 'SANA Knowledge MCP Server',
      type: 'builtin',
      description: 'Provides clinical research search, Exa grounding, and live web knowledge tools.',
      icon: 'Globe',
      status: 'connected',
      toolCount: 2,
      lastPing: new Date().toISOString()
    });
  }

  /**
   * Built-in MCP Server 3: SANA Session Notepad MCP Server
   */
  private async registerBuiltinNotepadServer() {
    const serverId = 'sana_notepad';
    const server = new Server(
      { name: 'SANA Session Notepad MCP Server', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'read_notepad',
          description: 'Read current active working session scratchpad notes via MCP.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'append_note',
          description: 'Append key clinical observations or active routine modifications to the session scratchpad.',
          inputSchema: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Observation or note content to append' }
            },
            required: ['content']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params || {};
      if (name === 'read_notepad') {
        const content = getSessionNotepad('session_default');
        return {
          content: [{ type: 'text', text: content || 'Notepad is currently empty.' }]
        };
      }
      if (name === 'append_note') {
        const updated = updateSessionNotepad('session_default', String(args?.content || ''), 'append');
        return {
          content: [{ type: 'text', text: `Note appended successfully. Updated notepad content:\n${updated}` }]
        };
      }
      throw new Error(`Unknown tool: ${name}`);
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: 'mcp://sana_notepad/session_notes',
          name: 'Active Session Working Scratchpad',
          description: 'Live in-memory scratchpad maintained by SANA during conversation.',
          mimeType: 'text/plain'
        }
      ]
    }));

    server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      const { uri } = request.params || {};
      if (uri === 'mcp://sana_notepad/session_notes') {
        const text = getSessionNotepad('session_default');
        return {
          contents: [{ uri, mimeType: 'text/plain', text: text || 'No active notes.' }]
        };
      }
      throw new Error(`Resource not found: ${uri}`);
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'SANA Agent Client', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    this.clients.set(serverId, client);
    this.servers.set(serverId, {
      id: serverId,
      name: 'SANA Session Notepad MCP Server',
      type: 'builtin',
      description: 'In-memory working scratchpad and working memory provider for multi-step reasoning.',
      icon: 'FileText',
      status: 'connected',
      toolCount: 2,
      lastPing: new Date().toISOString()
    });
  }

  /**
   * Built-in MCP Server 4: SANA Clinical Dermatology Calculator MCP Server
   */
  private async registerBuiltinDermatologyServer() {
    const serverId = 'sana_dermatology';
    const server = new Server(
      { name: 'SANA Dermatology & Phototype MCP Server', version: '1.0.0' },
      { capabilities: { tools: {}, prompts: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'calculate_fitzpatrick',
          description: 'Determine Fitzpatrick Skin Phototype (I-VI) based on eye color, natural hair color, tanning ability, and sunburn tendency.',
          inputSchema: {
            type: 'object',
            properties: {
              sunburnTendency: { type: 'string', enum: ['always_burns', 'burns_then_tans', 'rarely_burns', 'never_burns'] },
              tanningAbility: { type: 'string', enum: ['never_tans', 'light_tan', 'moderate_tan', 'deep_tan'] },
              eyeColor: { type: 'string', description: 'Eye color (blue, green, hazel, brown, dark_brown)' },
              naturalHairColor: { type: 'string', description: 'Hair color (red, blonde, brown, black)' }
            },
            required: ['sunburnTendency', 'tanningAbility']
          }
        },
        {
          name: 'evaluate_barrier_index',
          description: 'Calculate skin barrier breach risk score (0-100) based on active ingredients, pH levels, exfoliation frequency, and redness.',
          inputSchema: {
            type: 'object',
            properties: {
              activeIngredients: { type: 'array', items: { type: 'string' }, description: 'Active ingredients in daily routine (e.g., Tretinoin, AHA, BHA, Vitamin C)' },
              exfoliationTimesPerWeek: { type: 'number', description: 'Number of chemical or physical exfoliations per week' },
              stingingOrRedness: { type: 'boolean', description: 'Whether skin stings upon applying gentle cleanser or moisturizer' }
            },
            required: ['activeIngredients']
          }
        }
      ]
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params || {};
      if (name === 'calculate_fitzpatrick') {
        const burn = String(args?.sunburnTendency || 'burns_then_tans');
        let type = 'III';
        let description = 'Medium skin, burns moderately, tans gradually to light brown. Moderate PIH risk.';

        if (burn === 'always_burns') {
          type = 'I/II';
          description = 'Fair skin, always burns easily, rarely/never tans. Very high UV sensitivity and erythema risk.';
        } else if (burn === 'never_burns') {
          type = 'V/VI';
          description = 'Deeply pigmented skin, never burns, tans profusely. Very high Post-Inflammatory Hyperpigmentation (PIH) risk; low UV burning risk.';
        } else if (burn === 'rarely_burns') {
          type = 'IV';
          description = 'Olive/brown skin, burns minimally, tans easily to dark brown.';
        }

        return {
          content: [{ type: 'text', text: `Fitzpatrick Classification: Type ${type}\nClinical Summary: ${description}` }]
        };
      }

      if (name === 'evaluate_barrier_index') {
        const actives = Array.isArray(args?.activeIngredients) ? args.activeIngredients.map(String) : [];
        const exfoliations = Number(args?.exfoliationTimesPerWeek || 0);
        const stings = Boolean(args?.stingingOrRedness);

        let riskScore = 15; // Baseline
        if (actives.some(a => /retin|tretinoin|adapalene|tazarotene/i.test(a))) riskScore += 25;
        if (actives.some(a => /glycolic|salicylic|lactic|aha|bha/i.test(a))) riskScore += 20;
        if (actives.some(a => /vitamin c|ascorbic/i.test(a))) riskScore += 10;
        if (exfoliations > 3) riskScore += (exfoliations - 3) * 10;
        if (stings) riskScore += 30;

        riskScore = Math.min(100, Math.max(0, riskScore));
        const status = riskScore >= 60 ? 'HIGH RISK (Barrier Compromised)' : (riskScore >= 35 ? 'MODERATE RISK (Mild Sensitivity)' : 'HEALTHY (Resilient Barrier)');

        return {
          content: [{ type: 'text', text: `Barrier Damage Index: ${riskScore}/100 [${status}]\nKey Factors Evaluated: ${actives.join(', ') || 'None'}; Exfoliations/wk: ${exfoliations}; Stinging: ${stings ? 'Yes' : 'No'}` }]
        };
      }

      throw new Error(`Unknown tool: ${name}`);
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: 'barrier_recovery_protocol',
          description: 'Generates an emergency 7-day skin barrier restoration protocol for compromised skin.',
          arguments: [
            { name: 'symptoms', description: 'Current irritation symptoms (e.g. burning, flaking, redness)', required: true },
            { name: 'trigger_product', description: 'Product or ingredient suspected of causing the flare-up', required: false }
          ]
        }
      ]
    }));

    server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params || {};
      if (name === 'barrier_recovery_protocol') {
        const symptoms = args?.symptoms || 'general burning and tightness';
        const trigger = args?.trigger_product ? `suspected trigger: ${args.trigger_product}` : 'unknown trigger';
        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: `Patient presents with acute barrier breakdown (${symptoms}; ${trigger}). Provide a strict 7-day active-free restoration routine emphasizing lipid replenishment (ceramides, cholesterol, fatty acids) and zero exfoliation.`
              }
            }
          ]
        };
      }
      throw new Error(`Prompt not found: ${name}`);
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'SANA Agent Client', version: '1.0.0' }, { capabilities: {} });

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    this.clients.set(serverId, client);
    this.servers.set(serverId, {
      id: serverId,
      name: 'SANA Dermatology MCP Server',
      type: 'builtin',
      description: 'Provides Fitzpatrick phototype scoring, barrier health index calculation, and clinical prompts.',
      icon: 'Activity',
      status: 'connected',
      toolCount: 2,
      lastPing: new Date().toISOString()
    });
  }

  /**
   * Connect an external MCP Server via SSE endpoint.
   */
  public async connectSseServer(id: string, name: string, url: string, description: string = 'Remote SSE MCP Server'): Promise<McpServerConfig> {
    try {
      this.servers.set(id, {
        id,
        name,
        type: 'sse',
        urlOrCommand: url,
        description,
        icon: 'Server',
        status: 'connecting',
        toolCount: 0
      });

      const transport = new SSEClientTransport(new URL(url));
      const client = new Client({ name: 'SANA Agent Client', version: '1.0.0' }, { capabilities: {} });

      await client.connect(transport);
      this.clients.set(id, client);

      const toolsResult = await client.listTools();
      const toolCount = toolsResult.tools ? toolsResult.tools.length : 0;

      const serverConfig: McpServerConfig = {
        id,
        name,
        type: 'sse',
        urlOrCommand: url,
        description,
        icon: 'Server',
        status: 'connected',
        toolCount,
        lastPing: new Date().toISOString()
      };

      this.servers.set(id, serverConfig);
      console.log(`[MCP Manager] Connected external SSE MCP server '${name}' (${id}) with ${toolCount} tool(s)`);
      return serverConfig;
    } catch (err: any) {
      console.error(`[MCP Manager] Failed to connect SSE MCP server '${name}' (${id}):`, err);
      const serverConfig: McpServerConfig = {
        id,
        name,
        type: 'sse',
        urlOrCommand: url,
        description,
        icon: 'Server',
        status: 'error',
        errorMessage: err?.message || String(err),
        toolCount: 0
      };
      this.servers.set(id, serverConfig);
      return serverConfig;
    }
  }

  /**
   * Remove/disconnect an MCP server.
   */
  public async disconnectServer(id: string): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server) return false;

    if (server.type === 'builtin') {
      throw new Error('Cannot disconnect built-in core SANA MCP servers.');
    }

    const client = this.clients.get(id);
    if (client) {
      try {
        await client.close();
      } catch (err) {
        console.warn(`[MCP Manager] Error closing client for server ${id}:`, err);
      }
      this.clients.delete(id);
    }

    this.servers.delete(id);
    return true;
  }

  /**
   * List all configured MCP servers.
   */
  public getServers(): McpServerConfig[] {
    return Array.from(this.servers.values());
  }

  /**
   * Discover and retrieve all tools across all active connected MCP servers.
   */
  public async getAllMcpTools(): Promise<McpTool[]> {
    const allTools: McpTool[] = [];

    for (const [serverId, client] of this.clients.entries()) {
      const serverConfig = this.servers.get(serverId);
      if (!serverConfig || serverConfig.status !== 'connected') continue;

      try {
        const toolsResult = await client.listTools();
        if (toolsResult && toolsResult.tools) {
          for (const t of toolsResult.tools) {
            allTools.push({
              serverId,
              serverName: serverConfig.name,
              name: t.name,
              fullName: `mcp__${serverId}__${t.name}`,
              description: t.description || `MCP Tool '${t.name}' provided by ${serverConfig.name}`,
              inputSchema: t.inputSchema
            });
          }
        }
      } catch (err) {
        console.warn(`[MCP Manager] Error fetching tools from MCP server '${serverId}':`, err);
      }
    }

    return allTools;
  }

  /**
   * Call a tool on an MCP server and record execution log trace.
   */
  public async callTool(fullNameOrServerId: string, toolName?: string, args: any = {}): Promise<any> {
    let serverId = '';
    let actualToolName = '';

    if (fullNameOrServerId.startsWith('mcp__')) {
      const parts = fullNameOrServerId.split('__');
      if (parts.length >= 3) {
        serverId = parts[1];
        actualToolName = parts.slice(2).join('__');
      }
    } else if (toolName) {
      serverId = fullNameOrServerId;
      actualToolName = toolName;
    }

    if (!serverId || !actualToolName) {
      throw new Error(`Invalid MCP tool target specification: ${fullNameOrServerId} / ${toolName}`);
    }

    const client = this.clients.get(serverId);
    const serverConfig = this.servers.get(serverId);

    if (!client || !serverConfig) {
      throw new Error(`MCP Server '${serverId}' is not connected or active.`);
    }

    const startTime = Date.now();
    const logId = `mcp_log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const result = await client.callTool({
        name: actualToolName,
        arguments: args
      });

      const durationMs = Date.now() - startTime;

      let extractedResultText = '';
      if (result && Array.isArray(result.content)) {
        extractedResultText = result.content
          .map((c: any) => (c.type === 'text' ? c.text : JSON.stringify(c)))
          .join('\n');
      } else {
        extractedResultText = JSON.stringify(result);
      }

      const logEntry: McpCallLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        serverId,
        serverName: serverConfig.name,
        toolName: actualToolName,
        args,
        result: extractedResultText,
        durationMs,
        status: 'success'
      };

      this.addLog(logEntry);
      console.log(`[MCP Tool Execution] Executed '${actualToolName}' on '${serverConfig.name}' in ${durationMs}ms`);

      return {
        success: true,
        serverId,
        serverName: serverConfig.name,
        toolName: actualToolName,
        result: extractedResultText,
        durationMs
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const errMsg = err?.message || String(err);

      const logEntry: McpCallLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        serverId,
        serverName: serverConfig.name,
        toolName: actualToolName,
        args,
        result: null,
        durationMs,
        status: 'error',
        error: errMsg
      };

      this.addLog(logEntry);
      console.error(`[MCP Tool Execution Error] Failed tool '${actualToolName}' on '${serverConfig.name}':`, errMsg);

      throw err;
    }
  }

  /**
   * Convert MCP Tools into native SANA `ToolDefinition`s for seamless execution by SANA LangGraph & LLM Router!
   */
  public async getMcpToolDefinitions(): Promise<ToolDefinition[]> {
    const mcpTools = await this.getAllMcpTools();
    const definitions: ToolDefinition[] = [];

    for (const mcpTool of mcpTools) {
      const zodSchema = jsonSchemaToZod(mcpTool.inputSchema);

      definitions.push({
        name: mcpTool.fullName,
        description: `[MCP :: ${mcpTool.serverName}] ${mcpTool.description}`,
        parameters: zodSchema,
        execute: async (args: any, _context: AgentContext) => {
          return await this.callTool(mcpTool.fullName, undefined, args);
        }
      });
    }

    return definitions;
  }

  /**
   * List available resources across active MCP servers.
   */
  public async getResources(): Promise<McpResource[]> {
    const resources: McpResource[] = [];

    for (const [serverId, client] of this.clients.entries()) {
      const serverConfig = this.servers.get(serverId);
      if (!serverConfig || serverConfig.status !== 'connected') continue;

      try {
        const resResult = await client.listResources();
        if (resResult && resResult.resources) {
          for (const r of resResult.resources) {
            resources.push({
              serverId,
              serverName: serverConfig.name,
              uri: r.uri,
              name: r.name,
              description: r.description,
              mimeType: r.mimeType
            });
          }
        }
      } catch (err) {
        // Server might not support resources
      }
    }

    return resources;
  }

  /**
   * Read an MCP resource content by URI.
   */
  public async readResource(serverId: string, uri: string): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server '${serverId}' is not connected.`);

    const res = await client.readResource({ uri });
    return res;
  }

  /**
   * List available prompt templates across active MCP servers.
   */
  public async getPrompts(): Promise<McpPrompt[]> {
    const prompts: McpPrompt[] = [];

    for (const [serverId, client] of this.clients.entries()) {
      const serverConfig = this.servers.get(serverId);
      if (!serverConfig || serverConfig.status !== 'connected') continue;

      try {
        const promptsResult = await client.listPrompts();
        if (promptsResult && promptsResult.prompts) {
          for (const p of promptsResult.prompts) {
            prompts.push({
              serverId,
              serverName: serverConfig.name,
              name: p.name,
              description: p.description,
              arguments: p.arguments
            });
          }
        }
      } catch (err) {
        // Server might not support prompts
      }
    }

    return prompts;
  }

  /**
   * Get an expanded MCP prompt template.
   */
  public async getPrompt(serverId: string, promptName: string, args: Record<string, string> = {}): Promise<any> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server '${serverId}' is not connected.`);

    const res = await client.getPrompt({ name: promptName, arguments: args });
    return res;
  }

  /**
   * Get recorded MCP execution logs.
   */
  public getLogs(): McpCallLog[] {
    return [...this.logs];
  }

  private addLog(log: McpCallLog) {
    this.logs.unshift(log);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
  }
}

export const mcpManager = new McpManagerService();
