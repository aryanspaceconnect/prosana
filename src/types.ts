export type NavigationTab = 'home' | 'agent' | 'calendar';

export interface OnboardingProfile {
  skinType?: 'oily' | 'dry' | 'combination' | 'sensitive' | 'normal';
  concerns?: string[];
  climate?: string;
  ageGroup?: string;
  waterTarget?: string;
  routineHabits?: string;
  userPerceptionText?: string;
  preferredName?: string;
  locationName?: string;
  height?: string;
  gender?: string;
  hormonalFactors?: string;
  skincareGoals?: string;
  upcomingEvent?: string;
  skinPriorities?: string;
}

export interface UserSettings {
  temperatureUnit: 'C' | 'F';
  scanNotificationTime: string; // e.g. '00:00', '06:00', '09:00', '12:00'
  scanReminderEnabled?: boolean;
  lastCompletedScanDate?: string; // YYYY-MM-DD
  theme: 'light' | 'dark' | 'auto';
  locationName?: string;
  latitude?: number;
  longitude?: number;
  isPremium?: boolean;
  responseStyle?: 'professional_medical' | 'casual_conversational' | 'cool_friendly';
  companionSignalsEnabled?: boolean;
  onboardingCompleted?: boolean;
  onboardingProfile?: OnboardingProfile;
  userPerceptionText?: string;
  preferredName?: string;
  height?: string;
  gender?: string;
  hormonalFactors?: string;
  skincareGoals?: string;
  upcomingEvent?: string;
  skinPriorities?: string;
  isGuestTrial?: boolean;
}

export interface GuestScanAllowance {
  maxScans: number; // 2
  daysLimit: number; // 2
  totalScansDone: number;
  scansCount: number;
  firstScanDate?: string | null;
  lastScanDate?: string | null;
  scanDates?: string[];
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  isAnonymous: boolean;
  isGuestTrial?: boolean;
  accountType?: 'full' | 'guest_trial';
  timezone?: string;
  browserFingerprint?: Record<string, any>;
  preferredName?: string;
  locationName?: string;
  userPerceptionText?: string;
  hormonalFactors?: string;
  skincareGoals?: string;
  skinPriorities?: string;
  upcomingEvent?: string;
  height?: string;
  gender?: string;
  guestScanAllowance?: GuestScanAllowance;
  settings: UserSettings;
}

export interface ConcernImageDetail {
  concernName: string;
  label: string;
  score: number;
  mask_url?: string;
  description?: string;
  bbox?: [number, number, number, number];
}

export interface PerfectCorpRegionOverlay {
  regionId: string;
  regionName: 'pores' | 'dark_circles' | 'redness_barrier' | 'acne_spots' | 'wrinkles_texture' | 'spots' | 'moisture' | 'firmness' | string;
  label: string;
  severityScore: number; // 0-100
  severityLevel: 'mild' | 'moderate' | 'elevated' | 'severe';
  // Bounding box in percentage [top, left, width, height]
  bbox: [number, number, number, number];
  colorHex: string;
  description: string;
}

export interface PerfectCorpConcernDetail {
  concernName: string;
  raw_score?: number;
  ui_score?: number;
  mask_urls?: string[];
  mask_url?: string;
}

export interface PerfectCorpScoreInfo {
  all?: number | null; // Overall skin score (1-100)
  skin_age?: number | null; // AI estimated skin age
  concerns: Record<string, PerfectCorpConcernDetail>;
}

export interface PerfectCorpRawOutput {
  scanId: string;
  taskId: string;
  fileId: string;
  timestamp: string;
  provider: 'PerfectCorp_S2S_v2.1_Live' | 'PerfectCorp_S2S_v2.1_Simulator' | 'PerfectCorp_S2S_v2.0_Live' | 'PerfectCorp_S2S_v2.0_Simulator' | string;
  rawMetrics: {
    poresScore?: number | null;
    darkCirclesScore?: number | null;
    barrierRednessScore?: number | null;
    acneBlemishScore?: number | null;
    moistureScore?: number | null;
    skinAge?: number | null;
    firmnessScore?: number | null;
    overallScore?: number | null;
  };
  scoreInfo: PerfectCorpScoreInfo;
  s2sStepLogs: string[];
  annotatedRegions: PerfectCorpRegionOverlay[];
  rawResponseLog: string;
}

export interface SkinAnalysisIntegrityLog {
  integrityStatus: 'VALID' | 'WARNING' | 'FAILED';
  passedChecks: string[];
  integrityErrors: string[];
  schemaVerified: boolean;
  directUploadFlag: boolean;
  validatedAt: string;
}

