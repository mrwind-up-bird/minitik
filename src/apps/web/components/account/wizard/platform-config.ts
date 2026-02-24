import type { Platform } from "@prisma/client";

export type OAuthProvider = "tiktok" | "instagram" | "youtube";

export const PLATFORM_LABELS: Record<Platform, string> = {
  TIKTOK: "TikTok",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  TIKTOK: "bg-black text-white",
  INSTAGRAM: "bg-gradient-to-r from-purple-500 to-pink-500 text-white",
  YOUTUBE: "bg-red-600 text-white",
};

export const PROVIDER_TO_PLATFORM: Record<OAuthProvider, Platform> = {
  tiktok: "TIKTOK",
  instagram: "INSTAGRAM",
  youtube: "YOUTUBE",
};

export const PLATFORM_TO_PROVIDER: Record<Platform, OAuthProvider> = {
  TIKTOK: "tiktok",
  INSTAGRAM: "instagram",
  YOUTUBE: "youtube",
};
