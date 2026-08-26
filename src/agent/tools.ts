import { z } from 'zod';
import { ToolDefinition, UniversalQuery, AgentContext, ActionProposal } from './types.js';
import { SANA_APP_MAP } from './soul.js';
import { saveMemoryNoteDirectly } from './workspace.js';
import { getSessionNotepad, updateSessionNotepad } from './sessionNotepad.js';
import { executeWebSearch, executeImageSearch } from './searchService.js';
import { performExaSearch, performExaContents, performExaAnswer } from './exaSearchService.js';
import {
  saveAgentVaultDocument,
  searchAgentVault,
  parseDocumentContent,
  vaultSearch,
  saveVaultIncident,
  saveVaultEvent,
  saveVaultGoal,
  saveVaultUserData,
  saveVaultSkinComposition,
  getVaultHistory,
  toAbsoluteTime,
  createVaultFolder,
  createVaultFile,
  arrangeVaultFiles,
  createVaultHyperlink,
  accessVaultFolder,
  accessVaultFile,
  getVaultFileSystemIndex,
  retrieveSkinScanVault
} from './agentVault.js';

// Universal Search Tool
const flexArray = (fallback: string[] = []) => z.preprocess((val) => {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string' || typeof val === 'number') {
    const str = String(val).trim();
    if (str.startsWith('[')) {
      try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
    }
    return str.split(',').map(s => s.trim()).filter(Boolean);
  }
  return fallback;
}, z.array(z.string()).optional().default(fallback));

const flexIncidentType = z.preprocess((val) => {
  if (typeof val === 'string') {
    const clean = val.toLowerCase().trim();
    if (['reaction', 'breakout', 'flare', 'allergy', 'other'].includes(clean)) return clean;
    if (clean.includes('breakout') || clean.includes('acne') || clean.includes('pimple') || clean.includes('bump')) return 'breakout';
    if (clean.includes('react') || clean.includes('irritat') || clean.includes('stinging') || clean.includes('red') || clean.includes('burn')) return 'reaction';
    if (clean.includes('allerg')) return 'allergy';
    if (clean.includes('flare')) return 'flare';
  }
  return 'flare';
}, z.enum(['reaction', 'breakout', 'flare', 'allergy', 'other']).optional().default('flare'));

const flexSeverity = z.preprocess((val) => {
  if (typeof val === 'string') {
    const clean = val.toLowerCase().trim();
    if (['mild', 'moderate', 'severe'].includes(clean)) return clean;
    if (clean.includes('high') || clean.includes('extreme') || clean.includes('bad') || clean.includes('severe')) return 'severe';
    if (clean.includes('medium') || clean.includes('mod')) return 'moderate';
  }
  return 'mild';
}, z.enum(['mild', 'moderate', 'severe']).optional().default('mild'));

export const universalSearchToolSchema = z.object({
  queries: z.array(z.object({
    type: z.string().optional().default('profile'),
    query: z.string().optional(),
    daysLimit: z.union([z.number(), z.string()]).optional(),
    settingKey: z.string().optional(),
  })).optional().default([{ type: 'profile' }])
});

export const universalSearchTool: ToolDefinition = {
  name: 'universal_search',
  description: 'Search across all SANA workspace data layers in parallel: facial scans, incident logs, scheduled regimen events, setting history, user profile, insights, or UI help.',
  parameters: universalSearchToolSchema,
  execute: async (args: z.infer<typeof universalSearchToolSchema>, context: AgentContext) => {
    const results: Record<string, any> = {};

    for (const q of args.queries) {
      switch (q.type) {
        case 'profile':
          results.profile = context.profile || {
            skinType: 'Combination / Sensitive',
            primaryConcerns: ['Redness', 'Dehydration', 'Active Acne'],
            barrierStatus: 'Slightly Compromised',
            allergies: ['Fragrance', 'High Ethanol'],
            currentRoutine: {
              AM: ['Gentle Cleanser', 'Hyaluronic Serum', 'Ceramide Cream', 'SPF 50'],
              PM: ['Oil Cleanser', 'Gentle Cleanser', '0.025% Tretinoin (3x/wk)', 'Lipid Barrier Balm']
            }
          };
          break;

        case 'scans':
          results.scans = (context.latestScan ? [context.latestScan] : [
            {
              id: 'scan_recent_01',
              date: new Date().toISOString(),
              hydrationScore: 68,
              barrierScore: 74,
              clarityScore: 82,
              rednessLevel: 'Moderate',
              notes: 'Mild cheek erythema detected near nasal fold.'
            }
          ]);
          break;

        case 'incidents':
          results.incidents = context.incidents || [
            {
              id: 'inc_101',
              title: 'Stinging after BHA exfoliant',
              date: new Date(Date.now() - 86400000 * 2).toISOString(),
              severity: 'moderate',
              triggers: ['Salicylic Acid 2%', 'Hot Shower'],
              status: 'resolving'
            }
          ];
          break;

        case 'events':
          results.events = context.events || [
            {
              id: 'evt_201',
              title: 'PM Barrier Recovery Protocol',
              date: new Date().toISOString().split('T')[0],
              category: 'routine',
              completed: false
            }
          ];
          break;

        case 'settings_history':
          if (q.settingKey && context.settingsHistory?.[q.settingKey]) {
            results[`settings_history_${q.settingKey}`] = context.settingsHistory[q.settingKey];
          } else {
            results.settings_history = context.settingsHistory || {
              aiSensitivity: [
                { timestamp: new Date(Date.now() - 86400000 * 7).toISOString(), value: 'standard' },
                { timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), value: 'high' }
              ],
              uvAlerts: [
                { timestamp: new Date(Date.now() - 86400000 * 14).toISOString(), value: true }
              ]
            };
          }
          break;

        case 'insights':
          results.insights = [
            {
              category: 'Ingredient Interaction',
              finding: 'Combining BHA and Retinoid on consecutive nights elevated skin irritation index by 35%.',
              recommendation: 'Alternate BHA and Retinoid with at least 48 hours of barrier recovery in between.'
            }
          ];
          break;

        case 'app_help':
          results.app_help = {
            appMap: SANA_APP_MAP,
            query: q.query,
            guidance: 'SANA features Home Dashboard, AI Agent Chat, Regimen Calendar, and Facial Scan Modal.'
          };
          break;
      }
    }

    return results;
  }
};

// Propose Update Setting Tool
export const proposeUpdateSettingSchema = z.object({
  key: z.string(),
  value: z.any(),
  reason: z.string().optional()
});

