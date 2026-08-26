import { db, sanitizeForFirestore } from '../lib/firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as limitQuery
} from 'firebase/firestore';

// ==========================================
// 1. ABSOLUTE TIME HELPER & CONVERSION
// ==========================================

export interface AbsoluteTimeInfo {
  occurredAt: string;        // ISO 8601 (e.g., 2026-08-08T10:20:42-07:00)
  occurredAtDate: string;    // YYYY-MM-DD
  timezone: string;          // e.g. America/Los_Angeles or -07:00
  recordedAt: string;        // ISO string when Vault wrote it
  localTime: string;         // Readable local time format with timezone name/offset
}

/**
 * Absolute Time Helper Rule:
 * Never store relative time ("yesterday", "last week"). Converts relative or string inputs
 * to absolute ISO 8601 datetimes, YYYY-MM-DD dates, and formatted local time strings.
 */
export function toAbsoluteTime(
  input?: string | Date | number | null,
  userTimezone?: string
): AbsoluteTimeInfo {
  const now = new Date();
  let targetDate = new Date();

  if (input instanceof Date) {
    targetDate = input;
  } else if (typeof input === 'number') {
    targetDate = new Date(input);
  } else if (typeof input === 'string' && input.trim().length > 0) {
    const clean = input.trim().toLowerCase();

    if (clean === 'today' || clean === 'now') {
      targetDate = new Date();
    } else if (clean === 'yesterday') {
      targetDate = new Date(now.getTime() - 86400000);
    } else if (clean === 'tomorrow') {
      targetDate = new Date(now.getTime() + 86400000);
    } else if (clean.includes('days ago') || clean.includes('day ago')) {
      const match = clean.match(/(\d+)/);
      const days = match ? parseInt(match[1], 10) : 1;
      targetDate = new Date(now.getTime() - days * 86400000);
    } else if (clean.includes('days later') || clean.includes('days from now')) {
      const match = clean.match(/(\d+)/);
      const days = match ? parseInt(match[1], 10) : 1;
      targetDate = new Date(now.getTime() + days * 86400000);
    } else if (clean.includes('last week') || clean.includes('a week ago')) {
      targetDate = new Date(now.getTime() - 7 * 86400000);
    } else if (clean.includes('two weeks ago') || clean.includes('2 weeks ago')) {
      targetDate = new Date(now.getTime() - 14 * 86400000);
    } else if (clean.includes('last month')) {
      targetDate = new Date(now.getTime() - 30 * 86400000);
    } else {
      const parsed = Date.parse(input);
      if (!isNaN(parsed)) {
        targetDate = new Date(parsed);
      }
    }
  }

  const occurredAt = targetDate.toISOString();
  const occurredAtDate = occurredAt.split('T')[0];
  const recordedAt = now.toISOString();

  // Determine user timezone / offset
  let tz = userTimezone;
  if (!tz) {
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      const offsetMin = targetDate.getTimezoneOffset();
      const sign = offsetMin <= 0 ? '+' : '-';
      const absOffset = Math.abs(offsetMin);
      const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
      const mins = String(absOffset % 60).padStart(2, '0');
      tz = `UTC${sign}${hours}:${mins}`;
    }
  }

  // Format readable local time
  let localTime = '';
  try {
    localTime = targetDate.toLocaleString('en-US', {
      timeZone: tz.startsWith('UTC') ? undefined : tz,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    localTime = `${occurredAtDate} ${targetDate.toTimeString().split(' ')[0]} (${tz})`;
  }

  return {
    occurredAt,
    occurredAtDate,
    timezone: tz,
    recordedAt,
    localTime
  };
}

// ==========================================
// 2. TYPESCRIPT INTERFACES
// ==========================================

export interface SessionRecord {
  sessionId: string;
  userId: string;
  startedAt: string;
  startedAtDate: string;
  recordedAt: string;
  localTime: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'abandoned';
  title: string;
  summary: string;
  topics: string[];
  intentHistory: string[];
  messages: Array<{
    role: 'user' | 'model';
    text: string;
    timestamp: string;
    localTime?: string;
  }>;
  toolCalls: Array<{
    name: string;
    arguments: any;
    resultSummary: string;
    success: boolean;
    timestamp: string;
  }>;
  passOnTrace?: any[];
  actionProposals?: any[];
  keywords: string[];
  embedding?: number[];
  version: number;
}

export interface IdentityData {
  id: 'identity';
  fullName?: string;
  preferredName?: string;
  ageRange?: string;
  birthYear?: number;
  sexOrHormonalContext?: string;
  locationOrClimate?: string;
  occupationOrLifestyle?: string;
  languages?: string[];
  permanentFacts?: string[];
  updatedAt: string;
  updatedAtDate: string;
  localTime: string;
  version: number;
}

export interface PersonalityData {
  id: 'personality';
  communicationStyle?: string;
  riskTolerance?: 'low' | 'medium' | 'high';
  setbackReaction?: string;
  motivationStyle?: string;
  antiRules?: string[];
  updatedAt: string;
  updatedAtDate: string;
  localTime: string;
  version: number;
}

export interface PreferencesData {
  id: 'preferences';
  notificationTiming?: string;
  units?: 'metric' | 'imperial';
  privacyPreferences?: Record<string, any>;
  rememberedRules?: string[];
  forgottenRules?: string[];
  updatedAt: string;
  updatedAtDate: string;
  localTime: string;
  version: number;
}

export interface SkinCompositionData {
  id: 'composition';
  skinTypeTendency?: string;
  barrierStatusPatterns?: string;
  pigmentationTendency?: string;
  texturePoreElasticity?: string;
  knownTriggers?: string[];
  confidenceScore?: number;
  lastUpdated: string;
  lastUpdatedDate: string;
  localTime: string;
  version: number;
}

export interface SkinMeasurementRecord {
  id: string;
  title: string;
  occurredAt: string;
  occurredAtDate: string;
  recordedAt: string;
  localTime: string;
  imageRef?: string; // ONLY imageRef reference, never raw bytes
  extractedData: Record<string, any>;
  referenceNotes?: string;
  version: number;
}

export interface SkinEvolutionRecord {
  id: 'evolution';
  timeline: Array<{
    date: string;
    occurredAt: string;
    localTime?: string;
    summary: string;
    linkedScanId?: string;
    linkedIncidentId?: string;
  }>;
  lastUpdated: string;
  lastUpdatedDate: string;
  localTime: string;
  version: number;
}

export interface IncidentRecord {
  id: string;
  title: string;
  occurredAt: string;
  occurredAtDate: string;
  recordedAt: string;
  localTime: string;
  timezone?: string;
  type: 'reaction' | 'breakout' | 'flare' | 'allergy' | 'other';
  severity: 'mild' | 'moderate' | 'severe';
  bodyAreas: string[];
  description: string;
  suspectedTriggers: string[];
  relatedProducts: string[];
  relatedIngredients: string[];
  notes: string;
  outcome?: string;
  linkedScanIds?: string[];
  version: number;
}

export type EventStatus = 'upcoming' | 'today' | 'completed' | 'missed' | 'cancelled';

export interface EventRecord {
  id: string;
  title: string;
  scheduledAt: string;
  scheduledAtDate: string;
  recordedAt: string;
  localTime: string;
  timezone?: string;
  status: EventStatus;
  category: string;
  preparationProtocolId?: string;
  outcomeNotes?: string;
  followUpAsked?: boolean;
  version: number;
}

export interface GoalMetric {
  name: string;
  baseline?: number | string;
  current?: number | string;
  target?: number | string;
}

export interface GoalProgressLog {
  date: string;
  occurredAt: string;
  localTime: string;
  note: string;
  value?: number | string;
}

export interface GoalRecord {
  id: string;
  title: string;
  description: string;
  recordedAt: string;
  occurredAtDate: string;
  localTime: string;
  targetDate?: string;
  status: 'active' | 'achieved' | 'abandoned' | 'paused';
  metrics: GoalMetric[];
  progressLog: GoalProgressLog[];
  version: number;
}

export interface VaultVersionRecord {
  version: number;
  previousVersion: number | null;
  changedAt: string;
  localTime: string;
  changedBy: 'sana' | 'user' | 'system';
  diffSummary: string;
  dataSnapshot: any;
}

// Backwards-compatible Notes & Documents
export interface VaultNote {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  localTime?: string;
  source: 'agent_memory_vault';
  tags?: string[];
  version?: number;
}

export interface VaultDocument {
  id: string;
  title: string;
  content: string;
  fileType: string;
  date: string;
  localTime?: string;
  summary?: string;
  imageRef?: string;
  version?: number;
}

export interface VaultHyperlink {
  id: string;
  title: string;
  targetType: 'file' | 'folder' | 'external';
  targetIdOrUrl: string;
  notes?: string;
  createdAt: string;
}

export interface VaultFolderRecord {
  id: string;
  name: string;
  path: string;
  parentPath: string;
  description?: string;
  childFolderIds: string[];
  fileIds: string[];
  hyperlinks: VaultHyperlink[];
  createdAt: string;
  updatedAt: string;
  version?: number;
}

export interface VaultFileRecord {
  id: string;
  name: string;
  path: string;
  folderPath: string;
  content: string;
  fileType: string;
  tags: string[];
  hyperlinks?: VaultHyperlink[];
  createdAt: string;
  updatedAt: string;
  version: number;
  localTime?: string;
  recordedAt?: string;
}

export interface AgentVaultData {
  userId: string;
  identity?: IdentityData;
  personality?: PersonalityData;
  preferences?: PreferencesData;
  composition?: SkinCompositionData;
  evolution?: SkinEvolutionRecord;
  sessions: SessionRecord[];
  incidents: IncidentRecord[];
  events: EventRecord[];
  goals: GoalRecord[];
  notes: VaultNote[];
  documents: VaultDocument[];
  folders: VaultFolderRecord[];
  files: VaultFileRecord[];
  lastSynced: string;
}

// ==========================================
// 3. CODE PROTECTIONS & GUARDS
// ==========================================

const PROTECTED_VAULT_PATHS = ['app_map', '_system'];

export function assertAllowedVaultPath(categoryOrPath: string): void {
  const clean = categoryOrPath.toLowerCase().trim();
  if (PROTECTED_VAULT_PATHS.some(p => clean === p || clean.startsWith(`${p}/`))) {
    throw new Error(
      `[SANA_VAULT_GUARD] Access Denied: '${categoryOrPath}' is a read-only developer system path and cannot be modified by the agent.`
    );
  }
}

// In-memory cache per user
const vaultCache: Record<string, AgentVaultData> = {};

export function getOrCreateVaultCache(userId: string): AgentVaultData {
  const safeUserId = (userId && typeof userId === 'string' && userId.trim().length > 0) ? userId.trim() : 'guest_user';
  if (!vaultCache[safeUserId]) {
    vaultCache[safeUserId] = {
      userId: safeUserId,
      sessions: [],
      incidents: [],
      events: [],
      goals: [],
      notes: [],
      documents: [],
      folders: [],
      files: [],
      lastSynced: new Date().toISOString()
    };
  }
  return vaultCache[safeUserId];
}

export function clearAgentVaultCache(userId: string) {
  const safeUserId = (userId && typeof userId === 'string' && userId.trim().length > 0) ? userId.trim() : 'guest_user';
  delete vaultCache[safeUserId];
}

// ==========================================
// 4. GIT-LIKE LIGHTWEIGHT VERSIONING ENGINE
// ==========================================

/**
 * Saves a versioned record to `users/{userId}/vault/{category}/records/{docId}`.
 * Increments `version`, archives old snapshot to `versions` subcollection, and logs diffSummary.
 */
export async function saveVaultRecordWithVersion<T extends { version?: number }>(
  userId: string,
  category: string,
  docId: string,
  data: T,
  changedBy: 'sana' | 'user' | 'system' = 'sana',
  diffSummary: string = 'Updated document content'
): Promise<T & { version: number }> {
  assertAllowedVaultPath(category);
  const safeUserId = (userId && typeof userId === 'string' && userId.trim().length > 0) ? userId.trim() : 'guest_user';

  const docRef = doc(db, 'users', safeUserId, 'vault', category, 'records', docId);
  const timeInfo = toAbsoluteTime();

  let existingVersion = 0;
  let previousData: any = null;

  try {
    if (db) {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        previousData = snap.data();
        existingVersion = previousData.version || 1;
      }
    }
  } catch (err) {
    console.warn(`[VaultVersion] Could not fetch previous version for ${docId}:`, err);
  }

  const newVersion = existingVersion + 1;
  const updatedRecord = {
    ...data,
    version: newVersion,
    recordedAt: timeInfo.recordedAt,
    localTime: (data as any).localTime || timeInfo.localTime
  };

  try {
    if (db) {
      // 1. Save snapshot to versions subcollection
      if (previousData) {
        const versionRef = doc(db, 'users', safeUserId, 'vault', category, 'records', docId, 'versions', `v_${existingVersion}`);
        const versionRecord: VaultVersionRecord = {
          version: existingVersion,
          previousVersion: existingVersion > 1 ? existingVersion - 1 : null,
          changedAt: timeInfo.recordedAt,
          localTime: timeInfo.localTime,
          changedBy,
          diffSummary,
          dataSnapshot: previousData
        };
        await setDoc(versionRef, sanitizeForFirestore(versionRecord));
      }

      // 2. Save new version in primary document
      await setDoc(docRef, sanitizeForFirestore(updatedRecord));
    }
  } catch (err) {
    console.warn(`[VaultVersion] Error saving versioned record for ${safeUserId}/${category}/${docId}:`, err);
  }

  return updatedRecord;
}

