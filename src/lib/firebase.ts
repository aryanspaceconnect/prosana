import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut, 
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  User 
} from "firebase/auth";
import { 
  getFirestore,
  initializeFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  updateDoc,
  getDocs,
  deleteDoc
} from "firebase/firestore";
import firebaseConfigData from "../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
};

// Initialize App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth with resilient persistence fallback
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(() => {
  setPersistence(auth, browserSessionPersistence).catch(() => {
    setPersistence(auth, inMemoryPersistence).catch((err) => console.warn("[Firebase Auth] Persistence fallback warning:", err));
  });
});
export const googleProvider = new GoogleAuthProvider();

// Utility to recursively remove undefined values which Firestore rejects
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as any;
  }
  // Preserve Firestore FieldValues (e.g., serverTimestamp)
  if (obj && typeof obj === 'object' && ('_methodName' in obj || (obj as any).constructor?.name === 'FieldValue')) {
    return obj;
  }
  const clean: Record<string, any> = {};
  for (const key of Object.keys(obj as Record<string, any>)) {
    const value = (obj as Record<string, any>)[key];
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

// Initialize Firestore with explicit named database ID
const databaseId = firebaseConfigData.firestoreDatabaseId || "ai-studio-sana-e13933ed-b4aa-407d-b645-bea9ad388315";
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true
    }, databaseId);
  } catch (e) {
    return getFirestore(app, databaseId);
  }
})();

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Google sign in error:", error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Email sign in error:", error);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, pass: string, name?: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Email sign up error:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