export const proposeUpdateSettingTool: ToolDefinition = {
  name: 'propose_update_setting',
  description: 'Propose an update to user preference or application setting (e.g. UV alert threshold, AI response sensitivity, skin concern emphasis). Returns an actionProposal requiring user approval.',
  parameters: proposeUpdateSettingSchema,
  execute: async (args: z.infer<typeof proposeUpdateSettingSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_set_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Update Preference: ${args.key}`,
        description: `Change setting '${args.key}' to '${JSON.stringify(args.value)}'. ${args.reason ? `Reason: ${args.reason}` : ''}`,
        actionType: 'UPDATE_SETTING',
        payload: {
          key: args.key,
          value: args.value,
          reason: args.reason || 'Requested preference optimization'
        },
        riskLevel: 'low'
      }
    };
  }
};

// Propose Create Event Tool
export const proposeCreateEventSchema = z.object({
  title: z.string().describe('Title of the event e.g. "PM Barrier Restoration Routine" or "Post-Peel Check"'),
  date: z.preprocess((val) => {
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const now = new Date();
      if (trimmed.toLowerCase() === 'today') return now.toISOString().split('T')[0];
      if (trimmed.toLowerCase() === 'tomorrow') {
        const tmrw = new Date(now.getTime() + 86400000);
        return tmrw.toISOString().split('T')[0];
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().split('T')[0];
      }
    }
    return new Date().toISOString().split('T')[0];
  }, z.string().describe('Target date YYYY-MM-DD (e.g. 2026-08-15) or relative terms like "today" or "tomorrow"')),
  time: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim()) return val.trim();
    return '20:00';
  }, z.string().optional().default('20:00')).describe('Scheduled time e.g. "20:30" or "08:00 AM"'),
  category: z.preprocess((val) => {
    if (typeof val === 'string') {
      const clean = val.toLowerCase().trim();
      if (['routine', 'scan', 'treatment', 'habit', 'wellness'].includes(clean)) return clean;
    }
    return 'routine';
  }, z.enum(['routine', 'scan', 'treatment', 'habit', 'wellness']).optional().default('routine')).describe('Category classification for the calendar event'),
  notes: z.preprocess((val) => typeof val === 'string' ? val : undefined, z.string().optional()).describe('Detailed instructions, active products, reminders, or protocol steps'),
  reminder: z.preprocess((val) => val === true || val === 'true' || val === undefined, z.boolean().optional().default(true)).describe('Whether an active reminder alert should be set')
});

export const proposeCreateEventTool: ToolDefinition = {
  name: 'propose_create_event',
  description: 'Propose scheduling a skincare routine, facial scan, treatment session, or reminder in the Regimen Calendar. Supports picking dates, custom times, notes, reminders, and categories.',
  parameters: proposeCreateEventSchema,
  execute: async (args: z.infer<typeof proposeCreateEventSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Schedule Calendar Event: ${args.title}`,
        description: `Schedule '${args.title}' (${args.category.toUpperCase()}) on ${args.date} at ${args.time || '20:00'}. ${args.notes ? `Notes: ${args.notes}` : ''}`,
        actionType: 'CREATE_EVENT',
        payload: {
          title: args.title,
          date: args.date,
          time: args.time || '20:00',
          category: args.category,
          notes: args.notes || '',
          reminder: args.reminder ?? true,
          completed: false
        },
        riskLevel: 'low'
      }
    };
  }
};

// Propose Log Incident Tool
export const proposeLogIncidentSchema = z.object({
  title: z.preprocess((val) => val ? String(val) : 'Skin Incident', z.string()),
  severity: flexSeverity,
  triggers: flexArray([]),
  description: z.preprocess((val) => val ? String(val) : undefined, z.string().optional())
});

export const proposeLogIncidentTool: ToolDefinition = {
  name: 'propose_log_incident',
  description: 'Propose logging a skin reaction or flare-up incident to track causes and recovery progress over time. Returns an actionProposal requiring user approval.',
  parameters: proposeLogIncidentSchema,
  execute: async (args: z.infer<typeof proposeLogIncidentSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Log Reaction Incident: ${args.title}`,
        description: `Log skin incident '${args.title}' with severity '${args.severity.toUpperCase()}'. Triggers: ${args.triggers?.join(', ') || 'None specified'}.`,
        actionType: 'LOG_INCIDENT',
        payload: {
          title: args.title,
          severity: args.severity,
          triggers: args.triggers || [],
          description: args.description || '',
          timestamp: new Date().toISOString(),
          status: 'active'
        },
        riskLevel: args.severity === 'severe' ? 'medium' : 'low'
      }
    };
  }
};

// Propose Generate Protocol Tool
export const proposeGenerateProtocolSchema = z.object({
  title: z.string(),
  steps: z.array(z.object({
    stepNumber: z.number(),
    timeOfDay: z.enum(['AM', 'PM']),
    productOrAction: z.string(),
    notes: z.string().optional()
  }))
});

export const proposeGenerateProtocolTool: ToolDefinition = {
  name: 'propose_generate_protocol',
  description: 'Propose updating or adding a structured multi-step skincare regimen protocol. Returns an actionProposal requiring user approval.',
  parameters: proposeGenerateProtocolSchema,
  execute: async (args: z.infer<typeof proposeGenerateProtocolSchema>): Promise<{ proposal: ActionProposal }> => {
    const actionId = `prop_proto_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    return {
      proposal: {
        actionId,
        title: `Apply Skincare Protocol: ${args.title}`,
        description: `Adopt ${args.steps.length}-step skin protocol '${args.title}' targeting barrier repair and routine clarity.`,
        actionType: 'GENERATE_PROTOCOL',
        payload: {
          title: args.title,
          steps: args.steps,
          createdAt: new Date().toISOString()
        },
        riskLevel: 'medium'
      }
    };
  }
};

// Save Memory Note Tool (Direct memory writing - no approval card needed)
export const saveMemoryNoteSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  incidentDate: z.string().optional()
});

export const saveMemoryNoteTool: ToolDefinition = {
  name: 'save_memory_note',
  description: 'Directly save an observation, symptom, pimple/flare-up incident, or skin memory note into user isolated Agent Memory Vault. DOES NOT require action approval cards.',
  parameters: saveMemoryNoteSchema,
  execute: async (args: z.infer<typeof saveMemoryNoteSchema>, context: AgentContext) => {
    const record = await saveMemoryNoteDirectly(context.userId, {
      title: args.title,
      description: args.description || args.title,
      category: args.category || 'incident',
      date: args.incidentDate || new Date().toISOString()
    });
    return {
      success: true,
      message: `Memory note '${args.title}' was directly saved into user skin memory vault.`,
      savedRecord: record
    };
  }
};

// Ingest Document into Agent Vault
export const ingestDocumentSchema = z.object({
  filename: z.string(),
  content: z.string(),
  fileType: z.string().optional()
});

