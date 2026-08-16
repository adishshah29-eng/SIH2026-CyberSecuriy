import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const RATE_LIMITED_PREFIXES: Record<string, { limit: number; windowMs: number }> = {
  "/trace/": { limit: 30, windowMs: 60_000 },
  "/api/qr/": { limit: 30, windowMs: 60_000 },
  // Tighter limit — a real collector submits at most a handful of times an
  // hour; this mainly guards against a compromised/scripted account.
  "/api/collection-events": { limit: 20, windowMs: 60_000 },
};

/**
 * Refreshes the Supabase auth cookie on every request so server components
 * always see a valid session. Route-level access control (redirecting
 * unauthenticated users away from the dashboard) happens in
 * app/(dashboard)/layout.tsx, not here — Proxy is a network boundary, not
 * the place to enforce authorization.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const rateLimited = Object.entries(RATE_LIMITED_PREFIXES).find(([prefix]) =>
    pathname.startsWith(prefix),
  );
  if (rateLimited) {
    const [prefix, { limit, windowMs }] = rateLimited;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const allowed = checkRateLimit(`${prefix}:${ip}`, limit, windowMs);

    if (!allowed) {
      return new NextResponse("Too many requests", { status: 429 });
    }
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
