import { prisma } from "@/shared/infrastructure/database/postgres";
import { Platform, PublicationStatus, ContentStatus } from "@prisma/client";
import { PublicationStatusSnapshot } from "../domain/publishing-result";

// ─── Create publication records (one per account) ─────────────────────────────

export async function createPublicationRecords(
  contentId: string,
  accountIds: string[],
  platforms: Platform[]
): Promise<string[]> {
  if (accountIds.length !== platforms.length) {
    throw new Error("accountIds and platforms arrays must have the same length");
  }

  const records = await prisma.$transaction(
    accountIds.map((accountId, i) =>
      prisma.publication.create({
        data: {
          contentId,
          accountId,
          platform: platforms[i],
          status: PublicationStatus.QUEUED,
        },
      })
    )
  );

  return records.map((r) => r.id);
}

// ─── Status transitions ───────────────────────────────────────────────────────

export async function markPublicationPublishing(publicationId: string): Promise<void> {
  await prisma.publication.update({
    where: { id: publicationId },
    data: { status: PublicationStatus.PUBLISHING },
  });
}

export async function markPublicationSuccess(
  publicationId: string,
  platformPostId: string | undefined,
  publishedAt: Date
): Promise<void> {
  await prisma.publication.update({
    where: { id: publicationId },
    data: {
      status: PublicationStatus.PUBLISHED,
      platformPostId: platformPostId ?? null,
      publishedAt,
      error: null,
    },
  });
}

export async function markPublicationFailed(
  publicationId: string,
  error: string
): Promise<void> {
  await prisma.publication.update({
    where: { id: publicationId },
    data: {
      status: PublicationStatus.FAILED,
      error,
    },
  });
}

// ─── Content status management ────────────────────────────────────────────────

export async function markContentPublishing(contentId: string): Promise<void> {
  await prisma.content.update({
    where: { id: contentId },
    data: { status: ContentStatus.PUBLISHING },
  });
}

export async function finalizeContentStatus(contentId: string): Promise<void> {
  const publications = await prisma.publication.findMany({
    where: { contentId },
    select: { status: true },
  });

  const hasPublished = publications.some((p) => p.status === PublicationStatus.PUBLISHED);
  const allFailed = publications.every((p) => p.status === PublicationStatus.FAILED);

  const newStatus = allFailed
    ? ContentStatus.FAILED
    : hasPublished
      ? ContentStatus.PUBLISHED
      : ContentStatus.FAILED;

  await prisma.content.update({
    where: { id: contentId },
    data: {
      status: newStatus,
      publishedAt: newStatus === ContentStatus.PUBLISHED ? new Date() : undefined,
    },
  });
}

// ─── Rollback (delete posts within 5 minutes of publishing) ──────────────────

const ROLLBACK_WINDOW_MS = 5 * 60 * 1000;

export async function getRollbackEligiblePublications(
  contentId: string
): Promise<Array<{ id: string; platformPostId: string; platform: Platform; accountId: string }>> {
  const cutoff = new Date(Date.now() - ROLLBACK_WINDOW_MS);

  const pubs = await prisma.publication.findMany({
    where: {
      contentId,
      status: PublicationStatus.PUBLISHED,
      platformPostId: { not: null },
      publishedAt: { gte: cutoff },
    },
    select: { id: true, platformPostId: true, platform: true, accountId: true },
  });

  return pubs.filter((p): p is typeof p & { platformPostId: string } =>
    p.platformPostId !== null
  );
}

export async function markPublicationsRolledBack(publicationIds: string[]): Promise<void> {
  if (publicationIds.length === 0) return;
  await prisma.publication.updateMany({
    where: { id: { in: publicationIds } },
    data: { status: PublicationStatus.FAILED, error: "Rolled back by user" },
  });
}

// ─── Read model queries ────────────────────────────────────────────────────────

export async function getPublicationStatus(
  publicationId: string
): Promise<PublicationStatusSnapshot | null> {
  const pub = await prisma.publication.findUnique({
    where: { id: publicationId },
  });
  if (!pub) return null;
  return {
    publicationId: pub.id,
    contentId: pub.contentId,
    accountId: pub.accountId,
    platform: pub.platform,
    status: pub.status,
    platformPostId: pub.platformPostId,
    publishedAt: pub.publishedAt,
    error: pub.error,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
  };
}

export async function getPublicationsForContent(
  contentId: string
): Promise<PublicationStatusSnapshot[]> {
  const pubs = await prisma.publication.findMany({
    where: { contentId },
    orderBy: { createdAt: "asc" },
  });
  return pubs.map((pub) => ({
    publicationId: pub.id,
    contentId: pub.contentId,
    accountId: pub.accountId,
    platform: pub.platform,
    status: pub.status,
    platformPostId: pub.platformPostId,
    publishedAt: pub.publishedAt,
    error: pub.error,
    createdAt: pub.createdAt,
    updatedAt: pub.updatedAt,
  }));
}

export async function getPublishingHistory(
  userId: string,
  limit = 20,
  offset = 0
): Promise<Array<{ contentId: string; title: string; publications: PublicationStatusSnapshot[] }>> {
  const contents = await prisma.content.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    skip: offset,
    include: {
      publications: { orderBy: { createdAt: "asc" } },
    },
  });

  return contents.map((c) => ({
    contentId: c.id,
    title: c.title,
    publications: c.publications.map((pub) => ({
      publicationId: pub.id,
      contentId: pub.contentId,
      accountId: pub.accountId,
      platform: pub.platform,
      status: pub.status,
      platformPostId: pub.platformPostId,
      publishedAt: pub.publishedAt,
      error: pub.error,
      createdAt: pub.createdAt,
      updatedAt: pub.updatedAt,
    })),
  }));
}