export const ingestDocumentTool: ToolDefinition = {
  name: 'ingest_document_to_vault',
  description: 'Parse and index an uploaded PDF, document, routine guide, or lab report text directly into the user isolated Agent Memory Vault for future recall.',
  parameters: ingestDocumentSchema,
  execute: async (args: z.infer<typeof ingestDocumentSchema>, context: AgentContext) => {
    const parsed = parseDocumentContent(args.filename, args.content);
    const savedDoc = await saveAgentVaultDocument(context.userId, {
      title: parsed.title,
      content: parsed.content,
      summary: parsed.summary,
      fileType: args.fileType || 'text/plain'
    });
    return {
      success: true,
      message: `Document '${args.filename}' successfully parsed and indexed in user's isolated Agent Vault.`,
      documentId: savedDoc.id,
      summary: savedDoc.summary
    };
  }
};

// Search Agent Memory Vault
export const searchAgentVaultSchema = z.object({
  query: z.string()
});

export const searchAgentVaultTool: ToolDefinition = {
  name: 'search_agent_vault',
  description: 'Query the user isolated Agent Memory Vault for past observations, skin memory notes, or uploaded documents.',
  parameters: searchAgentVaultSchema,
  execute: async (args: z.infer<typeof searchAgentVaultSchema>, context: AgentContext) => {
    const results = await searchAgentVault(context.userId, args.query);
    return {
      success: true,
      query: args.query,
      results
    };
  }
};

// Multi-Scope Advanced Vault Search Tool
export const vaultSearchSchema = z.object({
  scope: z.enum(['sessions', 'incidents', 'events', 'goals', 'skin_profile', 'user_data', 'notes', 'documents', 'all']).optional().default('all'),
  mode: z.enum(['keyword', 'vector', 'auto']).optional().default('auto'),
  query: z.string(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.number().optional().default(10)
});

export const vaultSearchTool: ToolDefinition = {
  name: 'vault_search',
  description: 'Multi-scope, date-filtered search across Sana Agent Vault: conversation sessions, flare/reaction incidents, scheduled events, skin goals, skin composition, user identity, notes, or uploaded documents.',
  parameters: vaultSearchSchema,
  execute: async (args: z.infer<typeof vaultSearchSchema>, context: AgentContext) => {
    const results = await vaultSearch(context.userId, {
      scope: args.scope,
      mode: args.mode,
      query: args.query,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      limit: args.limit
    });
    return {
      success: true,
      query: args.query,
      scope: args.scope,
      results
    };
  }
};

// Save Vault Incident Tool
export const saveVaultIncidentSchema = z.object({
  title: z.preprocess((val) => val ? String(val) : 'Skin Incident', z.string().default('Skin Incident')),
  occurredAt: z.preprocess((val) => val ? String(val) : undefined, z.string().optional()),
  type: flexIncidentType,
  severity: flexSeverity,
  bodyAreas: flexArray(['face']),
  description: z.preprocess((val) => val ? String(val) : undefined, z.string().optional()),
  suspectedTriggers: flexArray([]),
  relatedProducts: flexArray([]),
  relatedIngredients: flexArray([]),
  notes: z.preprocess((val) => val ? String(val) : undefined, z.string().optional())
});

export const saveVaultIncidentTool: ToolDefinition = {
  name: 'save_vault_incident',
  description: 'Directly record a skin reaction, flare-up, breakout, or allergy incident into Vault long-term memory. Automatically converts relative time expressions to absolute timestamps.',
  parameters: saveVaultIncidentSchema,
  execute: async (args: z.infer<typeof saveVaultIncidentSchema>, context: AgentContext) => {
    const saved = await saveVaultIncident(context.userId, {
      ...args,
      title: args.title || 'Skin Incident'
    }, 'sana');
    return {
      success: true,
      message: `Incident '${saved.title}' logged in Vault with absolute time (${saved.occurredAtDate}).`,
      incident: saved
    };
  }
};

// Save Vault Event Tool
export const saveVaultEventSchema = z.object({
  title: z.string(),
  scheduledAt: z.string().optional(), // Absolute or relative (e.g. 'tomorrow', '2026-08-10')
  category: z.string().optional().default('routine'),
  preparationProtocolId: z.string().optional(),
  outcomeNotes: z.string().optional()
});

export const saveVaultEventTool: ToolDefinition = {
  name: 'save_vault_event',
  description: 'Record a calendar regimen event or milestone in Vault with state machine status tracking (upcoming, today, completed, missed).',
  parameters: saveVaultEventSchema,
  execute: async (args: z.infer<typeof saveVaultEventSchema>, context: AgentContext) => {
    const saved = await saveVaultEvent(context.userId, args, 'sana');
    return {
      success: true,
      message: `Event '${saved.title}' created in Vault (status: ${saved.status}, date: ${saved.scheduledAtDate}).`,
      event: saved
    };
  }
};

// Save Vault Goal Tool
export const saveVaultGoalSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  targetDate: z.string().optional(),
  metrics: z.array(z.object({
    name: z.string(),
    baseline: z.union([z.string(), z.number()]).optional(),
    current: z.union([z.string(), z.number()]).optional(),
    target: z.union([z.string(), z.number()]).optional()
  })).optional().default([]),
  status: z.enum(['active', 'achieved', 'abandoned', 'paused']).optional().default('active')
});

export const saveVaultGoalTool: ToolDefinition = {
  name: 'save_vault_goal',
  description: 'Create or update long-term skin health goals with tracked progress metrics and target dates.',
  parameters: saveVaultGoalSchema,
  execute: async (args: z.infer<typeof saveVaultGoalSchema>, context: AgentContext) => {
    const saved = await saveVaultGoal(context.userId, args, 'sana');
    return {
      success: true,
      message: `Goal '${saved.title}' saved in Vault.`,
      goal: saved
    };
  }
};

// Save User Identity Data Tool
export const saveUserIdentitySchema = z.object({
  fullName: z.string().optional().describe('Full name of the user (e.g. Aryan)'),
  preferredName: z.string().optional().describe('Preferred name or nickname (e.g. Ray)'),
  ageRange: z.string().optional().describe('Age or age bracket (e.g. 25-30)'),
  sexOrHormonalContext: z.string().optional().describe('Hormonal context or gender identity'),
  locationOrClimate: z.string().optional().describe('User city, state, country or climate (e.g. San Francisco, California / Humid Continental)'),
  occupationOrLifestyle: z.string().optional().describe('Occupation or daily lifestyle environment'),
  languages: flexArray([]),
  permanentFacts: flexArray([])
});

export const saveUserIdentityTool: ToolDefinition = {
  name: 'save_user_identity',
  description: 'Record core user identity details in Vault user_data/identity (fullName, preferredName, locationOrClimate, ageRange, sexOrHormonalContext, permanentFacts). CALL THIS TOOL whenever the user introduces themselves, shares their name, nickname, or location.',
  parameters: saveUserIdentitySchema,
  execute: async (args: z.infer<typeof saveUserIdentitySchema>, context: AgentContext) => {
    const saved = await saveVaultUserData(context.userId, 'identity', args, 'sana', 'Updated user identity data');
    return {
      success: true,
      message: 'User identity facts successfully saved in Agent Vault.',
      identity: saved
    };
  }
};

