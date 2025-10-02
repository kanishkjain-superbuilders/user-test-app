/**
 * Recording utility functions for browser capability detection,
 * codec selection, and recording configuration
 */

export interface BrowserCapabilities {
  hasMediaRecorder: boolean;
  hasGetDisplayMedia: boolean;
  hasGetUserMedia: boolean;
  supportedVideoCodecs: string[];
  supportedAudioCodecs: string[];
  recommendedVideoCodec: string | null;
  recommendedAudioCodec: string | null;
}

/**
 * Detect browser recording capabilities
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  const hasGetDisplayMedia =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const hasGetUserMedia =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function';

  const supportedVideoCodecs: string[] = [];
  const supportedAudioCodecs: string[] = [];

  if (hasMediaRecorder) {
    // Test video codecs
    const videoCodecsToTest = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
    ];

    for (const codec of videoCodecsToTest) {
      if (MediaRecorder.isTypeSupported(codec)) {
        supportedVideoCodecs.push(codec);
      }
    }

    // Test audio codecs
    const audioCodecsToTest = ['audio/webm;codecs=opus', 'audio/webm'];

    for (const codec of audioCodecsToTest) {
      if (MediaRecorder.isTypeSupported(codec)) {
        supportedAudioCodecs.push(codec);
      }
    }
  }

  // Recommend best codec (prefer VP9 > VP8 > H264)
  const recommendedVideoCodec = supportedVideoCodecs[0] || null;
  const recommendedAudioCodec = supportedAudioCodecs[0] || null;

  return {
    hasMediaRecorder,
    hasGetDisplayMedia,
    hasGetUserMedia,
    supportedVideoCodecs,
    supportedAudioCodecs,
    recommendedVideoCodec,
    recommendedAudioCodec,
  };
}

/**
 * Get the best supported MIME type for recording
 */
export function getBestMimeType(
  includeVideo: boolean,
  includeAudio: boolean
): string | null {
  if (!includeVideo && !includeAudio) {
    return null;
  }

  if (!includeVideo && includeAudio) {
    // Audio only
    const audioTypes = ['audio/webm;codecs=opus', 'audio/webm'];
    for (const type of audioTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return null;
  }

  // Video (with or without audio)
  const videoTypes = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  for (const type of videoTypes) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return null;
}

/**
 * Extract codec information from MIME type
 */
export function extractCodecInfo(mimeType: string): {
  container: string;
  videoCodec: string | null;
  audioCodec: string | null;
} {
  const [container, codecsPart] = mimeType.split(';');
  const containerType = container.split('/')[1] || 'webm';

  let videoCodec: string | null = null;
  let audioCodec: string | null = null;

  if (codecsPart) {
    const codecsMatch = codecsPart.match(/codecs=([^,\s]+)(?:,([^,\s]+))?/);
    if (codecsMatch) {
      const codec1 = codecsMatch[1];
      const codec2 = codecsMatch[2];

      // VP8, VP9, H264 are video codecs
      if (codec1 && /^(vp8|vp9|h264|avc1)/.test(codec1)) {
        videoCodec = codec1;
        audioCodec = codec2 || null;
      } else if (codec1 && /^opus/.test(codec1)) {
        audioCodec = codec1;
        videoCodec = codec2 || null;
      }
    }
  }

  return {
    container: containerType,
    videoCodec,
    audioCodec,
  };
}

/**
 * Calculate estimated file size based on bitrate and duration
 */
export function estimateFileSize(
  durationSeconds: number,
  videoBitrate: number = 2500000, // 2.5 Mbps default for 1080p
  audioBitrate: number = 128000 // 128 kbps default
): number {
  const totalBitrate = videoBitrate + audioBitrate;
  const estimatedBytes = (totalBitrate / 8) * durationSeconds;
  return Math.ceil(estimatedBytes);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Validate recording manifest
 */
export interface RecordingManifest {
  recordingId: string;
  mimeType: string;
  codecs: string;
  totalParts: number;
  totalBytes: number;
  duration: number;
  width: number;
  height: number;
  createdAt: string;
}

export function validateManifest(
  data: unknown
): data is RecordingManifest {
  if (typeof data !== 'object' || data === null) return false;

  const manifest = data as Record<string, unknown>;

  return (
    typeof manifest.recordingId === 'string' &&
    typeof manifest.mimeType === 'string' &&
    typeof manifest.codecs === 'string' &&
    typeof manifest.totalParts === 'number' &&
    typeof manifest.totalBytes === 'number' &&
    typeof manifest.duration === 'number' &&
    typeof manifest.width === 'number' &&
    typeof manifest.height === 'number' &&
    typeof manifest.createdAt === 'string'
  );
}

/**
 * Generate recording manifest
 */
export function generateManifest(
  recordingId: string,
  mimeType: string,
  totalParts: number,
  totalBytes: number,
  duration: number,
  width: number,
  height: number
): RecordingManifest {
  const codecInfo = extractCodecInfo(mimeType);
  const codecs = [codecInfo.videoCodec, codecInfo.audioCodec]
    .filter(Boolean)
    .join(',');

  return {
    recordingId,
    mimeType,
    codecs,
    totalParts,
    totalBytes,
    duration,
    width,
    height,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Check if browser is supported for recording
 */
export function isBrowserSupported(): {
  supported: boolean;
  reason?: string;
} {
  const caps = detectBrowserCapabilities();

  if (!caps.hasMediaRecorder) {
    return {
      supported: false,
      reason: 'MediaRecorder API is not supported in this browser',
    };
  }

  if (!caps.hasGetDisplayMedia) {
    return {
      supported: false,
      reason: 'Screen capture is not supported in this browser',
    };
  }

  if (!caps.hasGetUserMedia) {
    return {
      supported: false,
      reason: 'Media devices are not supported in this browser',
    };
  }

  if (caps.supportedVideoCodecs.length === 0) {
    return {
      supported: false,
      reason: 'No supported video codecs found',
    };
  }

  return { supported: true };
}
