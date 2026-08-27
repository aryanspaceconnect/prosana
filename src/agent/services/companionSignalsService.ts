import { getUniversalNotepad } from "../universalNotepad.js";
import { fetchAdvancedEnvironmentalData } from "./WeatherAwarenessEngine.js";
import { db, sanitizeForFirestore } from "../../lib/firebase.js";
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { generateContentWithRouter, LLMRequestPriority } from "../llmRouter.js";

export interface CompanionSignalResponse {
  id: string;
  userId: string;
  lines: string[];
  windowId: string;
  windowLabel: string;
  timestamp: string;
  cachedAt: string;
  enabled: boolean;
  contextMeta?: {
    locationName: string;
    localHour: number;
    localTimeStr: string;
    temperature: string;
    weatherCondition: string;
    uvIndex: number;
    dewPoint: string;
    peakUvToday?: number;
    maxTempToday?: string;
    afternoonTrend?: string;
    goalSummary: string;
    scansCount: number;
    lastScanDate?: string;
    earlierDayWindowsCount?: number;
  };
}

export type DiurnalWindowKey =
  | 'window_04_06'
  | 'window_06_11'
  | 'window_11_14'
  | 'window_14_17'
  | 'window_17_19'
  | 'window_19_22'
  | 'window_22_24'
  | 'window_00_04';

export interface DiurnalWindowInfo {
  key: DiurnalWindowKey;
  label: string;
  startHour: number;
  endHour: number;
  isNight: boolean;
  periodDescription: string;
}

export const DIURNAL_WINDOW_SCHEDULE: DiurnalWindowInfo[] = [
  {
    key: 'window_04_06',
    label: '4 AM – 6 AM (Early Dawn)',
    startHour: 4,
    endHour: 6,
    isNight: false,
    periodDescription: 'First awakenings, pre-sun dawn setup.'
  },
  {
    key: 'window_06_11',
    label: '6 AM – 11 AM (Morning)',
    startHour: 6,
    endHour: 11,
    isNight: false,
    periodDescription: 'Daylight barrier activation, rising solar exposome.'
  },
  {
    key: 'window_11_14',
    label: '11 AM – 2 PM (Peak Midday)',
    startHour: 11,
    endHour: 14,
    isNight: false,
    periodDescription: 'Maximum solar heat and UV radiation intensity.'
  },
  {
    key: 'window_14_17',
    label: '2 PM – 5 PM (Late Afternoon)',
    startHour: 14,
    endHour: 17,
    isNight: false,
    periodDescription: 'Afternoon transpiration, hydration replenishment.'
  },
  {
    key: 'window_17_19',
    label: '5 PM – 7 PM (Golden Dusk)',
    startHour: 17,
    endHour: 19,
    isNight: true,
    periodDescription: 'Dusk wind-down, daylight transition.'
  },
  {
    key: 'window_19_22',
    label: '7 PM – 10 PM (Evening Rest)',
    startHour: 19,
    endHour: 22,
    isNight: true,
    periodDescription: 'Evening barrier replenishment, unwinding.'
  },
  {
    key: 'window_22_24',
    label: '10 PM – 12 AM (Pre-Midnight Regeneration)',
    startHour: 22,
    endHour: 24,
    isNight: true,
    periodDescription: 'Night rest, lipid barrier repair.'
  },
  {
    key: 'window_00_04',
    label: '12 AM – 4 AM (Deep Overnight Cellular Recovery)',
    startHour: 0,
    endHour: 4,
    isNight: true,
    periodDescription: 'Deep overnight rest and cellular renewal.'
  }
];

export const ORDERED_WINDOW_KEYS: DiurnalWindowKey[] = [
  'window_04_06',
  'window_06_11',
  'window_11_14',
  'window_14_17',
  'window_17_19',
  'window_19_22',
  'window_22_24',
  'window_00_04'
];

/**
 * Calculates the diurnal cycle date string anchored to 4:00 AM.
 * Hours 00:00 - 03:59 belong to the previous calendar day's ongoing cycle.
 * At 4:00 AM, a brand new daily series commences.
 */
