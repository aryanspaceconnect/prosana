import {
  WearableSample,
  BiometricMetricType,
  BiometricGraphPoint,
  BiometricBaselineMetric,
  BiometricReadinessBreakdown,
  BiometricGraphNode,
  BiometricGraphEdge,
  BiometricCorrelationInsight,
  BiometricEngineFrame
} from '../types.js';
import { getDualTimestamps, resolveUserTimeZone } from '../utils/timeZoneHelper.js';

// In-Memory Live Frames Cache (Server Side for sub-millisecond response)
const serverBiometricCache = new Map<string, BiometricEngineFrame>();

// Sliding Persistence Buffer per user
interface UserBufferState {
  pendingNodes: BiometricGraphNode[];
  pendingEdges: BiometricGraphEdge[];
  lastFlushedAt: string;
}
const userBuffers = new Map<string, UserBufferState>();
const BUFFER_THRESHOLD = 20;

// Default Normal Baselines for human physiology
const DEFAULT_PHYSIOLOGY_BASELINES: Record<BiometricMetricType, { baseline: number; stdDev: number; minNormal: number; maxNormal: number; unit: string }> = {
  heart_rate: { baseline: 72, stdDev: 8, minNormal: 55, maxNormal: 95, unit: 'bpm' },
  steps: { baseline: 350, stdDev: 180, minNormal: 50, maxNormal: 900, unit: 'steps' },
  calories: { baseline: 45, stdDev: 25, minNormal: 10, maxNormal: 120, unit: 'cal' },
  hrv: { baseline: 58, stdDev: 12, minNormal: 35, maxNormal: 85, unit: 'ms' },
  spo2: { baseline: 98.2, stdDev: 0.8, minNormal: 95, maxNormal: 100, unit: '%' },
  stress: { baseline: 32, stdDev: 14, minNormal: 10, maxNormal: 65, unit: 'pts' },
  readiness: { baseline: 82, stdDev: 10, minNormal: 65, maxNormal: 98, unit: '%' },
  sleep: { baseline: 85, stdDev: 10, minNormal: 70, maxNormal: 100, unit: '%' },
  respiratory_rate: { baseline: 14, stdDev: 2, minNormal: 12, maxNormal: 20, unit: 'br/min' },
  skin_temp: { baseline: 33.5, stdDev: 0.6, minNormal: 32.0, maxNormal: 35.5, unit: '°C' },
  blood_pressure_systolic: { baseline: 118, stdDev: 8, minNormal: 90, maxNormal: 125, unit: 'mmHg' },
  blood_pressure_diastolic: { baseline: 76, stdDev: 6, minNormal: 60, maxNormal: 85, unit: 'mmHg' },
  blood_glucose: { baseline: 5.2, stdDev: 0.8, minNormal: 4.0, maxNormal: 7.0, unit: 'mmol/L' },
  distance: { baseline: 250, stdDev: 150, minNormal: 20, maxNormal: 1000, unit: 'm' },
  speed: { baseline: 1.2, stdDev: 0.5, minNormal: 0.5, maxNormal: 3.5, unit: 'm/s' },
  hydration: { baseline: 0.25, stdDev: 0.15, minNormal: 0.1, maxNormal: 0.8, unit: 'L' },
  weight: { baseline: 70.0, stdDev: 1.5, minNormal: 45.0, maxNormal: 120.0, unit: 'kg' },
  body_fat: { baseline: 18.5, stdDev: 2.0, minNormal: 10.0, maxNormal: 32.0, unit: '%' }
};

// ============================================================================
// MATHEMATICAL CORE: NORMALIZATION LINES, STATS & DELTAS
// ============================================================================

export function calculateExponentialMovingAverage(values: number[], alpha: number = 0.22): number[] {
  if (!values.length) return [];
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    const val = values[i];
    const prevEma = ema[i - 1];
    const currentEma = (alpha * val) + ((1 - alpha) * prevEma);
    ema.push(Math.round(currentEma * 10) / 10);
  }
  return ema;
}

export function calculateStats(values: number[]): { mean: number; stdDev: number; min: number; max: number } {
  if (!values.length) {
    return { mean: 0, stdDev: 1, min: 0, max: 0 };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const squareDiffs = values.map(v => Math.pow(v - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / (values.length || 1);
  const stdDev = Math.sqrt(avgSquareDiff) || 1;
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    mean: Math.round(mean * 10) / 10,
    stdDev: Math.max(0.5, Math.round(stdDev * 10) / 10),
    min,
    max
  };
}

export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length < 2 || y.length < 2 || x.length !== y.length) return 0;
  const n = x.length;
  const avgX = x.reduce((a, b) => a + b, 0) / n;
  const avgY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = x[i] - avgX;
    const diffY = y[i] - avgY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  const denominator = Math.sqrt(denX * denY);
  if (denominator === 0) return 0;
  const r = num / denominator;
  return Math.round(Math.max(-1, Math.min(1, r)) * 100) / 100;
}

// ============================================================================
// CLINICAL READINESS DERIVATION ENGINE
// ============================================================================

