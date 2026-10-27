import { NextResponse, type NextRequest } from "next/server";

/** Avoid reusing upstream sockets that may have closed while Next was busy. */
export function proxy(request: NextRequest): NextResponse {
  const connectionTokens = (request.headers.get("connection") ?? "").split(",");
  const isUpgrade = Boolean(request.headers.get("upgrade")?.trim())
    && connectionTokens.some((token) => token.trim().toLowerCase() === "upgrade");
  if (isUpgrade) return NextResponse.next();

  const headers = new Headers(request.headers);
  headers.set("connection", "close");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
