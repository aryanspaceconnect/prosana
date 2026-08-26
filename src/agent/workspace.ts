import { AgentContext, MemoryNeeds, ActionProposal, StateEvent } from './types.js';
import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { SANA_APP_MAP } from './soul.js';
import { loadAgentVault, saveAgentVaultNote } from './agentVault.js';
import { AgentMemoryService } from '../services/AgentMemoryService.js';

// In-memory fallback workspace store per user
const memoryStore: Record<string, {
  profile?: any;
  scans?: any[];
  incidents?: any[];
  events?: any[];
  settings?: Record<string, any>;
  settingsHistory?: Record<string, any[]>;
  stateEvents?: StateEvent[];
}> = {};

function getOrCreateUserMemoryStore(userId: string) {
  if (!memoryStore[userId]) {
    memoryStore[userId] = {
      profile: {
        skinType: 'Combination / Sensitive',
        primaryConcerns: ['Redness', 'Dehydration', 'Active Acne'],
        barrierStatus: 'Slightly Compromised',
        allergies: ['Fragrance', 'High Ethanol'],
        currentRoutine: {
          AM: ['Gentle Cleanser', 'Hyaluronic Serum', 'Ceramide Cream', 'SPF 50'],
          PM: ['Oil Cleanser', 'Gentle Cleanser', '0.025% Tretinoin (3x/wk)', 'Lipid Barrier Balm']
        }
      },
      scans: [
        {
          id: 'scan_001',
          date: new Date().toISOString(),
          hydrationScore: 68,
          barrierScore: 74,
          clarityScore: 82,
          rednessLevel: 'Moderate',
          notes: 'Mild cheek erythema detected near nasal fold.'
        }
      ],
      incidents: [
        {
          id: 'inc_001',
          title: 'Stinging after BHA exfoliant',
          date: new Date(Date.now() - 86400000 * 2).toISOString(),
          severity: 'moderate',
          triggers: ['Salicylic Acid 2%', 'Hot Shower'],
          status: 'resolving'
        }
      ],
      events: [
        {
          id: 'evt_001',
          title: 'PM Barrier Recovery Protocol',
          date: new Date().toISOString().split('T')[0],
          time: '20:30',
          category: 'routine',
          completed: false
        }
      ],
      settings: {
        aiSensitivity: 'high',
        uvAlerts: true,
        routineReminders: true
      },
      settingsHistory: {
        aiSensitivity: [
          { timestamp: new Date(Date.now() - 86400000 * 7).toISOString(), value: 'standard' },
          { timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), value: 'high' }
        ]
      },
      stateEvents: []
    };
  }
  return memoryStore[userId];
}

export async function loadContextForAgent(userId: string, sessionId: string, needs?: MemoryNeeds): Promise<AgentContext> {
  const localStore = getOrCreateUserMemoryStore(userId);
  const vaultData = await loadAgentVault(userId);
  const contextItems = await AgentMemoryService.getAllContextItems(userId);

  const context: AgentContext = {
    userId,
    sessionId,
    agentVault: {
      ...vaultData,
      isolatedContextItems: contextItems
    }
  };

  // If no memoryNeeds specified, default to lean profile + appMap
  const profileNeeded = needs?.profile ?? true;
  const scanNeeded = needs?.latestScan ?? false;
  const incidentsDays = needs?.incidentsDays;
  const settingKeys = needs?.settingHistory;
  const appMapNeeded = needs?.appMap ?? false;

  try {
    if (db) {
      if (profileNeeded) {
        const userDocRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userDocRef);
        context.profile = userSnap.exists() ? userSnap.data() : localStore.profile;
      }

      if (scanNeeded) {
        const scansRef = collection(db, 'users', userId, 'scans');
        const q = query(scansRef, orderBy('date', 'desc'), limit(1));
        const scanSnap = await getDocs(q);
        if (!scanSnap.empty) {
          context.latestScan = scanSnap.docs[0].data();
        } else {
          context.latestScan = localStore.scans?.[0];
        }
      }
    } else {
      if (profileNeeded) context.profile = localStore.profile;
      if (scanNeeded) context.latestScan = localStore.scans?.[0];
    }
  } catch (err) {
    console.warn('Firestore loadContext fallback to memory store:', err);
    if (profileNeeded) context.profile = localStore.profile;
    if (scanNeeded) context.latestScan = localStore.scans?.[0];
  }

  if (incidentsDays !== undefined && incidentsDays > 0) {
    const cutoff = Date.now() - incidentsDays * 86400000;
    context.incidents = (localStore.incidents || []).filter(inc => new Date(inc.date).getTime() >= cutoff);
  }

  if (settingKeys && settingKeys.length > 0) {
    context.settingsHistory = {};
    for (const key of settingKeys) {
      context.settingsHistory[key] = localStore.settingsHistory?.[key] || [
        { timestamp: new Date().toISOString(), value: localStore.settings?.[key] }
      ];
    }
  }

  if (appMapNeeded) {
    context.appMap = SANA_APP_MAP;
  }

  return context;
}