export interface SkinTrendGraphPoint {
  date: string; // YYYY-MM-DD
  hydrationScore?: number | null;
  barrierScore?: number | null;
  clarityScore?: number | null;
  acneIndex?: number | null;
  notes?: string;
}

export interface FacialScanResult {
  id?: string;
  userId?: string;
  scanId?: string;
  scanType?: 'daily_scan' | 'intermediate_scan' | 'morning_scan' | 'evening_scan' | 'night_scan' | string;
  hydrationScore?: number | null;
  barrierScore?: number | null;
  clarityScore?: number | null;
  summary: string;
  recommendations: string[];
  uvRecommendation?: string;
  timestamp?: any;
  capturedImage?: string;
  capturedPhoto?: string;
  concernImages?: Record<string, ConcernImageDetail>;
  // Perfect Corp API & Context Manager Extensions
  rawPerfectCorpOutput?: PerfectCorpRawOutput;
  integrityLog?: SkinAnalysisIntegrityLog;
  annotatedRegions?: PerfectCorpRegionOverlay[];
  s2sStepLogs?: string[];
  rawResponseLog?: string;
  rawJson?: any;
  rawMetrics?: any;
  scoreInfo?: any;
  historicalComparison?: {
    past2ScansSummary: string;
    twoWeekTrendSummary: string;
    progressNotes: string[];
  };
  reportStatus?: 'running' | 'ready';
  reportText?: string;
  reportSessionId?: string;
  masks?: any[];
}

export interface ThinkingMeta {
  intent: string;
  thinkingMode: 'hard' | 'easy';
  complexityScore: number;
  appliedRules: string[];
  reasoningSteps: string[];
  modelThoughts?: string[];
  elapsedSeconds?: number;
}

export interface ChatAttachment {
  id: string;
  name: string;
  type: 'image' | 'document';
  url: string;
  mimeType?: string;
  size?: number;
  textContent?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  createdAt?: string;
  attachments?: ChatAttachment[];
  thinkingMeta?: ThinkingMeta;
  actionProposal?: any;
  passOnTrace?: any[];
  sessionId?: string;
  searchQuery?: string;
  searchSites?: Array<{ title: string; url: string; discover: number; finish: number }>;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  sessionType?: 'onboarding_report' | 'scan_report' | 'chat' | 'consultation';
  sessionNotepad?: string; // Per-session scratchpad / working memory
  messages: ChatMessage[];
  messageCount?: number;
  lastMessage?: string;
}

export interface CalendarEventItem {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // e.g. "20:30"
  category: 'scan' | 'routine' | 'wellness' | 'treatment' | 'habit';
  notes?: string;
  reminder?: boolean;
  completed?: boolean;
  createdAt?: string;
}

export interface DailyBriefing {
  greeting: string;
  temperature: string;
  feelsLike?: string;
  weatherCondition: string;
  uvIndex: number;
  uvLevel: string;
  humidity: string;
  waterTargetLiters: string;
  primaryReminders: string[];
  locationName?: string;
  dewPoint?: string;
  airQualityAqi?: number;
  pm25?: number;
  pm10?: number;
  ozone?: number;
  no2?: number;
  cloudCover?: number;
  precipProb?: number;
  windSpeed?: number;
  windGusts?: number;
  vpdKpa?: number;
  uvIndexClearSky?: number;
  peakUvIndex?: number;
}

export interface PopUpNotification {
  id: string;
  type: 'facial_scan' | 'uv_alert' | 'agent_reminder' | 'custom_action' | 'agent_approval';
  title: string; // 10-30 characters
  subtitle: string;
  timeAgo: string;
  actionText?: string;
  iconType?: 'scan' | 'sun' | 'sparkle' | 'sparkles' | 'shield' | 'droplet' | 'clock' | 'alert';
  badgeText?: string;
  actionTarget?: 'scan' | 'calendar' | 'reports' | 'vault' | 'agent';
  autoTriggered?: boolean;
}

// Open Wearables Integration Types
export type WearableProviderId = 
  | 'google_fit' 
  | 'apple_health' 
  | 'oura' 
  | 'whoop' 
  | 'garmin' 
  | 'fitbit' 
  | 'samsung_health' 
  | 'polar' 
  | 'suunto';

