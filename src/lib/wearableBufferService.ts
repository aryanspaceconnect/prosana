import { 
  WearableProviderId, 
  WearableProviderMeta, 
  WearableConnectionState, 
  WearableSample, 
  WearableBatchDocument, 
  WearableBatchSummary,
  WearableBufferState 
} from '../types';
import { db, sanitizeForFirestore } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';

declare global {
  interface Window {
    google?: any;
  }
}

export const WEARABLE_PROVIDERS: WearableProviderMeta[] = [
  {
    id: 'google_fit',
    name: 'Google Fit & Health Connect',
    category: 'primary',
    status: 'active',
    badge: 'Live Google OAuth & REST',
    icon: 'logos:google-fit',
    color: '#4285F4',
    description: 'Direct REST API integration with Google Fit & Android Health Connect. Syncs real heart rate, step counts, active energy burn, and sleep sessions.',
    metricsSupported: ['Step Count', 'Heart Rate (BPM)', 'Active Calories', 'Heart Minutes', 'Sleep Cycles']
  },
  {
    id: 'apple_health',
    name: 'Apple HealthKit & Watch',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'logos:apple',
    color: '#000000',
    description: 'Apple HealthKit requires iOS Companion App for local sandbox bridge. Direct Web API coming in companion release.',
    metricsSupported: ['HRV (SDNN)', 'Resting Heart Rate', 'SpO2 Blood Oxygen', 'Active Burn', 'Sleep Architecture']
  },
  {
    id: 'oura',
    name: 'Oura Ring (Gen 3 / Horizon)',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:ring-bold-duotone',
    color: '#10b981',
    description: 'Oura Cloud v2 OAuth Webhook integration in certification queue.',
    metricsSupported: ['Sleep Score', 'Readiness Index', 'Skin Temp Δ', 'Nightly HRV', 'Resting HR']
  },
  {
    id: 'whoop',
    name: 'Whoop 4.0 Strap',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:chart-square-bold-duotone',
    color: '#ef4444',
    description: 'Whoop Developer Platform OAuth webhook ingestion coming soon.',
    metricsSupported: ['Day Strain', 'Recovery Score', 'Resting HR', 'HRV Trends', 'Respiratory Rate']
  },
  {
    id: 'garmin',
    name: 'Garmin Connect Ecosystem',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:watch-round-bold-duotone',
    color: '#0284c7',
    description: 'Garmin Connect Health API OAuth push connector in development.',
    metricsSupported: ['Body Battery', 'Stress Score', 'VO2 Max', 'Cadence', 'Pulse Ox']
  },
  {
    id: 'fitbit',
    name: 'Fitbit by Google',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:heart-pulse-bold-duotone',
    color: '#0d9488',
    description: 'Migrating to unified Google Health REST API endpoints.',
    metricsSupported: ['Daily Readiness', 'Zone Minutes', 'Sleep Score', 'Skin Temp', 'Steps']
  },
  {
    id: 'samsung_health',
    name: 'Samsung Galaxy Watch',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:smart-watch-bold-duotone',
    color: '#6366f1',
    description: 'Samsung Privileged Health SDK web connector in review.',
    metricsSupported: ['BIA Body Comp', 'Heart Rate', 'SpO2', 'Sleep Score', 'Active Cal']
  },
  {
    id: 'polar',
    name: 'Polar Vantage & H10',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:heart-bold-duotone',
    color: '#f97316',
    description: 'Polar AccessLink API OAuth 2.0 connector coming soon.',
    metricsSupported: ['Nightly Recharge', 'Orthostatic HRV', 'Cardio Load', 'ECG HR']
  },
  {
    id: 'suunto',
    name: 'Suunto Race & Peak',
    category: 'coming_soon',
    status: 'coming_soon',
    badge: 'Coming Soon',
    icon: 'solar:compass-bold-duotone',
    color: '#8b5cf6',
    description: 'Suunto Cloud API webhook pipeline coming soon.',
    metricsSupported: ['Training Load', 'HRV Recovery', 'Altitude SpO2', 'Sleep Quality']
  }
];

const BUFFER_WINDOW_MINUTES = 20;

