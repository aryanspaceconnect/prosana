import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Lock, User as UserIcon, Eye, EyeOff, Sparkles, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, Compass } from 'lucide-react';
import { signInWithGoogle, signInWithEmail, signUpWithEmail, getUserProfileFromFirestore } from '../lib/firebase';
import { initializeGuestTrialUser } from '../lib/guestTrial';
import { UserProfile } from '../types';
import { SanaLogoIcon } from './SanaLogoIcon';

interface AuthScreenProps {
  onAuthSuccess: (profile: UserProfile, isNewUser?: boolean) => void;
}

export function AuthScreen({ onAuthSuccess }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGuestBypass = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      const guestProfile = await initializeGuestTrialUser();
      // Directly proceed to the main home screen (bypass onboarding)
      onAuthSuccess(guestProfile, false);
    } catch (err: any) {
      console.error("Guest bypass error:", err);
      setError("Unable to initiate trial session. Please try again.");
    } finally {
      setGuestLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        const dbUserData = await getUserProfileFromFirestore(user.uid);
        const hasCompletedOnboarding = dbUserData?.settings?.onboardingCompleted === true;
        const isNewUser = !hasCompletedOnboarding;

        onAuthSuccess({
          uid: user.uid,
          displayName: dbUserData?.displayName || user.displayName || 'SANA User',
          email: dbUserData?.email || user.email || 'user@sana.app',
          photoURL: dbUserData?.photoURL || user.photoURL || undefined,
          isAnonymous: false,
          settings: {
            temperatureUnit: 'C',
            scanNotificationTime: '00:00',
            scanReminderEnabled: true,
            theme: 'light',
            ...(dbUserData?.settings || {}),
            onboardingCompleted: hasCompletedOnboarding
          }
        }, isNewUser);
      }
    } catch (err: any) {
      console.error("Google sign in error:", err);
      const errMsg = err?.message || String(err || '');
      if (err?.code === 'auth/popup-closed-by-user') {
        setError("Sign-in cancelled. Please try again.");
      } else if (errMsg.includes('Database is closing') || errMsg.includes('Database is hidden') || errMsg.includes('IndexedDB')) {
        // Ignore background IndexedDB closure on popup redirect; do not display cryptic browser message
        setError("Sign-in interrupted. Please tap 'Sign in with Google' again.");
      } else {
        setError(errMsg || "Failed to sign in with Google. Please try manual email login.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleManualAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }

    if (mode === 'signup' && password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);

    try {
      if (mode === 'signin') {
        const user = await signInWithEmail(email, password);
        if (user) {
          const dbUserData = await getUserProfileFromFirestore(user.uid);
          const hasCompletedOnboarding = dbUserData?.settings?.onboardingCompleted === true;
          const isNewUser = !hasCompletedOnboarding;

          onAuthSuccess({
            uid: user.uid,
            displayName: dbUserData?.displayName || user.displayName || email.split('@')[0],
            email: dbUserData?.email || user.email || email,
            photoURL: dbUserData?.photoURL || user.photoURL || undefined,
            isAnonymous: false,
            settings: {
              temperatureUnit: 'C',
              scanNotificationTime: '00:00',
              scanReminderEnabled: true,
              theme: 'light',
              ...(dbUserData?.settings || {}),
              onboardingCompleted: hasCompletedOnboarding
            }
          }, isNewUser);
        }
      } else {
        const user = await signUpWithEmail(email, password, name || email.split('@')[0]);
        if (user) {
          onAuthSuccess({
            uid: user.uid,
            displayName: name || user.displayName || email.split('@')[0],
            email: user.email || email,
            photoURL: user.photoURL || undefined,
            isAnonymous: false,
            settings: {
              temperatureUnit: 'C',
              scanNotificationTime: '00:00',
              scanReminderEnabled: true,
              theme: 'light',
              onboardingCompleted: false // New user sign up needs onboarding!
            }
          }, true);
        }
      }
    } catch (err: any) {
      console.error("Manual auth error:", err);
      let msg = "Authentication failed. Please check your credentials.";
      if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        msg = "Invalid email or password.";
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = "An account with this email already exists. Try logging in.";
      } else if (err?.code === 'auth/user-not-found') {
        msg = "No account found with this email. Please sign up.";
      } else if (err?.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-[#f8f9fb] flex flex-col justify-between p-6 overflow-y-auto select-none">
      {/* Top Header Branding */}
      <div className="w-full pt-4 pb-2 flex flex-col items-center text-center">
        <div className="mb-3">
          <SanaLogoIcon size={38} color="#121316" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#121316] lowercase">
          sana <span className="font-normal text-slate-500 tracking-normal">intelligence</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-xs">
          Personalized facial scanning, skin barrier analytics & AI health guidance
        </p>
      </div>

      {/* Main Auth Form Container */}
      <div className="w-full max-w-sm mx-auto my-auto bg-white rounded-3xl p-6 border border-slate-100 shadow-xl shadow-slate-200/50">
        {/* Toggle Mode Segmented Control */}
        <div className="w-full bg-slate-100 p-1 rounded-2xl flex items-center mb-6 text-xs font-medium text-slate-600">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null); }}
            className={`flex-1 py-2 rounded-xl transition-all duration-200 text-center ${
              mode === 'signin'
                ? 'bg-white text-[#121316] font-semibold shadow-sm'
                : 'hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null); }}
            className={`flex-1 py-2 rounded-xl transition-all duration-200 text-center ${
              mode === 'signup'
                ? 'bg-white text-[#121316] font-semibold shadow-sm'
                : 'hover:text-slate-900'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert Banner */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="w-full p-3 mb-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-800 text-xs flex items-start space-x-2.5"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span className="leading-tight">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Google Login Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full py-3 px-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-[#121316] text-xs font-semibold flex items-center justify-center space-x-3 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 shadow-sm"
        >
          {googleLoading ? (
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
          )}
          <span>{mode === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}</span>
        </button>

        {/* Or Divider */}
        <div className="w-full flex items-center my-5">
          <div className="flex-1 border-t border-slate-100" />
          <span className="px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">or continue with email</span>
          <div className="flex-1 border-t border-slate-100" />
        </div>

        {/* Manual Email Form */}
        <form onSubmit={handleManualAuth} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1 ml-0.5">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                  required={mode === 'signup'}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 ml-0.5">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1 ml-0.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Enter password'}
                className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-[#121316] placeholder-slate-400 focus:outline-none focus:border-slate-800 focus:bg-white transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit CTA Button */}
          <button
            type="submit"
            disabled={loading || googleLoading || guestLoading}
            className="w-full py-3 px-4 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-semibold flex items-center justify-center space-x-2 transition-all duration-200 shadow-md shadow-slate-900/10 active:scale-[0.98] disabled:opacity-60 mt-2 cursor-pointer"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In to Account' : 'Create Free Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>

        {/* Quick Bypass / Guest Trial Access Button */}
        <div className="w-full flex items-center my-4">
          <div className="flex-1 border-t border-slate-100" />
          <span className="px-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">or instant trial</span>
          <div className="flex-1 border-t border-slate-100" />
        </div>

        <button
          type="button"
          onClick={handleGuestBypass}
          disabled={guestLoading || loading || googleLoading}
          className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-slate-50 to-slate-100/90 hover:from-slate-100 hover:to-slate-200/90 border border-slate-200 text-[#121316] text-xs font-semibold flex items-center justify-between transition-all duration-200 active:scale-[0.98] disabled:opacity-60 group shadow-2xs cursor-pointer"
        >
          <div className="flex items-center space-x-2.5 text-left min-w-0">
            <div className="p-1.5 rounded-xl bg-white shadow-2xs border border-slate-200/80 text-emerald-700 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[12px] text-[#121316] truncate">Explore Without Sign In</p>
              <p className="text-[10px] text-slate-500 font-normal truncate">Judge & Evaluation Access • Direct Home Screen</p>
            </div>
          </div>
          {guestLoading ? (
            <div className="w-4 h-4 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin shrink-0" />
          ) : (
            <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
          )}
        </button>

        {/* Mode Toggle Footnote */}
        <div className="mt-5 text-center">
          {mode === 'signin' ? (
            <p className="text-xs text-slate-500">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('signup'); setError(null); }}
                className="font-semibold text-[#121316] hover:underline"
              >
                Sign Up
              </button>
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('signin'); setError(null); }}
                className="font-semibold text-[#121316] hover:underline"
              >
                Log In
              </button>
            </p>
          )}
        </div>
      </div>

      {/* Encryption Footer at Bottom */}
      <div className="w-full pt-4 pb-2 flex flex-col items-center text-center">
        <div className="flex items-center justify-center space-x-2 text-[10px] text-slate-400">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>Encrypted Firestore & Firebase Authentication</span>
        </div>
      </div>
    </div>
  );
}
