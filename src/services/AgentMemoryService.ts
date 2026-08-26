import { db, sanitizeForFirestore } from '../lib/firebase';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore';

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  actionProposal?: any;
  thinkingMeta?: {
    intent?: string;
    complexityScore?: number;
    appliedRules?: string[];
    reasoningSteps?: string[];
  };
}

export interface AgentSessionSummary {
  sessionId: string;
  userId: string;
  lastMessage?: string;
  updatedAt: string;
  messageCount: number;
}

export interface AgentContextRecord {
  key: string;
  data: any;
  category: string;
  updatedAt: string;
}

/**
 * AgentMemoryService
 * 
 * Provides strict user-level data isolation for AI agent memory, context, and chat logs.
 * All data is stored in user-specific sub-collections under `users/{uid}/agent_memory/...`,
 * keeping agent-specific internal working memory entirely isolated from both other users
 * and core application databases.
 */
export class AgentMemoryService {
  /**
   * Get reference to user's isolated agent_memory sub-collection
   */
  private static getUserMemoryRef(userId: string, subPath?: string) {
    if (subPath) {
      return collection(db, 'users', userId, 'agent_memory', subPath, 'records');
    }
    return collection(db, 'users', userId, 'agent_memory');
  }

  /**
   * Save full chat message history for a specific session inside `users/{userId}/agent_memory/chats/sessions/{sessionId}`
   */
  static async saveChatSession(userId: string, sessionId: string, messages: AgentChatMessage[]): Promise<void> {
    if (!userId) return;
    try {
      const sessionDocRef = doc(db, 'users', userId, 'agent_memory', 'chat_sessions', 'list', sessionId);
      const lastMsg = messages.length > 0 ? messages[messages.length - 1].text : '';
      const sanitizedMessages = sanitizeForFirestore(messages);
      
      await setDoc(sessionDocRef, {
        sessionId,
        userId,
        messages: sanitizedMessages,
        lastMessage: (lastMsg || '').substring(0, 150),
        messageCount: messages.length,
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn(`[AgentMemoryService] Failed to save chat session for user ${userId}:`, err);
    }
  }

  /**
   * Subscribe to real-time chat history for a given user and session ID.
   */
  static subscribeChatSession(
    userId: string,
    sessionId: string,
    callback: (messages: AgentChatMessage[]) => void
  ): () => void {
    if (!userId) {
      callback([]);
      return () => {};
    }

    const sessionDocRef = doc(db, 'users', userId, 'agent_memory', 'chat_sessions', 'list', sessionId);
    
    return onSnapshot(
      sessionDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          callback(data.messages || []);
        } else {
          callback([]);
        }
      },
      (err) => {
        console.warn(`[AgentMemoryService] Subscription error for user ${userId}:`, err);
        callback([]);
      }
    );
  }

  /**
   * Append a single chat message to user's isolated agent memory log
   */
  static async appendChatMessage(userId: string, sessionId: string, message: AgentChatMessage): Promise<void> {
    if (!userId) return;
    try {
      const msgColRef = collection(db, 'users', userId, 'agent_memory', 'chat_messages', sessionId);
      const sanitizedMsg = sanitizeForFirestore(message);
      await addDoc(msgColRef, {
        ...sanitizedMsg,
        userId,
        sessionId,
        createdAt: new Date().toISOString(),
        serverTime: serverTimestamp()
      });
    } catch (err) {
      console.warn(`[AgentMemoryService] Error appending message for ${userId}:`, err);
    }
  }

  /**
   * Save key-value contextual memory item (e.g. user preferences, past observations)
   * stored isolated in `users/{userId}/agent_memory/context_items/{key}`
   */
  static async setContextItem(userId: string, key: string, data: any, category: string = 'general'): Promise<void> {
    if (!userId || !key) return;
    try {
      const itemRef = doc(db, 'users', userId, 'agent_memory', 'context_items', 'items', key);
      const sanitizedData = sanitizeForFirestore(data);
      await setDoc(itemRef, {
        key,
        data: sanitizedData,
        category,
        updatedAt: new Date().toISOString(),
        serverTime: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.warn(`[AgentMemoryService] Error setting context item '${key}' for user ${userId}:`, err);
    }
  }

  /**
   * Retrieve a contextual memory item from user's isolated sub-collection
   */
  static async getContextItem<T = any>(userId: string, key: string): Promise<T | null> {
    if (!userId || !key) return null;
    try {
      const itemRef = doc(db, 'users', userId, 'agent_memory', 'context_items', 'items', key);
      const snap = await getDoc(itemRef);
      if (snap.exists()) {
        return snap.data().data as T;
      }
      return null;
    } catch (err) {
      console.warn(`[AgentMemoryService] Error getting context item '${key}' for user ${userId}:`, err);
      return null;
    }
  }

  /**
   * Fetch all context items stored in user's isolated agent memory
   */
  static async getAllContextItems(userId: string): Promise<Record<string, any>> {
    if (!userId) return {};
    try {
      const colRef = collection(db, 'users', userId, 'agent_memory', 'context_items', 'items');
      const snap = await getDocs(colRef);
      const result: Record<string, any> = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.key) {
          result[d.key] = d.data;
        }
      });
      return result;
    } catch (err) {
      console.warn(`[AgentMemoryService] Error getting all context items for user ${userId}:`, err);
      return {};
    }
  }

  /**
   * Clear user's agent memory session history
   */
  static async clearSessionMemory(userId: string, sessionId: string): Promise<void> {
    if (!userId || !sessionId) return;
    try {
      const sessionDocRef = doc(db, 'users', userId, 'agent_memory', 'chat_sessions', 'list', sessionId);
      await deleteDoc(sessionDocRef);
    } catch (err) {
      console.warn(`[AgentMemoryService] Error clearing session memory for ${userId}:`, err);
    }
  }
}