export function getDiurnalCycleDate(localDate: Date = new Date()): string {
  const cycleTime = new Date(localDate.getTime() - 4 * 60 * 60 * 1000);
  const y = cycleTime.getFullYear();
  const m = String(cycleTime.getMonth() + 1).padStart(2, '0');
  const d = String(cycleTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Determine diurnal window from local hour (0-23)
 * Exact interval boundaries:
 * 4 to 6   (4:00 - 5:59) -> window_04_06
 * 6 to 11  (6:00 - 10:59) -> window_06_11
 * 11 to 2  (11:00 - 13:59) -> window_11_14
 * 2 to 5   (14:00 - 16:59) -> window_14_17
 * 5 to 7   (17:00 - 18:59) -> window_17_19
 * 7 to 10  (19:00 - 21:59) -> window_19_22
 * 10 to 12 (22:00 - 23:59) -> window_22_24
 * 12 to 4  (00:00 - 03:59) -> window_00_04
 */
export function getDiurnalWindowInfo(localHour: number): DiurnalWindowInfo {
  const normHour = ((localHour % 24) + 24) % 24;

  if (normHour >= 4 && normHour < 6) {
    return DIURNAL_WINDOW_SCHEDULE[0]; // 4-6
  } else if (normHour >= 6 && normHour < 11) {
    return DIURNAL_WINDOW_SCHEDULE[1]; // 6-11
  } else if (normHour >= 11 && normHour < 14) {
    return DIURNAL_WINDOW_SCHEDULE[2]; // 11-14
  } else if (normHour >= 14 && normHour < 17) {
    return DIURNAL_WINDOW_SCHEDULE[3]; // 14-17
  } else if (normHour >= 17 && normHour < 19) {
    return DIURNAL_WINDOW_SCHEDULE[4]; // 17-19
  } else if (normHour >= 19 && normHour < 22) {
    return DIURNAL_WINDOW_SCHEDULE[5]; // 19-22
  } else if (normHour >= 22 && normHour < 24) {
    return DIURNAL_WINDOW_SCHEDULE[6]; // 22-24
  } else {
    return DIURNAL_WINDOW_SCHEDULE[7]; // 0-4
  }
}

// In-memory diurnal cache: key is `${userId}_${dateStr}`
const DIURNAL_MEMORY_CACHE: Record<string, {
  dateStr: string;
  windows: Partial<Record<DiurnalWindowKey, CompanionSignalResponse>>;
  lastUpdated: number;
}> = {};

function parseToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    try {
      const d = val.toDate();
      return isNaN(d.getTime()) ? null : d;
    } catch {
      // ignore
    }
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function safeIsoString(val: any, fallback: string = new Date().toISOString()): string {
  const d = parseToDate(val);
  return d ? d.toISOString() : (typeof val === 'string' && val.length > 0 ? val : fallback);
}

/**
 * Programmatic Post-LLM Guard (mirrors eval.md rules)
 *
 * Rules:
 * - lines = lines.slice(0, 6)
 * - Drop line if length > 90
 * - If name appears in >1 line → strip name from extras
 * - If city appears in >1 line → strip from extras
 * - Reject / regen if match:
 *   /it's not .+, it's/i, /here's the thing/i, /remember:/i, /keep in mind/i, /studies show/i,
 *   /don't forget/i, /what most people miss/i, /the key:/i
 * - Night: drop /uv|spf|sunscreen/i
 */
export function runPostLlmGuard(
  rawLines: string[],
  options: {
    userName?: string;
    cityName?: string;
    isNight?: boolean;
  }
): string[] {
  let lines = Array.isArray(rawLines) ? [...rawLines] : [];

  const REJECT_PATTERNS = [
    /it's not .+, it's/i,
    /here's the thing/i,
    /remember:/i,
    /keep in mind/i,
    /studies show/i,
    /don't forget/i,
    /what most people miss/i,
    /the key:/i,
    /nobody tells you/i,
    /not a routine/i,
    /not a checklist/i,
    /(barrier|skin)\s+(loves|craves|wants|appreciates)/i,
    /gentle hydration/i,
    /simple,?\s*calm steps/i,
    /support your barrier with (simple|calm|gentle)/i,
    /a light layer\b(?!\s+(of|with)\s+[a-z]+)/i, // rejects "a light layer still helps" without specifying what layer
    /a light layer still helps/i,
    /drizzle and humidity mean/i,
    /humidity is high with this/i,
    /listen to your skin/i,
    /be gentle with your skin/i,
    /\b(delve|foster|leverage|utilize|facilitate|empower|streamline|cutting-edge|transformative|elevate|embark|harness|meticulous|paramount|game-changer|tapestry|realm)\b/i
  ];

  // 1. Cap to max 6 lines
  lines = lines.slice(0, 6);

  const cleaned: string[] = [];
  let nameCount = 0;
  let cityCount = 0;

  const normalizedName = options.userName?.trim();
  const normalizedCity = options.cityName?.split(',')[0]?.trim();

  for (const line of lines) {
    if (typeof line !== 'string') continue;
    let l = line.trim();
    if (!l) continue;

    // Strip leading dashes, bullet points, numbers, emoji, outer quotes
    l = l.replace(/^[-*•\d.)\]]+\s*/, '')
         .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
         .replace(/^["']|["']$/g, '')
         .trim();

    if (!l) continue;

    // Reject / filter if matches hard slop patterns
    if (REJECT_PATTERNS.some(rgx => rgx.test(l))) {
      continue;
    }

    // Night: drop /uv|spf|sunscreen/i
    if (options.isNight && /uv|spf|sunscreen/i.test(l)) {
      continue;
    }

    // Drop line if length > 90
    if (l.length > 90) {
      if (l.length > 105) {
        continue;
      }
      // Trim slightly if just over 90
      l = l.slice(0, 90).replace(/[\s,;:-]+$/, '');
      if (!l.endsWith('.')) l += '.';
    }

    // If name appears in > 1 line → strip name from extras
    if (normalizedName && normalizedName.length > 1) {
      const nameRegex = new RegExp(`\\b${normalizedName}\\b`, 'gi');
      if (nameRegex.test(l)) {
        nameCount++;
        if (nameCount > 1) {
          l = l.replace(nameRegex, '').replace(/\s{2,}/g, ' ').replace(/^,\s*/, '').replace(/,\s*,/g, ',').trim();
        }
      }
    }

    // If city appears in > 1 line → strip from extras
    if (normalizedCity && normalizedCity.length > 2) {
      const cityRegex = new RegExp(`\\b${normalizedCity}\\b`, 'gi');
      if (cityRegex.test(l)) {
        cityCount++;
        if (cityCount > 1) {
          l = l.replace(cityRegex, 'here').replace(/\s{2,}/g, ' ').trim();
        }
      }
    }

    l = l.trim();
    if (l && l.length <= 90) {
      cleaned.push(l);
    }
  }

  // If no lines passed guard, provide a clean fall-through conforming to guard
  if (cleaned.length === 0) {
    if (options.isNight) {
      return [
        "Prioritize 8 hours of sleep to support HRV recovery and resting heart rate.",
        "Dim bright screens 30 minutes before bed to align circadian rhythm."
      ];
    }
    return [
      "Hydrate consistently today to maintain steady energy and optimal cardiac output.",
      "Pace outdoor activities while ambient temperature and humidity remain high."
    ];
  }

  return cleaned.slice(0, 6);
}

/**
 * Generate or fetch warm, context-aware Daily Compassion Sync Signals for the user
 */
export async function getOrGenerateCompanionSignals(
  userId: string,
  userProfile: any,
  options: {
    forceRefresh?: boolean;
    latitude?: number;
    longitude?: number;
    clientLocalTime?: string;
    clientHour?: number;
    clientDateStr?: string;
    timezone?: string;
  } = {}
): Promise<CompanionSignalResponse> {
  const safeUid = userId || 'guest_user';
  const settings = userProfile?.settings || {};
  const enabled = settings.companionSignalsEnabled !== false; // default true

  // Derive local hour accurately from client payload (strictly avoiding UTC overwrite)
  let localHour = typeof options.clientHour === 'number' && !isNaN(options.clientHour)
    ? ((options.clientHour % 24) + 24) % 24
    : new Date().getHours();

  // Anchor the diurnal day cycle to 4:00 AM (00:00 - 03:59 belongs to previous day's ongoing cycle)
  const dateStr = options.clientDateStr || getDiurnalCycleDate(new Date());
  const windowInfo = getDiurnalWindowInfo(localHour);
  const isNight = windowInfo.isNight;

  if (!enabled) {
    return {
      id: `signal_disabled_${Date.now()}`,
      userId: safeUid,
      lines: [],
      windowId: windowInfo.key,
      windowLabel: windowInfo.label,
      timestamp: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
      enabled: false
    };
  }

  // 1. Check In-Memory Diurnal Cache — NEVER re-query LLM/Firestore if within the same window unless explicitly forceRefresh
  const memoryEntry = DIURNAL_MEMORY_CACHE[safeUid];
  if (!options.forceRefresh && memoryEntry && memoryEntry.dateStr === dateStr) {
    const cachedWindowSignal = memoryEntry.windows[windowInfo.key];
    if (cachedWindowSignal && cachedWindowSignal.lines && cachedWindowSignal.lines.length > 0) {
      return cachedWindowSignal;
    }
  }

  // 2. Check Firestore Diurnal Store: users/{uid}/diurnal_signals/{dateStr}
  let earlierDayWindowsContext: Array<{ window: string; label: string; lines: string[] }> = [];
  try {
    if (db) {
      const dayDocRef = doc(db, 'users', safeUid, 'diurnal_signals', dateStr);
      const snap = await getDoc(dayDocRef);
      if (snap.exists()) {
        const dayData = snap.data() as any;
        const storedWindows: Partial<Record<DiurnalWindowKey, CompanionSignalResponse>> = { ...(dayData.windows || {}) };

        // Support both nested map format and legacy flat dot-notation keys
        for (const wKey of ORDERED_WINDOW_KEYS) {
          if (!storedWindows[wKey] && dayData[`windows.${wKey}`]) {
            storedWindows[wKey] = dayData[`windows.${wKey}`];
          }
        }

        // Collect all previous windows from earlier in the day
        for (const wKey of ORDERED_WINDOW_KEYS) {
          if (wKey === windowInfo.key) break;
          if (storedWindows[wKey]?.lines && Array.isArray(storedWindows[wKey].lines)) {
            earlierDayWindowsContext.push({
              window: wKey,
              label: storedWindows[wKey].windowLabel || wKey,
              lines: storedWindows[wKey].lines
            });
          }
        }

        // If not force refresh, and current window is already generated in Firestore, return it immediately without calling Gemini or writing to DB
        if (!options.forceRefresh && storedWindows[windowInfo.key]?.lines?.length > 0) {
          const resObj = storedWindows[windowInfo.key] as CompanionSignalResponse;
          // Populate in-memory cache to save even Firestore reads on subsequent client refreshes
          if (!DIURNAL_MEMORY_CACHE[safeUid] || DIURNAL_MEMORY_CACHE[safeUid].dateStr !== dateStr) {
            DIURNAL_MEMORY_CACHE[safeUid] = { dateStr, windows: { ...storedWindows, [windowInfo.key]: resObj }, lastUpdated: Date.now() };
          } else {
            DIURNAL_MEMORY_CACHE[safeUid].windows[windowInfo.key] = resObj;
          }
          return resObj;
        }
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('Quota limit exceeded') || err?.code === 'resource-exhausted') {
      console.warn("[CompassionSignalsService] Firestore read skipped: daily free tier quota limit reached.");
    } else {
      console.warn("[CompassionSignalsService] Firestore read warning:", err);
    }
  }

  // Gather Context
  const preferredName = settings.preferredName || userProfile?.displayName?.split(' ')[0] || 'friend';
  const locationName = settings.locationName || userProfile?.locationName || 'Local Atmosphere';
  const lat = options.latitude ?? settings.latitude;
  const lon = options.longitude ?? settings.longitude;

  // Goals & Constraints
  const skincareGoals = settings.skincareGoals || userProfile?.skincareGoals || 'Restore skin barrier & boost glow';
  const skinPriorities = settings.skinPriorities || userProfile?.skinPriorities || 'Barrier protection & hydration';
  const userPerception = settings.userPerceptionText || userProfile?.userPerceptionText || 'Skin sensitive to dryness';
  const hormonalFactors = settings.hormonalFactors || userProfile?.hormonalFactors || 'None reported';

  // Universal Notepad Memory
  let universalNotepad = '';
  try {
    universalNotepad = await getUniversalNotepad(safeUid);
  } catch (e) {
    console.warn("[CompassionSignalsService] Notepad error:", e);
  }

  // Fetch Live Weather + Forecast Throughout the Day
  let envData: any = null;
  try {
    envData = await fetchAdvancedEnvironmentalData({
      latitude: lat,
      longitude: lon,
      locationName,
      includeAirQuality: true,
      includeHourlyForecast: true,
      includeYesterdayComparison: true
    });
  } catch (e) {
    console.warn("[CompassionSignalsService] Weather error:", e);
  }

    // Fetch Past Health & Wellness Logs
    let pastScans: any[] = [];

  const currentTemp = envData ? `${Math.round(envData.currentExposome.tempC)}°C` : '28°C';
  const weatherCond = envData ? envData.currentExposome.weatherCondition : 'Partly Sunny';
  const uvIdx = envData ? envData.currentExposome.uvIndex : 5.0;
  const dewPt = envData ? `${envData.currentExposome.dewPointC}°C` : '22°C';
  const humidity = envData?.currentExposome?.humidityPercent ?? 70;
  const aqi = envData?.airQuality?.usAqi ?? 0;

  const peakUvToday = envData?.solarRadiationAndClouds?.uvIndexMaxToday ?? (uvIdx + 1.5);
  const maxTempToday = envData?.hourlyForecastNext24h?.peakTempHour?.tempC
    ? `${Math.round(envData.hourlyForecastNext24h.peakTempHour.tempC)}°C`
    : currentTemp;
  const afternoonOutlook = envData?.hourlyForecastNext24h?.afternoonWorseningNote || 'Stable conditions across the day';

  // Build string of what was suggested in ALL past intervals of today
  let earlierAdviceContextBlock = 'None (First refresh of the day).';
  if (earlierDayWindowsContext.length > 0) {
    earlierAdviceContextBlock = earlierDayWindowsContext
      .map(w => `[Interval: ${w.label}]:\n` + w.lines.map(l => `  - "${l}"`).join('\n'))
      .join('\n\n');
  }

  // Build System & User Prompt according to exact user specifications
  const systemInstruction = `You write Daily Focus lines for a health & vital home screen.

Brain-wise: home is glanced, not read. Working memory holds ~one actionable thought per line.
Every line must be concrete, specific, and directly useful for health, vitals, hydration, activity, recovery, and environmental wellness.

Max 90 characters a line, 60-80 suggested, 2 to 3 lines total.

VOICE & TONE:
- Practical, evidence-grounded, calm, health-focused.
- Every line MUST state a clear, specific health, vital, hydration, activity, or recovery action.
- Focus on heart rate, steps, hydration, sleep, stress, respiratory comfort, and environment impact.
- Glanced and understood in under two seconds.

STRICTLY PROHIBITED (Hard Ban):
1. NO FACE OR SKIN CARE: DO NOT mention skincare, face, serums, SPF, niacinamide, retinol, moisturizers, barrier creams, acne, or facial routines.
2. NO OBVIOUS WEATHER REPORTING: Connect weather/environment directly to vital health choices (e.g. "High heat increases cardiac effort — schedule heavy walks for early evening.").
3. NO VAGUE FLUFF OR PERSONIFICATION: NEVER say "your body craves love", "be gentle with yourself", "take gentle moments".
4. NO FILLER OR THROAT-CLEARING: No "Remember:", "Keep in mind:", "Don't forget:".
5. NO REPETITIVE PHRASES: Do not repeat user name or city.

HARD RULES:
- Output ONLY a JSON array of strings. No markdown, no prose outside JSON.
- Exactly 2 to 3 lines.
- Each line: max 80 characters (absolute hard limit 90).
- Focus on vitals, heart rate recovery, hydration targets, step goals, sleep hygiene, and environmental health guidance.

GOOD EXAMPLES:
["High humidity elevates exertion strain — sip electrolytes and pace afternoon walks.", "Moderate UV index today — stay hydrated and seek shade during peak hours."]
["Resting heart rate slightly elevated — prioritize early sleep and light stretching tonight.", "Hydration levels drop in AC air — aim for 2.5L water throughout the day."]`;

  const promptContent = `CURRENT TIME & DIURNAL INTERVAL:
- Local Time: ${localHour.toString().padStart(2, '0')}:00 (Current Interval: ${windowInfo.label})
- Interval Focus: ${windowInfo.periodDescription}
- Is Night/Dark: ${isNight}

ENVIRONMENTAL GROUND TRUTH (Location: ${locationName}):
- Current: ${currentTemp}, ${weatherCond}, UV ${uvIdx}, Dew point ${dewPt}, Humidity ${humidity}%, AQI ${aqi}
- Day-Long Forecast: Peak UV ${peakUvToday}, Peak Temp ${maxTempToday}, Outlook: "${afternoonOutlook}"

USER PROFILE & CONSTRAINTS (Internal understanding only — do NOT parrot stupidly):
- Preferred Name: ${preferredName}
- Goal / Priority: "${skincareGoals}" | "${skinPriorities}"
- Skin Note: "${userPerception}"
- Cycle / Incident: "${hormonalFactors}"
${universalNotepad ? `- Notepad Memory: "${universalNotepad}"` : ''}

SUGGESTIONS FROM ALL EARLIER INTERVALS TODAY (Maintain continuity, do not repeat identical lines, evolve gracefully):
${earlierAdviceContextBlock}

Generate 2 to 3 concise lines (each under 80 chars, absolute max 90). JSON array of strings only.`;

  let rawLines: string[] = [];
  try {
    const routerResult = await generateContentWithRouter({
      contents: promptContent,
      systemInstruction,
      temperature: 0.65,
      responseMimeType: "application/json",
      priority: LLMRequestPriority.BACKGROUND
    });

    const responseText = routerResult.text || '';
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        rawLines = parsed.map(s => String(s).trim()).filter(Boolean);
      }
    } catch {
      const cleanJsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        const fallbackArray = JSON.parse(cleanJsonStr);
        if (Array.isArray(fallbackArray)) {
          rawLines = fallbackArray.map(s => String(s).trim()).filter(Boolean);
        }
      } catch {}
    }
  } catch (llmErr) {
    console.warn("[CompassionSignalsService] LLM router error:", llmErr);
  }

  // Run Programmatic Post-LLM Guard
  const finalLines = runPostLlmGuard(rawLines, {
    userName: preferredName,
    cityName: locationName,
    isNight
  });

  const nowMs = Date.now();
  const timestampIso = new Date().toISOString();
  const signalId = `signal_${windowInfo.key}_${dateStr}_${nowMs}`;

  const resultObj: CompanionSignalResponse = {
    id: signalId,
    userId: safeUid,
    lines: finalLines,
    windowId: windowInfo.key,
    windowLabel: windowInfo.label,
    timestamp: timestampIso,
    cachedAt: timestampIso,
    enabled: true,
    contextMeta: {
      locationName,
      localHour,
      localTimeStr: `${localHour.toString().padStart(2, '0')}:00`,
      temperature: currentTemp,
      weatherCondition: weatherCond,
      uvIndex: Number(uvIdx),
      dewPoint: dewPt,
      peakUvToday: Number(peakUvToday),
      maxTempToday,
      afternoonTrend: afternoonOutlook,
      goalSummary: skincareGoals,
      scansCount: pastScans.length,
      lastScanDate: pastScans.length > 0 ? safeIsoString(pastScans[0].scanDate || pastScans[0].timestamp) : undefined,
      earlierDayWindowsCount: earlierDayWindowsContext.length
    }
  };

  // Update in-memory cache
  if (!DIURNAL_MEMORY_CACHE[safeUid] || DIURNAL_MEMORY_CACHE[safeUid].dateStr !== dateStr) {
    DIURNAL_MEMORY_CACHE[safeUid] = {
      dateStr,
      windows: { [windowInfo.key]: resultObj },
      lastUpdated: nowMs
    };
  } else {
    DIURNAL_MEMORY_CACHE[safeUid].windows[windowInfo.key] = resultObj;
    DIURNAL_MEMORY_CACHE[safeUid].lastUpdated = nowMs;
  }

  // Persist to Firestore
  try {
    if (db) {
      // 1. Update diurnal document with proper nested structure
      const dayDocRef = doc(db, 'users', safeUid, 'diurnal_signals', dateStr);
      await setDoc(dayDocRef, sanitizeForFirestore({
        dateStr,
        userId: safeUid,
        windows: {
          [windowInfo.key]: resultObj
        },
        lastUpdatedWindow: windowInfo.key,
        updatedAt: serverTimestamp()
      }), { merge: true });

      // 2. Also keep latest pointer
      const latestRef = doc(db, 'users', safeUid, 'companion_signals', 'latest');
      await setDoc(latestRef, sanitizeForFirestore({
        ...resultObj,
        updatedAt: serverTimestamp()
      }), { merge: true });

      // 3. Append history
      const historyCol = collection(db, 'users', safeUid, 'companion_signals_history');
      await addDoc(historyCol, sanitizeForFirestore({
        ...resultObj,
        createdAt: serverTimestamp()
      }));
    }
  } catch (fsErr: any) {
    if (fsErr?.message?.includes('Quota limit exceeded') || fsErr?.code === 'resource-exhausted') {
      console.warn("[CompassionSignalsService] Firestore persist skipped: daily free tier quota limit reached.");
    } else {
      console.warn("[CompassionSignalsService] Firestore persist warning:", fsErr);
    }
  }

  return resultObj;
}
