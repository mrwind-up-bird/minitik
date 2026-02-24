import { prisma } from "@/shared/infrastructure/database/postgres";
import { ContentStatus, Prisma } from "@prisma/client";
import {
  initiateMultipartUpload,
  getPresignedChunkUrls,
  completeMultipartUpload,
  abortMultipartUpload,
  buildContentKey,
  PresignedChunkUrl,
  CompletedPart,
} from "./s3-storage";

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB
export const ALLOWED_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export interface UploadInitResult {
  contentId: string;
  uploadId: string;
  key: string;
  chunkUrls: PresignedChunkUrl[];
  totalChunks: number;
}

export interface UploadState {
  contentId: string;
  uploadId: string;
  key: string;
  totalChunks: number;
  completedChunks: number[];
  parts: CompletedPart[];
}

export function validateFile(filename: string, mimeType: string, fileSize: number): void {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported file type: ${mimeType}. Allowed types: MP4, MOV, WebM`
    );
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(fileSize / 1024 / 1024).toFixed(1)}MB. Maximum is 1GB`
    );
  }

  if (fileSize <= 0) {
    throw new Error("File size must be greater than 0");
  }
}

export function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

export async function initUpload(
  userId: string,
  title: string,
  filename: string,
  mimeType: string,
  fileSize: number
): Promise<UploadInitResult> {
  validateFile(filename, mimeType, fileSize);

  // Create content record first to get the ID
  const content = await prisma.content.create({
    data: {
      userId,
      title,
      mimeType,
      fileSize: BigInt(fileSize),
      status: ContentStatus.DRAFT,
      metadata: {
        uploadState: "pending",
        originalFilename: filename,
      },
    },
  });

  const key = buildContentKey(userId, content.id, filename);
  const { uploadId } = await initiateMultipartUpload(key, mimeType);
  const totalChunks = calculateTotalChunks(fileSize);
  const chunkUrls = await getPresignedChunkUrls(key, uploadId, totalChunks);

  // Store upload state in metadata
  await prisma.content.update({
    where: { id: content.id },
    data: {
      filePath: key,
      metadata: {
        uploadState: "uploading",
        originalFilename: filename,
        uploadId,
        totalChunks,
        completedChunks: [],
        parts: [],
      },
    },
  });

  return {
    contentId: content.id,
    uploadId,
    key,
    chunkUrls,
    totalChunks,
  };
}

export async function getUploadState(contentId: string, userId: string): Promise<UploadState> {
  const content = await prisma.content.findFirst({
    where: { id: contentId, userId },
  });

  if (!content) {
    throw new Error("Content not found");
  }

  const meta = content.metadata as Record<string, unknown>;

  if (!meta?.uploadId) {
    throw new Error("Upload not initialized for this content");
  }

  return {
    contentId: content.id,
    uploadId: meta.uploadId as string,
    key: content.filePath ?? "",
    totalChunks: (meta.totalChunks as number) ?? 0,
    completedChunks: (meta.completedChunks as number[]) ?? [],
    parts: (meta.parts as CompletedPart[]) ?? [],
  };
}

export async function resumeUpload(contentId: string, userId: string): Promise<{
  uploadId: string;
  key: string;
  chunkUrls: PresignedChunkUrl[];
  completedChunks: number[];
  totalChunks: number;
}> {
  const state = await getUploadState(contentId, userId);
  const pendingChunks = Array.from({ length: state.totalChunks }, (_, i) => i + 1)
    .filter((n) => !state.completedChunks.includes(n));

  const chunkUrls = await Promise.all(
    pendingChunks.map(async (partNumber) => {
      const { getPresignedChunkUrl } = await import("./s3-storage");
      const url = await getPresignedChunkUrl(state.key, state.uploadId, partNumber);
      return { partNumber, url };
    })
  );

  return {
    uploadId: state.uploadId,
    key: state.key,
    chunkUrls,
    completedChunks: state.completedChunks,
    totalChunks: state.totalChunks,
  };
}

export async function recordChunkComplete(
  contentId: string,
  userId: string,
  partNumber: number,
  etag: string
): Promise<{ completedChunks: number[]; totalChunks: number; isComplete: boolean }> {
  const content = await prisma.content.findFirst({
    where: { id: contentId, userId },
  });

  if (!content) {
    throw new Error("Content not found");
  }

  const meta = content.metadata as Record<string, unknown>;
  const completedChunks = ((meta.completedChunks as number[]) ?? []).concat(partNumber);
  const parts = ((meta.parts as CompletedPart[]) ?? []).concat({ partNumber, etag });
  const totalChunks = (meta.totalChunks as number) ?? 0;

  await prisma.content.update({
    where: { id: contentId },
    data: {
      metadata: {
        ...meta,
        completedChunks,
        parts: parts as unknown as Prisma.InputJsonValue,
        uploadState: "uploading",
      } as Prisma.InputJsonValue,
    },
  });

  return {
    completedChunks,
    totalChunks,
    isComplete: completedChunks.length >= totalChunks,
  };
}

export async function completeUpload(
  contentId: string,
  userId: string
): Promise<{ location: string }> {
  const state = await getUploadState(contentId, userId);

  if (state.completedChunks.length < state.totalChunks) {
    throw new Error(
      `Upload incomplete: ${state.completedChunks.length}/${state.totalChunks} chunks`
    );
  }

  const location = await completeMultipartUpload(state.key, state.uploadId, state.parts);

  const meta = await prisma.content
    .findUnique({ where: { id: contentId } })
    .then((c) => (c?.metadata as Record<string, unknown>) ?? {});

  await prisma.content.update({
    where: { id: contentId },
    data: {
      metadata: {
        ...meta,
        uploadState: "complete",
        location,
      },
    },
  });

  return { location };
}

export async function abortUpload(contentId: string, userId: string): Promise<void> {
  const state = await getUploadState(contentId, userId);
  await abortMultipartUpload(state.key, state.uploadId);

  await prisma.content.update({
    where: { id: contentId },
    data: {
      metadata: {
        uploadState: "aborted",
      },
    },
  });
}