// Update Skin Composition Tool
export const updateSkinCompositionSchema = z.object({
  skinTypeTendency: z.string().optional(),
  barrierStatusPatterns: z.string().optional(),
  pigmentationTendency: z.string().optional(),
  texturePoreElasticity: z.string().optional(),
  knownTriggers: flexArray([])
});

export const updateSkinCompositionTool: ToolDefinition = {
  name: 'update_skin_composition',
  description: 'Progressively update user skin profile composition in Vault skin_profile/composition (skin type, barrier behavior, pigmentation, known triggers).',
  parameters: updateSkinCompositionSchema,
  execute: async (args: z.infer<typeof updateSkinCompositionSchema>, context: AgentContext) => {
    const saved = await saveVaultSkinComposition(context.userId, args, 'sana', 'Progressive skin composition update');
    return {
      success: true,
      message: 'Skin composition profile updated in Vault with version history.',
      composition: saved
    };
  }
};

// Get Vault Document History Tool
export const getVaultHistorySchema = z.object({
  category: z.string(),
  docId: z.string(),
  limit: z.number().optional().default(5)
});

export const getVaultHistoryTool: ToolDefinition = {
  name: 'get_vault_history',
  description: 'Retrieve lightweight version history diffs for any document in Vault. Returns all versions if total <= 3.',
  parameters: getVaultHistorySchema,
  execute: async (args: z.infer<typeof getVaultHistorySchema>, context: AgentContext) => {
    const history = await getVaultHistory(context.userId, args.category, args.docId, args.limit);
    return {
      success: true,
      category: args.category,
      docId: args.docId,
      versionCount: history.length,
      history
    };
  }
};

export const updateSessionNotepadSchema = z.object({
  content: z.string().describe('The content or working notes to store in the session scratchpad.'),
  mode: z.enum(['append', 'replace']).optional().default('replace')
});

export const updateSessionNotepadTool: ToolDefinition = {
  name: 'update_session_notepad',
  description: "Saves or updates working notes in SANA's private session scratchpad. This notepad is strictly isolated and private to this specific chat session.",
  parameters: updateSessionNotepadSchema,
  execute: async (args: z.infer<typeof updateSessionNotepadSchema>, context: AgentContext) => {
    const updated = await updateSessionNotepad(context.sessionId, args.content, args.mode, context.userId);
    return {
      success: true,
      message: 'Session notepad updated successfully.',
      notepadContent: updated
    };
  }
};

export const readSessionNotepadSchema = z.object({});

export const readSessionNotepadTool: ToolDefinition = {
  name: 'read_session_notepad',
  description: "Reads SANA's private working notes from the current session scratchpad (isolated to this chat session).",
  parameters: readSessionNotepadSchema,
  execute: async (_args: any, context: AgentContext) => {
    const content = await getSessionNotepad(context.sessionId, context.userId);
    return {
      success: true,
      notepadContent: content || '(Empty session notepad)'
    };
  }
};

export const triggerPopUpCardSchema = z.object({
  title: z.string().min(3).max(40).describe('Concise headline title for the pop-up (10-30 characters recommended).'),
  subtitle: z.string().describe('Short descriptive body or recommendation summary.'),
  actionText: z.string().optional().default('Start Routine').describe('Button label for the primary action.'),
  iconType: z.enum(['scan', 'sun', 'sparkle', 'shield', 'droplet', 'clock', 'alert']).optional().default('sparkle'),
  badgeText: z.string().optional().default('SANA AGENT ALERT').describe('Small upper badge label.'),
  actionTarget: z.enum(['scan', 'calendar', 'reports', 'vault', 'agent']).optional().default('scan')
});

export const triggerPopUpCardTool: ToolDefinition = {
  name: 'trigger_popup_card',
  description: "Triggers a prominent, floating Action Pop-Up Card directly on the user's mobile screen above the navigation bar. Use this to prompt immediate user actions like daily facial scans, routine alerts, or skin check reminders.",
  parameters: triggerPopUpCardSchema,
  execute: async (args: z.infer<typeof triggerPopUpCardSchema>, _context: AgentContext) => {
    return {
      success: true,
      message: 'Action Pop-Up Card queued successfully.',
      popupCard: {
        id: `popup_${Date.now()}`,
        type: 'custom_action',
        title: args.title,
        subtitle: args.subtitle,
        timeAgo: 'Just now',
        actionText: args.actionText,
        iconType: args.iconType,
        badgeText: args.badgeText,
        actionTarget: args.actionTarget
      }
    };
  }
};

export const webSearchSchema = z.object({
  query: z.string().min(2).describe('Search query for dermatology research, ingredients, climate data, or medical guidelines.')
});

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search clinical databases (PubMed, DermNet, formulation databases) and live web resources for skin barrier research, ingredient safety, climate effects, and medical guidelines. Use this tool whenever up-to-date research or evidence is required.',
  parameters: webSearchSchema,
  execute: async (args: z.infer<typeof webSearchSchema>, _context: AgentContext) => {
    return await executeWebSearch(args.query);
  }
};

export const webFetchTool: ToolDefinition = {
  name: 'web_fetch',
  description: 'Fetch and search real live web search results from Exa / Google Search API for a given query, URL, or skin health topic.',
  parameters: webSearchSchema,
  execute: async (args: z.infer<typeof webSearchSchema>, _context: AgentContext) => {
    return await executeWebSearch(args.query);
  }
};

export const imageSearchSchema = z.object({
  query: z.string().min(2).describe('Exact product name or skincare item to search images for (e.g., "CeraVe Foaming Facial Cleanser" or "La Roche-Posay Toleriane Cleanser").'),
  count: z.number().optional().default(3).describe('Number of image URLs to return.')
});

export const imageSearchTool: ToolDefinition = {
  name: 'image_search',
  description: 'Search for verified real product images and skincare item URLs on the web. Use this tool whenever recommending products or discussing skincare items so you can reference direct image URLs using standard Markdown format `![Product Name](imageUrl)` in your response.',
  parameters: imageSearchSchema,
  execute: async (args: z.infer<typeof imageSearchSchema>, _context: AgentContext) => {
    return await executeImageSearch(args.query, args.count);
  }
};