// Calculate genuine statistical summary strictly from real samples
export function calculateBatchSummary(samples: WearableSample[]): WearableBatchSummary {
  if (!samples || samples.length === 0) {
    return {
      avgHeartRate: 0,
      minHeartRate: 0,
      maxHeartRate: 0,
      avgHrv: 0,
      totalSteps: 0,
      totalActiveCalories: 0,
      avgSpo2: 0,
      avgStress: 0,
      sleepScore: undefined,
      readinessScore: undefined
    };
  }

  const hrVals = samples.map(s => s.heartRateBpm).filter((v): v is number => typeof v === 'number' && v > 0);
  const hrvVals = samples.map(s => s.hrvMs).filter((v): v is number => typeof v === 'number' && v > 0);
  const spo2Vals = samples.map(s => s.spo2Percent).filter((v): v is number => typeof v === 'number' && v > 0);
  const stressVals = samples.map(s => s.stressLevel).filter((v): v is number => typeof v === 'number' && v >= 0);

  const avgHeartRate = hrVals.length > 0 ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : 0;
  const minHeartRate = hrVals.length > 0 ? Math.min(...hrVals) : 0;
  const maxHeartRate = hrVals.length > 0 ? Math.max(...hrVals) : 0;
  const avgHrv = hrvVals.length > 0 ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : 0;
  const avgSpo2 = spo2Vals.length > 0 ? Math.round(spo2Vals.reduce((a, b) => a + b, 0) / spo2Vals.length) : 0;
  const avgStress = stressVals.length > 0 ? Math.round(stressVals.reduce((a, b) => a + b, 0) / stressVals.length) : 0;

  const totalSteps = samples.reduce((acc, s) => acc + (s.stepsDelta || 0), 0);
  const totalActiveCalories = Math.round(samples.reduce((acc, s) => acc + (s.activeCaloriesDelta || 0), 0));

  const readinessScore = avgHeartRate > 0 
    ? Math.min(99, Math.max(30, Math.round(((avgHrv || 50) * 0.7) + (100 - avgHeartRate) * 0.5)))
    : undefined;

  return {
    avgHeartRate,
    minHeartRate,
    maxHeartRate,
    avgHrv,
    totalSteps,
    totalActiveCalories,
    avgSpo2,
    avgStress,
    readinessScore
  };
}

// Client-side Wearables Manager for Real Google Fit Data & Batch Storage
class WearableBufferManager {
  private userId: string = 'guest_user';
  private connection: WearableConnectionState | null = null;
  private pendingSamples: WearableSample[] = [];
  private lastFlushedAt: string | null = null;
  private isSyncing: boolean = false;

  constructor() {
    this.restoreFromLocalStorage();
  }

  public setUserId(uid: string) {
    if (this.userId !== uid) {
      this.userId = uid;
      this.restoreFromLocalStorage();
      this.hydrateFromFirestore().catch(() => {});
    }
  }

