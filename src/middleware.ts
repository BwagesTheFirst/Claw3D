import { NextRequest, NextResponse } from "next/server";

/**
 * Basic Auth middleware for remote access via Cloudflare tunnel.
 *
 * - Username: brance
 * - Password: CLAW3D_ACCESS_PASSWORD env var (default: claw2026)
 * - Skipped entirely when accessing from localhost (local dev stays untouched)
 * - Skips /api/health if it ever exists
 */

export function middleware(request: NextRequest) {
  // Skip auth for localhost / local dev
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0];
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return NextResponse.next();
  }

  // Skip health check endpoint
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ", 2);
    if (scheme === "Basic" && encoded) {
      let decoded: string;
      try {
        decoded = atob(encoded);
      } catch {
        decoded = "";
      }

      const [user, ...passParts] = decoded.split(":");
      const pass = passParts.join(":");

      const expectedPassword =
        process.env.CLAW3D_ACCESS_PASSWORD ?? "claw2026";

      if (user === "brance" && pass === expectedPassword) {
        return NextResponse.next();
      }
    }
  }

  // Not authenticated -- challenge the client
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Claw3D", charset="UTF-8"',
    },
  });
}

export const config = {
  // Match all routes except Next.js internals and static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
