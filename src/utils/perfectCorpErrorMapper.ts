export type ScanUiError = {
  code: string;
  title: string;
  hint: string;
  action: 'retake' | 'retry' | 'wait';
};

/**
 * Normalizes Perfect Corp API and capture pipeline error codes/messages
 * into clean, actionable, user-friendly UI copy and recovery actions.
 */
export function mapPerfectCorpError(rawCodeOrMsg?: string, rawDetails?: string): ScanUiError {
  const text = `${rawCodeOrMsg || ''} ${rawDetails || ''}`.toLowerCase();

  // A. Face / Capture Errors
  if (
    text.includes('error_src_face_too_small') ||
    text.includes('face_too_small') ||
    text.includes('error_face_position_too_small') ||
    text.includes('too_small')
  ) {
    return {
      code: 'error_src_face_too_small',
      title: 'Face Too Small',
      hint: 'Move closer so your face fills the guide while keeping forehead and chin visible.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_src_face_out_of_bound') ||
    text.includes('out_of_bound') ||
    text.includes('out_of_bounds') ||
    text.includes('face_boundary_alert')
  ) {
    return {
      code: 'error_src_face_out_of_bound',
      title: 'Face Cut Off',
      hint: 'Move back slightly — keep forehead, cheeks, and chin inside the frame.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_lighting_dark') ||
    text.includes('lighting_dark') ||
    text.includes('dark_lighting') ||
    text.includes('low_light')
  ) {
    return {
      code: 'error_lighting_dark',
      title: 'Too Dark',
      hint: 'Move to brighter, even light on your face; face a soft lamp or window and avoid side shadows.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_no_face') ||
    text.includes('no_face') ||
    text.includes('face_not_found')
  ) {
    return {
      code: 'error_no_face',
      title: 'No Face Found',
      hint: 'Center your face in the oval and look directly at the camera.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_large_face_angle') ||
    text.includes('error_pose') ||
    text.includes('face_angle') ||
    text.includes('pose') ||
    text.includes('error_face_position_invalid')
  ) {
    return {
      code: 'error_large_face_angle',
      title: 'Look Straight Ahead',
      hint: 'Face the camera directly with your head level and both eyes open.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_multiple_people') ||
    text.includes('multiple_people') ||
    text.includes('multiple_faces')
  ) {
    return {
      code: 'error_multiple_people',
      title: 'More Than One Person',
      hint: 'Ensure only your face is visible in the frame.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_face_parsing') ||
    text.includes('face_parsing') ||
    text.includes('segmentation')
  ) {
    return {
      code: 'error_face_parsing',
      title: 'Facial Features Unclear',
      hint: 'Retake with clearer focus, steady hands, and no hair or objects obscuring your face.',
      action: 'retake'
    };
  }

  // B. Image File / Resolution Errors
  if (
    text.includes('error_below_min_image_size') ||
    text.includes('below_min_image_size')
  ) {
    return {
      code: 'error_below_min_image_size',
      title: 'Photo Quality Too Low',
      hint: 'Retake with higher resolution or move slightly closer to the camera.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_exceed_max_image_size') ||
    text.includes('exceed_max_filesize') ||
    text.includes('max_filesize')
  ) {
    return {
      code: 'exceed_max_filesize',
      title: 'Photo File Too Large',
      hint: 'Auto-compressing image. Please retake a fresh photo.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_decode_image') ||
    text.includes('decode_image')
  ) {
    return {
      code: 'error_decode_image',
      title: 'Photo Format Unsupported',
      hint: 'Please retake the photo directly with your standard device camera.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_unsupport_ratio') ||
    text.includes('unsupport_ratio')
  ) {
    return {
      code: 'error_unsupport_ratio',
      title: 'Photo Shape Not Supported',
      hint: 'Please retake using standard portrait selfie orientation.',
      action: 'retake'
    };
  }

  if (
    text.includes('error_download_image') ||
    text.includes('error_upload')
  ) {
    return {
      code: 'error_download_image',
      title: 'Upload Incomplete',
      hint: 'Please check your internet connection and try again.',
      action: 'retry'
    };
  }

  // C. Request / Config / Auth Errors
  if (
    text.includes('invalidapikey') ||
    text.includes('401') ||
    text.includes('unauthorized')
  ) {
    return {
      code: 'InvalidApiKey',
      title: 'Service Temporarily Unavailable',
      hint: 'Scan service is undergoing brief maintenance. Please try again in a few moments.',
      action: 'wait'
    };
  }

  if (
    text.includes('invalidparameters') ||
    text.includes('invalid_parameter') ||
    text.includes('cannot mix hd and sd')
  ) {
    return {
      code: 'InvalidParameters',
      title: 'Configuration Issue',
      hint: 'Something went wrong on our side during analysis. Please try again.',
      action: 'retry'
    };
  }

  // D. Pipeline / Timeout Errors
  if (
    text.includes('timeout') ||
    text.includes('polling timed out') ||
    text.includes('invalidtaskid')
  ) {
    return {
      code: 'polling_timeout',
      title: 'Taking Longer Than Usual',
      hint: 'Processing took longer than expected. Tap try again to resubmit.',
      action: 'retry'
    };
  }

  if (
    text.includes('error_inference') ||
    text.includes('unknown_internal_error') ||
    text.includes('500') ||
    text.includes('502') ||
    text.includes('503')
  ) {
    return {
      code: 'error_inference',
      title: 'Service Hiccup',
      hint: 'Analysis didn\'t finish. Please try again in a moment.',
      action: 'retry'
    };
  }

  // Default fallback
  return {
    code: rawCodeOrMsg || 'unknown_error',
    title: 'Scan Didn\'t Finish',
    hint: 'Please hold your phone at arm\'s length in even light and try again.',
    action: 'retry'
  };
}