// Get User Profile from Firestore
export const getUserProfileFromFirestore = async (uid: string) => {
  if (!uid) return null;

  // Check LocalStorage cache first
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem(`sana_profile_${uid}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Serve cached if fresh or quota reached
        return parsed;
      }
    } catch {}
  }

  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const profile = snap.data();
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(`sana_profile_${uid}`, JSON.stringify(profile));
        } catch {}
      }
      return profile;
    }
  } catch (err: any) {
    const isQuota = /quota/i.test(err?.message || String(err));
    if (!isQuota) {
      console.warn("getUserProfileFromFirestore error:", err?.message || err);
    }
  }

  // Fallback to cached profile if available
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem(`sana_profile_${uid}`);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  return null;
};

// User Profile Sync
export const syncUserProfile = async (
  user: User | { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null },
  customSettings?: Record<string, any>,
  additionalTopLevelData?: Record<string, any>
) => {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    const sanitizedSettings = customSettings ? sanitizeForFirestore(customSettings) : {};
    const sanitizedTopLevel = additionalTopLevelData ? sanitizeForFirestore(additionalTopLevelData) : {};

    if (!snap.exists()) {
      await setDoc(userRef, sanitizeForFirestore({
        displayName: customSettings?.preferredName || user.displayName || "SANA User",
        email: user.email || "guest@sana.app",
        photoURL: user.photoURL || "",
        preferredName: customSettings?.preferredName || user.displayName || "",
        locationName: customSettings?.locationName || "",
        latitude: customSettings?.latitude ?? null,
        longitude: customSettings?.longitude ?? null,
        userPerceptionText: customSettings?.userPerceptionText || "",
        hormonalFactors: customSettings?.hormonalFactors || "",
        skincareGoals: customSettings?.skincareGoals || "",
        skinPriorities: customSettings?.skinPriorities || "",
        upcomingEvent: customSettings?.upcomingEvent || "",
        height: customSettings?.height || "",
        gender: customSettings?.gender || "",
        ...sanitizedTopLevel,
        settings: {
          temperatureUnit: "C",
          scanNotificationTime: "00:00",
          scanReminderEnabled: true,
          theme: "light",
          onboardingCompleted: false,
          ...sanitizedSettings
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    } else {
      const existingData = snap.data();
      const existingSettings = existingData.settings || {};
      const mergedSettings = {
        ...existingSettings,
        ...sanitizedSettings
      };

      const payloadToUpdate: Record<string, any> = sanitizeForFirestore({
        settings: mergedSettings,
        updatedAt: serverTimestamp(),
        ...sanitizedTopLevel
      });

      // Explicitly mirror user-provided fields at top-level of userProfile doc in Firestore
      if (customSettings?.preferredName) {
        payloadToUpdate.displayName = customSettings.preferredName;
        payloadToUpdate.preferredName = customSettings.preferredName;
      }
      if (customSettings?.locationName !== undefined) payloadToUpdate.locationName = customSettings.locationName;
      if (customSettings?.latitude !== undefined) payloadToUpdate.latitude = customSettings.latitude;
      if (customSettings?.longitude !== undefined) payloadToUpdate.longitude = customSettings.longitude;
      if (customSettings?.userPerceptionText !== undefined) payloadToUpdate.userPerceptionText = customSettings.userPerceptionText;
      if (customSettings?.hormonalFactors !== undefined) payloadToUpdate.hormonalFactors = customSettings.hormonalFactors;
      if (customSettings?.skincareGoals !== undefined) payloadToUpdate.skincareGoals = customSettings.skincareGoals;
      if (customSettings?.skinPriorities !== undefined) payloadToUpdate.skinPriorities = customSettings.skinPriorities;
      if (customSettings?.upcomingEvent !== undefined) payloadToUpdate.upcomingEvent = customSettings.upcomingEvent;
      if (customSettings?.height !== undefined) payloadToUpdate.height = customSettings.height;
      if (customSettings?.gender !== undefined) payloadToUpdate.gender = customSettings.gender;

      await updateDoc(userRef, payloadToUpdate);
    }
  } catch (err) {
    console.warn("syncUserProfile Firestore warning:", err);
  }
};

// Save Facial Scan Result
export const saveFacialScan = async (userId: string, scanData: any) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const ref = collection(db, "facial_scans");
    const rawObj = {
      userId: userId || 'guest_user',
      scanId: scanData.scanId || scanData.id || `scan_${Date.now()}`,
      scanType: scanData.scanType || 'daily_scan',
      hydrationScore: scanData.hydrationScore ?? scanData.rawMetrics?.moistureScore ?? null,
      barrierScore: scanData.barrierScore ?? scanData.rawMetrics?.barrierRednessScore ?? null,
      clarityScore: scanData.clarityScore ?? scanData.rawMetrics?.acneBlemishScore ?? null,
      summary: scanData.summary || "Skin analysis processed successfully.",
      recommendations: scanData.recommendations || [],
      uvRecommendation: scanData.uvRecommendation || "",
      annotatedRegions: scanData.annotatedRegions || [],
      rawMetrics: scanData.rawMetrics || null,
      scoreInfo: scanData.scoreInfo || null,
      concernImages: scanData.concernImages || null,
      capturedImage: scanData.capturedImage ? (scanData.capturedImage.length < 800000 ? scanData.capturedImage : scanData.capturedImage) : null,
      rawPerfectCorpOutput: scanData.rawPerfectCorpOutput || null,
      scanDate: todayStr,
      timestamp: serverTimestamp()
    };
    const cleanData = sanitizeForFirestore(rawObj);
    const docRef = await addDoc(ref, cleanData);

    // Also store in user-specific subcollection users/{userId}/{scanType}s
    try {
      const subFolder = scanData.scanType === 'intermediate_scan' ? 'intermediate_scans' : 'daily_scans';
      const userScanRef = collection(db, "users", userId || 'guest_user', subFolder);
      await addDoc(userScanRef, cleanData);
    } catch (subErr) {
      console.warn("Subcollection save warning:", subErr);
    }

    // MANDATORY DATABASE PERSISTENCE: Automatically record lastCompletedScanDate & guest scan allowance in Firestore
    try {
      const uId = userId || 'guest_user';
      const userRef = doc(db, "users", uId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingData = userSnap.data();
        const existingSettings = existingData.settings || {};
        const existingAllowance = existingData.guestScanAllowance || { maxScans: 2, daysLimit: 2, totalScansDone: 0, scanDates: [] };
        const scanDates = Array.isArray(existingAllowance.scanDates) ? [...existingAllowance.scanDates] : [];
        if (!scanDates.includes(todayStr)) {
          scanDates.push(todayStr);
        }
        const updatedCount = (existingAllowance.totalScansDone || 0) + 1;
        
        await updateDoc(userRef, {
          "settings": {
            ...existingSettings,
            lastCompletedScanDate: todayStr
          },
          "guestScanAllowance": {
            maxScans: 2,
            daysLimit: 2,
            totalScansDone: updatedCount,
            scansCount: updatedCount,
            firstScanDate: existingAllowance.firstScanDate || todayStr,
            lastScanDate: todayStr,
            scanDates
          }
        });
      } else {
        await setDoc(userRef, {
          displayName: "Judge / Guest Explorer",
          email: `${uId}@trial.sana.app`,
          isAnonymous: true,
          isGuestTrial: true,
          settings: {
            temperatureUnit: "C",
            scanNotificationTime: "00:00",
            scanReminderEnabled: true,
            theme: "light",
            onboardingCompleted: true,
            lastCompletedScanDate: todayStr
          },
          guestScanAllowance: {
            maxScans: 2,
            daysLimit: 2,
            totalScansDone: 1,
            scansCount: 1,
            firstScanDate: todayStr,
            lastScanDate: todayStr,
            scanDates: [todayStr]
          },
          createdAt: serverTimestamp()
        });
      }
    } catch (userErr) {
      console.warn("User lastCompletedScanDate Firestore sync warning:", userErr);
    }

    return docRef.id;
  } catch (err) {
    console.error("Failed to save facial scan to Firestore:", err);
    return null;
  }
};

// Update Facial Scan Report Text & Status
export const updateFacialScanReport = async (docId: string, updatePayload: { reportStatus: string; reportText: string; reportSessionId?: string; updatedAt?: string }) => {
  if (!docId) return;
  try {
    const scanRef = doc(db, "facial_scans", docId);
    const cleanData = sanitizeForFirestore({
      ...updatePayload,
      updatedAt: serverTimestamp()
    });
    await updateDoc(scanRef, cleanData);
  } catch (err) {
    console.warn("Failed to update facial scan report:", err);
  }
};

const PAST_SCANS_CACHE: Record<string, { scans: any[]; timestamp: number }> = {};

// Get Past Scans for User (Promise)
export const getPastScansForUser = async (userId: string, limitCount: number = 20): Promise<any[]> => {
  const safeUid = userId || 'guest_user';
  const now = Date.now();
  if (PAST_SCANS_CACHE[safeUid] && (now - PAST_SCANS_CACHE[safeUid].timestamp < 120000)) {
    return PAST_SCANS_CACHE[safeUid].scans.slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "facial_scans"),
      where("userId", "==", safeUid),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    const scans = snap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, limitCount);
    PAST_SCANS_CACHE[safeUid] = { scans, timestamp: now };
    if (typeof window !== 'undefined' && window.localStorage && scans.length > 0) {
      try {
        localStorage.setItem(`sana_scans_${safeUid}`, JSON.stringify(scans));
      } catch {}
    }
    return scans;
  } catch (err: any) {
    const isQuota = /quota/i.test(err?.message || String(err));
    if (!isQuota) {
      console.warn("getPastScansForUser error:", err?.message || err);
    }
    // Fallback to local storage if available
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(`sana_scans_${safeUid}`);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {}
    }
    return [];
  }
};

// Subscribe to Facial Scan History
export const subscribeFacialScans = (userId: string, callback: (scans: any[]) => void) => {
  const safeUid = userId || 'guest_user';
  const loadLocalScans = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(`sana_scans_${safeUid}`);
        if (cached) callback(JSON.parse(cached));
        else callback([]);
      } catch { callback([]); }
    } else { callback([]); }
  };

  const q = query(
    collection(db, "facial_scans"),
    where("userId", "==", safeUid),
    orderBy("timestamp", "desc")
  );

  return onSnapshot(q, (snapshot) => {
    const scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (typeof window !== 'undefined' && window.localStorage && scans.length > 0) {
      try { localStorage.setItem(`sana_scans_${safeUid}`, JSON.stringify(scans)); } catch {}
    }
    callback(scans);
  }, (err: any) => {
    const isQuota = /quota/i.test(err?.message || String(err));
    if (!isQuota) {
      console.warn("Firestore subscription error (facial_scans):", err?.message || err);
    }
    loadLocalScans();
  });
};

// Chat & Multi-Session Persistence Helpers
export const createChatSession = async (
  userId: string,
  sessionData?: {
    id?: string;
    title?: string;
    sessionType?: 'onboarding_report' | 'scan_report' | 'chat' | 'consultation';
    initialMessages?: any[];
    sessionNotepad?: string;
  }
) => {
  const safeUid = userId || 'guest_user';
  const sessionId = sessionData?.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  const newSessionDoc = {
    id: sessionId,
    userId: safeUid,
    title: sessionData?.title || 'New Skin Consultation',
    sessionType: sessionData?.sessionType || 'chat',
    sessionNotepad: sessionData?.sessionNotepad || '',
    messageCount: sessionData?.initialMessages?.length || 0,
    lastMessage: sessionData?.initialMessages && sessionData.initialMessages.length > 0
      ? String(sessionData.initialMessages[sessionData.initialMessages.length - 1].text || '').slice(0, 120)
      : '',
    createdAt: nowIso,
    updatedAt: nowIso,
    lastActiveAt: nowIso,
    serverTimestamp: serverTimestamp()
  };

  try {
    const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
    await setDoc(sessionRef, newSessionDoc, { merge: true });

    if (sessionData?.initialMessages && sessionData.initialMessages.length > 0) {
      for (const msg of sessionData.initialMessages) {
        if (msg.id) {
          const cleanMsg = sanitizeForFirestore({ ...msg });
          delete cleanMsg.actionProposal;
          delete cleanMsg.thinkingMeta;
          const msgRef = doc(db, "users", safeUid, "agent_sessions", sessionId, "messages", msg.id);
          await setDoc(msgRef, cleanMsg, { merge: true });
        }
      }
    }

    return {
      ...newSessionDoc,
      messages: sessionData?.initialMessages || []
    };
  } catch (err) {
    console.error("Failed to create chat session in Firestore:", err);
    return {
      id: sessionId,
      userId: safeUid,
      title: sessionData?.title || 'New Skin Consultation',
      sessionType: sessionData?.sessionType || 'chat',
      sessionNotepad: sessionData?.sessionNotepad || '',
      messages: sessionData?.initialMessages || [],
      createdAt: nowIso,
      updatedAt: nowIso,
      lastActiveAt: nowIso,
      messageCount: 0,
      lastMessage: ''
    };
  }
};

export const saveChatSessionData = async (
  userId: string,
  sessionId: string,
  updates: {
    messages?: any[];
    title?: string;
    sessionNotepad?: string;
    sessionType?: 'onboarding_report' | 'scan_report' | 'chat' | 'consultation';
  }
) => {
  if (!sessionId) return;
  const safeUid = userId || 'guest_user';
  const nowIso = new Date().toISOString();

  const payload: Record<string, any> = {
    updatedAt: nowIso,
    lastActiveAt: nowIso,
    serverTimestamp: serverTimestamp()
  };

  if (updates.title) payload.title = updates.title;
  if (updates.sessionNotepad !== undefined) payload.sessionNotepad = updates.sessionNotepad;
  if (updates.sessionType) payload.sessionType = updates.sessionType;

  if (updates.messages !== undefined && updates.messages.length > 0) {
    payload.messageCount = updates.messages.length;
    const last = updates.messages[updates.messages.length - 1];
    payload.lastMessage = String(last.text || '').slice(0, 120);
  }

  try {
    const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
    await setDoc(sessionRef, payload, { merge: true });

    // Save each provided message into subcollection users/{userId}/agent_sessions/{sessionId}/messages/{msg.id}
    if (updates.messages && updates.messages.length > 0) {
      const msgPromises = updates.messages.map(async (msg) => {
        if (!msg || !msg.id) return;
        const cleanMsg = sanitizeForFirestore({ ...msg });
        delete cleanMsg.actionProposal;
        delete cleanMsg.thinkingMeta;

        const msgRef = doc(db, "users", safeUid, "agent_sessions", sessionId, "messages", msg.id);
        await setDoc(msgRef, cleanMsg, { merge: true });
      });
      await Promise.all(msgPromises);
    }
  } catch (err) {
    console.error("Failed to save chat session data:", err);
  }
};

export const updateSessionNotepadInDb = async (
  userId: string,
  sessionId: string,
  notepadContent: string
) => {
  if (!sessionId) return;
  const safeUid = userId || 'guest_user';
  try {
    const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
    await setDoc(sessionRef, {
      sessionNotepad: notepadContent,
      updatedAt: new Date().toISOString(),
      serverTimestamp: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("Failed to update session notepad in Firestore:", err);
  }
};

const parseMsgTime = (msg: any): number => {
  if (msg?.createdAt) {
    const t = new Date(msg.createdAt).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (typeof msg?.timestamp === 'number') return msg.timestamp;
  if (typeof msg?.timestamp === 'string') {
    const t = new Date(msg.timestamp).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  if (msg?.id) {
    const match = String(msg.id).match(/\d{10,}/);
    if (match) return parseInt(match[0], 10);
  }
  return 0;
};

export const getChatSession = async (userId: string, sessionId: string) => {
  if (!sessionId) return null;
  const safeUid = userId || 'guest_user';
  try {
    const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() } as any;
      const msgsColRef = collection(db, "users", safeUid, "agent_sessions", sessionId, "messages");
      const msgsSnap = await getDocs(msgsColRef);
      if (!msgsSnap.empty) {
        const msgs = msgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        msgs.sort((a: any, b: any) => parseMsgTime(a) - parseMsgTime(b));
        data.messages = msgs;
      }
      return data;
    }
    // Fallback to chats collection
    const chatRef = doc(db, "chats", sessionId);
    const chatSnap = await getDoc(chatRef);
    if (chatSnap.exists()) {
      return { id: chatSnap.id, ...chatSnap.data() } as any;
    }
  } catch (err) {
    console.warn("Failed to get chat session:", err);
  }
  return null;
};

export const deleteChatSession = async (userId: string, sessionId: string) => {
  if (!sessionId) return;
  const safeUid = userId || 'guest_user';
  try {
    const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
    await deleteDoc(sessionRef);
    const chatRef = doc(db, "chats", sessionId);
    await deleteDoc(chatRef);
  } catch (err) {
    console.warn("Failed to delete chat session:", err);
  }
};

export const subscribeUserSessions = (
  userId: string,
  callback: (sessions: any[]) => void
) => {
  const safeUid = userId || 'guest_user';
  const sessionsCol = collection(db, "users", safeUid, "agent_sessions");

  const loadLocalSessions = () => {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const cached = localStorage.getItem(`sana_sessions_${safeUid}`);
        if (cached) callback(JSON.parse(cached));
        else callback([]);
      } catch { callback([]); }
    } else { callback([]); }
  };

  return onSnapshot(sessionsCol, async (snapshot) => {
    if (!snapshot.empty) {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => {
        const timeA = new Date(a.lastActiveAt || a.updatedAt || a.createdAt || 0).getTime();
        const timeB = new Date(b.lastActiveAt || b.updatedAt || b.createdAt || 0).getTime();
        return timeB - timeA;
      });
      if (typeof window !== 'undefined' && window.localStorage) {
        try { localStorage.setItem(`sana_sessions_${safeUid}`, JSON.stringify(list)); } catch {}
      }
      callback(list);
    } else {
      callback([]);
    }
  }, (err: any) => {
    const isQuota = /quota/i.test(err?.message || String(err));
    if (!isQuota) {
      console.warn("Firestore subscribeUserSessions error:", err?.message || err);
    }
    loadLocalSessions();
  });
};

export const subscribeChatSession = (
  userId: string,
  sessionId: string,
  callback: (session: any) => void
) => {
  if (!sessionId) {
    callback(null);
    return () => {};
  }
  const safeUid = userId || 'guest_user';
  const sessionRef = doc(db, "users", safeUid, "agent_sessions", sessionId);
  const messagesColRef = collection(db, "users", safeUid, "agent_sessions", sessionId, "messages");

  let sessionData: any = null;
  let subcollectionMessages: any[] = [];

  const updateAndEmit = () => {
    if (!sessionData) return;
    const finalMessages = subcollectionMessages.length > 0
      ? subcollectionMessages
      : (Array.isArray(sessionData.messages) ? sessionData.messages : []);

    callback({
      ...sessionData,
      messages: finalMessages
    });
  };

  const unsubDoc = onSnapshot(sessionRef, (docSnap) => {
    if (docSnap.exists()) {
      sessionData = { id: docSnap.id, ...docSnap.data() };
      updateAndEmit();
    } else {
      // Fallback check to chats collection
      const chatRef = doc(db, "chats", sessionId);
      getDoc(chatRef).then(cSnap => {
        if (cSnap.exists()) {
          sessionData = { id: cSnap.id, ...cSnap.data() };
          updateAndEmit();
        } else {
          callback(null);
        }
      }).catch(() => callback(null));
    }
  }, (err) => {
    console.warn("Firestore subscribeChatSession error:", err);
    callback(null);
  });

  const unsubMsgs = onSnapshot(messagesColRef, (msgSnap) => {
    if (!msgSnap.empty) {
      const msgs = msgSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      msgs.sort((a: any, b: any) => parseMsgTime(a) - parseMsgTime(b));
      subcollectionMessages = msgs;
      updateAndEmit();
    }
  }, (err) => {
    console.warn("Firestore messages subcollection snapshot error:", err);
  });

  return () => {
    unsubDoc();
    unsubMsgs();
  };
};

// Legacy Chat Persistence Helpers (mirrored with session architecture)
export const saveChatMessage = async (userId: string, chatId: string, messages: any[]) => {
  try {
    const safeUid = userId || 'guest_user';
    await saveChatSessionData(safeUid, chatId, { messages });
  } catch (err) {
    console.error("Failed to save chat message:", err);
  }
};

export const subscribeUserChat = (chatId: string, callback: (chat: any) => void) => {
  const chatRef = doc(db, "chats", chatId);
  return onSnapshot(chatRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn("Firestore chat snapshot error:", err);
    callback(null);
  });
};

// Calendar Event Helpers
export const addCalendarEvent = async (userId: string, eventData: {
  title: string;
  date: string;
  time?: string;
  category?: string;
  notes?: string;
  reminder?: boolean;
}) => {
  try {
    const safeUid = userId || 'guest_user';
    const ref = collection(db, "calendar_events");
    await addDoc(ref, {
      userId: safeUid,
      title: eventData.title,
      date: eventData.date,
      time: eventData.time || '20:00',
      category: eventData.category || 'routine',
      notes: eventData.notes || '',
      reminder: eventData.reminder ?? true,
      completed: false,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error adding calendar event:", err);
  }
};

export const deleteCalendarEvent = async (eventId: string) => {
  if (!eventId) return;
  try {
    const ref = doc(db, "calendar_events", eventId);
    await deleteDoc(ref);
  } catch (err) {
    console.error("Error deleting calendar event:", err);
  }
};

export const subscribeCalendarEvents = (userId: string, callback: (events: any[]) => void) => {
  const safeUid = userId || 'guest_user';
  const q = query(
    collection(db, "calendar_events"),
    where("userId", "==", safeUid)
  );
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Sort chronologically by date and time
    events.sort((a: any, b: any) => {
      const dateA = `${a.date || ''} ${a.time || '00:00'}`;
      const dateB = `${b.date || ''} ${b.time || '00:00'}`;
      return dateA.localeCompare(dateB);
    });
    callback(events);
  }, (err) => {
    console.warn("Calendar events snapshot error:", err);
    callback([]);
  });
};