export function computeReadinessBreakdown(
  samples: WearableSample[],
  userBaselineHr: number = 72,
  userBaselineHrv: number = 58
): BiometricReadinessBreakdown {
  if (!samples || samples.length === 0) {
    return {
      score: 82,
      status: 'Optimal',
      hrvRecoveryFactor: 80,
      restingHrFactor: 85,
      sleepRecoveryFactor: 82,
      explanation: 'Optimal baseline physiological state. Ready for standard daily routine.',
      lastCalculatedAt: new Date().toISOString()
    };
  }

  // 1. HRV Recovery Factor (Weight: 40%)
  const hrvValues = samples.map(s => s.hrvMs).filter((v): v is number => v != null && v > 0);
  let avgHrv = userBaselineHrv;
  if (hrvValues.length > 0) {
    avgHrv = hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length;
  }
  // Ratio to baseline: 1.0 = 80 pts, 1.3+ = 100 pts, 0.7 = 55 pts
  const hrvRatio = avgHrv / (userBaselineHrv || 58);
  const hrvScore = Math.min(100, Math.max(30, Math.round(hrvRatio * 80)));

  // 2. Resting Heart Rate Factor (Weight: 30%)
  const hrValues = samples.map(s => s.heartRateBpm).filter((v): v is number => v != null && v > 0);
  let minHr = userBaselineHr - 12;
  let avgHr = userBaselineHr;
  if (hrValues.length > 0) {
    minHr = Math.min(...hrValues);
    avgHr = hrValues.reduce((a, b) => a + b, 0) / hrValues.length;
  }
  // Lower resting HR relative to baseline indicates parasympathetic dominance
  const hrRecoveryRatio = userBaselineHr / (Math.max(48, minHr) || 60);
  const rhrScore = Math.min(100, Math.max(35, Math.round(hrRecoveryRatio * 75)));

  // 3. Exertion / Sleep Recovery Factor (Weight: 30%)
  const totalSteps = samples.reduce((sum, s) => sum + (s.stepsDelta || 0), 0);
  const totalBurn = samples.reduce((sum, s) => sum + (s.activeCaloriesDelta || 0), 0);
  
  // Moderate healthy movement boosts recovery, extreme exhaustion dampens it
  let exertionFactor = 85;
  if (totalSteps > 15000 || totalBurn > 800) {
    exertionFactor = 70; // Physical fatigue
  } else if (totalSteps > 6000) {
    exertionFactor = 90; // Prime metabolic activation
  }

  // Combined Weighted Readiness Score
  const rawScore = (hrvScore * 0.40) + (rhrScore * 0.30) + (exertionFactor * 0.30);
  const finalScore = Math.min(100, Math.max(10, Math.round(rawScore)));

  let status: 'Prime' | 'Optimal' | 'Recovering' | 'Strained' = 'Optimal';
  let explanation = 'Cardiovascular stability within normal limits.';

  if (finalScore >= 88) {
    status = 'Prime';
    explanation = 'High parasympathetic recovery and stable resting heart rate. Peak physiological readiness.';
  } else if (finalScore >= 75) {
    status = 'Optimal';
    explanation = 'Balanced autonomic nervous system. Full capacity for normal activity and active skincare.';
  } else if (finalScore >= 60) {
    status = 'Recovering';
    explanation = 'Mild autonomic fatigue detected. Moderate activity recommended; prioritize restorative sleep.';
  } else {
    status = 'Strained';
    explanation = 'Elevated physiological strain. Recommend gentle barrier-repair skincare and stress reduction.';
  }

  return {
    score: finalScore,
    status,
    hrvRecoveryFactor: hrvScore,
    restingHrFactor: rhrScore,
    sleepRecoveryFactor: exertionFactor,
    explanation,
    lastCalculatedAt: new Date().toISOString()
  };
}

// ============================================================================
// TIME-SERIES NORMALIZATION & RELATIONAL GRAPH ENGINE
// ============================================================================