export interface WearableProviderMeta {
  id: WearableProviderId;
  name: string;
  category: 'primary' | 'secondary' | 'coming_soon';
  status: 'active' | 'coming_soon';
  badge?: string;
  icon: string;
  color: string;
  description: string;
  metricsSupported: string[];
}

export interface WearableConnectionState {
  provider: WearableProviderId;
  status: 'connected' | 'syncing' | 'disconnected' | 'error';
  deviceName: string;
  batteryPercent?: number;
  lastSyncedAt: string;
  connectedAt: string;
  autoSyncIntervalMinutes: number; // default 20
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number; // Unix epoch millisecond timestamp when token expires
  tokenType?: string;
  lastRefreshedAt?: string;
  accountEmail?: string;
  errorMessage?: string;
}

export interface GoogleOAuthTokenRecord {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
  scope?: string;
  tokenType?: string;
  lastRefreshedAt?: string;
  status: 'valid' | 'expired' | 'revoked' | 'error';
  errorMessage?: string;
  updatedAt?: string;
}

export interface WearableSample {
  timestamp: string; // ISO
  serverTime?: string; // Server UTC ISO timestamp
  userLocalTime?: string; // Translated User Local timestamp ISO/string
  userTimeZone?: string; // Active user timezone (e.g. America/Los_Angeles)
  unixMs: number;
  heartRateBpm?: number;
  hrvMs?: number;
  stepsDelta?: number;
  activeCaloriesDelta?: number;
  bmrCaloriesDelta?: number;
  spo2Percent?: number;
  respiratoryRate?: number;
  skinTempCelsius?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  bloodGlucoseMmol?: number;
  distanceMeters?: number;
  speedMps?: number;
  hydrationLiters?: number;
  weightKg?: number;
  bodyFatPercentage?: number;
  sleepStage?: 'awake' | 'light' | 'deep' | 'rem' | 'sleeping' | 'out_of_bed' | string;
  sleepStageCode?: number;
  activityType?: string;
  activityTypeCode?: number;
  stressLevel?: number; // 0-100 (0=relaxed, 100=extreme stress)
}

export interface WearableBatchSummary {
  avgHeartRate: number;
  minHeartRate: number;
  maxHeartRate: number;
  avgHrv: number;
  totalSteps: number;
  totalActiveCalories: number;
  totalBmrCalories?: number;
  avgSpo2: number;
  avgStress: number;
  avgRespiratoryRate?: number;
  avgSkinTemp?: number;
  latestBloodPressureSystolic?: number;
  latestBloodPressureDiastolic?: number;
  latestBloodGlucose?: number;
  totalDistanceMeters?: number;
  totalHydrationLiters?: number;
  latestWeightKg?: number;
  latestBodyFatPercent?: number;
  latestInstantaneousHeartRate?: number;
  latestHeartRateTimeLabel?: string;
  realMetricsReceived?: string[];
  sleepScore?: number;
  readinessScore?: number;
}

export interface GoogleFitSession {
  id: string;
  name: string;
  description?: string;
  activityType: number;
  activityName?: string;
  startTimeMillis: string;
  endTimeMillis: string;
  modifiedTimeMillis?: string;
  application?: {
    packageName?: string;
    name?: string;
  };
  activeTimeMillis?: string;
}

export interface GoogleFitDataSource {
  dataStreamId: string;
  dataStreamName?: string;
  type: 'raw' | 'derived' | string;
  dataType: {
    name: string;
    field?: Array<{ name: string; format: string }>;
  };
  device?: {
    uid?: string;
    type?: string;
    model?: string;
    manufacturer?: string;
    version?: string;
  };
  application?: {
    packageName?: string;
    name?: string;
    version?: string;
  };
}

export interface WearableComprehensiveSyncResult {
  status: string;
  provider: string;
  syncedAt: string;
  tokenRefreshed?: boolean;
  tokenExpiresAt?: number;
  summary: WearableBatchSummary;
  samples: WearableSample[];
  sessions: GoogleFitSession[];
  dataSources: GoogleFitDataSource[];
  biometricFrame?: BiometricEngineFrame;
}

export interface WearableBatchDocument {
  id?: string;
  userId: string;
  batchId: string;
  provider: WearableProviderId;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  sampleCount: number;
  summary: WearableBatchSummary;
  samples: WearableSample[];
  createdAt: string;
}

export interface WearableBufferState {
  bufferWindowMinutes: number; // 20
  currentSampleCount: number;
  maxBufferSamples: number; // e.g. 20 (1 sample/min)
  pendingSamples: WearableSample[];
  lastFlushedAt: string | null;
  nextFlushCountdownSeconds: number;
  isFlushing: boolean;
  activeConnection: WearableConnectionState | null;
}

