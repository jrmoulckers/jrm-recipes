import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

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

export default clerkConfigured
  ? clerkMiddleware()
  : function middleware(_req: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
