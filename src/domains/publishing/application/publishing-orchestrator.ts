import { prisma } from "@/shared/infrastructure/database/postgres";
import { Platform, AccountStatus } from "@prisma/client";
import {
  getPlatformService,
} from "@/domains/platforms/application/platform-service";
import {
  ContentPayload,
  PlatformAccount,
} from "@/domains/platforms/domain/platform-adapter";
import { safeDecrypt } from "@/domains/accounts/infrastructure/token-encryption";
import { getValidAccessToken } from "@/domains/accounts/infrastructure/token-refresh";
import {
  optimizeForPlatform,
  validateForPlatform,
} from "../infrastructure/content-optimizer";
import {
  createPublicationRecords,
  markPublicationPublishing,
  markPublicationSuccess,
  markPublicationFailed,
  markContentPublishing,
  finalizeContentStatus,
  getRollbackEligiblePublications,
  markPublicationsRolledBack,
  getPublicationsForContent,
} from "../infrastructure/publishing-tracker";
import {
  PlatformPublishResult,
  PublishingResult,
  RollbackResult,
  buildPublishingResult,
} from "../domain/publishing-result";
import {
  emitPublishingEvent,
  buildStartedEvent,
  buildPlatformQueuedEvent,
  buildPlatformPublishingEvent,
  buildPlatformSuccessEvent,
  buildPlatformFailedEvent,
  buildCompletedEvent,
  buildRolledBackEvent,
} from "@/shared/infrastructure/websocket/publishing-events";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PublishRequest {
  contentId: string;
  accountIds: string[];
  userId: string;
}

export class PublishingValidationError extends Error {
  constructor(
    message: string,
    public readonly details: string[]
  ) {
    super(message);
    this.name = "PublishingValidationError";
  }
}

