import { NextRequest, NextResponse } from "next/server";

const VALID_PROVIDERS = ["tiktok", "instagram", "youtube"];

/**
 * GET /api/accounts/callback/[provider]
 *
 * OAuth providers redirect here after authorization. We pass the code and
 * state to the client-side accounts page which holds the PKCE code verifier
 * in sessionStorage and completes the token exchange.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const base = new URL("/accounts", request.url);

  if (!code || !state) {
    base.searchParams.set("error", "OAuth callback missing required parameters");
    return NextResponse.redirect(base);
  }

  if (!VALID_PROVIDERS.includes(provider)) {
    base.searchParams.set("error", `Invalid provider: ${provider}`);
    return NextResponse.redirect(base);
  }

  base.searchParams.set("code", code);
  base.searchParams.set("state", state);
  base.searchParams.set("provider", provider);

  return NextResponse.redirect(base);
}
