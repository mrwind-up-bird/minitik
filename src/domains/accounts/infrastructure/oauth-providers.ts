import { randomBytes, createHash } from "crypto";

export type OAuthProvider = "tiktok" | "instagram" | "youtube";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  state: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig {
  const baseUrl = getBaseUrl();

  switch (provider) {
    case "tiktok":
      return {
        clientId: process.env.TIKTOK_CLIENT_ID ?? "",
        clientSecret: process.env.TIKTOK_CLIENT_SECRET ?? "",
        authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        scopes: ["user.info.basic", "video.list", "video.upload"],
        redirectUri: `${baseUrl}/api/accounts/callback/tiktok`,
      };

    case "instagram":
      return {
        clientId: process.env.INSTAGRAM_CLIENT_ID ?? "",
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET ?? "",
        authorizationUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        scopes: ["user_profile", "user_media"],
        redirectUri: `${baseUrl}/api/accounts/callback/instagram`,
      };

    case "youtube":
      return {
        clientId: process.env.YOUTUBE_CLIENT_ID ?? "",
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
        ],
        redirectUri: `${baseUrl}/api/accounts/callback/youtube`,
      };
  }
}

/** Generate a PKCE code verifier (random 43–128 char URL-safe string) */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/** Derive the S256 code challenge from a verifier */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/** Generate all PKCE + state params needed to initiate an OAuth flow */
export function generatePKCEParams(): PKCEParams {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: "S256",
    state,
  };
}

/** Build the authorization URL for the given provider with PKCE */
export function buildAuthorizationUrl(
  provider: OAuthProvider,
  pkce: PKCEParams
): string {
  const config = getOAuthConfig(provider);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state: pkce.state,
    code_challenge: pkce.codeChallenge,
    code_challenge_method: pkce.codeChallengeMethod,
  });

  // TikTok uses a slightly different param name
  if (provider === "tiktok") {
    params.set("client_key", config.clientId);
    params.delete("client_id");
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

/** Exchange an authorization code for tokens */
export async function exchangeCodeForTokens(
  provider: OAuthProvider,
  code: string,
  codeVerifier: string
): Promise<OAuthTokens> {
  const config = getOAuthConfig(provider);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    code_verifier: codeVerifier,
  });

  // TikTok uses client_key instead of client_id
  if (provider === "tiktok") {
    body.set("client_key", config.clientId);
    body.set("client_secret", config.clientSecret);
  } else {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret);
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OAuth token exchange failed for ${provider}: ${response.status} ${errorText}`
    );
  }

  const data: TokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    scopes: data.scope ? data.scope.split(" ") : [],
  };
}

/** Refresh an access token using a refresh token */
export async function refreshAccessToken(
  provider: OAuthProvider,
  refreshToken: string
): Promise<OAuthTokens> {
  const config = getOAuthConfig(provider);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  if (provider === "tiktok") {
    body.set("client_key", config.clientId);
    body.delete("client_id");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token refresh failed for ${provider}: ${response.status} ${errorText}`
    );
  }

  const data: TokenResponse = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // keep old if not rotated
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : null,
    scopes: data.scope ? data.scope.split(" ") : [],
  };
}
