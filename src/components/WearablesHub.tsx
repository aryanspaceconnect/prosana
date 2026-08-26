import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { 
  WearableProviderId, 
  WearableProviderMeta, 
  WearableConnectionState, 
  WearableSample, 
  WearableBufferState,
  WearableBatchSummary 
} from '../types';
import { 
  WEARABLE_PROVIDERS, 
  wearableBufferService, 
  generateSyntheticWearableSample,
  calculateBatchSummary 
} from '../lib/wearableBufferService';

interface WearablesHubProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

type GraphTab = 'hr_hrv' | 'activity' | 'stress_recovery' | 'respiratory';

export const WearablesHub: React.FC<WearablesHubProps> = ({ userId, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<GraphTab>('hr_hrv');
  const [bufferState, setBufferState] = useState<WearableBufferState>(() => wearableBufferService.getBufferState());
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);
  const [flushSuccessNotice, setFlushSuccessNotice] = useState<string | null>(null);
  const [selectedProviderMeta, setSelectedProviderMeta] = useState<WearableProviderMeta | null>(null);

  // Initialize service with current userId
  useEffect(() => {
    wearableBufferService.setUserId(userId);
    setBufferState(wearableBufferService.getBufferState());

    const handleUpdate = (e: any) => {
      if (e.detail?.state) {
        setBufferState(e.detail.state);
      }
    };

    window.addEventListener('prosana:wearables_updated', handleUpdate);
    return () => window.removeEventListener('prosana:wearables_updated', handleUpdate);
  }, [userId]);

  const connection = bufferState.activeConnection;
  const samples = bufferState.pendingSamples;

  // Compute live summary from samples
  const summary: WearableBatchSummary = useMemo(() => {
    return calculateBatchSummary(samples);
  }, [samples]);

  // Format samples for Recharts
  const chartData = useMemo(() => {
    return samples.map((s, index) => {
      const d = new Date(s.timestamp);
      const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return {
        time: timeStr,
        minute: index + 1,
        hr: s.heartRateBpm ?? 70,
        hrv: s.hrvMs ?? 55,
        steps: s.stepsDelta ?? 0,
        calories: s.activeCaloriesDelta ?? 0,
        spo2: s.spo2Percent ?? 98,
        respiratory: s.respiratoryRate ?? 15,
        stress: s.stressLevel ?? 25,
        readiness: Math.min(99, Math.max(50, Math.round(((s.hrvMs ?? 55) * 0.7) + (100 - (s.heartRateBpm ?? 70)) * 0.5)))
      };
    });
  }, [samples]);

  const handleConnect = async (providerId: WearableProviderId) => {
    setIsConnecting(providerId);
    try {
      await wearableBufferService.connectDevice(providerId);
      setBufferState(wearableBufferService.getBufferState());
      setFlushSuccessNotice(`Connected to ${WEARABLE_PROVIDERS.find(p => p.id === providerId)?.name}`);
      setTimeout(() => setFlushSuccessNotice(null), 3500);
    } catch (err) {
      console.error('Connection error:', err);
    } finally {
      setIsConnecting(null);
    }
  };

  const handleDisconnect = async () => {
    await wearableBufferService.disconnectDevice();
    setBufferState(wearableBufferService.getBufferState());
  };

  const handleSimulatePulse = () => {
    const sample = generateSyntheticWearableSample(connection?.provider || 'apple_health');
    wearableBufferService.addSample(sample);
  };

  const handleManualFlush = async () => {
    setIsFlushing(true);
    try {
      const batch = await wearableBufferService.flushBufferToFirestore();
      if (batch) {
        setFlushSuccessNotice(`Successfully persisted 20-min bulk batch (${batch.sampleCount} samples) to Firestore!`);
        setTimeout(() => setFlushSuccessNotice(null), 4000);
      }
    } catch (err) {
      console.error('Flush error:', err);
    } finally {
      setIsFlushing(false);
    }
  };

  if (!isOpen) return null;

  const primaryProviders = WEARABLE_PROVIDERS.filter(p => p.category === 'primary');
  const secondaryProviders = WEARABLE_PROVIDERS.filter(p => p.category === 'secondary');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/40 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="w-full max-w-3xl bg-white rounded-[32px] shadow-2xl border border-slate-200/80 overflow-hidden my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header Bar */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-b from-slate-50/80 to-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-[#121316] text-white shadow-md shadow-slate-900/10">
              <Icon icon="solar:smart-watch-bold-duotone" className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-bold text-[#121316] tracking-tight">
                  Open Wearables Telemetry
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                  Live Buffer
                </span>
              </div>
              <p className="text-xs text-slate-500 font-normal">
                Continuous physiological biometrics • 20-Minute Micro-Batch Persistence
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
          </button>
        </div>

        {/* Success Alert Banner */}
        <AnimatePresence>
          {flushSuccessNotice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-emerald-500 text-white px-5 py-2.5 text-xs font-semibold flex items-center justify-between shrink-0"
            >
              <div className="flex items-center space-x-2">
                <Icon icon="solar:check-circle-bold" className="w-4 h-4" />
                <span>{flushSuccessNotice}</span>
              </div>
              <button onClick={() => setFlushSuccessNotice(null)} className="cursor-pointer opacity-80 hover:opacity-100">
                <Icon icon="solar:close-circle-bold" className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Scrollable Content Area */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Section 1: Device Connection Cards (Pinned Google Fit & Apple Health at Top) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                <Icon icon="solar:link-circle-bold-duotone" className="w-4 h-4 text-sky-600" />
                <span>Primary Ecosystems (Pinned)</span>
              </span>
              {connection && (
                <span className="text-[11px] font-medium text-slate-500">
                  Device: <strong className="text-slate-800">{connection.deviceName}</strong> ({connection.batteryPercent ?? 88}% Batt)
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {primaryProviders.map((prov) => {
                const isConnected = connection?.provider === prov.id && connection?.status === 'connected';
                return (
                  <div
                    key={prov.id}
                    className={`p-4 rounded-2xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                      isConnected
                        ? 'bg-slate-900 text-white border-slate-800 shadow-md shadow-slate-900/10'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2.5 rounded-xl border ${
                          isConnected ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <Icon icon={prov.icon} className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <h4 className={`text-sm font-bold ${isConnected ? 'text-white' : 'text-slate-900'}`}>
                              {prov.name}
                            </h4>
                          </div>
                          <span className={`text-[10px] font-medium ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                            {prov.badge}
                          </span>
                        </div>
                      </div>

                      {isConnected && (
                        <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Streaming</span>
                        </span>
                      )}
                    </div>

                    <p className={`text-xs mt-2.5 leading-relaxed ${isConnected ? 'text-slate-300' : 'text-slate-600'}`}>
                      {prov.description}
                    </p>

                    <div className="mt-3.5 pt-3 border-t border-slate-100/20 flex items-center justify-between">
                      <div className="flex items-center space-x-1 text-[10px] opacity-75">
                        <Icon icon="solar:pulse-bold" className="w-3 h-3" />
                        <span>{prov.metricsSupported.slice(0, 3).join(' • ')}</span>
                      </div>

                      {isConnected ? (
                        <button
                          onClick={handleDisconnect}
                          className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnect(prov.id)}
                          disabled={isConnecting === prov.id}
                          className="px-3 py-1.5 rounded-xl bg-[#121316] hover:bg-black text-white text-xs font-semibold transition-colors shadow-2xs cursor-pointer flex items-center space-x-1"
                        >
                          {isConnecting === prov.id ? (
                            <span>Linking...</span>
                          ) : (
                            <>
                              <span>Connect</span>
                              <Icon icon="solar:arrow-right-linear" className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Secondary / Specialized Wearables (Scrollable Strip) */}
            <div className="pt-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Other Supported Wearable Devices & Rings
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {secondaryProviders.map((prov) => {
                  const isConnected = connection?.provider === prov.id && connection?.status === 'connected';
                  return (
                    <button
                      key={prov.id}
                      onClick={() => isConnected ? handleDisconnect() : handleConnect(prov.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all duration-150 flex items-center space-x-2.5 cursor-pointer ${
                        isConnected
                          ? 'bg-slate-900 text-white border-slate-800'
                          : 'bg-slate-50/70 border-slate-200/80 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <Icon icon={prov.icon} className="w-4 h-4 shrink-0 text-slate-700" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${isConnected ? 'text-white' : 'text-slate-900'}`}>
                          {prov.name.split(' ')[0]}
                        </p>
                        <p className={`text-[10px] truncate ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {isConnected ? 'Connected' : 'Link Device'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section 2: 20-Minute Micro-Batch Buffer Monitor */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 text-white border border-slate-800 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <h4 className="text-sm font-bold text-white tracking-tight">
                    20-Minute Micro-Batch Ingestion Buffer
                  </h4>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-frequency edge buffering prevents database write exhaustion while maintaining 100% telemetry continuity.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <button
                  onClick={handleSimulatePulse}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Icon icon="solar:pulse-2-bold" className="w-3.5 h-3.5 text-rose-400" />
                  <span>Push Pulse</span>
                </button>

                <button
                  onClick={handleManualFlush}
                  disabled={isFlushing || samples.length === 0}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors shadow-sm cursor-pointer disabled:opacity-50 flex items-center space-x-1"
                >
                  <Icon icon={isFlushing ? "solar:refresh-circle-bold" : "solar:cloud-upload-bold"} className={`w-3.5 h-3.5 ${isFlushing ? 'animate-spin' : ''}`} />
                  <span>{isFlushing ? 'Flushing...' : 'Flush to DB Now'}</span>
                </button>
              </div>
            </div>

            {/* Progress Bar & Status */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
                <span>Accumulated Window: <strong>{samples.length} / 20 samples</strong> ({Math.round((samples.length / 20) * 100)}%)</span>
                <span>Auto-flush in: <strong>{bufferState.nextFlushCountdownSeconds}s</strong></span>
              </div>

              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden p-0.5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, (samples.length / 20) * 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Live Vitals Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Heart Rate */}
            <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-100 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-rose-800 uppercase tracking-wider">Heart Rate</span>
                <Icon icon="solar:heart-pulse-bold-duotone" className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-rose-950 tracking-tight">{summary.avgHeartRate}</span>
                <span className="text-xs font-semibold text-rose-700 ml-1">BPM</span>
              </div>
              <span className="text-[10px] font-medium text-rose-600/90 mt-0.5 truncate">
                Range: {summary.minHeartRate} - {summary.maxHeartRate} bpm
              </span>
            </div>

            {/* HRV */}
            <div className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-indigo-800 uppercase tracking-wider">HRV (SDNN)</span>
                <Icon icon="solar:soundwave-bold-duotone" className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-indigo-950 tracking-tight">{summary.avgHrv}</span>
                <span className="text-xs font-semibold text-indigo-700 ml-1">ms</span>
              </div>
              <span className="text-[10px] font-medium text-indigo-600/90 mt-0.5 truncate">
                Autonomic Tone: High
              </span>
            </div>

            {/* Step Cadence */}
            <div className="p-3 rounded-2xl bg-sky-50/60 border border-sky-100 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-sky-800 uppercase tracking-wider">Activity</span>
                <Icon icon="solar:walking-bold-duotone" className="w-4 h-4 text-sky-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-sky-950 tracking-tight">{summary.totalSteps}</span>
                <span className="text-xs font-semibold text-sky-700 ml-1">steps</span>
              </div>
              <span className="text-[10px] font-medium text-sky-600/90 mt-0.5 truncate">
                Burn: {summary.totalActiveCalories} kcal active
              </span>
            </div>

            {/* Recovery Readiness */}
            <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider">Readiness</span>
                <Icon icon="solar:shield-check-bold-duotone" className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-bold text-emerald-950 tracking-tight">{summary.readinessScore ?? 88}</span>
                <span className="text-xs font-semibold text-emerald-700 ml-1">/100</span>
              </div>
              <span className="text-[10px] font-medium text-emerald-600/90 mt-0.5 truncate">
                Optimal Recovery State
              </span>
            </div>
          </div>

          {/* Section 4: Interactive Time-Series Graphs */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-4">
            {/* Graph Tab Switcher */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab('hr_hrv')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'hr_hrv'
                      ? 'bg-white text-[#121316] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Heart Rate & HRV
                </button>
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'activity'
                      ? 'bg-white text-[#121316] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Activity & Energy
                </button>
                <button
                  onClick={() => setActiveTab('stress_recovery')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'stress_recovery'
                      ? 'bg-white text-[#121316] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Autonomic Stress
                </button>
                <button
                  onClick={() => setActiveTab('respiratory')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'respiratory'
                      ? 'bg-white text-[#121316] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  SpO2 & Breath
                </button>
              </div>

              <span className="text-[11px] font-semibold text-slate-500">
                Window: Continuous 20-Min Stream
              </span>
            </div>

            {/* Recharts Container */}
            <div className="w-full h-64 sm:h-72">
              {activeTab === 'hr_hrv' && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="hrvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [
                        name === 'hr' ? `${val} BPM` : `${val} ms`,
                        name === 'hr' ? 'Heart Rate' : 'HRV (SDNN)'
                      ]}
                    />
                    <Area type="monotone" dataKey="hr" stroke="#f43f5e" strokeWidth={2.5} fillOpacity={1} fill="url(#hrGrad)" name="hr" />
                    <Area type="monotone" dataKey="hrv" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#hrvGrad)" name="hrv" />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'activity' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [
                        name === 'steps' ? `${val} steps` : `${val} kcal`,
                        name === 'steps' ? 'Step Cadence' : 'Active Burn'
                      ]}
                    />
                    <Bar dataKey="steps" fill="#0284c7" radius={[6, 6, 0, 0]} name="steps" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'stress_recovery' && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="readinessGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [
                        `${val}/100`,
                        name === 'stress' ? 'Autonomic Stress' : 'Recovery Readiness'
                      ]}
                    />
                    <Area type="monotone" dataKey="stress" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#stressGrad)" name="stress" />
                    <Area type="monotone" dataKey="readiness" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#readinessGrad)" name="readiness" />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {activeTab === 'respiratory' && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis domain={[94, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', color: '#fff', fontSize: '11px' }}
                      formatter={(val: any, name: any) => [
                        name === 'spo2' ? `${val}% SpO2` : `${val} br/min`,
                        name === 'spo2' ? 'Blood Oxygen' : 'Respiratory Rate'
                      ]}
                    />
                    <Line type="monotone" dataKey="spo2" stroke="#06b6d4" strokeWidth={2.5} dot={{ r: 2 }} name="spo2" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Footer Dismiss / Action Bar */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-500">
            <span>Unified via </span>
            <strong className="text-slate-800">Open Wearables Protocol (MIT)</strong>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-2xl bg-[#121316] hover:bg-black text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};
