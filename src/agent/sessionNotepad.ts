import { db, sanitizeForFirestore } from '../lib/firebase.js';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Session-Isolated Notepad Storage Engine
 * 
 * Strictly isolated per sessionId. Content stored here is private to the specific session
 * and is NOT accessible by the agent in other sessions.
 */

const sessionNotepads: Record<string, string> = {};

export function getSessionNotepadSync(sessionId: string): string {
  const safeSessionId = sessionId || 'session_default';
  return sessionNotepads[safeSessionId] || '';
}

export async function getSessionNotepad(sessionId: string, userId?: string): Promise<string> {
  const safeSessionId = sessionId || 'session_default';
  if (sessionNotepads[safeSessionId] !== undefined) {
    return sessionNotepads[safeSessionId];
  }

  const safeUid = userId || 'guest_user';
  try {
    if (db) {
      const docRef = doc(db, 'users', safeUid, 'agent_sessions', safeSessionId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const text = snap.data()?.sessionNotepad || '';
        sessionNotepads[safeSessionId] = text;
        return text;
      }
    }
  } catch (err) {
    console.warn(`[SessionNotepad] Firestore read warning for session ${safeSessionId}:`, err);
  }

  return sessionNotepads[safeSessionId] || '';
}

export async function updateSessionNotepad(
  sessionId: string,
  content: string,
  mode: 'append' | 'replace' = 'replace',
  userId?: string
): Promise<string> {
  const safeSessionId = sessionId || 'session_default';
  const safeUid = userId || 'guest_user';

  let current = sessionNotepads[safeSessionId];
  if (current === undefined) {
    current = await getSessionNotepad(safeSessionId, safeUid);
  }

  let newContent = '';
  if (mode === 'append' && current && current.trim().length > 0) {
    newContent = `${current}\n${content}`.trim();
  } else {
    newContent = content.trim();
  }

  sessionNotepads[safeSessionId] = newContent;

  try {
    if (db) {
      const docRef = doc(db, 'users', safeUid, 'agent_sessions', safeSessionId);
      await setDoc(docRef, sanitizeForFirestore({
        sessionNotepad: newContent,
        updatedAt: new Date().toISOString()
      }), { merge: true });
    }
  } catch (err) {
    console.warn(`[SessionNotepad] Firestore write warning for session ${safeSessionId}:`, err);
  }

  return newContent;
}