  // Hydrate connection state and latest batches from Firestore if local cache is empty or fresh
  public async hydrateFromFirestore() {
    if (!this.userId || this.userId === 'guest_user') return;
    try {
      // 1. Fetch user wearable connection
      const userRef = doc(db, 'users', this.userId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData?.wearableConnection && !this.connection) {
          this.connection = userData.wearableConnection;
          this.persistToLocalStorage();
        }
      }

      // 2. Fetch latest wearable batch if no samples locally
      if (this.pendingSamples.length === 0) {
        const batchesRef = collection(db, 'users', this.userId, 'wearable_batches');
        const q = query(batchesRef, orderBy('createdAt', 'desc'), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const docData = snap.docs[0].data();
          if (Array.isArray(docData.samples) && docData.samples.length > 0) {
            this.pendingSamples = docData.samples;
            this.persistToLocalStorage();
            this.broadcastStateChange({ syncedAt: docData.endTime || docData.createdAt });
          }
        }
      }
    } catch (err) {
      console.warn('[WearableBuffer] Firestore hydration warning:', err);
    }
  }

  private getStorageKey(): string {
    return `prosana_wearable_buffer_${this.userId}`;
  }

  private getConnectionKey(): string {
    return `prosana_wearable_conn_${this.userId}`;
  }

  private restoreFromLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      const connRaw = localStorage.getItem(this.getConnectionKey());
      if (connRaw) {
        this.connection = JSON.parse(connRaw);
      }
      const bufferRaw = localStorage.getItem(this.getStorageKey());
      if (bufferRaw) {
        const parsed = JSON.parse(bufferRaw);
        this.pendingSamples = Array.isArray(parsed.samples) ? parsed.samples : [];
        this.lastFlushedAt = parsed.lastFlushedAt || null;
      }
    } catch (e) {
      console.warn('[WearableBuffer] Restore error:', e);
    }
  }

  private persistToLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify({
        samples: this.pendingSamples,
        lastFlushedAt: this.lastFlushedAt
      }));
      if (this.connection) {
        localStorage.setItem(this.getConnectionKey(), JSON.stringify(this.connection));
      } else {
        localStorage.removeItem(this.getConnectionKey());
      }
    } catch (e) {
      console.warn('[WearableBuffer] Persist error:', e);
    }
  }

  public getConnection(): WearableConnectionState | null {
    return this.connection;
  }

  // Real Google OAuth 2.0 Token Flow
  public async authorizeGoogleFit(customClientId?: string): Promise<{
    accessToken: string;
    expiresIn?: number;
    expiresAt?: number;
    tokenType?: string;
  }> {
    const clientId = customClientId || 
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
      '';

    if (!clientId) {
      throw new Error("Missing Google Client ID. Please set VITE_GOOGLE_CLIENT_ID in your environment or Settings.");
    }

    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services library is not loaded. Please ensure internet connectivity and reload.");
    }

    return new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: [
            'https://www.googleapis.com/auth/fitness.activity.read',
            'https://www.googleapis.com/auth/fitness.heart_rate.read',
            'https://www.googleapis.com/auth/fitness.body.read',
            'https://www.googleapis.com/auth/fitness.sleep.read'
          ].join(' '),
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error || 'Google authorization declined'));
            } else if (response.access_token) {
              const expiresIn = Number(response.expires_in) || 3600;
              const expiresAt = Date.now() + (expiresIn * 1000);
              resolve({
                accessToken: response.access_token,
                expiresIn,
                expiresAt,
                tokenType: response.token_type || 'Bearer'
              });
            } else {
              reject(new Error('No access token returned from Google Identity Services'));
            }
          },
          error_callback: (err: any) => {
            reject(new Error(err?.message || 'Google OAuth popup closed or blocked'));
          }
        });

        client.requestAccessToken({ prompt: 'consent' });
      } catch (err: any) {
        reject(err);
      }
    });
  }

  // Proactive Silent Renewal via Google Identity Services
  public async renewGoogleAccessTokenSilently(customClientId?: string): Promise<string | null> {
    const clientId = customClientId || 
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
      '';

    if (!clientId || !window.google?.accounts?.oauth2) {
      return null;
    }

    return new Promise((resolve) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: [
            'https://www.googleapis.com/auth/fitness.activity.read',
            'https://www.googleapis.com/auth/fitness.heart_rate.read',
            'https://www.googleapis.com/auth/fitness.body.read',
            'https://www.googleapis.com/auth/fitness.sleep.read'
          ].join(' '),
          callback: (response: any) => {
            if (response.access_token) {
              const expiresIn = Number(response.expires_in) || 3600;
              const expiresAt = Date.now() + (expiresIn * 1000);
              if (this.connection) {
                this.connection.accessToken = response.access_token;
                this.connection.expiresAt = expiresAt;
                this.connection.lastRefreshedAt = new Date().toISOString();
                this.connection.status = 'connected';
                this.connection.errorMessage = undefined;
                this.persistToLocalStorage();
              }
              resolve(response.access_token);
            } else {
              resolve(null);
            }
          },
          error_callback: () => resolve(null)
        });

        // Request token with empty prompt (silent re-auth if Google session active)
        client.requestAccessToken({ prompt: '' });
      } catch {
        resolve(null);
      }
    });
  }

  // Connect Google Fit with real OAuth token & expiration metadata
  public async connectGoogleFit(
    accessToken: string,
    email?: string,
    expiresIn: number = 3600,
    refreshToken?: string
  ): Promise<WearableConnectionState> {
    const now = new Date();
    const expiresAt = Date.now() + (expiresIn * 1000);

    const newConnection: WearableConnectionState = {
      provider: 'google_fit',
      status: 'connected',
      deviceName: 'Google Fit & Health Connect',
      batteryPercent: undefined,
      connectedAt: now.toISOString(),
      lastSyncedAt: now.toISOString(),
      autoSyncIntervalMinutes: BUFFER_WINDOW_MINUTES,
      accessToken,
      refreshToken,
      expiresAt,
      lastRefreshedAt: now.toISOString(),
      accountEmail: email
    };

    this.connection = newConnection;
    this.persistToLocalStorage();

    // Persist link to Firestore user document
    if (this.userId && this.userId !== 'guest_user') {
      try {
        const userRef = doc(db, 'users', this.userId);
        await setDoc(userRef, sanitizeForFirestore({
          wearableConnection: {
            provider: 'google_fit',
            status: 'connected',
            deviceName: 'Google Fit & Health Connect',
            connectedAt: newConnection.connectedAt,
            lastSyncedAt: newConnection.lastSyncedAt,
            expiresAt: newConnection.expiresAt,
            lastRefreshedAt: newConnection.lastRefreshedAt,
            accountEmail: email
          },
          updatedAt: serverTimestamp()
        }), { merge: true });
      } catch (err) {
        console.warn('[WearableBuffer] Firestore connection sync warning:', err);
      }
    }

    // Trigger initial real sync
    await this.syncRealGoogleFitData(accessToken);
    return this.connection;
  }

  // Ensures a valid, unexpired token exists before health fetching
  public async ensureFreshAccessToken(): Promise<string | null> {
    if (!this.connection || !this.connection.accessToken) {
      return null;
    }

    const expiresAt = this.connection.expiresAt;
    const safetyBufferMs = 5 * 60 * 1000; // 5 minutes before actual expiry

    // If token has an expiration and is nearing expiry, attempt silent renewal
    if (expiresAt && Date.now() >= (expiresAt - safetyBufferMs)) {
      console.log('[WearableBuffer] Token nearing expiry. Triggering proactive silent renewal...');
      
      // 1. Try server-side refresh if refresh_token is present
      if (this.connection.refreshToken) {
        try {
          const res = await fetch('/api/wearables/google-fit/refresh-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: this.userId,
              refreshToken: this.connection.refreshToken
            })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.accessToken) {
              this.connection.accessToken = data.accessToken;
              this.connection.expiresAt = data.expiresAt || (Date.now() + (data.expiresIn || 3600) * 1000);
              this.connection.lastRefreshedAt = new Date().toISOString();
              this.persistToLocalStorage();
              return data.accessToken;
            }
          }
        } catch (e) {
          console.warn('[WearableBuffer] Server token refresh error:', e);
        }
      }

      // 2. Try browser GSI silent renewal
      const silentToken = await this.renewGoogleAccessTokenSilently();
      if (silentToken) return silentToken;
    }

    return this.connection.accessToken;
  }

  // Execute real REST fetch from Google Fitness API with Token Auto-Renewal handling
  public async syncRealGoogleFitData(tokenOverride?: string): Promise<{
    success: boolean;
    samples: WearableSample[];
    summary: WearableBatchSummary;
    error?: string;
  }> {
    // Proactively verify & renew token if needed
    const validToken = tokenOverride || await this.ensureFreshAccessToken() || this.connection?.accessToken;

    if (!validToken) {
      return {
        success: false,
        samples: [],
        summary: calculateBatchSummary([]),
        error: "No active Google OAuth token. Please reconnect Google Fit."
      };
    }

    this.isSyncing = true;
    this.broadcastStateChange({ isSyncing: true });

    try {
      const now = new Date();
      const localStartOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      const res = await fetch('/api/wearables/google-fit/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          accessToken: validToken,
          refreshToken: this.connection?.refreshToken,
          expiresAt: this.connection?.expiresAt,
          startTimeMillis: localStartOfDay.getTime(),
          endTimeMillis: now.getTime()
        })
      });

      // Synchronize refreshed token from response headers if renewed by server
      const refreshedTokenHeader = res.headers.get('x-refreshed-access-token');
      const expiresAtHeader = res.headers.get('x-token-expires-at');
      if (refreshedTokenHeader && this.connection) {
        this.connection.accessToken = refreshedTokenHeader;
        if (expiresAtHeader) this.connection.expiresAt = Number(expiresAtHeader);
        this.connection.lastRefreshedAt = new Date().toISOString();
        this.persistToLocalStorage();
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        if (res.status === 401 || errJson.code === 'TOKEN_EXPIRED_REAUTH_REQUIRED') {
          // Attempt one automatic silent renewal
          const refreshedToken = await this.renewGoogleAccessTokenSilently();
          if (refreshedToken && !tokenOverride) {
            console.log('[WearableBuffer] Silently refreshed token after 401. Retrying sync...');
            return this.syncRealGoogleFitData(refreshedToken);
          }

          if (this.connection) {
            this.connection.status = 'error';
            this.connection.errorMessage = 'Google OAuth session expired. Please click to reconnect.';
            this.persistToLocalStorage();
          }
        }
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();
      const realSamples: WearableSample[] = data.samples || [];
      const summary = data.summary || calculateBatchSummary(realSamples);

      // If server returned refreshed token in JSON body, sync it
      if (data.tokenRefreshed && data.tokenExpiresAt && this.connection) {
        this.connection.expiresAt = data.tokenExpiresAt;
        this.connection.lastRefreshedAt = new Date().toISOString();
      }

      this.pendingSamples = realSamples;
      if (this.connection) {
        this.connection.status = 'connected';
        this.connection.lastSyncedAt = new Date().toISOString();
        this.connection.errorMessage = undefined;
      }
      this.persistToLocalStorage();

      // Flush real batch to Firestore subcollection if samples exist
      if (realSamples.length > 0 && this.userId && this.userId !== 'guest_user') {
        const now = new Date();
        const batchId = `google_fit_batch_${now.getTime()}`;
        const batchDoc: WearableBatchDocument = {
          userId: this.userId,
          batchId,
          provider: 'google_fit',
          startTime: realSamples[0]?.timestamp || now.toISOString(),
          endTime: realSamples[realSamples.length - 1]?.timestamp || now.toISOString(),
          durationMinutes: realSamples.length * 20,
          sampleCount: realSamples.length,
          summary,
          samples: realSamples,
          createdAt: now.toISOString()
        };

        const batchRef = doc(db, 'users', this.userId, 'wearable_batches', batchId);
        await setDoc(batchRef, sanitizeForFirestore({
          ...batchDoc,
          createdAt: serverTimestamp()
        })).catch(e => console.warn('[WearableBuffer] Batch write error:', e));
      }

      this.isSyncing = false;
      this.broadcastStateChange({ isSyncing: false, syncedAt: new Date().toISOString() });

      return {
        success: true,
        samples: realSamples,
        summary
      };
    } catch (err: any) {
      this.isSyncing = false;
      this.broadcastStateChange({ isSyncing: false, error: err?.message });
      return {
        success: false,
        samples: this.pendingSamples,
        summary: calculateBatchSummary(this.pendingSamples),
        error: err?.message || 'Failed to sync with Google Fit'
      };
    }
  }

  public async disconnectDevice(): Promise<void> {
    this.connection = null;
    this.pendingSamples = [];
    this.persistToLocalStorage();

    if (this.userId && this.userId !== 'guest_user') {
      try {
        const userRef = doc(db, 'users', this.userId);
        await setDoc(userRef, {
          wearableConnection: null,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('[WearableBuffer] Firestore disconnect error:', err);
      }
    }

    this.broadcastStateChange();
  }

  public getBufferState(): WearableBufferState {
    const nextFlushCountdownSeconds = Math.max(0, (BUFFER_WINDOW_MINUTES - this.pendingSamples.length) * 60);
    return {
      bufferWindowMinutes: BUFFER_WINDOW_MINUTES,
      currentSampleCount: this.pendingSamples.length,
      maxBufferSamples: BUFFER_WINDOW_MINUTES,
      pendingSamples: [...this.pendingSamples],
      lastFlushedAt: this.lastFlushedAt,
      nextFlushCountdownSeconds,
      isFlushing: this.isSyncing,
      activeConnection: this.connection
    };
  }

  private broadcastStateChange(extra?: any) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('prosana:wearables_updated', {
        detail: {
          state: this.getBufferState(),
          ...extra
        }
      }));
    }
  }
}

