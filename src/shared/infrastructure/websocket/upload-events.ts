// WebSocket event types and helpers for upload progress
// These are consumed by the frontend and emitted by the API layer.

export const UPLOAD_EVENT_TYPES = {
  CHUNK_COMPLETE: "upload:chunk_complete",
  PROGRESS: "upload:progress",
  COMPLETE: "upload:complete",
  ERROR: "upload:error",
  ABORTED: "upload:aborted",
} as const;

export type UploadEventType = (typeof UPLOAD_EVENT_TYPES)[keyof typeof UPLOAD_EVENT_TYPES];

export interface ChunkCompleteEvent {
  type: typeof UPLOAD_EVENT_TYPES.CHUNK_COMPLETE;
  contentId: string;
  partNumber: number;
  completedChunks: number;
  totalChunks: number;
  bytesUploaded: number;
  totalBytes: number;
}

export interface ProgressEvent {
  type: typeof UPLOAD_EVENT_TYPES.PROGRESS;
  contentId: string;
  completedChunks: number;
  totalChunks: number;
  bytesUploaded: number;
  totalBytes: number;
  percentComplete: number;
  speedBytesPerSecond: number;
  etaSeconds: number;
}

export interface UploadCompleteEvent {
  type: typeof UPLOAD_EVENT_TYPES.COMPLETE;
  contentId: string;
  location: string;
  totalBytes: number;
  durationMs: number;
}

export interface UploadErrorEvent {
  type: typeof UPLOAD_EVENT_TYPES.ERROR;
  contentId: string;
  error: string;
  partNumber?: number;
}

export interface UploadAbortedEvent {
  type: typeof UPLOAD_EVENT_TYPES.ABORTED;
  contentId: string;
}

export type UploadEvent =
  | ChunkCompleteEvent
  | ProgressEvent
  | UploadCompleteEvent
  | UploadErrorEvent
  | UploadAbortedEvent;

export function buildChunkCompleteEvent(
  contentId: string,
  partNumber: number,
  completedChunks: number,
  totalChunks: number,
  chunkSize: number,
  totalBytes: number
): ChunkCompleteEvent {
  return {
    type: UPLOAD_EVENT_TYPES.CHUNK_COMPLETE,
    contentId,
    partNumber,
    completedChunks,
    totalChunks,
    bytesUploaded: Math.min(completedChunks * chunkSize, totalBytes),
    totalBytes,
  };
}

export function buildProgressEvent(
  contentId: string,
  completedChunks: number,
  totalChunks: number,
  bytesUploaded: number,
  totalBytes: number,
  startedAtMs: number
): ProgressEvent {
  const now = Date.now();
  const elapsedMs = now - startedAtMs;
  const speedBytesPerSecond =
    elapsedMs > 0 ? Math.round((bytesUploaded / elapsedMs) * 1000) : 0;
  const remainingBytes = totalBytes - bytesUploaded;
  const etaSeconds =
    speedBytesPerSecond > 0 ? Math.round(remainingBytes / speedBytesPerSecond) : 0;

  return {
    type: UPLOAD_EVENT_TYPES.PROGRESS,
    contentId,
    completedChunks,
    totalChunks,
    bytesUploaded,
    totalBytes,
    percentComplete:
      totalBytes > 0 ? Math.round((bytesUploaded / totalBytes) * 100) : 0,
    speedBytesPerSecond,
    etaSeconds,
  };
}

export function buildCompleteEvent(
  contentId: string,
  location: string,
  totalBytes: number,
  startedAtMs: number
): UploadCompleteEvent {
  return {
    type: UPLOAD_EVENT_TYPES.COMPLETE,
    contentId,
    location,
    totalBytes,
    durationMs: Date.now() - startedAtMs,
  };
}

export function buildErrorEvent(
  contentId: string,
  error: string,
  partNumber?: number
): UploadErrorEvent {
  return {
    type: UPLOAD_EVENT_TYPES.ERROR,
    contentId,
    error,
    partNumber,
  };
}

export function buildAbortedEvent(contentId: string): UploadAbortedEvent {
  return {
    type: UPLOAD_EVENT_TYPES.ABORTED,
    contentId,
  };
}

/**
 * Utility to broadcast an upload event to all WebSocket clients subscribed
 * to a specific content ID. Actual WebSocket server integration is handled
 * by the consuming app layer.
 */
export function serializeEvent(event: UploadEvent): string {
  return JSON.stringify(event);
}

export function parseEvent(raw: string): UploadEvent {
  return JSON.parse(raw) as UploadEvent;
}