export const exaSearchSchema = z.object({
  query: z.string().min(2).describe('Search query to execute via Exa AI Neural Search.'),
  type: z.enum(['auto', 'fast', 'instant', 'deep-lite', 'deep', 'deep-reasoning']).optional().describe('Search depth and speed pattern.'),
  numResults: z.number().min(1).max(25).optional().describe('Number of results to return (default 8).'),
  systemPrompt: z.string().optional().describe('Instruction prompt for source preference or synthesis.'),
  includeDomains: z.array(z.string()).optional().describe('Target specific authoritative domains (e.g. ncbi.nlm.nih.gov).'),
  excludeDomains: z.array(z.string()).optional().describe('Exclude low-quality or irrelevant domains.'),
  maxAgeHours: z.number().optional().describe('Maximum acceptable age in hours for cached content. Set 0 for forced livecrawl.')
});

export const exaSearchTool: ToolDefinition = {
  name: 'exa_search',
  description: 'Execute advanced Exa AI Neural Web Search with deep reasoning, instant/fast speed modes, domain filtering, and grounded synthesis.',
  parameters: exaSearchSchema,
  execute: async (args: z.infer<typeof exaSearchSchema>, _context: AgentContext) => {
    try {
      const result = await performExaSearch({
        query: args.query,
        type: args.type,
        numResults: args.numResults,
        systemPrompt: args.systemPrompt,
        includeDomains: args.includeDomains,
        excludeDomains: args.excludeDomains,
        maxAgeHours: args.maxAgeHours
      });
      const sites = (result.results || []).map((item, idx) => ({
        title: item.title || `Source #${idx + 1}`,
        url: item.url,
        discover: 300 + idx * 500,
        finish: 1200 + idx * 900,
        highlights: item.highlights
      }));
      return {
        success: true,
        query: args.query,
        sites,
        results: result.results,
        output: result.output,
        summary: result.output?.content
          ? (typeof result.output.content === 'string' ? result.output.content : JSON.stringify(result.output.content))
          : `Found ${result.results?.length || 0} Exa Neural Search results for "${args.query}".`
      };
    } catch (err: any) {
      console.warn('[exaSearchTool] Exa Search failed, falling back to executeWebSearch:', err?.message || err);
      return await executeWebSearch(args.query);
    }
  }
};

export const exaContentsSchema = z.object({
  urls: z.array(z.string().url()).min(1).describe('List of exact URLs to extract text, highlights, or summaries from.'),
  maxAgeHours: z.number().optional().describe('Maximum age in hours for cached content. Set 0 for forced livecrawl.')
});

export const exaContentsTool: ToolDefinition = {
  name: 'exa_contents',
  description: 'Extract clean, parsed text, highlights, and summaries from known URLs using Exa Contents API.',
  parameters: exaContentsSchema,
  execute: async (args: z.infer<typeof exaContentsSchema>, _context: AgentContext) => {
    try {
      const res = await performExaContents({
        urls: args.urls,
        highlights: true,
        maxAgeHours: args.maxAgeHours
      });
      return {
        success: true,
        urls: args.urls,
        results: res.results
      };
    } catch (err: any) {
      return {
        success: false,
        urls: args.urls,
        error: err?.message || String(err)
      };
    }
  }
};

export const exaAnswerSchema = z.object({
  query: z.string().min(2).describe('Question to answer directly with grounded sources and citations via Exa Answer API.')
});

export const exaAnswerTool: ToolDefinition = {
  name: 'exa_answer',
  description: 'Get an instant grounded answer with citations for a specific question using Exa Answer API.',
  parameters: exaAnswerSchema,
  execute: async (args: z.infer<typeof exaAnswerSchema>, _context: AgentContext) => {
    try {
      const res = await performExaAnswer({ query: args.query, text: true });
      return {
        success: true,
        query: args.query,
        answer: res.answer,
        citations: res.citations
      };
    } catch (err: any) {
      console.warn('[exaAnswerTool] Fallback to web search:', err?.message || err);
      return await executeWebSearch(args.query);
    }
  }
};

export const createFolderSchema = z.preprocess((val: any) => {
  if (typeof val === 'object' && val !== null) {
    return {
      name: String(val.name || val.folderName || val.title || val.folder_name || 'New_Folder'),
      parentPath: String(val.parentPath || val.parent || val.folderPath || val.parent_path || '/'),
      description: val.description ? String(val.description) : undefined
    };
  }
  return val;
}, z.object({
  name: z.string().describe('Name of the folder to create (e.g. PM_Routines, Skin_Scans, Clinical_Notes).'),
  parentPath: z.string().optional().default('/').describe('Parent directory path (default "/").'),
  description: z.string().optional().describe('Optional description of the folder purpose.')
}));

export const createFolderTool: ToolDefinition = {
  name: 'create_folder',
  description: 'Creates a new virtual folder or nested subfolder in Agent Vault for workspace organization.',
  parameters: createFolderSchema,
  execute: async (args: z.infer<typeof createFolderSchema>, context: AgentContext) => {
    const folder = await createVaultFolder(context.userId, args.name, args.parentPath, args.description);
    return {
      success: true,
      message: `Folder '${folder.name}' created at path '${folder.path}'.`,
      folder
    };
  }
};

export const createFileSchema = z.preprocess((val: any) => {
  if (typeof val === 'object' && val !== null) {
    return {
      name: String(val.name || val.fileName || val.filename || val.title || val.file_name || 'untitled.md'),
      content: String(val.content ?? val.text ?? val.body ?? ''),
      folderPath: String(val.folderPath || val.folder || val.parentPath || val.folder_path || '/'),
      fileType: String(val.fileType || val.type || val.file_type || 'text/markdown'),
      tags: val.tags || []
    };
  }
  return val;
}, z.object({
  name: z.string().describe('File name with extension (e.g. barrier_protocol.md, tretinoin_guide.txt).'),
  content: z.string().describe('Complete text, markdown, or JSON content of the file.'),
  folderPath: z.string().optional().default('/').describe('Folder path where file should be placed.'),
  fileType: z.string().optional().default('text/markdown').describe('MIME type or file type identifier.'),
  tags: flexArray([])
}));

export const createFileTool: ToolDefinition = {
  name: 'create_file',
  description: 'Creates a new virtual file with full content inside a folder in Agent Vault.',
  parameters: createFileSchema,
  execute: async (args: z.infer<typeof createFileSchema>, context: AgentContext) => {
    const file = await createVaultFile(context.userId, args.name, args.content, args.folderPath, args.fileType, args.tags);
    return {
      success: true,
      message: `File '${file.name}' created in folder '${file.folderPath}' (path: ${file.path}).`,
      file
    };
  }
};

export const arrangeFilesSchema = z.preprocess((val: any) => {
  if (typeof val === 'object' && val !== null) {
    const rawFiles = val.fileIdsOrPaths || val.fileIds || val.files || val.filePaths || val.file_ids || [];
    return {
      fileIdsOrPaths: Array.isArray(rawFiles) ? rawFiles.map(String) : (typeof rawFiles === 'string' ? [rawFiles] : []),
      targetFolderPath: String(val.targetFolderPath || val.targetFolder || val.folderPath || val.folder || val.target_folder_path || '/')
    };
  }
  return val;
}, z.object({
  fileIdsOrPaths: z.array(z.string()).describe('List of file IDs, file names, or file paths to move/re-arrange.'),
  targetFolderPath: z.string().describe('Target folder path to move the files into.')
}));