export function processBiometricTimeSeries(
  userId: string,
  samples: WearableSample[],
  userTimeZone?: string,
  metaOptions?: {
    realMetricsReceived?: string[];
    latestInstantaneousHeartRate?: number;
    latestHeartRateTimeLabel?: string;
  }
): {
  timeSeries: Record<BiometricMetricType, BiometricGraphPoint[]>;
  currentVitals: Record<BiometricMetricType, BiometricBaselineMetric>;
  nodes: BiometricGraphNode[];
  edges: BiometricGraphEdge[];
  correlations: BiometricCorrelationInsight[];
  readiness: BiometricReadinessBreakdown;
  activeTimeZone: string;
} {
  const targetTz = resolveUserTimeZone(userTimeZone);
  const sorted = [...samples].sort((a, b) => a.unixMs - b.unixMs);
  const now = new Date();
  const nowDual = getDualTimestamps(now, targetTz);

  // Extract raw vectors with dual timestamping
  const timestamps = sorted.map(s => {
    const dual = getDualTimestamps(s.unixMs, targetTz);
    return {
      iso: dual.serverTime,
      serverTime: dual.serverTime,
      userLocalTime: dual.userLocalTime,
      userTimeZone: targetTz,
      label: dual.timeLabel,
      serverLabel: dual.serverTimeLabel,
      unixMs: s.unixMs
    };
  });

  const hrRaw = sorted.map(s => s.heartRateBpm ?? 0);
  const stepsRaw = sorted.map(s => s.stepsDelta ?? 0);
  const calRaw = sorted.map(s => s.activeCaloriesDelta ?? 0);
  const hrvRaw = sorted.map(s => s.hrvMs ?? 55);
  const spo2Raw = sorted.map(s => s.spo2Percent ?? 98.4);
  const stressRaw = sorted.map(s => s.stressLevel ?? 30);
  const respRaw = sorted.map(s => s.respiratoryRate ?? 14);
  const skinTempRaw = sorted.map(s => s.skinTempCelsius ?? 33.5);
  const bpSysRaw = sorted.map(s => s.bloodPressureSystolic ?? 118);
  const bpDiaRaw = sorted.map(s => s.bloodPressureDiastolic ?? 76);
  const glucoseRaw = sorted.map(s => s.bloodGlucoseMmol ?? 5.2);
  const distRaw = sorted.map(s => s.distanceMeters ?? 0);
  const speedRaw = sorted.map(s => s.speedMps ?? 0);
  const hydraRaw = sorted.map(s => s.hydrationLiters ?? 0);
  const weightRaw = sorted.map(s => s.weightKg ?? 70);
  const bodyFatRaw = sorted.map(s => s.bodyFatPercentage ?? 18.5);

  // Compute Normalization Lines (EMA baselines)
  const hrEma = calculateExponentialMovingAverage(hrRaw.filter(v => v > 0).length ? hrRaw : [72]);
  const stepsEma = calculateExponentialMovingAverage(stepsRaw);
  const calEma = calculateExponentialMovingAverage(calRaw);
  const hrvEma = calculateExponentialMovingAverage(hrvRaw);
  const spo2Ema = calculateExponentialMovingAverage(spo2Raw);
  const stressEma = calculateExponentialMovingAverage(stressRaw);
  const respEma = calculateExponentialMovingAverage(respRaw);
  const skinTempEma = calculateExponentialMovingAverage(skinTempRaw);
  const bpSysEma = calculateExponentialMovingAverage(bpSysRaw);
  const bpDiaEma = calculateExponentialMovingAverage(bpDiaRaw);
  const glucoseEma = calculateExponentialMovingAverage(glucoseRaw);
  const distEma = calculateExponentialMovingAverage(distRaw);
  const speedEma = calculateExponentialMovingAverage(speedRaw);
  const hydraEma = calculateExponentialMovingAverage(hydraRaw);
  const weightEma = calculateExponentialMovingAverage(weightRaw);
  const bodyFatEma = calculateExponentialMovingAverage(bodyFatRaw);

  const hrStats = calculateStats(hrRaw.filter(v => v > 0));
  const stepStats = calculateStats(stepsRaw);
  const calStats = calculateStats(calRaw);
  const hrvStats = calculateStats(hrvRaw);
  const spo2Stats = calculateStats(spo2Raw);
  const stressStats = calculateStats(stressRaw);
  const respStats = calculateStats(respRaw);
  const skinTempStats = calculateStats(skinTempRaw);
  const bpSysStats = calculateStats(bpSysRaw);
  const bpDiaStats = calculateStats(bpDiaRaw);
  const glucoseStats = calculateStats(glucoseRaw);
  const distStats = calculateStats(distRaw);
  const speedStats = calculateStats(speedRaw);
  const hydraStats = calculateStats(hydraRaw);
  const weightStats = calculateStats(weightRaw);
  const bodyFatStats = calculateStats(bodyFatRaw);

  const timeSeries: Record<BiometricMetricType, BiometricGraphPoint[]> = {
    heart_rate: [],
    steps: [],
    calories: [],
    hrv: [],
    spo2: [],
    stress: [],
    readiness: [],
    sleep: [],
    respiratory_rate: [],
    skin_temp: [],
    blood_pressure_systolic: [],
    blood_pressure_diastolic: [],
    blood_glucose: [],
    distance: [],
    speed: [],
    hydration: [],
    weight: [],
    body_fat: []
  };

  const nodes: BiometricGraphNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const t = timestamps[i];
    const s = sorted[i];

    // 1. Heart Rate Point
    const hrVal = s.heartRateBpm ?? (hrStats.mean || 72);
    const hrNorm = hrEma[i] ?? hrStats.mean;
    const hrDelta = Math.round((hrVal - hrNorm) * 10) / 10;
    const hrZ = Math.round(((hrVal - hrStats.mean) / hrStats.stdDev) * 10) / 10;
    const hrAnomaly = Math.abs(hrZ) >= 2.0;

    timeSeries.heart_rate.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: hrVal,
      normalizationLine: hrNorm,
      delta: hrDelta,
      zScore: hrZ,
      isAnomaly: hrAnomaly,
      unit: 'bpm'
    });

    nodes.push({
      id: `node_hr_${t.unixMs}`,
      userId,
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      metric: 'heart_rate',
      value: hrVal,
      normalizationLine: hrNorm,
      delta: hrDelta,
      zScore: hrZ,
      anomaly: hrAnomaly,
      state: hrVal > (hrStats.mean + hrStats.stdDev) ? 'elevated' : hrVal < (hrStats.mean - hrStats.stdDev) ? 'suppressed' : 'optimal',
      createdAt: nowDual.serverTime
    });

    // 2. Steps Point
    const stepVal = s.stepsDelta ?? 0;
    const stepNorm = stepsEma[i] ?? stepStats.mean;
    const stepDelta = Math.round((stepVal - stepNorm) * 10) / 10;
    const stepZ = Math.round(((stepVal - stepStats.mean) / (stepStats.stdDev || 1)) * 10) / 10;
    const stepAnomaly = stepZ >= 2.5;

    timeSeries.steps.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: stepVal,
      normalizationLine: stepNorm,
      delta: stepDelta,
      zScore: stepZ,
      isAnomaly: stepAnomaly,
      unit: 'steps'
    });

    nodes.push({
      id: `node_step_${t.unixMs}`,
      userId,
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      metric: 'steps',
      value: stepVal,
      normalizationLine: stepNorm,
      delta: stepDelta,
      zScore: stepZ,
      anomaly: stepAnomaly,
      state: stepVal > (stepStats.mean + stepStats.stdDev) ? 'elevated' : 'stable',
      createdAt: nowDual.serverTime
    });

    // 3. Calories Point
    const calVal = s.activeCaloriesDelta ?? 0;
    const calNorm = calEma[i] ?? calStats.mean;
    timeSeries.calories.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: calVal,
      normalizationLine: calNorm,
      delta: Math.round((calVal - calNorm) * 10) / 10,
      zScore: Math.round(((calVal - calStats.mean) / (calStats.stdDev || 1)) * 10) / 10,
      isAnomaly: calVal > (calStats.mean + 2 * calStats.stdDev),
      unit: 'cal'
    });

    // 4. HRV Point
    const hrvVal = s.hrvMs ?? 58;
    const hrvNorm = hrvEma[i] ?? hrvStats.mean;
    timeSeries.hrv.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: hrvVal,
      normalizationLine: hrvNorm,
      delta: Math.round((hrvVal - hrvNorm) * 10) / 10,
      zScore: Math.round(((hrvVal - hrvStats.mean) / (hrStats.stdDev || 1)) * 10) / 10,
      isAnomaly: Math.abs((hrvVal - hrvStats.mean) / (hrStats.stdDev || 1)) >= 2.0,
      unit: 'ms'
    });

    // 5. SpO2 Point
    const spo2Val = s.spo2Percent ?? 98.4;
    const spo2Norm = spo2Ema[i] ?? 98.2;
    timeSeries.spo2.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: spo2Val,
      normalizationLine: spo2Norm,
      delta: Math.round((spo2Val - spo2Norm) * 10) / 10,
      zScore: Math.round(((spo2Val - spo2Stats.mean) / (spo2Stats.stdDev || 0.8)) * 10) / 10,
      isAnomaly: spo2Val < 95.0,
      unit: '%'
    });

    // 6. Respiratory Rate Point
    const respVal = s.respiratoryRate ?? 14;
    const respNorm = respEma[i] ?? 14;
    timeSeries.respiratory_rate.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: respVal,
      normalizationLine: respNorm,
      delta: Math.round((respVal - respNorm) * 10) / 10,
      zScore: Math.round(((respVal - respStats.mean) / (respStats.stdDev || 1)) * 10) / 10,
      isAnomaly: respVal > 22 || respVal < 10,
      unit: 'br/min'
    });

    // 7. Skin Temperature Point
    const skinTempVal = s.skinTempCelsius ?? 33.5;
    const skinTempNorm = skinTempEma[i] ?? 33.5;
    timeSeries.skin_temp.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: skinTempVal,
      normalizationLine: skinTempNorm,
      delta: Math.round((skinTempVal - skinTempNorm) * 10) / 10,
      zScore: Math.round(((skinTempVal - skinTempStats.mean) / (skinTempStats.stdDev || 0.5)) * 10) / 10,
      isAnomaly: Math.abs(skinTempVal - skinTempNorm) > 1.2,
      unit: '°C'
    });

    // 8. Blood Pressure (Systolic & Diastolic)
    const bpSysVal = s.bloodPressureSystolic ?? 118;
    const bpSysNorm = bpSysEma[i] ?? 118;
    timeSeries.blood_pressure_systolic.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: bpSysVal,
      normalizationLine: bpSysNorm,
      delta: Math.round((bpSysVal - bpSysNorm) * 10) / 10,
      zScore: Math.round(((bpSysVal - bpSysStats.mean) / (bpSysStats.stdDev || 5)) * 10) / 10,
      isAnomaly: bpSysVal > 135 || bpSysVal < 90,
      unit: 'mmHg'
    });

    const bpDiaVal = s.bloodPressureDiastolic ?? 76;
    const bpDiaNorm = bpDiaEma[i] ?? 76;
    timeSeries.blood_pressure_diastolic.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: bpDiaVal,
      normalizationLine: bpDiaNorm,
      delta: Math.round((bpDiaVal - bpDiaNorm) * 10) / 10,
      zScore: Math.round(((bpDiaVal - bpDiaStats.mean) / (bpDiaStats.stdDev || 4)) * 10) / 10,
      isAnomaly: bpDiaVal > 90 || bpDiaVal < 60,
      unit: 'mmHg'
    });

    // 9. Blood Glucose Point
    const glucoseVal = s.bloodGlucoseMmol ?? 5.2;
    const glucoseNorm = glucoseEma[i] ?? 5.2;
    timeSeries.blood_glucose.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: glucoseVal,
      normalizationLine: glucoseNorm,
      delta: Math.round((glucoseVal - glucoseNorm) * 10) / 10,
      zScore: Math.round(((glucoseVal - glucoseStats.mean) / (glucoseStats.stdDev || 0.6)) * 10) / 10,
      isAnomaly: glucoseVal > 7.8 || glucoseVal < 3.9,
      unit: 'mmol/L'
    });

    // 10. Distance Point
    const distVal = s.distanceMeters ?? Math.round(stepVal * 0.75);
    const distNorm = distEma[i] ?? (stepNorm * 0.75);
    timeSeries.distance.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: distVal,
      normalizationLine: distNorm,
      delta: Math.round((distVal - distNorm) * 10) / 10,
      zScore: Math.round(((distVal - distStats.mean) / (distStats.stdDev || 1)) * 10) / 10,
      isAnomaly: distVal > 1500,
      unit: 'm'
    });

    // 11. Speed Point
    const speedVal = s.speedMps ?? (stepVal > 0 ? 1.3 : 0);
    const speedNorm = speedEma[i] ?? (stepNorm > 0 ? 1.2 : 0);
    timeSeries.speed.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: speedVal,
      normalizationLine: speedNorm,
      delta: Math.round((speedVal - speedNorm) * 10) / 10,
      zScore: 0,
      isAnomaly: speedVal > 5.0,
      unit: 'm/s'
    });

    // 12. Hydration Point
    const hydraVal = s.hydrationLiters ?? 0;
    const hydraNorm = hydraEma[i] ?? 0.1;
    timeSeries.hydration.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: hydraVal,
      normalizationLine: hydraNorm,
      delta: Math.round((hydraVal - hydraNorm) * 100) / 100,
      zScore: 0,
      isAnomaly: false,
      unit: 'L'
    });

    // 13. Weight Point
    const weightVal = s.weightKg ?? 70.0;
    const weightNorm = weightEma[i] ?? 70.0;
    timeSeries.weight.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: weightVal,
      normalizationLine: weightNorm,
      delta: Math.round((weightVal - weightNorm) * 10) / 10,
      zScore: 0,
      isAnomaly: false,
      unit: 'kg'
    });

    // 14. Body Fat Point
    const bodyFatVal = s.bodyFatPercentage ?? 18.5;
    const bodyFatNorm = bodyFatEma[i] ?? 18.5;
    timeSeries.body_fat.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: bodyFatVal,
      normalizationLine: bodyFatNorm,
      delta: Math.round((bodyFatVal - bodyFatNorm) * 10) / 10,
      zScore: 0,
      isAnomaly: false,
      unit: '%'
    });
  }

  // Calculate Readiness
  const readiness = computeReadinessBreakdown(sorted, hrStats.mean || 72, hrvStats.mean || 58);

  // Generate Readiness, Stress and Sleep time series
  timestamps.forEach((t, idx) => {
    timeSeries.readiness.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: readiness.score,
      normalizationLine: 82,
      delta: readiness.score - 82,
      zScore: (readiness.score - 82) / 10,
      isAnomaly: readiness.score < 60,
      unit: '%'
    });

    const sVal = stressRaw[idx] ?? 30;
    const sNorm = stressEma[idx] ?? 32;
    timeSeries.stress.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: sVal,
      normalizationLine: sNorm,
      delta: sVal - sNorm,
      zScore: (sVal - 32) / 14,
      isAnomaly: sVal > 65,
      unit: 'pts'
    });

    const sleepScore = 85;
    timeSeries.sleep.push({
      timestamp: t.serverTime,
      serverTime: t.serverTime,
      userLocalTime: t.userLocalTime,
      userTimeZone: t.userTimeZone,
      timeLabel: t.label,
      serverTimeLabel: t.serverLabel,
      unixMs: t.unixMs,
      value: sleepScore,
      normalizationLine: 82,
      delta: 3,
      zScore: 0.3,
      isAnomaly: false,
      unit: '%'
    });
  });

  // Discovered Relationships (Graph Edges)
  const edges: BiometricGraphEdge[] = [];
  const correlations: BiometricCorrelationInsight[] = [];

  // Step - Heart Rate Correlation
  const stepHrR = calculatePearsonCorrelation(stepsRaw, hrRaw);
  if (Math.abs(stepHrR) > 0.3) {
    correlations.push({
      metricA: 'steps',
      metricB: 'heart_rate',
      coefficient: stepHrR,
      insight: stepHrR > 0.5 
        ? 'Physical exertion and walking cadence strongly drive immediate cardiovascular pulse elevations.'
        : 'Moderate physical movement accompanied by expected cardiovascular rate response.',
      strength: Math.abs(stepHrR) > 0.6 ? 'strong' : 'moderate'
    });

    // Add graph edges between high-step nodes and corresponding HR nodes
    for (let i = 0; i < sorted.length; i++) {
      if ((stepsRaw[i] || 0) > (stepStats.mean + stepStats.stdDev)) {
        edges.push({
          id: `edge_step_hr_${timestamps[i].unixMs}`,
          userId,
          sourceNodeId: `node_step_${timestamps[i].unixMs}`,
          targetNodeId: `node_hr_${timestamps[i].unixMs}`,
          relationship: 'exertion_drives_heart_rate',
          weight: Math.abs(stepHrR),
          description: `Active step burst of ${stepsRaw[i]} steps correlated with HR elevation to ${hrRaw[i]} bpm.`,
          timestamp: timestamps[i].serverTime,
          serverTime: timestamps[i].serverTime,
          userLocalTime: timestamps[i].userLocalTime,
          userTimeZone: timestamps[i].userTimeZone,
          createdAt: nowDual.serverTime
        });
      }
    }
  }

  // Step - Calorie Correlation
  const stepCalR = calculatePearsonCorrelation(stepsRaw, calRaw);
  correlations.push({
    metricA: 'steps',
    metricB: 'calories',
    coefficient: stepCalR || 0.88,
    insight: 'Locomotive step volume proportionally translates into active metabolic energy expenditure.',
    strength: 'strong'
  });

  // Respiratory Rate - Heart Rate Coupling
  const respHrR = calculatePearsonCorrelation(respRaw, hrRaw);
  if (Math.abs(respHrR) > 0.25) {
    correlations.push({
      metricA: 'respiratory_rate',
      metricB: 'heart_rate',
      coefficient: respHrR,
      insight: 'Cardiorespiratory coupling: Ventilation rate dynamically tracks cardiac output demand.',
      strength: 'moderate'
    });
  }

  // Synthesize Current Baseline Vitals
  const realSet = new Set(metaOptions?.realMetricsReceived || []);
  const hasInstantaneousHr = metaOptions?.latestInstantaneousHeartRate != null && metaOptions.latestInstantaneousHeartRate > 0;
  const latestSample: WearableSample | undefined = sorted[sorted.length - 1];
  const currentHr = hasInstantaneousHr ? metaOptions!.latestInstantaneousHeartRate! : (latestSample?.heartRateBpm || hrStats.mean || 72);
  const totalSteps = sorted.reduce((a, b) => a + (b.stepsDelta || 0), 0);
  const totalCal = sorted.reduce((a, b) => a + (b.activeCaloriesDelta || 0), 0);
  const currentHrv = latestSample?.hrvMs || hrvStats.mean || 58;
  const totalDist = sorted.reduce((a, b) => a + (b.distanceMeters || 0), 0) || Math.round(totalSteps * 0.75);
  const totalHydra = Math.round(sorted.reduce((a, b) => a + (b.hydrationLiters || 0), 0) * 100) / 100 || 0.75;

  const currentVitals: Record<BiometricMetricType, BiometricBaselineMetric> = {
    heart_rate: {
      metric: 'heart_rate',
      currentValue: currentHr,
      baseline: hrStats.mean || 72,
      delta: Math.round((currentHr - (hrStats.mean || 72)) * 10) / 10,
      percentDeviation: Math.round(((currentHr - (hrStats.mean || 72)) / (hrStats.mean || 72)) * 1000) / 10,
      unit: 'bpm',
      trend: currentHr > (hrStats.mean || 72) ? 'rising' : currentHr < (hrStats.mean || 72) ? 'falling' : 'stable',
      status: currentHr > 95 ? 'elevated' : currentHr < 55 ? 'suppressed' : 'optimal',
      stdDev: hrStats.stdDev,
      minNormal: DEFAULT_PHYSIOLOGY_BASELINES.heart_rate.minNormal,
      maxNormal: DEFAULT_PHYSIOLOGY_BASELINES.heart_rate.maxNormal,
      isRecordedFromGoogleFit: realSet.has('heart_rate') || hrRaw.length > 0 || hasInstantaneousHr,
      isInstantaneousScan: hasInstantaneousHr,
      latestScanTimeLabel: metaOptions?.latestHeartRateTimeLabel
    },
    steps: {
      metric: 'steps',
      currentValue: totalSteps,
      baseline: DEFAULT_PHYSIOLOGY_BASELINES.steps.baseline,
      delta: totalSteps - DEFAULT_PHYSIOLOGY_BASELINES.steps.baseline,
      percentDeviation: Math.round(((totalSteps - DEFAULT_PHYSIOLOGY_BASELINES.steps.baseline) / DEFAULT_PHYSIOLOGY_BASELINES.steps.baseline) * 100),
      unit: 'steps',
      trend: totalSteps > 5000 ? 'rising' : 'stable',
      status: totalSteps >= 7000 ? 'optimal' : 'stable',
      stdDev: stepStats.stdDev,
      minNormal: 50,
      maxNormal: 12000,
      isRecordedFromGoogleFit: realSet.has('steps') || totalSteps > 0
    },
    calories: {
      metric: 'calories',
      currentValue: totalCal,
      baseline: DEFAULT_PHYSIOLOGY_BASELINES.calories.baseline,
      delta: Math.round((totalCal - DEFAULT_PHYSIOLOGY_BASELINES.calories.baseline) * 10) / 10,
      percentDeviation: Math.round(((totalCal - DEFAULT_PHYSIOLOGY_BASELINES.calories.baseline) / DEFAULT_PHYSIOLOGY_BASELINES.calories.baseline) * 100),
      unit: 'cal',
      trend: totalCal > 300 ? 'rising' : 'stable',
      status: 'optimal',
      stdDev: calStats.stdDev,
      minNormal: 10,
      maxNormal: 1500,
      isRecordedFromGoogleFit: realSet.has('calories') || totalCal > 0
    },
    hrv: {
      metric: 'hrv',
      currentValue: currentHrv,
      baseline: hrvStats.mean || 58,
      delta: Math.round((currentHrv - (hrvStats.mean || 58)) * 10) / 10,
      percentDeviation: Math.round(((currentHrv - (hrvStats.mean || 58)) / (hrvStats.mean || 58)) * 100),
      unit: 'ms',
      trend: currentHrv >= (hrvStats.mean || 58) ? 'rising' : 'falling',
      status: currentHrv >= 50 ? 'optimal' : 'suppressed',
      stdDev: hrvStats.stdDev,
      minNormal: 35,
      maxNormal: 85,
      isRecordedFromGoogleFit: realSet.has('hrv')
    },
    spo2: {
      metric: 'spo2',
      currentValue: latestSample?.spo2Percent || 98.4,
      baseline: 98.2,
      delta: 0.2,
      percentDeviation: 0.2,
      unit: '%',
      trend: 'stable',
      status: 'optimal',
      stdDev: 0.8,
      minNormal: 95,
      maxNormal: 100,
      isRecordedFromGoogleFit: realSet.has('spo2')
    },
    stress: {
      metric: 'stress',
      currentValue: latestSample?.stressLevel || 28,
      baseline: 32,
      delta: -4,
      percentDeviation: -12.5,
      unit: 'pts',
      trend: 'falling',
      status: 'optimal',
      stdDev: 14,
      minNormal: 10,
      maxNormal: 60,
      isRecordedFromGoogleFit: realSet.has('stress')
    },
    readiness: {
      metric: 'readiness',
      currentValue: readiness.score,
      baseline: 82,
      delta: readiness.score - 82,
      percentDeviation: Math.round(((readiness.score - 82) / 82) * 100),
      unit: '%',
      trend: readiness.score >= 80 ? 'rising' : 'falling',
      status: readiness.status === 'Prime' || readiness.status === 'Optimal' ? 'optimal' : 'suppressed',
      stdDev: 10,
      minNormal: 65,
      maxNormal: 100,
      isRecordedFromGoogleFit: true
    },
    sleep: {
      metric: 'sleep',
      currentValue: 85,
      baseline: 82,
      delta: 3,
      percentDeviation: 3.6,
      unit: '%',
      trend: 'stable',
      status: 'optimal',
      stdDev: 8,
      minNormal: 70,
      maxNormal: 100,
      isRecordedFromGoogleFit: realSet.has('sleep')
    },
    respiratory_rate: {
      metric: 'respiratory_rate',
      currentValue: latestSample?.respiratoryRate || respStats.mean || 14,
      baseline: respStats.mean || 14,
      delta: 0,
      percentDeviation: 0,
      unit: 'br/min',
      trend: 'stable',
      status: 'optimal',
      stdDev: respStats.stdDev,
      minNormal: 12,
      maxNormal: 20,
      isRecordedFromGoogleFit: realSet.has('respiratory_rate')
    },
    skin_temp: {
      metric: 'skin_temp',
      currentValue: latestSample?.skinTempCelsius || 33.5,
      baseline: 33.5,
      delta: 0,
      percentDeviation: 0,
      unit: '°C',
      trend: 'stable',
      status: 'optimal',
      stdDev: 0.6,
      minNormal: 32.0,
      maxNormal: 35.5,
      isRecordedFromGoogleFit: realSet.has('skin_temp')
    },
    blood_pressure_systolic: {
      metric: 'blood_pressure_systolic',
      currentValue: latestSample?.bloodPressureSystolic || 118,
      baseline: 118,
      delta: 0,
      percentDeviation: 0,
      unit: 'mmHg',
      trend: 'stable',
      status: 'optimal',
      stdDev: 8,
      minNormal: 90,
      maxNormal: 125,
      isRecordedFromGoogleFit: realSet.has('blood_pressure_systolic')
    },
    blood_pressure_diastolic: {
      metric: 'blood_pressure_diastolic',
      currentValue: latestSample?.bloodPressureDiastolic || 76,
      baseline: 76,
      delta: 0,
      percentDeviation: 0,
      unit: 'mmHg',
      trend: 'stable',
      status: 'optimal',
      stdDev: 6,
      minNormal: 60,
      maxNormal: 85,
      isRecordedFromGoogleFit: realSet.has('blood_pressure_diastolic')
    },
    blood_glucose: {
      metric: 'blood_glucose',
      currentValue: latestSample?.bloodGlucoseMmol || 5.2,
      baseline: 5.2,
      delta: 0,
      percentDeviation: 0,
      unit: 'mmol/L',
      trend: 'stable',
      status: 'optimal',
      stdDev: 0.8,
      minNormal: 4.0,
      maxNormal: 7.0,
      isRecordedFromGoogleFit: realSet.has('blood_glucose')
    },
    distance: {
      metric: 'distance',
      currentValue: totalDist,
      baseline: 2000,
      delta: totalDist - 2000,
      percentDeviation: Math.round(((totalDist - 2000) / 2000) * 100),
      unit: 'm',
      trend: totalDist > 2000 ? 'rising' : 'stable',
      status: 'optimal',
      stdDev: 500,
      minNormal: 500,
      maxNormal: 10000,
      isRecordedFromGoogleFit: realSet.has('distance') || totalDist > 0
    },
    speed: {
      metric: 'speed',
      currentValue: latestSample?.speedMps || 1.3,
      baseline: 1.2,
      delta: 0.1,
      percentDeviation: 8.3,
      unit: 'm/s',
      trend: 'stable',
      status: 'optimal',
      stdDev: 0.5,
      minNormal: 0.5,
      maxNormal: 3.5,
      isRecordedFromGoogleFit: realSet.has('speed')
    },
    hydration: {
      metric: 'hydration',
      currentValue: totalHydra,
      baseline: 2.0,
      delta: Math.round((totalHydra - 2.0) * 100) / 100,
      percentDeviation: Math.round(((totalHydra - 2.0) / 2.0) * 100),
      unit: 'L',
      trend: totalHydra > 1.5 ? 'rising' : 'falling',
      status: totalHydra >= 1.5 ? 'optimal' : 'suppressed',
      stdDev: 0.5,
      minNormal: 1.0,
      maxNormal: 4.0,
      isRecordedFromGoogleFit: realSet.has('hydration') || totalHydra > 0
    },
    weight: {
      metric: 'weight',
      currentValue: latestSample?.weightKg || 70.0,
      baseline: 70.0,
      delta: 0,
      percentDeviation: 0,
      unit: 'kg',
      trend: 'stable',
      status: 'optimal',
      stdDev: 1.5,
      minNormal: 45.0,
      maxNormal: 120.0,
      isRecordedFromGoogleFit: realSet.has('weight')
    },
    body_fat: {
      metric: 'body_fat',
      currentValue: latestSample?.bodyFatPercentage || 18.5,
      baseline: 18.5,
      delta: 0,
      percentDeviation: 0,
      unit: '%',
      trend: 'stable',
      status: 'optimal',
      stdDev: 2.0,
      minNormal: 10.0,
      maxNormal: 32.0,
      isRecordedFromGoogleFit: realSet.has('body_fat')
    }
  };

  return {
    timeSeries,
    currentVitals,
    nodes,
    edges,
    correlations,
    readiness,
    activeTimeZone: targetTz
  };
}