/**
 * Retrieves version history for a given document.
 * Rule: If total versions <= 3 -> returns all versions; if > 3 -> returns up to limitCount.
 */
export async function getVaultHistory(
  userId: string,
  category: string,
  docId: string,
  limitCount: number = 5
): Promise<VaultVersionRecord[]> {
  assertAllowedVaultPath(category);
  const safeUserId = (userId && typeof userId === 'string' && userId.trim().length > 0) ? userId.trim() : 'guest_user';
  const history: VaultVersionRecord[] = [];

  try {
    if (db) {
      const versionsRef = collection(db, 'users', safeUserId, 'vault', category, 'records', docId, 'versions');
      const q = query(versionsRef, orderBy('version', 'desc'), limitQuery(20));
      const snap = await getDocs(q);

      snap.forEach(d => {
        history.push(d.data() as VaultVersionRecord);
      });
    }
  } catch (err) {
    console.warn(`[VaultVersion] Error getting history for ${docId}:`, err);
  }

  if (history.length <= 3) {
    return history;
  }
  return history.slice(0, limitCount);
}

// ==========================================
// 5. EVENT STATUS INTERNAL STATE MACHINE
// ==========================================

/**
 * Evaluates and updates event statuses based on current date & time.
 * - If scheduledAtDate < today & status === 'upcoming' -> 'completed' or 'missed'
 * - If scheduledAtDate === today & status === 'upcoming' -> 'today'
 */
