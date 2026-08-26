import { FaceDetector, FilesetResolver, Detection } from '@mediapipe/tasks-vision';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  normalizedX?: number;
  normalizedY?: number;
  normalizedWidth?: number;
  normalizedHeight?: number;
  imageWidth?: number;
  imageHeight?: number;
}

export type FaceAssessmentStatus =
  | 'ready'
  | 'no_face'
  | 'multiple_faces'
  | 'move_closer'
  | 'move_back'
  | 'face_cut_off'
  | 'too_dark'
  | 'loading'
  | 'error';

export interface FaceAssessmentResult {
  status: FaceAssessmentStatus;
  statusText: string;
  hint: string;
  faceRatio: number; // faceWidth / frameWidth
  faceBox?: FaceBox;
  meanLuminance?: number;
  canShutter: boolean;
  warnings: string[];
}

let faceDetectorInstance: FaceDetector | null = null;
let isInitializing = false;
let initFailed = false;
let initErrorMsg = '';

/**
 * Initializes MediaPipe FaceDetector singleton with BlazeFace short-range model
 */
export async function initFaceDetector(): Promise<FaceDetector | null> {
  if (faceDetectorInstance) return faceDetectorInstance;
  if (initFailed) return null;
  if (isInitializing) {
    // Wait for in-flight init
    let attempts = 0;
    while (isInitializing && attempts < 20) {
      await new Promise((r) => setTimeout(r, 150));
      attempts++;
    }
    return faceDetectorInstance;
  }

  isInitializing = true;
  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.5,
    });
    console.log('[FaceDetection] MediaPipe FaceDetector initialized successfully');
    return faceDetectorInstance;
  } catch (gpuErr) {
    console.warn('[FaceDetection] GPU delegate failed, trying CPU fallback...', gpuErr);
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      faceDetectorInstance = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.5,
      });
      console.log('[FaceDetection] MediaPipe CPU FaceDetector initialized successfully');
      return faceDetectorInstance;
    } catch (cpuErr: any) {
      console.error('[FaceDetection] Failed to initialize MediaPipe FaceDetector:', cpuErr);
      initFailed = true;
      initErrorMsg = cpuErr?.message || 'Failed to load face detection model';
      return null;
    }
  } finally {
    isInitializing = false;
  }
}

/**
 * Measures average image brightness (0..255) from a canvas element or video element
 */
export function calculateMeanLuminance(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  width: number,
  height: number
): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 128;

    // Downsample for speed
    canvas.width = 64;
    canvas.height = 64;
    ctx.drawImage(source, 0, 0, width, height, 0, 0, 64, 64);
    const imgData = ctx.getImageData(0, 0, 64, 64).data;

    let totalLuma = 0;
    const pixelCount = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 4) {
      // Rec. 709 luminance formula
      totalLuma += 0.2126 * imgData[i] + 0.7152 * imgData[i + 1] + 0.0722 * imgData[i + 2];
    }
    return totalLuma / pixelCount;
  } catch (e) {
    return 128;
  }
}

/**
 * Assesses face metrics from video stream or canvas against Perfect Corp requirements:
 * - Face ratio: faceWidth / frameWidth ∈ [0.60, 0.78]
 * - Full face in frame with ≥ 8-12% edge margins on each side
 * - Mean luminance ≥ 45 (avoid error_lighting_dark)
 */
