import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { runSanaAgent } from "./src/agent/SanaAgent.js";
import { executeActionProposal } from "./src/agent/workspace.js";
import { generateContentWithRouter, generateContentStreamWithRouter } from "./src/agent/llmRouter.js";
import { executeWebSearch } from "./src/agent/searchService.js";
import { performExaSearch, performExaContents, performExaAnswer } from "./src/agent/exaSearchService.js";
import { mcpManager } from "./src/agent/mcp/McpManager.js";
import { getBaselineWeatherData, searchLocations, reverseGeocode } from "./src/agent/services/WeatherAwarenessEngine.js";
import { saveChatMessage } from "./src/lib/firebase.js";
import { getUniversalNotepad } from "./src/agent/universalNotepad.js";
import { getOrGenerateCompanionSignals } from "./src/agent/services/companionSignalsService.js";
import {
  withValidGoogleToken,
  getOrRenewValidToken,
  refreshGoogleAccessToken,
  exchangeAuthCodeForTokens,
  getStoredToken,
  saveStoredToken,
  isTokenExpired,
  SAFETY_BUFFER_MS
} from "./src/services/googleFitTokenManager.js";
import { ServerBiometricEngine } from "./src/services/biometricEngine.js";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK lazily / safely
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Gemini API calls will fail or use fallback response.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Health Check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "prosana AI Backend", timestamp: new Date().toISOString() });
});

// Google OAuth Compliance: Privacy Policy & Terms Endpoints
app.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>prosana - Privacy Policy</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 28px; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 18px; color: #334155; margin-top: 28px; }
    p, li { font-size: 15px; color: #475569; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
  </style>
</head>
<body>
  <h1>prosana Privacy Policy</h1>
  <p><strong>Effective Date:</strong> August 26, 2026</p>
  <div class="card">
    <p>prosana ("we", "our", or "us") is dedicated to protecting your privacy and health data. This Privacy Policy details how we handle information obtained through your authorized integration with Google Fit and Google Health APIs.</p>
  </div>
  
  <h2>1. Data We Access & Collect</h2>
  <p>When you explicitly authorize prosana to connect with Google Fit / Health Connect, we access only the read-only scopes you approve:</p>
  <ul>
    <li><strong>Activity & Steps:</strong> Step count, cadence, and active caloric expenditure.</li>
    <li><strong>Vitals:</strong> Continuous heart rate (BPM) and daily resting heart rate.</li>
    <li><strong>Sleep:</strong> Sleep session durations and cycle architecture.</li>
  </ul>

  <h2>2. How We Use Your Data</h2>
  <p>Your health and fitness metrics are used strictly to provide you with personal biometrics analysis, 20-minute batch telemetry visualizations, and AI health coaching within your prosana workspace.</p>

  <h2>3. Google User Data Policy Compliance (Limited Use)</h2>
  <p>prosana complies strictly with the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank">Google API Services User Data Policy</a>, including the Limited Use requirements. We do <strong>not</strong> sell your data to third parties, use your data for advertising, or share your raw biometrics with unauthorized services.</p>

  <h2>4. Data Storage & Deletion</h2>
  <p>Your biometrics are stored securely in your private cloud partition. You can disconnect your Google account and purge stored biometrics at any time from the Wearables Hub in the application.</p>

  <h2>5. Contact</h2>
  <p>For questions or data deletion requests, contact: <a href="mailto:aryandusane8888@gmail.com">aryandusane8888@gmail.com</a></p>
</body>
</html>`);
});

app.get("/terms", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>prosana - Terms of Service</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; max-width: 800px; margin: 40px auto; padding: 0 20px; }
    h1 { font-size: 28px; color: #0f172a; margin-bottom: 8px; }
    h2 { font-size: 18px; color: #334155; margin-top: 28px; }
    p, li { font-size: 15px; color: #475569; }
  </style>
</head>
<body>
  <h1>prosana Terms of Service</h1>
  <p><strong>Effective Date:</strong> August 26, 2026</p>
  <p>By using prosana and connecting wearable devices or Google Fit, you agree to these terms. prosana provides AI-assisted wellness tracking and health insights for informational purposes only. It is not a substitute for professional medical diagnosis or clinical healthcare.</p>
</body>
</html>`);
});

// ==========================================
// OPEN WEARABLES INGESTION & BATCH ENDPOINTS
// ==========================================

// In-memory server-side buffer cache for ultra-fast telemetry serving and deduplication
const serverWearableBufferMap = new Map<string, {
  userId: string;
  provider: string;
  lastUpdated: string;
  samples: Array<{
    timestamp: string;
    unixMs: number;
    heartRateBpm?: number;
    hrvMs?: number;
    stepsDelta?: number;
    activeCaloriesDelta?: number;
    spo2Percent?: number;
    respiratoryRate?: number;
    stressLevel?: number;
  }>;
}>();

