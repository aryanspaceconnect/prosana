import { GoogleGenAI } from '@google/genai';
import {
  SanaAgentConfig,
  AgentRunParams,
  AgentRunResult,
  PassOn,
  PassOnSchema
} from './types.js';
import { SANA_SOUL, SANA_HARD_CONSTRAINTS, SANA_APP_MAP } from './soul.js';
import { SANA_TOOL_REGISTRY } from './tools.js';
import { runSanaAgentGraph } from './graph/index.js';

export class SanaAgent {
  public config: SanaAgentConfig;
  private ai: GoogleGenAI;

  constructor(customConfig?: Partial<SanaAgentConfig>) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.ai = new GoogleGenAI({ apiKey });

    this.config = {
      soul: SANA_SOUL,
      hardConstraints: SANA_HARD_CONSTRAINTS,
      toolRegistry: SANA_TOOL_REGISTRY,
      memoryPolicy: {
        maxHistoryTurns: 6,
        sessionTimeoutMs: 30 * 60 * 1000
      },
      outputGuardrails: [
        (text: string) => {
          if (/diagnos(e|is)|you have psoriasis|you have eczema/i.test(text) && !/observation|consult|dermatologist/i.test(text)) {
            return { passed: false, reason: 'Contains ungrounded medical diagnosis claim.' };
          }
          return { passed: true };
        },
        (text: string) => {
          if (/(stop taking|discontinue|throw away) (your|prescription)/i.test(text)) {
            return { passed: false, reason: 'Advising cessation of prescription medication.' };
          }
          return { passed: true };
        }
      ],
      model: 'gemini-3.7-flash',
      ...customConfig
    };
  }

  public parsePassOn(rawText: string): PassOn {
    try {
      const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
      const json = JSON.parse(cleaned);
      const parsed = PassOnSchema.safeParse(json);
      if (parsed.success) return parsed.data;
    } catch {
      // Fallback parsing
    }
    return {
      thought: 'Fallback parsing used due to malformed JSON.',
      intent: 'general_chat',
      status: 'ready',
      nextTools: [],
      finalResponse: rawText
    };
  }

  public async run(params: AgentRunParams): Promise<AgentRunResult> {
    return runSanaAgentGraph(params);
  }
}

// Singleton agent instance
export const sanaAgent = new SanaAgent();

export async function runSanaAgent(params: AgentRunParams): Promise<AgentRunResult> {
  return runSanaAgentGraph(params);
}
