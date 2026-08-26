import { z } from 'zod';

export type PassOnStatus = 'need_info' | 'ready' | 'need_approval' | 'failed';
export type RiskLevel = 'low' | 'medium';

export const MemoryNeedsSchema = z.object({
  profile: z.boolean().optional().nullable(),
  latestScan: z.boolean().optional().nullable(),
  incidentsDays: z.union([z.number(), z.string()]).transform(v => typeof v === 'string' ? parseInt(v, 10) || 7 : v).optional().nullable(),
  settingHistory: z.union([z.array(z.string()), z.string()]).transform(v => typeof v === 'string' ? [v] : v).optional().nullable(),
  episodicQuery: z.union([z.string(), z.record(z.string(), z.any()), z.array(z.any()), z.boolean(), z.number()]).transform(v => typeof v === 'string' ? v : JSON.stringify(v)).optional().nullable(),
  appMap: z.boolean().optional().nullable(),
  vault: z.boolean().optional().nullable(),
}).passthrough();

export type MemoryNeeds = z.infer<typeof MemoryNeedsSchema>;

export const NextToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.string(), z.any()).optional().default({}),
  optional: z.boolean().optional().nullable(),
}).passthrough();

export type NextToolCall = z.infer<typeof NextToolCallSchema>;

export const ActionProposalSchema = z.object({
  actionId: z.string(),
  title: z.string(),
  description: z.string(),
  actionType: z.string(),
  payload: z.record(z.string(), z.any()),
  riskLevel: z.enum(['low', 'medium']).catch('low'),
  status: z.enum(['pending', 'approved', 'denied']).optional(),
  executed: z.boolean().optional(),
  executedMessage: z.string().optional(),
}).passthrough();

export type ActionProposal = z.infer<typeof ActionProposalSchema>;

export const PassOnSchema = z.object({
  thought: z.string().optional().default('Processing...'),
  intent: z.string().optional().default('GENERAL'),
  status: z.enum(['need_info', 'ready', 'need_approval', 'failed']).catch('ready'),
  nextTools: z.array(NextToolCallSchema).optional().nullable(),
  memoryNeeds: MemoryNeedsSchema.optional().nullable(),
  finalResponse: z.string().optional().nullable(),
  actionProposal: ActionProposalSchema.optional().nullable(),
  errorSummary: z.string().optional().nullable(),
}).passthrough();

export type PassOn = z.infer<typeof PassOnSchema>;

export interface StateEvent {
  id: string;
  userId: string;
  timestamp: string;
  actionType: string;
  target: string;
  previousValue: any;
  newValue: any;
  source: string;
  proposalId: string;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  data?: any;
  error?: string;
  retried?: boolean;
}

export interface UniversalQuery {
  type: 'scans' | 'incidents' | 'events' | 'settings_history' | 'profile' | 'insights' | 'app_help';
  query?: string;
  daysLimit?: number;
  settingKey?: string;
}

export interface AgentContext {
  userId: string;
  sessionId: string;
  profile?: any;
  latestScan?: any;
  incidents?: any[];
  events?: any[];
  settingsHistory?: Record<string, any[]>;
  episodicData?: any[];
  appMap?: Record<string, any>;
  agentVault?: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
  execute: (args: any, context: AgentContext) => Promise<any>;
}

export interface Session {
  sessionId: string;
  userId: string;
  lastActive: number;
  turnCount: number;
  passOnTrace: PassOn[];
}

export interface SanaAgentConfig {
  soul: string;
  hardConstraints: string[];
  toolRegistry: ToolDefinition[];
  memoryPolicy: {
    maxHistoryTurns: number;
    sessionTimeoutMs: number;
  };
  outputGuardrails: Array<(text: string) => { passed: boolean; reason?: string }>;
  model: string;
}

export interface AgentRunParams {
  userId: string;
  message: string;
  sessionId?: string;
  systemPrompt?: string;
  attachments?: Array<{ id: string; name: string; type: 'image' | 'document'; url: string; mimeType?: string; textContent?: string }>;
  history?: Array<{ role: 'user' | 'model'; text: string; attachments?: any[] }>;
  onProgress?: (interimText: string) => void;
}

export interface AgentRunResult {
  text: string;
  actionProposal?: ActionProposal;
  sessionId: string;
  passOnTrace: PassOn[];
  iterations: number;
  toolResults?: ToolResult[];
}