// 1. Providers Registry (Google Fit is live & active; other ecosystems marked Coming Soon)
app.get("/api/wearables/providers", (_req, res) => {
  res.json({
    status: "ok",
    providers: [
      {
        id: 'google_fit',
        name: 'Google Fit & Health Connect',
        category: 'primary',
        status: 'active',
        badge: 'Live Google OAuth & REST',
        icon: 'logos:google-fit',
        color: '#4285F4',
        description: 'Direct REST API integration with Google Fit & Android Health Connect cloud pipelines. Syncs real heart rate, step count, active energy, and sleep sessions.',
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
        description: 'Apple HealthKit requires iOS Companion App for HealthKit bridge. Direct web REST API currently under private beta preview.',
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
        description: 'Oura Cloud v2 OAuth Webhook integration currently in certification queue.',
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
        description: 'Whoop Developer Platform OAuth webhook ingestion pipeline coming in next update.',
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
        description: 'Garmin Connect Enterprise Health API OAuth push pipeline coming soon.',
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
        description: 'Transitioning to unified Google Health REST API endpoints.',
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
        description: 'Samsung Privileged Health SDK web connector in partner review.',
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
    ]
  });
});

// Activity Type Mapping for Google Fit API
const GOOGLE_FIT_ACTIVITY_MAP: Record<number, string> = {
  0: 'In Vehicle',
  1: 'Biking',
  2: 'On Foot',
  3: 'Still (Resting)',
  4: 'Unknown Activity',
  5: 'Tilting',
  7: 'Walking',
  8: 'Running',
  9: 'Aerobics',
  10: 'Badminton',
  11: 'Baseball',
  12: 'Basketball',
  13: 'Biathlon',
  14: 'Handbiking',
  15: 'Mountain Biking',
  16: 'Road Biking',
  17: 'Spinning',
  18: 'Stationary Biking',
  19: 'Utility Biking',
  20: 'Boxing',
  21: 'Calisthenics',
  22: 'Circuit Training',
  23: 'Cricket',
  24: 'Dancing',
  25: 'Elliptical',
  26: 'Fencing',
  27: 'Football (American)',
  28: 'Football (Australian)',
  29: 'Football (Soccer)',
  30: 'Frisbee',
  31: 'Gardening',
  32: 'Golf',
  33: 'Gymnastics',
  34: 'Handball',
  35: 'HIIT',
  36: 'Hiking',
  37: 'Hockey',
  38: 'Horseback Riding',
  39: 'Housework',
  40: 'Ice Skating',
  41: 'Jumping Rope',
  42: 'Kayaking',
  43: 'Kettlebell Training',
  44: 'Kickboxing',
  45: 'Kitesurfing',
  46: 'Martial Arts',
  47: 'Meditation',
  48: 'Mixed Martial Arts',
  49: 'P90X',
  50: 'Paragliding',
  51: 'Pilates',
  52: 'Polo',
  53: 'Racquetball',
  54: 'Rock Climbing',
  55: 'Rowing',
  56: 'Rowing Machine',
  57: 'Rugby',
  58: 'Running (Jogging)',
  59: 'Running (Sand)',
  60: 'Running (Treadmill)',
  61: 'Sailing',
  62: 'Scuba Diving',
  63: 'Skateboarding',
  64: 'Skating',
  65: 'Cross Skating',
  66: 'Indoor Skating',
  67: 'Inline Skating',
  68: 'Skiing',
  72: 'Sleeping',
  73: 'Light Sleep',
  74: 'Deep Sleep',
  75: 'REM Sleep',
  76: 'Awake (during sleep)',
  80: 'Strength Training',
  82: 'Surfing',
  83: 'Swimming',
  86: 'Table Tennis',
  87: 'Tennis',
  93: 'Volleyball',
  96: 'Water Polo',
  97: 'Weightlifting',
  98: 'Wheelchair',
  99: 'Windsurfing',
  100: 'Yoga',
  108: 'Other Activity',
  109: 'Light sleep',
  110: 'Deep sleep',
  111: 'REM sleep',
  112: 'Awake'
};

const GOOGLE_FIT_SLEEP_STAGE_MAP: Record<number, string> = {
  1: 'awake',
  2: 'sleeping',
  3: 'out_of_bed',
  4: 'light',
  5: 'deep',
  6: 'rem'
};

// 2. Real Google Fit REST API Live Sync (Comprehensive Multi-Metric Ingestion)
app.post("/api/wearables/google-fit/sync", withValidGoogleToken(async (req, res, tokenContext) => {
  const { startTimeMillis, endTimeMillis, userTimeZone } = req.body;
  const { userId, accessToken, expiresAt, refreshed } = tokenContext;
  const clientTimeZone = userTimeZone || (req.headers["x-user-timezone"] as string) || undefined;

  // Default time window: Today (start of day to now)
  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startMs = Number(startTimeMillis) || startOfDay.getTime();
  const endMs = Number(endTimeMillis) || now;

  // Comprehensive aggregate request across all Google Fit health and movement data types
  const aggregatePayload = {
    aggregateBy: [
      { dataTypeName: "com.google.step_count.delta" },
      { dataTypeName: "com.google.calories.expended" },
      { dataTypeName: "com.google.calories.bmr" },
      { dataTypeName: "com.google.heart_rate.bpm" },
      { dataTypeName: "com.google.heart_minutes" },
      { dataTypeName: "com.google.distance.delta" },
      { dataTypeName: "com.google.speed" },
      { dataTypeName: "com.google.hydration" },
      { dataTypeName: "com.google.sleep.segment" },
      { dataTypeName: "com.google.activity.segment" }
    ],
    bucketByTime: { durationMillis: 1200000 }, // Exactly 20-minute buckets
    startTimeMillis: startMs,
    endTimeMillis: endMs
  };

  try {
    let fitData: any = null;

    const googleRes = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(aggregatePayload)
    });

    if (googleRes.ok) {
      fitData = await googleRes.json();
    } else {
      const errText = await googleRes.text();
      console.warn(`[Google Fit Sync Warning] Primary multi-metric aggregate failed (${googleRes.status}): ${errText}. Attempting core fallback...`);

      if (googleRes.status === 401) {
        return res.status(401).json({
          error: "Google OAuth access token expired or invalid. Please re-authenticate.",
          code: "TOKEN_EXPIRED_REAUTH_REQUIRED"
        });
      }

      // Fallback: Core 4 metrics
      const fallbackPayload = {
        aggregateBy: [
          { dataTypeName: "com.google.step_count.delta" },
          { dataTypeName: "com.google.calories.expended" },
          { dataTypeName: "com.google.heart_rate.bpm" },
          { dataTypeName: "com.google.heart_minutes" }
        ],
        bucketByTime: { durationMillis: 1200000 },
        startTimeMillis: startMs,
        endTimeMillis: endMs
      };

      const fallbackRes = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(fallbackPayload)
      });

      if (!fallbackRes.ok) {
        const fallbackErr = await fallbackRes.text();
        return res.status(fallbackRes.status).json({
          error: `Google Fitness API returned error: ${fallbackRes.status}`,
          details: fallbackErr
        });
      }

      fitData = await fallbackRes.json();
    }

    const buckets = fitData?.bucket || [];

    // Parallel fetch for Sessions and Data Sources for complete health context
    let sessions: any[] = [];
    let dataSources: any[] = [];

    try {
      const [sessRes, dsRes] = await Promise.allSettled([
        fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(new Date(startMs).toISOString())}&endTime=${encodeURIComponent(new Date(endMs).toISOString())}`, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        }),
        fetch(`https://www.googleapis.com/fitness/v1/users/me/dataSources`, {
          headers: { "Authorization": `Bearer ${accessToken}` }
        })
      ]);

      if (sessRes.status === 'fulfilled' && sessRes.value.ok) {
        const sessJson = await sessRes.value.json();
        sessions = (sessJson.session || []).map((s: any) => ({
          ...s,
          activityName: GOOGLE_FIT_ACTIVITY_MAP[s.activityType] || `Activity ${s.activityType}`
        }));
      }

      if (dsRes.status === 'fulfilled' && dsRes.value.ok) {
        const dsJson = await dsRes.value.json();
        dataSources = dsJson.dataSource || [];
      }
    } catch (auxErr) {
      console.warn("[Google Fit Sync] Non-blocking aux fetch notice:", auxErr);
    }

    // Fetch raw instantaneous heart rate scans from Google Fit raw/derived datasets
    let latestInstantaneousHeartRate: number | undefined = undefined;
    let latestHeartRateTimeMs: number | undefined = undefined;
    let latestHeartRateTimeLabel: string | undefined = undefined;

    try {
      const startNs = `${startMs}000000`;
      const endNs = `${endMs}000000`;
      const rawHrRes = await fetch(
        `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${startNs}-${endNs}`,
        { headers: { "Authorization": `Bearer ${accessToken}` } }
      );

      if (rawHrRes.ok) {
        const rawHrJson = await rawHrRes.json();
        const rawPoints = rawHrJson.point || [];
        if (rawPoints.length > 0) {
          rawPoints.sort((a: any, b: any) => Number(a.endTimeNanos || a.startTimeNanos || 0) - Number(b.endTimeNanos || b.startTimeNanos || 0));
          const lastPoint = rawPoints[rawPoints.length - 1];
          const rawVal = lastPoint.value?.[0]?.fpVal ?? lastPoint.value?.[0]?.intVal;
          if (rawVal != null && !isNaN(rawVal) && rawVal > 0) {
            latestInstantaneousHeartRate = Math.round(rawVal);
            latestHeartRateTimeMs = Math.round(Number(lastPoint.endTimeNanos || lastPoint.startTimeNanos || 0) / 1000000);
            latestHeartRateTimeLabel = new Date(latestHeartRateTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        }
      }
    } catch (rawHrErr) {
      console.warn("[Google Fit Sync] Raw Heart Rate fetch notice:", rawHrErr);
    }

    const realSamples: any[] = [];

    let totalSteps = 0;
    let totalCalories = 0;
    let totalBmrCalories = 0;
    let hrSum = 0;
    let hrCount = 0;
    let minHr = 999;
    let maxHr = 0;
    let totalDistance = 0;
    let totalHydration = 0;
    let latestSpo2: number | undefined;
    let latestResp: number | undefined;
    let latestTemp: number | undefined;
    let latestSys: number | undefined;
    let latestDia: number | undefined;
    let latestGlucose: number | undefined;
    let latestWeight: number | undefined;
    let latestBodyFat: number | undefined;

    for (const bucket of buckets) {
      const bucketStartMs = Number(bucket.startTimeMillis);
      const datasetList = bucket.dataset || [];

      let bucketSteps = 0;
      let bucketCalories = 0;
      let bucketBmrCalories = 0;
      let bucketAvgHr: number | undefined = undefined;
      let bucketDistance = 0;
      let bucketSpeed: number | undefined = undefined;
      let bucketHydration = 0;
      let bucketSleepStage: string | undefined = undefined;
      let bucketSleepStageCode: number | undefined = undefined;
      let bucketActivity: string | undefined = undefined;
      let bucketActivityCode: number | undefined = undefined;
      let bucketSpo2: number | undefined = undefined;
      let bucketResp: number | undefined = undefined;
      let bucketTemp: number | undefined = undefined;

      for (const dataset of datasetList) {
        const dataSourceId = dataset.dataSourceId || "";
        const points = dataset.point || [];
        const dsLower = dataSourceId.toLowerCase();

        for (const point of points) {
          const values = point.value || [];

          // 1. Steps
          if (dsLower.includes("step_count") || dsLower.includes("step")) {
            const steps = Number(values[0]?.intVal ?? values[0]?.fpVal ?? 0);
            if (!isNaN(steps) && steps > 0) bucketSteps += steps;
          }
          // 2. Calories Expended
          else if (dsLower.includes("calories.expended") || (dsLower.includes("calories") && !dsLower.includes("bmr"))) {
            const cal = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (!isNaN(cal) && cal > 0) bucketCalories += Math.round(cal * 10) / 10;
          }
          // 3. Calories BMR
          else if (dsLower.includes("calories.bmr") || dsLower.includes("bmr")) {
            const bmr = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (!isNaN(bmr) && bmr > 0) bucketBmrCalories += Math.round(bmr * 10) / 10;
          }
          // 4. Heart Rate (BPM)
          else if (dsLower.includes("heart_rate") || dsLower.includes("bpm")) {
            const avg = values[0]?.fpVal ?? values[0]?.intVal;
            const max = values[1]?.fpVal ?? values[1]?.intVal;
            const min = values[2]?.fpVal ?? values[2]?.intVal;
            if (avg != null && !isNaN(avg) && avg > 0) {
              bucketAvgHr = Math.round(avg);
              hrSum += avg;
              hrCount++;
              if (min != null && min < minHr) minHr = Math.round(min);
              if (max != null && max > maxHr) maxHr = Math.round(max);
            }
          }
          // 5. Distance (Meters)
          else if (dsLower.includes("distance")) {
            const dist = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (!isNaN(dist) && dist > 0) bucketDistance += dist;
          }
          // 6. Speed (m/s)
          else if (dsLower.includes("speed")) {
            const spd = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (!isNaN(spd) && spd > 0) bucketSpeed = Math.round(spd * 10) / 10;
          }
          // 7. Hydration (Liters)
          else if (dsLower.includes("hydration")) {
            const hyd = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (!isNaN(hyd) && hyd > 0) bucketHydration += hyd;
          }
          // 8. Sleep Segments
          else if (dsLower.includes("sleep")) {
            const stageCode = Number(values[0]?.intVal ?? 0);
            if (stageCode > 0) {
              bucketSleepStageCode = stageCode;
              bucketSleepStage = GOOGLE_FIT_SLEEP_STAGE_MAP[stageCode] || 'sleeping';
            }
          }
          // 9. Activity Segments
          else if (dsLower.includes("activity")) {
            const actCode = Number(values[0]?.intVal ?? 0);
            if (actCode > 0) {
              bucketActivityCode = actCode;
              bucketActivity = GOOGLE_FIT_ACTIVITY_MAP[actCode] || `Activity ${actCode}`;
            }
          }
          // 10. Oxygen Saturation (SpO2)
          else if (dsLower.includes("oxygen_saturation") || dsLower.includes("spo2")) {
            const spo2Val = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (spo2Val > 0) {
              bucketSpo2 = Math.round(spo2Val * 10) / 10;
              latestSpo2 = bucketSpo2;
            }
          }
          // 11. Respiratory Rate
          else if (dsLower.includes("respiratory_rate") || dsLower.includes("respiration")) {
            const respVal = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (respVal > 0) {
              bucketResp = Math.round(respVal * 10) / 10;
              latestResp = bucketResp;
            }
          }
          // 12. Body Temperature
          else if (dsLower.includes("temperature") || dsLower.includes("body_temp")) {
            const tempVal = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (tempVal > 0) {
              bucketTemp = Math.round(tempVal * 10) / 10;
              latestTemp = bucketTemp;
            }
          }
          // 13. Blood Pressure
          else if (dsLower.includes("blood_pressure")) {
            const sys = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            const dia = Number(values[1]?.fpVal ?? values[1]?.intVal ?? 0);
            if (sys > 0) latestSys = Math.round(sys);
            if (dia > 0) latestDia = Math.round(dia);
          }
          // 14. Blood Glucose
          else if (dsLower.includes("blood_glucose") || dsLower.includes("glucose")) {
            const gluc = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (gluc > 0) latestGlucose = Math.round(gluc * 10) / 10;
          }
          // 15. Weight
          else if (dsLower.includes("weight")) {
            const wt = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (wt > 0) latestWeight = Math.round(wt * 10) / 10;
          }
          // 16. Body Fat
          else if (dsLower.includes("body_fat")) {
            const fat = Number(values[0]?.fpVal ?? values[0]?.intVal ?? 0);
            if (fat > 0) latestBodyFat = Math.round(fat * 10) / 10;
          }
        }
      }

      totalSteps += bucketSteps;
      totalCalories += bucketCalories;
      totalBmrCalories += bucketBmrCalories;
      totalDistance += bucketDistance;
      totalHydration += bucketHydration;

      realSamples.push({
        timestamp: new Date(bucketStartMs).toISOString(),
        unixMs: bucketStartMs,
        heartRateBpm: bucketAvgHr,
        stepsDelta: bucketSteps,
        activeCaloriesDelta: Math.round(bucketCalories),
        bmrCaloriesDelta: Math.round(bucketBmrCalories),
        distanceMeters: Math.round(bucketDistance),
        speedMps: bucketSpeed,
        hydrationLiters: Math.round(bucketHydration * 100) / 100,
        sleepStage: bucketSleepStage,
        sleepStageCode: bucketSleepStageCode,
        activityType: bucketActivity,
        activityTypeCode: bucketActivityCode,
        spo2Percent: bucketSpo2,
        respiratoryRate: bucketResp,
        skinTempCelsius: bucketTemp
      });
    }

    const avgHeartRate = hrCount > 0 ? Math.round(hrSum / hrCount) : 0;
    const finalMinHr = minHr !== 999 ? minHr : (avgHeartRate > 0 ? avgHeartRate : 0);
    const finalMaxHr = maxHr > 0 ? maxHr : (avgHeartRate > 0 ? avgHeartRate : 0);

    const realMetricsReceived: string[] = [];
    if (hrCount > 0 || latestInstantaneousHeartRate != null) realMetricsReceived.push('heart_rate');
    if (totalSteps > 0) realMetricsReceived.push('steps');
    if (totalCalories > 0) realMetricsReceived.push('calories');
    if (totalDistance > 0) realMetricsReceived.push('distance');
    if (totalHydration > 0) realMetricsReceived.push('hydration');
    if (latestSpo2 != null) realMetricsReceived.push('spo2');
    if (latestResp != null) realMetricsReceived.push('respiratory_rate');
    if (latestTemp != null) realMetricsReceived.push('skin_temp');
    if (latestSys != null) realMetricsReceived.push('blood_pressure_systolic', 'blood_pressure_diastolic');
    if (latestGlucose != null) realMetricsReceived.push('blood_glucose');
    if (latestWeight != null) realMetricsReceived.push('weight');
    if (latestBodyFat != null) realMetricsReceived.push('body_fat');
    if (sessions.length > 0) realMetricsReceived.push('sleep');

    const summary = {
      totalSteps,
      totalActiveCalories: Math.round(totalCalories),
      totalBmrCalories: Math.round(totalBmrCalories),
      avgHeartRate,
      minHeartRate: finalMinHr,
      maxHeartRate: finalMaxHr,
      latestInstantaneousHeartRate,
      latestHeartRateTimeLabel,
      realMetricsReceived,
      totalDistanceMeters: Math.round(totalDistance),
      totalHydrationLiters: Math.round(totalHydration * 100) / 100,
      avgSpo2: latestSpo2,
      avgRespiratoryRate: latestResp,
      avgSkinTemp: latestTemp,
      latestBloodPressureSystolic: latestSys,
      latestBloodPressureDiastolic: latestDia,
      latestBloodGlucose: latestGlucose,
      latestWeightKg: latestWeight,
      latestBodyFatPercent: latestBodyFat,
      avgStress: undefined as number | undefined,
      sampleCount: realSamples.length,
      hasRealData: totalSteps > 0 || hrCount > 0 || latestInstantaneousHeartRate != null || realSamples.some(s => (s.heartRateBpm || 0) > 0)
    };

    // Compute Server Biometric Engine Frame (Normalization lines, Deltas, Graph Nodes & Edges)
    const biometricFrame = ServerBiometricEngine.ingestAndCompute(
      userId, 
      realSamples as any, 
      true, 
      clientTimeZone,
      { realMetricsReceived, latestInstantaneousHeartRate, latestHeartRateTimeLabel }
    );

    // Cache in server memory
    serverWearableBufferMap.set(userId, {
      userId,
      provider: 'google_fit',
      lastUpdated: new Date().toISOString(),
      samples: realSamples.slice(-30)
    });

    console.log(`[Google Fit Comprehensive Sync] User ${userId}: ${totalSteps} steps, ${avgHeartRate} avg HR, ${sessions.length} sessions, ${dataSources.length} sensors across ${realSamples.length} buckets.`);

    res.json({
      status: "ok",
      provider: "google_fit",
      syncedAt: new Date().toISOString(),
      tokenRefreshed: refreshed,
      tokenExpiresAt: expiresAt,
      summary,
      samples: realSamples,
      sessions,
      dataSources,
      biometricFrame
    });
  } catch (err: any) {
    console.error("[Google Fit Sync Unexpected Exception]", err);
    res.status(500).json({ error: "Failed to connect to Google Fitness API", details: err?.message });
  }
}));

