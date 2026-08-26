import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { VaultFileExplorer } from './VaultFileExplorer';
import { SkinHealthTrendGraph } from './SkinHealthTrendGraph';
import { getPastScansForUser } from '../lib/firebase';
import { FacialScanResult } from '../types';
import {
  loadFullAgentVault,
  getVaultHistory,
  vaultSearch,
  AgentVaultData,
  VaultVersionRecord,
  IncidentRecord,
  EventRecord,
  GoalRecord,
  SessionRecord
} from '../agent/agentVault';

interface SanaVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

type VaultTab = 'overview' | 'files' | 'sessions' | 'identity' | 'skin_profile' | 'incidents' | 'events' | 'goals' | 'search';

export const SanaVaultModal: React.FC<SanaVaultModalProps> = ({
  isOpen,
  onClose,
  userId
}) => {
  const [activeTab, setActiveTab] = useState<VaultTab>('overview');
  const [vaultData, setVaultData] = useState<AgentVaultData | null>(null);
  const [userScans, setUserScans] = useState<FacialScanResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<string>('all');
  const [searchResults, setSearchResults] = useState<Record<string, any[]> | null>(null);
  const [searching, setSearching] = useState(false);

  // Version History Inspector
  const [selectedDocVersion, setSelectedDocVersion] = useState<{ category: string; docId: string; title: string } | null>(null);
  const [versionHistory, setVersionHistory] = useState<VaultVersionRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Horizontal tab slider scroll & drag state
  const navTabsRef = useRef<HTMLDivElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!navTabsRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - navTabsRef.current.offsetLeft);
    setScrollLeftState(navTabsRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !navTabsRef.current) return;
    e.preventDefault();
    const x = e.pageX - navTabsRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    navTabsRef.current.scrollLeft = scrollLeftState - walk;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (navTabsRef.current && e.deltaY !== 0) {
      navTabsRef.current.scrollLeft += e.deltaY;
    }
  };

  const scrollNav = (direction: 'left' | 'right') => {
    if (navTabsRef.current) {
      navTabsRef.current.scrollBy({
        left: direction === 'left' ? -180 : 180,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (isOpen && userId) {
      fetchVault();
    }
  }, [isOpen, userId]);

  const fetchVault = async () => {
    setLoading(true);
    try {
      const [data, scans] = await Promise.all([
        loadFullAgentVault(userId),
        getPastScansForUser(userId).catch(() => [])
      ]);
      setVaultData(data);
      setUserScans(scans || []);
    } catch (err) {
      console.warn('Error loading Agent Vault:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await vaultSearch(userId, {
        query: searchQuery,
        scope: searchScope as any,
        limit: 15
      });
      setSearchResults(res);
    } catch (err) {
      console.warn('Vault search failed:', err);
    } finally {
      setSearching(false);
    }
  };

  const inspectVersions = async (category: string, docId: string, title: string) => {
    setSelectedDocVersion({ category, docId, title });
    setLoadingHistory(true);
    try {
      const history = await getVaultHistory(userId, category, docId, 10);
      setVersionHistory(history);
    } catch (err) {
      console.warn('Error fetching version history:', err);
      setVersionHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="bg-white w-full max-w-3xl h-[88vh] sm:h-[82vh] rounded-t-[32px] sm:rounded-[32px] shadow-2xl border border-slate-200/80 flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-[#121316] text-white shadow-xs">
                <Icon icon="solar:vault-linear" className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-semibold text-slate-900">Sana Agent Vault</h3>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/60">
                    Isolated Memory
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Versioned, searchable long-term memory store
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200/60 text-slate-500 transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-6 h-6" />
            </button>
          </div>

          {/* Navigation Bar */}
          <div className="relative bg-slate-100/80 border-b border-slate-200/80 flex items-center px-2 py-1">
            <button
              type="button"
              onClick={() => scrollNav('left')}
              className="p-1.5 rounded-full bg-white/90 hover:bg-white text-slate-600 shadow-2xs border border-slate-200/80 shrink-0 transition-all cursor-pointer opacity-80 hover:opacity-100 mr-1 active:scale-95"
              title="Scroll left"
            >
              <Icon icon="solar:alt-arrow-left-linear" className="w-3.5 h-3.5" />
            </button>

            <div
              ref={navTabsRef}
              onMouseDown={handleMouseDown}
              onMouseLeave={handleMouseLeaveOrUp}
              onMouseUp={handleMouseLeaveOrUp}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              className="py-1 flex items-center space-x-1.5 overflow-x-auto no-scrollbar touch-pan-x overscroll-x-contain select-none flex-1 scroll-smooth"
              style={{ cursor: isMouseDown ? 'grabbing' : 'grab' }}
            >
              {[
                { id: 'overview', label: 'Overview', icon: 'solar:widget-3-linear' },
                { id: 'files', label: 'Files & Portals', icon: 'solar:laptop-minimalistic-linear' },
                { id: 'sessions', label: 'Sessions', icon: 'solar:chat-round-line-linear' },
                { id: 'identity', label: 'User Data', icon: 'solar:user-hand-up-linear' },
                { id: 'skin_profile', label: 'Skin Profile', icon: 'solar:face-scan-circle-linear' },
                { id: 'incidents', label: 'Incidents', icon: 'solar:danger-triangle-linear' },
                { id: 'events', label: 'Events', icon: 'solar:calendar-mark-linear' },
                { id: 'goals', label: 'Goals', icon: 'solar:target-linear' },
                { id: 'search', label: 'Search', icon: 'solar:magnifier-linear' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as VaultTab)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    activeTab === t.id
                      ? 'bg-[#121316] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-200/60 bg-white/60'
                  }`}
                >
                  <Icon icon={t.icon} className="w-3.5 h-3.5 shrink-0" />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollNav('right')}
              className="p-1.5 rounded-full bg-white/90 hover:bg-white text-slate-600 shadow-2xs border border-slate-200/80 shrink-0 transition-all cursor-pointer opacity-80 hover:opacity-100 ml-1 active:scale-95"
              title="Scroll right"
            >
              <Icon icon="solar:alt-arrow-right-linear" className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-12 text-slate-400 space-y-3">
                <Icon icon="solar:spinner-linear" className="w-8 h-8 animate-spin text-[#121316]" />
                <p className="text-sm font-medium">Loading Sana Vault records...</p>
              </div>
            ) : (
              <>
                {/* TAB: FILES & PORTALS */}
                {activeTab === 'files' && vaultData && (
                  <VaultFileExplorer
                    userId={userId}
                    vaultData={vaultData}
                    onRefreshVault={fetchVault}
                  />
                )}
                {/* TAB: OVERVIEW */}
                {activeTab === 'overview' && vaultData && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
                        <p className="text-xs text-slate-500 font-medium">Total Sessions</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{vaultData.sessions.length}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/60">
                        <p className="text-xs text-amber-700 font-medium">Incidents Logged</p>
                        <p className="text-2xl font-bold text-amber-900 mt-1">{vaultData.incidents.length}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200/60">
                        <p className="text-xs text-blue-700 font-medium">Scheduled Events</p>
                        <p className="text-2xl font-bold text-blue-900 mt-1">{vaultData.events.length}</p>
                      </div>
                      <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/60">
                        <p className="text-xs text-emerald-700 font-medium">Active Goals</p>
                        <p className="text-2xl font-bold text-emerald-900 mt-1">{vaultData.goals.length}</p>
                      </div>
                    </div>

                    {/* Skin Profile Summary Snapshot */}
                    <div className="p-5 rounded-2xl bg-[#121316] text-white space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold flex items-center space-x-2">
                          <Icon icon="solar:face-scan-circle-bold" className="w-4 h-4 text-emerald-400" />
                          <span>Skin Profile Composition (Vault v{vaultData.composition?.version || 1})</span>
                        </h4>
                        <button
                          onClick={() => inspectVersions('skin_profile', 'composition', 'Skin Profile Composition')}
                          className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
                        >
                          View History
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                        <div>
                          <span className="text-slate-400">Skin Type Tendency:</span>{' '}
                          <span className="font-medium text-white">{vaultData.composition?.skinTypeTendency || 'Not specified yet'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Barrier Patterns:</span>{' '}
                          <span className="font-medium text-white">{vaultData.composition?.barrierStatusPatterns || 'Not specified yet'}</span>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                          <span className="text-slate-400">Known Triggers:</span>{' '}
                          {vaultData.composition?.knownTriggers && vaultData.composition.knownTriggers.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {vaultData.composition.knownTriggers.map((trig, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[11px]">
                                  {trig}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Not specified yet</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Recent Incidents & Events */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                          <Icon icon="solar:danger-triangle-linear" className="w-4 h-4 text-amber-600" />
                          <span>Recent Incidents</span>
                        </h4>
                        {vaultData.incidents.length === 0 ? (
                          <p className="text-xs text-slate-400">No flare incidents logged in Vault yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {vaultData.incidents.slice(0, 3).map(inc => (
                              <div key={inc.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                                <div className="flex justify-between items-center font-semibold text-slate-800">
                                  <span>{inc.title}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{inc.occurredAtDate}</span>
                                </div>
                                <p className="text-slate-500 mt-1 line-clamp-1">{inc.description}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
                          <Icon icon="solar:calendar-mark-linear" className="w-4 h-4 text-blue-600" />
                          <span>Upcoming & Scheduled Events</span>
                        </h4>
                        {vaultData.events.length === 0 ? (
                          <p className="text-xs text-slate-400">No upcoming events scheduled in Vault.</p>
                        ) : (
                          <div className="space-y-2">
                            {vaultData.events.slice(0, 3).map(evt => (
                              <div key={evt.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-semibold text-slate-800">{evt.title}</p>
                                  <p className="text-slate-400 text-[10px]">{evt.scheduledAtDate} • {evt.localTime}</p>
                                </div>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                  evt.status === 'today' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                  evt.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                                  evt.status === 'completed' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {evt.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: SESSIONS */}
                {activeTab === 'sessions' && vaultData && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Agent Conversation Execution Traces</h4>
                    {vaultData.sessions.length === 0 ? (
                      <p className="text-xs text-slate-500">No session execution records in Vault.</p>
                    ) : (
                      <div className="space-y-3">
                        {vaultData.sessions.map(sess => (
                          <div key={sess.sessionId} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900 text-sm">{sess.title}</span>
                              <span className="text-xs text-slate-500">{sess.startedAtDate} ({sess.localTime})</span>
                            </div>
                            <p className="text-xs text-slate-600 italic">"{sess.summary}"</p>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {sess.topics.map((top, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] text-slate-600">
                                  #{top}
                                </span>
                              ))}
                              {sess.messages && (
                                <span className="px-2 py-0.5 rounded-md bg-slate-200 text-[10px] text-slate-700 font-medium ml-auto">
                                  {sess.messages.length} messages
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: USER DATA (IDENTITY, PERSONALITY, PREFERENCES) */}
                {activeTab === 'identity' && vaultData && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                          <Icon icon="solar:user-hand-up-linear" className="w-4 h-4 text-slate-700" />
                          <span>Human Identity & Climate Context (v{vaultData.identity?.version || 1})</span>
                        </h4>
                        <button
                          onClick={() => inspectVersions('user_data', 'identity', 'User Identity Data')}
                          className="text-xs text-blue-600 hover:underline cursor-pointer"
                        >
                          Version Diff History
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <p><span className="font-semibold text-slate-900">Full Name:</span> {vaultData.identity?.fullName || 'Not specified yet'}</p>
                        <p><span className="font-semibold text-slate-900">Preferred Name:</span> {vaultData.identity?.preferredName || 'Not specified yet'}</p>
                        <p><span className="font-semibold text-slate-900">Climate / Location:</span> {vaultData.identity?.locationOrClimate || 'Not specified yet'}</p>
                        <p><span className="font-semibold text-slate-900">Hormonal Context:</span> {vaultData.identity?.sexOrHormonalContext || 'Not specified yet'}</p>
                        <p><span className="font-semibold text-slate-900">Permanent Facts:</span></p>
                        {vaultData.identity?.permanentFacts && vaultData.identity.permanentFacts.length > 0 ? (
                          <ul className="list-disc list-inside pl-2 space-y-1 text-slate-600">
                            {vaultData.identity.permanentFacts.map((fact, idx) => (
                              <li key={idx}>{fact}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-slate-400 italic pl-2">Not specified yet</p>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                          <Icon icon="solar:chat-line-linear" className="w-4 h-4 text-slate-700" />
                          <span>Behavioral & Communication Style (v{vaultData.personality?.version || 1})</span>
                        </h4>
                        <button
                          onClick={() => inspectVersions('user_data', 'personality', 'Personality & Preferences')}
                          className="text-xs text-blue-600 hover:underline cursor-pointer"
                        >
                          Version Diff History
                        </button>
                      </div>
                      <div className="space-y-1.5 text-xs text-slate-700">
                        <p><span className="font-semibold text-slate-900">Communication Style:</span> {vaultData.personality?.communicationStyle || 'Not specified yet'}</p>
                        <p><span className="font-semibold text-slate-900">Risk Tolerance:</span> {vaultData.personality?.riskTolerance || 'Not specified yet'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: SKIN PROFILE */}
                {activeTab === 'skin_profile' && vaultData && (
                  <div className="space-y-6">
                    {/* Minimalist Aesthetic Skin Health Graph */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs">
                      <SkinHealthTrendGraph
                        scans={userScans}
                        title="Skin Telemetry & Longitudinal Trend Graph"
                        subtitle="Plotted directly from verified facial scan metrics (Read-Only AI Agent Input)"
                      />
                    </div>

                    {/* Skin Composition Card */}
                    <div className="p-5 rounded-2xl bg-[#121316] text-white space-y-4 shadow-xs">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <h4 className="text-sm font-semibold flex items-center space-x-2">
                          <Icon icon="solar:face-scan-circle-bold" className="w-5 h-5 text-emerald-400" />
                          <span>Skin Composition & Barrier Metrics (v{vaultData.composition?.version || 1})</span>
                        </h4>
                        <button
                          onClick={() => inspectVersions('skin_profile', 'composition', 'Skin Profile Composition')}
                          className="text-xs text-slate-300 hover:text-white underline cursor-pointer"
                        >
                          Version History
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                          <span className="text-slate-400 font-medium">Skin Type Tendency</span>
                          <p className="text-sm font-bold text-white mt-0.5">{vaultData.composition?.skinTypeTendency || 'Combination / Sensitive'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                          <span className="text-slate-400 font-medium">Barrier Status & Health</span>
                          <p className="text-sm font-bold text-emerald-400 mt-0.5">{vaultData.composition?.barrierStatusPatterns || 'Healthy & Hydrated'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                          <span className="text-slate-400 font-medium">Pigmentation Tendency</span>
                          <p className="text-sm font-semibold text-white mt-0.5">{vaultData.composition?.pigmentationTendency || 'Low - Moderate'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                          <span className="text-slate-400 font-medium">Texture & Elasticity</span>
                          <p className="text-sm font-semibold text-white mt-0.5">{vaultData.composition?.texturePoreElasticity || 'Normal elasticity, refined pores'}</p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 space-y-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Known Sensitivity Triggers</span>
                        {vaultData.composition?.knownTriggers && vaultData.composition.knownTriggers.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {vaultData.composition.knownTriggers.map((trig, idx) => (
                              <span key={idx} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
                                ⚡ {trig}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-300 text-xs">Synthetic Fragrance</span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-300 text-xs">Over-exfoliation</span>
                            <span className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-300 text-xs">High UV Exposure</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Skin Evolution Timeline */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 space-y-4">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                        <Icon icon="solar:history-linear" className="w-4 h-4 text-slate-700" />
                        <span>Skin Health Evolution Timeline</span>
                      </h4>

                      {vaultData.evolution?.timeline && vaultData.evolution.timeline.length > 0 ? (
                        <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                          {vaultData.evolution.timeline.map((item, idx) => (
                            <div key={idx} className="relative space-y-1">
                              <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-xs" />
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-900">{item.summary}</span>
                                <span className="text-[10px] text-slate-500">{item.date}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-2">
                          <p className="font-semibold text-slate-800">Baseline Assessment Active</p>
                          <p className="text-slate-500">
                            Vault skin profile active. As you perform facial scans, log routines, or record incidents, Sana AI automatically tracks your skin barrier progression over time.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB: INCIDENTS */}
                {activeTab === 'incidents' && vaultData && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Flare-Up, Reaction & Allergy Incident Logs</h4>
                    {vaultData.incidents.length === 0 ? (
                      <p className="text-xs text-slate-500">No incident records in Vault.</p>
                    ) : (
                      <div className="space-y-3">
                        {vaultData.incidents.map(inc => (
                          <div key={inc.id} className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/60 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-900 text-sm">{inc.title}</span>
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                                {inc.occurredAtDate} ({inc.localTime})
                              </span>
                            </div>
                            <p className="text-xs text-slate-700">{inc.description}</p>
                            {inc.suspectedTriggers && inc.suspectedTriggers.length > 0 && (
                              <div className="flex items-center space-x-2 pt-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Triggers:</span>
                                <div className="flex flex-wrap gap-1">
                                  {inc.suspectedTriggers.map((trig, idx) => (
                                    <span key={idx} className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-[10px] text-amber-900">
                                      {trig}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: EVENTS */}
                {activeTab === 'events' && vaultData && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Scheduled Regimen Events & Milestones</h4>
                    {vaultData.events.length === 0 ? (
                      <p className="text-xs text-slate-500">No events found in Vault.</p>
                    ) : (
                      <div className="space-y-3">
                        {vaultData.events.map(evt => (
                          <div key={evt.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-slate-900 text-sm">{evt.title}</p>
                              <p className="text-xs text-slate-500 mt-0.5">Scheduled for {evt.scheduledAtDate} • Local: {evt.localTime}</p>
                            </div>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              evt.status === 'today' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                              evt.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                              evt.status === 'completed' ? 'bg-slate-200 text-slate-700' : 'bg-red-100 text-red-700'
                            }`}>
                              {evt.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: GOALS */}
                {activeTab === 'goals' && vaultData && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-800">Long-Term Skin Health Goals</h4>
                    {vaultData.goals.length === 0 ? (
                      <p className="text-xs text-slate-500">No goals logged in Vault.</p>
                    ) : (
                      <div className="space-y-3">
                        {vaultData.goals.map(g => (
                          <div key={g.id} className="p-4 rounded-2xl bg-emerald-50/40 border border-emerald-200/60 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-slate-900 text-sm">{g.title}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                                {g.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-700">{g.description}</p>
                            {g.targetDate && (
                              <p className="text-[11px] text-slate-500">Target Date: {g.targetDate}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: SEARCH */}
                {activeTab === 'search' && (
                  <div className="space-y-4">
                    <form onSubmit={handleSearch} className="flex gap-2">
                      <div className="relative flex-1">
                        <Icon icon="solar:magnifier-linear" className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search sessions, flare triggers, products..."
                          className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#121316]"
                        />
                      </div>
                      <select
                        value={searchScope}
                        onChange={e => setSearchScope(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 cursor-pointer"
                      >
                        <option value="all">All Scopes</option>
                        <option value="sessions">Sessions</option>
                        <option value="incidents">Incidents</option>
                        <option value="events">Events</option>
                        <option value="goals">Goals</option>
                        <option value="notes">Notes</option>
                        <option value="documents">Documents</option>
                      </select>
                      <button
                        type="submit"
                        disabled={searching}
                        className="px-4 py-2 rounded-xl bg-[#121316] text-white text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        {searching ? 'Searching...' : 'Search'}
                      </button>
                    </form>

                    {searchResults && (
                      <div className="space-y-3 pt-2">
                        <p className="text-xs font-bold text-slate-500">Search Results for "{searchQuery}":</p>
                        {Object.entries(searchResults).map(([sc, items]) => {
                          if (!items || items.length === 0) return null;
                          return (
                            <div key={sc} className="space-y-2">
                              <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{sc} ({items.length})</h5>
                              <div className="space-y-1.5">
                                {items.map((item, idx) => (
                                  <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                                    <p className="font-semibold text-slate-900">{item.title || item.summary || item.name || `Record ${idx + 1}`}</p>
                                    <p className="text-slate-500 line-clamp-2 mt-0.5">{item.description || item.content || item.summary || ''}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Version History Modal / Drawer overlay */}
      {selectedDocVersion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Git-Like Version History</h4>
                <p className="text-xs text-slate-500">{selectedDocVersion.title} ({selectedDocVersion.category}/{selectedDocVersion.docId})</p>
              </div>
              <button
                onClick={() => setSelectedDocVersion(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
              </button>
            </div>

            {loadingHistory ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading version diff snapshots...</div>
            ) : versionHistory.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">Only initial version v1 exists in Vault. No prior changes recorded.</div>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {versionHistory.map(ver => (
                  <div key={ver.version} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between items-center font-bold text-slate-900">
                      <span>Version v{ver.version}</span>
                      <span className="text-[10px] text-slate-500">{ver.changedAt} ({ver.localTime})</span>
                    </div>
                    <p className="text-slate-600 font-medium">Author: <span className="text-slate-900 uppercase font-bold">{ver.changedBy}</span></p>
                    <p className="text-slate-500 italic">Diff: "{ver.diffSummary}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
