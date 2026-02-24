import { describe, it, expect } from "vitest";
import {
  validateMimeType,
  validateExtension,
  validateForPlatform,
  validateForAllPlatforms,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  PLATFORM_CONSTRAINTS,
} from "../video-processor";

describe("validateMimeType", () => {
  it("accepts valid MIME types", () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      const result = validateMimeType(mime);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("rejects unsupported MIME types", () => {
    const result = validateMimeType("video/avi");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("video/avi");
    expect(result.errors[0]).toContain("not supported");
  });

  it("rejects non-video MIME types", () => {
    const result = validateMimeType("image/png");
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
  });
});

describe("validateExtension", () => {
  it("accepts valid extensions", () => {
    const filenames = ["video.mp4", "clip.mov", "reel.webm"];
    for (const name of filenames) {
      const result = validateExtension(name);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("accepts extensions case-insensitively", () => {
    const result = validateExtension("video.MP4");
    expect(result.valid).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    const result = validateExtension("video.avi");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain(".avi");
  });

  it("handles filenames with multiple dots", () => {
    const result = validateExtension("my.awesome.video.mp4");
    expect(result.valid).toBe(true);
  });
});

describe("validateForPlatform", () => {
  it("returns valid for file within TikTok limits", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { duration: 60, width: 1080, height: 1920 },
      50 * 1024 * 1024 // 50 MB
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects file exceeding TikTok size limit", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { duration: 60 },
      300 * 1024 * 1024 // 300 MB > 287 MB limit
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("too large");
    expect(result.errors[0]).toContain("TIKTOK");
  });

  it("rejects video exceeding TikTok duration limit", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { duration: 700 }, // > 600s limit
      10 * 1024 * 1024
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Duration");
    expect(result.errors[0]).toContain("600");
  });

  it("rejects video below TikTok minimum width", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { width: 200, height: 400 }, // 200 < 360 min
      10 * 1024 * 1024
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Width");
    expect(result.errors[0]).toContain("360");
  });

  it("rejects video below TikTok minimum height", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { width: 400, height: 200 }, // 200 < 360 min
      10 * 1024 * 1024
    );
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Height");
    expect(result.errors[0]).toContain("360");
  });

  it("returns valid with warning for unknown platform", () => {
    const result = validateForPlatform(
      "SNAPCHAT",
      { duration: 60 },
      10 * 1024 * 1024
    );
    expect(result.valid).toBe(true);
    expect(result.warnings[0]).toContain("No constraints");
    expect(result.warnings[0]).toContain("SNAPCHAT");
  });

  it("skips checks when metadata fields are undefined", () => {
    const result = validateForPlatform("TIKTOK", {}, 10 * 1024 * 1024);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("collects multiple errors", () => {
    const result = validateForPlatform(
      "TIKTOK",
      { duration: 700, width: 100, height: 100 },
      300 * 1024 * 1024
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("validates YouTube constraints correctly", () => {
    const result = validateForPlatform(
      "YOUTUBE",
      { duration: 3600, width: 1920, height: 1080 },
      100 * 1024 * 1024
    );
    expect(result.valid).toBe(true);
  });

  it("validates Instagram constraints correctly", () => {
    const result = validateForPlatform(
      "INSTAGRAM",
      { duration: 60, width: 1080 },
      50 * 1024 * 1024
    );
    expect(result.valid).toBe(true);
  });
});

describe("validateForAllPlatforms", () => {
  it("returns results for all configured platforms", () => {
    const results = validateForAllPlatforms(
      { duration: 60, width: 1080, height: 1920 },
      50 * 1024 * 1024
    );
    const platforms = Object.keys(PLATFORM_CONSTRAINTS);
    expect(Object.keys(results)).toEqual(platforms);
    for (const platform of platforms) {
      expect(results[platform]).toHaveProperty("valid");
      expect(results[platform]).toHaveProperty("errors");
      expect(results[platform]).toHaveProperty("warnings");
    }
  });

  it("small file passes all platforms", () => {
    const results = validateForAllPlatforms(
      { duration: 30, width: 1080, height: 1920 },
      10 * 1024 * 1024
    );
    for (const result of Object.values(results)) {
      expect(result.valid).toBe(true);
    }
  });
});