export const arrangeFilesTool: ToolDefinition = {
  name: 'arrange_files',
  description: 'Arranges, moves, or organizes multiple files into a specific target folder.',
  parameters: arrangeFilesSchema,
  execute: async (args: z.infer<typeof arrangeFilesSchema>, context: AgentContext) => {
    const res = await arrangeVaultFiles(context.userId, args.fileIdsOrPaths, args.targetFolderPath);
    return {
      success: true,
      message: `Successfully arranged ${res.movedCount} file(s) into '${res.targetFolderPath}'.`,
      movedCount: res.movedCount,
      targetFolderPath: res.targetFolderPath
    };
  }
};

export const createHyperlinkSchema = z.preprocess((val: any) => {
  if (typeof val === 'object' && val !== null) {
    return {
      sourceType: val.sourceType || val.source_type || 'file',
      sourceIdOrPath: String(val.sourceIdOrPath || val.sourceId || val.sourcePath || val.source || ''),
      title: String(val.title || val.label || val.name || 'Hyperlink'),
      targetType: val.targetType || val.target_type || 'file',
      targetIdOrUrl: String(val.targetIdOrUrl || val.targetId || val.targetUrl || val.targetPath || val.target || ''),
      notes: val.notes ? String(val.notes) : undefined
    };
  }
  return val;
}, z.object({
  sourceType: z.enum(['file', 'folder']).describe('Source item type to attach hyperlink to.'),
  sourceIdOrPath: z.string().describe('Source file ID, folder ID, or path.'),
  title: z.string().describe('Title / label for the hyperlink.'),
  targetType: z.enum(['file', 'folder', 'external']).describe('Target type being linked to.'),
  targetIdOrUrl: z.string().describe('Target file path/ID, folder path/ID, or external URL.'),
  notes: z.string().optional().describe('Optional context notes explaining the connection.')
}));

export const createHyperlinkTool: ToolDefinition = {
  name: 'create_hyperlink',
  description: 'Creates a cross-referencing hyperlink to connect files, folders, or external resources in Agent Vault.',
  parameters: createHyperlinkSchema,
  execute: async (args: z.infer<typeof createHyperlinkSchema>, context: AgentContext) => {
    const link = await createVaultHyperlink(
      context.userId,
      args.sourceType,
      args.sourceIdOrPath,
      args.title,
      args.targetType,
      args.targetIdOrUrl,
      args.notes
    );
    return {
      success: true,
      message: `Hyperlink '${args.title}' connected successfully.`,
      hyperlink: link
    };
  }
};

export const accessFolderSchema = z.preprocess((val: any) => {
  if (typeof val === 'string') return { folderPathOrId: val, folderPath: val, folderId: val };
  if (typeof val === 'object' && val !== null) {
    const raw = val.folderPathOrId || val.folderPath || val.folderId || val.path || val.id || val.folder || val.folder_path || val.folder_id || '/';
    return {
      folderPathOrId: String(raw || '/'),
      folderPath: String(raw || '/'),
      folderId: String(raw || '/')
    };
  }
  return { folderPathOrId: '/', folderPath: '/', folderId: '/' };
}, z.object({
  folderPathOrId: z.string().describe('Path or ID of the folder to open and inspect (e.g. "/PM_Routines", "/").'),
  folderPath: z.string().optional().describe('Alias for folderPathOrId.'),
  folderId: z.string().optional().describe('Alias for folderPathOrId.')
}));

export const accessFolderTool: ToolDefinition = {
  name: 'access_folder',
  description: 'Opens a specific folder and retrieves its full directory map, nested subfolders, files, and connected hyperlinks. Call this whenever you state "I have decided to open this folder".',
  parameters: accessFolderSchema,
  execute: async (args: any, context: AgentContext) => {
    const target = args.folderPathOrId || args.folderPath || args.folderId || args.path || args.id || '/';
    const contents = await accessVaultFolder(context.userId, target);
    return {
      success: true,
      message: `Opened folder '${contents.folderName}' (${contents.folderPath}).`,
      folderIndex: contents
    };
  }
};

export const accessFileSchema = z.preprocess((val: any) => {
  if (typeof val === 'string') return { filePathOrId: val, filePath: val, fileId: val };
  if (typeof val === 'object' && val !== null) {
    const raw = val.filePathOrId || val.filePath || val.fileId || val.path || val.id || val.fileName || val.filename || val.file_path || val.file_id || '';
    return {
      filePathOrId: String(raw || ''),
      filePath: String(raw || ''),
      fileId: String(raw || '')
    };
  }
  return { filePathOrId: '', filePath: '', fileId: '' };
}, z.object({
  filePathOrId: z.string().describe('Path or ID of the file to open and read (e.g. "/Skin_Health_Archive/Skin_Goals_Log.txt").'),
  filePath: z.string().optional().describe('Alias for filePathOrId.'),
  fileId: z.string().optional().describe('Alias for filePathOrId.')
}));

export const accessFileTool: ToolDefinition = {
  name: 'access_file',
  description: 'Opens and reads the full text content, metadata, and connected hyperlinks of a specific file in Agent Vault.',
  parameters: accessFileSchema,
  execute: async (args: any, context: AgentContext) => {
    const target = args.filePathOrId || args.filePath || args.fileId || args.path || args.id || '';
    const res = await accessVaultFile(context.userId, target);
    if (!res.found || !res.file) {
      return {
        success: false,
        message: `File '${target}' was not found in Agent Vault.`
      };
    }
    return {
      success: true,
      file: res.file
    };
  }
};

export const getVaultFileSystemIndexSchema = z.object({});

export const getVaultFileSystemIndexTool: ToolDefinition = {
  name: 'get_vault_file_system_index',
  description: 'Returns the full hierarchical directory tree index map of all files and folders in user Agent Vault.',
  parameters: getVaultFileSystemIndexSchema,
  execute: async (_args: any, context: AgentContext) => {
    const treeIndex = await getVaultFileSystemIndex(context.userId);
    return {
      success: true,
      directoryTree: treeIndex
    };
  }
};

import { fetchAdvancedEnvironmentalData } from './services/WeatherAwarenessEngine.js';

