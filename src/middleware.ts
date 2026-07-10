import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextMiddleware,
  type NextRequest,
} from "next/server";

import { LOCALE_COOKIE, negotiateAcceptLanguage } from "~/config/i18n";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  generateNonce,
} from "~/lib/security/headers";

/** One year, in seconds — mirrors the locale/theme cookies' persistence. */
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Produce a `NextResponse.next()` carrying our security posture (issue #212).
 *
 * A fresh CSP nonce is minted per request and forwarded to the app on the
 * *request* headers (`x-nonce` for Server Components, plus the CSP itself so
 * Next.js nonces its own bootstrap scripts). The same CSP and the static
 * security headers (HSTS, nosniff, framing, Referrer-Policy, Permissions-Policy)
 * are set on the *response* the browser actually enforces. Shared by both the
 * Clerk-wrapped and dev-bypass code paths so headers are identical either way.
 */
function securedNext(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response.headers, csp);
  return response;
}

/**
 * Seed a first-time visitor's locale from their `Accept-Language` header.
 *
 * When the `NEXT_LOCALE` cookie is absent we negotiate the best supported
 * locale from the header and persist it on the response cookie. Every
 * downstream reader — `getRequestConfig` on the server and the
 * provider/switcher on the client — then sees one stable cookie value, so the
 * negotiated language survives reloads with no flash and no hydration mismatch.
 * A present cookie is never overwritten, so an explicit choice from the
 * switcher always wins. The locale value is one of a fixed set of tokens
 * (`en`/`es`/`de`/`ar`), so appending it to `Set-Cookie` needs no escaping and
 * works whether the wrapped middleware returns a `NextResponse` or a plain
 * `Response` (e.g. a Clerk auth redirect).
 */
function withNegotiatedLocale(handler: NextMiddleware): NextMiddleware {
  return async (request, event) => {
    const response = (await handler(request, event)) ?? NextResponse.next();

    if (!request.cookies.has(LOCALE_COOKIE)) {
      const locale = negotiateAcceptLanguage(
        request.headers.get("accept-language"),
      );
      response.headers.append(
        "set-cookie",
        `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`,
      );
    }

    return response;
  };
}

/**
 * Auth is optional in local/test runs. When Clerk keys are absent (or dev-bypass
 * is on) we skip Clerk's middleware entirely so the app runs with zero config.
 *
 * Fail closed on a real production deploy: skipping Clerk here is exactly the
 * dev-bypass path, so refuse to boot the middleware when it would run
 * unauthenticated in production. Vercel sets `VERCEL_ENV=production` (at build +
 * runtime); `SKIP_ENV_VALIDATION` is the single escape hatch (CI build + e2e).
 * This mirrors the guards in `~/env` and `~/server/auth`.
 */
const clerkConfigured =
  Boolean(
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  ) && process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "1";

if (
  !clerkConfigured &&
  process.env.VERCEL_ENV === "production" &&
  !process.env.SKIP_ENV_VALIDATION
) {
  throw new Error(
    "Refusing to run without Clerk auth on a production deploy. Configure " +
      "Clerk (CLERK_SECRET_KEY + NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) and unset " +
      "NEXT_PUBLIC_DEV_AUTH_BYPASS. Dev-bypass is a local/test-only affordance.",
  );
}

const authMiddleware: NextMiddleware = clerkConfigured
  ? clerkMiddleware((_auth, request) => securedNext(request))
  : (request: NextRequest) => securedNext(request);

export default withNegotiatedLocale(authMiddleware);

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
