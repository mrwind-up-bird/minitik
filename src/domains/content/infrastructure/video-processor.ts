// Video processing pipeline
// Thumbnail generation requires ffmpeg to be available on PATH in production.
// This module provides stubs that integrate with the ffmpeg CLI when available,
// and falls back to placeholder generation in environments without ffmpeg.

import { buildThumbnailKey, deleteObject } from "./s3-storage";

export const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm"];

export interface PlatformConstraints {
  maxDurationSeconds: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  aspectRatios?: string[];
}

export const PLATFORM_CONSTRAINTS: Record<string, PlatformConstraints> = {
  TIKTOK: {
    maxDurationSeconds: 600, // 10 minutes
    maxFileSizeBytes: 287 * 1024 * 1024, // 287MB
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    minWidth: 360,
    minHeight: 360,
    maxWidth: 4096,
    maxHeight: 4096,
    aspectRatios: ["9:16", "1:1", "16:9"],
  },
  INSTAGRAM: {
    maxDurationSeconds: 3600, // 60 minutes for reels
    maxFileSizeBytes: 4 * 1024 * 1024 * 1024, // 4GB
    allowedMimeTypes: ["video/mp4", "video/quicktime"],
    minWidth: 320,
    maxWidth: 1920,
    aspectRatios: ["1:1", "4:5", "9:16", "16:9"],
  },
  YOUTUBE: {
    maxDurationSeconds: 43200, // 12 hours
    maxFileSizeBytes: 256 * 1024 * 1024 * 1024, // 256GB
    allowedMimeTypes: ["video/mp4", "video/quicktime", "video/webm"],
    minWidth: 426,
    minHeight: 240,
    maxWidth: 7680,
    maxHeight: 4320,
    aspectRatios: ["16:9", "4:3"],
  },
};

export interface VideoMetadata {
  duration?: number; // seconds
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  fps?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMimeType(mimeType: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    errors.push(
      `File type "${mimeType}" is not supported. Allowed: MP4, MOV, WebM`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateExtension(filename: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    errors.push(
      `Extension "${ext}" is not supported. Allowed: .mp4, .mov, .webm`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateForPlatform(
  platform: string,
  metadata: VideoMetadata,
  fileSize: number
): ValidationResult {
  const constraints = PLATFORM_CONSTRAINTS[platform];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!constraints) {
    warnings.push(`No constraints defined for platform: ${platform}`);
    return { valid: true, errors, warnings };
  }

  if (fileSize > constraints.maxFileSizeBytes) {
    errors.push(
      `File too large for ${platform}: ${(fileSize / 1024 / 1024).toFixed(0)}MB exceeds ${(constraints.maxFileSizeBytes / 1024 / 1024).toFixed(0)}MB limit`
    );
  }

  if (metadata.duration !== undefined && metadata.duration > constraints.maxDurationSeconds) {
    errors.push(
      `Duration ${metadata.duration}s exceeds ${platform} limit of ${constraints.maxDurationSeconds}s`
    );
  }

  if (metadata.width !== undefined && constraints.minWidth !== undefined) {
    if (metadata.width < constraints.minWidth) {
      errors.push(
        `Width ${metadata.width}px is below ${platform} minimum of ${constraints.minWidth}px`
      );
    }
  }

  if (metadata.height !== undefined && constraints.minHeight !== undefined) {
    if (metadata.height < constraints.minHeight) {
      errors.push(
        `Height ${metadata.height}px is below ${platform} minimum of ${constraints.minHeight}px`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateForAllPlatforms(
  metadata: VideoMetadata,
  fileSize: number
): Record<string, ValidationResult> {
  const results: Record<string, ValidationResult> = {};

  for (const platform of Object.keys(PLATFORM_CONSTRAINTS)) {
    results[platform] = validateForPlatform(platform, metadata, fileSize);
  }

  return results;
}

export interface ThumbnailResult {
  key: string;
  generated: boolean;
  error?: string;
}

/**
 * Generate a thumbnail from a video file stored in S3.
 *
 * In production this requires ffmpeg to be available. The function downloads
 * the video, extracts a frame at `timestampSeconds`, and uploads the resulting
 * JPEG back to S3.
 *
 * When ffmpeg is unavailable the function returns a result indicating the
 * thumbnail was not generated rather than throwing.
 */
export async function generateThumbnail(
  userId: string,
  contentId: string,
  videoKey: string,
  timestampSeconds = 1
): Promise<ThumbnailResult> {
  const thumbnailKey = buildThumbnailKey(userId, contentId);

  try {
    // ffmpeg-based thumbnail generation
    // This is intentionally a stub — the actual implementation would use
    // child_process.spawn('ffmpeg', [...]) once ffmpeg is provisioned.
    const ffmpegAvailable = await checkFfmpegAvailable();

    if (!ffmpegAvailable) {
      return {
        key: thumbnailKey,
        generated: false,
        error: "ffmpeg not available in this environment",
      };
    }

    await runFfmpegThumbnail(videoKey, thumbnailKey, timestampSeconds);

    return { key: thumbnailKey, generated: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { key: thumbnailKey, generated: false, error: message };
  }
}

async function checkFfmpegAvailable(): Promise<boolean> {
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

async function runFfmpegThumbnail(
  _videoKey: string,
  _thumbnailKey: string,
  _timestampSeconds: number
): Promise<void> {
  // Stub: real implementation would:
  // 1. Get presigned URL for the video
  // 2. Stream video through ffmpeg: ffmpeg -ss <ts> -i <url> -frames:v 1 -q:v 2 output.jpg
  // 3. Upload resulting JPEG to thumbnailKey in S3
  throw new Error("ffmpeg thumbnail generation not yet implemented");
}

export async function deleteThumbnail(userId: string, contentId: string): Promise<void> {
  const key = buildThumbnailKey(userId, contentId);
  await deleteObject(key);
}