export const fetchAdvancedEnvironmentalDataSchema = z.object({
  latitude: z.number().optional().describe('Latitude of user/location'),
  longitude: z.number().optional().describe('Longitude of user/location'),
  locationName: z.string().optional().describe('Optional city/location label (e.g. "Surat, India", "Berlin, Germany")'),
  includeAirQuality: z.boolean().optional().default(true).describe('Include PM2.5, PM10, Nitrogen Dioxide (NO2), Ozone (O3), Dust, US AQI'),
  includePollen: z.boolean().optional().default(true).describe('Include pollen counts (Alder, Birch, Grass, Mugwort, Olive, Ragweed)'),
  includeHourlyForecast: z.boolean().optional().default(true).describe('Include 24-hour hourly forecast (temp, humidity, dew point, VPD, cloud cover, wind speed, gusts, rain probability)'),
  includeYesterdayComparison: z.boolean().optional().default(true).describe('Compare today vs yesterday average humidity, temp, and dew point (past_days=1)'),
  includeDaily7DayTrend: z.boolean().optional().default(true).describe('Include 7-day UV index max, clear-sky UV, temperature, and rain probability forecast'),
  includeGeologicalSoil: z.boolean().optional().default(false).describe('Include soil moisture and dew point depression'),
  includeSolarRadiation: z.boolean().optional().default(true).describe('Include direct solar radiation, max UV spectrum, clear sky max UV, and cloud UV penetration ratio')
});

export const fetchAdvancedEnvironmentalDataTool: ToolDefinition = {
  name: 'fetch_advanced_environmental_data',
  description: 'Deep environmental exposome & meteorological analysis tool via Open-Meteo API. Retrieves PM2.5, PM10, NO2, Ozone, pollen counts, 7-day UV trends, clear-sky vs cloudy UV ratios, cloud cover %, precipitation probability (12h), wind speed + gusts, VPD (Vapour Pressure Deficit), dew point, and yesterday vs today humidity trends. Use on flare-ups, pollution alerts, travel, or custom routine adjustments.',
  parameters: fetchAdvancedEnvironmentalDataSchema,
  execute: async (args: z.infer<typeof fetchAdvancedEnvironmentalDataSchema>) => {
    const data = await fetchAdvancedEnvironmentalData(args);
    return {
      success: true,
      environmentalExposome: data
    };
  }
};

export const requestFacialScanSchema = z.object({
  reason: z.string().describe('Reason for suggesting a facial scan right now (e.g. daily baseline check, post-treatment follow-up, UV alert)'),
  title: z.string().optional().default('Take a Facial Scan Now').describe('Title for the scan prompt card'),
  urgentText: z.string().optional().describe('Optional urgent callout note')
});

export const requestFacialScanTool: ToolDefinition = {
  name: 'request_facial_scan',
  description: 'Initiates a facial scan trigger request to the user. Creates an interactive UI prompt card in the chat allowing the user to click and immediately launch the camera for Perfect Corp skin analysis.',
  parameters: requestFacialScanSchema,
  execute: async (args: z.infer<typeof requestFacialScanSchema>) => {
    return {
      success: true,
      message: `Facial scan request triggered to user UI.`,
      actionProposal: {
        actionId: `scan_req_${Date.now()}`,
        actionType: 'TRIGGER_FACIAL_SCAN',
        title: args.title || 'Take a Facial Scan Now',
        description: args.reason,
        urgentText: args.urgentText,
        actionTarget: 'scan'
      }
    };
  }
};

export const requestUserInputSchema = z.object({
  title: z.string().optional().default('Input Needed to Continue').describe('Title or context for asking these questions'),
  questions: z.array(z.object({
    q: z.string().describe('The question text'),
    type: z.enum(['radio', 'check']).optional().default('radio').describe('Single choice (radio) or multiple choice (check)'),
    options: z.array(z.string()).describe('List of selectable option strings')
  })).optional().describe('The list of questions to present to the user')
});

export const requestUserInputTool: ToolDefinition = {
  name: 'request_user_input',
  description: 'Requests interactive multi-question input or approval choices from the user before proceeding with a task, routine, or launch. Renders an interactive ApprovalCard questionnaire in chat with choices, paging, and single-choice auto-advance. Returns completed answers back to the agent.',
  parameters: requestUserInputSchema,
  execute: async (args: z.infer<typeof requestUserInputSchema>) => {
    return {
      success: true,
      message: 'Interactive questions card presented to user in chat. Awaiting user choices.',
      actionProposal: {
        actionId: `user_input_${Date.now()}`,
        actionType: 'REQUEST_USER_INPUT',
        title: args.title || 'Input Needed to Continue',
        description: 'Please answer these questions so SANA can proceed.',
        questions: args.questions
      }
    };
  }
};

export const retrieveSkinScanVaultSchema = z.object({
  scanType: z.enum(['daily_scan', 'intermediate_scan', 'all']).optional().default('all').describe('Filter scans by type: daily ritual scan vs intermediate quick check scan.'),
  scanId: z.string().optional().describe('Specific scan ID (e.g., daily_scan_20260812_193000) to retrieve.'),
  imageType: z.enum([
    'original',
    'wrinkles',
    'acne',
    'pores',
    'dark_circles',
    'redness',
    'spots',
    'texture',
    'moisture',
    'firmness',
    'all_masks',
    'none'
  ]).optional().default('none').describe('Specific image or visual concern mask overlay to retrieve alongside scan metrics.'),
  dateFrom: z.string().optional().describe('Start date filter (YYYY-MM-DD)'),
  dateTo: z.string().optional().describe('End date filter (YYYY-MM-DD)'),
  limit: z.number().optional().default(5).describe('Maximum number of scan records to return.'),
  includeRawApiOutput: z.boolean().optional().default(true).describe('Include complete raw Perfect Corp S2S API output log.'),
  includeTrendGraph: z.boolean().optional().default(true).describe('Include time-series progress trends & improvement percentages comparing scans over time.')
});

export const retrieveSkinScanVaultTool: ToolDefinition = {
  name: 'retrieve_skin_scan_vault',
  description: 'Retrieve skin scan records, raw report data, specific concern images/masks (wrinkles, acne, pores, dark circles, redness, spots, texture, moisture, firmness), and time-series progress trends from the Agent Vault in a SINGLE tool call.',
  parameters: retrieveSkinScanVaultSchema,
  execute: async (args: z.infer<typeof retrieveSkinScanVaultSchema>, context: AgentContext) => {
    const userId = context.profile?.uid || 'guest_user';
    return await retrieveSkinScanVault(userId, args);
  }
};

export const readUniversalNotepadSchema = z.object({});

export const readUniversalNotepadTool: ToolDefinition = {
  name: 'read_universal_notepad',
  description: 'Reads the universal cross-session memory notepad. Use this tool to retrieve long-term user preferences, notes, or cross-session instructions saved across chats.',
  parameters: readUniversalNotepadSchema,
  execute: async (_args: any, context: AgentContext) => {
    const { getUniversalNotepad } = await import('./universalNotepad.js');
    const content = await getUniversalNotepad(context.userId);
    return {
      success: true,
      notepadContent: content || 'Universal notepad is empty.'
    };
  }
};

