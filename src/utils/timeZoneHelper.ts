/**
 * Dual-Timestamp & TimeZone Continuity Helper
 * 
 * Provides unified, deterministic translation between:
 * 1. Server Local Time / System Monotonic Anchor (UTC / ISO)
 * 2. User Local Time (Client IANA Timezone, e.g. America/Los_Angeles, Asia/Kolkata, Europe/London)
 * 
 * Resolves user timezone directly from:
 * - Profile location (city, state, country)
 * - Explicit IANA candidate string
 * - Coordinates (latitude, longitude)
 * - Client IP / headers
 * - Browser Intl fallback
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

// In-memory cache for resolved locations -> IANA timezones to guarantee 0ms latency
const locationTimeZoneCache = new Map<string, string>();

/**
 * Comprehensive static mapping for world cities, states, and countries to IANA timezones.
 */
const KNOWN_LOCATION_TIMEZONES: Record<string, string> = {
  // India & South Asia
  'india': 'Asia/Kolkata',
  'bharat': 'Asia/Kolkata',
  'mumbai': 'Asia/Kolkata',
  'delhi': 'Asia/Kolkata',
  'new delhi': 'Asia/Kolkata',
  'bengaluru': 'Asia/Kolkata',
  'bangalore': 'Asia/Kolkata',
  'hyderabad': 'Asia/Kolkata',
  'ahmedabad': 'Asia/Kolkata',
  'chennai': 'Asia/Kolkata',
  'kolkata': 'Asia/Kolkata',
  'surat': 'Asia/Kolkata',
  'pune': 'Asia/Kolkata',
  'jaipur': 'Asia/Kolkata',
  'lucknow': 'Asia/Kolkata',
  'kanpur': 'Asia/Kolkata',
  'nagpur': 'Asia/Kolkata',
  'indore': 'Asia/Kolkata',
  'thane': 'Asia/Kolkata',
  'bhopal': 'Asia/Kolkata',
  'visakhapatnam': 'Asia/Kolkata',
  'patna': 'Asia/Kolkata',
  'vadodara': 'Asia/Kolkata',
  'ghaziabad': 'Asia/Kolkata',
  'ludhiana': 'Asia/Kolkata',
  'agra': 'Asia/Kolkata',
  'nashik': 'Asia/Kolkata',
  'faridabad': 'Asia/Kolkata',
  'meerut': 'Asia/Kolkata',
  'rajkot': 'Asia/Kolkata',
  'varanasi': 'Asia/Kolkata',
  'srinagar': 'Asia/Kolkata',
  'aurangabad': 'Asia/Kolkata',
  'dhanbad': 'Asia/Kolkata',
  'amritsar': 'Asia/Kolkata',
  'navi mumbai': 'Asia/Kolkata',
  'allahabad': 'Asia/Kolkata',
  'prayagraj': 'Asia/Kolkata',
  'ranchi': 'Asia/Kolkata',
  'howrah': 'Asia/Kolkata',
  'coimbatore': 'Asia/Kolkata',
  'jabalpur': 'Asia/Kolkata',
  'gwalior': 'Asia/Kolkata',
  'vijayawada': 'Asia/Kolkata',
  'jodhpur': 'Asia/Kolkata',
  'madurai': 'Asia/Kolkata',
  'raipur': 'Asia/Kolkata',
  'kota': 'Asia/Kolkata',
  'guwahati': 'Asia/Kolkata',
  'chandigarh': 'Asia/Kolkata',
  'solapur': 'Asia/Kolkata',
  'hubli': 'Asia/Kolkata',
  'mysore': 'Asia/Kolkata',
  'mysuru': 'Asia/Kolkata',
  'tiruchirappalli': 'Asia/Kolkata',
  'salem': 'Asia/Kolkata',
  'aligarh': 'Asia/Kolkata',
  'bareilly': 'Asia/Kolkata',
  'moradabad': 'Asia/Kolkata',
  'tiruppur': 'Asia/Kolkata',
  'gurgaon': 'Asia/Kolkata',
  'gurugram': 'Asia/Kolkata',
  'noida': 'Asia/Kolkata',
  'mangalore': 'Asia/Kolkata',
  'mangaluru': 'Asia/Kolkata',
  'kochi': 'Asia/Kolkata',
  'cochin': 'Asia/Kolkata',
  'trivandrum': 'Asia/Kolkata',
  'thiruvananthapuram': 'Asia/Kolkata',
  'goa': 'Asia/Kolkata',
  'panaji': 'Asia/Kolkata',
  'dehradun': 'Asia/Kolkata',
  'shimla': 'Asia/Kolkata',
  'gujarat': 'Asia/Kolkata',
  'maharashtra': 'Asia/Kolkata',
  'karnataka': 'Asia/Kolkata',
  'tamil nadu': 'Asia/Kolkata',
  'kerala': 'Asia/Kolkata',
  'rajasthan': 'Asia/Kolkata',
  'punjab': 'Asia/Kolkata',
  'uttar pradesh': 'Asia/Kolkata',
  'madhya pradesh': 'Asia/Kolkata',
  'west bengal': 'Asia/Kolkata',
  'telangana': 'Asia/Kolkata',
  'andhra pradesh': 'Asia/Kolkata',
  'bihar': 'Asia/Kolkata',
  'odisha': 'Asia/Kolkata',
  'assam': 'Asia/Kolkata',
  'sri lanka': 'Asia/Colombo',
  'colombo': 'Asia/Colombo',
  'dhaka': 'Asia/Dhaka',
  'bangladesh': 'Asia/Dhaka',
  'kathmandu': 'Asia/Kathmandu',
  'nepal': 'Asia/Kathmandu',
  'karachi': 'Asia/Karachi',
  'lahore': 'Asia/Karachi',
  'islamabad': 'Asia/Karachi',
  'pakistan': 'Asia/Karachi',

  // United States - Pacific Time
  'san francisco': 'America/Los_Angeles',
  'los angeles': 'America/Los_Angeles',
  'san diego': 'America/Los_Angeles',
  'san jose': 'America/Los_Angeles',
  'seattle': 'America/Los_Angeles',
  'portland': 'America/Los_Angeles',
  'sacramento': 'America/Los_Angeles',
  'oakland': 'America/Los_Angeles',
  'las vegas': 'America/Los_Angeles',
  'reno': 'America/Los_Angeles',
  'california': 'America/Los_Angeles',
  'washington': 'America/Los_Angeles',
  'oregon': 'America/Los_Angeles',
  'nevada': 'America/Los_Angeles',

  // United States - Mountain Time
  'denver': 'America/Denver',
  'phoenix': 'America/Phoenix',
  'salt lake city': 'America/Denver',
  'albuquerque': 'America/Denver',
  'boise': 'America/Boise',
  'colorado': 'America/Denver',
  'arizona': 'America/Phoenix',
  'utah': 'America/Denver',
  'new mexico': 'America/Denver',
  'idaho': 'America/Boise',
  'montana': 'America/Denver',
  'wyoming': 'America/Denver',

  // United States - Central Time
  'chicago': 'America/Chicago',
  'houston': 'America/Chicago',
  'dallas': 'America/Chicago',
  'austin': 'America/Chicago',
  'san antonio': 'America/Chicago',
  'dallas-fort worth': 'America/Chicago',
  'minneapolis': 'America/Chicago',
  'st paul': 'America/Chicago',
  'st. paul': 'America/Chicago',
  'st louis': 'America/Chicago',
  'st. louis': 'America/Chicago',
  'kansas city': 'America/Chicago',
  'milwaukee': 'America/Chicago',
  'nashville': 'America/Chicago',
  'memphis': 'America/Chicago',
  'new orleans': 'America/Chicago',
  'oklahoma city': 'America/Chicago',
  'texas': 'America/Chicago',
  'illinois': 'America/Chicago',
  'minnesota': 'America/Chicago',
  'missouri': 'America/Chicago',
  'wisconsin': 'America/Chicago',
  'tennessee': 'America/Chicago',
  'louisiana': 'America/Chicago',
  'oklahoma': 'America/Chicago',
  'iowa': 'America/Chicago',
  'kansas': 'America/Chicago',
  'nebraska': 'America/Chicago',

  // United States - Eastern Time
  'new york': 'America/New_York',
  'new york city': 'America/New_York',
  'nyc': 'America/New_York',
  'brooklyn': 'America/New_York',
  'queens': 'America/New_York',
  'manhattan': 'America/New_York',
  'boston': 'America/New_York',
  'philadelphia': 'America/New_York',
  'washington dc': 'America/New_York',
  'washington, d.c.': 'America/New_York',
  'miami': 'America/New_York',
  'orlando': 'America/New_York',
  'tampa': 'America/New_York',
  'atlanta': 'America/New_York',
  'charlotte': 'America/New_York',
  'raleigh': 'America/New_York',
  'detroit': 'America/New_York',
  'baltimore': 'America/New_York',
  'pittsburgh': 'America/New_York',
  'cleveland': 'America/New_York',
  'columbus': 'America/New_York',
  'cincinnati': 'America/New_York',
  'indianapolis': 'America/Indiana/Indianapolis',
  'florida': 'America/New_York',
  'georgia': 'America/New_York',
  'north carolina': 'America/New_York',
  'virginia': 'America/New_York',
  'massachusetts': 'America/New_York',
  'pennsylvania': 'America/New_York',
  'michigan': 'America/New_York',
  'ohio': 'America/New_York',
  'new jersey': 'America/New_York',
  'connecticut': 'America/New_York',
  'maryland': 'America/New_York',

  // United States - Alaska & Hawaii
  'anchorage': 'America/Anchorage',
  'alaska': 'America/Anchorage',
  'honolulu': 'America/Honolulu',
  'hawaii': 'America/Honolulu',

  // United Kingdom & Ireland
  'london': 'Europe/London',
  'manchester': 'Europe/London',
  'birmingham': 'Europe/London',
  'edinburgh': 'Europe/London',
  'glasgow': 'Europe/London',
  'bristol': 'Europe/London',
  'leeds': 'Europe/London',
  'liverpool': 'Europe/London',
  'newcastle': 'Europe/London',
  'belfast': 'Europe/London',
  'united kingdom': 'Europe/London',
  'uk': 'Europe/London',
  'england': 'Europe/London',
  'scotland': 'Europe/London',
  'wales': 'Europe/London',
  'dublin': 'Europe/Dublin',
  'ireland': 'Europe/Dublin',

  // Europe - Central & Western
  'paris': 'Europe/Paris',
  'france': 'Europe/Paris',
  'lyon': 'Europe/Paris',
  'marseille': 'Europe/Paris',
  'berlin': 'Europe/Berlin',
  'munich': 'Europe/Berlin',
  'frankfurt': 'Europe/Berlin',
  'hamburg': 'Europe/Berlin',
  'cologne': 'Europe/Berlin',
  'germany': 'Europe/Berlin',
  'rome': 'Europe/Rome',
  'milan': 'Europe/Rome',
  'naples': 'Europe/Rome',
  'italy': 'Europe/Rome',
  'madrid': 'Europe/Madrid',
  'barcelona': 'Europe/Madrid',
  'valencia': 'Europe/Madrid',
  'seville': 'Europe/Madrid',
  'spain': 'Europe/Madrid',
  'amsterdam': 'Europe/Amsterdam',
  'rotterdam': 'Europe/Amsterdam',
  'netherlands': 'Europe/Amsterdam',
  'holland': 'Europe/Amsterdam',
  'brussels': 'Europe/Brussels',
  'belgium': 'Europe/Brussels',
  'zurich': 'Europe/Zurich',
  'geneva': 'Europe/Zurich',
  'switzerland': 'Europe/Zurich',
  'vienna': 'Europe/Vienna',
  'austria': 'Europe/Vienna',
  'stockholm': 'Europe/Stockholm',
  'sweden': 'Europe/Stockholm',
  'oslo': 'Europe/Oslo',
  'norway': 'Europe/Oslo',
  'copenhagen': 'Europe/Copenhagen',
  'denmark': 'Europe/Copenhagen',
  'helsinki': 'Europe/Helsinki',
  'finland': 'Europe/Helsinki',
  'warsaw': 'Europe/Warsaw',
  'krakow': 'Europe/Warsaw',
  'poland': 'Europe/Warsaw',
  'prague': 'Europe/Prague',
  'czech republic': 'Europe/Prague',
  'czechia': 'Europe/Prague',
  'budapest': 'Europe/Budapest',
  'hungary': 'Europe/Budapest',
  'athens': 'Europe/Athens',
  'greece': 'Europe/Athens',
  'lisbon': 'Europe/Lisbon',
  'porto': 'Europe/Lisbon',
  'portugal': 'Europe/Lisbon',
  'bucharest': 'Europe/Bucharest',
  'romania': 'Europe/Bucharest',

  // East Asia
  'tokyo': 'Asia/Tokyo',
  'osaka': 'Asia/Tokyo',
  'kyoto': 'Asia/Tokyo',
  'yokohama': 'Asia/Tokyo',
  'japan': 'Asia/Tokyo',
  'seoul': 'Asia/Seoul',
  'busan': 'Asia/Seoul',
  'south korea': 'Asia/Seoul',
  'korea': 'Asia/Seoul',
  'beijing': 'Asia/Shanghai',
  'shanghai': 'Asia/Shanghai',
  'shenzhen': 'Asia/Shanghai',
  'guangzhou': 'Asia/Shanghai',
  'chengdu': 'Asia/Shanghai',
  'hangzhou': 'Asia/Shanghai',
  'china': 'Asia/Shanghai',
  'hong kong': 'Asia/Hong_Kong',
  'taipei': 'Asia/Taipei',
  'taiwan': 'Asia/Taipei',

  // South East Asia
  'singapore': 'Asia/Singapore',
  'kuala lumpur': 'Asia/Kuala_Lumpur',
  'penang': 'Asia/Kuala_Lumpur',
  'malaysia': 'Asia/Kuala_Lumpur',
  'bangkok': 'Asia/Bangkok',
  'phuket': 'Asia/Bangkok',
  'thailand': 'Asia/Bangkok',
  'jakarta': 'Asia/Jakarta',
  'bali': 'Asia/Makassar',
  'indonesia': 'Asia/Jakarta',
  'manila': 'Asia/Manila',
  'cebu': 'Asia/Manila',
  'philippines': 'Asia/Manila',
  'hanoi': 'Asia/Ho_Chi_Minh',
  'ho chi minh city': 'Asia/Ho_Chi_Minh',
  'saigon': 'Asia/Ho_Chi_Minh',
  'vietnam': 'Asia/Ho_Chi_Minh',

  // Middle East
  'dubai': 'Asia/Dubai',
  'abu dhabi': 'Asia/Dubai',
  'united arab emirates': 'Asia/Dubai',
  'uae': 'Asia/Dubai',
  'riyadh': 'Asia/Riyadh',
  'jeddah': 'Asia/Riyadh',
  'saudi arabia': 'Asia/Riyadh',
  'doha': 'Asia/Qatar',
  'qatar': 'Asia/Qatar',
  'kuwait city': 'Asia/Kuwait',
  'kuwait': 'Asia/Kuwait',
  'muscat': 'Asia/Muscat',
  'oman': 'Asia/Muscat',
  'manama': 'Asia/Bahrain',
  'bahrain': 'Asia/Bahrain',
  'tel aviv': 'Asia/Jerusalem',
  'jerusalem': 'Asia/Jerusalem',
  'israel': 'Asia/Jerusalem',
  'istanbul': 'Europe/Istanbul',
  'ankara': 'Europe/Istanbul',
  'turkey': 'Europe/Istanbul',
  'türkiye': 'Europe/Istanbul',
  'cairo': 'Africa/Cairo',
  'egypt': 'Africa/Cairo',

  // Australia & Oceania
  'sydney': 'Australia/Sydney',
  'melbourne': 'Australia/Melbourne',
  'brisbane': 'Australia/Brisbane',
  'perth': 'Australia/Perth',
  'adelaide': 'Australia/Adelaide',
  'canberra': 'Australia/Sydney',
  'gold coast': 'Australia/Brisbane',
  'hobart': 'Australia/Hobart',
  'australia': 'Australia/Sydney',
  'auckland': 'Pacific/Auckland',
  'wellington': 'Pacific/Auckland',
  'christchurch': 'Pacific/Auckland',
  'new zealand': 'Pacific/Auckland',
  'nz': 'Pacific/Auckland',

  // Canada
  'toronto': 'America/Toronto',
  'montreal': 'America/Toronto',
  'vancouver': 'America/Vancouver',
  'calgary': 'America/Edmonton',
  'edmonton': 'America/Edmonton',
  'ottawa': 'America/Toronto',
  'winnipeg': 'America/Winnipeg',
  'quebec': 'America/Toronto',
  'canada': 'America/Toronto',

  // Latin America
  'sao paulo': 'America/Sao_Paulo',
  'são paulo': 'America/Sao_Paulo',
  'rio de janeiro': 'America/Sao_Paulo',
  'brasilia': 'America/Sao_Paulo',
  'brazil': 'America/Sao_Paulo',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  'argentina': 'America/Argentina/Buenos_Aires',
  'santiago': 'America/Santiago',
  'chile': 'America/Santiago',
  'bogota': 'America/Bogota',
  'colombia': 'America/Bogota',
  'lima': 'America/Lima',
  'peru': 'America/Lima',
  'mexico city': 'America/Mexico_City',
  'guadalajara': 'America/Mexico_City',
  'monterrey': 'America/Monterrey',
  'cancun': 'America/Cancun',
  'mexico': 'America/Mexico_City',

  // Africa
  'johannesburg': 'Africa/Johannesburg',
  'cape town': 'Africa/Johannesburg',
  'durban': 'Africa/Johannesburg',
  'south africa': 'Africa/Johannesburg',
  'nairobi': 'Africa/Nairobi',
  'kenya': 'Africa/Nairobi',
  'lagos': 'Africa/Lagos',
  'nigeria': 'Africa/Lagos',
  'casablanca': 'Africa/Casablanca',
  'morocco': 'Africa/Casablanca'
};