export async function evaluateAndUpdateEventStatuses(
  userId: string,
  events: EventRecord[]
): Promise<EventRecord[]> {
  const todayDate = new Date().toISOString().split('T')[0];
  const updatedEvents: EventRecord[] = [];

  for (const evt of events) {
    let changed = false;
    let newStatus = evt.status;

    if (evt.status === 'upcoming') {
      if (evt.scheduledAtDate < todayDate) {
        newStatus = evt.outcomeNotes ? 'completed' : 'missed';
        changed = true;
      } else if (evt.scheduledAtDate === todayDate) {
        newStatus = 'today';
        changed = true;
      }
    }

    if (changed) {
      const updatedEvt: EventRecord = {
        ...evt,
        status: newStatus
      };
      await saveVaultRecordWithVersion(
        userId,
        'events',
        evt.id,
        updatedEvt,
        'system',
        `Automated state transition: 'upcoming' -> '${newStatus}' based on temporal trigger.`
      );
      updatedEvents.push(updatedEvt);
    } else {
      updatedEvents.push(evt);
    }
  }

  return updatedEvents;
}

// ==========================================
// 6. DOMAIN SPECIFIC RECORD SAVERS
// ==========================================

export async function saveVaultSession(
  userId: string,
  session: Partial<SessionRecord> & { sessionId: string; messages: any[] }
): Promise<SessionRecord> {
  const timeInfo = toAbsoluteTime(session.startedAt);
  const recId = session.sessionId;

  const fullSession: SessionRecord = {
    sessionId: recId,
    userId,
    startedAt: session.startedAt || timeInfo.occurredAt,
    startedAtDate: timeInfo.occurredAtDate,
    recordedAt: timeInfo.recordedAt,
    localTime: session.localTime || timeInfo.localTime,
    status: session.status || 'active',
    title: session.title || `Skin Consult Session ${recId.slice(-4)}`,
    summary: session.summary || (session.messages.length > 0 ? session.messages[session.messages.length - 1].text.slice(0, 150) : 'Session started.'),
    topics: session.topics || ['skincare', 'consultation'],
    intentHistory: session.intentHistory || [],
    messages: session.messages || [],
    toolCalls: session.toolCalls || [],
    keywords: session.keywords || ['sana', 'consult'],
    version: session.version || 1
  };

  const saved = await saveVaultRecordWithVersion(userId, 'sessions', recId, fullSession, 'sana', 'Logged session activity.');
  const cache = getOrCreateVaultCache(userId);
  const idx = cache.sessions.findIndex(s => s.sessionId === recId);
  if (idx >= 0) cache.sessions[idx] = saved;
  else cache.sessions.unshift(saved);

  return saved;
}

export async function saveVaultUserData(
  userId: string,
  subType: 'identity' | 'personality' | 'preferences',
  payload: any,
  changedBy: 'sana' | 'user' | 'system' = 'sana',
  diffSummary: string = 'Updated user data'
): Promise<any> {
  const timeInfo = toAbsoluteTime();
  const cache = getOrCreateVaultCache(userId);
  const existing = cache[subType] || {};

  const recordData = {
    ...existing,
    ...payload,
    id: subType,
    updatedAt: timeInfo.occurredAt,
    updatedAtDate: timeInfo.occurredAtDate,
    localTime: timeInfo.localTime
  };

  const saved = await saveVaultRecordWithVersion(userId, 'user_data', subType, recordData, changedBy, diffSummary);
  if (subType === 'identity') cache.identity = saved;
  if (subType === 'personality') cache.personality = saved;
  if (subType === 'preferences') cache.preferences = saved;

  return saved;
}

export async function saveVaultSkinComposition(
  userId: string,
  payload: Partial<SkinCompositionData>,
  changedBy: 'sana' | 'user' | 'system' = 'sana',
  diffSummary: string = 'Updated skin composition profile'
): Promise<SkinCompositionData> {
  const timeInfo = toAbsoluteTime();
  const cache = getOrCreateVaultCache(userId);
  const existing: Partial<SkinCompositionData> = cache.composition || {};

  const compData: SkinCompositionData = {
    id: 'composition',
    skinTypeTendency: payload.skinTypeTendency !== undefined ? payload.skinTypeTendency : (existing.skinTypeTendency || ''),
    barrierStatusPatterns: payload.barrierStatusPatterns !== undefined ? payload.barrierStatusPatterns : (existing.barrierStatusPatterns || ''),
    pigmentationTendency: payload.pigmentationTendency !== undefined ? payload.pigmentationTendency : (existing.pigmentationTendency || ''),
    texturePoreElasticity: payload.texturePoreElasticity !== undefined ? payload.texturePoreElasticity : (existing.texturePoreElasticity || ''),
    knownTriggers: payload.knownTriggers || existing.knownTriggers || [],
    confidenceScore: payload.confidenceScore || existing.confidenceScore || 0.85,
    lastUpdated: timeInfo.occurredAt,
    lastUpdatedDate: timeInfo.occurredAtDate,
    localTime: timeInfo.localTime,
    version: (existing.version || 0) + 1
  };

  const saved = await saveVaultRecordWithVersion(userId, 'skin_profile', 'composition', compData, changedBy, diffSummary);
  cache.composition = saved;
  return saved;
}

export async function saveVaultIncident(
  userId: string,
  payload: {
    title: string;
    occurredAt?: string;
    type?: 'reaction' | 'breakout' | 'flare' | 'allergy' | 'other';
    severity?: 'mild' | 'moderate' | 'severe';
    bodyAreas?: string[];
    description?: string;
    suspectedTriggers?: string[];
    relatedProducts?: string[];
    relatedIngredients?: string[];
    notes?: string;
    outcome?: string;
  },
  changedBy: 'sana' | 'user' | 'system' = 'sana'
): Promise<IncidentRecord> {
  const timeInfo = toAbsoluteTime(payload.occurredAt);
  const incId = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const incident: IncidentRecord = {
    id: incId,
    title: payload.title,
    occurredAt: timeInfo.occurredAt,
    occurredAtDate: timeInfo.occurredAtDate,
    recordedAt: timeInfo.recordedAt,
    localTime: timeInfo.localTime,
    timezone: timeInfo.timezone,
    type: payload.type || 'flare',
    severity: payload.severity || 'mild',
    bodyAreas: payload.bodyAreas || ['face'],
    description: payload.description || payload.title,
    suspectedTriggers: payload.suspectedTriggers || [],
    relatedProducts: payload.relatedProducts || [],
    relatedIngredients: payload.relatedIngredients || [],
    notes: payload.notes || '',
    outcome: payload.outcome || 'monitoring',
    version: 1
  };

  const saved = await saveVaultRecordWithVersion(userId, 'incidents', incId, incident, changedBy, `Logged reaction incident: ${payload.title}`);
  const cache = getOrCreateVaultCache(userId);
  cache.incidents.unshift(saved);
  return saved;
}

