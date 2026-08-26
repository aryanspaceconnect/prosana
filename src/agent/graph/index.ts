import { sanaGraph } from './graph.js';
import { AgentRunParams, AgentRunResult, PassOn } from '../types.js';
import { AgentMemoryService, AgentChatMessage } from '../../services/AgentMemoryService.js';
import { AgentCheckpointService } from '../services/AgentCheckpointService.js';
import { AgentState } from './state.js';

export async function runSanaAgentGraph(params: AgentRunParams): Promise<AgentRunResult> {
  const sessionId = params.sessionId || `session_${Date.now()}`;

  const baseState: AgentState = {
    userId: params.userId,
    sessionId,
    message: params.message,
    attachments: params.attachments || [],
    history: params.history || [],
    passOn: null,
    passOnTrace: [],
    toolResults: [],
    pendingFunctionCalls: [],
    llmMessages: [],
    status: 'thinking',
    sessionNotepad: '',
    context: { userId: params.userId, sessionId },
    finalText: null,
    actionProposal: null,
    iterations: 0,
    onProgress: params.onProgress,
    systemPrompt: params.systemPrompt
  };

  // Restore prior state checkpoint if session was interrupted or retried mid-turn
  const initialState = AgentCheckpointService.restoreStateFromCheckpoint(baseState);

  const config = { configurable: { thread_id: sessionId } };

  let finalState: AgentState = initialState;

  try {
    // Stream state updates through the LangGraph StateGraph
    const eventStream = await sanaGraph.stream(initialState, { ...config, streamMode: 'values' });

    for await (const chunk of eventStream) {
      const stateChunk = chunk as unknown as AgentState;
      finalState = stateChunk;

      if (params.onProgress && stateChunk.finalText) {
        params.onProgress(stateChunk.finalText);
      }
    }
  } catch (err: any) {
    console.warn('[LangGraph] Stream error, falling back to graph invoke:', err?.message || err);
    try {
      finalState = (await sanaGraph.invoke(initialState, config)) as AgentState;
    } catch (invokeErr: any) {
      console.error('[LangGraph] Invoke error across all models:', invokeErr?.message || invokeErr);
      finalState = {
        ...initialState,
        finalText: "I am SANA, your skin health agent. I am currently operating in high-demand safeguard mode. For skin barrier safety: 1. Keep active ingredients separated (e.g. retinoids at night, Vitamin C in AM). 2. Apply broad-spectrum SPF 50 daily. 3. Use ceramide-rich moisturizers if experiencing irritation.",
        passOnTrace: [
          {
            thought: `Safeguard triggered: ${invokeErr?.message || 'LLM model quota limit'}`,
            intent: 'clinical_synthesis',
            status: 'ready'
          }
        ]
      };
    }
  }

  const finalOutputText = finalState.finalText || "I am SANA, your skin health agent. How can I assist with your routine today?";

  // Save session chat log to Application Database (AgentMemoryService)
  try {
    const chatMessages: AgentChatMessage[] = (params.history || []).map((h, i) => ({
      id: `msg_${i}_${Date.now()}`,
      role: h.role === 'model' ? 'model' : 'user',
      text: h.text,
      timestamp: new Date().toISOString()
    }));

    // Add current user message and model response
    chatMessages.push({
      id: `msg_user_${Date.now()}`,
      role: 'user',
      text: params.message,
      timestamp: new Date().toISOString()
    });

    chatMessages.push({
      id: `msg_model_${Date.now()}`,
      role: 'model',
      text: finalOutputText,
      timestamp: new Date().toISOString(),
      actionProposal: finalState.actionProposal || undefined
    });

    await AgentMemoryService.saveChatSession(params.userId, sessionId, chatMessages);
    // Clear checkpoint upon successful completion of the turn
    AgentCheckpointService.clearCheckpoint(sessionId);
  } catch (err) {
    console.warn('[LangGraph] Error saving chat session to Application Database:', err);
  }

  return {
    text: finalOutputText,
    actionProposal: finalState.actionProposal || undefined,
    sessionId,
    passOnTrace: finalState.passOnTrace || [],
    iterations: finalState.iterations || 1,
    toolResults: finalState.toolResults || []
  };
}