// 2b. Google Fit Connected Data Sources (Sensors & Hardware Devices)
app.get("/api/wearables/google-fit/data-sources", withValidGoogleToken(async (_req, res, tokenContext) => {
  const { userId, accessToken } = tokenContext;
  try {
    const googleRes = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataSources", {
      headers: {
        "Authorization": `Bearer ${accessToken}`
      }
    });

    if (!googleRes.ok) {
      const errText = await googleRes.text();
      return res.status(googleRes.status).json({ error: "Failed to fetch Google Fit data sources", details: errText });
    }

    const dsJson = await googleRes.json();
    res.json({
      status: "ok",
      userId,
      dataSources: dsJson.dataSource || []
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch Google Fit data sources", details: err?.message });
  }
}));

// 2c. High-Frequency Latest Heart Rate Scan Endpoint (Polls raw heart_rate dataset)
app.get("/api/wearables/google-fit/latest-hr", withValidGoogleToken(async (req, res, tokenContext) => {
  const { userId, accessToken } = tokenContext;
  try {
    const nowMs = Date.now();
    const fifteenMinsAgoMs = nowMs - (15 * 60 * 1000);
    const datasetId = `${fifteenMinsAgoMs * 1000000}-${nowMs * 1000000}`;
    const rawHrUrl = `https://www.googleapis.com/fitness/v1/users/me/dataSources/derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm/datasets/${datasetId}`;

    const rawHrRes = await fetch(rawHrUrl, {
      headers: { "Authorization": `Bearer ${accessToken}` }
    });

    if (rawHrRes.ok) {
      const rawHrJson = await rawHrRes.json();
      const points = rawHrJson.point || [];
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const val = lastPoint.value?.[0]?.fpVal ?? lastPoint.value?.[0]?.intVal;
        const ptTimeMs = Number(lastPoint.endTimeNanos) / 1000000 || Number(lastPoint.startTimeNanos) / 1000000;
        if (val != null && !isNaN(val) && val > 0) {
          const ageMinutes = Math.max(0, Math.round((nowMs - ptTimeMs) / (60 * 1000)));
          const timeLabel = new Date(ptTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return res.json({
            status: "ok",
            userId,
            latestInstantaneousHeartRate: Math.round(val),
            latestHeartRateTimeLabel: timeLabel,
            ageMinutes,
            scannedAt: new Date().toISOString()
          });
        }
      }
    }

    res.json({
      status: "ok",
      userId,
      latestInstantaneousHeartRate: undefined,
      latestHeartRateTimeLabel: undefined,
      ageMinutes: undefined,
      scannedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to scan latest heart rate", details: err?.message });
  }
}));

// 2b. Biometric Engine Live Frame Stream Endpoint (Sub-millisecond latency for live UI with dual time translation)
app.get("/api/wearables/biometric-engine/live-frame/:userId", (req, res) => {
  const userId = req.params.userId || "guest_user";
  const userTimeZone = (req.query.timeZone as string) || (req.headers["x-user-timezone"] as string) || undefined;
  const frame = ServerBiometricEngine.getLiveFrame(userId) || ServerBiometricEngine.generateDefaultFrame(userId, userTimeZone);
  res.json({
    status: "ok",
    frame
  });
});

// 2c. Biometric Engine Unified Query Endpoint (For Sana AI Agent & Deep Analytics)
app.post("/api/wearables/biometric-engine/query-graph", (req, res) => {
  const { userId, fields, timeRange, startTime, endTime, includeNormalizationLine, includeGraphCorrelations, userTimeZone } = req.body;
  const targetUid = userId || "guest_user";
  const clientTimeZone = userTimeZone || (req.headers["x-user-timezone"] as string) || undefined;

  const queryResult = ServerBiometricEngine.queryBiometricGraph({
    userId: targetUid,
    fields,
    timeRange,
    startTime,
    endTime,
    includeNormalizationLine,
    includeGraphCorrelations,
    userTimeZone: clientTimeZone
  });

  res.json(queryResult);
});

// 2d. Ingest Custom or Direct Wearable Stream into Biometric Engine
app.post("/api/wearables/biometric-engine/ingest", (req, res) => {
  const { userId, samples, userTimeZone } = req.body;
  const targetUid = userId || "guest_user";
  const clientTimeZone = userTimeZone || (req.headers["x-user-timezone"] as string) || undefined;

  if (!Array.isArray(samples)) {
    return res.status(400).json({ error: "samples array required" });
  }

  const frame = ServerBiometricEngine.ingestAndCompute(targetUid, samples, true, clientTimeZone);
  res.json({
    status: "ok",
    frame
  });
});

// 2b. Google Fit Sleep & Workout Sessions Ingestion (Wrapped with Token Management)
app.post("/api/wearables/google-fit/sessions", withValidGoogleToken(async (req, res, tokenContext) => {
  const { startTimeMillis, endTimeMillis } = req.body;
  const { userId, accessToken, expiresAt, refreshed } = tokenContext;

  const now = Date.now();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const startIso = new Date(Number(startTimeMillis) || (now - 7 * 24 * 3600 * 1000)).toISOString();
  const endIso = new Date(Number(endTimeMillis) || now).toISOString();

  try {
    const url = `https://www.googleapis.com/fitness/v1/users/me/sessions?startTime=${encodeURIComponent(startIso)}&endTime=${encodeURIComponent(endIso)}`;
    const googleRes = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!googleRes.ok) {
      const errText = await googleRes.text();
      return res.status(googleRes.status).json({ error: "Failed to fetch Google Fit sessions", details: errText });
    }

    const sessionData = await googleRes.json();
    res.json({
      status: "ok",
      userId,
      tokenRefreshed: refreshed,
      tokenExpiresAt: expiresAt,
      sessions: sessionData.session || []
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch Google Fit sessions", details: err?.message });
  }
}));

// 2c. Explicit Token Refresh & Health Endpoint
app.post("/api/wearables/google-fit/refresh-token", async (req, res) => {
  const { userId, refreshToken } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  const existingRecord = getStoredToken(userId);
  const tokenToUse = refreshToken || existingRecord?.refreshToken;

  if (!tokenToUse) {
    return res.status(400).json({
      error: "No refresh token available. User re-authentication via Google Identity Services required.",
      code: "NO_REFRESH_TOKEN"
    });
  }

  try {
    const refreshed = await refreshGoogleAccessToken(tokenToUse);
    res.json({
      status: "ok",
      userId,
      accessToken: refreshed.accessToken,
      expiresIn: refreshed.expiresIn,
      expiresAt: refreshed.expiresAt,
      tokenType: refreshed.tokenType
    });
  } catch (err: any) {
    res.status(400).json({
      error: err?.message || "Failed to refresh Google OAuth token",
      code: "REFRESH_FAILED"
    });
  }
});

// 2d. Authorization Code Grant Exchange Endpoint (for OAuth code flows)
app.post("/api/wearables/google-fit/exchange-code", async (req, res) => {
  const { code, redirectUri, userId } = req.body;
  if (!code || !redirectUri) {
    return res.status(400).json({ error: "code and redirectUri are required" });
  }

  try {
    const tokens = await exchangeAuthCodeForTokens(code, redirectUri);
    if (userId) {
      const existing = getStoredToken(userId);
      saveStoredToken({
        userId,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || existing?.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        tokenType: tokens.tokenType,
        status: 'valid'
      });
    }

    res.json({
      status: "ok",
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      expiresAt: tokens.expiresAt,
      tokenType: tokens.tokenType
    });
  } catch (err: any) {
    res.status(400).json({
      error: err?.message || "Failed to exchange authorization code",
      code: "EXCHANGE_FAILED"
    });
  }
});

// 2e. Token Status & Expiration Inspection Endpoint
app.get("/api/wearables/google-fit/token-status/:userId", (req, res) => {
  const { userId } = req.params;
  const stored = getStoredToken(userId);

  if (!stored || !stored.accessToken) {
    return res.json({
      status: "disconnected",
      hasToken: false,
      isExpired: true,
      minutesRemaining: 0
    });
  }

  const now = Date.now();
  const msRemaining = Math.max(0, stored.expiresAt - now);
  const minutesRemaining = Math.round(msRemaining / (60 * 1000));
  const isExpired = isTokenExpired(stored.expiresAt, SAFETY_BUFFER_MS);

  res.json({
    status: isExpired ? "expired" : "valid",
    hasToken: true,
    hasRefreshToken: Boolean(stored.refreshToken),
    expiresAt: stored.expiresAt,
    minutesRemaining,
    isExpired,
    lastRefreshedAt: stored.lastRefreshedAt,
    lastUpdated: stored.updatedAt
  });
});

// 2. Connect Provider
app.post("/api/wearables/connect", (req, res) => {
  const { userId, provider, deviceName } = req.body;
  if (!userId || !provider) {
    return res.status(400).json({ error: "userId and provider are required" });
  }

  const now = new Date().toISOString();
  const connection = {
    provider,
    status: 'connected',
    deviceName: deviceName || (provider === 'apple_health' ? 'Apple Watch Series 9' : provider === 'google_fit' ? 'Pixel Watch 2' : `${provider} Sensor`),
    batteryPercent: 88,
    connectedAt: now,
    lastSyncedAt: now,
    autoSyncIntervalMinutes: 20
  };

  res.json({
    status: "ok",
    message: `Connected ${provider} successfully to prosana engine`,
    connection
  });
});

// 3. Batch Flush (Receives the 20-minute accumulated buffer)
app.post("/api/wearables/batch-flush", (req, res) => {
  const { userId, batchId, provider, samples, summary, startTime, endTime } = req.body;
  if (!userId || !samples || !Array.isArray(samples)) {
    return res.status(400).json({ error: "Invalid batch payload" });
  }

  // Update server-side in-memory mirror
  serverWearableBufferMap.set(userId, {
    userId,
    provider: provider || 'apple_health',
    lastUpdated: new Date().toISOString(),
    samples: samples.slice(-30) // retain latest sliding window
  });

  console.log(`[Wearables Engine] Flushed 20-minute batch ${batchId} for user ${userId} (${samples.length} samples).`);

  res.json({
    status: "ok",
    batchId: batchId || `batch_${Date.now()}`,
    persistedSamples: samples.length,
    timestamp: new Date().toISOString()
  });
});

// 4. Ingest Live Pulse / Stream Tick
app.post("/api/wearables/stream-buffer", (req, res) => {
  const { userId, sample, provider } = req.body;
  if (!userId || !sample) {
    return res.status(400).json({ error: "userId and sample are required" });
  }

  const existing = serverWearableBufferMap.get(userId) || {
    userId,
    provider: provider || 'apple_health',
    lastUpdated: new Date().toISOString(),
    samples: []
  };

  existing.samples.push(sample);
  if (existing.samples.length > 60) {
    existing.samples.shift();
  }
  existing.lastUpdated = new Date().toISOString();
  serverWearableBufferMap.set(userId, existing);

  res.json({
    status: "ok",
    bufferLength: existing.samples.length,
    lastUpdated: existing.lastUpdated
  });
});

// 5. Query Active Telemetry for User
app.get("/api/wearables/telemetry/:userId", (req, res) => {
  const { userId } = req.params;
  const buffer = serverWearableBufferMap.get(userId);

  if (!buffer || buffer.samples.length === 0) {
    return res.json({
      status: "ok",
      hasData: false,
      samples: [],
      lastUpdated: null
    });
  }

  res.json({
    status: "ok",
    hasData: true,
    provider: buffer.provider,
    samples: buffer.samples,
    lastUpdated: buffer.lastUpdated
  });
});


// Intent Analysis and Dynamic Thinking Mode Helper
interface ThinkingAnalysis {
  intent: string;
  thinkingMode: 'hard' | 'easy';
  complexityScore: number;
  appliedRules: string[];
  reasoningSteps: string[];
}

function analyzeIntentAndThinkingMode(userPrompt: string): ThinkingAnalysis {
  const promptLower = userPrompt.toLowerCase();
  
  const mentionsActives = /(retinol|retinoid|vitamin c|salicylic|glycolic|aha|bha|niacinamide|azelaic|benzoyl|tretinoin|serum)/i.test(promptLower);
  const mentionsBarrierDamage = /(burn|stinging|redness|irritat|peeling|barrier|eczema|rosacea|sensitivity|inflam|breakout)/i.test(promptLower);
  const mentionsRoutineBuild = /(routine|regimen|schedule|order|steps|am\/pm|morning|evening|combine|layer)/i.test(promptLower);
  const mentionsDeepQuestion = /(why|how does|mechanism|scientific|ingredient|compatibility|safe to mix|ph|concentration|percentage)/i.test(promptLower);
  const isCasualGreeting = /^(hi|hello|hey|good morning|good evening|thanks|thank you|who are you|what can you do)[\.!\?]*$/i.test(promptLower.trim());

  let thinkingMode: 'hard' | 'easy' = 'easy';
  let complexityScore = 2;
  const appliedRules: string[] = [];
  const reasoningSteps: string[] = [];
  let intent = "GENERAL_QUERY";

  if (isCasualGreeting) {
    intent = "CASUAL_GREETING";
    thinkingMode = 'easy';
    complexityScore = 1;
    appliedRules.push("Casual greeting -> Direct conversational mode.");
  } else {
    if (mentionsActives) {
      intent = "INGREDIENT_CHEMISTRY";
      complexityScore += 3;
      appliedRules.push("Active ingredient chemistry / compatibility detected.");
    }

    if (mentionsBarrierDamage) {
      intent = "BARRIER_TRIAGE";
      complexityScore += 4;
      appliedRules.push("Skin barrier vulnerability / acute damage alert detected.");
    }

    if (mentionsRoutineBuild) {
      intent = "REGIMEN_SYNTHESIS";
      complexityScore += 3;
      appliedRules.push("Multi-step AM/PM regimen layering protocol requested.");
    }

    if (mentionsDeepQuestion) {
      intent = "DERMATOLOGICAL_EXPLANATION";
      complexityScore += 2;
      appliedRules.push("Scientific mechanism inquiry detected.");
    }

    if (complexityScore >= 5) {
      thinkingMode = 'hard';
    } else {
      thinkingMode = 'easy';
    }
  }

  return {
    intent,
    thinkingMode,
    complexityScore: Math.min(10, complexityScore),
    appliedRules,
    reasoningSteps: []
  };
}

function getUserProfileContextString(userProfile: any): string {
  if (!userProfile) return "";
  const settings = userProfile.settings || {};
  const onboarding = settings.onboardingProfile || {};
  const name = settings.preferredName || userProfile.displayName || "User";
  const perception = settings.userPerceptionText || onboarding.userPerceptionText || "Not specified";
  const location = settings.locationName || "Local Area";
  const skinType = onboarding.skinType || settings.skinType || "Combination";
  const concerns = onboarding.concerns || [];
  const event = settings.upcomingEvent || onboarding.upcomingEvent || "None specified";
  const priorities = settings.skinPriorities || onboarding.skinPriorities || "Overall skin health & barrier glow";

  return `\nUser Profile Context:
- Preferred Name: ${name}
- Self-Described Skin Perception: "${perception}"
- Registered Skin Type: ${skinType}
- Target Skin Concerns: ${Array.isArray(concerns) ? concerns.join(', ') : concerns}
- Location / Climate: ${location}
- Upcoming Event Target: ${event}
- Skin Goals / Priorities: ${priorities}
- Gender / Biological Profile: ${settings.gender || 'Not specified'}
- Height: ${settings.height ? settings.height + ' cm' : 'Not specified'}
`;
}

// AI Chat Endpoint with SANA Thinking Agent
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, userProfile } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid messages format" });
    }

    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.text || "";
    const thinkingAnalysis = analyzeIntentAndThinkingMode(lastUserMsg);

    const ai = getGeminiClient();
    if (!ai) {
      return res.json({
        role: "model",
        text: `I have analyzed your request ("${thinkingAnalysis.intent}") in ${thinkingAnalysis.thinkingMode.toUpperCase()} thinking mode. Connect your GEMINI_API_KEY for live AI responses.`,
        thinkingMeta: thinkingAnalysis
      });
    }

    const userCtx = getUserProfileContextString(userProfile);
    const systemInstruction = `You are prosana, a sophisticated AI skin health & wellness thinking companion.
User Name: ${userProfile?.settings?.preferredName || userProfile?.displayName || 'User'}.
${userCtx}
Selected Agent Thinking Strategy: ${thinkingAnalysis.thinkingMode.toUpperCase()} THINKING MODE (Calculated Complexity: ${thinkingAnalysis.complexityScore}/10).
Detected Intent: ${thinkingAnalysis.intent}.
Applied Agent Swift Rules: ${thinkingAnalysis.appliedRules.join("; ")}.

Instructions:
${thinkingAnalysis.thinkingMode === 'hard'
  ? "Deliver a deep, thorough, health and skin analysis. Break down active ingredients, skin barrier protection rules, and step-by-step guidance clearly with expert depth."
  : "Deliver a concise, clear, and direct friendly answer. Keep it approachable and easy to digest."
}
Always address the user warmly using their Preferred Name if available. Never use emojis. Maintain an elegant, warm, empathetic tone.`;

    // Convert messages to Gemini format
    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    let responseText = "";
    let extractedThoughts: string[] = [];
    try {
      const routerResult = await generateContentWithRouter({
        contents,
        systemInstruction,
        temperature: thinkingAnalysis.thinkingMode === 'hard' ? 0.4 : 0.7,
        includeThoughts: true
      });
      responseText = routerResult.text;
      if (routerResult.thoughts && routerResult.thoughts.length > 0) {
        extractedThoughts = routerResult.thoughts;
      }
    } catch (genErr: any) {
      console.warn("Gemini generation fallback across all models:", genErr?.message || genErr);
      responseText = thinkingAnalysis.thinkingMode === 'hard'
        ? `I apologize, but our AI services are currently out of credits/capacity across all models.\n\n[FALLBACK CLINICAL ANALYSIS: ${thinkingAnalysis.intent}]\n1. Active Ingredient Chemistry: Layer lightweight water-based serums before rich barrier creams.\n2. Barrier Protection: Avoid combining high-strength retinoids and exfoliating acids (AHA/BHA) in the same session.\n3. Protection: Always finish your morning routine with broad-spectrum SPF 50.`
        : `I apologize, but our AI services are currently out of credits/capacity across all models. I processed your request ("${thinkingAnalysis.intent}") in offline fallback mode. Keep your routine simple, hydrated, and protected with daily sunscreen.`;
    }

    const finalReasoningSteps = extractedThoughts.length > 0
      ? [...thinkingAnalysis.reasoningSteps, "--- Gemini Model Thought Trace ---", ...extractedThoughts]
      : thinkingAnalysis.reasoningSteps;

    return res.json({
      role: "model",
      text: responseText || "I'm here to support your skin and health wellness. How can I assist you today?",
      thinkingMeta: {
        ...thinkingAnalysis,
        reasoningSteps: finalReasoningSteps,
        modelThoughts: extractedThoughts
      }
    });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ error: "Failed to generate AI response", details: error?.message });
  }
});