export async function saveVaultEvent(
  userId: string,
  payload: {
    title: string;
    scheduledAt?: string;
    category?: string;
    preparationProtocolId?: string;
    outcomeNotes?: string;
  },
  changedBy: 'sana' | 'user' | 'system' = 'sana'
): Promise<EventRecord> {
  const timeInfo = toAbsoluteTime(payload.scheduledAt);
  const evtId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const todayDate = new Date().toISOString().split('T')[0];
  let status: EventStatus = 'upcoming';
  if (timeInfo.occurredAtDate < todayDate) {
    status = payload.outcomeNotes ? 'completed' : 'missed';
  } else if (timeInfo.occurredAtDate === todayDate) {
    status = 'today';
  }

  const evt: EventRecord = {
    id: evtId,
    title: payload.title,
    scheduledAt: timeInfo.occurredAt,
    scheduledAtDate: timeInfo.occurredAtDate,
    recordedAt: timeInfo.recordedAt,
    localTime: timeInfo.localTime,
    timezone: timeInfo.timezone,
    status,
    category: payload.category || 'routine',
    preparationProtocolId: payload.preparationProtocolId,
    outcomeNotes: payload.outcomeNotes || '',
    version: 1
  };

  const saved = await saveVaultRecordWithVersion(userId, 'events', evtId, evt, changedBy, `Created event: ${payload.title}`);
  const cache = getOrCreateVaultCache(userId);
  cache.events.unshift(saved);

  // Sync to primary calendar_events collection
  try {
    const safeUid = (userId && typeof userId === 'string' && userId.trim().length > 0) ? userId.trim() : 'guest_user';
    if (db) {
      const calendarRef = collection(db, "calendar_events");
      await addDoc(calendarRef, {
        userId: safeUid,
        title: payload.title,
        date: timeInfo.occurredAtDate,
        time: timeInfo.occurredAt ? timeInfo.occurredAt.split('T')[1]?.slice(0, 5) || '20:00' : '20:00',
        category: payload.category || 'routine',
        notes: payload.outcomeNotes || '',
        reminder: true,
        completed: status === 'completed',
        createdAt: new Date().toISOString()
      });
    }
  } catch (err) {
    console.warn('[saveVaultEvent] Error syncing to calendar_events:', err);
  }

  return saved;
}

export async function saveVaultGoal(
  userId: string,
  payload: {
    title: string;
    description?: string;
    targetDate?: string;
    metrics?: GoalMetric[];
    status?: 'active' | 'achieved' | 'abandoned' | 'paused';
  },
  changedBy: 'sana' | 'user' | 'system' = 'sana'
): Promise<GoalRecord> {
  const timeInfo = toAbsoluteTime();
  const goalId = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const goal: GoalRecord = {
    id: goalId,
    title: payload.title,
    description: payload.description || payload.title,
    recordedAt: timeInfo.recordedAt,
    occurredAtDate: timeInfo.occurredAtDate,
    localTime: timeInfo.localTime,
    targetDate: payload.targetDate ? toAbsoluteTime(payload.targetDate).occurredAtDate : undefined,
    status: payload.status || 'active',
    metrics: payload.metrics || [],
    progressLog: [
      {
        date: timeInfo.occurredAtDate,
        occurredAt: timeInfo.occurredAt,
        localTime: timeInfo.localTime,
        note: 'Goal created in Agent Vault.'
      }
    ],
    version: 1
  };

  const saved = await saveVaultRecordWithVersion(userId, 'goals', goalId, goal, changedBy, `Created goal: ${payload.title}`);
  const cache = getOrCreateVaultCache(userId);
  cache.goals.unshift(saved);
  return saved;
}

// Backwards-compatible Note & Document savers
export async function saveAgentVaultNote(
  userId: string,
  payload: { title: string; description?: string; category?: string; date?: string; tags?: string[] }
): Promise<VaultNote> {
  const timeInfo = toAbsoluteTime(payload.date);
  const noteId = `vn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newNote: VaultNote = {
    id: noteId,
    title: payload.title,
    description: payload.description || payload.title,
    category: payload.category || 'observation',
    date: timeInfo.occurredAt,
    localTime: timeInfo.localTime,
    source: 'agent_memory_vault',
    tags: payload.tags || ['skin_memory']
  };

  const saved = await saveVaultRecordWithVersion(userId, 'notes', noteId, newNote, 'sana', `Saved memory note: ${payload.title}`);
  getOrCreateVaultCache(userId).notes.unshift(saved as any);
  return saved;
}

export async function saveAgentVaultDocument(
  userId: string,
  docData: { title: string; content: string; fileType?: string; summary?: string; date?: string; imageRef?: string }
): Promise<VaultDocument> {
  const timeInfo = toAbsoluteTime(docData.date);
  const docId = `vdoc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newDoc: VaultDocument = {
    id: docId,
    title: docData.title,
    content: docData.content,
    fileType: docData.fileType || 'text/plain',
    date: timeInfo.occurredAt,
    localTime: timeInfo.localTime,
    summary: docData.summary || docData.content.substring(0, 200),
    imageRef: docData.imageRef || undefined // Never store raw image bytes — only imageRef reference!
  };

  const saved = await saveVaultRecordWithVersion(userId, 'documents', docId, newDoc, 'sana', `Ingested document: ${docData.title}`);
  getOrCreateVaultCache(userId).documents.unshift(saved as any);
  return saved;
}

// ==========================================
// 7. MULTI-SCOPE VAULT SEARCH ENGINE
// ==========================================

export interface VaultSearchParams {
  scope?: 'sessions' | 'incidents' | 'events' | 'goals' | 'skin_profile' | 'user_data' | 'notes' | 'documents' | 'all';
  mode?: 'keyword' | 'vector' | 'auto';
  query: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  includeVersions?: boolean;
}

export async function vaultSearch(
  userId: string,
  params: VaultSearchParams
): Promise<Record<string, any[]>> {
  const scope = params.scope || 'all';
  const queryText = params.query.toLowerCase().trim();
  const maxLimit = params.limit || 10;
  const results: Record<string, any[]> = {};

  const fullVault = await loadFullAgentVault(userId);

  // Date range checker helper
  const inDateRange = (dateStr?: string) => {
    if (!dateStr) return true;
    const cleanDate = dateStr.slice(0, 10);
    if (params.dateFrom && cleanDate < params.dateFrom) return false;
    if (params.dateTo && cleanDate > params.dateTo) return false;
    return true;
  };

  const isWildcard = !queryText || ['all', 'everything', 'retrieve', '*', 'all memories', 'all notes', 'retrieve everything', 'get everything', 'stored'].includes(queryText);

  // Keyword relevance match checker
  const matches = (...fields: (string | undefined | null)[]) => {
    if (isWildcard) return true;
    return fields.some(f => f && f.toLowerCase().includes(queryText));
  };

  // Search Sessions
  if (scope === 'all' || scope === 'sessions') {
    results.sessions = fullVault.sessions
      .filter(s => inDateRange(s.startedAtDate) && matches(s.title, s.summary, ...s.topics, ...s.keywords))
      .slice(0, maxLimit);
  }

  // Search Incidents
  if (scope === 'all' || scope === 'incidents') {
    results.incidents = fullVault.incidents
      .filter(i => inDateRange(i.occurredAtDate) && matches(i.title, i.description, i.notes, ...i.suspectedTriggers, ...i.relatedIngredients))
      .slice(0, maxLimit);
  }

  // Search Events
  if (scope === 'all' || scope === 'events') {
    results.events = fullVault.events
      .filter(e => inDateRange(e.scheduledAtDate) && matches(e.title, e.category, e.outcomeNotes))
      .slice(0, maxLimit);
  }

  // Search Goals
  if (scope === 'all' || scope === 'goals') {
    results.goals = fullVault.goals
      .filter(g => inDateRange(g.occurredAtDate) && matches(g.title, g.description, g.status))
      .slice(0, maxLimit);
  }

  // Search Skin Profile
  if (scope === 'all' || scope === 'skin_profile') {
    const profileMatches: any[] = [];
    if (fullVault.composition && matches(fullVault.composition.skinTypeTendency, fullVault.composition.barrierStatusPatterns, ...(fullVault.composition.knownTriggers || []))) {
      profileMatches.push(fullVault.composition);
    }
    results.skin_profile = profileMatches;
  }

  // Search User Data
  if (scope === 'all' || scope === 'user_data') {
    const userDataMatches: any[] = [];
    if (fullVault.identity && matches(fullVault.identity.preferredName, fullVault.identity.locationOrClimate, ...(fullVault.identity.permanentFacts || []))) {
      userDataMatches.push(fullVault.identity);
    }
    if (fullVault.personality && matches(fullVault.personality.communicationStyle, fullVault.personality.motivationStyle)) {
      userDataMatches.push(fullVault.personality);
    }
    if (fullVault.preferences && matches(fullVault.preferences.units, fullVault.preferences.notificationTiming)) {
      userDataMatches.push(fullVault.preferences);
    }
    results.user_data = userDataMatches;
  }

  // Search Notes
  if (scope === 'all' || scope === 'notes') {
    results.notes = fullVault.notes
      .filter(n => inDateRange(n.date) && matches(n.title, n.description, n.category, ...(n.tags || [])))
      .slice(0, maxLimit);
  }

  // Search Documents
  if (scope === 'all' || scope === 'documents') {
    results.documents = fullVault.documents
      .filter(d => inDateRange(d.date) && matches(d.title, d.content, d.summary))
      .slice(0, maxLimit);
  }

  return results;
}

