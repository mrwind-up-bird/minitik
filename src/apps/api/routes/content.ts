import { NextRequest, NextResponse } from "next/server";
import { ContentStatus } from "@prisma/client";
import { prisma } from "@/shared/infrastructure/database/postgres";
import {
  initUpload,
  resumeUpload,
  recordChunkComplete,
  completeUpload,
  abortUpload,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from "@/domains/content/infrastructure/upload-service";
import { deleteObject } from "@/domains/content/infrastructure/s3-storage";
import { deleteThumbnail } from "@/domains/content/infrastructure/video-processor";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getUserId(req: NextRequest): string | null {
  return req.headers.get("x-user-id");
}

function parseContentStatus(value: unknown): ContentStatus | undefined {
  const valid: ContentStatus[] = [
    "DRAFT",
    "SCHEDULED",
    "PUBLISHING",
    "PUBLISHED",
    "FAILED",
  ];
  if (typeof value === "string" && valid.includes(value as ContentStatus)) {
    return value as ContentStatus;
  }
  return undefined;
}

// ─── POST /api/content/upload/init ───────────────────────────────────────────

/**
 * Initiate a chunked multipart upload.
 *
 * Body: { title, filename, mimeType, fileSize }
 * Returns: { contentId, uploadId, key, chunkUrls, totalChunks }
 */
export async function uploadInitHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { title, filename, mimeType, fileSize } = body as Record<string, unknown>;

  if (!title || typeof title !== "string") {
    return jsonError("title is required", 400);
  }
  if (!filename || typeof filename !== "string") {
    return jsonError("filename is required", 400);
  }
  if (!mimeType || typeof mimeType !== "string") {
    return jsonError(
      `mimeType is required. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
      400
    );
  }
  if (typeof fileSize !== "number" || fileSize <= 0) {
    return jsonError("fileSize must be a positive number (bytes)", 400);
  }
  if (fileSize > MAX_FILE_SIZE) {
    return jsonError(`File exceeds maximum size of 1GB`, 400);
  }

  try {
    const result = await initUpload(userId, title, filename, mimeType, fileSize);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload init failed";
    return jsonError(message, 400);
  }
}

// ─── GET /api/content/upload/:id/resume ──────────────────────────────────────

/**
 * Resume an interrupted upload. Returns presigned URLs for incomplete chunks.
 */
export async function uploadResumeHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Content ID is required", 400);

  try {
    const result = await resumeUpload(id, userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Resume failed";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// ─── PUT /api/content/upload/:id/chunk/:n ────────────────────────────────────

/**
 * Record a completed chunk. The actual binary upload goes directly to S3
 * using the presigned URL. This endpoint records the ETag returned by S3.
 *
 * Body: { etag: string }
 */
export async function chunkCompleteHandler(
  req: NextRequest,
  { params }: { params: { id: string; n: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id, n } = params;
  const partNumber = parseInt(n, 10);

  if (!id) return jsonError("Content ID is required", 400);
  if (isNaN(partNumber) || partNumber < 1) {
    return jsonError("Chunk number must be a positive integer", 400);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { etag } = body as Record<string, unknown>;
  if (!etag || typeof etag !== "string") {
    return jsonError("etag is required", 400);
  }

  try {
    const result = await recordChunkComplete(id, userId, partNumber, etag);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record chunk";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// ─── POST /api/content/upload/:id/complete ───────────────────────────────────

/**
 * Finalize the multipart upload once all chunks are recorded.
 */
export async function uploadCompleteHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Content ID is required", 400);

  try {
    const result = await completeUpload(id, userId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload completion failed";
    const status = message.includes("not found") ? 404 : 400;
    return jsonError(message, status);
  }
}

// ─── DELETE /api/content/upload/:id/abort ────────────────────────────────────

export async function uploadAbortHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Content ID is required", 400);

  try {
    await abortUpload(id, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Abort failed";
    return jsonError(message, 400);
  }
}

// ─── GET /api/content ────────────────────────────────────────────────────────

/**
 * List content with optional filters.
 *
 * Query params:
 *   status - ContentStatus filter
 *   platform - Platform filter (checks publications)
 *   search - Title search
 *   sortBy - "createdAt" | "scheduledAt" | "title" (default: "createdAt")
 *   sortOrder - "asc" | "desc" (default: "desc")
 *   page - page number (default: 1)
 *   limit - results per page (default: 20, max: 100)
 */
export async function listContentHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { searchParams } = new URL(req.url);
  const status = parseContentStatus(searchParams.get("status"));
  const search = searchParams.get("search") ?? undefined;
  const sortBy = searchParams.get("sortBy") ?? "createdAt";
  const sortOrder = (searchParams.get("sortOrder") ?? "desc") as "asc" | "desc";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
  const skip = (page - 1) * limit;

  const allowedSortFields = ["createdAt", "scheduledAt", "title", "updatedAt"];
  const orderField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";

  const where = {
    userId,
    ...(status ? { status } : {}),
    ...(search
      ? {
          title: { contains: search, mode: "insensitive" as const },
        }
      : {}),
  };

  try {
    const [items, total] = await Promise.all([
      prisma.content.findMany({
        where,
        orderBy: { [orderField]: sortOrder },
        skip,
        take: limit,
        include: {
          publications: {
            select: {
              id: true,
              platform: true,
              status: true,
              publishedAt: true,
            },
          },
          _count: { select: { publications: true } },
        },
      }),
      prisma.content.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        fileSize: item.fileSize?.toString() ?? null,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list content";
    return jsonError(message, 500);
  }
}

// ─── PATCH /api/content/:id ───────────────────────────────────────────────────

/**
 * Update content metadata (title, description, scheduledAt, status).
 */
export async function updateContentHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Content ID is required", 400);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { title, description, scheduledAt, status } = body as Record<string, unknown>;

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      return jsonError("title must be a non-empty string", 400);
    }
    updateData.title = title.trim();
  }
  if (description !== undefined) {
    updateData.description = typeof description === "string" ? description : null;
  }
  if (scheduledAt !== undefined) {
    const date = new Date(scheduledAt as string);
    if (isNaN(date.getTime())) {
      return jsonError("scheduledAt must be a valid ISO date string", 400);
    }
    updateData.scheduledAt = date;
    updateData.status = "SCHEDULED";
  }
  if (status !== undefined) {
    const parsed = parseContentStatus(status);
    if (!parsed) {
      return jsonError(
        "Invalid status. Allowed: DRAFT, SCHEDULED, PUBLISHING, PUBLISHED, FAILED",
        400
      );
    }
    updateData.status = parsed;
  }

  if (Object.keys(updateData).length === 0) {
    return jsonError("No valid fields to update", 400);
  }

  try {
    const existing = await prisma.content.findFirst({ where: { id, userId } });
    if (!existing) return jsonError("Content not found", 404);

    const updated = await prisma.content.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      ...updated,
      fileSize: updated.fileSize?.toString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Update failed";
    return jsonError(message, 500);
  }
}

// ─── DELETE /api/content/:id ──────────────────────────────────────────────────

export async function deleteContentHandler(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  const { id } = params;
  if (!id) return jsonError("Content ID is required", 400);

  try {
    const content = await prisma.content.findFirst({ where: { id, userId } });
    if (!content) return jsonError("Content not found", 404);

    // Delete files from S3 (best-effort; do not block on errors)
    const s3Cleanup = async () => {
      if (content.filePath) {
        await deleteObject(content.filePath).catch(() => undefined);
      }
      if (content.thumbnailPath) {
        await deleteObject(content.thumbnailPath).catch(() => undefined);
      } else {
        await deleteThumbnail(userId, id).catch(() => undefined);
      }
    };

    await Promise.all([
      prisma.content.delete({ where: { id } }),
      s3Cleanup(),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return jsonError(message, 500);
  }
}

// ─── POST /api/content/bulk/delete ───────────────────────────────────────────

/**
 * Bulk delete content items. Body: { ids: string[] }
 */
export async function bulkDeleteHandler(req: NextRequest) {
  const userId = getUserId(req);
  if (!userId) return jsonError("Unauthorized", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { ids } = body as Record<string, unknown>;
  if (!Array.isArray(ids) || ids.length === 0) {
    return jsonError("ids must be a non-empty array", 400);
  }

  try {
    const items = await prisma.content.findMany({
      where: { id: { in: ids as string[] }, userId },
      select: { id: true, filePath: true, thumbnailPath: true },
    });

    if (items.length === 0) return jsonError("No matching content found", 404);

    await prisma.content.deleteMany({
      where: { id: { in: items.map((i) => i.id) } },
    });

    // Best-effort S3 cleanup
    await Promise.allSettled(
      items.flatMap((item) => [
        item.filePath ? deleteObject(item.filePath) : Promise.resolve(),
        deleteObject(buildThumbnailKey(userId, item.id)),
      ])
    );

    return NextResponse.json({ deleted: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk delete failed";
    return jsonError(message, 500);
  }
}

function buildThumbnailKey(userId: string, contentId: string): string {
  return `thumbnails/${userId}/${contentId}/thumbnail.jpg`;
}
