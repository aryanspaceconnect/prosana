import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import { UserProfile, UserSettings, PopUpNotification } from '../types';
import { signInWithGoogle, logoutUser, syncUserProfile } from '../lib/firebase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onUpdateSettings: (newSettings: UserSettings) => void;
  onTestTriggerPopup?: (popup: PopUpNotification) => void;
  onRerunOnboarding?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onUpdateSettings,
  onTestTriggerPopup,
  onRerunOnboarding
}) => {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [showLocationSearch, setShowLocationSearch] = useState(false);

  if (!isOpen) return null;

  const currentSettings: UserSettings = userProfile?.settings || {
    temperatureUnit: 'C',
    scanNotificationTime: '00:00',
    scanReminderEnabled: true,
    theme: 'light',
    locationName: '',
    latitude: undefined,
    longitude: undefined
  };

  const handleSearchLocation = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearchingLocation(true);
    try {
      const res = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (e) {
      console.warn("Location search error:", e);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const persistSettings = (updated: UserSettings) => {
    try {
      localStorage.setItem('sana_user_settings_cache', JSON.stringify(updated));
    } catch (e) {
      console.warn("Could not save settings to localStorage:", e);
    }
    onUpdateSettings(updated);
    if (userProfile?.uid) {
      syncUserProfile({ uid: userProfile.uid } as any, updated);
    }
  };

  const handleSelectLocation = (loc: any) => {
    const locName = loc.displayName || `${loc.name}, ${loc.country || ''}`;
    const updated: UserSettings = {
      ...currentSettings,
      locationName: locName,
      latitude: loc.latitude,
      longitude: loc.longitude
    };
    persistSettings(updated);
    setShowLocationSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleCustomLocationSubmit = async () => {
    if (!searchQuery.trim()) return;
    setIsSearchingLocation(true);
    try {
      const res = await fetch(`/api/location/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          handleSelectLocation(data.results[0]);
          return;
        }
      }
    } catch (e) {
      console.warn("Custom location resolve error:", e);
    } finally {
      setIsSearchingLocation(false);
    }

    // Fallback if no geocoding match found: store the custom city name directly
    const updated: UserSettings = {
      ...currentSettings,
      locationName: searchQuery.trim()
    };
    persistSettings(updated);
    setShowLocationSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleDetectGps = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setIsDetectingGps(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        let locName = `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
        try {
          const res = await fetch(`/api/location/reverse?lat=${lat}&lon=${lon}`);
          if (res.ok) {
            const data = await res.json();
            if (data.locationName) locName = data.locationName;
          }
        } catch (e) {
          console.warn("Reverse geocode error:", e);
        }
        const updated: UserSettings = {
          ...currentSettings,
          locationName: locName,
          latitude: lat,
          longitude: lon
        };
        persistSettings(updated);
        setIsDetectingGps(false);
      },
      (err) => {
        console.warn("GPS detection error:", err);
        alert("Could not access GPS location. You can search for your city manually!");
        setIsDetectingGps(false);
      },
      { timeout: 10000 }
    );
  };

  const handleToggleTemp = (unit: 'C' | 'F') => {
    const updated = { ...currentSettings, temperatureUnit: unit };
    persistSettings(updated);
  };

  const handleScanTimeChange = (time: string) => {
    const updated = { ...currentSettings, scanNotificationTime: time };
    persistSettings(updated);
  };

  const handleToggleReminderEnabled = () => {
    const updated = {
      ...currentSettings,
      scanReminderEnabled: currentSettings.scanReminderEnabled === false ? true : false
    };
    persistSettings(updated);
  };

  const handleToggleCompanionSignals = () => {
    const updated = {
      ...currentSettings,
      companionSignalsEnabled: currentSettings.companionSignalsEnabled === false ? true : false
    };
    persistSettings(updated);
  };

  const handleResponseStyleChange = (style: 'professional_medical' | 'casual_conversational' | 'cool_friendly') => {
    const updated = { ...currentSettings, responseStyle: style };
    persistSettings(updated);
  };

  const handleResetScanStatus = () => {
    const updated = {
      ...currentSettings,
      lastCompletedScanDate: ''
    };
    persistSettings(updated);
    alert("Daily scan completion status reset for testing. Re-open app or test trigger pop-up!");
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google Auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await logoutUser();
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-sm max-h-[88vh] rounded-[32px] bg-white border border-white/80 overflow-hidden shadow-2xl p-5 relative flex flex-col"
        >
          {/* Header (Fixed Top) */}
          <div className="flex items-center justify-between shrink-0 pb-3 border-b border-[#f1f5f9] mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-2xl bg-[#1a1c1e] text-white">
                <Icon icon="solar:settings-bold" className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[16px] font-semibold text-[#121316]">Account & Settings</h3>
                <p className="text-[11px] text-[#787f8d]">SANA Personalization</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full text-[#787f8d] hover:bg-[#f0f3f6] transition-colors cursor-pointer"
            >
              <Icon icon="solar:close-circle-linear" className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Modal Content Body */}
          <div className="flex-1 overflow-y-auto no-scrollbar space-y-5 pr-0.5 py-1">
            {/* User Profile Card */}
          <div className="p-4 rounded-[22px] bg-[#f8f9fb] border border-[#eaedf1] flex items-center space-x-3.5">
            {userProfile?.photoURL ? (
              <img
                src={userProfile.photoURL}
                alt="Profile"
                className="w-12 h-12 rounded-full object-cover border border-white shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#1a1c1e] text-white flex items-center justify-center font-bold text-base">
                {userProfile?.displayName ? userProfile.displayName.charAt(0).toUpperCase() : 'G'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-[#121316] truncate">
                {userProfile?.displayName || 'Guest User'}
              </h4>
              <p className="text-[11.5px] text-[#787f8d] truncate">
                {userProfile?.email || 'Anonymous session'}
              </p>
            </div>
          </div>

          {/* Authentication Actions */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Identity & Sync
            </span>

            {userProfile?.isAnonymous || !userProfile ? (
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-white border border-[#d0d5dd] text-[#121316] text-[13.5px] font-semibold hover:bg-[#f8f9fa] transition-colors cursor-pointer shadow-2xs flex items-center justify-center space-x-2.5"
              >
                <Icon icon="flat-color-icons:google" className="w-5 h-5" />
                <span>Sign in with Google</span>
              </button>
            ) : (
              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-[#fef2f2] border border-[#fecaca] text-[#dc2626] text-[13px] font-semibold hover:bg-[#fee2e2] transition-colors cursor-pointer flex items-center justify-center space-x-2"
              >
                <Icon icon="solar:logout-3-linear" className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>

          {/* Skin Profile Onboarding Questionnaire Card */}
          <div className="p-3.5 rounded-2xl bg-[#f0f9ff] border border-[#bae6fd] flex items-center justify-between">
            <div>
              <p className="text-[13px] font-bold text-[#0369a1]">Skin Baseline Onboarding</p>
              <p className="text-[11px] text-[#0284c7]">
                {currentSettings.onboardingCompleted ? 'Completed 4-step skin profile setup' : 'Setup incomplete'}
              </p>
            </div>
            <button
              onClick={() => {
                if (onRerunOnboarding) {
                  onRerunOnboarding();
                  onClose();
                } else {
                  const updated: UserSettings = {
                    ...currentSettings,
                    onboardingCompleted: false
                  };
                  onUpdateSettings(updated);
                  if (userProfile?.uid) {
                    syncUserProfile({ uid: userProfile.uid } as any, updated);
                  }
                  onClose();
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-[#0284c7] text-white text-[11.5px] font-semibold hover:bg-[#0369a1] transition-colors cursor-pointer shadow-2xs flex items-center space-x-1"
            >
              <Icon icon="solar:restart-bold" className="w-3.5 h-3.5" />
              <span>{currentSettings.onboardingCompleted ? 'Re-take Onboarding' : 'Start Onboarding'}</span>
            </button>
          </div>

          {/* Preferences & Environmental Location Settings */}
          <div className="space-y-3 pt-1">
            <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
              Preferences & Location
            </span>

            {/* Weather Station Location Selector */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#121316]">Environmental Location</p>
                  <p className="text-[11px] text-[#787f8d]">Weather & UV Exposome station</p>
                </div>
                <button
                  onClick={handleDetectGps}
                  disabled={isDetectingGps}
                  className="px-2.5 py-1 rounded-xl bg-sky-50 border border-sky-200 text-[#0284c7] text-[11px] font-semibold hover:bg-sky-100 transition-colors cursor-pointer flex items-center space-x-1"
                >
                  <Icon icon={isDetectingGps ? "solar:restart-bold-duotone" : "solar:gps-bold"} className={`w-3.5 h-3.5 ${isDetectingGps ? 'animate-spin' : ''}`} />
                  <span>{isDetectingGps ? 'Locating...' : 'GPS Detect'}</span>
                </button>
              </div>

              {/* Current Active Location display */}
              <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#e2e8f0]">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="p-1.5 rounded-lg bg-[#0284c7]/10 text-[#0284c7]">
                    <Icon icon="solar:map-point-bold-duotone" className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-[#121316] truncate">
                      {currentSettings.locationName || 'Location not set'}
                    </p>
                    {currentSettings.latitude != null && currentSettings.longitude != null && (
                      <p className="text-[10px] text-[#94a3b8]">
                        Lat: {currentSettings.latitude.toFixed(2)}, Lon: {currentSettings.longitude.toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => setShowLocationSearch(!showLocationSearch)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#475569] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                >
                  {showLocationSearch ? 'Close' : 'Change'}
                </button>
              </div>

              {/* Location Search Dropdown */}
              {showLocationSearch && (
                <div className="p-2.5 rounded-xl bg-white border border-[#cbd5e1] space-y-2 mt-2 shadow-xs">
                  <div className="relative flex items-center space-x-1.5">
                    <div className="relative flex-1 flex items-center">
                      <Icon icon="solar:magnifer-linear" className="w-4 h-4 text-[#94a3b8] absolute left-2.5" />
                      <input
                        type="text"
                        placeholder="Search city e.g. London, Tokyo, Mumbai..."
                        value={searchQuery}
                        onChange={(e) => handleSearchLocation(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCustomLocationSubmit();
                          }
                        }}
                        className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e2e8f0] text-[12px] text-[#121316] focus:outline-none focus:border-[#0284c7]"
                      />
                    </div>
                    {searchQuery.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={handleCustomLocationSubmit}
                        disabled={isSearchingLocation}
                        className="px-2.5 py-1.5 rounded-lg bg-[#0284c7] text-white text-[11px] font-semibold hover:bg-[#0369a1] transition-colors cursor-pointer shrink-0"
                      >
                        Set
                      </button>
                    )}
                  </div>

                  {isSearchingLocation && (
                    <p className="text-[11px] text-[#94a3b8] px-1 py-1">Locating city coordinates...</p>
                  )}

                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1 pt-1 border-t border-[#f1f5f9]">
                      {searchResults.map((loc, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectLocation(loc)}
                          className="w-full text-left p-2 rounded-lg hover:bg-[#f8fafc] text-[12px] transition-colors cursor-pointer flex flex-col"
                        >
                          <span className="font-semibold text-[#121316]">{loc.displayName}</span>
                          <span className="text-[10px] text-[#94a3b8]">
                            Lat: {loc.latitude.toFixed(2)}, Lon: {loc.longitude.toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Temperature Unit */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] flex items-center justify-between">
              <div>
                <p className="text-[13px] font-semibold text-[#121316]">Temperature Unit</p>
                <p className="text-[11px] text-[#787f8d]">Weather forecast display</p>
              </div>

              <div className="flex items-center p-1 rounded-xl bg-[#e2e8f0]">
                <button
                  onClick={() => handleToggleTemp('C')}
                  className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                    currentSettings.temperatureUnit === 'C' ? 'bg-white text-[#121316] shadow-2xs' : 'text-[#64748b]'
                  }`}
                >
                  °C
                </button>
                <button
                  onClick={() => handleToggleTemp('F')}
                  className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition-all cursor-pointer ${
                    currentSettings.temperatureUnit === 'F' ? 'bg-white text-[#121316] shadow-2xs' : 'text-[#64748b]'
                  }`}
                >
                  °F
                </button>
              </div>
            </div>

            {/* SANA Agent Response Style Preference */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-2">
              <div>
                <p className="text-[13px] font-semibold text-[#121316]">Agent Persona & Response Style</p>
                <p className="text-[11px] text-[#787f8d]">Tone used during scan reports & chat</p>
              </div>

              <select
                value={currentSettings.responseStyle || 'professional_medical'}
                onChange={(e) => handleResponseStyleChange(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#d0d5dd] text-[12px] font-semibold text-[#121316] focus:outline-none"
              >
                <option value="professional_medical">Clinical Dermatologist (Highly Professional)</option>
                <option value="casual_conversational">Conversational Companion (Warm & Approachable)</option>
                <option value="cool_friendly">Wellness Coach (Cool, Empathetic & Modern)</option>
              </select>
            </div>

            {/* Daily Companion Signals Toggle */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#121316]">Daily Companion Signals</p>
                  <p className="text-[11px] text-[#787f8d]">Warm home screen signals based on live weather & goals</p>
                </div>

                <button
                  onClick={handleToggleCompanionSignals}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    currentSettings.companionSignalsEnabled !== false ? 'bg-[#121316]' : 'bg-[#cbd5e1]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      currentSettings.companionSignalsEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Notification Time & Daily Scan Setting */}
            <div className="p-3.5 rounded-2xl bg-[#f8f9fb] border border-[#eaedf1] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-[#121316]">Daily Scan Reminder</p>
                  <p className="text-[11px] text-[#787f8d]">Pop-up check-in after set time</p>
                </div>

                <button
                  onClick={handleToggleReminderEnabled}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                    currentSettings.scanReminderEnabled !== false ? 'bg-[#121316]' : 'bg-[#cbd5e1]'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      currentSettings.scanReminderEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#eaedf1]">
                <span className="text-[12px] font-medium text-[#475569]">Check-in Time</span>
                <select
                  value={currentSettings.scanNotificationTime}
                  onChange={(e) => handleScanTimeChange(e.target.value)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-[#d0d5dd] text-[12px] font-semibold text-[#121316] focus:outline-none"
                >
                  <option value="00:00">12:00 AM (Midnight Daily)</option>
                  <option value="06:00">6:00 AM (Morning)</option>
                  <option value="09:00">9:00 AM (Routine Time)</option>
                  <option value="12:00">12:00 PM (Noon Check)</option>
                  <option value="18:00">6:00 PM (Evening)</option>
                </select>
              </div>
            </div>

            {/* Backdoor / Developer Test Triggers */}
            <div className="space-y-2 pt-2 border-t border-[#eaedf1]">
              <span className="text-[11px] font-semibold uppercase text-[#8e95a2] tracking-wider block">
                Pop-Up Card Backdoor & Testing
              </span>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (onTestTriggerPopup) {
                      onTestTriggerPopup({
                        id: `scan_popup_${Date.now()}`,
                        type: 'facial_scan',
                        title: 'Daily Facial Scan Due',
                        subtitle: 'Complete your morning AI skin feature analysis.',
                        timeAgo: '12:00 AM',
                        actionText: 'Start Daily Scan',
                        iconType: 'scan',
                        badgeText: 'DAILY FACIAL SCAN'
                      });
                      onClose();
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-[#f0f4f8] border border-[#d0dbe5] text-[11.5px] font-semibold text-[#121316] hover:bg-[#121316] hover:text-white transition-colors cursor-pointer text-left flex flex-col justify-between space-y-1"
                >
                  <div className="flex items-center space-x-1.5">
                    <Icon icon="solar:scanner-bold" className="w-4 h-4 text-emerald-600" />
                    <span>Test Facial Scan</span>
                  </div>
                  <span className="text-[10px] opacity-75">Dockable pop-up</span>
                </button>

                <button
                  onClick={() => {
                    if (onTestTriggerPopup) {
                      onTestTriggerPopup({
                        id: `agent_popup_${Date.now()}`,
                        type: 'custom_action',
                        title: 'Skin Barrier Alert',
                        subtitle: 'Low humidity detected. Apply ceramide barrier cream.',
                        timeAgo: 'Just now',
                        actionText: 'Apply Routine',
                        iconType: 'shield',
                        badgeText: 'SANA AGENT ALERT'
                      });
                      onClose();
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-[#f0f4f8] border border-[#d0dbe5] text-[11.5px] font-semibold text-[#121316] hover:bg-[#121316] hover:text-white transition-colors cursor-pointer text-left flex flex-col justify-between space-y-1"
                >
                  <div className="flex items-center space-x-1.5">
                    <Icon icon="solar:shield-warning-bold-duotone" className="w-4 h-4 text-sky-600" />
                    <span>Test Agent Alert</span>
                  </div>
                  <span className="text-[10px] opacity-75">10-30 char title</span>
                </button>
              </div>

              <button
                onClick={handleResetScanStatus}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#475569] text-[11px] font-medium transition-colors cursor-pointer"
              >
                Reset Daily Scan Completion Status
              </button>
            </div>
          </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