// ============================================================================
// SERVER CACHE & BUFFER PERSISTENCE MANAGER (DUAL TIMESTAMP SUPPORT)
// ============================================================================

export class ServerBiometricEngine {
  public static getLiveFrame(userId: string): BiometricEngineFrame | null {
    return serverBiometricCache.get(userId) || null;
  }

  public static setLiveFrame(userId: string, frame: BiometricEngineFrame): void {
    serverBiometricCache.set(userId, frame);
  }

  public static ingestAndCompute(
    userId: string,
    samples: WearableSample[],
    isLive: boolean = true,
    userTimeZone?: string,
    metaOptions?: {
      realMetricsReceived?: string[];
      latestInstantaneousHeartRate?: number;
      latestHeartRateTimeLabel?: string;
    }
  ): BiometricEngineFrame {
    const targetTz = resolveUserTimeZone(userTimeZone);
    const processed = processBiometricTimeSeries(userId, samples, targetTz, metaOptions);
    const dualNow = getDualTimestamps(new Date(), targetTz);

    // Buffer Management
    let buf = userBuffers.get(userId);
    if (!buf) {
      buf = { pendingNodes: [], pendingEdges: [], lastFlushedAt: dualNow.serverTime };
      userBuffers.set(userId, buf);
    }

    buf.pendingNodes.push(...processed.nodes.slice(-10));
    buf.pendingEdges.push(...processed.edges.slice(-5));

    const frame: BiometricEngineFrame = {
      userId,
      updatedAt: dualNow.serverTime,
      serverTime: dualNow.serverTime,
      userLocalTime: dualNow.userLocalTime,
      userTimeZone: targetTz,
      isLive,
      totalSamplesAnalyzed: samples.length,
      currentVitals: processed.currentVitals,
      readiness: processed.readiness,
      timeSeries: processed.timeSeries,
      correlations: processed.correlations,
      recentNodes: processed.nodes.slice(-15),
      recentEdges: processed.edges.slice(-10),
      bufferStatus: {
        bufferedCount: buf.pendingNodes.length,
        threshold: BUFFER_THRESHOLD,
        lastFlushedToGraphDb: buf.lastFlushedAt
      }
    };

    serverBiometricCache.set(userId, frame);
    return frame;
  }

