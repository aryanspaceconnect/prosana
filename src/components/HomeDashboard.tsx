import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, FacialScanResult, DailyBriefing, WearableBufferState } from '../types';
import { pickHomeGreeting, GreetingConfig } from '../lib/homeGreetings';
import { wearableBufferService, calculateBatchSummary } from '../lib/wearableBufferService';
import { WearablesHub } from './WearablesHub';
import { formatCalorieUnit } from './BiometricGraphView';

interface HomeDashboardProps {
  userProfile: UserProfile | null;
  latestScan?: FacialScanResult | null;
  dailyBrief: DailyBriefing;
  onOpenScan?: () => void;
  onOpenAgent: () => void;
  onOpenCalendar: () => void;
  onOpenSettings?: () => void;
}

interface MetricDetailPopup {
  label: string;
  value: string;
  category: string;
  skinImpact: string;
  recommendation: string;
  icon: string;
  colorClass: string;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  userProfile,
  latestScan,
  dailyBrief,
  onOpenScan,
  onOpenAgent,
  onOpenCalendar,
  onOpenSettings
}) => {
  const [variantOffset, setVariantOffset] = useState(0);
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(false);
  const [activeMetricDetail, setActiveMetricDetail] = useState<MetricDetailPopup | null>(null);
  const [isWearablesOpen, setIsWearablesOpen] = useState(false);

  // Live Wearable Buffer state
  const [wearableState, setWearableState] = useState<WearableBufferState>(() => {
    wearableBufferService.setUserId(userProfile?.uid || 'guest_user');
    return wearableBufferService.getBufferState();
  });

  useEffect(() => {
    wearableBufferService.setUserId(userProfile?.uid || 'guest_user');
    setWearableState(wearableBufferService.getBufferState());

    const handleWearablesUpdate = (e: any) => {
      if (e.detail?.state) {
        setWearableState(e.detail.state);
      }
    };

    window.addEventListener('prosana:wearables_updated', handleWearablesUpdate);

    // High-frequency 30-second poll for latest instantaneous heart rate scan
    const scanInterval = setInterval(() => {
      const state = wearableBufferService.getBufferState();
      if (state.activeConnection?.provider === 'google_fit' && state.activeConnection?.status === 'connected') {
        wearableBufferService.scanLatestHeartRate();
      }
    }, 30000);

    return () => {
      window.removeEventListener('prosana:wearables_updated', handleWearablesUpdate);
      clearInterval(scanInterval);
    };
  }, [userProfile?.uid]);

  const rawName =
    userProfile?.preferredName ||
    userProfile?.settings?.preferredName ||
    userProfile?.settings?.onboardingProfile?.preferredName ||
    userProfile?.displayName ||
    'Marcy';

  const userAgeGroup = userProfile?.settings?.onboardingProfile?.ageGroup || '';
  const userGender = userProfile?.gender || userProfile?.settings?.gender || userProfile?.settings?.onboardingProfile?.gender || '';

  const [currentTime, setCurrentTime] = useState(() => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  });

  const [greetingConfig, setGreetingConfig] = useState<GreetingConfig>(() =>
    pickHomeGreeting({
      name: rawName,
      ageGroup: userAgeGroup,
      gender: userGender,
      cycleOffset: 0
    })
  );

  useEffect(() => {
    setGreetingConfig(
      pickHomeGreeting({
        name: rawName,
        ageGroup: userAgeGroup,
        gender: userGender,
        cycleOffset: variantOffset
      })
    );

    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }));
      // Automatically refresh greeting when entering a new hour/window
      setGreetingConfig(prev => {
        const fresh = pickHomeGreeting({
          name: rawName,
          ageGroup: userAgeGroup,
          gender: userGender,
          cycleOffset: variantOffset
        });
        return fresh;
      });
    }, 60000); // 1-minute interval for time & hour checks

    return () => clearInterval(interval);
  }, [rawName, userAgeGroup, userGender, variantOffset]);

  const cycleGreeting = () => {
    setVariantOffset(prev => prev + 1);
  };

  // Helper to compute 4:00 AM diurnal cycle date (00:00 - 03:59 belongs to previous day's ongoing cycle)
  const getDiurnalCycleDate = (d: Date = new Date()) => {
    const cycleTime = new Date(d.getTime() - 4 * 60 * 60 * 1000);
    const y = cycleTime.getFullYear();
    const m = String(cycleTime.getMonth() + 1).padStart(2, '0');
    const day = String(cycleTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getDiurnalWindowKey = (localHour: number) => {
    const norm = ((localHour % 24) + 24) % 24;
    if (norm >= 4 && norm < 6) return 'window_04_06';
    if (norm >= 6 && norm < 11) return 'window_06_11';
    if (norm >= 11 && norm < 14) return 'window_11_14';
    if (norm >= 14 && norm < 17) return 'window_14_17';
    if (norm >= 17 && norm < 19) return 'window_17_19';
    if (norm >= 19 && norm < 22) return 'window_19_22';
    if (norm >= 22 && norm < 24) return 'window_22_24';
    return 'window_00_04';
  };

  // Dynamic browser geolocation state
  const [browserCoords, setBrowserCoords] = useState<{ lat?: number; lon?: number }>({});

  useEffect(() => {
    if (userProfile?.settings?.latitude == null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setBrowserCoords({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude
          });
        },
        () => {
          // Gracefully continue with profile location or neutral coordinates
        },
        { timeout: 6000, maximumAge: 300000 }
      );
    }
  }, [userProfile?.settings?.latitude]);

  // Companion Signals state with instant local storage restoration & silent diurnal auto-refresh
  const [companionSignal, setCompanionSignal] = useState<{
    lines: string[];
    windowId?: string;
    windowLabel?: string;
    timestamp?: string;
    enabled?: boolean;
    contextMeta?: any;
  } | null>(() => {
    try {
      const now = new Date();
      const cycleDate = getDiurnalCycleDate(now);
      const winKey = getDiurnalWindowKey(now.getHours());
      const uid = userProfile?.uid || 'guest_user';
      const cached = localStorage.getItem(`sana_companion_signal_${uid}_${cycleDate}_${winKey}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [isLoadingSignal, setIsLoadingSignal] = useState(false);

  const fetchCompanionSignal = async (forceRefresh = false) => {
    const uid = userProfile?.uid || 'guest_user';
    setIsLoadingSignal(true);
    try {
      const now = new Date();
      const clientHour = now.getHours();
      const clientDateStr = getDiurnalCycleDate(now);
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const windowKey = getDiurnalWindowKey(clientHour);

      const lat = userProfile?.settings?.latitude ?? browserCoords.lat;
      const lon = userProfile?.settings?.longitude ?? browserCoords.lon;
      const locationName = userProfile?.settings?.locationName;

      const res = await fetch('/api/companion-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          userProfile,
          forceRefresh,
          clientLocalTime: now.toISOString(),
          clientHour,
          clientDateStr,
          timezone,
          latitude: lat,
          longitude: lon,
          locationName
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCompanionSignal(data);
        try {
          localStorage.setItem(`sana_companion_signal_${uid}_${clientDateStr}_${windowKey}`, JSON.stringify(data));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      console.warn("Companion signals fetch warning:", err);
    } finally {
      setIsLoadingSignal(false);
    }
  };

  useEffect(() => {
    fetchCompanionSignal(false);

    // Automatic diurnal window change monitor & silent auto-refresh every 5 minutes
    const autoRefreshInterval = setInterval(() => {
      fetchCompanionSignal(false);
    }, 5 * 60 * 1000);

    return () => clearInterval(autoRefreshInterval);
  }, [userProfile?.uid, userProfile?.settings?.companionSignalsEnabled, userProfile?.settings?.locationName, browserCoords.lat, browserCoords.lon]);

  // Metric info definitions for popups
  const handleMetricClick = (e: React.MouseEvent, type: string) => {
    e.stopPropagation();

    const uvVal = dailyBrief.uvIndex !== undefined && dailyBrief.uvIndex !== null ? Number(dailyBrief.uvIndex) : 0;
    const aqiVal = dailyBrief.airQualityAqi ?? 0;
    const humVal = dailyBrief.humidity || '78%';
    const feelsLikeVal = dailyBrief.feelsLike || dailyBrief.temperature || '29°C';
    const windVal = `${dailyBrief.windSpeed ?? 13.9} km/h`;
    const cloudVal = `${dailyBrief.cloudCover ?? 87}%`;
    const dewVal = dailyBrief.dewPoint ?? '24.6°C';
    const pm25Val = `${dailyBrief.pm25 ?? 18.8} µg/m³`;
    const pm10Val = `${dailyBrief.pm10 ?? 32.0} µg/m³`;
    const ozoneVal = `${dailyBrief.ozone ?? 35.0} µg/m³`;
    const vpdVal = `${dailyBrief.vpdKpa ?? 0.85} kPa`;

    const metricMap: Record<string, MetricDetailPopup> = {
      weather: {
        label: "Atmospheric Temperature",
        value: dailyBrief.temperature || "29°C",
        category: dailyBrief.weatherCondition || "Overcast",
        skinImpact: "Ambient heat accelerates micro-circulation and cutaneous sebum liquefaction.",
        recommendation: "Keep skin balanced with a lightweight, non-comedogenic water gel or hydration mist.",
        icon: "solar:cloud-sun-2-bold-duotone",
        colorClass: "bg-amber-500/10 text-amber-600 border-amber-200/60"
      },
      feels_like: {
        label: "Apparent Thermal Load",
        value: feelsLikeVal,
        category: "Biometeorological Index",
        skinImpact: "Higher apparent temperature increases transpiration and pore dilatation.",
        recommendation: "Use oil-absorbing blotting sheets and refresh with electrolyte-infused mist.",
        icon: "solar:thermometer-bold-duotone",
        colorClass: "bg-orange-500/10 text-orange-600 border-orange-200/60"
      },
      uv: {
        label: "Ultraviolet Radiation Index",
        value: `UV ${uvVal.toFixed(1)}`,
        category: uvVal === 0 ? "Night / Zero UV" : uvVal < 3 ? "Low Risk" : uvVal < 6 ? "Moderate Risk" : uvVal < 8 ? "High Risk" : "Extreme Risk",
        skinImpact: uvVal === 0
          ? "Zero solar radiation. Ideal recovery window for circadian alignment and restful sleep."
          : "Elevated UV increases ocular strain and thermal load during prolonged outdoor exertion.",
        recommendation: uvVal === 0
          ? "Maintain dark, cool indoor sleep conditions to maximize heart rate recovery."
          : "Stay well hydrated, seek periodic shade, and avoid peak sun hours during heavy cardio.",
        icon: uvVal === 0 ? "solar:moon-stars-bold-duotone" : "solar:sun-bold-duotone",
        colorClass: uvVal === 0 ? "bg-indigo-500/10 text-indigo-600 border-indigo-200/60" : "bg-amber-500/10 text-amber-600 border-amber-200/60"
      },
      aqi: {
        label: "Air Quality Index (AQI)",
        value: `AQI ${aqiVal}`,
        category: aqiVal <= 50 ? "Good" : aqiVal <= 100 ? "Moderate" : "Sensitive Alert",
        skinImpact: "Airborne particulates increase bronchial inflammation and elevate resting heart rate during exercise.",
        recommendation: "Pace outdoor cardio or move high-intensity workouts indoors to minimize respiratory stress.",
        icon: "solar:leaf-bold-duotone",
        colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200/60"
      },
      humidity: {
        label: "Relative Humidity",
        value: humVal.includes('%') ? humVal : `${humVal}%`,
        category: "Atmospheric Moisture",
        skinImpact: "High humidity impairs sweat evaporation, placing extra demand on your cardiovascular cooling mechanism.",
        recommendation: "Increase fluid intake and replenish electrolytes during extended outdoor movement.",
        icon: "solar:droplet-bold-duotone",
        colorClass: "bg-sky-500/10 text-sky-600 border-sky-200/60"
      },
      wind: {
        label: "Wind Velocity & Gusts",
        value: windVal,
        category: "Atmospheric Flow",
        skinImpact: "Strong wind currents accelerate evaporative fluid loss and lower perceived thermal comfort.",
        recommendation: "Hydrate proactively before outdoor runs and wear wind-resistant layers.",
        icon: "solar:wind-bold-duotone",
        colorClass: "bg-cyan-500/10 text-cyan-600 border-cyan-200/60"
      },
      clouds: {
        label: "Cloud Cover & Solar Filtration",
        value: cloudVal,
        category: "Solar Filtration",
        skinImpact: "Overcast skies reduce direct heat glare but ambient light and diffuse radiation remain present.",
        recommendation: "Ideal condition for steady outdoor walking and moderate pace training.",
        icon: "solar:clouds-bold-duotone",
        colorClass: "bg-slate-500/10 text-slate-600 border-slate-200/60"
      },
      dew_point: {
        label: "Dew Point Saturation",
        value: dewVal,
        category: "Comfort Index",
        skinImpact: "High dew point levels make air feel muggy, increasing heart rate response at lower exercise intensity.",
        recommendation: "Pace exertion carefully and monitor heart rate zones when training outdoors.",
        icon: "solar:water-drop-bold-duotone",
        colorClass: "bg-blue-500/10 text-blue-600 border-blue-200/60"
      },
      pm25: {
        label: "PM2.5 Microparticulates",
        value: pm25Val,
        category: "Fine Particulate Matter",
        skinImpact: "Fine microparticulates enter deep airway tissue, subtly straining respiratory efficiency.",
        recommendation: "Keep outdoor walks light and consider HEPA indoor air filtration.",
        icon: "solar:shield-warning-bold-duotone",
        colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200/60"
      },
      pm10: {
        label: "PM10 Coarse Particulates",
        value: pm10Val,
        category: "Coarse Airborne Dust",
        skinImpact: "Coarse dust particles can cause upper airway and eye irritation in windy environments.",
        recommendation: "Wear protective sunglasses and rinse eyes with saline solution post-walk if irritated.",
        icon: "solar:atom-bold-duotone",
        colorClass: "bg-teal-500/10 text-teal-600 border-teal-200/60"
      },
      vpd: {
        label: "Vapour Pressure Deficit (VPD)",
        value: vpdVal,
        category: "Atmospheric Evaporative Pressure",
        skinImpact: "VPD reflects atmospheric drying potential, affecting respiratory tract moisture and systemic fluid balance.",
        recommendation: "Sip water regularly to keep respiratory membranes hydrated and comfortable.",
        icon: "solar:soundwave-bold-duotone",
        colorClass: "bg-indigo-500/10 text-indigo-600 border-indigo-200/60"
      }
    };

    setActiveMetricDetail(metricMap[type] || metricMap.weather);
  };

  const uvVal = dailyBrief.uvIndex !== undefined && dailyBrief.uvIndex !== null ? Number(dailyBrief.uvIndex) : 0;
  const aqiVal = dailyBrief.airQualityAqi ?? 0;
  const locationText = userProfile?.settings?.locationName || dailyBrief.locationName || 'Location Access Required';

  return (
    <div className="w-full flex-1 px-5 pt-2 pb-28 space-y-4 overflow-y-auto no-scrollbar">
      {/* 1. Dynamic Warm Greeting with Live Time */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="pt-2 pb-0.5"
      >
        <div
          onClick={cycleGreeting}
          className="group cursor-pointer select-none inline-block"
          title="Tap to cycle greeting"
        >
          <div className="flex items-center space-x-1.5 text-[11.5px] font-medium text-[#737a87] mb-1.5">
            <Icon icon={greetingConfig.iconName} className={`w-3.5 h-3.5 ${greetingConfig.iconColor} shrink-0`} />
            <span className="font-semibold text-[#1e293b]">{currentTime}</span>
            <span className="text-[#cbd5e1]">•</span>
            <span className="text-[#64748b]">{greetingConfig.subtext}</span>
          </div>
          <h1 className="text-[26px] font-bold leading-tight text-[#121316] tracking-tight group-hover:text-black transition-colors">
            {greetingConfig.greeting}
          </h1>
        </div>
      </motion.div>

      {/* 3. Open Wearables Telemetry & Live 20-Min Stream Buffer Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="w-full pt-1 px-0.5"
      >
        <div className="rounded-[24px] bg-white border border-[#eaedf1] p-4 shadow-2xs hover:border-[#dbe0e8] transition-all duration-300">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[#f1f4f8]">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-xl bg-slate-900 text-white">
                <Icon icon="solar:smart-watch-bold-duotone" className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <span className="text-[11.5px] font-bold text-[#121316] uppercase tracking-wider block leading-tight">
                  Wearables & Biometrics
                </span>
                <span className="text-[10px] text-slate-500 font-medium">
                  {wearableState.activeConnection
                    ? `${wearableState.activeConnection.deviceName} • 20-Min Buffer`
                    : 'Google Fit • Apple Watch • Oura • Garmin'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsWearablesOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-[#121316] hover:bg-black text-white text-[11px] font-semibold flex items-center space-x-1 transition-all shadow-2xs cursor-pointer"
            >
              <span>{wearableState.activeConnection ? 'Open Graphs' : 'Connect Device'}</span>
              <Icon icon="solar:arrow-right-linear" className="w-3.5 h-3.5 text-slate-300" />
            </button>
          </div>

          {wearableState.activeConnection ? (
            <div className="space-y-3">
              {/* Metric Highlights */}
              <div className="grid grid-cols-4 gap-2 text-left">
                {/* Heart Rate */}
                <div 
                  onClick={() => setIsWearablesOpen(true)}
                  className="p-2.5 rounded-2xl bg-rose-50/60 border border-rose-100/80 cursor-pointer hover:bg-rose-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9.5px] font-bold text-rose-700 uppercase">Heart Rate</span>
                    {wearableState.activeConnection?.latestInstantaneousHeartRate ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="Latest Scan" />
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-baseline space-x-0.5">
                    <span className="text-base font-bold text-rose-950">
                      {(() => {
                        if (wearableState.activeConnection?.latestInstantaneousHeartRate) {
                          return wearableState.activeConnection.latestInstantaneousHeartRate;
                        }
                        const hrSample = [...wearableState.pendingSamples].reverse().find(s => typeof s.heartRateBpm === 'number' && s.heartRateBpm > 0);
                        if (hrSample?.heartRateBpm) return hrSample.heartRateBpm;
                        const batchAvg = calculateBatchSummary(wearableState.pendingSamples).avgHeartRate;
                        return batchAvg > 0 ? batchAvg : '—';
                      })()}
                    </span>
                    <span className="text-[9px] font-semibold text-rose-600 ml-0.5">BPM</span>
                  </div>
                  <div className="text-[8.5px] text-rose-700/80 font-medium truncate mt-0.5">
                    {wearableState.activeConnection?.latestInstantaneousHeartRate && wearableState.activeConnection?.latestHeartRateTimeLabel
                      ? `Scan ${wearableState.activeConnection.latestHeartRateTimeLabel}`
                      : wearableState.pendingSamples.some(s => (s.heartRateBpm || 0) > 0) ? '20-min avg' : 'No HR data'}
                  </div>
                </div>

                {/* Steps */}
                <div 
                  onClick={() => setIsWearablesOpen(true)}
                  className="p-2.5 rounded-2xl bg-sky-50/60 border border-sky-100/80 cursor-pointer hover:bg-sky-50 transition-colors"
                >
                  <span className="text-[9.5px] font-bold text-sky-700 uppercase block">Steps</span>
                  <div className="mt-1 flex items-baseline space-x-0.5">
                    <span className="text-base font-bold text-sky-950">
                      {wearableState.pendingSamples.reduce((acc, s) => acc + (s.stepsDelta || 0), 0).toLocaleString()}
                    </span>
                    <span className="text-[9px] font-semibold text-sky-600">steps</span>
                  </div>
                </div>

                {/* Calories */}
                {(() => {
                  const totalBurn = wearableState.pendingSamples.reduce((acc, s) => acc + (s.activeCaloriesDelta || 0), 0);
                  const calObj = formatCalorieUnit(totalBurn);
                  return (
                    <div 
                      onClick={() => setIsWearablesOpen(true)}
                      className="p-2.5 rounded-2xl bg-amber-50/60 border border-amber-100/80 cursor-pointer hover:bg-amber-50 transition-colors"
                    >
                      <span className="text-[9.5px] font-bold text-amber-700 uppercase block">Burn</span>
                      <div className="mt-1 flex items-baseline space-x-0.5">
                        <span className="text-base font-bold text-amber-950">
                          {calObj.displayValue}
                        </span>
                        <span className="text-[9px] font-semibold text-amber-600 ml-0.5">{calObj.unit}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Intervals Synced */}
                <div 
                  onClick={() => setIsWearablesOpen(true)}
                  className="p-2.5 rounded-2xl bg-emerald-50/60 border border-emerald-100/80 cursor-pointer hover:bg-emerald-50 transition-colors"
                >
                  <span className="text-[9.5px] font-bold text-emerald-700 uppercase block">Intervals</span>
                  <div className="mt-1 flex items-baseline space-x-0.5">
                    <span className="text-base font-bold text-emerald-950">
                      {wearableState.pendingSamples.length}
                    </span>
                    <span className="text-[9px] font-semibold text-emerald-600">buckets</span>
                  </div>
                </div>
              </div>

              {/* Google Fit Live status banner */}
              <div 
                onClick={() => setIsWearablesOpen(true)}
                className="p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between cursor-pointer hover:bg-black transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Google Fit Connected • <strong>{wearableState.pendingSamples.length} intervals recorded</strong>
                  </span>
                </div>
                <div className="flex items-center space-x-1.5 text-[11px] text-emerald-300 font-bold">
                  <span>Open Biometrics & Graphs</span>
                  <Icon icon="solar:arrow-right-linear" className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => setIsWearablesOpen(true)}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-50 to-sky-50/50 border border-slate-200/80 flex items-center justify-between cursor-pointer group hover:border-sky-300 transition-all"
            >
              <div className="flex items-center space-x-3">
                <div className="flex -space-x-2">
                  <div className="w-7 h-7 rounded-full bg-white shadow-2xs border border-slate-200 flex items-center justify-center text-xs">
                    <Icon icon="logos:google-fit" className="w-4 h-4" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-slate-900 text-white shadow-2xs border border-slate-700 flex items-center justify-center text-xs">
                    <Icon icon="logos:apple" className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 group-hover:text-sky-900 transition-colors">
                    Link Apple Watch or Google Fit
                  </p>
                  <p className="text-[10.5px] text-slate-500">
                    Stream continuous heart rate, HRV recovery, and 20-minute batch sync
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 shadow-2xs group-hover:bg-sky-600 group-hover:text-white group-hover:border-sky-600 transition-all">
                Connect
              </span>
            </div>
          )}
        </div>
      </motion.div>

      {/* 4. Daily Focus / Atmospheric Insights (Apple-inspired minimalist design) */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="w-full pt-1 px-0.5"
      >
        {userProfile?.settings?.companionSignalsEnabled === false ? (
          <div className="p-4 text-center text-xs text-[#94a3b8] rounded-[22px] bg-white border border-[#eaedf1]">
            <span>Daily focus paused. </span>
            <button
              onClick={onOpenSettings}
              className="text-[#0284c7] font-medium hover:underline cursor-pointer"
            >
              Enable in Settings
            </button>
          </div>
        ) : isLoadingSignal && (!companionSignal?.lines || companionSignal.lines.length === 0) ? (
          <div className="rounded-[22px] bg-white border border-[#eaedf1] p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#f1f5f9]">
              <div className="h-3 bg-[#f1f5f9] rounded-md animate-pulse w-20" />
              <div className="h-3 bg-[#f1f5f9] rounded-md animate-pulse w-14" />
            </div>
            <div className="space-y-2 py-1">
              <div className="h-3.5 bg-[#f8fafc] rounded-md animate-pulse w-full" />
              <div className="h-3.5 bg-[#f8fafc] rounded-md animate-pulse w-4/5" />
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] bg-white border border-[#eaedf1] p-4 shadow-2xs hover:border-[#dbe0e8] transition-all duration-300">
            {/* Minimalist Apple-style Header */}
            <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[#f1f4f8]">
              <div className="flex items-center space-x-1.5">
                <Icon icon="solar:sparkles-bold-duotone" className="w-3.5 h-3.5 text-[#0284c7]" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]">
                  Daily Focus
                </span>
              </div>
              {companionSignal?.windowLabel && (
                <span className="text-[10.5px] font-medium text-[#94a3b8]">
                  {companionSignal.windowLabel.replace(/window_\d+_\d+/, '').trim()}
                </span>
              )}
            </div>

            {/* Insight Lines with Minimalist Micro-Accents */}
            <div className="space-y-2.5">
              {(companionSignal?.lines && companionSignal.lines.length > 0
                ? companionSignal.lines
                : [
                    "Hydrate adequately to support cardiac output and thermoregulation today.",
                    "Maintain balanced exertion and track your heart rate recovery."
                  ]
              ).map((sentence, idx) => (
                <div key={idx} className="flex items-start space-x-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284c7]/40 mt-1.5 shrink-0" />
                  <p className="text-[13.5px] text-[#1e293b] leading-[1.55] font-normal tracking-tight">
                    {sentence}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* 4. Interactive Metric Pop-up Dialog */}
      <AnimatePresence>
        {activeMetricDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/25 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs bg-white rounded-[28px] p-5 shadow-2xl border border-[#eaedf1] space-y-3.5 relative overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-2 rounded-2xl border ${activeMetricDetail.colorClass}`}>
                    <Icon icon={activeMetricDetail.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-[14px] font-bold text-[#121316] leading-tight">
                      {activeMetricDetail.label}
                    </h4>
                    <span className="text-[11px] font-semibold text-[#64748b]">
                      {activeMetricDetail.value} • {activeMetricDetail.category}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setActiveMetricDetail(null)}
                  className="p-1 rounded-full text-[#94a3b8] hover:text-[#121316] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                >
                  <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
                </button>
              </div>

              {/* Health Impact Card */}
              <div className="p-3 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1.5">
                <span className="text-[10.5px] font-bold text-[#475569] uppercase tracking-wider block">
                  Physiological Impact
                </span>
                <p className="text-[12px] font-medium text-[#1e293b] leading-relaxed">
                  {activeMetricDetail.skinImpact}
                </p>
              </div>

              {/* Recommendation */}
              <div className="p-3 rounded-2xl bg-[#f0f9ff] border border-[#e0f2fe] space-y-1.5">
                <span className="text-[10.5px] font-bold text-[#0369a1] uppercase tracking-wider block">
                  Health Guidance
                </span>
                <p className="text-[12px] font-medium text-[#0c4a6e] leading-relaxed">
                  {activeMetricDetail.recommendation}
                </p>
              </div>

              {/* Dismiss Button */}
              <button
                onClick={() => setActiveMetricDetail(null)}
                className="w-full py-2.5 rounded-2xl bg-[#121316] text-white text-[12.5px] font-semibold hover:bg-black transition-colors cursor-pointer text-center"
              >
                Understood
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Open Wearables Hub Modal */}
      <WearablesHub
        userId={userProfile?.uid || 'guest_user'}
        isOpen={isWearablesOpen}
        onClose={() => setIsWearablesOpen(false)}
      />
    </div>
  );
};
