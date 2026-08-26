import { AgentState } from '../graph/state.js';
import { ToolResult, PassOn } from '../types.js';

export interface AgentCheckpoint {
  sessionId: string;
  userId: string;
  stepIndex: number;
  status: string;
  toolResults: ToolResult[];
  passOnTrace: PassOn[];
  sessionNotepad: string;
  llmMessages: any[];
  savedAt: number;
  lastError?: string;
}

/**
 * AgentCheckpointService
 * 
 * Provides atomic, resilient checkpointing for LangGraph agent executions.
 * If an intermediate LLM call, tool execution, or network connection fails mid-operation,
 * the agent resumes directly from the last valid checkpoint without repeating completed
 * tool calls or restarting from iteration 0.
 */
export class AgentCheckpointService {
  private static inMemoryCheckpoints: Map<string, AgentCheckpoint> = new Map();
  private static MAX_CHECKPOINT_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours retention

  /**
   * Save a snapshot of the current agent execution state
   */
  public static saveCheckpoint(state: AgentState, stepIndex: number, lastError?: string): void {
    if (!state.sessionId) return;

    const checkpoint: AgentCheckpoint = {
      sessionId: state.sessionId,
      userId: state.userId || 'guest_user',
      stepIndex,
      status: state.status || 'thinking',
      toolResults: Array.isArray(state.toolResults) ? [...state.toolResults] : [],
      passOnTrace: Array.isArray(state.passOnTrace) ? [...state.passOnTrace] : [],
      sessionNotepad: state.sessionNotepad || '',
      llmMessages: Array.isArray(state.llmMessages) ? [...state.llmMessages] : [],
      savedAt: Date.now(),
      lastError
    };

    this.inMemoryCheckpoints.set(state.sessionId, checkpoint);

    // Clean up stale checkpoints periodically
    this.pruneStaleCheckpoints();
  }

  /**
   * Retrieve the latest checkpoint for a session if available and valid
   */
  public static getLatestCheckpoint(sessionId: string): AgentCheckpoint | null {
    if (!sessionId) return null;
    const cp = this.inMemoryCheckpoints.get(sessionId);
    if (!cp) return null;

    if (Date.now() - cp.savedAt > this.MAX_CHECKPOINT_AGE_MS) {
      this.inMemoryCheckpoints.delete(sessionId);
      return null;
    }

    return cp;
  }

  /**
   * Merge a checkpoint into a fresh or resumed AgentState
   */
  public static restoreStateFromCheckpoint(initialState: AgentState): AgentState {
    const cp = this.getLatestCheckpoint(initialState.sessionId);
    if (!cp || (cp.toolResults.length === 0 && cp.passOnTrace.length === 0 && cp.llmMessages.length === 0)) {
      return initialState;
    }

    console.log(`[CheckpointService] Restoring session '${initialState.sessionId}' from step ${cp.stepIndex} with ${cp.toolResults.length} tool result(s)...`);

    // Merge existing tool results and conversation parts without duplication
    const mergedToolResults = [...(initialState.toolResults || [])];
    for (const tr of cp.toolResults) {
      if (!mergedToolResults.some(r => r.toolName === tr.toolName && JSON.stringify(r.data) === JSON.stringify(tr.data))) {
        mergedToolResults.push(tr);
      }
    }

    const mergedPassOnTrace = [...(initialState.passOnTrace || [])];
    for (const pt of cp.passOnTrace) {
      if (!mergedPassOnTrace.some(p => p.thought === pt.thought && p.intent === pt.intent)) {
        mergedPassOnTrace.push(pt);
      }
    }

    return {
      ...initialState,
      toolResults: mergedToolResults,
      passOnTrace: mergedPassOnTrace,
      sessionNotepad: cp.sessionNotepad || initialState.sessionNotepad || '',
      llmMessages: cp.llmMessages.length > 0 ? cp.llmMessages : initialState.llmMessages,
      iterations: Math.max(initialState.iterations || 0, cp.stepIndex)
    };
  }

  /**
   * Remove a checkpoint when the turn successfully completes
   */
  public static clearCheckpoint(sessionId: string): void {
    if (sessionId) {
      this.inMemoryCheckpoints.delete(sessionId);
    }
  }

  private static pruneStaleCheckpoints(): void {
    const now = Date.now();
    for (const [sid, cp] of this.inMemoryCheckpoints.entries()) {
      if (now - cp.savedAt > this.MAX_CHECKPOINT_AGE_MS) {
        this.inMemoryCheckpoints.delete(sid);
      }
    }
  }
}
