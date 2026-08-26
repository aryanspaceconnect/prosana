import { Annotation } from '@langchain/langgraph';
import { PassOn, ToolResult, AgentContext, ActionProposal } from '../types.js';
import { LLMFunctionCall } from '../llmRouter.js';

export const AgentStateAnnotation = Annotation.Root({
  userId: Annotation<string>(),
  sessionId: Annotation<string>(),
  message: Annotation<string>(),
  attachments: Annotation<Array<{ id: string; name: string; type: 'image' | 'document'; url: string; mimeType?: string; textContent?: string }>>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => []
  }),
  history: Annotation<Array<{ role: 'user' | 'model'; text: string; attachments?: any[] }>>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => []
  }),
  passOn: Annotation<PassOn | null>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => null
  }),
  passOnTrace: Annotation<PassOn[]>({
    value: (x, y) => (x || []).concat(y || []),
    default: () => []
  }),
  toolResults: Annotation<ToolResult[]>({
    value: (x, y) => (x || []).concat(y || []),
    default: () => []
  }),
  pendingFunctionCalls: Annotation<LLMFunctionCall[]>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => []
  }),
  llmMessages: Annotation<any[]>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => []
  }),
  status: Annotation<string>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => 'thinking'
  }),
  sessionNotepad: Annotation<string>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => ''
  }),
  context: Annotation<AgentContext>({
    value: (x, y) => ({ ...x, ...y }),
    default: () => ({ userId: '', sessionId: '' })
  }),
  finalText: Annotation<string | null>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => null
  }),
  actionProposal: Annotation<ActionProposal | null>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => null
  }),
  iterations: Annotation<number>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => 0
  }),
  onProgress: Annotation<((text: string) => void) | undefined>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => undefined
  }),
  systemPrompt: Annotation<string | undefined>({
    value: (x, y) => (y !== undefined ? y : x),
    default: () => undefined
  })
});

export type AgentState = typeof AgentStateAnnotation.State;

