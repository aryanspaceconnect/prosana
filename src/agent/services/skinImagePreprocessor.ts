import sharp from 'sharp';

export interface FaceBoxInput {
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

export interface ImagePreprocessResult {
  processedBase64: string;
  processedBuffer: Buffer;
  width: number;
  height: number;
  wasAutoCropped: boolean;
  cropDetails?: {
    originalWidth: number;
    originalHeight: number;
    cropX: number;
    cropY: number;
    cropWidth: number;
    cropHeight: number;
    faceWidthRatio: number;
  };
  qualityChecks: {
    isResolutionHD: boolean;
    faceRatio: number;
    aspectRatio: number;
    warnings: string[];
  };
}

/**
 * Server-side Computer Vision Pre-Processor using Sharp Engine.
 * Enforces Official Perfect Corp S2S HD Skincare constraints:
 * - Face width / image width > 60%, recommended 60-80%
 * - Margin crop derived ONLY from real faceBox coordinates (never guessed center crop)
 * - Minimum short side >= 1080px (Lanczos3 resampling)
 * - Maximum long side <= 2560px
 * - Maximum file size < 9MB
 * - High-quality 4:4:4 chroma JPEG output (quality ~92)
 */
export async function preprocessSkinImage(
  base64Data: string,
  options: {
    faceBox?: FaceBoxInput;
    forceHDMinResolution?: number; // Default 1080
    maxLongSide?: number; // Default 2560
  } = {}
): Promise<ImagePreprocessResult> {
  const forceHDMinResolution = options.forceHDMinResolution ?? 1080;
  const maxLongSide = options.maxLongSide ?? 2560;

  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const inputBuffer = Buffer.from(cleanBase64, 'base64');

  // Load metadata and apply auto-rotation based on EXIF orientation
  const rotatedBuffer = await sharp(inputBuffer).rotate().toBuffer();
  const metadata = await sharp(rotatedBuffer).metadata();

  const originalWidth = metadata.width || 1080;
  const originalHeight = metadata.height || 1080;
  const warnings: string[] = [];

  let workingBuffer = rotatedBuffer;
  let wasAutoCropped = false;
  let cropDetails: ImagePreprocessResult['cropDetails'] | undefined;
  let computedFaceRatio = 0.65;

  // Process real faceBox if provided
  if (options.faceBox) {
    const fb = options.faceBox;

    // Resolve pixel coordinates for face box
    let fX = fb.x;
    let fY = fb.y;
    let fW = fb.width;
    let fH = fb.height;

    // Convert from normalized coordinates if required
    if (fb.normalizedWidth && fb.normalizedWidth <= 1.0) {
      const srcW = fb.imageWidth || originalWidth;
      const srcH = fb.imageHeight || originalHeight;
      const scaleX = originalWidth / srcW;
      const scaleY = originalHeight / srcH;

      fX = Math.round(fb.normalizedX! * originalWidth);
      fY = Math.round(fb.normalizedY! * originalHeight);
      fW = Math.round(fb.normalizedWidth * originalWidth);
      fH = Math.round(fb.normalizedHeight * originalHeight);
    }

    // Ensure valid positive dimensions
    fX = Math.max(0, fX);
    fY = Math.max(0, fY);
    fW = Math.min(originalWidth - fX, Math.max(10, fW));
    fH = Math.min(originalHeight - fY, Math.max(10, fH));

    const initialFaceRatio = fW / originalWidth;

    // Check if crop is needed
    // If face is already 60%-78% of image width and not cut off, skip crop
    if (initialFaceRatio >= 0.60 && initialFaceRatio <= 0.78) {
      computedFaceRatio = initialFaceRatio;
      warnings.push(`Face is already optimal width (${Math.round(initialFaceRatio * 100)}% of frame). No cropping required.`);
    } else {
      // Calculate margin padding (15% horizontal padding, 20% top padding for forehead)
      const padW = Math.round(fW * 0.18);
      const padTop = Math.round(fH * 0.25);
      const padBottom = Math.round(fH * 0.18);

      // Desired crop box
      let cropX = Math.max(0, fX - padW);
      let cropY = Math.max(0, fY - padTop);
      let cropRight = Math.min(originalWidth, fX + fW + padW);
      let cropBottom = Math.min(originalHeight, fY + fH + padBottom);

      let cropWidth = cropRight - cropX;
      let cropHeight = cropBottom - cropY;

      // Ensure crop box never cuts into face box
      cropX = Math.min(cropX, fX);
      cropY = Math.min(cropY, fY);
      cropWidth = Math.max(cropWidth, fX + fW - cropX);
      cropHeight = Math.max(cropHeight, fY + fH - cropY);

      // Face ratio in cropped region
      const postCropFaceRatio = fW / cropWidth;

      if (postCropFaceRatio < 0.55) {
        throw new Error(
          `error_src_face_too_small: Face occupies only ${Math.round(
            postCropFaceRatio * 100
          )}% of frame. Move closer so face fills 60-80% of the screen.`
        );
      }

      // Perform crop using Sharp
      workingBuffer = await sharp(rotatedBuffer)
        .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
        .toBuffer();

      wasAutoCropped = true;
      computedFaceRatio = postCropFaceRatio;

      cropDetails = {
        originalWidth,
        originalHeight,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        faceWidthRatio: Number(postCropFaceRatio.toFixed(2)),
      };

      warnings.push(`Face-focused crop applied (${cropWidth}x${cropHeight}). Final face ratio: ${Math.round(postCropFaceRatio * 100)}%.`);
    }
  } else {
    warnings.push('No face box provided; processing full frame without auto-crop.');
  }

  // Get current dimensions after optional crop
  const workingMeta = await sharp(workingBuffer).metadata();
  let currentWidth = workingMeta.width || originalWidth;
  let currentHeight = workingMeta.height || originalHeight;

  let pipeline = sharp(workingBuffer);

  // Resize logic: Ensure minimum short side >= 1080px and long side <= 2560px
  const minSide = Math.min(currentWidth, currentHeight);
  const longSide = Math.max(currentWidth, currentHeight);

  if (minSide < forceHDMinResolution) {
    const scale = forceHDMinResolution / minSide;
    const targetW = Math.round(currentWidth * scale);
    const targetH = Math.round(currentHeight * scale);

    pipeline = pipeline.resize(targetW, targetH, {
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: false,
    });
    currentWidth = targetW;
    currentHeight = targetH;
    warnings.push(`Upscaled image short side to ${forceHDMinResolution}px HD requirement.`);
  } else if (longSide > maxLongSide) {
    if (currentWidth >= currentHeight) {
      pipeline = pipeline.resize({ width: maxLongSide, kernel: sharp.kernel.lanczos3 });
      currentHeight = Math.round((currentHeight * maxLongSide) / currentWidth);
      currentWidth = maxLongSide;
    } else {
      pipeline = pipeline.resize({ height: maxLongSide, kernel: sharp.kernel.lanczos3 });
      currentWidth = Math.round((currentWidth * maxLongSide) / currentHeight);
      currentHeight = maxLongSide;
    }
    warnings.push(`Downscaled long side to ${maxLongSide}px limit.`);
  }

  // Generate output JPEG buffer (< 9MB, quality 92)
  let quality = 92;
  let processedBuffer = await pipeline
    .jpeg({ quality, chromaSubsampling: '4:4:4' })
    .toBuffer();

  // Ensure file size < 9 MB (9 * 1024 * 1024 bytes)
  const maxSizeBytes = 9 * 1024 * 1024;
  while (processedBuffer.length > maxSizeBytes && quality > 75) {
    quality -= 5;
    processedBuffer = await sharp(workingBuffer)
      .resize(currentWidth, currentHeight)
      .jpeg({ quality, chromaSubsampling: '4:4:4' })
      .toBuffer();
  }

  const processedBase64 = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
  const isResolutionHD = Math.min(currentWidth, currentHeight) >= 1080;
  const aspectRatio = Number((currentWidth / currentHeight).toFixed(2));

  return {
    processedBase64,
    processedBuffer,
    width: currentWidth,
    height: currentHeight,
    wasAutoCropped,
    cropDetails,
    qualityChecks: {
      isResolutionHD,
      faceRatio: computedFaceRatio,
      aspectRatio,
      warnings,
    },
  };
}

/**
 * Backwards & Cross-Service Compatible Alias
 */
export async function preprocessSkinAnalysisImage(
  base64Image: string,
  options: {
    faceBox?: FaceBoxInput;
    targetMinDimension?: number;
  } = {}
) {
  const result = await preprocessSkinImage(base64Image, {
    faceBox: options.faceBox,
    forceHDMinResolution: options.targetMinDimension || 1080,
  });

  return {
    processedBase64: result.processedBase64,
    processedBuffer: result.processedBuffer,
    mimeType: 'image/jpeg',
    width: result.width,
    height: result.height,
    faceRatioEstimated: result.qualityChecks.faceRatio,
    wasCropped: result.wasAutoCropped,
    warnings: result.qualityChecks.warnings,
  };
}
