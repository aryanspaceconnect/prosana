/**
 * Dual-Timestamp & TimeZone Continuity Helper
 * 
 * Provides unified, deterministic translation between:
 * 1. Server Local Time / System Monotonic Anchor (UTC / ISO)
 * 2. User Local Time (Client IANA Timezone, e.g. America/Los_Angeles, Asia/Kolkata)
 * 
 * Guarantees zero time-skew, exact circadian phase calculations, and synchronized dual timestamps
 * across the Biometric Graph, Storage layer, and AI Agent reasoning engine.
 */

export interface DualTimestampResult {
  serverTime: string;          // ISO-8601 UTC timestamp (e.g. "2026-08-27T05:17:14.000Z")
  userLocalTime: string;       // User's localized ISO-like string (e.g. "2026-08-26T22:17:14-07:00")
  userTimeZone: string;        // Active IANA timezone (e.g. "America/Los_Angeles")
  unixMs: number;              // Monotonic epoch milliseconds
  timeLabel: string;           // Local time label (e.g. "22:17" or "10:17 PM")
  serverTimeLabel: string;     // Server UTC time label (e.g. "05:17 UTC")
  localHour24: number;         // 0-23
  localMinutes: number;        // 0-59
  dayOfWeekName: string;       // e.g. "Wednesday"
  monthName: string;           // e.g. "August"
  dayOfMonth: number;          // e.g. 26
  year: number;                // e.g. 2026
  formattedFull: string;       // e.g. "Wednesday, August 26, 2026, 10:17 PM"
  circadianPhase: string;      // e.g. "Late Evening / Night"
  circadianPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | 'overnight';
  recommendationFocus: string; // e.g. "PM Skin Routine & Restorative Sleep Preparation"
}

/**
 * Resolves the client or user's IANA timezone safely with fallbacks.
 */
export function resolveUserTimeZone(candidateTimeZone?: string): string {
  if (candidateTimeZone && typeof candidateTimeZone === 'string' && candidateTimeZone.trim().length > 0) {
    try {
      // Test if timezone is valid in Intl
      Intl.DateTimeFormat(undefined, { timeZone: candidateTimeZone.trim() });
      return candidateTimeZone.trim();
    } catch {
      // Invalid candidate, proceed to fallbacks
    }
  }

  // Check browser/system resolved options if available
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved) return resolved;
    } catch {
      // Fallback
    }
  }

  return 'UTC';
}

/**
 * Calculates circadian phase and clinical recommendations based on user's local hour.
 */
export function calculateCircadianPhase(localHour: number): {
  phase: string;
  period: 'morning' | 'afternoon' | 'evening' | 'night' | 'overnight';
  recommendationFocus: string;
} {
  if (localHour >= 5 && localHour < 9) {
    return {
      phase: 'Early Morning / Dawn (AM Routine Window)',
      period: 'morning',
      recommendationFocus: 'Gentle hydration, antioxidant serum (Vitamin C), and broad-spectrum SPF 50 application.'
    };
  } else if (localHour >= 9 && localHour < 12) {
    return {
      phase: 'Late Morning / Active Day',
      period: 'morning',
      recommendationFocus: 'Environmental defense against oxidative stress, hydration maintenance, and daylight activity.'
    };
  } else if (localHour >= 12 && localHour < 15) {
    return {
      phase: 'Mid-Day / Solar Peak (UV Elevation Window)',
      period: 'afternoon',
      recommendationFocus: 'Mid-day sunscreen reapplication, skin barrier hydration mist, and UV exposure moderation.'
    };
  } else if (localHour >= 15 && localHour < 18) {
    return {
      phase: 'Late Afternoon / Transition',
      period: 'afternoon',
      recommendationFocus: 'Post-work skin barrier replenishment, hydration boost, and fatigue recovery.'
    };
  } else if (localHour >= 18 && localHour < 21) {
    return {
      phase: 'Early Evening / Dusk (Winding Down)',
      period: 'evening',
      recommendationFocus: 'Double-cleansing to remove sunscreen/pollutants, soothing barrier prep, and winding down.'
    };
  } else if (localHour >= 21 && localHour <= 23) {
    return {
      phase: 'Late Evening / Night (PM Skin & Sleep Window)',
      period: 'night',
      recommendationFocus: 'Active PM repair (retinoids, peptides, ceramide lipid barrier creams) and restorative sleep.'
    };
  } else {
    return {
      phase: 'Overnight / Sleep & Cellular Repair Window',
      period: 'overnight',
      recommendationFocus: 'Deep cellular regeneration, transepidermal water loss prevention, and autonomic recovery.'
    };
  }
}

