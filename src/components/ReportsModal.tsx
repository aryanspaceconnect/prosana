import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, FacialScanResult } from '../types';
import { subscribeFacialScans } from '../lib/firebase';
import { parseTimestampToDate } from '../utils/dateUtils';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
}

export const ReportsModal: React.FC<ReportsModalProps> = ({
  isOpen,
  onClose,
  userProfile
}) => {
  const [scanHistory, setScanHistory] = useState<FacialScanResult[]>([]);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeFacialScans(userProfile.uid, (data) => {
      setScanHistory(data);
    });
    return () => unsub();
  }, [userProfile?.uid]);

  if (!isOpen) return null;

  // Calculate real average metrics from historical scans
  const totalScans = scanHistory.length;
  const validHydrationScans = scanHistory.filter(s => typeof s.hydrationScore === 'number' && !isNaN(s.hydrationScore as number));
  const avgHydration = validHydrationScans.length > 0
    ? Math.round(validHydrationScans.reduce((acc, s) => acc + (s.hydrationScore as number), 0) / validHydrationScans.length)
    : null;

  const validBarrierScans = scanHistory.filter(s => typeof s.barrierScore === 'number' && !isNaN(s.barrierScore as number));
  const avgBarrier = validBarrierScans.length > 0
    ? Math.round(validBarrierScans.reduce((acc, s) => acc + (s.barrierScore as number), 0) / validBarrierScans.length)
    : null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-md rounded-[32px] bg-white border border-white/80 overflow-hidden shadow-2xl p-6 relative flex flex-col space-y-4 max-h-[85vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-[#1a1c1e] text-white">
                <Icon icon="solar:chart-square-bold" className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#121316]">Skin Analytics Vault</h3>
                <p className="text-[11px] text-[#787f8d]">Historical Facial Scans & Reports</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-[#787f8d] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
            </button>
          </div>

          {/* Overview Metrics Bar */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Avg Hydration</span>
              <p className="text-[18px] font-bold text-amber-600">{avgHydration !== null ? `${avgHydration}%` : 'N/A'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Barrier Health</span>
              <p className="text-[18px] font-bold text-emerald-600">{avgBarrier !== null ? `${avgBarrier}%` : 'N/A'}</p>
            </div>
            <div className="p-3 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center">
              <span className="text-[10px] uppercase font-bold text-[#64748b]">Total Scans</span>
              <p className="text-[18px] font-bold text-[#1e293b]">{totalScans}</p>
            </div>
          </div>

          {/* Scan History Items */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pt-1 pr-0.5">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Historical Analysis Reports
            </span>

            {scanHistory.length === 0 ? (
              <div className="p-5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center space-y-2">
                <Icon icon="solar:camera-minimalistic-linear" className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-[12.5px] font-medium text-[#475569]">No past scans saved yet.</p>
                <p className="text-[11px] text-[#787f8d]">Run your first facial scan to begin generating personalized AI reports!</p>
              </div>
            ) : (
              scanHistory.map((scan, idx) => {
                const scanId = scan.id || scan.scanId || `scan_${idx}`;
                const isExpanded = expandedScanId === scanId;
                const parsedDate = parseTimestampToDate(scan.timestamp);
                const scanDate = parsedDate ? parsedDate.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : `Scan #${scanHistory.length - idx}`;
                
                // Collect mask images from concernImages
                const maskImages: any[] = [];
                if (scan.concernImages) {
                  Object.keys(scan.concernImages).forEach(k => {
                    const item = scan.concernImages[k];
                    if (item && item.mask_url) {
                      maskImages.push(item);
                    }
                  });
                }

                return (
                  <div
                    key={scanId}
                    className="rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] overflow-hidden transition-all shadow-2xs"
                  >
                    {/* Header bar */}
                    <div
                      onClick={() => setExpandedScanId(isExpanded ? null : scanId)}
                      className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-400/10 text-amber-700 font-bold text-xs flex items-center justify-center border border-amber-400/20">
                          #{scanHistory.length - idx}
                        </div>
                        <div>
                          <h4 className="text-[13px] font-semibold text-[#121316]">{scan.scanType || 'Daily Facial Scan'}</h4>
                          <p className="text-[10px] text-[#64748b]">{scanDate}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <div className="text-right text-[11px] font-medium">
                          <span className="text-amber-600 font-bold">{scan.hydrationScore || 85}%</span>
                          <span className="text-slate-400 px-1">•</span>
                          <span className="text-emerald-600 font-bold">{scan.barrierScore || 88}%</span>
                        </div>
                        <Icon icon={isExpanded ? "solar:alt-arrow-up-linear" : "solar:alt-arrow-down-linear"} className="w-4 h-4 text-slate-500" />
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="p-3.5 border-t border-[#eaedf1] bg-white space-y-3">
                        {/* Scores row */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                          <div className="p-2 rounded-xl bg-amber-50 border border-amber-200/60 text-amber-900">
                            <span>Moisture</span>
                            <span className="block text-xs text-amber-700">{scan.hydrationScore || 85}%</span>
                          </div>
                          <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200/60 text-emerald-900">
                            <span>Barrier</span>
                            <span className="block text-xs text-emerald-700">{scan.barrierScore || 88}%</span>
                          </div>
                          <div className="p-2 rounded-xl bg-blue-50 border border-blue-200/60 text-blue-900">
                            <span>Clarity</span>
                            <span className="block text-xs text-blue-700">{scan.clarityScore || 90}%</span>
                          </div>
                        </div>

                        {/* Captured Face Image & Mask Overlays */}
                        {(scan.capturedImage || maskImages.length > 0) && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">Scan Media & Overlays</span>
                            <div className="flex space-x-2 overflow-x-auto pb-1">
                              {scan.capturedImage && (
                                <div className="shrink-0 w-16 h-16 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden relative shadow-xs">
                                  <img src={scan.capturedImage} alt="Captured Face" className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/80 text-white text-[8px] font-mono text-center truncate px-0.5">
                                    Face Photo
                                  </span>
                                </div>
                              )}
                              {maskImages.map((m, mIdx) => (
                                <div key={mIdx} className="shrink-0 w-16 h-16 rounded-xl bg-slate-900 border border-slate-700 overflow-hidden relative group shadow-xs">
                                  <img src={m.mask_url} alt={m.label} className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/80 text-white text-[8px] font-mono text-center truncate px-0.5">
                                    {m.label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Markdown AI Report Text */}
                        <div className="p-3 rounded-xl bg-[#f8f9fb] border border-[#eaedf1] text-[11.5px] text-[#334155] leading-relaxed max-h-52 overflow-y-auto">
                          <div className="markdown-body space-y-1">
                            <Markdown>{scan.reportText || scan.summary || 'Clinical scan report processed successfully.'}</Markdown>
                          </div>
                        </div>

                        {/* Open Chat Session CTA */}
                        <button
                          type="button"
                          onClick={() => {
                            const sessionId = scan.reportSessionId || `session_scan_report_${scanDate.replace(/[^a-zA-Z0-9]/g, '_')}`;
                            window.dispatchEvent(new CustomEvent('sana:open_chat_session', {
                              detail: { sessionId }
                            }));
                            onClose();
                          }}
                          className="w-full py-2.5 rounded-xl bg-[#121316] hover:bg-slate-800 text-white text-[12px] font-semibold transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
                        >
                          <Icon icon="solar:chat-round-dots-bold" className="w-4 h-4 text-amber-400" />
                          <span>Open Scan Chat Session →</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