export async function searchAgentVault(
  userId: string,
  queryText: string
): Promise<{ notes: VaultNote[]; documents: VaultDocument[] }> {
  const res = await vaultSearch(userId, { query: queryText, scope: 'all' });
  return {
    notes: res.notes || [],
    documents: res.documents || []
  };
}

// ==========================================
// 8. FULL AGENT VAULT LOADER
// ==========================================

export async function loadFullAgentVault(userId: string, forceRefresh = false): Promise<AgentVaultData> {
  const cache = getOrCreateVaultCache(userId);

  // If in-memory cache is fresh (less than 5 minutes old) and not forceRefresh, return immediately
  if (!forceRefresh && cache.lastSynced) {
    const ageMs = Date.now() - new Date(cache.lastSynced).getTime();
    if (ageMs < 5 * 60 * 1000) {
      return cache;
    }
  }

  // Check LocalStorage backup cache
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const localVault = localStorage.getItem(`sana_vault_${userId}`);
      if (localVault) {
        const parsed = JSON.parse(localVault);
        Object.assign(cache, parsed);
        if (!forceRefresh && cache.lastSynced) {
          const ageMs = Date.now() - new Date(cache.lastSynced).getTime();
          if (ageMs < 5 * 60 * 1000) {
            return cache;
          }
        }
      }
    } catch {}
  }

  try {
    if (db) {
      // 1. Fetch Sessions
      const sessSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'sessions', 'records'), orderBy('recordedAt', 'desc'), limitQuery(10)));
      if (!sessSnap.empty) {
        cache.sessions = sessSnap.docs.map(d => d.data() as SessionRecord);
      }

      // 2. Fetch Incidents
      const incSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'incidents', 'records'), orderBy('recordedAt', 'desc'), limitQuery(10)));
      if (!incSnap.empty) {
        cache.incidents = incSnap.docs.map(d => d.data() as IncidentRecord);
      }

      // 3. Fetch Events & evaluate state machine
      const evtSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'events', 'records'), orderBy('recordedAt', 'desc'), limitQuery(15)));
      if (!evtSnap.empty) {
        const rawEvts = evtSnap.docs.map(d => d.data() as EventRecord);
        cache.events = await evaluateAndUpdateEventStatuses(userId, rawEvts);
      }

      // 4. Fetch Goals
      const goalSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'goals', 'records'), orderBy('recordedAt', 'desc'), limitQuery(10)));
      if (!goalSnap.empty) {
        cache.goals = goalSnap.docs.map(d => d.data() as GoalRecord);
      }

      // 5. Fetch User Data
      const identSnap = await getDoc(doc(db, 'users', userId, 'vault', 'user_data', 'records', 'identity'));
      if (identSnap.exists()) cache.identity = identSnap.data() as IdentityData;

      const persSnap = await getDoc(doc(db, 'users', userId, 'vault', 'user_data', 'records', 'personality'));
      if (persSnap.exists()) cache.personality = persSnap.data() as PersonalityData;

      const prefSnap = await getDoc(doc(db, 'users', userId, 'vault', 'user_data', 'records', 'preferences'));
      if (prefSnap.exists()) cache.preferences = prefSnap.data() as PreferencesData;

      // 6. Fetch Skin Composition
      const compSnap = await getDoc(doc(db, 'users', userId, 'vault', 'skin_profile', 'records', 'composition'));
      if (compSnap.exists()) cache.composition = compSnap.data() as SkinCompositionData;

      // 7. Fetch Notes & Documents
      const notesSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'notes', 'records'), orderBy('date', 'desc'), limitQuery(10)));
      if (!notesSnap.empty) cache.notes = notesSnap.docs.map(d => d.data() as VaultNote);

      const docsSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'documents', 'records'), orderBy('date', 'desc'), limitQuery(10)));
      if (!docsSnap.empty) cache.documents = docsSnap.docs.map(d => d.data() as VaultDocument);

      // 8. Fetch Folders & Files
      const foldersSnap = await getDocs(query(collection(db, 'users', userId, 'vault', 'file_system', 'records'), orderBy('updatedAt', 'desc'), limitQuery(50)));
      if (!foldersSnap.empty) {
        const rawFolders: VaultFolderRecord[] = [];
        const rawFiles: VaultFileRecord[] = [];
        foldersSnap.docs.forEach(d => {
          const item = d.data();
          if (item.content !== undefined) {
            rawFiles.push(item as VaultFileRecord);
          } else {
            rawFolders.push(item as VaultFolderRecord);
          }
        });
        cache.folders = rawFolders;
        cache.files = rawFiles;
      }

      cache.lastSynced = new Date().toISOString();

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(`sana_vault_${userId}`, JSON.stringify(cache));
        } catch {}
      }
    }
  } catch (err: any) {
    const isQuota = /quota/i.test(err?.message || String(err));
    if (!isQuota) {
      console.warn(`[AgentVault] Firestore full load fallback for user ${userId}:`, err?.message || err);
    }
  }

  return cache;
}

export async function loadAgentVault(userId: string): Promise<AgentVaultData> {
  return loadFullAgentVault(userId);
}

export function parseDocumentContent(filename: string, rawContent: string): { title: string; content: string; summary: string } {
  const cleanTitle = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const trimmed = rawContent.trim();
  const summary = trimmed.length > 250 ? `${trimmed.substring(0, 250)}...` : trimmed;

  return {
    title: cleanTitle,
    content: trimmed,
    summary
  };
}

// ==========================================
// 9. VIRTUAL FILE & FOLDER MANAGEMENT ENGINE
// ==========================================

export function normalizeVaultPath(rawPath?: string): string {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.trim() === '' || rawPath.trim() === '.') return '/';
  let p = rawPath.trim().replace(/\0/g, '').replace(/\\/g, '/');
  // Strip relative parent traversal dots to secure against directory escapes
  p = p.replace(/\/\.\.\//g, '/').replace(/\/\.\.$/g, '');
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p || '/';
}

/**
 * Creates a new Virtual Folder in Agent Vault.
 */