export async function executeActionProposal(userId: string, proposal: ActionProposal): Promise<{ success: boolean; stateEvent: StateEvent; message: string }> {
  const localStore = getOrCreateUserMemoryStore(userId);
  const eventId = `se_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  let target = '';
  let previousValue: any = null;
  let newValue: any = null;

  switch (proposal.actionType) {
    case 'UPDATE_SETTING': {
      const key = String(proposal.payload.key);
      const value = proposal.payload.value;
      target = `settings/${key}`;
      previousValue = localStore.settings?.[key] ?? null;
      newValue = value;

      localStore.settings = localStore.settings || {};
      localStore.settings[key] = value;

      localStore.settingsHistory = localStore.settingsHistory || {};
      localStore.settingsHistory[key] = localStore.settingsHistory[key] || [];
      localStore.settingsHistory[key].push({ timestamp, value });
      break;
    }

    case 'CREATE_EVENT': {
      target = `events/${proposal.payload.title}`;
      previousValue = null;
      newValue = proposal.payload;

      localStore.events = localStore.events || [];
      localStore.events.push({
        id: `evt_${Date.now()}`,
        ...proposal.payload
      });

      // Persist directly to Firestore calendar_events collection so it immediately appears in Calendar UI
      try {
        const safeUid = userId || 'guest_user';
        if (db) {
          const calendarRef = collection(db, "calendar_events");
          await addDoc(calendarRef, {
            userId: safeUid,
            title: proposal.payload.title,
            date: proposal.payload.date || new Date().toISOString().split('T')[0],
            time: proposal.payload.time || '20:00',
            category: proposal.payload.category || 'routine',
            notes: proposal.payload.notes || '',
            reminder: proposal.payload.reminder ?? true,
            completed: false,
            createdAt: new Date().toISOString()
          });
        }
      } catch (calErr) {
        console.warn("Error persisting event to Firestore calendar_events:", calErr);
      }
      break;
    }

    case 'LOG_INCIDENT': {
      target = `incidents/${proposal.payload.title}`;
      previousValue = null;
      newValue = proposal.payload;

      localStore.incidents = localStore.incidents || [];
      localStore.incidents.push({
        id: `inc_${Date.now()}`,
        ...proposal.payload
      });
      break;
    }

    case 'GENERATE_PROTOCOL': {
      target = `profile/routine`;
      previousValue = localStore.profile?.currentRoutine ?? null;
      newValue = proposal.payload;

      localStore.profile = localStore.profile || {};
      localStore.profile.currentProtocol = proposal.payload;
      break;
    }

    default:
      throw new Error(`Unsupported actionType: ${proposal.actionType}`);
  }

  const stateEvent: StateEvent = {
    id: eventId,
    userId,
    timestamp,
    actionType: proposal.actionType,
    target,
    previousValue,
    newValue,
    source: 'SANA_AGENT_APPROVAL',
    proposalId: proposal.actionId
  };

  localStore.stateEvents = localStore.stateEvents || [];
  localStore.stateEvents.push(stateEvent);

  // Attempt sync write to Firestore if available
  try {
    if (db) {
      const eventRef = doc(db, 'users', userId, 'state_events', eventId);
      await setDoc(eventRef, stateEvent);

      if (proposal.actionType === 'UPDATE_SETTING') {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, { settings: localStore.settings }, { merge: true });
      }
    }
  } catch (err) {
    console.warn('Firestore state_event write warning:', err);
  }

  return {
    success: true,
    stateEvent,
    message: `Action '${proposal.title}' executed successfully and recorded in audit log.`
  };
}

export async function saveMemoryNoteDirectly(userId: string, payload: { title: string; description?: string; category?: string; date?: string }) {
  const note = await saveAgentVaultNote(userId, {
    title: payload.title,
    description: payload.description || payload.title,
    category: payload.category || 'observation',
    date: payload.date || new Date().toISOString()
  });

  return note;
}
