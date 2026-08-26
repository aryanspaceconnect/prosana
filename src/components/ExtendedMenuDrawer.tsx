import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile } from '../types';

interface ExtendedMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onOpenScan: () => void;
  onOpenSettings: () => void;
  onOpenReports: () => void;
  onOpenRoutine: () => void;
  onOpenVault: () => void;
  onOpenScanHistory?: () => void;
}

export const ExtendedMenuDrawer: React.FC<ExtendedMenuDrawerProps> = ({
  isOpen,
  onClose,
  userProfile,
  onOpenScan,
  onOpenSettings,
  onOpenReports,
  onOpenRoutine,
  onOpenVault,
  onOpenScanHistory
}) => {
  const [dragStartY, setDragStartY] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartY === null) return;
    const diffY = e.changedTouches[0].clientY - dragStartY;
    if (diffY > 50) {
      onClose(); // Swipe down to close
    }
    setDragStartY(null);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/25 backdrop-blur-xs z-50 pointer-events-auto"
          />

          {/* Floating squircle menu card (Detached from the bottom) */}
          <motion.div
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="fixed bottom-6 left-4 right-4 max-w-md mx-auto z-50 pointer-events-auto bg-white/98 backdrop-blur-2xl rounded-[32px] shadow-2xl border border-slate-200/80 p-5 overflow-hidden max-h-[85vh] flex flex-col"
          >
            {/* Top Drag Handle Indicator */}
            <div className="w-full flex justify-center pb-3 cursor-grab shrink-0" onClick={onClose}>
              <div className="w-12 h-1.5 rounded-full bg-[#d0d5dd]" />
            </div>

            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pt-1 pb-1">

            {/* Account & User Header */}
            <div 
              onClick={onOpenSettings}
              className="flex items-center justify-between p-4 mb-4 rounded-[22px] bg-[#f8f9fb] border border-[#eaedf1] hover:bg-[#f0f3f7] transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-3.5">
                {userProfile?.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt="Profile"
                    className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-[#1a1c1e] text-white flex items-center justify-center font-medium text-base">
                    {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'S'}
                  </div>
                )}
                <div>
                  <h4 className="text-[15px] font-semibold text-[#121316] tracking-tight">
                    {userProfile?.displayName || 'SANA Companion'}
                  </h4>
                  <p className="text-[12px] text-[#636a75]">
                    {userProfile?.email || 'Account & Settings'}
                  </p>
                </div>
              </div>

              <div className="p-2 rounded-full bg-white shadow-xs text-[#121316]">
                <Icon icon="solar:settings-linear" className="w-5 h-5 text-[#3a3f47]" />
              </div>
            </div>

            {/* Menu Choice Grid / Actions */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  onClose();
                  onOpenScan();
                }}
                className="w-full p-4 rounded-[22px] bg-white border border-[#eef1f5] shadow-xs hover:border-[#d0d5dd] hover:bg-[#f8f9fa] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#f0f4f8] text-[#1a1c1e] group-hover:bg-[#1a1c1e] group-hover:text-white transition-colors">
                    <Icon icon="solar:scanner-linear" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">Facial Skin Scan</p>
                    <p className="text-[12px] text-[#787f8d]">AI analysis for hydration & barrier check</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-[#a0a7b4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenReports();
                }}
                className="w-full p-4 rounded-[22px] bg-white border border-[#eef1f5] shadow-xs hover:border-[#d0d5dd] hover:bg-[#f8f9fa] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#f0f4f8] text-[#1a1c1e] group-hover:bg-[#1a1c1e] group-hover:text-white transition-colors">
                    <Icon icon="solar:chart-square-linear" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">Reports & Skin Metrics</p>
                    <p className="text-[12px] text-[#787f8d]">Track hydration & barrier score trends</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-[#a0a7b4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenRoutine();
                }}
                className="w-full p-4 rounded-[22px] bg-white border border-[#eef1f5] shadow-xs hover:border-[#d0d5dd] hover:bg-[#f8f9fa] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#f0f4f8] text-[#1a1c1e] group-hover:bg-[#1a1c1e] group-hover:text-white transition-colors">
                    <Icon icon="solar:checklist-minimalistic-linear" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">Daily Skincare Regimen</p>
                    <p className="text-[12px] text-[#787f8d]">Custom AM & PM routine steps</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-[#a0a7b4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenVault();
                }}
                className="w-full p-4 rounded-[22px] bg-slate-900 text-white border border-slate-800 shadow-md hover:bg-black transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-white/10 text-white group-hover:bg-emerald-500 transition-colors">
                    <Icon icon="solar:vault-linear" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-white">Sana Agent Vault</p>
                    <p className="text-[12px] text-slate-300">Memory sessions, incidents, version diffs</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  if (onOpenScanHistory) onOpenScanHistory();
                }}
                className="w-full p-4 rounded-[22px] bg-white border border-[#eef1f5] shadow-xs hover:border-[#d0d5dd] hover:bg-[#f8f9fa] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#f0f4f8] text-[#1a1c1e] group-hover:bg-[#1a1c1e] group-hover:text-white transition-colors">
                    <Icon icon="solar:history-bold" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">Scan History & Sessions</p>
                    <p className="text-[12px] text-[#787f8d]">View gallery overlays & AI reports</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-[#a0a7b4] group-hover:translate-x-0.5 transition-transform" />
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="w-full p-4 rounded-[22px] bg-white border border-[#eef1f5] shadow-xs hover:border-[#d0d5dd] hover:bg-[#f8f9fa] transition-all flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-[#f0f4f8] text-[#1a1c1e] group-hover:bg-[#1a1c1e] group-hover:text-white transition-colors">
                    <Icon icon="solar:user-circle-linear" className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-[14px] font-semibold text-[#1a1c1e]">Account & Preferences</p>
                    <p className="text-[12px] text-[#787f8d]">Google Auth, °C/°F, Scan timing</p>
                  </div>
                </div>
                <Icon icon="solar:alt-arrow-right-linear" className="w-5 h-5 text-[#a0a7b4] group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
