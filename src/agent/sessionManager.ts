/**
 * Session Lifecycle & Prompt Caching Manager
 * 
 * Manages active chat session state, 10-minute inactivity expiration, and prompt caching
 * persistence across multi-turn interactions.
 */

export interface ActiveSessionState {
  sessionId: string;
  userId: string;
  lastActivityTimestamp: number; // epoch ms
  isFinished: boolean;
  cachedFolderIndex?: string;
  cachedSystemInstruction?: string;
  cachedAt?: number;
}

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 Minutes of agent & user inactivity

const activeSessions: Record<string, ActiveSessionState> = {};

/**
 * Updates or creates active session state with fresh timestamp.
 * Resets inactivity timer whenever user or agent interacts.
 */
export function touchSession(sessionId: string, userId: string): ActiveSessionState {
  const now = Date.now();
  const safeSessionId = sessionId || 'session_default';
  const safeUserId = userId || 'guest_user';

  if (!activeSessions[safeSessionId]) {
    activeSessions[safeSessionId] = {
      sessionId: safeSessionId,
      userId: safeUserId,
      lastActivityTimestamp: now,
      isFinished: false
    };
  } else {
    activeSessions[safeSessionId].lastActivityTimestamp = now;
    activeSessions[safeSessionId].isFinished = false;
  }

  return activeSessions[safeSessionId];
}

/**
 * Checks if a session is currently active.
 * Returns false if > 10 minutes of complete inactivity or explicitly finished.
 */
export function isSessionActive(sessionId: string): boolean {
  const safeSessionId = sessionId || 'session_default';
  const session = activeSessions[safeSessionId];
  if (!session) return false;
  if (session.isFinished) return false;

  const now = Date.now();
  const inactiveDuration = now - session.lastActivityTimestamp;

  if (inactiveDuration > INACTIVITY_TIMEOUT_MS) {
    session.isFinished = true; // Expire session due to 10 min inactivity
    return false;
  }

  return true;
}

/**
 * Explicitly marks a session as finished.
 */
export function finishSession(sessionId: string): void {
  const safeSessionId = sessionId || 'session_default';
  if (activeSessions[safeSessionId]) {
    activeSessions[safeSessionId].isFinished = true;
  }
}

/**
 * Stores cached prompt data (e.g. folder index, system instructions) for an active session.
 */
export function setSessionPromptCache(
  sessionId: string,
  cache: { folderIndex: string; systemInstruction: string }
): void {
  const safeSessionId = sessionId || 'session_default';
  if (activeSessions[safeSessionId]) {
    activeSessions[safeSessionId].cachedFolderIndex = cache.folderIndex;
    activeSessions[safeSessionId].cachedSystemInstruction = cache.systemInstruction;
    activeSessions[safeSessionId].cachedAt = Date.now();
  }
}

/**
 * Gets cached prompt data if session is active.
 */
export function getSessionPromptCache(sessionId: string): { folderIndex?: string; systemInstruction?: string } | null {
  const safeSessionId = sessionId || 'session_default';
  if (!isSessionActive(safeSessionId)) return null;

  const session = activeSessions[safeSessionId];
  if (session?.cachedFolderIndex && session?.cachedSystemInstruction) {
    return {
      folderIndex: session.cachedFolderIndex,
      systemInstruction: session.cachedSystemInstruction
    };
  }
  return null;
}

/**
 * Automatically purges expired sessions inactive for > 30 minutes to prevent memory leaks.
 */
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  const PURGE_TIMEOUT_MS = 30 * 60 * 1000;
  let purgedCount = 0;

  for (const sessionId of Object.keys(activeSessions)) {
    const session = activeSessions[sessionId];
    if (session && (now - session.lastActivityTimestamp > PURGE_TIMEOUT_MS || session.isFinished)) {
      delete activeSessions[sessionId];
      purgedCount++;
    }
  }

  return purgedCount;
}

// Run cleanup sweep every 15 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    cleanupExpiredSessions();
  }, 15 * 60 * 1000);
}