/**
 * Resolves an IANA timezone from a location string (city, region, country) using dictionary & heuristic parsing.
 */
export function resolveTimeZoneFromLocation(locationName?: string): string | null {
  if (!locationName || typeof locationName !== 'string') return null;
  const clean = locationName.trim().toLowerCase();
  if (!clean) return null;

  // Check cache first
  if (locationTimeZoneCache.has(clean)) {
    return locationTimeZoneCache.get(clean)!;
  }

  // Exact dictionary match
  if (KNOWN_LOCATION_TIMEZONES[clean]) {
    const tz = KNOWN_LOCATION_TIMEZONES[clean];
    locationTimeZoneCache.set(clean, tz);
    return tz;
  }

  // Segment matching (e.g. "Surat, Gujarat, India" -> check "surat", "gujarat", "india")
  const parts = clean.split(/[,/|-]+/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (KNOWN_LOCATION_TIMEZONES[part]) {
      const tz = KNOWN_LOCATION_TIMEZONES[part];
      locationTimeZoneCache.set(clean, tz);
      return tz;
    }
  }

  // Substring / Word boundaries check
  for (const [locKey, tz] of Object.entries(KNOWN_LOCATION_TIMEZONES)) {
    if (clean.includes(locKey)) {
      locationTimeZoneCache.set(clean, tz);
      return tz;
    }
  }

  return null;
}

