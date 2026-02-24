import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_PATHS = new Set(["/login", "/api/auth"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  // Allow all next-auth API routes
  if (pathname.startsWith("/api/auth/")) return true;
  // Static assets and Next.js internals
  if (pathname.startsWith("/_next/") || pathname.startsWith("/static/")) return true;
  if (pathname === "/favicon.ico" || pathname === "/sw.js") return true;
  if (pathname === "/manifest.webmanifest") return true;
  // Icon/screenshot assets
  if (pathname.startsWith("/icons/") || pathname.startsWith("/screenshots/")) return true;
  return false;
}

/** API prefixes where we inject x-user-id for service-layer auth */
const INJECT_HEADER_PREFIXES = [
  "/api/content",
  "/api/scheduling",
  "/api/publishing",
  "/api/analytics",
  "/api/platforms",
  "/api/accounts",
];

function shouldInjectUserId(pathname: string): boolean {
  // Don't inject on next-auth routes
  if (pathname.startsWith("/api/auth")) return false;
  return INJECT_HEADER_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Unauthenticated — redirect pages to /login, return 401 for API
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated — inject x-user-id header for API routes
  if (shouldInjectUserId(pathname) && token.id) {
    const headers = new Headers(request.headers);
    headers.set("x-user-id", token.id as string);
    return NextResponse.next({ request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image (Next.js internals)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
