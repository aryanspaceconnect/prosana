import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { PopUpNotification } from '../types';

interface PopUpNotificationCardProps {
  notification: PopUpNotification | null;
  onDismiss: () => void;
  onAction: (notification: PopUpNotification) => void;
}

export const PopUpNotificationCard: React.FC<PopUpNotificationCardProps> = ({
  notification,
  onDismiss,
  onAction
}) => {
  const [isDocking, setIsDocking] = useState(false);

  if (!notification) return null;

  const handleStartDismiss = () => {
    setIsDocking(true);
  };

  const renderIcon = (type?: string) => {
    switch (type) {
      case 'scan':
        return <Icon icon="solar:scanner-bold" className="w-5 h-5 text-emerald-600" />;
      case 'sun':
        return <Icon icon="solar:sun-bold-duotone" className="w-5 h-5 text-amber-500" />;
      case 'sparkle':
        return <Icon icon="solar:atom-bold-duotone" className="w-5 h-5 text-indigo-500" />;
      case 'shield':
        return <Icon icon="solar:shield-warning-bold-duotone" className="w-5 h-5 text-sky-500" />;
      case 'droplet':
        return <Icon icon="solar:droplet-bold-duotone" className="w-5 h-5 text-cyan-500" />;
      case 'clock':
        return <Icon icon="solar:clock-circle-bold-duotone" className="w-5 h-5 text-indigo-500" />;
      case 'alert':
      default:
        return <Icon icon="solar:danger-bold-duotone" className="w-5 h-5 text-rose-500" />;
    }
  };

  return (
    <AnimatePresence
      onExitComplete={() => {
        setIsDocking(false);
      }}
    >
      <div className="fixed bottom-[92px] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
        <motion.div
          key={notification.id}
          initial={{ opacity: 0, y: 24, scale: 0.9, width: '380px' }}
          animate={
            isDocking
              ? {
                  opacity: 0,
                  y: 68,
                  width: '270px',
                  height: '48px',
                  scale: 0.88,
                  borderRadius: '26px'
                }
              : {
                  opacity: 1,
                  y: 0,
                  width: '380px',
                  height: 'auto',
                  scale: 1,
                  borderRadius: '28px'
                }
          }
          exit={{
            opacity: 0,
            y: 68,
            width: '270px',
            height: '48px',
            scale: 0.88,
            borderRadius: '26px'
          }}
          transition={{
            type: 'spring',
            stiffness: 380,
            damping: 28,
            mass: 0.8
          }}
          onAnimationComplete={() => {
            if (isDocking) {
              onDismiss();
            }
          }}
          drag="y"
          dragConstraints={{ top: -10, bottom: 120 }}
          dragElastic={0.2}
          onDragEnd={(_e, info) => {
            if (info.offset.y > 35 || info.velocity.y > 150) {
              handleStartDismiss();
            }
          }}
          className="pointer-events-auto relative overflow-hidden bg-white/98 backdrop-blur-2xl border border-slate-200/90 shadow-[0_22px_60px_rgba(0,0,0,0.15),0_0_24px_rgba(16,185,129,0.12)] p-4.5 flex flex-col justify-between select-none cursor-grab active:cursor-grabbing rounded-[28px]"
        >
          {/* Top Header Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#475569]">
                {notification.badgeText || (notification.type === 'facial_scan' ? 'DAILY CHECK-IN' : 'prosana REMINDER')}
              </span>
            </div>

            <div className="flex items-center space-x-1">
              <span className="text-[10px] font-semibold text-[#64748b] bg-[#f1f5f9] px-2.5 py-0.5 rounded-full border border-slate-200/60">
                {notification.timeAgo}
              </span>
            </div>
          </div>

          {/* Main Body Info */}
          <div
            onClick={() => onAction(notification)}
            className="flex items-start space-x-3.5 my-1.5 group cursor-pointer"
          >
            {/* Custom Icon Box */}
            <div className="w-10.5 h-10.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
              {renderIcon(notification.iconType)}
            </div>

            <div className="flex-1 min-w-0 text-left">
              <h4 className="text-[14.5px] font-bold text-[#121316] tracking-tight leading-snug line-clamp-1">
                {notification.title}
              </h4>
              <p className="text-[12px] text-[#5e6573] line-clamp-2 mt-0.5 leading-relaxed">
                {notification.subtitle}
              </p>
            </div>
          </div>

          {/* Action Footer Button */}
          <div className="mt-3 pt-2.5 border-t border-[#f0f3f6] flex items-center justify-between">
            <span className="text-[10px] text-[#94a3b8] font-medium italic">
              Swipe down to dock into bar
            </span>

            <button
              onClick={() => onAction(notification)}
              className="px-4.5 py-2.2 rounded-2xl bg-[#121316] text-white text-[12.5px] font-bold hover:bg-black active:scale-95 transition-all shadow-md flex items-center space-x-1.5 cursor-pointer"
            >
              <span>{notification.actionText || 'Start Routine'}</span>
              <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5 text-white/90" />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