// SSE Streaming Route for Real-time AI Agent Thinking & Response
app.post("/api/chat/stream", async (req, res) => {
  try {
    const { messages = [], userProfile = {} } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "Invalid payload: 'messages' must be an array" });
    }

    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.text || "";
    const thinkingAnalysis = analyzeIntentAndThinkingMode(lastUserMsg);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial metadata event
    res.write(`data: ${JSON.stringify({ type: 'meta', thinkingMeta: thinkingAnalysis })}\n\n`);

    const contents = messages.map((m: { role: string; text: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.text }]
    }));

    const userCtx = getUserProfileContextString(userProfile);
    const systemInstruction = `You are prosana, a sophisticated AI skin health & wellness thinking companion.
User Name: ${userProfile?.settings?.preferredName || userProfile?.displayName || 'User'}.
${userCtx}
Selected Agent Thinking Strategy: ${thinkingAnalysis.thinkingMode.toUpperCase()} THINKING MODE (Calculated Complexity: ${thinkingAnalysis.complexityScore}/10).
Detected Intent: ${thinkingAnalysis.intent}.
Applied Agent Swift Rules: ${thinkingAnalysis.appliedRules.join("; ")}.

Instructions:
${thinkingAnalysis.thinkingMode === 'hard'
  ? "Deliver a deep, thorough, clinical-grade skin health analysis. Break down active ingredients, skin barrier protection rules, and step-by-step guidance clearly with expert depth."
  : "Deliver a concise, clear, and direct friendly answer. Keep it approachable and easy to digest."
}
Always address the user warmly using their Preferred Name if available. Never use emojis. Maintain an elegant, warm, empathetic tone.`;

    try {
      const streamGenerator = generateContentStreamWithRouter({
        contents,
        systemInstruction,
        temperature: thinkingAnalysis.thinkingMode === 'hard' ? 0.4 : 0.7,
        includeThoughts: true
      });

      for await (const { chunk } of streamGenerator) {
        if (chunk.candidates?.[0]?.content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if ((part as any).thought) {
              res.write(`data: ${JSON.stringify({ type: 'thought', text: (part as any).thought })}\n\n`);
            }
            if (part.text) {
              res.write(`data: ${JSON.stringify({ type: 'text', text: part.text })}\n\n`);
            }
          }
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (streamErr: any) {
      console.warn("Stream error in /api/chat/stream:", streamErr?.message || streamErr);
      res.write(`data: ${JSON.stringify({
        type: 'text',
        text: thinkingAnalysis.thinkingMode === 'hard'
          ? `[CLINICAL ANALYSIS: ${thinkingAnalysis.intent}]\n1. Active Ingredient Chemistry: Layer lightweight water-based serums before rich barrier creams.\n2. Barrier Protection: Avoid combining high-strength retinoids and exfoliating acids in the same session.\n3. Protection: Always finish morning routine with SPF 50.`
          : `I processed your request in offline fallback mode. Keep your routine simple, hydrated, and protected with daily sunscreen.`
      })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error("Error in /api/chat/stream:", error);
    res.status(500).json({ error: "Failed to stream AI response" });
  }
});

// prosana Multi-step Agent Protocol Endpoint Handler
const handleAgentCall = async (req: express.Request, res: express.Response) => {
  try {
    const { userId = "guest_user", message, sessionId, history, attachments, userTimeZone } = req.body;
    const clientTimeZone = userTimeZone || (req.headers["x-user-timezone"] as string) || undefined;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing required string field 'message'" });
    }

    const agentResult = await runSanaAgent({
      userId,
      message,
      sessionId,
      attachments,
      history,
      userTimeZone: clientTimeZone
    });

    return res.json({
      text: agentResult.text,
      actionProposal: agentResult.actionProposal,
      sessionId: agentResult.sessionId,
      passOnTrace: agentResult.passOnTrace,
      iterations: agentResult.iterations,
      toolResults: agentResult.toolResults
    });
  } catch (error: any) {
    console.error("Error in agent endpoint:", error);
    return res.json({
      text: "I am prosana, your health & skin companion. I encountered a transient processing error. For your skin safety: 1. Always apply broad-spectrum SPF 50 daily. 2. Keep active ingredients balanced. 3. Hydrate with ceramide-based moistures.",
      sessionId: req.body?.sessionId || `session_${Date.now()}`,
      passOnTrace: [
        {
          thought: `Server catch fallback: ${error?.message || 'Execution error'}`,
          intent: 'clinical_synthesis',
          status: 'ready'
        }
      ],
      iterations: 1,
      toolResults: []
    });
  }
};

app.post("/api/prosana", handleAgentCall);
app.post("/api/sana", handleAgentCall);

// Secure Web Search Proxy Endpoint
app.post("/api/search", async (req, res) => {
  try {
    const { query, options } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const searchResult = await executeWebSearch(query, options);
    return res.json(searchResult);
  } catch (error: any) {
    console.error("Error in /api/search:", error);
    return res.status(500).json({
      error: "Failed to execute web search",
      details: error?.message || String(error)
    });
  }
});

// Full Exa Search API Proxy
app.post("/api/exa/search", async (req, res) => {
  try {
    const { query, type, numResults, systemPrompt, outputSchema, contents, includeDomains, excludeDomains, maxAgeHours } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const result = await performExaSearch({
      query,
      type,
      numResults,
      systemPrompt,
      outputSchema,
      contents,
      includeDomains,
      excludeDomains,
      maxAgeHours
    });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/search:", error);
    return res.status(500).json({
      error: "Exa Search execution failed",
      details: error?.message || String(error)
    });
  }
});

// Exa Contents API Proxy
app.post("/api/exa/contents", async (req, res) => {
  try {
    const { urls, highlights, text, summary, maxAgeHours } = req.body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: "Missing required array field 'urls'" });
    }

    const result = await performExaContents({ urls, highlights, text, summary, maxAgeHours });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/contents:", error);
    return res.status(500).json({
      error: "Exa Contents extraction failed",
      details: error?.message || String(error)
    });
  }
});

// Exa Answer API Proxy
app.post("/api/exa/answer", async (req, res) => {
  try {
    const { query, text } = req.body;
    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Missing required string field 'query'" });
    }

    const result = await performExaAnswer({ query, text });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/exa/answer:", error);
    return res.status(500).json({
      error: "Exa Answer failed",
      details: error?.message || String(error)
    });
  }
});

// ==========================================
// MODEL CONTEXT PROTOCOL (MCP) REST ENDPOINTS
// ==========================================

// 1. Get List of Configured MCP Servers
app.get("/api/mcp/servers", (_req, res) => {
  try {
    const servers = mcpManager.getServers();
    return res.json({ success: true, count: servers.length, servers });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/servers:", error);
    return res.status(500).json({ error: "Failed to list MCP servers", details: error?.message || String(error) });
  }
});

// 2. Connect a new External MCP Server (SSE Transport)
app.post("/api/mcp/servers", async (req, res) => {
  try {
    const { id, name, url, description } = req.body;
    if (!id || !name || !url) {
      return res.status(400).json({ error: "Missing required fields: id, name, url" });
    }

    const serverConfig = await mcpManager.connectSseServer(id, name, url, description);
    return res.json({ success: true, server: serverConfig });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/servers:", error);
    return res.status(500).json({ error: "Failed to connect MCP server", details: error?.message || String(error) });
  }
});

// 3. Disconnect an MCP Server
app.delete("/api/mcp/servers/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const removed = await mcpManager.disconnectServer(id);
    return res.json({ success: removed, id });
  } catch (error: any) {
    console.error(`Error in DELETE /api/mcp/servers/${req.params.id}:`, error);
    return res.status(500).json({ error: "Failed to disconnect MCP server", details: error?.message || String(error) });
  }
});

// 4. Get List of All Active MCP Tools across connected servers
app.get("/api/mcp/tools", async (_req, res) => {
  try {
    const tools = await mcpManager.getAllMcpTools();
    return res.json({ success: true, count: tools.length, tools });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/tools:", error);
    return res.status(500).json({ error: "Failed to list MCP tools", details: error?.message || String(error) });
  }
});

// 5. Invoke/Test an MCP Tool directly
app.post("/api/mcp/tools/call", async (req, res) => {
  try {
    const { fullName, serverId, toolName, args = {} } = req.body;
    const targetName = fullName || (serverId && toolName ? `mcp__${serverId}__${toolName}` : null);

    if (!targetName) {
      return res.status(400).json({ error: "Must specify 'fullName' or 'serverId' + 'toolName'" });
    }

    const result = await mcpManager.callTool(targetName, undefined, args);
    return res.json({ success: true, result });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/tools/call:", error);
    return res.status(500).json({ error: "Failed to execute MCP tool", details: error?.message || String(error) });
  }
});

// 6. Get List of Exposed MCP Resources
app.get("/api/mcp/resources", async (_req, res) => {
  try {
    const resources = await mcpManager.getResources();
    return res.json({ success: true, count: resources.length, resources });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/resources:", error);
    return res.status(500).json({ error: "Failed to list MCP resources", details: error?.message || String(error) });
  }
});

// 7. Read an MCP Resource by URI
app.post("/api/mcp/resources/read", async (req, res) => {
  try {
    const { serverId, uri } = req.body;
    if (!serverId || !uri) {
      return res.status(400).json({ error: "Missing required fields 'serverId' and 'uri'" });
    }

    const content = await mcpManager.readResource(serverId, uri);
    return res.json({ success: true, content });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/resources/read:", error);
    return res.status(500).json({ error: "Failed to read MCP resource", details: error?.message || String(error) });
  }
});

// 8. Get List of MCP Prompts
app.get("/api/mcp/prompts", async (_req, res) => {
  try {
    const prompts = await mcpManager.getPrompts();
    return res.json({ success: true, count: prompts.length, prompts });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/prompts:", error);
    return res.status(500).json({ error: "Failed to list MCP prompts", details: error?.message || String(error) });
  }
});

// 9. Get Expanded MCP Prompt Template
app.post("/api/mcp/prompts/get", async (req, res) => {
  try {
    const { serverId, promptName, args = {} } = req.body;
    if (!serverId || !promptName) {
      return res.status(400).json({ error: "Missing required fields 'serverId' and 'promptName'" });
    }

    const promptData = await mcpManager.getPrompt(serverId, promptName, args);
    return res.json({ success: true, prompt: promptData });
  } catch (error: any) {
    console.error("Error in POST /api/mcp/prompts/get:", error);
    return res.status(500).json({ error: "Failed to expand MCP prompt", details: error?.message || String(error) });
  }
});

// 10. Get MCP Tool Call Trace Logs
app.get("/api/mcp/logs", (_req, res) => {
  try {
    const logs = mcpManager.getLogs();
    return res.json({ success: true, count: logs.length, logs });
  } catch (error: any) {
    console.error("Error in GET /api/mcp/logs:", error);
    return res.status(500).json({ error: "Failed to get MCP logs", details: error?.message || String(error) });
  }
});

const handleExecuteAction = async (req: express.Request, res: express.Response) => {
  try {
    const { userId = "guest_user", proposal } = req.body;
    if (!proposal || !proposal.actionId || !proposal.actionType) {
      return res.status(400).json({ error: "Invalid actionProposal parameters" });
    }

    const execResult = await executeActionProposal(userId, proposal);
    return res.json(execResult);
  } catch (error: any) {
    console.error("Error in action execution:", error);
    return res.status(500).json({
      error: "Failed to execute action proposal",
      details: error?.message || String(error)
    });
  }
};

app.post("/api/prosana/execute", handleExecuteAction);
app.post("/api/sana/execute", handleExecuteAction);

// Location Search Endpoint
app.get("/api/location/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.trim().length < 2) {
      return res.json({ results: [] });
    }
    const results = await searchLocations(query);
    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to search locations", details: err?.message });
  }
});

// Location Reverse Geocode Endpoint
app.get("/api/location/reverse", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat as string);
    const lon = parseFloat(req.query.lon as string);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: "Invalid lat/lon" });
    }
    const locationName = await reverseGeocode(lat, lon);
    res.json({ locationName, lat, lon });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to reverse geocode", details: err?.message });
  }
});

// Daily Briefing Endpoint
app.post("/api/daily-brief", async (req, res) => {
  try {
    const { temperatureUnit = "C", latitude, longitude, locationName } = req.body;
    
    let reqLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : undefined;
    let reqLon = typeof longitude === 'number' && !isNaN(longitude) ? longitude : undefined;
    let reqLocName = locationName?.trim();

    // If coordinates were not sent from client, attempt IP geolocation fallback
    if (reqLat === undefined || reqLon === undefined) {
      if (!reqLocName || reqLocName === 'Local Area' || reqLocName === 'Local Atmosphere' || reqLocName === 'Location Access Required') {
        try {
          const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress;
          let ipRes = await fetch(`https://freeipapi.com/api/json/${clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' ? clientIp : ''}`);
          if (!ipRes.ok) {
            ipRes = await fetch('https://freeipapi.com/api/json');
          }
          if (ipRes.ok) {
            const ipData = await ipRes.json();
            if (typeof ipData.latitude === 'number' && typeof ipData.longitude === 'number' && !isNaN(ipData.latitude)) {
              reqLat = ipData.latitude;
              reqLon = ipData.longitude;
              reqLocName = [ipData.cityName, ipData.regionName, ipData.countryName].filter(Boolean).join(', ');
            }
          }
        } catch (ipErr) {
          console.warn("IP Geolocation lookup warning:", ipErr);
        }
      }
    }

    const weather = await getBaselineWeatherData(reqLat, reqLon, reqLocName);

    if ((weather as any).isLocationMissing) {
      return res.json({
        isLocationMissing: true,
        greeting: "Welcome to prosana",
        temperature: "--",
        feelsLike: "--",
        weatherCondition: "Location Access Needed",
        uvIndex: 0,
        uvLevel: "None",
        humidity: "--",
        dewPoint: "--",
        locationName: "Location Access Needed",
        waterTargetLiters: "2.4L",
        airQualityAqi: 0,
        pm25: 0,
        pm10: 0,
        ozone: 0,
        no2: 0,
        cloudCover: 0,
        precipProb: 0,
        windSpeed: 0,
        windGusts: 0,
        vpdKpa: 0,
        uvIndexClearSky: 0,
        primaryReminders: [
          "Set your location in Settings to receive real-time UV & climate wellness alerts.",
          "Hydration target: 2.4L throughout the day",
          "Scheduled evening wellness routine at 9:00 PM"
        ]
      });
    }

    const isFahrenheit = temperatureUnit === "F";
    const displayTemp = isFahrenheit 
      ? `${Math.round((weather.tempC * 9/5) + 32)}°F` 
      : `${Math.round(weather.tempC)}°C`;

    const displayFeelsLike = isFahrenheit
      ? `${Math.round((weather.feelsLikeC * 9/5) + 32)}°F`
      : `${Math.round(weather.feelsLikeC)}°C`;
      
    let uvLevel = "None";
    if (weather.uvIndex === 0) uvLevel = "Zero (Night)";
    else if (weather.uvIndex < 3) uvLevel = "Low";
    else if (weather.uvIndex < 6) uvLevel = "Moderate";
    else if (weather.uvIndex < 8) uvLevel = "High";
    else if (weather.uvIndex < 11) uvLevel = "Very High";
    else uvLevel = "Extreme";

    const displayLocation = reqLocName || weather.locationName || "Local Area";

    res.json({
      isLocationMissing: false,
      greeting: weather.uvIndex > 0 ? "Morning, sunshine" : "Evening, serene skin",
      temperature: displayTemp,
      feelsLike: displayFeelsLike,
      weatherCondition: (weather as any).weatherCondition || (weather.uvIndex > 0 ? "Partly Sunny" : "Clear Night Sky"),
      uvIndex: weather.uvIndex,
      uvLevel: uvLevel,
      humidity: `${weather.humidity}%`,
      dewPoint: `${weather.dewPointC}°C`,
      locationName: displayLocation,
      waterTargetLiters: "2.4L",
      airQualityAqi: weather.airQualityAqi,
      pm25: weather.pm25,
      pm10: weather.pm10,
      ozone: weather.ozone,
      no2: weather.no2,
      cloudCover: weather.cloudCoverPercent,
      precipProb: weather.precipProbPercent,
      windSpeed: weather.windSpeedKmH,
      windGusts: weather.windGustsKmH,
      vpdKpa: weather.vpdKpa,
      uvIndexClearSky: weather.uvIndexClearSky,
      peakUvIndex: (weather as any).peakUvIndex,
      primaryReminders: [
        weather.uvIndex > 0
          ? `Apply broad-spectrum sunscreen before going outdoors (UV: ${weather.uvIndex} ${uvLevel})`
          : `Nighttime: Focus on evening wellness, hydration & rest.`,
        "Hydration target: 2.4L throughout the day",
        "Scheduled evening wellness routine at 9:00 PM"
      ]
    });
  } catch (error: any) {
    console.warn("Daily brief generation error:", error);
    res.status(500).json({ error: "Failed to generate daily brief" });
  }
});

// Daily Companion / Compassion Sync Signals Endpoint (Warm, context-aware diurnal companion thoughts)
app.post("/api/companion-signals", async (req, res) => {
  try {
    const {
      userId = "guest_user",
      userProfile,
      forceRefresh = false,
      latitude,
      longitude,
      clientLocalTime,
      clientHour,
      clientDateStr,
      timezone
    } = req.body;

    const result = await getOrGenerateCompanionSignals(userId, userProfile, {
      forceRefresh,
      latitude,
      longitude,
      clientLocalTime,
      clientHour,
      clientDateStr,
      timezone
    });
    return res.json(result);
  } catch (error: any) {
    console.error("Error generating companion signals:", error);
    return res.status(500).json({
      error: "Failed to generate companion signals",
      details: error?.message || String(error)
    });
  }
});

// Vite Middleware Integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*all", (_req, res) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application dist/index.html not found");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`prosana Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
