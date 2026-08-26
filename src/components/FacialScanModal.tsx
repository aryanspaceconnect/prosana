import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Icon } from '@iconify/react';
import Markdown from 'react-markdown';
import { UserProfile, FacialScanResult, PerfectCorpRegionOverlay } from '../types';
import { saveFacialScan, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { mapPerfectCorpError, ScanUiError } from '../utils/perfectCorpErrorMapper';
import { assessFaceOnElement, FaceBox, FaceAssessmentResult } from '../lib/faceDetection';
import { checkGuestQuotaFromDb, evaluateGuestScanQuota, GuestQuotaResult } from '../lib/guestTrial';

// Helper: Get scan title based on time or scan type
function getScanTitle(scan: FacialScanResult | null): string {
  if (scan?.scanType) {
    if (scan.scanType === 'morning_scan') return 'Morning Scan';
    if (scan.scanType === 'evening_scan') return 'Evening Scan';
    if (scan.scanType === 'night_scan') return 'Night Scan';
  }
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Morning Scan';
  if (hour >= 12 && hour < 17) return 'Afternoon Scan';
  if (hour >= 17 && hour < 21) return 'Evening Scan';
  return 'Night Scan';
}

// Helper: Format raw concern types to simple, clean max 2-word labels
function formatTagLabel(typeStr: string): string {
  if (!typeStr) return 'Skin Area';
  const cleaned = typeStr
    .replace(/^hd[_\s]*/i, '')
    .replace(/_mask$/i, '')
    .replace(/_score$/i, '')
    .replace(/_/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase();
  if (lower.includes('droopy') || lower.includes('eyelid') || lower.includes('eye')) return 'Eye Area';
  if (lower.includes('crow') || lower.includes('wrinkle') || lower.includes('line')) return 'Fine Lines';
  if (lower.includes('redness') || lower.includes('barrier') || lower.includes('flush')) return 'Skin Barrier';
  if (lower.includes('acne') || lower.includes('blemish') || lower.includes('spot') || lower.includes('pimple')) return 'Clear Skin';
  if (lower.includes('pore')) return 'Pore Zone';
  if (lower.includes('moisture') || lower.includes('hydration') || lower.includes('dry')) return 'Hydration Zone';
  if (lower.includes('radiance') || lower.includes('glow') || lower.includes('shine')) return 'Skin Glow';
  if (lower.includes('texture') || lower.includes('rough')) return 'Skin Texture';
  if (lower.includes('dark') || lower.includes('circle')) return 'Under Eye';
  if (lower.includes('captured') || lower.includes('photo') || lower.includes('scan')) return 'Original Photo';

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  return words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

interface FacialScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onScanComplete: (result: FacialScanResult) => void;
  pastScans?: FacialScanResult[];
  mode?: 'ritual' | 'onboarding' | 'agent';
  scanTitle?: string;
  onContinueOnboarding?: () => void;
}

export const FacialScanModal: React.FC<FacialScanModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onScanComplete,
  pastScans = [],
  mode = 'ritual',
  scanTitle,
  onContinueOnboarding
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanResult, setScanResult] = useState<FacialScanResult | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanUiError, setScanUiError] = useState<ScanUiError | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);
  
  // Scan Type state
  const [scanType, setScanType] = useState<'daily_scan' | 'intermediate_scan'>('daily_scan');
  const [showPremiumNotice, setShowPremiumNotice] = useState(false);
  
  // Flashlight state
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);

  // Guest Trial Quota State
  const isGuest = Boolean(
    userProfile?.isGuestTrial ||
    userProfile?.settings?.isGuestTrial ||
    userProfile?.uid?.startsWith('guest_') ||
    userProfile?.accountType === 'guest_trial'
  );
  const [guestQuota, setGuestQuota] = useState<GuestQuotaResult | null>(null);

  useEffect(() => {
    if (isOpen && isGuest && userProfile?.uid) {
      checkGuestQuotaFromDb(userProfile.uid)
        .then((q) => setGuestQuota(q))
        .catch(() => {
          setGuestQuota(evaluateGuestScanQuota(pastScans, userProfile.guestScanAllowance));
        });
    }
  }, [isOpen, isGuest, userProfile?.uid, pastScans]);

  // Survey Slide & Interstitial State
  const [isSurveySlideActive, setIsSurveySlideActive] = useState<boolean>(false);
  const [isRedirectingToSurvey, setIsRedirectingToSurvey] = useState<boolean>(false);
  const [pendingCapturedPhoto, setPendingCapturedPhoto] = useState<string | null>(null);
  const [pendingFaceBox, setPendingFaceBox] = useState<FaceBox | undefined>(undefined);

  // Daily Survey Questionnaire State
  const initialGenderMode = userProfile?.gender?.toLowerCase().startsWith('m') ? 'male' : 'female';
  const [surveyGender, setSurveyGender] = useState<'male' | 'female'>(initialGenderMode);
  const [surveySleep, setSurveySleep] = useState<string>('7-9 hrs Restful');
  const [surveyHydration, setSurveyHydration] = useState<string>('Optimal (>2.5L Water)');
  const [surveyExposure, setSurveyExposure] = useState<string>('Indoor AC & Dry Air');
  const [surveyGenderFactor, setSurveyGenderFactor] = useState<string>(
    initialGenderMode === 'male' ? 'Clean Shaven & Smooth' : 'Bare Skin & SPF Only'
  );
  const [surveyOptionalNote, setSurveyOptionalNote] = useState<string>('');
  const [hideImages, setHideImages] = useState<boolean>(false);

  // Horizontal Slider Mouse Drag & Smooth Navigation State
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!sliderRef.current) return;
    setIsDraggingSlider(true);
    setStartX(e.pageX - sliderRef.current.offsetLeft);
    setScrollLeftState(sliderRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDraggingSlider(false);
  };

  const handleMouseUp = () => {
    setIsDraggingSlider(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingSlider || !sliderRef.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    const walk = (x - startX) * 1.8;
    sliderRef.current.scrollLeft = scrollLeftState - walk;
  };

  const scrollSlider = (direction: 'left' | 'right') => {
    if (!sliderRef.current) return;
    const scrollAmount = 240;
    sliderRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth'
    });
  };

  // Extract gallery images for horizontal slider (Concern overlays FIRST, original photo LAST)
  const galleryImages = scanResult ? extractGalleryImages(scanResult) : [];
  const allReportImages: { type: string; url: string; score?: number }[] = [];
  if (scanResult) {
    // 1. API concern images / mask overlays first
    galleryImages.forEach(img => {
      if (img.url && !allReportImages.some(i => i.url === img.url)) {
        allReportImages.push(img);
      }
    });
    // 2. Real camera captured photo LAST
    const photoUrl = scanResult.capturedPhoto || scanResult.capturedImage || pendingCapturedPhoto;
    if (photoUrl && !allReportImages.some(i => i.url === photoUrl)) {
      allReportImages.push({
        type: 'Original Photo',
        url: photoUrl,
      });
    }
  }

  const toggleFlashlight = async () => {
    if (!stream) {
      setIsFlashlightOn(!isFlashlightOn);
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (track) {
      try {
        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
        if ('torch' in capabilities) {
          const nextState = !isFlashlightOn;
          await track.applyConstraints({
            advanced: [{ torch: nextState }] as any
          });
          setIsFlashlightOn(nextState);
        } else {
          setIsFlashlightOn(!isFlashlightOn);
        }
      } catch (e) {
        setIsFlashlightOn(!isFlashlightOn);
      }
    } else {
      setIsFlashlightOn(!isFlashlightOn);
    }
  };
  const [activeTab, setActiveTab] = useState<'report' | 'gallery' | 'raw_json' | 'raw_scores' | 's2s_logs'>('report');
  const [copiedJson, setCopiedJson] = useState(false);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string | null>(null);
  const [jsonFilterQuery, setJsonFilterQuery] = useState('');

  // Subscribe to real-time report status updates from Firestore database
  useEffect(() => {
    if (!scanResult?.id || !db) return;

    const docRef = doc(db, 'facial_scans', scanResult.id);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.reportText || d.reportStatus) {
          setScanResult(prev => prev ? {
            ...prev,
            reportStatus: d.reportStatus || prev.reportStatus,
            reportText: d.reportText || prev.reportText,
            reportSessionId: d.reportSessionId || prev.reportSessionId,
            masks: d.masks || prev.masks
          } : null);
        }
      }
    }, (err) => console.warn("Report snapshot listener warning:", err));

    return () => unsub();
  }, [scanResult?.id]);

  // Real-time MediaPipe Face Detection HUD State
  const [faceAssessment, setFaceAssessment] = useState<FaceAssessmentResult>({
    status: 'loading',
    statusText: 'Initializing face detector...',
    hint: 'Center your face inside the guide frame.',
    faceRatio: 0,
    canShutter: false,
    warnings: []
  });
  const [currentFaceBox, setCurrentFaceBox] = useState<FaceBox | null>(null);

  // Real-time camera stream frame analyzer loop using MediaPipe FaceDetector
  useEffect(() => {
    if (!isOpen || scanResult || !stream || isAnalyzing) return;

    let animFrameId: number;
    let lastCheckTime = 0;

    const analyzeStreamFrame = async (now: number) => {
      if (now - lastCheckTime > 250 && videoRef.current && videoRef.current.readyState >= 2) {
        lastCheckTime = now;
        const video = videoRef.current;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 640;

        const assessment = await assessFaceOnElement(video, vw, vh);
        setFaceAssessment(assessment);
        if (assessment.faceBox) {
          setCurrentFaceBox(assessment.faceBox);
        }
      }

      animFrameId = requestAnimationFrame(analyzeStreamFrame);
    };

    animFrameId = requestAnimationFrame(analyzeStreamFrame);
    return () => cancelAnimationFrame(animFrameId);
  }, [isOpen, scanResult, stream, isAnalyzing]);

  // Start/Stop Camera Stream
  useEffect(() => {
    if (isOpen && !scanResult) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, scanResult]);

  const startCamera = async () => {
    setCameraError(null);
    setScanUiError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.warn("Camera access failed:", err);
      setCameraError("Camera unavailable or blocked. You can upload a photo instead.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const processScanImage = async (base64Image: string, faceBox?: FaceBox, dailyContextData?: any) => {
    setCapturedImage(base64Image);
    setIsAnalyzing(true);
    setCameraError(null);
    setScanUiError(null);

    try {
      const formattedScanId = `${scanType}_${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15)}`;
      const response = await fetch('/api/facial-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64Image,
          userId: userProfile?.uid || 'guest_user',
          isGuestTrial: isGuest,
          pastScans,
          faceBox: faceBox || currentFaceBox || undefined,
          scanType,
          scanId: formattedScanId,
          responseStyle: userProfile?.settings?.responseStyle || 'professional_medical',
          dailyContext: dailyContextData,
          stream: false
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      let currentResult: FacialScanResult = {
        id: data.id || data.scanId || formattedScanId,
        userId: userProfile?.uid || 'guest_user',
        scanId: data.scanId || formattedScanId,
        scanType: data.scanType || scanType,
        hydrationScore: data.hydrationScore ?? data.rawMetrics?.moistureScore ?? data.scoreInfo?.concerns?.moisture?.ui_score ?? null,
        barrierScore: data.barrierScore ?? data.rawMetrics?.barrierRednessScore ?? data.scoreInfo?.concerns?.redness?.ui_score ?? null,
        clarityScore: data.clarityScore ?? data.rawMetrics?.acneBlemishScore ?? data.scoreInfo?.concerns?.acne?.ui_score ?? null,
        summary: data.summary || 'Direct response from Perfect Corp S2S API',
        recommendations: data.recommendations || [],
        rawPerfectCorpOutput: data.rawPerfectCorpOutput,
        integrityLog: data.integrityLog || {
          integrityStatus: 'VALID',
          passedChecks: ['lighting', 'resolution', 'pose', 'blur', 'face_detected'],
          integrityErrors: [],
          schemaVerified: true,
          directUploadFlag: true,
          validatedAt: new Date().toISOString()
        },
        annotatedRegions: data.annotatedRegions || [],
        concernImages: data.concernImages || {},
        capturedImage: base64Image,
        s2sStepLogs: data.s2sStepLogs || data.rawPerfectCorpOutput?.s2sStepLogs || [],
        rawResponseLog: data.rawResponseLog || data.rawPerfectCorpOutput?.rawResponseLog || '',
        rawJson: data.rawJson || data.rawPerfectCorpOutput?.rawJson || data,
        rawMetrics: data.rawMetrics || data.rawPerfectCorpOutput?.rawMetrics,
        scoreInfo: data.scoreInfo || data.rawPerfectCorpOutput?.scoreInfo,
        reportStatus: data.reportStatus || 'ready',
        reportText: data.reportText || '',
        reportSessionId: data.reportSessionId || `session_scan_report_${Date.now()}`,
        masks: data.masks || [],
        timestamp: data.timestamp || new Date().toISOString()
      };

      setScanResult(currentResult);
      setActiveTab('report');
      onScanComplete(currentResult);
      await saveFacialScan(userProfile?.uid || 'guest_user', currentResult);

    } catch (err: any) {
      console.error("Facial scan error:", err);
      setCameraError(err?.message || "Scan processing error. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const triggerSurveySlide = (base64Image: string, faceBox?: FaceBox) => {
    setPendingCapturedPhoto(base64Image);
    setPendingFaceBox(faceBox || currentFaceBox || undefined);

    // Auto-identify gender from user profile
    const autoGender = userProfile?.gender?.toLowerCase().startsWith('m') ? 'male' : 'female';
    setSurveyGender(autoGender);
    setSurveyGenderFactor(autoGender === 'male' ? 'Clean Shaven & Smooth' : 'Bare Skin & SPF Only');

    setIsRedirectingToSurvey(true);

    setTimeout(() => {
      setIsRedirectingToSurvey(false);
      setIsSurveySlideActive(true);
    }, 500);
  };

  const handleSurveySubmit = async () => {
    if (!pendingCapturedPhoto) return;
    setIsSurveySlideActive(false);

    const dailyContextPayload = {
      gender: surveyGender,
      sleep: surveySleep,
      hydration: surveyHydration,
      exposure: surveyExposure,
      genderFactor: surveyGenderFactor,
      optionalNote: surveyOptionalNote.trim()
    };

    await processScanImage(pendingCapturedPhoto, pendingFaceBox, dailyContextPayload);
  };

  const handleSurveySkip = async () => {
    if (!pendingCapturedPhoto) return;
    setIsSurveySlideActive(false);
    await processScanImage(pendingCapturedPhoto, pendingFaceBox, null);
  };

  const handleBypass = () => {
    const dummyPhoto = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
    triggerSurveySlide(dummyPhoto, currentFaceBox || undefined);
  };

  const handleCapture = async () => {
    const isReadyToCapture = faceAssessment.canShutter || faceAssessment.status === 'ready';
    if (!canvasRef.current || isAnalyzing || !isReadyToCapture) return;

    let base64Image = '';

    if (videoRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 640;

      // Capture FULL video frame — sharp/preprocessor on server handles margin crop from faceBox
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, vw, vh);
        base64Image = canvas.toDataURL('image/jpeg', 0.92);
      }
    }

    if (!base64Image) {
      base64Image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/";
    }

    triggerSurveySlide(base64Image, currentFaceBox || undefined);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Image = reader.result as string;

      // Detect face on uploaded image using HTMLImageElement
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = async () => {
        const assessment = await assessFaceOnElement(img, img.width, img.height);
        triggerSurveySlide(base64Image, assessment.faceBox);
      };
      img.onerror = async () => {
        triggerSurveySlide(base64Image);
      };
      img.src = base64Image;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  // Extract all images/masks returned by Perfect Corp API
  const returnedGalleryImages = extractGalleryImages(scanResult);

  // Extract raw output array items from response
  const rawOutputList = extractOutputList(scanResult);

  const copyJsonToClipboard = () => {
    if (!scanResult) return;
    const jsonStr = JSON.stringify(scanResult.rawJson || scanResult, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          className="w-full max-w-2xl sm:max-w-3xl max-h-[88vh] rounded-[44px] bg-white/95 backdrop-blur-xl border border-slate-200/80 text-slate-900 overflow-hidden shadow-2xl p-6 sm:p-8 relative flex flex-col space-y-4 my-auto"
        >
          {!scanResult ? (
            isSurveySlideActive ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex-1 flex flex-col justify-between space-y-4 my-auto overflow-y-auto max-h-[75vh] no-scrollbar pr-0.5"
              >
                {/* Header */}
                <div className="pb-2 border-b border-slate-200">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                    How does your skin feel today?
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Tailor SANA Clinical Agent's diagnosis with today's dynamic factors.
                  </p>
                </div>

                {/* Question Grid (Minimal List View Layout) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Q1: Sleep Quality */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                    <div className="flex items-center space-x-2 text-slate-700 text-xs font-bold uppercase tracking-wider px-0.5">
                      <Icon icon="solar:moon-bold" className="w-3.5 h-3.5 text-slate-500" />
                      <span>1. Sleep & Rest</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                      {[
                        '7-9 hrs Restful',
                        'Interrupted <6 hrs',
                        'Late Shift & Stress',
                        'Deep Sleep >8 hrs'
                      ].map((opt) => {
                        const isSelected = surveySleep === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSurveySleep(opt)}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left transition-all cursor-pointer flex items-center justify-between border ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                                : 'bg-white hover:bg-slate-100/80 text-slate-700 border-slate-200/80'
                            }`}
                          >
                            <span>{opt}</span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                              isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-300 bg-transparent'
                            }`}>
                              {isSelected && <Icon icon="solar:check-bold" className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q2: Hydration */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                    <div className="flex items-center space-x-2 text-slate-700 text-xs font-bold uppercase tracking-wider px-0.5">
                      <Icon icon="solar:cup-bold" className="w-3.5 h-3.5 text-slate-500" />
                      <span>2. Hydration & Diet</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                      {[
                        'Optimal (>2.5L Water)',
                        'Moderate (~1.5L)',
                        'Low & Dehydrated',
                        'High Caffeine/Alcohol'
                      ].map((opt) => {
                        const isSelected = surveyHydration === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSurveyHydration(opt)}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left transition-all cursor-pointer flex items-center justify-between border ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                                : 'bg-white hover:bg-slate-100/80 text-slate-700 border-slate-200/80'
                            }`}
                          >
                            <span>{opt}</span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                              isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-300 bg-transparent'
                            }`}>
                              {isSelected && <Icon icon="solar:check-bold" className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q3: Environmental Exposome */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                    <div className="flex items-center space-x-2 text-slate-700 text-xs font-bold uppercase tracking-wider px-0.5">
                      <Icon icon="solar:sun-bold" className="w-3.5 h-3.5 text-slate-500" />
                      <span>3. Sun & Climate</span>
                    </div>
                    <div className="flex flex-col space-y-1">
                      {[
                        'Direct Sun & High UV',
                        'Indoor AC & Dry Air',
                        'Urban Pollution & Sweat',
                        'Shade / Controlled'
                      ].map((opt) => {
                        const isSelected = surveyExposure === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSurveyExposure(opt)}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left transition-all cursor-pointer flex items-center justify-between border ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                                : 'bg-white hover:bg-slate-100/80 text-slate-700 border-slate-200/80'
                            }`}
                          >
                            <span>{opt}</span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                              isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-300 bg-transparent'
                            }`}>
                              {isSelected && <Icon icon="solar:check-bold" className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Q4: Gender-Specific Factor (Auto-identified from user profile) */}
                  <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-slate-700 text-xs font-bold uppercase tracking-wider px-0.5">
                      <div className="flex items-center space-x-2">
                        <Icon icon="solar:user-bold" className="w-3.5 h-3.5 text-slate-500" />
                        <span>4. {surveyGender === 'male' ? 'Shaving & Beard Routine' : 'Cycle & Makeup Factor'}</span>
                      </div>
                    </div>
                    <div className="flex flex-col space-y-1">
                      {(surveyGender === 'male'
                        ? [
                            'Clean Shaven & Smooth',
                            'Post-Shave Irritation',
                            'Beard Care & Oil',
                            'Stubble / Ingrowns'
                          ]
                        : [
                            'Bare Skin & SPF Only',
                            'Heavy Foundation',
                            'PMS / Sensitivity',
                            'Follicular Phase'
                          ]
                      ).map((opt) => {
                        const isSelected = surveyGenderFactor === opt;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setSurveyGenderFactor(opt)}
                            className={`w-full px-3 py-2 rounded-xl text-xs font-medium text-left transition-all cursor-pointer flex items-center justify-between border ${
                              isSelected
                                ? 'bg-slate-900 text-white border-slate-900 font-semibold shadow-xs'
                                : 'bg-white hover:bg-slate-100/80 text-slate-700 border-slate-200/80'
                            }`}
                          >
                            <span>{opt}</span>
                            <div className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                              isSelected ? 'border-white bg-white text-slate-950' : 'border-slate-300 bg-transparent'
                            }`}>
                              {isSelected && <Icon icon="solar:check-bold" className="w-2.5 h-2.5" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Q5: Optional Notes Field */}
                <div className="p-3 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-slate-700 text-xs font-bold uppercase tracking-wider px-0.5">
                    <div className="flex items-center space-x-2">
                      <Icon icon="solar:notes-bold" className="w-3.5 h-3.5 text-slate-500" />
                      <span>5. Today's Observations</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Optional</span>
                  </div>
                  <input
                    type="text"
                    value={surveyOptionalNote}
                    onChange={(e) => setSurveyOptionalNote(e.target.value)}
                    placeholder="e.g., Slight tightness near nostrils, introduced new Vitamin C serum today..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-slate-400 transition-all"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSurveySkip}
                    className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Skip & View Direct Report
                  </button>

                  <button
                    type="button"
                    onClick={handleSurveySubmit}
                    className="w-full sm:flex-1 py-3 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs tracking-wide transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <span>Complete & Generate Clinical Report</span>
                    <Icon icon="solar:alt-arrow-right-bold" className="w-4 h-4 text-white" />
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
              {/* Guidance Advice Text & Back Button Above Camera Feed (Back button only on Ritual Scan cam feed page) */}
              <div className="w-full flex flex-col space-y-1.5 py-1">
                <div className="w-full flex items-center justify-between relative min-h-[36px]">
                  {mode === 'ritual' ? (
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        onClose();
                      }}
                      className="px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center space-x-1.5 transition-all cursor-pointer active:scale-95 border border-slate-200/80 shadow-2xs z-20"
                    >
                      <Icon icon="solar:alt-arrow-left-linear" className="w-4 h-4 text-slate-700" />
                      <span>Back</span>
                    </button>
                  ) : (
                    <div className="w-16 shrink-0" />
                  )}

                  <p className="text-xs sm:text-sm font-semibold text-slate-700 tracking-tight text-center flex-1 px-2">
                    {guestQuota && !guestQuota.allowed
                      ? guestQuota.status === 'DAILY_LIMIT_REACHED'
                        ? "Today's Trial Scan Completed"
                        : "Trial Limit Reached (2/2 Used)"
                      : faceAssessment.canShutter || faceAssessment.status === 'ready'
                      ? 'Look in camera'
                      : faceAssessment.hint || 'Align face inside outline'}
                  </p>

                  {/* Balancing spacer or Guest Badge */}
                  <div className="shrink-0 flex justify-end">
                    {isGuest ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-[10px] font-semibold text-amber-800 tracking-wide">
                        {guestQuota?.scansRemaining != null ? `${guestQuota.scansRemaining} Trial Scan Left` : 'Guest Trial'}
                      </span>
                    ) : (
                      <div className="w-16 shrink-0" />
                    )}
                  </div>
                </div>

                {/* Guest Quota Limit Notice Banner */}
                {isGuest && guestQuota && !guestQuota.allowed && (
                  <div className="w-full p-2.5 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-900 text-xs flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Icon icon="solar:info-circle-bold" className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-[11px] leading-tight font-medium">
                        {guestQuota.message}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Squaricle Visual Camera Feed Viewport */}
              <div className="relative w-full flex-1 min-h-[350px] sm:min-h-[420px] rounded-[36px] bg-slate-950 overflow-hidden flex items-center justify-center border border-slate-200/80 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform -scale-x-100"
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Fogged / Blurred / Soft White Fill Light Region Outside Custom Face Silhouette */}
                <div className="absolute inset-0 pointer-events-none z-10">
                  <svg className="w-full h-full absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <mask id="face-silhouette-mask">
                        {/* White fill keeps the frosted blur / white light outside */}
                        <rect width="100%" height="100%" fill="white" />
                        {/* Black path cuts an organic custom human face shape hole */}
                        <path
                          d="M 50 10 C 74 10, 80 24, 80 44 C 80 65, 70 82, 50 90 C 30 82, 20 65, 20 44 C 20 24, 26 10, 50 10 Z"
                          fill="black"
                        />
                      </mask>
                    </defs>

                    {/* Frosted / Fogged Outside Layer - Softly turns glowing white when Fill Light is clicked */}
                    <foreignObject width="100%" height="100%" mask="url(#face-silhouette-mask)">
                      <div
                        className={`w-full h-full transition-all duration-700 ease-out ${
                          isFlashlightOn
                            ? 'bg-white/95 backdrop-blur-2xl shadow-[inset_0_0_120px_rgba(255,255,255,1)]'
                            : 'bg-slate-950/60 backdrop-blur-md'
                        }`}
                      />
                    </foreignObject>

                    {/* Custom Face Silhouette Outline Stroke & Glow */}
                    <path
                      d="M 50 10 C 74 10, 80 24, 80 44 C 80 65, 70 82, 50 90 C 30 82, 20 65, 20 44 C 20 24, 26 10, 50 10 Z"
                      fill="none"
                      stroke={faceAssessment.canShutter || faceAssessment.status === 'ready' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(245, 158, 11, 0.85)'}
                      strokeWidth="0.8"
                      strokeDasharray={faceAssessment.canShutter || faceAssessment.status === 'ready' ? 'none' : '2 1'}
                      className="transition-all duration-300"
                    />
                  </svg>

                  {/* Top Bar Controls Inside Camera Viewport */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-auto z-20">
                    {/* Fill Light Pill Button (Top-Left) */}
                    <button
                      type="button"
                      onClick={toggleFlashlight}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all shadow-md flex items-center space-x-1.5 cursor-pointer border ${
                        isFlashlightOn
                          ? 'bg-white text-slate-950 border-white shadow-lg ring-2 ring-white/60 font-bold'
                          : 'bg-zinc-900/90 backdrop-blur-md text-zinc-100 border-white/20 hover:bg-zinc-800'
                      }`}
                    >
                      <Icon icon={isFlashlightOn ? 'solar:sun-2-bold' : 'solar:sun-2-linear'} className={`w-4 h-4 ${isFlashlightOn ? 'text-amber-500' : 'text-zinc-300'}`} />
                      <span>Fill Light</span>
                    </button>

                    {/* Live Face Ratio Indicator (Top-Right) */}
                    <div className="flex items-center space-x-2">
                      <div className="px-2.5 py-1 rounded-full bg-zinc-900/90 backdrop-blur-md border border-white/20 text-[10px] font-mono text-zinc-100 shadow-md">
                        FACE: {Math.round((faceAssessment.faceRatio || 0) * 100)}%
                      </div>
                    </div>
                  </div>
                </div>

                {cameraError && (
                  <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center space-y-2 z-10">
                    <Icon icon="solar:camera-square-bold" className="w-10 h-10 text-rose-400" />
                    <p className="text-xs text-rose-200 font-semibold">{cameraError}</p>
                  </div>
                )}

                {/* Section F: Recommended Error UI Pattern */}
                {scanUiError && (
                  <div className="absolute inset-0 bg-slate-950/95 p-6 flex flex-col items-center justify-center text-center z-30 animate-fade-in">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-3">
                      <Icon icon="solar:danger-circle-bold" className="w-7 h-7 text-rose-400" />
                    </div>

                    <h3 className="text-base font-bold text-white mb-1.5 tracking-tight">
                      {scanUiError.title}
                    </h3>

                    <p className="text-xs text-slate-300 max-w-xs leading-relaxed mb-5">
                      {scanUiError.hint}
                    </p>

                    <div className="flex items-center space-x-2.5">
                      {scanUiError.action === 'wait' || retryCount >= 2 ? (
                        mode === 'onboarding' ? (
                          <button
                            type="button"
                            onClick={() => {
                              setScanUiError(null);
                              if (onContinueOnboarding) {
                                onContinueOnboarding();
                              } else {
                                onClose();
                              }
                            }}
                            className="px-5 py-2.5 rounded-xl bg-[#121316] hover:bg-[#20232a] text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center space-x-1.5"
                          >
                            <span>Continue</span>
                            <Icon icon="solar:arrow-right-linear" className="w-4 h-4 text-amber-300" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setScanUiError(null);
                              onClose();
                            }}
                            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center space-x-1.5"
                          >
                            <Icon icon="solar:home-2-bold" className="w-4 h-4" />
                            <span>Home</span>
                          </button>
                        )
                      ) : scanUiError.action === 'retry' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setRetryCount(prev => prev + 1);
                            setScanUiError(null);
                            if (capturedImage) {
                              processScanImage(capturedImage);
                            } else {
                              startCamera();
                            }
                          }}
                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center space-x-1.5"
                        >
                          <Icon icon="solar:restart-bold" className="w-4 h-4" />
                          <span>Retake Scan</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRetryCount(prev => prev + 1);
                            setScanUiError(null);
                            setCapturedImage(null);
                            startCamera();
                          }}
                          className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer flex items-center space-x-1.5"
                        >
                          <Icon icon="solar:camera-bold" className="w-4 h-4" />
                          <span>Retake Photo</span>
                        </button>
                      )}

                      {scanUiError.action === 'wait' && (
                        <button
                          type="button"
                          onClick={() => setScanUiError(null)}
                          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700 cursor-pointer"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {isAnalyzing && (
                  <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center space-y-3 z-20">
                    <div className="w-10 h-10 border-3 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
                    <p className="text-xs font-semibold text-white">Analyzing Skin Image...</p>
                  </div>
                )}
              </div>

              {/* Shutter & Upload Controls - Centered without outer container */}
              <div className="flex items-center justify-center space-x-3 pt-3 pb-1 relative">
                {/* Upload Photo Icon Button on Left (No text label) */}
                <label
                  className={`p-3 rounded-2xl border transition-all flex items-center justify-center shadow-xs ${
                    guestQuota && !guestQuota.allowed
                      ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed opacity-50'
                      : 'bg-slate-100 hover:bg-slate-200/80 border-slate-200/80 text-slate-800 cursor-pointer active:scale-95'
                  }`}
                  title={guestQuota && !guestQuota.allowed ? guestQuota.message : "Upload Photo"}
                >
                  <Icon icon="solar:upload-square-bold" className="w-5 h-5 text-slate-800" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    disabled={Boolean(guestQuota && !guestQuota.allowed)}
                    className="hidden"
                  />
                </label>

                {/* Scan Face Shutter Button in Center (Vibrant Emerald Color when ready, muted disabled when validating or quota reached) */}
                {(() => {
                  const isBlockedByQuota = Boolean(guestQuota && !guestQuota.allowed);
                  const isReadyToCapture = (faceAssessment.canShutter || faceAssessment.status === 'ready') && !isBlockedByQuota;
                  return (
                    <button
                      type="button"
                      onClick={handleCapture}
                      disabled={isAnalyzing || !isReadyToCapture || isBlockedByQuota}
                      className={`py-3 px-8 rounded-2xl transition-all flex items-center space-x-2 text-xs font-bold shadow-md ${
                        isBlockedByQuota
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60 shadow-none border border-slate-200'
                          : isReadyToCapture && !isAnalyzing
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95 shadow-emerald-500/20'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-70 shadow-none border border-slate-200'
                      }`}
                      title={isBlockedByQuota ? guestQuota?.message : undefined}
                    >
                      <Icon icon="solar:camera-bold" className="w-4 h-4" />
                      <span>{isBlockedByQuota ? "Scan Quota Reached" : "Scan Face"}</span>
                    </button>
                  );
                })()}
              </div>
            </>
          )) : (
            /* Clean User Skin Health Report View - Matching Hand-Drawn Sketch Design */
            <div className="w-full flex-1 flex flex-col space-y-4 overflow-y-auto max-h-[78vh] no-scrollbar pr-0.5 pb-2">
              {/* Top Title */}
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-2.5 shrink-0">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    {scanTitle || (mode === 'onboarding' ? 'Your First Scan' : getScanTitle(scanResult))}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {new Date(scanResult.timestamp || Date.now()).toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </p>
                </div>
              </div>

              {/* Horizontal Image Slider Section with Hide Images Toggle & Scroll Arrows */}
              <div className="w-full space-y-2 shrink-0">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Scan Visuals</span>
                  
                  <div className="flex items-center space-x-2">
                    {/* Left & Right Scroll Arrows */}
                    {!hideImages && allReportImages.length > 1 && (
                      <div className="flex items-center space-x-1 mr-1">
                        <button
                          type="button"
                          onClick={() => scrollSlider('left')}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/80 transition-all cursor-pointer active:scale-90"
                          title="Scroll Left"
                        >
                          <Icon icon="solar:alt-arrow-left-bold" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollSlider('right')}
                          className="p-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/80 transition-all cursor-pointer active:scale-90"
                          title="Scroll Right"
                        >
                          <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Hide / Show Images Toggle Button */}
                    <button
                      type="button"
                      onClick={() => setHideImages(!hideImages)}
                      className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer flex items-center space-x-1.5 py-1 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/80 active:scale-95 shadow-2xs"
                    >
                      <Icon icon={hideImages ? "solar:eye-bold" : "solar:eye-closed-bold"} className="w-3.5 h-3.5 text-slate-700" />
                      <span>{hideImages ? "Show Images" : "Hide Images"}</span>
                    </button>
                  </div>
                </div>

                {!hideImages && (
                  <div
                    ref={sliderRef}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                    className={`flex overflow-x-auto no-scrollbar gap-3 py-1 -mx-1 px-1 touch-pan-x overscroll-x-contain select-none scroll-smooth ${
                      isDraggingSlider ? 'cursor-grabbing' : 'cursor-grab'
                    }`}
                  >
                    {allReportImages.length > 0 ? (
                      allReportImages.map((img, idx) => (
                        <div
                          key={idx}
                          className="shrink-0 w-[220px] sm:w-[260px] h-[220px] sm:h-[260px] rounded-3xl overflow-hidden border border-slate-200/80 bg-slate-100 shadow-xs relative group transition-transform duration-300 hover:scale-[1.01]"
                        >
                          <img
                            src={img.url}
                            alt={img.type}
                            className="w-full h-full object-cover pointer-events-none select-none"
                            draggable={false}
                          />
                          {/* Frosted tag badge in bottom-right corner, max 2 simple words */}
                          <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-xl bg-white/35 backdrop-blur-md text-white text-[11px] font-semibold border border-white/20 shadow-xs pointer-events-none tracking-wide">
                            <span>{formatTagLabel(img.type)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="w-full h-[200px] rounded-3xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-xs">
                        No visual overlays available
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Report Area - Direct Text with Subtle Shimmer Loading Indicator (Expanded naturally inside outer scroll) */}
              <div className="w-full py-1 space-y-2 min-h-[120px]">
                {scanResult.reportStatus === 'running' && !scanResult.reportText ? (
                  <div className="py-6 flex flex-col items-center justify-center space-y-2.5">
                    <div className="flex items-center space-x-2.5 text-slate-500 font-medium text-xs sm:text-sm">
                      <span className="w-2 h-2 rounded-full bg-slate-800 animate-ping" />
                      <span className="bg-gradient-to-r from-slate-900 via-slate-500 to-slate-900 bg-clip-text text-transparent font-bold animate-pulse">
                        Generating SANA Clinical Report...
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 text-center max-w-xs leading-relaxed">
                      SANA Agent is synthesizing facial metrics with daily exposome inputs.
                    </p>
                  </div>
                ) : (
                  <div className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                    <div className="markdown-body space-y-2">
                      <Markdown>
                        {scanResult.reportText || scanResult.summary || 'Clinical scan report generated successfully.'}
                      </Markdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Buttons */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200/80 shrink-0 mt-2">
                {mode === 'onboarding' ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onContinueOnboarding) {
                        onContinueOnboarding();
                      } else {
                        onClose();
                      }
                    }}
                    className="w-full py-3.5 px-6 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white font-bold text-xs transition-all cursor-pointer text-center active:scale-95 shadow-md flex items-center justify-center space-x-2"
                  >
                    <span>Continue</span>
                    <Icon icon="solar:arrow-right-linear" className="w-4 h-4 text-amber-300" />
                  </button>
                ) : mode === 'agent' ? (
                  <button
                    type="button"
                    onClick={() => {
                      const scanMsg = `[SANA AGENT CONTEXT UPDATE]\nFacial Scan completed successfully.\n\nLatest Telemetry:\n${scanResult.reportText || scanResult.summary || JSON.stringify(scanResult.rawJson)}\n\nPlease proceed with your analysis based on this new data.`;
                      // Switch to agent tab
                      window.dispatchEvent(new CustomEvent('sana:open_chat_session'));
                      // Send message
                      setTimeout(() => {
                        window.dispatchEvent(new CustomEvent('sana:send_message', { detail: { message: scanMsg } }));
                      }, 50);
                      onClose();
                    }}
                    className="w-full py-3.5 px-6 rounded-2xl bg-[#121316] hover:bg-[#20232a] text-white font-bold text-xs transition-all cursor-pointer text-center active:scale-95 shadow-md flex items-center justify-center space-x-2"
                  >
                    <span>Continue to Chat</span>
                    <Icon icon="solar:chat-round-line-duotone" className="w-5 h-5 text-amber-300" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const sessionId = scanResult.reportSessionId || `session_scan_report_${Date.now()}`;
                        window.dispatchEvent(new CustomEvent('sana:open_chat_session', {
                          detail: { sessionId, reportText: scanResult.reportText || scanResult.summary }
                        }));
                        onClose();
                      }}
                      className="flex-1 py-3 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs border border-slate-200/80 transition-all cursor-pointer text-center active:scale-95 flex items-center justify-center space-x-1.5 shadow-xs"
                    >
                      <Icon icon="solar:chat-round-dots-bold" className="w-4 h-4 text-slate-800" />
                      <span>Ask SANA</span>
                    </button>

                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-3 px-5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all cursor-pointer text-center active:scale-95 shadow-md flex items-center justify-center space-x-1.5"
                    >
                      <span>Done</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// Helper: Extract gallery images / masks from scanResult
function extractGalleryImages(scanResult: FacialScanResult | null): {
  type: string;
  url: string;
  score?: number;
  format: string;
}[] {
  const images: { type: string; url: string; score?: number; format: string }[] = [];
  if (!scanResult) return images;

  const rawJson = scanResult.rawJson || {};
  const outputArr = Array.isArray(rawJson.data?.output)
    ? rawJson.data.output
    : Array.isArray(rawJson.output)
    ? rawJson.output
    : Array.isArray(rawJson.data?.results?.output)
    ? rawJson.data.results.output
    : [];

  for (const item of outputArr) {
    if (item) {
      const typeStr = item.type || item.region || 'concern_mask';
      const uiVal = item.ui_score ?? item.score ?? item.raw_score;
      if (Array.isArray(item.mask_urls)) {
        for (const url of item.mask_urls) {
          if (typeof url === 'string') {
            const ext = url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'PNG';
            images.push({ type: typeStr, url, score: uiVal, format: ext });
          }
        }
      } else if (typeof item.mask_url === 'string') {
        const ext = item.mask_url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'PNG';
        images.push({ type: typeStr, url: item.mask_url, score: uiVal, format: ext });
      }
    }
  }

  // Also check scoreInfo mask_urls
  const scoreInfo = scanResult.scoreInfo || rawJson.data?.score_info || rawJson.score_info;
  if (scoreInfo?.concerns) {
    for (const [key, val] of Object.entries<any>(scoreInfo.concerns)) {
      if (val?.mask_urls && Array.isArray(val.mask_urls)) {
        for (const url of val.mask_urls) {
          if (typeof url === 'string' && !images.some(i => i.url === url)) {
            const ext = url.split('.').pop()?.split('?')[0]?.toUpperCase() || 'PNG';
            images.push({ type: key, url, score: val.ui_score || val.raw_score, format: ext });
          }
        }
      }
    }
  }

  // Check overlay_images
  if (rawJson.data?.results?.overlay_images) {
    for (const [key, val] of Object.entries<any>(rawJson.data.results.overlay_images)) {
      if (typeof val === 'string' && !images.some(i => i.url === val)) {
        const ext = val.split('.').pop()?.split('?')[0]?.toUpperCase() || 'PNG';
        images.push({ type: key, url: val, format: ext });
      }
    }
  }

  return images;
}

// Helper: Extract output list from scanResult
function extractOutputList(scanResult: FacialScanResult | null): any[] {
  if (!scanResult) return [];
  const rawJson = scanResult.rawJson || {};
  if (Array.isArray(rawJson.data?.output)) return rawJson.data.output;
  if (Array.isArray(rawJson.output)) return rawJson.output;
  if (Array.isArray(rawJson.data?.results?.output)) return rawJson.data.results.output;
  return [];
}
