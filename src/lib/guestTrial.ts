import { doc, getDoc, setDoc, updateDoc, serverTimestamp, collection, getDocs, query, where } from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import { UserProfile, GuestScanAllowance } from '../types';

export const GUEST_USER_STORAGE_KEY = 'sana_guest_user_id';
export const GUEST_PROFILE_CACHE_KEY = 'sana_guest_profile_cache';

export interface GuestQuotaResult {
  allowed: boolean;
  status: 'ALLOWED' | 'DAILY_LIMIT_REACHED' | 'TOTAL_LIMIT_REACHED';
  totalScansDone: number;
  maxScans: number; // 2
  daysLimit: number; // 2
  todayScanned: boolean;
  scansRemaining: number;
  message: string;
}

/**
 * Derives a clean location name from timezone if IP lookup is unavailable
 */
export function formatTimezoneLocation(tz: string): string {
  if (!tz) return 'Global Explorer';
  const parts = tz.split('/');
  const city = parts[parts.length - 1]?.replace(/_/g, ' ');
  const region = parts[0]?.replace(/_/g, ' ');
  return city ? `${city} (${region})` : tz;
}

/**
 * Collect browser identification and location metadata without prompting permissions
 */
export async function collectBrowserIdentityInfo(): Promise<{
  timezone: string;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  browserFingerprint: Record<string, any>;
}> {
  const timezone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';
  let locationName = formatTimezoneLocation(timezone);
  let latitude: number | null = null;
  let longitude: number | null = null;

  // Check if we have cached IP coordinates
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const cached = localStorage.getItem('sana_cached_location');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.locationName) locationName = parsed.locationName;
        if (typeof parsed.lat === 'number') latitude = parsed.lat;
        if (typeof parsed.lon === 'number') longitude = parsed.lon;
      }
    } catch {}
  }

  // Silent IP Geolocation fallback (does not prompt user for GPS permissions)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://freeipapi.com/api/json', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.cityName || data.countryName) {
        const parts = [data.cityName, data.regionName, data.countryName].filter(Boolean);
        locationName = parts.join(', ');
      }
      if (typeof data.latitude === 'number' && !isNaN(data.latitude)) {
        latitude = data.latitude;
        longitude = data.longitude;
      }
    }
  } catch {
    // Network or timeout failure gracefully handled with timezone location
  }

  const browserFingerprint = {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'en',
    languages: typeof navigator !== 'undefined' ? (navigator.languages || [navigator.language]) : ['en'],
    screenResolution: typeof window !== 'undefined' && window.screen ? `${window.screen.width}x${window.screen.height}` : '1920x1080',
    platform: typeof navigator !== 'undefined' ? (navigator.platform || 'web') : 'web',
    timezone
  };

  return {
    timezone,
    locationName,
    latitude,
    longitude,
    browserFingerprint
  };
}

/**
 * Retrieves the stored guest ID or creates a persistent new one
 */
export function getStoredGuestId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return localStorage.getItem(GUEST_USER_STORAGE_KEY);
}

/**
 * Clears the guest session so the user can log in with a real account or switch accounts
 */
export function clearGuestSession(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const guestId = localStorage.getItem(GUEST_USER_STORAGE_KEY);
  localStorage.removeItem(GUEST_USER_STORAGE_KEY);
  localStorage.removeItem(GUEST_PROFILE_CACHE_KEY);
  if (guestId) {
    localStorage.removeItem(`sana_profile_${guestId}`);
    localStorage.removeItem(`sana_scans_${guestId}`);
  }
}

/**
 * Initializes or restores a Guest Trial User, registering in Firestore with browser info & location
 */
export async function initializeGuestTrialUser(): Promise<UserProfile> {
  let guestId = getStoredGuestId();
  if (!guestId) {
    const randomHex = Math.random().toString(36).substring(2, 9);
    const timeSuffix = Date.now().toString(36);
    guestId = `guest_trial_${timeSuffix}_${randomHex}`;
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(GUEST_USER_STORAGE_KEY, guestId);
    }
  }

  const identity = await collectBrowserIdentityInfo();
  const shortCode = guestId.replace('guest_trial_', '').substring(0, 6).toUpperCase();

  const defaultAllowance: GuestScanAllowance = {
    maxScans: 2,
    daysLimit: 2,
    totalScansDone: 0,
    scansCount: 0,
    firstScanDate: null,
    lastScanDate: null,
    scanDates: []
  };

  const initialProfile: UserProfile = {
    uid: guestId,
    displayName: `Judge / Guest Explorer (${shortCode})`,
    email: `${guestId}@trial.sana.app`,
    isAnonymous: true,
    isGuestTrial: true,
    accountType: 'guest_trial',
    timezone: identity.timezone,
    locationName: identity.locationName,
    browserFingerprint: identity.browserFingerprint,
    preferredName: 'Judge / Explorer',
    guestScanAllowance: defaultAllowance,
    settings: {
      temperatureUnit: 'C',
      scanNotificationTime: '00:00',
      scanReminderEnabled: true,
      theme: 'light',
      onboardingCompleted: true, // Bypass straight to home screen
      preferredName: 'Judge / Explorer',
      locationName: identity.locationName,
      latitude: identity.latitude ?? undefined,
      longitude: identity.longitude ?? undefined,
      isGuestTrial: true
    }
  };

  // Sync / Register to Firestore in background
  try {
    const userRef = doc(db, 'users', guestId);
    const existingSnap = await getDoc(userRef);
    if (!existingSnap.exists()) {
      await setDoc(userRef, sanitizeForFirestore({
        ...initialProfile,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    } else {
      const existingData = existingSnap.data();
      const mergedAllowance = existingData.guestScanAllowance || defaultAllowance;
      initialProfile.guestScanAllowance = mergedAllowance;
      if (existingData.displayName) initialProfile.displayName = existingData.displayName;
      if (existingData.settings) {
        initialProfile.settings = {
          ...initialProfile.settings,
          ...existingData.settings,
          onboardingCompleted: true,
          isGuestTrial: true
        };
      }

      await updateDoc(userRef, sanitizeForFirestore({
        updatedAt: serverTimestamp(),
        lastActiveAt: new Date().toISOString(),
        locationName: identity.locationName,
        timezone: identity.timezone,
        browserFingerprint: identity.browserFingerprint
      }));
    }
  } catch (err) {
    console.warn("[GuestTrial] Firestore registration note:", err);
  }

  // Cache to LocalStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(GUEST_PROFILE_CACHE_KEY, JSON.stringify(initialProfile));
      localStorage.setItem(`sana_profile_${guestId}`, JSON.stringify(initialProfile));
    } catch {}
  }

  return initialProfile;
}

