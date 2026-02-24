import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/apps/web/app/api/auth/[...nextauth]/route";
import {
  publishContent,
  getPublishingStatus,
  rollbackPublishing,
  PublishingValidationError,
  PublishingAuthorizationError,
} from "@/domains/publishing/application/publishing-orchestrator";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserId(req: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

function errorResponse(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

// ─── POST /api/publishing/publish ─────────────────────────────────────────────
// Body: { contentId: string; accountIds: string[] }

export async function handlePublish(req: NextRequest): Promise<NextResponse> {
  const userId = await getUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  const body = await req.json().catch(() => null);
  if (!body) return errorResponse("Invalid request body", 400);

  const { contentId, accountIds } = body as {
    contentId?: unknown;
    accountIds?: unknown;
  };

  if (!contentId || typeof contentId !== "string") {
    return errorResponse("contentId is required", 400);
  }
  if (
    !Array.isArray(accountIds) ||
    accountIds.length === 0 ||
    accountIds.some((id) => typeof id !== "string")
  ) {
    return errorResponse("accountIds must be a non-empty array of strings", 400);
  }

  try {
    const result = await publishContent({ contentId, accountIds, userId });
    return NextResponse.json({ result }, { status: 202 });
  } catch (err) {
    if (err instanceof PublishingValidationError) {
      return NextResponse.json(
        { error: err.message, details: err.details },
        { status: 422 }
      );
    }
    if (err instanceof PublishingAuthorizationError) {
      return errorResponse(err.message, 403);
    }
    if (err instanceof Error && err.message.includes("not found")) {
      return errorResponse(err.message, 404);
    }
    console.error("[publishing] publish error:", err);
    return errorResponse("Publishing failed", 500);
  }
}

// ─── GET /api/publishing/:contentId ──────────────────────────────────────────

export async function handleGetPublishingStatus(
  req: NextRequest,
  contentId: string
): Promise<NextResponse> {
  const userId = await getUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  try {
    const publications = await getPublishingStatus(contentId, userId);
    if (!publications) return errorResponse("Content not found", 404);
    return NextResponse.json({ publications });
  } catch (err) {
    if (err instanceof PublishingAuthorizationError) {
      return errorResponse(err.message, 403);
    }
    console.error("[publishing] status error:", err);
    return errorResponse("Failed to retrieve publishing status", 500);
  }
}

// ─── POST /api/publishing/:contentId/rollback ─────────────────────────────────

export async function handleRollback(
  req: NextRequest,
  contentId: string
): Promise<NextResponse> {
  const userId = await getUserId(req);
  if (!userId) return errorResponse("Unauthorized", 401);

  try {
    const result = await rollbackPublishing(contentId, userId);
    return NextResponse.json({ result });
  } catch (err) {
    if (err instanceof PublishingAuthorizationError) {
      return errorResponse(err.message, 403);
    }
    if (err instanceof Error && err.message.includes("not found")) {
      return errorResponse(err.message, 404);
    }
    console.error("[publishing] rollback error:", err);
    return errorResponse("Rollback failed", 500);
  }
}