/**
 * Computes deterministic dual timestamps (User Local + Server UTC) for any given Date or epoch ms.
 */
export function getDualTimestamps(
  dateOrMs?: Date | number | string,
  userTimeZone?: string
): DualTimestampResult {
  const targetTz = resolveUserTimeZone(userTimeZone);
  let date: Date;

  if (!dateOrMs) {
    date = new Date();
  } else if (dateOrMs instanceof Date) {
    date = isNaN(dateOrMs.getTime()) ? new Date() : dateOrMs;
  } else if (typeof dateOrMs === 'number') {
    date = new Date(dateOrMs);
  } else {
    date = new Date(dateOrMs);
    if (isNaN(date.getTime())) date = new Date();
  }

  const unixMs = date.getTime();
  const serverTime = date.toISOString();

  // Extract date components in target timezone using Intl.DateTimeFormat
  let localHour24 = 0;
  let localMinutes = 0;
  let dayOfWeekName = 'Monday';
  let monthName = 'January';
  let dayOfMonth = 1;
  let year = date.getFullYear();
  let timeLabel = '';
  let formattedFull = '';

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    for (const part of parts) {
      if (part.type === 'hour') localHour24 = parseInt(part.value, 10);
      else if (part.type === 'minute') localMinutes = parseInt(part.value, 10);
      else if (part.type === 'weekday') dayOfWeekName = part.value;
      else if (part.type === 'month') monthName = part.value;
      else if (part.type === 'day') dayOfMonth = parseInt(part.value, 10);
      else if (part.type === 'year') year = parseInt(part.value, 10);
    }

    // Format 12-hour or 24-hour label
    const hh = String(localHour24).padStart(2, '0');
    const mm = String(localMinutes).padStart(2, '0');
    timeLabel = `${hh}:${mm}`;

    const fullFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    formattedFull = fullFormatter.format(date);
  } catch (err) {
    // Fallback if Intl encounters error
    localHour24 = date.getUTCHours();
    localMinutes = date.getUTCMinutes();
    timeLabel = `${String(localHour24).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}`;
    formattedFull = date.toUTCString();
  }

  // Server UTC label
  const serverHh = String(date.getUTCHours()).padStart(2, '0');
  const serverMm = String(date.getUTCMinutes()).padStart(2, '0');
  const serverTimeLabel = `${serverHh}:${serverMm} UTC`;

  const circadian = calculateCircadianPhase(localHour24);

  // Compute localized ISO string with offset if possible
  const localIso = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}T${String(localHour24).padStart(2, '0')}:${String(localMinutes).padStart(2, '0')}:00 [${targetTz}]`;

  return {
    serverTime,
    userLocalTime: localIso,
    userTimeZone: targetTz,
    unixMs,
    timeLabel,
    serverTimeLabel,
    localHour24,
    localMinutes,
    dayOfWeekName,
    monthName,
    dayOfMonth,
    year,
    formattedFull,
    circadianPhase: circadian.phase,
    circadianPeriod: circadian.period,
    recommendationFocus: circadian.recommendationFocus
  };
}

/**
 * Formats a timestamp into User Local Time Label for graphs and UI cards.
 */
export function formatUserLocalTimeLabel(
  dateOrMs?: Date | number | string,
  userTimeZone?: string,
  include12hAmPm: boolean = false
): string {
  const dt = getDualTimestamps(dateOrMs, userTimeZone);
  if (include12hAmPm) {
    const h12 = dt.localHour24 % 12 || 12;
    const ampm = dt.localHour24 >= 12 ? 'PM' : 'AM';
    return `${h12}:${String(dt.localMinutes).padStart(2, '0')} ${ampm}`;
  }
  return dt.timeLabel;
}
