import type { OAuthProvider } from "./oauth-providers";

export interface PlatformUserInfo {
  platformAccountId: string;
  platformUsername: string | null;
}

/**
 * Fetch the authenticated user's profile from a platform API.
 * Called after token exchange when the caller doesn't already know
 * the user's platform-specific account ID.
 */
export async function fetchPlatformUserInfo(
  provider: OAuthProvider,
  accessToken: string
): Promise<PlatformUserInfo> {
  switch (provider) {
    case "tiktok":
      return fetchTikTokUser(accessToken);
    case "instagram":
      return fetchInstagramUser(accessToken);
    case "youtube":
      return fetchYouTubeUser(accessToken);
  }
}

async function fetchTikTokUser(accessToken: string): Promise<PlatformUserInfo> {
  const res = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`TikTok user info request failed: ${res.status}`);
  }
  const data = await res.json();
  const user = data?.data?.user;
  if (!user?.open_id) {
    throw new Error("TikTok user info response missing open_id");
  }
  return {
    platformAccountId: user.open_id,
    platformUsername: user.display_name ?? null,
  };
}

async function fetchInstagramUser(accessToken: string): Promise<PlatformUserInfo> {
  const res = await fetch(
    `https://graph.instagram.com/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`
  );
  if (!res.ok) {
    throw new Error(`Instagram user info request failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.id) {
    throw new Error("Instagram user info response missing id");
  }
  return {
    platformAccountId: String(data.id),
    platformUsername: data.username ?? null,
  };
}

async function fetchYouTubeUser(accessToken: string): Promise<PlatformUserInfo> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    throw new Error(`YouTube channel info request failed: ${res.status}`);
  }
  const data = await res.json();
  const channel = data?.items?.[0];
  if (!channel?.id) {
    throw new Error("YouTube channel info response missing channel ID");
  }
  return {
    platformAccountId: channel.id,
    platformUsername: channel.snippet?.title ?? null,
  };
}