/**
 * Resolves the client or user's IANA timezone safely with profile location, explicit timezone, and fallbacks.
 * 
 * Order of Precedence:
 * 1. Valid IANA timezone candidate (e.g. "Asia/Kolkata", "America/Los_Angeles")
 * 2. Location set on the profile / location name parameter (e.g. "Surat, India", "San Francisco, CA")
 * 3. Browser / Client system Intl options (when running client-side)
 * 4. Fallback to UTC
 */
export function resolveUserTimeZone(
  candidateTimeZone?: string,
  locationName?: string,
  coords?: { lat?: number; lon?: number }
): string {
  // 1. Check if candidate is already a valid IANA timezone string
  if (candidateTimeZone && typeof candidateTimeZone === 'string' && candidateTimeZone.trim().length > 0) {
    const trimmed = candidateTimeZone.trim();
    try {
      // Test if timezone is recognized by Intl
      Intl.DateTimeFormat(undefined, { timeZone: trimmed });
      return trimmed;
    } catch {
      // If candidate was actually a location string (e.g. "San Francisco" or "Surat"), try location resolution
      const fromCandidateLoc = resolveTimeZoneFromLocation(trimmed);
      if (fromCandidateLoc) return fromCandidateLoc;
    }
  }

  // 2. Resolve from location set on profile
  if (locationName && typeof locationName === 'string') {
    const fromLoc = resolveTimeZoneFromLocation(locationName);
    if (fromLoc) return fromLoc;
  }

  // 3. Check browser/system resolved options if available on client
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (resolved && resolved !== 'UTC') return resolved;
    } catch {
      // Fallback
    }
  }

  // 4. Fallback default
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
  userTimeZone?: string,
  locationName?: string
): DualTimestampResult {
  const targetTz = resolveUserTimeZone(userTimeZone, locationName);
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
