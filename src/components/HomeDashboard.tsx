import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, FacialScanResult, DailyBriefing, WearableBufferState } from '../types';
import { pickHomeGreeting, GreetingConfig } from '../lib/homeGreetings';
import { wearableBufferService } from '../lib/wearableBufferService';
import { WearablesHub } from './WearablesHub';

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
    return () => window.removeEventListener('prosana:wearables_updated', handleWearablesUpdate);
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
          ? "No solar UV radiation detected. Ideal window for nocturnal skin regeneration and lipid barrier lock."
          : "Solar UV triggers reactive oxygen species (ROS), breaking down collagen fibrils and stimulating melanocytes.",
        recommendation: uvVal === 0
          ? "Focus on PM hydration, ceramide balms, and night treatments."
          : "Apply 2 finger-lengths of broad-spectrum SPF 50+. Reapply every 2 hours if outdoors.",
        icon: uvVal === 0 ? "solar:moon-stars-bold-duotone" : "solar:sun-bold-duotone",
        colorClass: uvVal === 0 ? "bg-indigo-500/10 text-indigo-600 border-indigo-200/60" : "bg-amber-500/10 text-amber-600 border-amber-200/60"
      },
      aqi: {
        label: "Air Quality Index (AQI)",
        value: `AQI ${aqiVal}`,
        category: aqiVal <= 50 ? "Good" : aqiVal <= 100 ? "Moderate" : "Sensitive Alert",
        skinImpact: "Microscopic airborne particles trigger AhR receptor pathways, weakening the stratum corneum lipid matrix.",
        recommendation: "Layer an antioxidant serum (Niacinamide / Vitamin C) under moisturizer to neutralize free radicals.",
        icon: "solar:leaf-bold-duotone",
        colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200/60"
      },
      humidity: {
        label: "Relative Humidity",
        value: humVal.includes('%') ? humVal : `${humVal}%`,
        category: "Atmospheric Moisture",
        skinImpact: "Higher relative humidity preserves epidermal hydration but can trap excess sebum and micro-debris.",
        recommendation: "A gentle gel cleanser prevents follicular congestion without stripping your acid mantle.",
        icon: "solar:droplet-bold-duotone",
        colorClass: "bg-sky-500/10 text-sky-600 border-sky-200/60"
      },
      wind: {
        label: "Wind Velocity & Gusts",
        value: windVal,
        category: "Atmospheric Flow",
        skinImpact: "Surface airflow strips the moisture film, accelerating transepidermal water loss (TEWL).",
        recommendation: "Reinforce with a ceramide-rich barrier cream and apply a protective lip occlusive.",
        icon: "solar:wind-bold-duotone",
        colorClass: "bg-cyan-500/10 text-cyan-600 border-cyan-200/60"
      },
      clouds: {
        label: "Cloud Cover & UV Penetration",
        value: cloudVal,
        category: "Solar Filtration",
        skinImpact: "Overcast skies absorb infra-red heat, but up to 85% of damaging UVA radiation still penetrates through clouds.",
        recommendation: "Do not skip daily SPF sunscreen on overcast or cloudy days.",
        icon: "solar:clouds-bold-duotone",
        colorClass: "bg-slate-500/10 text-slate-600 border-slate-200/60"
      },
      dew_point: {
        label: "Dew Point Saturation",
        value: dewVal,
        category: "Comfort Index",
        skinImpact: "Dew point indicates absolute air moisture. Higher levels increase sweat evaporation resistance.",
        recommendation: "Switch to featherweight humectants like Hyaluronic Acid and Panthenol.",
        icon: "solar:water-drop-bold-duotone",
        colorClass: "bg-blue-500/10 text-blue-600 border-blue-200/60"
      },
      pm25: {
        label: "PM2.5 Microparticulates",
        value: pm25Val,
        category: "Fine Particulate Matter",
        skinImpact: "Combustion particulates under 2.5 micrometers penetrate follicular openings, inducing lipid peroxidation.",
        recommendation: "Double cleanse in the evening (oil/balm followed by gentle pH-balanced foaming cleanser).",
        icon: "solar:shield-warning-bold-duotone",
        colorClass: "bg-emerald-500/10 text-emerald-600 border-emerald-200/60"
      },
      pm10: {
        label: "PM10 Coarse Particulates",
        value: pm10Val,
        category: "Coarse Airborne Dust",
        skinImpact: "Coarse dust and environmental soil rest on the surface, causing friction and superficial irritation.",
        recommendation: "Rinse face with thermal spring water or micellar cleanser after prolonged outdoor exposure.",
        icon: "solar:atom-bold-duotone",
        colorClass: "bg-teal-500/10 text-teal-600 border-teal-200/60"
      },
      vpd: {
        label: "Vapour Pressure Deficit (VPD)",
        value: vpdVal,
        category: "Epidermal Evaporative Pressure",
        skinImpact: "VPD measures the drying force exerted by ambient air on your skin barrier.",
        recommendation: "At optimal VPD, skin transpires naturally without excessive dehydration.",
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

      {/* 2. Interactive Expandable Weather & Advanced Telemetry Card */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          layout: { type: "spring", stiffness: 350, damping: 28 },
          duration: 0.4
        }}
        onClick={() => setIsWeatherExpanded(prev => !prev)}
        className="w-full rounded-[26px] bg-white border border-[#eaedf1] shadow-2xs hover:border-[#d9dfeb] hover:shadow-xs transition-all duration-300 cursor-pointer overflow-hidden p-4.5 relative select-none"
      >
        {/* Card Header: Weather Label & Location */}
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center space-x-1.5">
            <span className="text-[12px] font-semibold text-[#737a87]">Weather</span>
            <span className="text-[10px] text-[#cbd5e1]">•</span>
            <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] text-[11px] font-medium">
              <Icon icon="solar:map-point-bold-duotone" className="w-3 h-3 text-[#0284c7]" />
              <span className="truncate max-w-[140px]">{locationText}</span>
            </div>
          </div>
        </div>

        {/* 4-Block Visual Metric Grid (Light ethereal palette with creative micro-accents) */}
        <div className="grid grid-cols-4 gap-2 items-stretch">
          {/* Block 1: Temperature & Condition */}
          <div
            onClick={(e) => handleMetricClick(e, 'weather')}
            className="flex flex-col justify-between p-2.5 rounded-2xl bg-[#fafbfe] border border-[#eff1f6] hover:bg-[#f1f4f9] transition-all duration-200 cursor-pointer group"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[21px] font-bold text-[#1a1c20] tracking-tight leading-none">
                {dailyBrief.temperature || "--"}
              </span>
            </div>
            <p className="text-[10px] font-medium text-[#64748b] truncate mt-1.5 flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8]" />
              <span className="truncate">{dailyBrief.weatherCondition || "--"}</span>
            </p>
          </div>

          {/* Block 2: UV Metric (Ultra-light sunbeam wash) */}
          <div
            onClick={(e) => handleMetricClick(e, 'uv')}
            className="flex flex-col justify-between p-2.5 rounded-2xl bg-[#fffcf7] border border-[#fde8d0]/60 hover:bg-[#fff7ed] transition-all duration-200 cursor-pointer group"
          >
            <span className="text-[18px] font-bold leading-none text-[#c2410c] tracking-tight flex items-baseline">
              <span className="text-[10px] font-extrabold uppercase tracking-wider mr-1 text-[#ea580c]/80">UV</span>
              <span>{uvVal.toFixed(1)}</span>
            </span>
            <span className="text-[10px] font-semibold text-[#9a3412]/80 mt-1.5 truncate">
              {dailyBrief.uvLevel || (uvVal < 3 ? "Low" : uvVal < 6 ? "Moderate" : "High")}
            </span>
          </div>

          {/* Block 3: Air Quality / AQI (Ultra-light botanical wash) */}
          <div
            onClick={(e) => handleMetricClick(e, 'aqi')}
            className="flex flex-col justify-between p-2.5 rounded-2xl bg-[#f8fdf9] border border-[#d1fae5]/60 hover:bg-[#f0fdf4] transition-all duration-200 cursor-pointer group"
          >
            <span className="text-[18px] font-bold leading-none text-[#15803d] tracking-tight flex items-baseline">
              <span className="text-[10px] font-extrabold uppercase tracking-wider mr-1 text-[#16a34a]/80">AQI</span>
              <span>{aqiVal}</span>
            </span>
            <span className="text-[10px] font-semibold text-[#166534]/80 mt-1.5 truncate">
              {aqiVal <= 0 ? "Pending" : aqiVal <= 50 ? "Clean" : aqiVal <= 100 ? "Moderate" : aqiVal <= 150 ? "Sensitive" : "Unhealthy"}
            </span>
          </div>

          {/* Block 4: Humidity & Rain (Ultra-light sky wash, formatted cleanly) */}
          <div
            onClick={(e) => handleMetricClick(e, 'humidity')}
            className="flex flex-col justify-between p-2.5 rounded-2xl bg-[#f7fbfe] border border-[#dbeafe]/60 hover:bg-[#eff6ff] transition-all duration-200 cursor-pointer group"
          >
            <span className="text-[21px] font-bold leading-none text-[#0284c7] tracking-tight">
              {dailyBrief.humidity ? dailyBrief.humidity.replace(' Humidity', '').trim() : '--'}
            </span>
            <span className="text-[10px] font-semibold text-[#0369a1]/80 mt-1.5 truncate">
              {dailyBrief.precipProb !== undefined ? `${dailyBrief.precipProb}% rain` : '0% rain'}
            </span>
          </div>
        </div>

        {/* 3. Advanced Telemetry Section (Smooth Downward Expansion ~35-40%) */}
        <AnimatePresence>
          {isWeatherExpanded && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.16, 1, 0.3, 1]
              }}
              className="overflow-hidden pt-3 border-t border-[#f1f5f9] space-y-2.5"
            >
              {/* Telemetry Micro Grid */}
              <div className="grid grid-cols-4 gap-1.5 text-left">
                {/* Feels Like */}
                <div
                  onClick={(e) => handleMetricClick(e, 'feels_like')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:thermometer-bold-duotone" className="w-3 h-3 text-[#f97316]" />
                    <span className="truncate">Feels Like</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.feelsLike || dailyBrief.temperature || "--"}
                  </span>
                </div>

                {/* Wind Speed */}
                <div
                  onClick={(e) => handleMetricClick(e, 'wind')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:wind-bold-duotone" className="w-3 h-3 text-[#0284c7]" />
                    <span className="truncate">Wind</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.windSpeed ?? 0} <span className="text-[9.5px] font-normal text-[#64748b]">km/h</span>
                  </span>
                </div>

                {/* Cloud Cover */}
                <div
                  onClick={(e) => handleMetricClick(e, 'clouds')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:clouds-bold-duotone" className="w-3 h-3 text-[#64748b]" />
                    <span className="truncate">Clouds</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.cloudCover ?? 0}%
                  </span>
                </div>

                {/* Dew Point */}
                <div
                  onClick={(e) => handleMetricClick(e, 'dew_point')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:water-drop-bold-duotone" className="w-3 h-3 text-[#0ea5e9]" />
                    <span className="truncate">Dew Pt</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.dewPoint ?? "--"}
                  </span>
                </div>

                {/* PM2.5 */}
                <div
                  onClick={(e) => handleMetricClick(e, 'pm25')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:shield-warning-bold-duotone" className="w-3 h-3 text-[#16a34a]" />
                    <span className="truncate">PM2.5</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.pm25 ?? 18.8} <span className="text-[9.5px] font-normal text-[#64748b]">µg</span>
                  </span>
                </div>

                {/* PM10 */}
                <div
                  onClick={(e) => handleMetricClick(e, 'pm10')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:atom-bold-duotone" className="w-3 h-3 text-[#0d9488]" />
                    <span className="truncate">PM10</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.pm10 ?? 32.0} <span className="text-[9.5px] font-normal text-[#64748b]">µg</span>
                  </span>
                </div>

                {/* Solar Peak UV */}
                <div
                  onClick={(e) => handleMetricClick(e, 'uv')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:sun-2-bold-duotone" className="w-3 h-3 text-[#ea580c]" />
                    <span className="truncate">Peak UV</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.peakUvIndex ?? dailyBrief.uvIndexClearSky ?? (uvVal + 1.2).toFixed(1)}
                  </span>
                </div>

                {/* VPD (Vapour Pressure Deficit) */}
                <div
                  onClick={(e) => handleMetricClick(e, 'vpd')}
                  className="p-2 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] hover:border-[#cbd5e1] hover:bg-white transition-all cursor-pointer group"
                >
                  <span className="text-[9.5px] font-medium text-[#787f8d] flex items-center space-x-1">
                    <Icon icon="solar:soundwave-bold-duotone" className="w-3 h-3 text-[#6366f1]" />
                    <span className="truncate">VPD</span>
                  </span>
                  <span className="text-[12px] font-bold text-[#1e293b] block mt-0.5">
                    {dailyBrief.vpdKpa ?? 0.85} <span className="text-[9.5px] font-normal text-[#64748b]">kPa</span>
                  </span>
                </div>
              </div>

              {/* Minimalist Hint Bar */}
              <div className="pt-1 text-left text-[10px] text-[#94a3b8]">
                <span>Tap any metric to inspect skin barrier impact</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
                    {wearableState.pendingSamples[wearableState.pendingSamples.length - 1]?.heartRateBpm ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-baseline space-x-0.5">
                    <span className="text-base font-bold text-rose-950">
                      {wearableState.pendingSamples[wearableState.pendingSamples.length - 1]?.heartRateBpm ?? '—'}
                    </span>
                    <span className="text-[9px] font-semibold text-rose-600">BPM</span>
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
                <div 
                  onClick={() => setIsWearablesOpen(true)}
                  className="p-2.5 rounded-2xl bg-amber-50/60 border border-amber-100/80 cursor-pointer hover:bg-amber-50 transition-colors"
                >
                  <span className="text-[9.5px] font-bold text-amber-700 uppercase block">Burn</span>
                  <div className="mt-1 flex items-baseline space-x-0.5">
                    <span className="text-base font-bold text-amber-950">
                      {Math.round(wearableState.pendingSamples.reduce((acc, s) => acc + (s.activeCaloriesDelta || 0), 0))}
                    </span>
                    <span className="text-[9px] font-semibold text-amber-600">kcal</span>
                  </div>
                </div>

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
                    "Keep morning hydration lightweight and breathable today.",
                    "Let active serums rest if your barrier feels reactive."
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

              {/* Skin Impact Card */}
              <div className="p-3 rounded-2xl bg-[#f8fafc] border border-[#e2e8f0] space-y-1.5">
                <span className="text-[10.5px] font-bold text-[#475569] uppercase tracking-wider block">
                  Cutaneous Impact
                </span>
                <p className="text-[12px] font-medium text-[#1e293b] leading-relaxed">
                  {activeMetricDetail.skinImpact}
                </p>
              </div>

              {/* Recommendation */}
              <div className="p-3 rounded-2xl bg-[#f0f9ff] border border-[#e0f2fe] space-y-1.5">
                <span className="text-[10.5px] font-bold text-[#0369a1] uppercase tracking-wider block">
                  Regimen Adjustment
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