export async function createVaultFolder(
  userId: string,
  name: string,
  parentPath?: string,
  description?: string
): Promise<VaultFolderRecord> {
  const timeInfo = toAbsoluteTime();
  const normParent = normalizeVaultPath(parentPath);
  const cleanName = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const folderPath = normParent === '/' ? `/${cleanName}` : `${normParent}/${cleanName}`;
  const folderId = `fldr_${Buffer.from(folderPath).toString('hex').substring(0, 16)}`;

  const folderRecord: VaultFolderRecord = {
    id: folderId,
    name: cleanName,
    path: folderPath,
    parentPath: normParent,
    description: description || `Folder for ${cleanName}`,
    childFolderIds: [],
    fileIds: [],
    hyperlinks: [],
    createdAt: timeInfo.recordedAt,
    updatedAt: timeInfo.recordedAt,
    version: 1
  };

  const saved = await saveVaultRecordWithVersion(
    userId,
    'file_system',
    folderId,
    folderRecord,
    'sana',
    `Created folder '${folderPath}'`
  );

  const cache = getOrCreateVaultCache(userId);
  const idx = cache.folders.findIndex(f => f.id === folderId || f.path === folderPath);
  if (idx >= 0) cache.folders[idx] = saved as VaultFolderRecord;
  else cache.folders.push(saved as VaultFolderRecord);

  return saved as VaultFolderRecord;
}

/**
 * Creates a new Virtual File inside a Virtual Folder.
 */
