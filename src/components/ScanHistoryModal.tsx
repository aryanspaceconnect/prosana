import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, FacialScanResult } from '../types';
import { subscribeFacialScans } from '../lib/firebase';
import { parseTimestampToDate } from '../utils/dateUtils';
import { SkinHealthTrendGraph } from './SkinHealthTrendGraph';

interface ScanHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
}

export const ScanHistoryModal: React.FC<ScanHistoryModalProps> = ({
  isOpen,
  onClose,
  userProfile
}) => {
  const [scanSessions, setScanSessions] = useState<FacialScanResult[]>([]);
  const [expandedScanId, setExpandedScanId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; label: string } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const uid = userProfile?.uid || 'guest_user';
    const unsub = subscribeFacialScans(uid, (scans) => {
      setScanSessions(scans);
      if (scans.length > 0 && !expandedScanId) {
        // Expand the most recent scan by default
        const firstId = scans[0].id || scans[0].scanId || 'scan_0';
        setExpandedScanId(firstId);
      }
    });
    return () => unsub();
  }, [isOpen, userProfile?.uid]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
          className="w-full max-w-lg rounded-[32px] bg-white border border-slate-200/90 overflow-hidden shadow-2xl p-5 sm:p-6 relative flex flex-col max-h-[88vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-2xl bg-[#121316] text-white shadow-xs">
                <Icon icon="solar:history-bold" className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-[#121316] tracking-tight">Scan History</h3>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-700">
                    {scanSessions.length} {scanSessions.length === 1 ? 'Session' : 'Sessions'}
                  </span>
                </div>
                <p className="text-[11.5px] text-[#64748b] mt-0.5">
                  Facial skin analysis timeline & AI clinical reports
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Close"
            >
              <Icon icon="solar:close-circle-linear" className="w-6 h-6" />
            </button>
          </div>

          {/* Session List Container */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-3.5 pr-0.5">
            {scanSessions.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] mb-2">
                <SkinHealthTrendGraph
                  scans={scanSessions as any}
                  title="Skin Telemetry Trend"
                  subtitle="Read-only data points generated from scan history"
                  compact={true}
                />
              </div>
            )}

            {scanSessions.length === 0 ? (
              <div className="py-12 px-6 rounded-3xl bg-[#f8f9fb] border border-[#eaedf1] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/60 text-amber-600 flex items-center justify-center mx-auto">
                  <Icon icon="solar:scanner-linear" className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#121316]">No Scan Sessions Recorded</h4>
                  <p className="text-xs text-[#64748b] mt-1 leading-relaxed max-w-xs mx-auto">
                    Perform a facial skin scan to automatically record your clinical session, gallery overlays, and AI reports here.
                  </p>
                </div>
              </div>
            ) : (
              scanSessions.map((scan, idx) => {
                const scanId = scan.id || scan.scanId || `scan_${idx}`;
                const isExpanded = expandedScanId === scanId;
                const parsedDate = parseTimestampToDate(scan.timestamp);
                const formattedDate = parsedDate
                  ? parsedDate.toLocaleDateString([], {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : `Scan Session #${scanSessions.length - idx}`;

                // Extract all images/masks for gallery slide
                const galleryImages: { url: string; label: string }[] = [];
                if (scan.capturedImage) {
                  galleryImages.push({ url: scan.capturedImage, label: 'Captured Photo' });
                }

                if (scan.concernImages && typeof scan.concernImages === 'object') {
                  Object.entries<any>(scan.concernImages).forEach(([key, val]) => {
                    if (val && val.mask_url && typeof val.mask_url === 'string') {
                      if (!galleryImages.some(img => img.url === val.mask_url)) {
                        const formattedLabel = key
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, c => c.toUpperCase());
                        galleryImages.push({ url: val.mask_url, label: formattedLabel });
                      }
                    }
                  });
                }

                // Check rawPerfectCorpOutput or rawJson if concernImages was empty
                if (galleryImages.length <= 1 && scan.rawPerfectCorpOutput) {
                  try {
                    const rawData = typeof scan.rawPerfectCorpOutput === 'string'
                      ? JSON.parse(scan.rawPerfectCorpOutput)
                      : scan.rawPerfectCorpOutput;
                    const outputList = Array.isArray(rawData?.data?.output)
                      ? rawData.data.output
                      : Array.isArray(rawData?.output)
                      ? rawData.output
                      : [];
                    for (const item of outputList) {
                      if (item?.mask_url && typeof item.mask_url === 'string') {
                        if (!galleryImages.some(img => img.url === item.mask_url)) {
                          const lbl = (item.type || item.region || 'Concern Mask')
                            .replace(/_/g, ' ')
                            .replace(/\b\w/g, (c: string) => c.toUpperCase());
                          galleryImages.push({ url: item.mask_url, label: lbl });
                        }
                      }
                    }
                  } catch (e) {
                    // Ignore parse error
                  }
                }

                const hydrationVal = scan.hydrationScore ?? scan.rawMetrics?.moistureScore ?? 85;
                const barrierVal = scan.barrierScore ?? scan.rawMetrics?.barrierRednessScore ?? 88;
                const clarityVal = scan.clarityScore ?? scan.rawMetrics?.acneBlemishScore ?? 90;

                return (
                  <div
                    key={scanId}
                    className={`rounded-2xl border transition-all overflow-hidden ${
                      isExpanded
                        ? 'bg-white border-[#121316] shadow-md'
                        : 'bg-[#f8f9fb] border-[#eaedf1] hover:border-slate-300'
                    }`}
                  >
                    {/* Session Item Header */}
                    <div
                      onClick={() => setExpandedScanId(isExpanded ? null : scanId)}
                      className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                    >
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-[#121316] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                          #{scanSessions.length - idx}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-[13.5px] font-bold text-[#121316] truncate">
                              {scan.scanType
                                ? scan.scanType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
                                : 'Facial Scan Session'}
                            </h4>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-900 text-[9px] font-extrabold uppercase tracking-wide">
                                Latest
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#64748b] truncate mt-0.5">{formattedDate}</p>
                        </div>
                      </div>

                      {/* Score Badges & Expand Indicator */}
                      <div className="flex items-center space-x-2.5 shrink-0 ml-2">
                        <div className="hidden sm:flex items-center space-x-1.5 text-[10.5px] font-bold">
                          <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/60">
                            H: {hydrationVal}%
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                            B: {barrierVal}%
                          </span>
                        </div>
                        <div className="p-1 rounded-lg bg-slate-100 text-slate-600">
                          <Icon
                            icon={isExpanded ? 'solar:alt-arrow-up-linear' : 'solar:alt-arrow-down-linear'}
                            className="w-4 h-4"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Expanded Detail Body */}
                    {isExpanded && (
                      <div className="p-4 border-t border-slate-100 bg-[#fbfcfd] space-y-4">
                        {/* Scores Grid (Mobile View) */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
                          <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/70 text-amber-900">
                            <span className="text-[9.5px] font-semibold uppercase text-amber-700 block">Hydration</span>
                            <span className="text-sm font-bold">{hydrationVal}%</span>
                          </div>
                          <div className="p-2 rounded-xl bg-emerald-50/80 border border-emerald-200/70 text-emerald-900">
                            <span className="text-[9.5px] font-semibold uppercase text-emerald-700 block">Barrier</span>
                            <span className="text-sm font-bold">{barrierVal}%</span>
                          </div>
                          <div className="p-2 rounded-xl bg-blue-50/80 border border-blue-200/70 text-blue-900">
                            <span className="text-[9.5px] font-semibold uppercase text-blue-700 block">Clarity</span>
                            <span className="text-sm font-bold">{clarityVal}%</span>
                          </div>
                        </div>

                        {/* Image Slide Carousel */}
                        {galleryImages.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                                Scan Media & Gallery Overlays ({galleryImages.length})
                              </span>
                              <span className="text-[10px] text-slate-400">Scroll horizontally →</span>
                            </div>

                            <div className="flex space-x-2.5 overflow-x-auto pb-2 pt-1 no-scrollbar">
                              {galleryImages.map((img, imgIdx) => (
                                <div
                                  key={imgIdx}
                                  onClick={() => setSelectedImage(img)}
                                  className="shrink-0 w-24 h-28 rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden relative shadow-xs group cursor-pointer active:scale-95 transition-transform"
                                >
                                  <img
                                    src={img.url}
                                    alt={img.label}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  />
                                  <div className="absolute inset-x-0 bottom-0 bg-slate-950/85 backdrop-blur-xs p-1 text-center">
                                    <p className="text-[9px] font-bold text-white truncate px-0.5">
                                      {img.label}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI Clinical Response Section */}
                        <div className="p-3.5 rounded-2xl bg-white border border-[#eaedf1] shadow-2xs space-y-2">
                          <div className="flex items-center space-x-2 text-[11px] font-bold text-[#121316]">
                            <Icon icon="solar:stars-minimalistic-bold" className="w-4 h-4 text-amber-500" />
                            <span>AI Clinical Response</span>
                          </div>

                          {scan.reportStatus === 'running' && !scan.reportText ? (
                            <div className="py-4 flex flex-col items-center justify-center space-y-2">
                              <div className="flex items-center space-x-2 text-slate-600 font-medium text-xs">
                                <span className="w-2 h-2 rounded-full bg-slate-800 animate-ping" />
                                <span className="font-bold animate-pulse text-slate-900">
                                  Generating SANA AI Clinical Report...
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 text-center">
                                Synthesizing facial metrics with exposome inputs.
                              </p>
                            </div>
                          ) : (
                            <div className="text-[11.5px] text-[#334155] leading-relaxed max-h-56 overflow-y-auto pr-1">
                              <div className="markdown-body space-y-1">
                                <Markdown>
                                  {scan.reportText || scan.summary || 'Clinical scan analysis processed successfully.'}
                                </Markdown>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Ask SANA Action */}
                        <button
                          type="button"
                          onClick={() => {
                            const sessionId = scan.reportSessionId || `session_scan_report_${Date.now()}`;
                            window.dispatchEvent(
                              new CustomEvent('sana:open_chat_session', {
                                detail: {
                                  sessionId,
                                  reportText: scan.reportText || scan.summary
                                }
                              })
                            );
                            onClose();
                          }}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#121316] hover:bg-slate-800 text-white font-semibold text-xs transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer active:scale-98"
                        >
                          <Icon icon="solar:chat-round-dots-bold" className="w-4 h-4 text-amber-400" />
                          <span>Discuss Session in SANA Chat →</span>
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

      {/* Expanded Lightbox Modal for Gallery Images */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div
            className="relative max-w-sm w-full bg-slate-900 border border-slate-700 rounded-3xl overflow-hidden p-4 shadow-2xl flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-bold" className="w-6 h-6" />
            </button>
            <h4 className="text-sm font-bold text-white mb-3 self-start">{selectedImage.label}</h4>
            <div className="w-full h-80 rounded-2xl overflow-hidden bg-black border border-slate-800">
              <img
                src={selectedImage.url}
                alt={selectedImage.label}
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
