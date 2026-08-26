import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, syncUserProfile, getUserProfileFromFirestore } from './lib/firebase';
import { getStoredGuestId, initializeGuestTrialUser } from './lib/guestTrial';
import { NavigationTab, UserProfile, UserSettings, DailyBriefing, PopUpNotification } from './types';

// Components
import { Header } from './components/Header';
import { PillNavigation } from './components/PillNavigation';
import { ExtendedMenuDrawer } from './components/ExtendedMenuDrawer';
import { PopUpNotificationCard } from './components/PopUpNotificationCard';
import { HomeDashboard } from './components/HomeDashboard';
import { AIAgentChat } from './components/AIAgentChat';
import { CalendarModal } from './components/CalendarModal';
import { SettingsModal } from './components/SettingsModal';
import { ReportsModal } from './components/ReportsModal';
import { SanaVaultModal } from './components/SanaVaultModal';
import { AuthScreen } from './components/AuthScreen';
import { SanaLogoIcon } from './components/SanaLogoIcon';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authInitializing, setAuthInitializing] = useState(true);
  const [isNavMinimized, setIsNavMinimized] = useState(false);
  const [isExtendedMenuOpen, setIsExtendedMenuOpen] = useState(false);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);
  const [isVaultOpen, setIsVaultOpen] = useState(false);

  // Daily Data
  const [dailyBrief, setDailyBrief] = useState<DailyBriefing>({
    greeting: 'Welcome back',
    temperature: '23°C',
    weatherCondition: 'Partly Sunny',
    uvIndex: 6,
    uvLevel: 'Moderate High',
    humidity: '58%',
    waterTargetLiters: '2.4L',
    primaryReminders: [
      'Daily wellness check-in',
      'Hydration target: 2.4L',
      'Evening health routine check at 9:00 PM'
    ]
  });

  // Pop-up Notification State (starts null so no hardcoded popups appear)
  const [notification, setNotification] = useState<PopUpNotification | null>(null);

  // Listen for custom trigger events from agent / approval cards
  useEffect(() => {
    const handleOpenChatSession = () => setActiveTab('agent');

    window.addEventListener('prosana:open_chat_session', handleOpenChatSession);
    window.addEventListener('sana:open_chat_session', handleOpenChatSession);

    return () => {
      window.removeEventListener('prosana:open_chat_session', handleOpenChatSession);
      window.removeEventListener('sana:open_chat_session', handleOpenChatSession);
    };
  }, []);

  // Listen to Firebase Auth - Load Persisted User Profile & Settings from Firestore
  useEffect(() => {
    let isMounted = true;
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setAuthInitializing(false);
      }
    }, 2500);

    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      try {
        if (user) {
          // Fetch persisted settings directly from Firestore database
          let dbUserData: any = null;
          try {
            dbUserData = await getUserProfileFromFirestore(user.uid);
          } catch (e) {
            console.warn("Could not fetch user profile from firestore:", e);
          }
          const dbSettings = dbUserData?.settings || {};

          let localCacheSettings: any = {};
          try {
            const rawCache = localStorage.getItem('prosana_user_settings_cache') || localStorage.getItem('sana_user_settings_cache');
            if (rawCache) localCacheSettings = JSON.parse(rawCache);
          } catch (cacheErr) {
            console.warn("Could not read local settings cache:", cacheErr);
          }

          const resolvedLocationName = dbSettings.locationName || dbUserData?.locationName || localCacheSettings.locationName || '';
          const resolvedLat = dbSettings.latitude ?? dbUserData?.latitude ?? localCacheSettings.latitude;
          const resolvedLon = dbSettings.longitude ?? dbUserData?.longitude ?? localCacheSettings.longitude;

          const mergedSettings: UserSettings = {
            temperatureUnit: 'C',
            scanNotificationTime: '09:00',
            scanReminderEnabled: true,
            theme: 'light',
            ...localCacheSettings,
            ...dbSettings,
            locationName: resolvedLocationName,
            latitude: resolvedLat,
            longitude: resolvedLon
          };

          const profile: UserProfile = {
            uid: user.uid,
            displayName: dbUserData?.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'prosana User'),
            email: dbUserData?.email || user.email || 'guest@prosana.app',
            photoURL: dbUserData?.photoURL || user.photoURL || undefined,
            isAnonymous: user.isAnonymous,
            locationName: resolvedLocationName,
            preferredName: dbUserData?.preferredName || mergedSettings.preferredName,
            settings: mergedSettings
          };
          if (isMounted) {
            setUserProfile(profile);
          }

          try {
            await syncUserProfile(user, profile.settings);
          } catch (e) {
            console.warn("Could not sync user profile:", e);
          }
        } else {
          if (isMounted) {
            const storedGuestId = getStoredGuestId();
            if (storedGuestId) {
              try {
                const guestProfile = await initializeGuestTrialUser();
                if (isMounted) {
                  setUserProfile(guestProfile);
                }
              } catch (guestErr) {
                console.warn("Could not restore guest trial user:", guestErr);
                if (isMounted) {
                  setUserProfile(null);
                }
              }
            } else {
              setUserProfile(null);
            }
          }
        }
      } catch (err) {
        console.error("Auth state handler error:", err);
      } finally {
        if (isMounted) {
          setAuthInitializing(false);
          clearTimeout(safetyTimer);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  }, []);

  // Dynamic browser coords & client location acquisition with local storage caching
  const [appBrowserCoords, setAppBrowserCoords] = useState<{ lat?: number; lon?: number; locationName?: string }>(() => {
    try {
      const cached = localStorage.getItem('prosana_cached_location') || localStorage.getItem('sana_cached_location');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (typeof parsed.lat === 'number' && typeof parsed.lon === 'number') {
          return { lat: parsed.lat, lon: parsed.lon, locationName: parsed.locationName };
        }
      }
    } catch {
      // Ignore cache parse error
    }
    return {};
  });

  useEffect(() => {
    if (userProfile?.settings?.latitude != null) return;

    let isMounted = true;

    const saveLocationCache = (lat: number, lon: number, locationName?: string) => {
      try {
        localStorage.setItem('prosana_cached_location', JSON.stringify({
          lat,
          lon,
          locationName,
          timestamp: Date.now()
        }));
      } catch {
        // Ignore quota error
      }
    };

    // Helper: try IP Geolocation lookup if browser GPS fails or is blocked
    const tryIpGeolocation = async () => {
      try {
        const res = await fetch('https://freeipapi.com/api/json');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (typeof data.latitude === 'number' && typeof data.longitude === 'number' && !isNaN(data.latitude)) {
            const locLabel = [data.cityName, data.regionName, data.countryName].filter(Boolean).join(', ');
            setAppBrowserCoords({
              lat: data.latitude,
              lon: data.longitude,
              locationName: locLabel
            });
            saveLocationCache(data.latitude, data.longitude, locLabel);
          }
        }
      } catch (err) {
        console.warn("Client IP Geolocation fallback failed:", err);
      }
    };

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          setAppBrowserCoords({ lat, lon });
          saveLocationCache(lat, lon);
        },
        () => {
          // GPS failed or denied in iframe -> Fallback to IP Geolocation
          if (isMounted) tryIpGeolocation();
        },
        { timeout: 5000, maximumAge: 300000 }
      );
    } else {
      tryIpGeolocation();
    }

    return () => {
      isMounted = false;
    };
  }, [userProfile?.settings?.latitude]);

  // Fetch Daily Brief from Server Endpoint
  useEffect(() => {
    const fetchDailyBrief = async () => {
      try {
        const res = await fetch('/api/daily-brief', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            temperatureUnit: userProfile?.settings?.temperatureUnit || 'C',
            latitude: userProfile?.settings?.latitude ?? appBrowserCoords.lat,
            longitude: userProfile?.settings?.longitude ?? appBrowserCoords.lon,
            locationName: userProfile?.settings?.locationName || appBrowserCoords.locationName || ''
          })
        });
        if (res.ok) {
          const data = await res.json();
          setDailyBrief(data);
        }
      } catch (err) {
        console.warn("Daily brief fetch error:", err);
      }
    };

    fetchDailyBrief();
  }, [
    userProfile?.settings?.temperatureUnit,
    userProfile?.settings?.latitude,
    userProfile?.settings?.longitude,
    userProfile?.settings?.locationName,
    appBrowserCoords.lat,
    appBrowserCoords.lon,
    appBrowserCoords.locationName
  ]);

  // Daily Health Check-in Pop-Up Trigger Logic
  useEffect(() => {
    if (!userProfile) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const settings: UserSettings = userProfile.settings || {
      temperatureUnit: 'C',
      scanNotificationTime: '09:00',
      scanReminderEnabled: true,
      theme: 'light'
    };
    const reminderEnabled = settings.scanReminderEnabled !== false;
    const lastCompleted = settings.lastCompletedScanDate;

    // 1. If today's check-in was already completed, don't show reminder popup
    if (lastCompleted === todayStr) {
      setNotification(prev => (prev?.type === 'facial_scan' || prev?.type === 'agent_approval' ? null : prev));
      return;
    }

    // 2. Check session dismissal
    const sessionDismissed = sessionStorage.getItem(`prosana_popup_dismissed_${todayStr}`) || sessionStorage.getItem(`sana_popup_dismissed_${todayStr}`);
    if (sessionDismissed === 'true') {
      return;
    }

    if (reminderEnabled) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const targetTimeStr = settings.scanNotificationTime || '09:00';
      const [targetH, targetM] = targetTimeStr.split(':').map(Number);
      const targetMinutes = (targetH || 0) * 60 + (targetM || 0);

      if (currentMinutes >= targetMinutes) {
        setNotification({
          id: `daily_checkin_${todayStr}`,
          type: 'agent_approval',
          title: 'Daily Health Check-in',
          subtitle: 'Take a moment with prosana to log your wellness progress & review your daily routine.',
          timeAgo: targetTimeStr === '00:00' ? '12:00 AM' : `${targetTimeStr} Check`,
          actionText: 'Start Check-in',
          iconType: 'sparkles',
          badgeText: 'DAILY CHECK-IN',
          actionTarget: 'agent',
          autoTriggered: true
        });
      }
    }
  }, [
    userProfile?.settings?.scanReminderEnabled,
    userProfile?.settings?.scanNotificationTime,
    userProfile?.settings?.lastCompletedScanDate,
    userProfile?.uid
  ]);

  const handleUpdateSettings = async (newSettings: UserSettings) => {
    if (userProfile) {
      try {
        localStorage.setItem('prosana_user_settings_cache', JSON.stringify(newSettings));
      } catch (cacheErr) {
        console.warn("Could not cache settings to localStorage:", cacheErr);
      }

      const updatedProfile = {
        ...userProfile,
        locationName: newSettings.locationName || userProfile.locationName,
        settings: newSettings
      };
      setUserProfile(updatedProfile);
      // Save directly to Firestore database so refresh preserves this state
      await syncUserProfile({ uid: userProfile.uid }, newSettings);
    }
  };

  if (authInitializing) {
    return (
      <div className="w-full h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-3 animate-pulse">
          <SanaLogoIcon size={38} color="#121316" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[#121316] lowercase">prosana</h2>
        <p className="text-xs text-slate-400 mt-1">Initializing health companion intelligence...</p>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <AuthScreen
        onAuthSuccess={(profile) => {
          setUserProfile(profile);
          setActiveTab('home');
        }}
      />
    );
  }

  return (
    <div className="w-full h-[100dvh] bg-[#f8f9fb] flex flex-col font-sans text-[#121316] select-none antialiased relative overflow-hidden">
      {/* Header Bar */}
      <Header
        userProfile={userProfile}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenScan={() => setActiveTab('agent')}
      />

      {/* Main Screen Views */}
      <div className="w-full flex-1 min-h-0 overflow-hidden relative flex flex-col">
        {activeTab === 'home' && (
          <HomeDashboard
            userProfile={userProfile}
            dailyBrief={dailyBrief}
            onOpenScan={() => setActiveTab('agent')}
            onOpenAgent={() => setActiveTab('agent')}
            onOpenCalendar={() => setActiveTab('calendar')}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {activeTab === 'agent' && (
          <AIAgentChat
            userProfile={userProfile}
            onMinimizeNavToggle={setIsNavMinimized}
            onTriggerPopup={(popup) => setNotification(popup)}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarModal
            userProfile={userProfile}
            onOpenScan={() => setActiveTab('agent')}
          />
        )}
      </div>

      {/* Floating Pill Navigation Bar */}
      <PillNavigation
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'home') setIsNavMinimized(false);
        }}
        isMinimized={isNavMinimized}
        onRestorePill={() => setIsNavMinimized(false)}
        userProfile={userProfile}
        onOpenScan={() => setActiveTab('agent')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReports={() => setIsReportsOpen(true)}
        onOpenVault={() => setIsVaultOpen(true)}
        onOpenScanHistory={() => setIsReportsOpen(true)}
        theme={userProfile?.settings?.theme || 'light'}
        onThemeChange={(newTheme) => {
          if (userProfile) {
            handleUpdateSettings({
              ...userProfile.settings,
              theme: newTheme
            });
          }
        }}
      />

      {/* Extended Choice Menu Drawer */}
      <ExtendedMenuDrawer
        isOpen={isExtendedMenuOpen}
        onClose={() => setIsExtendedMenuOpen(false)}
        userProfile={userProfile}
        onOpenScan={() => setActiveTab('agent')}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenReports={() => setIsReportsOpen(true)}
        onOpenRoutine={() => setActiveTab('home')}
        onOpenVault={() => setIsVaultOpen(true)}
        onOpenScanHistory={() => setIsReportsOpen(true)}
      />

      {/* PopUp Notification Card (Daily Check-in) */}
      <PopUpNotificationCard
        notification={notification}
        onDismiss={() => {
          const todayStr = new Date().toISOString().split('T')[0];
          sessionStorage.setItem(`prosana_popup_dismissed_${todayStr}`, 'true');
          setNotification(null);
        }}
        onAction={(notif) => {
          setNotification(null);
          if (notif.actionTarget === 'calendar') {
            setActiveTab('calendar');
          } else if (notif.actionTarget === 'reports') {
            setIsReportsOpen(true);
          } else if (notif.actionTarget === 'vault') {
            setIsVaultOpen(true);
          } else {
            setActiveTab('agent');
          }
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userProfile={userProfile}
        onUpdateSettings={handleUpdateSettings}
        onTestTriggerPopup={(popup) => setNotification(popup)}
      />

      {/* Reports Modal */}
      <ReportsModal
        isOpen={isReportsOpen}
        onClose={() => setIsReportsOpen(false)}
        userProfile={userProfile}
      />

      {/* prosana Agent Vault Modal */}
      <SanaVaultModal
        isOpen={isVaultOpen}
        onClose={() => setIsVaultOpen(false)}
        userId={userProfile?.uid || 'guest_user'}
      />
    </div>
  );
}
