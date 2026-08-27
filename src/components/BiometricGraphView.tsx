import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Area
} from 'recharts';
import {
  BiometricMetricType,
  BiometricEngineFrame,
  BiometricGraphPoint,
  BiometricBaselineMetric
} from '../types';

interface BiometricGraphViewProps {
  userId: string;
  isConnected: boolean;
  initialFrame?: BiometricEngineFrame | null;
  onManualSync?: () => Promise<void>;
  isSyncing?: boolean;
}

// Client-side presentation formatting helpers
export function formatCalorieUnit(val: number): { displayValue: string; unit: string } {
  if (val == null || isNaN(val)) return { displayValue: '0', unit: 'kcal' };
  return { displayValue: `${Math.round(val).toLocaleString()}`, unit: 'kcal' };
}

export function formatMetricValue(metric: BiometricMetricType, val: number): string {
  if (val == null || isNaN(val)) return '—';
  switch (metric) {
    case 'calories': {
      const formatted = formatCalorieUnit(val);
      return `${formatted.displayValue} ${formatted.unit}`;
    }
    case 'steps':
      return `${Math.round(val).toLocaleString()} steps`;
    case 'heart_rate':
      return `${Math.round(val)} BPM`;
    case 'hrv':
      return `${Math.round(val)} ms`;
    case 'readiness':
      return `${Math.round(val)}/100`;
    case 'spo2':
      return `${val.toFixed(1)}%`;
    case 'stress':
      return `${Math.round(val)} pts`;
    case 'respiratory_rate':
      return `${val.toFixed(1)} br/min`;
    case 'skin_temp':
      return `${val.toFixed(1)} °C`;
    case 'blood_pressure_systolic':
    case 'blood_pressure_diastolic':
      return `${Math.round(val)} mmHg`;
    case 'blood_glucose':
      return `${val.toFixed(1)} mmol/L`;
    case 'distance':
      return val >= 1000 ? `${(val / 1000).toFixed(2)} km` : `${Math.round(val)} m`;
    case 'speed':
      return `${val.toFixed(1)} m/s`;
    case 'hydration':
      return `${val.toFixed(2)} L`;
    case 'weight':
      return `${val.toFixed(1)} kg`;
    case 'body_fat':
      return `${val.toFixed(1)}%`;
    case 'sleep':
      return `${Math.round(val)}/100`;
    default:
      return `${val}`;
  }
}