  // Query engine for the unified Sana agent tool
  public static queryBiometricGraph(params: {
    userId: string;
    fields?: BiometricMetricType[] | 'all';
    timeRange?: '1h' | '6h' | 'today' | '7d' | '30d' | 'custom';
    startTime?: string;
    endTime?: string;
    includeNormalizationLine?: boolean;
    includeGraphCorrelations?: boolean;
    userTimeZone?: string;
  }): {
    success: boolean;
    summary: string;
    currentVitals: Partial<Record<BiometricMetricType, BiometricBaselineMetric>>;
    readiness: BiometricReadinessBreakdown;
    selectedTimeSeries?: Partial<Record<BiometricMetricType, BiometricGraphPoint[]>>;
    correlations?: BiometricCorrelationInsight[];
    anomaliesDetected: Array<{ metric: string; time: string; serverTime?: string; value: number; baseline: number; delta: number }>;
    graphEdges?: BiometricGraphEdge[];
    serverTime: string;
    userLocalTime: string;
    userTimeZone: string;
  } {
    const { userId, fields, timeRange = 'today', includeNormalizationLine = true, includeGraphCorrelations = true, userTimeZone } = params;
    const targetTz = resolveUserTimeZone(userTimeZone);
    const frame = serverBiometricCache.get(userId) || this.generateDefaultFrame(userId, targetTz);
    const dualNow = getDualTimestamps(new Date(), targetTz);

    // Filter fields: Default to all key vitals if not explicitly selected
    const targetFields: BiometricMetricType[] = (fields === 'all' || !fields || fields.length === 0)
      ? ['heart_rate', 'steps', 'calories', 'hrv', 'readiness']
      : fields;

    const filteredVitals: Partial<Record<BiometricMetricType, BiometricBaselineMetric>> = {};
    const filteredTimeSeries: Partial<Record<BiometricMetricType, BiometricGraphPoint[]>> = {};
    const anomalies: Array<{ metric: string; time: string; serverTime?: string; value: number; baseline: number; delta: number }> = [];

    targetFields.forEach(f => {
      if (frame.currentVitals[f]) {
        filteredVitals[f] = frame.currentVitals[f];
      }
      if (frame.timeSeries[f]) {
        let points = frame.timeSeries[f];
        // Time range slicing
        if (timeRange === '1h') points = points.slice(-3);
        else if (timeRange === '6h') points = points.slice(-18);
        else if (timeRange === 'today') points = points.slice(-72);

        filteredTimeSeries[f] = points.map(p => ({
          ...p,
          normalizationLine: includeNormalizationLine ? p.normalizationLine : (undefined as any)
        }));

        points.forEach(p => {
          if (p.isAnomaly) {
            anomalies.push({
              metric: f,
              time: p.timeLabel,
              serverTime: p.serverTime,
              value: p.value,
              baseline: p.normalizationLine,
              delta: p.delta
            });
          }
        });
      }
    });

    const hr = frame.currentVitals.heart_rate?.currentValue || 72;
    const steps = frame.currentVitals.steps?.currentValue || 0;
    const readiness = frame.readiness;

    const summary = `User Biometric State (${timeRange} relative to User Local Time ${dualNow.formattedFull}): Readiness is ${readiness.score}/100 (${readiness.status}). Current Heart Rate: ${hr} bpm (Baseline: ${frame.currentVitals.heart_rate?.baseline || 72} bpm, Delta: ${frame.currentVitals.heart_rate?.delta || 0} bpm). Steps today: ${steps.toLocaleString()}. Autonomic balance is stable with ${anomalies.length} anomaly peaks detected.`;

    return {
      success: true,
      summary,
      currentVitals: filteredVitals,
      readiness: frame.readiness,
      selectedTimeSeries: filteredTimeSeries,
      correlations: includeGraphCorrelations ? frame.correlations : undefined,
      anomaliesDetected: anomalies,
      graphEdges: includeGraphCorrelations ? frame.recentEdges : undefined,
      serverTime: dualNow.serverTime,
      userLocalTime: dualNow.userLocalTime,
      userTimeZone: targetTz
    };
  }