export const wearableBufferService = new WearableBufferManager();

// Helper to fetch consolidated telemetry for UI charts & AI Agent analysis
export async function getConsolidatedWearableTelemetry(userId: string): Promise<{
  connection: WearableConnectionState | null;
  summary: WearableBatchSummary;
  samples: WearableSample[];
  recentBatches: WearableBatchDocument[];
}> {
  wearableBufferService.setUserId(userId);
  const bufferState = wearableBufferService.getBufferState();
  const currentPending = bufferState.pendingSamples;

  let historicBatches: WearableBatchDocument[] = [];
  if (userId && userId !== 'guest_user') {
    try {
      const batchesRef = collection(db, 'users', userId, 'wearable_batches');
      const q = query(batchesRef, orderBy('createdAt', 'desc'), limit(5));
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        historicBatches.push(docSnap.data() as WearableBatchDocument);
      });
    } catch (err) {
      console.warn('[Wearables] Historic fetch warning:', err);
    }
  }

  let combinedSamples: WearableSample[] = [];
  if (historicBatches.length > 0) {
    combinedSamples = [...historicBatches[0].samples];
  }
  
  const existingTimestamps = new Set(combinedSamples.map(s => s.timestamp));
  for (const s of currentPending) {
    if (!existingTimestamps.has(s.timestamp)) {
      combinedSamples.push(s);
    }
  }

  combinedSamples.sort((a, b) => a.unixMs - b.unixMs);
  const summary = calculateBatchSummary(combinedSamples);

  return {
    connection: bufferState.activeConnection,
    summary,
    samples: combinedSamples,
    recentBatches: historicBatches
  };
}
