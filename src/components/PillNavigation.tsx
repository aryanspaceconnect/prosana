import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { NavigationTab, UserProfile } from '../types';
import { SanaAgentLogoIcon } from './SanaAgentLogoIcon';

const DynamicCalendarIcon: React.FC<{ isActive?: boolean }> = ({ isActive = false }) => {
  const dateNumber = new Date().getDate(); // Current date 1-31
  const color = isActive ? "#ffffff" : "#616874";

  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="transition-transform duration-300 shrink-0"
    >
      {/* Calendar Card Outer Border */}
      <rect
        x="3"
        y="4"
        width="18"
        height="17"
        rx="4.5"
        stroke={color}
        strokeWidth="1.8"
      />
      {/* Top Divider Header Line */}
      <line
        x1="3"
        y1="8.5"
        x2="21"
        y2="8.5"
        stroke={color}
        strokeWidth="1.5"
      />
      {/* Binder Loops */}
      <line
        x1="7.5"
        y1="2"
        x2="7.5"
        y2="4.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="16.5"
        y1="2"
        x2="16.5"
        y2="4.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Dynamic Date Text */}
      <text
        x="12"
        y="15.8"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={dateNumber > 9 ? "9.5" : "10.5"}
        fontWeight="800"
        fill={color}
        fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif"
        letterSpacing="-0.02em"
      >
        {dateNumber}
      </text>
    </svg>
  );
};

interface PillNavigationProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
  onSwipeUpExpand?: () => void;
  isMinimized?: boolean;
  onRestorePill?: () => void;
  userProfile?: UserProfile | null;
  onOpenScan?: () => void;
  onOpenSettings?: () => void;
  onOpenReports?: () => void;
  onOpenVault?: () => void;
  onOpenScanHistory?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  onThemeChange?: (theme: 'light' | 'dark' | 'auto') => void;
}