// ============================================================================
// BIOMETRIC GRAPH & SERVER COMPUTATION ENGINE TYPES
// ============================================================================

export type BiometricMetricType = 
  | 'heart_rate'
  | 'steps'
  | 'calories'
  | 'hrv'
  | 'spo2'
  | 'stress'
  | 'readiness'
  | 'sleep'
  | 'respiratory_rate'
  | 'skin_temp'
  | 'blood_pressure_systolic'
  | 'blood_pressure_diastolic'
  | 'blood_glucose'
  | 'distance'
  | 'speed'
  | 'hydration'
  | 'weight'
  | 'body_fat';

export interface BiometricGraphPoint {
  timestamp: string; // Server ISO (UTC)
  serverTime?: string; // Explicit Server UTC ISO timestamp
  userLocalTime: string; // User Local ISO string translated by timezone
  userTimeZone?: string; // e.g. "America/Los_Angeles"
  timeLabel: string; // User local label (e.g. "22:15" or "10:15 PM")
  serverTimeLabel?: string; // Server UTC label (e.g. "05:15 UTC")
  unixMs: number;
  value: number;
  normalizationLine: number; // Baseline computed on server
  delta: number; // Value - NormalizationLine
  zScore: number; // Standard deviation units from mean
  isAnomaly: boolean; // |zScore| > 2.0
  unit: string;
}

export interface BiometricBaselineMetric {
  metric: BiometricMetricType;
  currentValue: number;
  baseline: number; // Normalization line average
  delta: number; // Current - Baseline
  percentDeviation: number; // ((Current - Baseline) / Baseline) * 100
  unit: string;
  trend: 'rising' | 'falling' | 'stable';
  status: 'optimal' | 'elevated' | 'suppressed' | 'stable';
  stdDev: number;
  minNormal: number;
  maxNormal: number;
  isRecordedFromGoogleFit?: boolean;
  isInstantaneousScan?: boolean;
  latestScanTimeLabel?: string;
}

export interface BiometricReadinessBreakdown {
  score: number; // 0 - 100
  status: 'Prime' | 'Optimal' | 'Recovering' | 'Strained';
  hrvRecoveryFactor: number; // 0 - 100 (40% weight)
  restingHrFactor: number; // 0 - 100 (30% weight)
  sleepRecoveryFactor: number; // 0 - 100 (30% weight)
  explanation: string;
  lastCalculatedAt: string;
}

export interface BiometricGraphNode {
  id: string;
  userId: string;
  timestamp: string;
  serverTime?: string;
  userLocalTime?: string;
  userTimeZone?: string;
  timeLabel?: string;
  metric: BiometricMetricType;
  value: number;
  normalizationLine: number;
  delta: number;
  zScore: number;
  anomaly: boolean;
  state: 'optimal' | 'elevated' | 'suppressed' | 'stable';
  relatedEventId?: string;
  createdAt: string;
}

export interface BiometricGraphEdge {
  id: string;
  userId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationship: 
    | 'exertion_drives_heart_rate'
    | 'sustained_load_suppresses_hrv'
    | 'step_volume_generates_calories'
    | 'recovery_boosts_readiness'
    | 'elevated_stress_impact'
    | 'correlated_with';
  weight: number; // 0.0 - 1.0 (correlation strength)
  description: string;
  timestamp: string;
  serverTime?: string;
  userLocalTime?: string;
  userTimeZone?: string;
  createdAt: string;
}

export interface BiometricCorrelationInsight {
  metricA: string;
  metricB: string;
  coefficient: number; // Pearson r (-1.0 to 1.0)
  insight: string;
  strength: 'strong' | 'moderate' | 'weak';
}

export interface BiometricEngineFrame {
  userId: string;
  updatedAt: string;
  serverTime?: string;
  userLocalTime?: string;
  userTimeZone?: string;
  isLive: boolean;
  totalSamplesAnalyzed: number;
  currentVitals: Record<BiometricMetricType, BiometricBaselineMetric>;
  readiness: BiometricReadinessBreakdown;
  timeSeries: Record<BiometricMetricType, BiometricGraphPoint[]>;
  correlations: BiometricCorrelationInsight[];
  recentNodes: BiometricGraphNode[];
  recentEdges: BiometricGraphEdge[];
  bufferStatus: {
    bufferedCount: number;
    threshold: number;
    lastFlushedToGraphDb?: string;
  };
}