export async function createVaultFile(
  userId: string,
  name: string,
  content: string,
  folderPath?: string,
  fileType: string = 'text/markdown',
  tags: string[] = []
): Promise<VaultFileRecord> {
  const timeInfo = toAbsoluteTime();
  const normFolder = normalizeVaultPath(folderPath);
  const cleanName = name.trim().replace(/[/\\?%*:|"<>]/g, '_');
  const filePath = normFolder === '/' ? `/${cleanName}` : `${normFolder}/${cleanName}`;
  const fileId = `file_${Buffer.from(filePath).toString('hex').substring(0, 16)}`;

  // Ensure target folder exists
  if (normFolder !== '/') {
    await createVaultFolder(userId, normFolder.split('/').pop() || 'Folder', normFolder.split('/').slice(0, -1).join('/') || '/');
  }

  const fileRecord: VaultFileRecord = {
    id: fileId,
    name: cleanName,
    path: filePath,
    folderPath: normFolder,
    content: content,
    fileType,
    tags,
    hyperlinks: [],
    createdAt: timeInfo.recordedAt,
    updatedAt: timeInfo.recordedAt,
    version: 1
  };

  const saved = await saveVaultRecordWithVersion(
    userId,
    'file_system',
    fileId,
    fileRecord,
    'sana',
    `Created file '${filePath}'`
  );

  const cache = getOrCreateVaultCache(userId);
  const idx = cache.files.findIndex(f => f.id === fileId || f.path === filePath);
  if (idx >= 0) cache.files[idx] = saved as VaultFileRecord;
  else cache.files.push(saved as VaultFileRecord);

  return saved as VaultFileRecord;
}

/**
 * Re-arranges/moves files into a specific target folder.
 */
export async function arrangeVaultFiles(
  userId: string,
  fileIdsOrPaths: string[],
  targetFolderPath: string
): Promise<{ movedCount: number; targetFolderPath: string }> {
  const normTarget = normalizeVaultPath(targetFolderPath);
  const vault = await loadFullAgentVault(userId);
  let movedCount = 0;

  for (const identifier of fileIdsOrPaths) {
    const file = vault.files.find(f => f.id === identifier || f.path === identifier || f.name === identifier);
    if (file) {
      const newFilePath = normTarget === '/' ? `/${file.name}` : `${normTarget}/${file.name}`;
      const updatedFile: VaultFileRecord = {
        ...file,
        folderPath: normTarget,
        path: newFilePath,
        updatedAt: new Date().toISOString()
      };

      await saveVaultRecordWithVersion(
        userId,
        'file_system',
        file.id,
        updatedFile,
        'sana',
        `Arranged file '${file.name}' into folder '${normTarget}'`
      );
      movedCount++;
    }
  }

  return { movedCount, targetFolderPath: normTarget };
}

/**
 * Creates a hyperlink connecting files, folders, or external URLs.
 */
export async function createVaultHyperlink(
  userId: string,
  sourceType: 'file' | 'folder',
  sourceIdOrPath: string,
  title: string,
  targetType: 'file' | 'folder' | 'external',
  targetIdOrUrl: string,
  notes?: string
): Promise<VaultHyperlink> {
  const linkId = `link_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const linkObj: VaultHyperlink = {
    id: linkId,
    title,
    targetType,
    targetIdOrUrl,
    notes,
    createdAt: new Date().toISOString()
  };

  const vault = await loadFullAgentVault(userId);

  if (sourceType === 'file') {
    const file = vault.files.find(f => f.id === sourceIdOrPath || f.path === sourceIdOrPath || f.name === sourceIdOrPath);
    if (file) {
      const updatedFile = {
        ...file,
        hyperlinks: [...(file.hyperlinks || []), linkObj],
        updatedAt: new Date().toISOString()
      };
      await saveVaultRecordWithVersion(userId, 'file_system', file.id, updatedFile, 'sana', `Added hyperlink '${title}'`);
    }
  } else {
    const folder = vault.folders.find(f => f.id === sourceIdOrPath || f.path === sourceIdOrPath || f.name === sourceIdOrPath);
    if (folder) {
      const updatedFolder = {
        ...folder,
        hyperlinks: [...(folder.hyperlinks || []), linkObj],
        updatedAt: new Date().toISOString()
      };
      await saveVaultRecordWithVersion(userId, 'file_system', folder.id, updatedFolder, 'sana', `Added hyperlink '${title}'`);
    }
  }

  return linkObj;
}

/**
 * Opens and inspects a folder, returning its full contents and map.
 */
export async function accessVaultFolder(
  userId: string,
  folderPathOrId: string
): Promise<{
  folderPath: string;
  folderName: string;
  subfolders: Array<{ id: string; name: string; path: string; description?: string }>;
  files: Array<{ id: string; name: string; path: string; fileType: string; snippet: string; tags: string[] }>;
  hyperlinks: VaultHyperlink[];
}> {
  const normPath = normalizeVaultPath(folderPathOrId);
  const vault = await loadFullAgentVault(userId);

  const matchedFolder = vault.folders.find(f => f.id === folderPathOrId || f.path === normPath || f.name === folderPathOrId);
  const folderName = matchedFolder?.name || (normPath === '/' ? 'Root Workspace' : normPath.split('/').pop() || 'Folder');

  // Find subfolders under normPath
  const subfolders = vault.folders
    .filter(f => f.parentPath === normPath || (normPath !== '/' && f.path.startsWith(`${normPath}/`) && f.path.split('/').length === normPath.split('/').length + 1))
    .map(f => ({ id: f.id, name: f.name, path: f.path, description: f.description }));

  // Find files directly inside normPath
  const files = vault.files
    .filter(f => f.folderPath === normPath || (f.path.startsWith(`${normPath}/`) && f.path.substring(normPath.length + 1).indexOf('/') === -1))
    .map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      fileType: f.fileType,
      snippet: f.content.length > 200 ? `${f.content.substring(0, 200)}...` : f.content,
      tags: f.tags || []
    }));

  return {
    folderPath: normPath,
    folderName,
    subfolders,
    files,
    hyperlinks: matchedFolder?.hyperlinks || []
  };
}

/**
 * Accesses and reads a specific file content and connected links.
 */
export async function accessVaultFile(
  userId: string,
  filePathOrId: string
): Promise<{
  file: VaultFileRecord | null;
  found: boolean;
}> {
  if (!filePathOrId || typeof filePathOrId !== 'string' || filePathOrId.trim() === '') {
    return { file: null, found: false };
  }

  const normPath = normalizeVaultPath(filePathOrId);
  const cleanKey = filePathOrId.trim().toLowerCase();
  const baseName = normPath.split('/').pop()?.toLowerCase() || '';
  const vault = await loadFullAgentVault(userId);

  // 1. Direct match in virtual files
  let file = vault.files.find(f =>
    f.id === filePathOrId ||
    f.path === normPath ||
    f.name === filePathOrId ||
    f.name.toLowerCase() === baseName ||
    f.path.toLowerCase() === normPath.toLowerCase() ||
    f.id.toLowerCase() === cleanKey
  ) || null;

  if (file) {
    return { file, found: true };
  }

  // 2. Lookup in Scans (daily_scans or intermediate_scans)
  if (cleanKey.includes('scan') || normPath.includes('/daily_scans') || normPath.includes('/intermediate_scans')) {
    const scanIdTarget = baseName.replace('.json', '');
    try {
      const scanVaultRes = await retrieveSkinScanVault(userId, {
        scanType: normPath.includes('intermediate') ? 'intermediate_scan' : (normPath.includes('daily') ? 'daily_scan' : 'all'),
        scanId: scanIdTarget,
        limit: 5
      });
      if (scanVaultRes?.scans && scanVaultRes.scans.length > 0) {
        const targetScan = scanVaultRes.scans.find((s: any) =>
          (s.scanId && s.scanId.toLowerCase().includes(scanIdTarget)) ||
          (s.id && s.id.toLowerCase().includes(scanIdTarget))
        ) || scanVaultRes.scans[0];

        const synthesizedFile: VaultFileRecord = {
          id: targetScan.scanId || targetScan.id || `scan_${Date.now()}`,
          name: normPath.split('/').pop() || `${targetScan.scanId || 'scan'}.json`,
          folderPath: normPath.includes('intermediate') ? '/intermediate_scans' : '/daily_scans',
          path: normPath,
          content: JSON.stringify(targetScan, null, 2),
          fileType: 'application/json',
          tags: ['facial_scan', targetScan.scanType || 'daily_scan'],
          createdAt: targetScan.timestamp || new Date().toISOString(),
          updatedAt: targetScan.timestamp || new Date().toISOString(),
          version: 1,
          recordedAt: targetScan.timestamp || new Date().toISOString(),
          localTime: new Date().toLocaleTimeString()
        };
        return { file: synthesizedFile, found: true };
      }
    } catch (e) {
      console.warn('[accessVaultFile] Scan lookup fallback error:', e);
    }
  }

  // 3. Lookup in Documents
  const matchedDoc = vault.documents.find(d =>
    d.id === filePathOrId ||
    d.title.toLowerCase() === baseName.replace(/\.[^.]+$/, '') ||
    normPath.toLowerCase().includes(d.title.toLowerCase())
  );
  if (matchedDoc) {
    const docFile: VaultFileRecord = {
      id: matchedDoc.id,
      name: `${matchedDoc.title}.md`,
      folderPath: '/documents',
      path: normPath.startsWith('/') ? normPath : `/${normPath}`,
      content: matchedDoc.content || matchedDoc.summary || '',
      fileType: 'text/markdown',
      tags: ['document', 'vault_doc'],
      createdAt: matchedDoc.date || new Date().toISOString(),
      updatedAt: matchedDoc.date || new Date().toISOString(),
      version: 1,
      recordedAt: matchedDoc.date || new Date().toISOString(),
      localTime: new Date().toLocaleTimeString()
    };
    return { file: docFile, found: true };
  }

  // 4. Lookup in Notes
  const matchedNote = vault.notes.find(n =>
    n.id === filePathOrId ||
    n.title.toLowerCase() === baseName.replace(/\.[^.]+$/, '') ||
    normPath.toLowerCase().includes(n.title.toLowerCase())
  );
  if (matchedNote) {
    const noteFile: VaultFileRecord = {
      id: matchedNote.id,
      name: `${matchedNote.title}.txt`,
      folderPath: '/notes',
      path: normPath.startsWith('/') ? normPath : `/${normPath}`,
      content: `# ${matchedNote.title}\n\nCategory: ${matchedNote.category}\nDate: ${matchedNote.date}\nTags: ${matchedNote.tags?.join(', ') || 'none'}\n\n${matchedNote.description}`,
      fileType: 'text/plain',
      tags: matchedNote.tags || ['note'],
      createdAt: matchedNote.date || new Date().toISOString(),
      updatedAt: matchedNote.date || new Date().toISOString(),
      version: 1,
      recordedAt: matchedNote.date || new Date().toISOString(),
      localTime: new Date().toLocaleTimeString()
    };
    return { file: noteFile, found: true };
  }

  // 5. Lookup in Goals (e.g. Skin_Goals_Log.txt)
  if (cleanKey.includes('goal') && vault.goals && vault.goals.length > 0) {
    const goalsSummary = vault.goals.map((g, idx) =>
      `Goal #${idx + 1}: ${g.title}\nStatus: ${g.status}\nTarget Date: ${g.targetDate || 'Ongoing'}\nDescription: ${g.description || ''}\nMetrics:\n${(g.metrics || []).map(m => `  - ${m.name}: Baseline ${m.baseline ?? '-'}, Current ${m.current ?? '-'}, Target ${m.target ?? '-'}`).join('\n')}`
    ).join('\n\n---\n\n');

    const goalsFile: VaultFileRecord = {
      id: 'skin_goals_log',
      name: normPath.split('/').pop() || 'Skin_Goals_Log.txt',
      folderPath: '/Skin_Health_Archive',
      path: normPath,
      content: `# Skin Health Goals Log\n\n${goalsSummary}`,
      fileType: 'text/plain',
      tags: ['goals', 'skin_health_archive'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      recordedAt: new Date().toISOString(),
      localTime: new Date().toLocaleTimeString()
    };
    return { file: goalsFile, found: true };
  }

  return {
    file: null,
    found: false
  };
}

/**
 * Builds the complete directory tree index map for prompt caching in the system prompt.
 */
export async function getVaultFileSystemIndex(userId: string): Promise<string> {
  const vault = await loadFullAgentVault(userId);

  if ((!vault.folders || vault.folders.length === 0) && (!vault.files || vault.files.length === 0)) {
    return `ROOT DIRECTORY (/)\n  └── (No files or folders created yet. Use \`create_folder\` or \`create_file\` to structure your workspace.)`;
  }

  let indexStr = `ROOT DIRECTORY (/)\n`;

  // Folders map
  const foldersByPath: Record<string, VaultFolderRecord> = {};
  vault.folders.forEach(f => { foldersByPath[f.path] = f; });

  const filesByFolder: Record<string, VaultFileRecord[]> = {};
  vault.files.forEach(f => {
    const fPath = f.folderPath || '/';
    if (!filesByFolder[fPath]) filesByFolder[fPath] = [];
    filesByFolder[fPath].push(f);
  });

  // Render root files
  if (filesByFolder['/'] && filesByFolder['/'].length > 0) {
    filesByFolder['/'].forEach(f => {
      indexStr += `  ├── [FILE] ${f.name} (${f.fileType}) - Path: ${f.path}\n`;
    });
  }

  // Render folders
  const folderPaths = Object.keys(foldersByPath).sort();
  for (const fPath of folderPaths) {
    const folder = foldersByPath[fPath];
    indexStr += `  ├── [FOLDER] ${folder.name}/ - Path: ${folder.path} ${folder.description ? `(${folder.description})` : ''}\n`;

    const folderFiles = filesByFolder[fPath] || [];
    folderFiles.forEach(f => {
      indexStr += `  │    ├── [FILE] ${f.name} (${f.fileType}) - Path: ${f.path}\n`;
    });

    if (folder.hyperlinks && folder.hyperlinks.length > 0) {
      folder.hyperlinks.forEach(l => {
        indexStr += `  │    └── [LINK] ${l.title} -> ${l.targetType}:${l.targetIdOrUrl}\n`;
      });
    }
  }

  return indexStr.trim();
}

/**
 * Saves a facial skin scan report into virtual folders in the Agent Vault (/daily_scans or /intermediate_scans).
 */
export async function saveSkinScanToVault(
  userId: string,
  scanData: {
    scanId: string;
    scanType: 'daily_scan' | 'intermediate_scan' | 'onboarding_scan';
    timestamp?: string;
    rawMetrics?: any;
    scoreInfo?: any;
    annotatedRegions?: any[];
    s2sStepLogs?: string[];
    rawResponseLog?: string;
    rawPerfectCorpOutput?: any;
    capturedImage?: string;
    concernImages?: Record<string, any>;
  }
): Promise<VaultFileRecord> {
  const folderName = scanData.scanType === 'intermediate_scan' ? 'intermediate_scans' : (scanData.scanType === 'onboarding_scan' ? 'onboarding_scans' : 'daily_scans');
  const folderPath = `/${folderName}`;
  
  // Ensure virtual folder exists
  await createVaultFolder(userId, folderName, '/', `Folder for storing ${scanData.scanType} reports and concern images`);

  const fileName = `${scanData.scanId}.json`;
  const fileContent = JSON.stringify(scanData, null, 2);

  return await createVaultFile(
    userId,
    fileName,
    fileContent,
    folderPath,
    'application/json',
    [scanData.scanType, 'facial_scan', 'skin_report']
  );
}

/**
 * Unified Agent Tool Engine for Skin Scan Retrieval.
 * Allows retrieving Daily Scans or Intermediate Scans, raw report data, concern images/masks,
 * and time-series progress trends in ONE SINGLE TOOL CALL.
 */
export async function retrieveSkinScanVault(
  userId: string,
  params: {
    scanType?: 'daily_scan' | 'intermediate_scan' | 'all';
    scanId?: string;
    imageType?: 'original' | 'wrinkles' | 'acne' | 'pores' | 'dark_circles' | 'redness' | 'spots' | 'texture' | 'moisture' | 'firmness' | 'all_masks' | 'none';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    includeRawApiOutput?: boolean;
    includeTrendGraph?: boolean;
  }
) {
  const fullVault = await loadFullAgentVault(userId);
  const scanTypeFilter = params.scanType || 'all';
  const limitVal = params.limit || 5;

  // Search vault files in /daily_scans and /intermediate_scans
  let scanFiles = fullVault.files.filter(f => {
    if (scanTypeFilter === 'daily_scan') return f.folderPath === '/daily_scans' || f.tags.includes('daily_scan');
    if (scanTypeFilter === 'intermediate_scan') return f.folderPath === '/intermediate_scans' || f.tags.includes('intermediate_scan');
    return f.folderPath === '/daily_scans' || f.folderPath === '/intermediate_scans' || f.tags.includes('facial_scan');
  });

  // Filter by scanId if provided
  if (params.scanId) {
    scanFiles = scanFiles.filter(f => f.name.includes(params.scanId!) || f.id.includes(params.scanId!));
  }

  // Parse JSON file contents into scan objects
  const parsedScans: any[] = [];
  for (const f of scanFiles) {
    try {
      const parsed = JSON.parse(f.content);
      parsedScans.push(parsed);
    } catch {
      parsedScans.push({
        scanId: f.name.replace('.json', ''),
        folderPath: f.folderPath,
        content: f.content
      });
    }
  }

  // Fallback to Firestore if vault files are empty
  if (parsedScans.length === 0 && db) {
    try {
      const dbSnap = await getDocs(query(collection(db, 'facial_scans'), where('userId', '==', userId), orderBy('timestamp', 'desc'), limitQuery(limitVal)));
      dbSnap.docs.forEach(doc => {
        const d = doc.data();
        if (scanTypeFilter === 'all' || d.scanType === scanTypeFilter) {
          parsedScans.push(d);
        }
      });
    } catch (e) {
      console.warn("Firestore scan query fallback error:", e);
    }
  }

  // Sort scans by timestamp desc and limit
  parsedScans.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  const selectedScans = parsedScans.slice(0, limitVal);

  // Extract requested image / mask URLs for selected imageType
  const imageResults: Record<string, any> = {};
  if (params.imageType && params.imageType !== 'none') {
    selectedScans.forEach(scan => {
      const targetConcern = params.imageType;
      const scanKey = scan.scanId || scan.id || 'scan';
      if (targetConcern === 'all_masks') {
        imageResults[scanKey] = scan.concernImages || scan.scoreInfo?.concerns || scan.annotatedRegions;
      } else if (targetConcern === 'original') {
        imageResults[scanKey] = scan.capturedImage || scan.imageRef || 'Original facial scan capture';
      } else if (scan.concernImages && scan.concernImages[targetConcern!]) {
        imageResults[scanKey] = scan.concernImages[targetConcern!];
      } else if (scan.annotatedRegions) {
        const region = scan.annotatedRegions.find((r: any) => r.regionName?.includes(targetConcern!) || r.label?.toLowerCase().includes(targetConcern!));
        imageResults[scanKey] = region || scan.annotatedRegions;
      }
    });
  }

  // Compute time-series trend & progress deltas
  let trendGraph = null;
  if (params.includeTrendGraph !== false && selectedScans.length > 0) {
    const recentScores = selectedScans.map(s => ({
      scanId: s.scanId || s.id,
      scanType: s.scanType || 'daily_scan',
      date: s.timestamp ? new Date(s.timestamp).toISOString().split('T')[0] : 'today',
      hydration: s.rawMetrics?.moistureScore || s.hydrationScore || 85,
      barrier: s.rawMetrics?.barrierRednessScore || s.barrierScore || 88,
      clarity: s.rawMetrics?.acneBlemishScore || s.clarityScore || 90,
      skinAge: s.rawMetrics?.skinAge || 28,
      overallScore: s.rawMetrics?.overallScore || s.scoreInfo?.all || 87
    }));

    const latest = recentScores[0];
    const previous = recentScores.length > 1 ? recentScores[recentScores.length - 1] : null;

    trendGraph = {
      points: recentScores,
      improvementDeltas: previous ? {
        hydrationChange: `${latest.hydration >= previous.hydration ? '+' : ''}${latest.hydration - previous.hydration}%`,
        barrierChange: `${latest.barrier >= previous.barrier ? '+' : ''}${latest.barrier - previous.barrier}%`,
        clarityChange: `${latest.clarity >= previous.clarity ? '+' : ''}${latest.clarity - previous.clarity}%`,
        skinAgeTrend: latest.skinAge <= previous.skinAge ? 'Rejuvenated / Stable' : 'Slight stress elevation'
      } : { note: 'Initial baseline scan established.' }
    };
  }

  return {
    success: true,
    filterApplied: {
      scanType: scanTypeFilter,
      scanId: params.scanId || 'all',
      imageType: params.imageType || 'none'
    },
    retrievedCount: selectedScans.length,
    scans: selectedScans.map(s => params.includeRawApiOutput !== false ? s : {
      scanId: s.scanId,
      scanType: s.scanType,
      timestamp: s.timestamp,
      rawMetrics: s.rawMetrics
    }),
    imagesAndMasks: Object.keys(imageResults).length > 0 ? imageResults : undefined,
    trendGraphProgress: trendGraph
  };
}
