import { describe, it, expect } from "vitest";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generatePKCEParams,
  buildAuthorizationUrl,
  getOAuthConfig,
} from "../oauth-providers";

describe("generateCodeVerifier", () => {
  it("returns a URL-safe base64 string", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique values", () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  it("has correct length for 32 random bytes base64url encoded", () => {
    const verifier = generateCodeVerifier();
    // 32 bytes → 43 base64url chars (no padding)
    expect(verifier.length).toBe(43);
  });
});

describe("generateCodeChallenge", () => {
  it("returns a deterministic SHA-256 hash of the verifier", () => {
    const verifier = "test_verifier_value";
    const challenge1 = generateCodeChallenge(verifier);
    const challenge2 = generateCodeChallenge(verifier);
    expect(challenge1).toBe(challenge2);
  });

  it("returns URL-safe base64", () => {
    const challenge = generateCodeChallenge("test");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces different challenges for different verifiers", () => {
    const a = generateCodeChallenge("verifier_a");
    const b = generateCodeChallenge("verifier_b");
    expect(a).not.toBe(b);
  });
});

describe("generatePKCEParams", () => {
  it("returns all required fields", () => {
    const params = generatePKCEParams();
    expect(params).toHaveProperty("codeVerifier");
    expect(params).toHaveProperty("codeChallenge");
    expect(params).toHaveProperty("codeChallengeMethod", "S256");
    expect(params).toHaveProperty("state");
  });

  it("has a valid code challenge derived from the verifier", () => {
    const params = generatePKCEParams();
    const expected = generateCodeChallenge(params.codeVerifier);
    expect(params.codeChallenge).toBe(expected);
  });

  it("generates unique state values", () => {
    const a = generatePKCEParams();
    const b = generatePKCEParams();
    expect(a.state).not.toBe(b.state);
  });

  it("state is a 32-char hex string", () => {
    const params = generatePKCEParams();
    expect(params.state).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("buildAuthorizationUrl", () => {
  const pkce = generatePKCEParams();

  it("builds a valid TikTok URL with client_key", () => {
    const url = buildAuthorizationUrl("tiktok", pkce);
    expect(url).toContain("tiktok.com");
    expect(url).toContain("client_key=");
    expect(url).not.toContain("client_id=");
    expect(url).toContain(`state=${pkce.state}`);
    expect(url).toContain(`code_challenge=${pkce.codeChallenge}`);
  });

  it("builds a valid Instagram URL with client_id", () => {
    const url = buildAuthorizationUrl("instagram", pkce);
    expect(url).toContain("instagram.com");
    expect(url).toContain("client_id=");
    expect(url).toContain("response_type=code");
  });

  it("builds a valid YouTube URL with client_id", () => {
    const url = buildAuthorizationUrl("youtube", pkce);
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=");
    expect(url).toContain("code_challenge_method=S256");
  });
});

describe("getOAuthConfig", () => {
  it("returns config for all providers", () => {
    for (const provider of ["tiktok", "instagram", "youtube"] as const) {
      const config = getOAuthConfig(provider);
      expect(config).toHaveProperty("clientId");
      expect(config).toHaveProperty("clientSecret");
      expect(config).toHaveProperty("authorizationUrl");
      expect(config).toHaveProperty("tokenUrl");
      expect(config).toHaveProperty("scopes");
      expect(config).toHaveProperty("redirectUri");
      expect(config.scopes.length).toBeGreaterThan(0);
      expect(config.redirectUri).toContain(provider);
    }
  });
});
