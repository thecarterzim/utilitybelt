import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE_NAME, isValidAuthToken, safeNextPath } from "@/lib/site-auth";

// Gates the entire site behind one shared password (see lib/site-auth.ts).
// /login and /api/login are the only paths that must stay reachable
// without a valid cookie, since there's no cookie yet to check.
// Everything else, including /list and Server Function POSTs (which
// Next.js routes to the page they were called from, not a separate path),
// gets redirected to the login form.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/api/login") {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (isValidAuthToken(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", safeNextPath(pathname));
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