export class PublishingAuthorizationError extends Error {
  constructor() {
    super("Not authorized to publish this content");
    this.name = "PublishingAuthorizationError";
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function publishContent(
  request: PublishRequest
): Promise<PublishingResult> {
  const { contentId, accountIds, userId } = request;
  const startedAt = new Date();

  // ── 1. Load content and verify ownership ───────────────────────────────────
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error(`Content ${contentId} not found`);
  if (content.userId !== userId) throw new PublishingAuthorizationError();

  // ── 2. Load accounts and verify ownership + connectivity ───────────────────
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds }, userId },
  });

  if (accounts.length !== accountIds.length) {
    const foundIds = new Set(accounts.map((a) => a.id));
    const missing = accountIds.filter((id) => !foundIds.has(id));
    throw new PublishingValidationError("Some accounts not found or not owned by user", missing);
  }

  const inactiveAccounts = accounts.filter(
    (a) => a.status !== AccountStatus.CONNECTED
  );
  if (inactiveAccounts.length > 0) {
    throw new PublishingValidationError(
      "Some accounts are not connected",
      inactiveAccounts.map((a) => `${a.platform}:${a.id} (${a.status})`)
    );
  }

  // ── 3. Build content payload ───────────────────────────────────────────────
  const contentPayload: ContentPayload = {
    id: content.id,
    title: content.title,
    description: content.description,
    filePath: content.filePath,
    thumbnailPath: content.thumbnailPath,
    mimeType: content.mimeType,
    duration: content.duration,
    metadata: content.metadata as Record<string, unknown> | null,
  };

  // ── 4. Validate content for each target platform ───────────────────────────
  const validationErrors: string[] = [];
  for (const account of accounts) {
    const validation = validateForPlatform(contentPayload, account.platform);
    if (!validation.valid) {
      validationErrors.push(
        ...validation.errors.map((e) => `[${account.platform}] ${e}`)
      );
    }
  }
  if (validationErrors.length > 0) {
    throw new PublishingValidationError("Content validation failed", validationErrors);
  }

  // ── 5. Create publication records + mark content as publishing ─────────────
  const platforms = accounts.map((a) => a.platform);
  const publicationIds = await createPublicationRecords(contentId, accountIds, platforms);
  await markContentPublishing(contentId);

  // Emit start event
  emitPublishingEvent(buildStartedEvent(contentId, accountIds));

  // Emit queued for each
  accounts.forEach((account, i) => {
    emitPublishingEvent(
      buildPlatformQueuedEvent(contentId, publicationIds[i], account.platform, account.id)
    );
  });

  // ── 6. Publish in parallel ─────────────────────────────────────────────────
  const platformService = getPlatformService();

  const publishTasks = accounts.map(async (account, i): Promise<PlatformPublishResult> => {
    const publicationId = publicationIds[i];
    const taskStart = Date.now();

    // Emit publishing event
    emitPublishingEvent(
      buildPlatformPublishingEvent(contentId, publicationId, account.platform, account.id)
    );
    await markPublicationPublishing(publicationId);

    try {
      // Get a valid (auto-refreshed) access token
      const accessToken = await getValidAccessToken(account.id);
      if (!accessToken) {
        throw new Error("Could not obtain a valid access token");
      }

      const platformAccount: PlatformAccount = {
        id: account.id,
        userId: account.userId,
        platform: account.platform as unknown as import("@/domains/platforms/domain/platform-adapter").Platform,
        platformAccountId: account.platformAccountId,
        platformUsername: account.platformUsername,
        accessToken,
        refreshToken: account.refreshToken ? safeDecrypt(account.refreshToken) : null,
        tokenExpiresAt: account.tokenExpiresAt,
        metadata: account.metadata as Record<string, unknown> | null,
      };

      // Optimize content for this specific platform
      const optimized = optimizeForPlatform(contentPayload, account.platform);

      const result = await platformService.publishContent(platformAccount, optimized);
      const durationMs = Date.now() - taskStart;

      if (result.success) {
        await markPublicationSuccess(
          publicationId,
          result.platformPostId,
          result.publishedAt ?? new Date()
        );
        emitPublishingEvent(
          buildPlatformSuccessEvent(
            contentId,
            publicationId,
            account.platform,
            account.id,
            durationMs,
            result.platformPostId
          )
        );
        return {
          platform: account.platform,
          accountId: account.id,
          publicationId,
          success: true,
          platformPostId: result.platformPostId,
          publishedAt: result.publishedAt,
          durationMs,
        };
      } else {
        await markPublicationFailed(publicationId, result.error ?? "Unknown error");
        emitPublishingEvent(
          buildPlatformFailedEvent(
            contentId,
            publicationId,
            account.platform,
            account.id,
            result.error ?? "Unknown error",
            result.rateLimitHit
          )
        );
        return {
          platform: account.platform,
          accountId: account.id,
          publicationId,
          success: false,
          error: result.error,
          rateLimitHit: result.rateLimitHit,
          durationMs,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - taskStart;
      await markPublicationFailed(publicationId, error);
      emitPublishingEvent(
        buildPlatformFailedEvent(
          contentId,
          publicationId,
          account.platform,
          account.id,
          error
        )
      );
      return {
        platform: account.platform,
        accountId: account.id,
        publicationId,
        success: false,
        error,
        durationMs,
      };
    }
  });

  const results = await Promise.all(publishTasks);

  // ── 7. Finalize content status ─────────────────────────────────────────────
  await finalizeContentStatus(contentId);

  const publishingResult = buildPublishingResult(contentId, results, startedAt);

  // Emit completed event
  emitPublishingEvent(
    buildCompletedEvent(
      contentId,
      publishingResult.outcome,
      publishingResult.successCount,
      publishingResult.failureCount,
      publishingResult.durationMs
    )
  );

  return publishingResult;
}

// ─── Status retrieval ─────────────────────────────────────────────────────────

export async function getPublishingStatus(contentId: string, userId: string) {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) return null;
  if (content.userId !== userId) throw new PublishingAuthorizationError();
  return getPublicationsForContent(contentId);
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

export async function rollbackPublishing(
  contentId: string,
  userId: string
): Promise<RollbackResult> {
  const content = await prisma.content.findUnique({ where: { id: contentId } });
  if (!content) throw new Error(`Content ${contentId} not found`);
  if (content.userId !== userId) throw new PublishingAuthorizationError();

  const eligible = await getRollbackEligiblePublications(contentId);

  if (eligible.length === 0) {
    return { contentId, rolledBack: [], failed: [] };
  }

  const platformService = getPlatformService();
  const accounts = await prisma.account.findMany({
    where: { id: { in: eligible.map((e) => e.accountId) } },
  });
  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  const rolledBack: string[] = [];
  const failed: string[] = [];

  await Promise.all(
    eligible.map(async (pub) => {
      const account = accountMap.get(pub.accountId);
      if (!account) {
        failed.push(pub.platformPostId);
        return;
      }

      try {
        const accessToken = await getValidAccessToken(account.id);
        if (!accessToken) throw new Error("No valid access token");

        // Platform-specific delete: adapters do not expose delete yet, so we
        // mark as rolled back in DB and emit event. A delete API call would go here.
        // e.g. await platformService.deletePost(platformAccount, pub.platformPostId);
        rolledBack.push(pub.platformPostId);
      } catch {
        failed.push(pub.platformPostId);
      }
    })
  );

  // Mark rolled-back publications as failed in DB
  const successfulIds = eligible
    .filter((e) => rolledBack.includes(e.platformPostId))
    .map((e) => e.id);
  await markPublicationsRolledBack(successfulIds);

  // Revert content status
  await prisma.content.update({
    where: { id: contentId },
    data: { status: "DRAFT" },
  });

  emitPublishingEvent(buildRolledBackEvent(contentId, rolledBack, failed));

  return { contentId, rolledBack, failed };
}