const METRIC_CONFIGS: Record<BiometricMetricType, {
  label: string;
  icon: string;
  lineColor: string;
  baselineColor: string;
  fillGradStart: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}> = {
  heart_rate: {
    label: 'Heart Rate',
    icon: 'solar:heart-pulse-bold-duotone',
    lineColor: '#f43f5e',
    baselineColor: '#cbd5e1',
    fillGradStart: '#ffe4e6',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    description: 'Continuous cardiovascular pulse and exertion response.'
  },
  steps: {
    label: 'Step Cadence',
    icon: 'solar:walking-bold-duotone',
    lineColor: '#0284c7',
    baselineColor: '#cbd5e1',
    fillGradStart: '#e0f2fe',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    description: 'Binned 20-minute locomotive movement and cadence.'
  },
  calories: {
    label: 'Active Energy',
    icon: 'solar:flame-bold-duotone',
    lineColor: '#f59e0b',
    baselineColor: '#cbd5e1',
    fillGradStart: '#fef3c7',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    description: 'Metabolic expenditure dynamically formatted in cal and kcal.'
  },
  hrv: {
    label: 'HRV (Recovery)',
    icon: 'solar:activity-bold-duotone',
    lineColor: '#10b981',
    baselineColor: '#cbd5e1',
    fillGradStart: '#d1fae5',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    description: 'Autonomic nervous system parasympathetic tone (SDNN).'
  },
  readiness: {
    label: 'Clinical Readiness',
    icon: 'solar:shield-check-bold-duotone',
    lineColor: '#8b5cf6',
    baselineColor: '#cbd5e1',
    fillGradStart: '#ede9fe',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-700',
    description: 'Multi-factor biological readiness calculated on server.'
  },
  stress: {
    label: 'Autonomic Strain',
    icon: 'solar:bolt-bold-duotone',
    lineColor: '#ec4899',
    baselineColor: '#cbd5e1',
    fillGradStart: '#fce7f3',
    badgeBg: 'bg-pink-50',
    badgeText: 'text-pink-700',
    description: 'Physiological arousal and stress index derived from HRV.'
  },
  spo2: {
    label: 'Blood Oxygen',
    icon: 'solar:drop-bold-duotone',
    lineColor: '#06b6d4',
    baselineColor: '#cbd5e1',
    fillGradStart: '#cffafe',
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-700',
    description: 'Arterial blood oxygen saturation levels.'
  },
  sleep: {
    label: 'Sleep Quality',
    icon: 'solar:moon-stars-bold-duotone',
    lineColor: '#6366f1',
    baselineColor: '#cbd5e1',
    fillGradStart: '#e0e7ff',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-700',
    description: 'Nocturnal regeneration and stage architecture.'
  },
  respiratory_rate: {
    label: 'Respiration Rate',
    icon: 'solar:wind-bold-duotone',
    lineColor: '#14b8a6',
    baselineColor: '#cbd5e1',
    fillGradStart: '#ccfbf1',
    badgeBg: 'bg-teal-50',
    badgeText: 'text-teal-700',
    description: 'Spontaneous pulmonary breathing cycles per minute.'
  },
  skin_temp: {
    label: 'Skin Temperature',
    icon: 'solar:thermometer-bold-duotone',
    lineColor: '#f97316',
    baselineColor: '#cbd5e1',
    fillGradStart: '#ffedd5',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    description: 'Peripheral dermal thermoregulation.'
  },
  blood_pressure_systolic: {
    label: 'Systolic BP',
    icon: 'solar:heart-bold-duotone',
    lineColor: '#ef4444',
    baselineColor: '#cbd5e1',
    fillGradStart: '#fee2e2',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-700',
    description: 'Peak arterial pressure during ventricular contraction.'
  },
  blood_pressure_diastolic: {
    label: 'Diastolic BP',
    icon: 'solar:heart-angle-bold-duotone',
    lineColor: '#dc2626',
    baselineColor: '#cbd5e1',
    fillGradStart: '#fecaca',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    description: 'Baseline resting arterial pressure between beats.'
  },
  blood_glucose: {
    label: 'Blood Glucose',
    icon: 'solar:cup-bold-duotone',
    lineColor: '#84cc16',
    baselineColor: '#cbd5e1',
    fillGradStart: '#ecfccb',
    badgeBg: 'bg-lime-50',
    badgeText: 'text-lime-700',
    description: 'Capillary and interstitial glycemic concentration.'
  },
  distance: {
    label: 'Distance Traveled',
    icon: 'solar:map-point-wave-bold-duotone',
    lineColor: '#3b82f6',
    baselineColor: '#cbd5e1',
    fillGradStart: '#dbeafe',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    description: 'Total locomotive spatial displacement.'
  },
  speed: {
    label: 'Movement Speed',
    icon: 'solar:speedometer-middle-bold-duotone',
    lineColor: '#0ea5e9',
    baselineColor: '#cbd5e1',
    fillGradStart: '#e0f2fe',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    description: 'Instantaneous ambulatory pacing velocity.'
  },
  hydration: {
    label: 'Fluid Intake',
    icon: 'solar:bottle-bold-duotone',
    lineColor: '#0284c7',
    baselineColor: '#cbd5e1',
    fillGradStart: '#e0f2fe',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-700',
    description: 'Hydration and osmotic fluid balance volume.'
  },
  weight: {
    label: 'Body Weight',
    icon: 'solar:scale-bold-duotone',
    lineColor: '#64748b',
    baselineColor: '#cbd5e1',
    fillGradStart: '#f1f5f9',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    description: 'Total somatic mass tracked over time.'
  },
  body_fat: {
    label: 'Body Fat %',
    icon: 'solar:pie-chart-2-bold-duotone',
    lineColor: '#a855f7',
    baselineColor: '#cbd5e1',
    fillGradStart: '#f3e8ff',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    description: 'Adipose tissue percentage via bioimpedance analysis.'
  }
};