/**
 * Validates the strict 2 scans across 2 days (1 scan per day) quota
 */
export function evaluateGuestScanQuota(scans: any[], guestAllowance?: GuestScanAllowance): GuestQuotaResult {
  const todayStr = new Date().toISOString().split('T')[0];
  const maxScans = 2;
  const daysLimit = 2;

  // Extract scan dates from scans collection and allowance
  const scanDatesList: string[] = [];

  if (Array.isArray(scans)) {
    scans.forEach(s => {
      let dStr = '';
      if (s.scanDate && typeof s.scanDate === 'string') {
        dStr = s.scanDate.split('T')[0];
      } else if (s.timestamp) {
        if (typeof s.timestamp === 'string') {
          dStr = s.timestamp.split('T')[0];
        } else if (s.timestamp.toDate && typeof s.timestamp.toDate === 'function') {
          dStr = s.timestamp.toDate().toISOString().split('T')[0];
        } else if (s.timestamp.seconds) {
          dStr = new Date(s.timestamp.seconds * 1000).toISOString().split('T')[0];
        }
      }
      if (dStr && !scanDatesList.includes(dStr)) {
        scanDatesList.push(dStr);
      }
    });
  }

  if (guestAllowance?.scanDates && Array.isArray(guestAllowance.scanDates)) {
    guestAllowance.scanDates.forEach(d => {
      if (d && !scanDatesList.includes(d)) scanDatesList.push(d);
    });
  }

  const totalScansDone = Math.max(
    Array.isArray(scans) ? scans.length : 0,
    guestAllowance?.totalScansDone || 0,
    guestAllowance?.scansCount || 0,
    scanDatesList.length
  );

  const todayScanned = scanDatesList.includes(todayStr);
  const scansRemaining = Math.max(0, maxScans - totalScansDone);

  if (totalScansDone >= maxScans) {
    return {
      allowed: false,
      status: 'TOTAL_LIMIT_REACHED',
      totalScansDone,
      maxScans,
      daysLimit,
      todayScanned,
      scansRemaining: 0,
      message: `Guest trial completed (${totalScansDone}/${maxScans} scans used). You have experienced the 2 trial scans. Please create an account for unlimited daily tracking.`
    };
  }

  if (todayScanned) {
    return {
      allowed: false,
      status: 'DAILY_LIMIT_REACHED',
      totalScansDone,
      maxScans,
      daysLimit,
      todayScanned: true,
      scansRemaining,
      message: `Daily trial scan limit reached. Guest trial is limited to 1 scan per day (2 days total). Your second scan will unlock tomorrow!`
    };
  }

  return {
    allowed: true,
    status: 'ALLOWED',
    totalScansDone,
    maxScans,
    daysLimit,
    todayScanned: false,
    scansRemaining,
    message: `Trial Scan ${totalScansDone + 1} of ${maxScans} available for today.`
  };
}

/**
 * Checks guest scan quota directly against Firestore database
 */
export async function checkGuestQuotaFromDb(userId: string): Promise<GuestQuotaResult> {
  const safeId = userId || 'guest_user';
  try {
    // 1. Fetch user doc allowance
    const userDocRef = doc(db, 'users', safeId);
    const userSnap = await getDoc(userDocRef);
    const allowance = userSnap.exists() ? userSnap.data().guestScanAllowance : undefined;

    // 2. Fetch user's facial scans
    const scansRef = collection(db, 'facial_scans');
    const q = query(scansRef, where('userId', '==', safeId));
    const snap = await getDocs(q);
    const scansList = snap.docs.map(d => d.data());

    return evaluateGuestScanQuota(scansList, allowance);
  } catch (err) {
    console.warn("[GuestTrial] Check quota DB error:", err);
    return {
      allowed: true,
      status: 'ALLOWED',
      totalScansDone: 0,
      maxScans: 2,
      daysLimit: 2,
      todayScanned: false,
      scansRemaining: 2,
      message: 'Trial Scan available.'
    };
  }
}
