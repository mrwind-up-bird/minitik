import { Platform } from "@prisma/client";
import { ContentPayload } from "@/domains/platforms/domain/platform-adapter";

// ─── Platform constraints ─────────────────────────────────────────────────────

interface PlatformConstraints {
  maxCaptionLength: number;
  maxDescriptionLength: number;
  maxDurationSeconds: number | null;
  aspectRatios: string[];          // preferred order e.g. ["9:16", "1:1"]
  maxHashtags: number;
  maxTitleLength: number;
}

const CONSTRAINTS: Record<Platform, PlatformConstraints> = {
  TIKTOK: {
    maxCaptionLength: 2200,
    maxDescriptionLength: 2200,
    maxDurationSeconds: 180,
    aspectRatios: ["9:16"],
    maxHashtags: 30,
    maxTitleLength: 150,
  },
  INSTAGRAM: {
    maxCaptionLength: 2200,
    maxDescriptionLength: 2200,
    maxDurationSeconds: 60,      // Reels default; Stories: 15s
    aspectRatios: ["9:16", "1:1"],
    maxHashtags: 30,
    maxTitleLength: 150,
  },
  YOUTUBE: {
    maxCaptionLength: 5000,
    maxDescriptionLength: 5000,
    maxDurationSeconds: null,    // No hard cap via API for YouTube
    aspectRatios: ["16:9"],
    maxHashtags: 500,
    maxTitleLength: 100,
  },
};

// ─── Optimized payload returned by the optimizer ──────────────────────────────

export interface OptimizedContent extends ContentPayload {
  optimizedTitle: string;
  optimizedDescription: string;
  hashtags: string[];
  warnings: string[];
}

// ─── Validation result ────────────────────────────────────────────────────────

export interface ContentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function extractHashtags(text: string): string[] {
  return (text.match(/#[\w\u00C0-\u024F]+/g) ?? []).map((t) => t.toLowerCase());
}

function stripHashtags(text: string): string {
  return text.replace(/#[\w\u00C0-\u024F]+/g, "").replace(/\s{2,}/g, " ").trim();
}

function appendHashtags(base: string, tags: string[], maxTotal: number): string {
  const available = maxTotal - base.length;
  if (available <= 0 || tags.length === 0) return base;
  const tagStr = tags.join(" ");
  if (tagStr.length + 1 <= available) return `${base}\n\n${tagStr}`;
  // Fit as many as possible
  let fitted = "";
  for (const tag of tags) {
    if (fitted.length + tag.length + 2 > available) break;
    fitted += (fitted ? " " : "") + tag;
  }
  return fitted ? `${base}\n\n${fitted}` : base;
}

// ─── Main optimizer ───────────────────────────────────────────────────────────

/**
 * Adapts content for a specific platform, enforcing its constraints.
 * Never throws — warnings are accumulated and returned.
 */
export function optimizeForPlatform(
  content: ContentPayload,
  platform: Platform
): OptimizedContent {
  const constraints = CONSTRAINTS[platform];
  const warnings: string[] = [];

  // ── Title ──
  let optimizedTitle = content.title ?? "";
  if (optimizedTitle.length > constraints.maxTitleLength) {
    warnings.push(
      `Title truncated from ${optimizedTitle.length} to ${constraints.maxTitleLength} chars for ${platform}`
    );
    optimizedTitle = truncate(optimizedTitle, constraints.maxTitleLength);
  }

  // ── Description / Caption ──
  const rawDescription = content.description ?? "";
  const hashtags = extractHashtags(rawDescription);
  const bodyWithoutTags = stripHashtags(rawDescription);

  // Limit hashtag count
  const allowedTags = hashtags.slice(0, constraints.maxHashtags);
  if (hashtags.length > constraints.maxHashtags) {
    warnings.push(
      `Hashtag count reduced from ${hashtags.length} to ${constraints.maxHashtags} for ${platform}`
    );
  }

  // Build description: body + hashtags, within maxDescriptionLength
  const withTags = appendHashtags(
    bodyWithoutTags,
    allowedTags,
    constraints.maxDescriptionLength
  );

  let optimizedDescription = withTags;
  if (withTags.length > constraints.maxDescriptionLength) {
    warnings.push(
      `Description truncated to ${constraints.maxDescriptionLength} chars for ${platform}`
    );
    optimizedDescription = truncate(withTags, constraints.maxDescriptionLength);
  }

  // ── Duration ──
  if (
    constraints.maxDurationSeconds !== null &&
    content.duration &&
    content.duration > constraints.maxDurationSeconds
  ) {
    warnings.push(
      `Video duration ${content.duration}s exceeds ${platform} limit of ${constraints.maxDurationSeconds}s. ` +
        `Content may be rejected by the platform.`
    );
  }

  return {
    ...content,
    optimizedTitle,
    optimizedDescription,
    hashtags: allowedTags,
    warnings,
    // Override description so adapters pick up the optimized version
    description: optimizedDescription,
    title: optimizedTitle,
  };
}

/**
 * Validate content against a platform's constraints before attempting publish.
 */
export function validateForPlatform(
  content: ContentPayload,
  platform: Platform
): ContentValidation {
  const constraints = CONSTRAINTS[platform];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content.filePath) {
    errors.push("No file path — content has no media attached");
  }

  if (!content.title || content.title.trim().length === 0) {
    errors.push("Title is required");
  }

  if (content.title && content.title.length > constraints.maxTitleLength) {
    warnings.push(`Title exceeds ${platform} max of ${constraints.maxTitleLength} chars (will be truncated)`);
  }

  if (content.description && content.description.length > constraints.maxDescriptionLength) {
    warnings.push(
      `Description exceeds ${platform} max of ${constraints.maxDescriptionLength} chars (will be truncated)`
    );
  }

  if (
    constraints.maxDurationSeconds !== null &&
    content.duration &&
    content.duration > constraints.maxDurationSeconds
  ) {
    errors.push(
      `Video duration ${content.duration}s exceeds ${platform} maximum of ${constraints.maxDurationSeconds}s`
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getConstraints(platform: Platform): PlatformConstraints {
  return CONSTRAINTS[platform];
}