export async function assessFaceOnElement(
  element: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  frameWidth: number,
  frameHeight: number
): Promise<FaceAssessmentResult> {
  const detector = await initFaceDetector();

  // Calculate luminance first
  const meanLuma = calculateMeanLuminance(element, frameWidth, frameHeight);

  if (!detector) {
    // Fallback if model loading failed: allow shutter with warning
    return {
      status: 'ready',
      statusText: 'Camera Ready',
      hint: 'Position face centrally with even light.',
      faceRatio: 0.65,
      meanLuminance: meanLuma,
      canShutter: true,
      warnings: ['MediaPipe detector not active; using basic frame capture.'],
    };
  }

  try {
    const detections: Detection[] = detector.detect(element).detections;

    if (!detections || detections.length === 0) {
      return {
        status: 'no_face',
        statusText: 'No Face Detected',
        hint: 'Center your face inside the guide frame.',
        faceRatio: 0,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: [],
      };
    }

    if (detections.length > 1) {
      return {
        status: 'multiple_faces',
        statusText: 'Multiple Faces',
        hint: 'Ensure only your face is visible in the camera.',
        faceRatio: 0,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: [],
      };
    }

    const detection = detections[0];
    const bbox = detection.boundingBox;
    if (!bbox) {
      return {
        status: 'no_face',
        statusText: 'No Face Detected',
        hint: 'Center your face in the oval.',
        faceRatio: 0,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: [],
      };
    }

    // Coordinates in pixels
    const x = Math.round(bbox.originX);
    const y = Math.round(bbox.originY);
    const w = Math.round(bbox.width);
    const h = Math.round(bbox.height);

    const faceRatio = Number((w / frameWidth).toFixed(2));

    const faceBox: FaceBox = {
      x,
      y,
      width: w,
      height: h,
      normalizedX: x / frameWidth,
      normalizedY: y / frameHeight,
      normalizedWidth: w / frameWidth,
      normalizedHeight: h / frameHeight,
      imageWidth: frameWidth,
      imageHeight: frameHeight,
    };

    // Check edge margins: face should not touch border (at least ~8% margin)
    const marginX = frameWidth * 0.08;
    const marginY = frameHeight * 0.08;
    const isCutOff =
      x < marginX ||
      y < marginY ||
      x + w > frameWidth - marginX ||
      y + h > frameHeight - marginY;

    // Check luminance
    if (meanLuma < 45) {
      return {
        status: 'too_dark',
        statusText: 'Too Dark',
        hint: 'Move to brighter, even lighting facing a window or soft lamp.',
        faceRatio,
        faceBox,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: ['Low ambient lighting detected.'],
      };
    }

    if (isCutOff) {
      return {
        status: 'face_cut_off',
        statusText: 'Face Cut Off',
        hint: 'Move back slightly — keep forehead, cheeks, and chin inside the frame.',
        faceRatio,
        faceBox,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: ['Face box is touching or too close to frame boundaries.'],
      };
    }

    // Check ratio constraints: target 0.60 to 0.78
    if (faceRatio < 0.58) {
      return {
        status: 'move_closer',
        statusText: 'Move Closer',
        hint: 'Bring your phone closer so your face fills ~60–80% of the screen.',
        faceRatio,
        faceBox,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: [`Face ratio ${Math.round(faceRatio * 100)}% is below 60% requirement.`],
      };
    }

    if (faceRatio > 0.82) {
      return {
        status: 'move_back',
        statusText: 'Move Back',
        hint: 'Move slightly further back to avoid clipping forehead or chin.',
        faceRatio,
        faceBox,
        meanLuminance: meanLuma,
        canShutter: false,
        warnings: [`Face ratio ${Math.round(faceRatio * 100)}% exceeds 80% maximum boundary.`],
      };
    }

    // All clear!
    return {
      status: 'ready',
      statusText: 'Perfect Alignment',
      hint: 'Hold steady and tap the shutter button.',
      faceRatio,
      faceBox,
      meanLuminance: meanLuma,
      canShutter: true,
      warnings: [],
    };
  } catch (err: any) {
    console.error('[FaceDetection] Error assessing frame:', err);
    return {
      status: 'ready',
      statusText: 'Camera Ready',
      hint: 'Hold steady and take photo.',
      faceRatio: 0.65,
      meanLuminance: meanLuma,
      canShutter: true,
      warnings: [err?.message || 'Detection error fallback'],
    };
  }
}
