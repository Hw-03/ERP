import { type NextRequest, NextResponse } from "next/server";

const UNTRUSTED_CLIENT_IP_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-real-ip",
] as const;

export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  for (const header of UNTRUSTED_CLIENT_IP_HEADERS) {
    headers.delete(header);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