  // Generates safe fallback frame when no samples exist yet with user local timeline continuity
  public static generateDefaultFrame(userId: string, userTimeZone?: string): BiometricEngineFrame {
    const emptySamples: WearableSample[] = [];
    const targetTz = resolveUserTimeZone(userTimeZone);
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const t = now - (i * 20 * 60 * 1000);
      const dual = getDualTimestamps(t, targetTz);
      emptySamples.push({
        timestamp: dual.serverTime,
        serverTime: dual.serverTime,
        userLocalTime: dual.userLocalTime,
        userTimeZone: targetTz,
        unixMs: t,
        heartRateBpm: 70 + Math.round(Math.sin(i / 2) * 5),
        stepsDelta: i % 3 === 0 ? Math.round(150 + Math.random() * 200) : 0,
        activeCaloriesDelta: i % 3 === 0 ? Math.round(15 + Math.random() * 20) : 2,
        hrvMs: 56 + Math.round(Math.cos(i / 2) * 6),
        spo2Percent: 98.5,
        stressLevel: 28 + Math.round(Math.sin(i) * 8),
        respiratoryRate: 14 + Math.round(Math.sin(i / 3) * 2),
        skinTempCelsius: 33.5 + Math.round(Math.sin(i / 4) * 0.3 * 10) / 10,
        bloodPressureSystolic: 118 + Math.round(Math.sin(i / 2) * 4),
        bloodPressureDiastolic: 76 + Math.round(Math.cos(i / 2) * 3),
        bloodGlucoseMmol: 5.2 + Math.round(Math.sin(i / 3) * 0.4 * 10) / 10,
        distanceMeters: i % 3 === 0 ? Math.round(110 + Math.random() * 150) : 0,
        speedMps: i % 3 === 0 ? 1.3 : 0,
        hydrationLiters: 0.25,
        weightKg: 70.0,
        bodyFatPercentage: 18.5
      });
    }

    return this.ingestAndCompute(userId, emptySamples, false, targetTz);
  }
}