export const PillNavigation: React.FC<PillNavigationProps> = ({
  activeTab,
  onTabChange,
  isMinimized = false,
  onRestorePill,
  userProfile,
  onOpenVault,
  onOpenScanHistory,
  onOpenSettings,
  theme = 'light',
  onThemeChange
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedView, setExpandedView] = useState<'main' | 'connect'>('main');
  const [activeTheme, setActiveTheme] = useState<'light' | 'dark' | 'auto'>(theme);

  const handleThemeSelect = (newTheme: 'light' | 'dark' | 'auto') => {
    setActiveTheme(newTheme);
    if (onThemeChange) {
      onThemeChange(newTheme);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center items-end pb-5 pt-3 pointer-events-none">
      {/* Backdrop overlay when menu is expanded */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setIsExpanded(false);
              setExpandedView('main');
            }}
            className="fixed inset-0 bg-slate-950/15 backdrop-blur-xs z-40 pointer-events-auto"
          />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {isMinimized ? (
          /* Minimized subtle drag handle */
          <motion.button
            key="minimized-bar"
            initial={{ opacity: 0, y: 12, scale: 0.85 }}
            animate={{ opacity: 0.75, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.85 }}
            whileHover={{ opacity: 1, scale: 1.1, width: '4rem' }}
            whileTap={{ scale: 0.95 }}
            onClick={onRestorePill}
            className="pointer-events-auto h-1.5 w-12 rounded-full bg-[#1a1c1e]/35 backdrop-blur-md shadow-xs transition-all duration-300 hover:bg-[#1a1c1e]/75 flex items-center justify-center cursor-pointer mb-2.5 group relative z-50"
            title="Tap to restore menu"
          >
            <span className="absolute -top-6 text-[10px] font-medium text-slate-500 bg-white/90 px-2 py-0.5 rounded-full shadow-2xs border border-slate-200/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
              Menu
            </span>
          </motion.button>
        ) : (
          /* Fluid Morphing Navigation Container */
          <motion.div
            key="pill-container"
            layout
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 30,
              mass: 0.8
            }}
            className={`pointer-events-auto relative overflow-hidden transition-colors duration-300 z-50 ${
              isExpanded
                ? 'w-[320px] rounded-[28px] bg-white text-slate-900 border border-slate-200/90 shadow-[0_20px_50px_rgba(0,0,0,0.16)] p-3.5'
                : 'rounded-[22px] bg-white/90 backdrop-blur-2xl text-slate-900 border border-slate-200/80 shadow-[0_12px_32px_rgba(0,0,0,0.12)] px-2.5 py-1.5'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!isExpanded ? (
                /* Compact Horizontal Pill Bar */
                <motion.div
                  key="compact-pill"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center space-x-1"
                >
                  {/* 1. Home */}
                  <button
                    onClick={() => {
                      onTabChange('home');
                      setIsExpanded(false);
                    }}
                    className={`p-2.5 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                      activeTab === 'home'
                        ? 'bg-[#1a1c1e] text-white shadow-xs'
                        : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
                    }`}
                    title="Home"
                  >
                    <Icon
                      icon={activeTab === 'home' ? "solar:home-smile-bold" : "solar:home-smile-angle-linear"}
                      className="w-5 h-5"
                    />
                  </button>

                  {/* 2. prosana Companion */}
                  <button
                    onClick={() => {
                      onTabChange('agent');
                      setIsExpanded(false);
                    }}
                    className={`p-2.5 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                      activeTab === 'agent'
                        ? 'bg-[#1a1c1e] text-white shadow-xs'
                        : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
                    }`}
                    title="prosana Companion"
                  >
                    <SanaAgentLogoIcon size={19} color={activeTab === 'agent' ? '#ffffff' : '#616874'} />
                  </button>

                  {/* 3. Calendar */}
                  <button
                    onClick={() => {
                      onTabChange('calendar');
                      setIsExpanded(false);
                    }}
                    className={`p-2.5 rounded-2xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                      activeTab === 'calendar'
                        ? 'bg-[#1a1c1e] text-white shadow-xs'
                        : 'text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7]'
                    }`}
                    title="Calendar"
                  >
                    <DynamicCalendarIcon isActive={activeTab === 'calendar'} />
                  </button>

                  {/* 4. Menu Expansion Button */}
                  <button
                    onClick={() => {
                      setIsExpanded(true);
                      setExpandedView('main');
                    }}
                    className="p-2.5 rounded-2xl flex items-center justify-center text-[#616874] hover:text-[#1a1c1e] hover:bg-[#f2f4f7] transition-all duration-200 cursor-pointer"
                    title="Menu & Settings"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform duration-300"
                    >
                      <path d="M18 15l-6-6-6 6" />
                      <path d="M18 9l-6-6-6 6" />
                    </svg>
                  </button>
                </motion.div>
              ) : (
                /* Expanded Card Content */
                <motion.div
                  key="expanded-menu"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.18 }}
                  className="w-full space-y-3"
                >
                  {/* Top Row: Theme Segmented Switch */}
                  <div className="flex items-center justify-between p-1 bg-[#f2f4f7] rounded-2xl border border-slate-200/60 relative">
                    {(['dark', 'light', 'auto'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => handleThemeSelect(t)}
                        className={`relative flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold capitalize flex items-center justify-center space-x-1.5 transition-colors z-10 cursor-pointer ${
                          activeTheme === t ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {activeTheme === t && (
                          <motion.div
                            layoutId="active-theme-pill"
                            transition={{ type: "spring", stiffness: 450, damping: 32 }}
                            className="absolute inset-0 bg-white rounded-xl shadow-xs border border-slate-200/50 -z-10"
                          />
                        )}
                        <Icon
                          icon={
                            t === 'dark'
                              ? 'solar:moon-bold'
                              : t === 'light'
                              ? 'solar:sun-bold'
                              : 'solar:half-moon-bold'
                          }
                          className="w-3.5 h-3.5"
                        />
                        <span>{t}</span>
                      </button>
                    ))}
                  </div>

                  {/* Inner Views: Main vs Connect Submenu */}
                  <AnimatePresence mode="wait">
                    {expandedView === 'main' ? (
                      <motion.div
                        key="view-main"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -12 }}
                        transition={{ duration: 0.16 }}
                        className="space-y-0.5"
                      >
                        {/* More (Moved to top, renamed from Connect, updated icon) */}
                        <button
                          onClick={() => setExpandedView('connect')}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <div className="flex items-center space-x-3">
                            <Icon icon="solar:menu-dots-circle-linear" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                            <span>More</span>
                          </div>
                          <Icon icon="solar:alt-arrow-right-linear" className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                        </button>

                        {/* Settings */}
                        <button
                          onClick={() => {
                            if (onOpenSettings) onOpenSettings();
                            setIsExpanded(false);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="solar:settings-linear" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                          <span className="flex-1">Settings</span>
                        </button>

                        {/* Vault */}
                        <button
                          onClick={() => {
                            if (onOpenVault) onOpenVault();
                            setIsExpanded(false);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="solar:safe-square-linear" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                          <span className="flex-1">Vault</span>
                        </button>

                        {/* User Profile */}
                        <button
                          onClick={() => {
                            if (onOpenSettings) onOpenSettings();
                            setIsExpanded(false);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center justify-between text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            {userProfile?.photoURL ? (
                              <img
                                src={userProfile.photoURL}
                                alt={userProfile.displayName || "User"}
                                className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-[#121316] text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                {userProfile?.preferredName
                                  ? userProfile.preferredName.charAt(0).toUpperCase()
                                  : userProfile?.displayName
                                  ? userProfile.displayName.charAt(0).toUpperCase()
                                  : 'M'}
                              </div>
                            )}
                            <span className="truncate flex-1">
                              {userProfile?.preferredName ||
                                (userProfile?.displayName ? userProfile.displayName.split(' ')[0] : 'Marcy')}
                            </span>
                          </div>
                          <Icon icon="solar:alt-arrow-right-linear" className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2" />
                        </button>
                      </motion.div>
                    ) : (
                      /* Connect Submenu View */
                      <motion.div
                        key="view-connect"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.16 }}
                        className="space-y-0.5"
                      >
                        {/* Back Button */}
                        <button
                          onClick={() => setExpandedView('main')}
                          className="w-full px-3.5 py-2 rounded-2xl flex items-center space-x-2 text-slate-700 hover:bg-[#f4f6f9] transition-all cursor-pointer font-semibold text-xs text-left mb-1"
                        >
                          <Icon icon="solar:alt-arrow-left-linear" className="w-4 h-4" />
                          <span>Back</span>
                        </button>

                        {/* Twitter / X */}
                        <a
                          href="https://x.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsExpanded(false)}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="ri:twitter-x-fill" className="w-4 h-4 text-slate-700 ml-0.5" />
                          <span className="flex-1">Twitter / X</span>
                        </a>

                        {/* Cosmos / Vault */}
                        <button
                          onClick={() => {
                            if (onOpenVault) onOpenVault();
                            setIsExpanded(false);
                          }}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="solar:planet-bold" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                          <span className="flex-1">Cosmos</span>
                        </button>

                        {/* LinkedIn */}
                        <a
                          href="https://linkedin.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setIsExpanded(false)}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="ri:linkedin-fill" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                          <span className="flex-1">LinkedIn</span>
                        </a>

                        {/* Email */}
                        <a
                          href="mailto:support@prosana.app"
                          onClick={() => setIsExpanded(false)}
                          className="w-full px-3.5 py-2.5 rounded-2xl flex items-center space-x-3 text-slate-800 hover:bg-[#f4f6f9] transition-all cursor-pointer font-medium text-sm text-left group"
                        >
                          <Icon icon="solar:letter-linear" className="w-5 h-5 text-slate-600 group-hover:text-slate-900" />
                          <span className="flex-1">Email</span>
                        </a>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