export const BiometricGraphView: React.FC<BiometricGraphViewProps> = ({
  userId,
  isConnected,
  initialFrame,
  onManualSync,
  isSyncing = false
}) => {
  const [selectedMetric, setSelectedMetric] = useState<BiometricMetricType>('heart_rate');
  const [metricCategory, setMetricCategory] = useState<'all' | 'cardio' | 'activity' | 'clinical' | 'body'>('all');
  const [graphMode, setGraphMode] = useState<'single' | 'hybrid' | 'overlapping'>('single');
  const [enabledOverlayMetrics, setEnabledOverlayMetrics] = useState<BiometricMetricType[]>([
    'heart_rate', 'steps', 'calories', 'hrv', 'stress'
  ]);
  const [timeRange, setTimeRange] = useState<'20m' | '1h' | '6h' | '24h'>('24h');
  const [frame, setFrame] = useState<BiometricEngineFrame | null>(initialFrame || null);
  const [isLiveAutoSync, setIsLiveAutoSync] = useState<boolean>(true);
  const [secondsUntilNextSync, setSecondsUntilNextSync] = useState<number>(60);
  const [showNormalizationDetails, setShowNormalizationDetails] = useState<boolean>(false);
  const [showReadinessExplainer, setShowReadinessExplainer] = useState<boolean>(false);
  const [isFetchingLive, setIsFetchingLive] = useState<boolean>(false);

  const ALL_METRIC_KEYS: BiometricMetricType[] = [
    'heart_rate', 'steps', 'calories', 'hrv', 'readiness', 'stress', 'spo2', 'sleep',
    'respiratory_rate', 'skin_temp', 'blood_pressure_systolic', 'blood_pressure_diastolic',
    'blood_glucose', 'distance', 'speed', 'hydration', 'weight', 'body_fat'
  ];

  const CATEGORY_MAP: Record<string, BiometricMetricType[]> = {
    all: ALL_METRIC_KEYS,
    cardio: ['heart_rate', 'hrv', 'readiness', 'stress', 'spo2', 'respiratory_rate'],
    activity: ['steps', 'calories', 'distance', 'speed'],
    clinical: ['blood_pressure_systolic', 'blood_pressure_diastolic', 'blood_glucose', 'skin_temp'],
    body: ['sleep', 'hydration', 'weight', 'body_fat']
  };

  const displayedMetricKeys = CATEGORY_MAP[metricCategory] || ALL_METRIC_KEYS;

  // Client-side resolved timezone
  const userTimeZone = typeof Intl !== 'undefined' && Intl.DateTimeFormat
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    : 'UTC';

  // Fetch Live Frame from server computation engine with user timezone context
  const fetchLiveFrame = async () => {
    try {
      setIsFetchingLive(true);
      const res = await fetch(`/api/wearables/biometric-engine/live-frame/${userId || 'guest_user'}?timeZone=${encodeURIComponent(userTimeZone)}`, {
        headers: {
          'x-user-timezone': userTimeZone
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.frame) {
          setFrame(data.frame);
        }
      }
    } catch (err) {
      console.warn('[BiometricGraph] Live frame fetch warning:', err);
    } finally {
      setIsFetchingLive(false);
    }
  };

  useEffect(() => {
    if (initialFrame) {
      setFrame(initialFrame);
    } else {
      fetchLiveFrame();
    }
  }, [initialFrame, userId]);

  // 1-Minute Live Polling Loop
  useEffect(() => {
    if (!isLiveAutoSync) return;

    const timer = setInterval(() => {
      setSecondsUntilNextSync(prev => {
        if (prev <= 1) {
          fetchLiveFrame();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLiveAutoSync, userId]);

  const currentMetricData: BiometricBaselineMetric | undefined = frame?.currentVitals?.[selectedMetric];
  const chartPoints: BiometricGraphPoint[] = frame?.timeSeries?.[selectedMetric] || [];
  const cfg = METRIC_CONFIGS[selectedMetric];

  const displayedChartPoints = React.useMemo(() => {
    if (!chartPoints || chartPoints.length === 0) return [];
    if (timeRange === '20m') return chartPoints.slice(-1);
    if (timeRange === '1h') return chartPoints.slice(-3);
    if (timeRange === '6h') return chartPoints.slice(-18);
    return chartPoints;
  }, [chartPoints, timeRange]);

  // Calorie client formatting
  const calorieSummary = frame?.currentVitals?.calories
    ? formatCalorieUnit(frame.currentVitals.calories.currentValue)
    : { displayValue: '0', unit: 'cal' };

  // Memoized Overlapping Multi-Metric Timeline Data
  const overlappingChartData = React.useMemo(() => {
    if (!frame?.timeSeries) return [];
    
    let refKey: BiometricMetricType = selectedMetric;
    if (!frame.timeSeries[refKey] || frame.timeSeries[refKey].length === 0) {
      const keys = Object.keys(frame.timeSeries) as BiometricMetricType[];
      if (keys.length > 0) refKey = keys[0];
    }

    const basePoints = frame.timeSeries[refKey] || [];
    if (basePoints.length === 0) return [];

    const metricRanges: Record<string, { min: number; max: number; range: number }> = {};
    enabledOverlayMetrics.forEach(mKey => {
      const series = frame.timeSeries?.[mKey] || [];
      const vals = series.map(s => s.value).filter(v => typeof v === 'number' && !isNaN(v));
      if (vals.length > 0) {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        metricRanges[mKey] = { min, max, range: max - min || 1 };
      } else {
        metricRanges[mKey] = { min: 0, max: 100, range: 100 };
      }
    });

    return basePoints.map((pt, idx) => {
      const item: Record<string, any> = {
        timeLabel: pt.timeLabel,
        serverTimeLabel: pt.serverTimeLabel,
        isAnomaly: pt.isAnomaly
      };

      enabledOverlayMetrics.forEach(mKey => {
        const series = frame.timeSeries?.[mKey] || [];
        const mPoint = series[idx];
        if (mPoint && typeof mPoint.value === 'number') {
          const rawVal = mPoint.value;
          item[`${mKey}_raw`] = rawVal;
          const { min, range } = metricRanges[mKey] || { min: 0, range: 100 };
          const normVal = Math.round(((rawVal - min) / range) * 100);
          item[`${mKey}_norm`] = Math.max(0, Math.min(100, normVal));
        }
      });

      return item;
    });
  }, [frame, enabledOverlayMetrics, selectedMetric]);

  return (
    <div className="space-y-4">
      {/* 1. Header Control Bar: 1-Minute Live Sync Switch & Manual Refresh with Dual Timezone indicator */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between flex-wrap gap-3 shadow-md">
        <div className="flex items-center space-x-2.5">
          <div className="relative flex items-center justify-center">
            <span className={`w-2.5 h-2.5 rounded-full ${isLiveAutoSync ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {isLiveAutoSync && (
              <span className="absolute w-4 h-4 rounded-full bg-emerald-400/40 animate-ping" />
            )}
          </div>
          <div>
            <div className="flex items-center space-x-2 flex-wrap">
              <span className="text-xs font-bold tracking-tight">
                {isLiveAutoSync ? 'Real-Time Biometric Engine' : 'Sync Paused'}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-slate-200">
                Server-Calculated Baselines
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                <Icon icon="solar:clock-circle-bold" className="w-3 h-3" />
                <span>User Local Time ({userTimeZone})</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {isLiveAutoSync 
                ? `Next automatic refresh in ${secondsUntilNextSync}s • Aligned to user local timeline` 
                : '1-minute auto refresh is paused'}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* 1-Minute Auto Refresh Toggle Switch */}
          <button
            onClick={() => {
              setIsLiveAutoSync(!isLiveAutoSync);
              if (!isLiveAutoSync) setSecondsUntilNextSync(60);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
              isLiveAutoSync
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                : 'bg-white/10 text-slate-300 border border-white/10 hover:bg-white/20'
            }`}
          >
            <Icon icon={isLiveAutoSync ? "solar:radar-bold" : "solar:pause-circle-bold"} className="w-3.5 h-3.5" />
            <span>{isLiveAutoSync ? '1m Live Sync ON' : '1m Live Sync OFF'}</span>
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={async () => {
              if (onManualSync) {
                await onManualSync();
              }
              await fetchLiveFrame();
              setSecondsUntilNextSync(60);
            }}
            disabled={isSyncing || isFetchingLive}
            className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5"
          >
            <Icon
              icon="solar:restart-bold"
              className={`w-3.5 h-3.5 ${isSyncing || isFetchingLive ? 'animate-spin' : ''}`}
            />
            <span>{isSyncing || isFetchingLive ? 'Updating...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* 2. Metric Category Filter & Chips */}
      <div className="space-y-2">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
          {[
            { id: 'all', label: 'All Metrics (18)' },
            { id: 'cardio', label: 'Cardio & Recovery' },
            { id: 'activity', label: 'Activity & Movement' },
            { id: 'clinical', label: 'Clinical & Vitals' },
            { id: 'body', label: 'Body & Sleep' }
          ].map(cat => {
            const isCatActive = metricCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setMetricCategory(cat.id as any)}
                className={`px-3 py-1 rounded-xl transition-all cursor-pointer whitespace-nowrap text-xs ${
                  isCatActive
                    ? 'bg-slate-900 text-white font-bold shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
          {displayedMetricKeys.map(mKey => {
            const isSelected = selectedMetric === mKey;
            const mCfg = METRIC_CONFIGS[mKey];
            const vit = frame?.currentVitals?.[mKey];

            return (
              <button
                key={mKey}
                onClick={() => setSelectedMetric(mKey)}
                className={`px-3 py-2 rounded-2xl border text-left transition-all cursor-pointer shrink-0 flex items-center space-x-2.5 ${
                  isSelected
                    ? 'bg-white border-slate-900 shadow-md ring-1 ring-slate-900 text-slate-900'
                    : 'bg-slate-50/80 border-slate-200/80 text-slate-600 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div className={`p-1.5 rounded-xl relative ${mCfg.badgeBg} ${mCfg.badgeText}`}>
                  <Icon icon={mCfg.icon} className="w-4 h-4" />
                  {vit?.isRecordedFromGoogleFit && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" title="Recorded live from Google Fit" />
                  )}
                </div>
                <div>
                  <div className="flex items-center space-x-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider block text-slate-500 whitespace-nowrap">
                      {mCfg.label}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold text-slate-900 whitespace-nowrap">
                    {vit ? formatMetricValue(mKey, vit.currentValue) : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Primary Aesthetic Line Graph Card with Normalization & Overlapping Modes */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
        {/* Metric Header, Graph Mode Options & Normalization Delta Summary */}
        <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center space-x-2 flex-wrap gap-1">
              <h4 className="text-base font-bold text-slate-900">
                {graphMode === 'overlapping' 
                  ? 'Biometric Multi-Metric Overlapping View' 
                  : `${cfg.label} ${currentMetricData?.isInstantaneousScan ? 'Instantaneous Scan & Stream' : 'Timeline'}`}
              </h4>
              
              {/* Google Fit Connection Status Badge or Demo Badge */}
              {frame?.isDemoFrame ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  <span>Demo Mode (No Active Sensor Stream)</span>
                </span>
              ) : currentMetricData?.isRecordedFromGoogleFit ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Google Fit Live API</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  <span>No Sensor Log Recorded Today</span>
                </span>
              )}

              {currentMetricData && graphMode !== 'overlapping' && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  currentMetricData.status === 'optimal' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : currentMetricData.status === 'elevated' 
                    ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}>
                  {currentMetricData.status.toUpperCase()}
                </span>
              )}
            </div>
            
            {/* Callout if instantaneous scan is active */}
            {currentMetricData?.isInstantaneousScan && graphMode !== 'overlapping' && (
              <div className="mt-1.5 p-2 rounded-xl bg-rose-50/80 border border-rose-200/60 text-rose-900 text-xs flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Icon icon="solar:heart-pulse-bold" className="w-4 h-4 text-rose-600 animate-pulse" />
                  <span>
                    <strong>Instantaneous Watch Scan:</strong> Real-time reading from Google Fit stream
                  </span>
                </div>
                <span className="font-extrabold text-sm text-rose-700 bg-white px-2 py-0.5 rounded-lg border border-rose-200 shadow-xs">
                  {currentMetricData.currentValue} BPM
                  {currentMetricData.latestScanTimeLabel && (
                    <span className="text-[10px] font-normal text-rose-500 ml-1">
                      ({currentMetricData.latestScanTimeLabel})
                    </span>
                  )}
                </span>
              </div>
            )}

            <p className="text-xs text-slate-500 mt-1">
              {graphMode === 'overlapping' 
                ? 'Overlaying multiple biometric metrics on normalized % scale for visual cross-correlation.' 
                : cfg.description}
            </p>
          </div>

          {/* Graph Options Selector (Single, Hybrid, Overlapping Lines) */}
          <div className="flex items-center space-x-1.5 bg-slate-100/90 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setGraphMode('single')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                graphMode === 'single'
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon icon="solar:chart-line-bold" className="w-3.5 h-3.5 text-rose-500" />
              <span>Single</span>
            </button>
            <button
              onClick={() => setGraphMode('hybrid')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                graphMode === 'hybrid'
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200 font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon icon="solar:graph-bold-duotone" className="w-3.5 h-3.5 text-violet-500" />
              <span>Hybrid</span>
            </button>
            <button
              onClick={() => setGraphMode('overlapping')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center space-x-1.5 cursor-pointer ${
                graphMode === 'overlapping'
                  ? 'bg-slate-900 text-white shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon icon="solar:layers-minimalistic-bold-duotone" className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
              <span>Overlapping Lines</span>
            </button>
          </div>
        </div>

        {/* Interactive Metric Toggles or Legend + Time Range Chips */}
        {graphMode === 'overlapping' ? (
          <div className="p-3 rounded-2xl bg-slate-900 text-white space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Icon icon="solar:layers-minimalistic-bold-duotone" className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold">Overlapping Lines (Normalized 0-100% Relative Scale)</span>
              </div>
              <span className="text-[10px] text-slate-400">Click metric to toggle overlay line</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ALL_METRIC_KEYS.slice(0, 10).map(mKey => {
                const isEnabled = enabledOverlayMetrics.includes(mKey);
                const mCfg = METRIC_CONFIGS[mKey];
                return (
                  <button
                    key={mKey}
                    onClick={() => {
                      if (isEnabled) {
                        if (enabledOverlayMetrics.length > 1) {
                          setEnabledOverlayMetrics(enabledOverlayMetrics.filter(k => k !== mKey));
                        }
                      } else {
                        setEnabledOverlayMetrics([...enabledOverlayMetrics, mKey]);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                      isEnabled
                        ? 'bg-white/15 text-white border-white/30 shadow-xs'
                        : 'bg-white/5 text-slate-400 border-white/5 opacity-50 hover:opacity-90'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mCfg.lineColor }} />
                    <span>{mCfg.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Legend Explaining Data Line vs Normalization Baseline & Time Range Selector Chips */
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50/70 px-3 py-1.5 rounded-xl border border-slate-100 flex-wrap gap-2">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-1.5">
                <span className="w-3 h-0.5 rounded-full" style={{ backgroundColor: cfg.lineColor }} />
                <span className="font-semibold text-slate-700">{cfg.label} Stream</span>
              </div>
              {graphMode === 'hybrid' ? (
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 h-2 rounded opacity-50" style={{ backgroundColor: cfg.fillGradStart }} />
                  <span className="font-semibold text-slate-700">Shaded Exertion Envelope</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5">
                  <span className="w-3 border-t-2 border-dashed border-slate-400" />
                  <span className="font-semibold text-slate-700">Server Baseline</span>
                </div>
              )}
            </div>

            {/* Time Range Chips */}
            <div className="flex items-center space-x-1 text-[10px] font-bold bg-slate-200/60 p-0.5 rounded-lg">
              {(['20m', '1h', '6h', '24h'] as const).map(tr => (
                <button
                  key={tr}
                  onClick={() => setTimeRange(tr)}
                  className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                    timeRange === tr
                      ? 'bg-white text-slate-900 shadow-xs font-extrabold'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {tr.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recharts Line Graph Rendering */}
        <div className="w-full h-64 sm:h-72">
          {graphMode === 'overlapping' ? (
            overlappingChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overlappingChartData} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="timeLabel"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const rowData = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-2 min-w-[220px]">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                              <span className="font-bold text-white text-sm">{rowData.timeLabel}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                                Overlapping View
                              </span>
                            </div>
                            <div className="space-y-1">
                              {enabledOverlayMetrics.map(mKey => {
                                const mCfg = METRIC_CONFIGS[mKey];
                                const rawVal = rowData[`${mKey}_raw`];
                                const normVal = rowData[`${mKey}_norm`];
                                if (rawVal == null) return null;
                                return (
                                  <div key={mKey} className="flex items-center justify-between text-xs space-x-2">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: mCfg.lineColor }} />
                                      <span className="text-slate-300 text-[11px] font-medium">{mCfg.label}:</span>
                                    </div>
                                    <div className="flex items-baseline space-x-1 font-bold">
                                      <span className="text-white">{formatMetricValue(mKey, rawVal)}</span>
                                      <span className="text-[10px] text-slate-400">({normVal}%)</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* Overlapping Lines with connectNulls={false} */}
                  {enabledOverlayMetrics.map(mKey => {
                    const mCfg = METRIC_CONFIGS[mKey];
                    return (
                      <Line
                        key={mKey}
                        type="monotone"
                        dataKey={`${mKey}_norm`}
                        stroke={mCfg.lineColor}
                        strokeWidth={2.5}
                        connectNulls={false}
                        dot={false}
                        activeDot={{ r: 4.5, stroke: '#fff', strokeWidth: 1.5 }}
                        name={mCfg.label}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center p-6">
                <Icon icon="solar:chart-square-linear" className="w-8 h-8 text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700">No Samples for Overlapping View</p>
              </div>
            )
          ) : displayedChartPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={displayedChartPoints} margin={{ top: 10, right: 15, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="timeLabel"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as BiometricGraphPoint;
                      if (data.value == null) return null;
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-1.5 min-w-[200px]">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                            <div>
                              <div className="flex items-center space-x-1.5">
                                <span className="font-bold text-white text-sm">{data.timeLabel}</span>
                                <span className="text-[9.5px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-semibold">Local</span>
                              </div>
                              {data.serverTimeLabel && (
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Server UTC: {data.serverTimeLabel}
                                </span>
                              )}
                            </div>
                            {data.isAnomaly && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9.5px] font-bold border border-rose-500/30">
                                Anomaly Peak
                              </span>
                            )}
                          </div>
                          <div className="flex items-baseline justify-between space-x-3 pt-0.5">
                            <span className="text-slate-400">Actual:</span>
                            <span className="font-extrabold text-white text-sm">
                              {formatMetricValue(selectedMetric, data.value)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between space-x-3">
                            <span className="text-slate-400">Normalization:</span>
                            <span className="font-semibold text-slate-300">
                              {formatMetricValue(selectedMetric, data.normalizationLine)}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between space-x-3">
                            <span className="text-slate-400">Delta:</span>
                            <span className={`font-semibold ${data.delta > 0 ? 'text-amber-300' : data.delta < 0 ? 'text-sky-300' : 'text-slate-300'}`}>
                              {data.delta > 0 ? `+${data.delta}` : data.delta} {data.unit}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />

                {/* Hybrid Area Fill with connectNulls={false} */}
                {graphMode === 'hybrid' && (
                  <Area
                    type="monotone"
                    dataKey="value"
                    fill={cfg.fillGradStart}
                    stroke="none"
                    connectNulls={false}
                    fillOpacity={0.6}
                  />
                )}

                {/* Dashed Normalization Baseline Line with connectNulls={false} */}
                <Line
                  type="monotone"
                  dataKey="normalizationLine"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  connectNulls={false}
                  dot={false}
                  name="Normalization Line"
                />

                {/* Primary Data Line with connectNulls={false} & Anomaly Markers */}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={cfg.lineColor}
                  strokeWidth={2.8}
                  connectNulls={false}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    if (cx == null || cy == null || payload?.value == null) return <g key={`dot-empty-${index}`} />;
                    if (payload?.isAnomaly) {
                      return (
                        <circle
                          key={`dot-anomaly-${index}`}
                          cx={cx}
                          cy={cy}
                          r={5.5}
                          fill="#ef4444"
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      );
                    }
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={2.5}
                        fill={cfg.lineColor}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{ r: 5, fill: cfg.lineColor, stroke: '#fff', strokeWidth: 2 }}
                  name={cfg.label}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center p-6">
              <Icon icon="solar:chart-square-linear" className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-xs font-bold text-slate-700">No Biometric Samples in Current Window</p>
              <p className="text-[11px] text-slate-500 max-w-xs mt-0.5">
                Connect your wearable or click "Sync Now" to process the latest micro-batches.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. Clinical Readiness Score Breakdown Card */}
      {frame?.readiness && (
        <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-violet-50/80 via-white to-slate-50 border border-violet-100 shadow-2xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-violet-600 text-white shadow-md shadow-violet-600/20">
                <Icon icon="solar:shield-check-bold-duotone" className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Clinical Readiness Score: <strong className="text-violet-700 text-base">{frame.readiness.score}/100</strong>
                </h4>
                <p className="text-xs text-slate-500">
                  Status: <strong>{frame.readiness.status}</strong> • Scientific 3-factor autonomic breakdown
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowReadinessExplainer(!showReadinessExplainer)}
              className="text-xs font-bold text-violet-700 hover:text-violet-900 cursor-pointer flex items-center space-x-1"
            >
              <span>{showReadinessExplainer ? 'Hide Breakdown' : 'View Formula'}</span>
              <Icon icon={showReadinessExplainer ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3 Component Progress Bars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* HRV Recovery Factor */}
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">HRV Recovery</span>
                <span className="font-extrabold text-emerald-600">{frame.readiness.hrvRecoveryFactor}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${frame.readiness.hrvRecoveryFactor}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">40% Model Weight</span>
            </div>

            {/* Resting Heart Rate Factor */}
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Resting HR Rest</span>
                <span className="font-extrabold text-sky-600">{frame.readiness.restingHrFactor}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all duration-500"
                  style={{ width: `${frame.readiness.restingHrFactor}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">30% Model Weight</span>
            </div>

            {/* Exertion / Sleep Factor */}
            <div className="p-3 rounded-2xl bg-white border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Exertion Balance</span>
                <span className="font-extrabold text-violet-600">{frame.readiness.sleepRecoveryFactor}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${frame.readiness.sleepRecoveryFactor}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 block font-medium">30% Model Weight</span>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed bg-white/70 p-2.5 rounded-xl border border-violet-100">
            {frame.readiness.explanation}
          </p>

          <AnimatePresence>
            {showReadinessExplainer && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-2 border-t border-violet-100 text-xs text-slate-600 space-y-1.5"
              >
                <p className="font-semibold text-slate-900">
                  How Sana Computes Readiness:
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Readiness is determined by our server-side autonomic algorithm: 
                  <strong> 0.40 × HRV Recovery Score + 0.30 × Resting HR Score + 0.30 × Exertion/Sleep Balance</strong>. 
                  When your HRV rises above your personal baseline and resting pulse settles, your body enters peak recovery.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* 5. Relational Graph Discoveries (Discovered Edges & Cross-Metric Correlations) */}
      {frame?.correlations && frame.correlations.length > 0 && (
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
          <div className="flex items-center space-x-2">
            <Icon icon="solar:share-circle-bold-duotone" className="w-4 h-4 text-sky-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Discovered Biometric Correlations
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {frame.correlations.map((corr, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 capitalize">
                    {corr.metricA} ↔ {corr.metricB}
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                    r = {corr.coefficient}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-tight">
                  {corr.insight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