export const updateUniversalNotepadSchema = z.object({
  content: z.string().describe('The note content to save to the universal memory notepad.'),
  mode: z.enum(['append', 'replace']).optional().default('append').describe('Whether to append to existing notes or replace entire notepad.')
});

export const updateUniversalNotepadTool: ToolDefinition = {
  name: 'update_universal_notepad',
  description: 'Saves important cross-session facts, rules, or user notes to the universal memory notepad so it is remembered in future sessions.',
  parameters: updateUniversalNotepadSchema,
  execute: async (args: z.infer<typeof updateUniversalNotepadSchema>, context: AgentContext) => {
    const { updateUniversalNotepad } = await import('./universalNotepad.js');
    const updated = await updateUniversalNotepad(context.userId, args.content, args.mode);
    return {
      success: true,
      message: `Universal notepad updated (${args.mode}).`,
      updatedContent: updated
    };
  }
};

export const retrieveScanMasksSchema = z.object({
  tags: z.array(z.string()).describe('List of skin concern tags to query (e.g. ["acne", "wrinkles", "pores", "redness", "dark_circles", "texture"])'),
  scanId: z.string().optional().describe('Optional specific scan ID filter.'),
  limit: z.number().optional().default(5).describe('Maximum number of mask image records to retrieve.')
});

export const retrieveScanMasksTool: ToolDefinition = {
  name: 'retrieve_scan_masks',
  description: 'Retrieves tagged facial scan mask image URLs and severity score metadata by concern tags (acne, wrinkles, redness, pores, dark circles, etc.) from past scans. Use when user asks to compare or view specific feature images from previous scans.',
  parameters: retrieveScanMasksSchema,
  execute: async (args: z.infer<typeof retrieveScanMasksSchema>, context: AgentContext) => {
    const userId = context.userId || 'guest_user';
    const vaultRes = await retrieveSkinScanVault(userId, {
      scanType: 'all',
      scanId: args.scanId,
      imageType: 'all_masks',
      limit: args.limit || 5
    });

    const matchedMasks: any[] = [];
    if (vaultRes?.scans && Array.isArray(vaultRes.scans)) {
      vaultRes.scans.forEach((s: any) => {
        const concernImages = s.concernImages || {};
        args.tags.forEach(tag => {
          const cleanTag = tag.toLowerCase().trim();
          Object.keys(concernImages).forEach(cKey => {
            if (cKey.toLowerCase().includes(cleanTag)) {
              const item = concernImages[cKey];
              matchedMasks.push({
                scanId: s.scanId || s.id,
                scanDate: s.scanDate || s.timestamp,
                concernTag: cKey,
                label: item.label,
                score: item.score,
                mask_url: item.mask_url
              });
            }
          });
        });
      });
    }

    return {
      success: true,
      queryTags: args.tags,
      matchedMasks: matchedMasks.slice(0, args.limit || 5)
    };
  }
};

export const getCompanionSignalsSchema = z.object({
  forceRefresh: z.boolean().optional().default(false).describe('Whether to force re-generating fresh companion signals from live context.')
});

export const getCompanionSignalsTool: ToolDefinition = {
  name: 'get_companion_signals',
  description: 'Retrieves the latest warm, context-aware Daily Companion Signals generated for the user based on live weather, skin goals, universal notes, and scan trends.',
  parameters: getCompanionSignalsSchema,
  execute: async (args: z.infer<typeof getCompanionSignalsSchema>, context: AgentContext) => {
    const { getOrGenerateCompanionSignals } = await import('./services/companionSignalsService.js');
    const result = await getOrGenerateCompanionSignals(context.userId, context.profile, { forceRefresh: args.forceRefresh });
    return {
      success: true,
      companionSignal: result
    };
  }
};

// ============================================================================
// OPEN WEARABLES & BIOMETRICS TELEMETRY TOOL
// ============================================================================

export const queryWearableBiometricsSchema = z.object({
  timeframe: z.enum(['current_buffer', 'last_24_hours', 'summary']).optional().default('summary'),
  includeGraphPoints: z.boolean().optional().default(false)
});

export const queryWearableBiometricsTool: ToolDefinition = {
  name: 'query_wearable_biometrics',
  description: 'Queries the user\'s real-time wearable biometrics and 20-minute micro-batch telemetry from Apple Watch, Google Fit, Oura, or Garmin. Returns Heart Rate, HRV (SDNN), step cadence, active energy burn, SpO2, autonomic stress, and recovery readiness score.',
  parameters: queryWearableBiometricsSchema,
  execute: async (args: z.infer<typeof queryWearableBiometricsSchema>, context: AgentContext) => {
    try {
      const { getConsolidatedWearableTelemetry } = await import('../lib/wearableBufferService.js');
      const telemetry = await getConsolidatedWearableTelemetry(context.userId || 'guest_user');

      return {
        success: true,
        deviceConnection: telemetry.connection ? {
          provider: telemetry.connection.provider,
          deviceName: telemetry.connection.deviceName,
          batteryPercent: telemetry.connection.batteryPercent,
          lastSyncedAt: telemetry.connection.lastSyncedAt,
          status: telemetry.connection.status
        } : null,
        vitalsSummary: telemetry.summary,
        totalSamplesInBuffer: telemetry.samples.length,
        graphPoints: args.includeGraphPoints ? telemetry.samples.slice(-20) : undefined
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to query wearable biometrics telemetry'
      };
    }
  }
};

export const SANA_TOOL_REGISTRY: ToolDefinition[] = [
  queryWearableBiometricsTool,
  webSearchTool,
  webFetchTool,
  imageSearchTool,
  exaSearchTool,
  exaContentsTool,
  exaAnswerTool,
  fetchAdvancedEnvironmentalDataTool,
  getCompanionSignalsTool,
  requestFacialScanTool,
  requestUserInputTool,
  triggerPopUpCardTool,
  updateSessionNotepadTool,
  readSessionNotepadTool,
  readUniversalNotepadTool,
  updateUniversalNotepadTool,
  retrieveScanMasksTool,
  universalSearchTool,
  vaultSearchTool,
  retrieveSkinScanVaultTool,
  saveMemoryNoteTool,
  saveVaultIncidentTool,
  saveVaultEventTool,
  saveVaultGoalTool,
  saveUserIdentityTool,
  updateSkinCompositionTool,
  getVaultHistoryTool,
  ingestDocumentTool,
  searchAgentVaultTool,
  createFolderTool,
  createFileTool,
  arrangeFilesTool,
  createHyperlinkTool,
  accessFolderTool,
  accessFileTool,
  getVaultFileSystemIndexTool,
  proposeUpdateSettingTool,
  proposeCreateEventTool,
  proposeLogIncidentTool,
  proposeGenerateProtocolTool
];

