import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile } from '../types';

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
  if (!isOpen) return null;

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
                <h3 className="text-[16px] font-semibold text-[#121316]">Health & Wellness Reports</h3>
                <p className="text-[11px] text-[#787f8d]">prosana Intelligence & Summaries</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-[#787f8d] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
            </button>
          </div>

          {/* Health Summary Card */}
          <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748b]">Companion Status</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Active</span>
            </div>
            <p className="text-[12.5px] text-[#334155] leading-relaxed">
              prosana continuously analyzes your daily environment, routines, and wellness check-ins to provide tailored health guidance.
            </p>
          </div>

          {/* Quick Insights List */}
          <div className="space-y-2.5 flex-1 overflow-y-auto">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Recent Consultations & Check-ins
            </span>

            <div className="p-4 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] text-center space-y-2">
              <Icon icon="solar:notes-minimalistic-linear" className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-[12.5px] font-medium text-[#475569]">All check-in history is current</p>
              <p className="text-[11px] text-[#787f8d]">Start a conversation with prosana to generate fresh personalized health summaries.</p>
            </div>
          </div>

          {/* Open Chat CTA */}
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('prosana:open_chat_session', { detail: {} }));
              onClose();
            }}
            className="w-full py-3 rounded-2xl bg-[#121316] hover:bg-slate-800 text-white text-[13px] font-semibold transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Icon icon="solar:chat-round-dots-bold" className="w-4 h-4 text-amber-400" />
            <span>Open prosana Chat →</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

