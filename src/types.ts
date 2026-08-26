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
  type: 'facial_scan' | 'uv_alert' | 'agent_reminder' | 'custom_action';
  title: string; // 10-30 characters
  subtitle: string;
  timeAgo: string;
  actionText?: string;
  iconType?: 'scan' | 'sun' | 'sparkle' | 'shield' | 'droplet' | 'clock' | 'alert';
  badgeText?: string;
  actionTarget?: 'scan' | 'calendar' | 'reports' | 'vault' | 'agent';
  autoTriggered?: boolean;
}
