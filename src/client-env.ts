/**
 * Public environment values used by client modules. The server-side schema in
 * `env.js` validates these during the build; this projection keeps that schema
 * out of every browser route while retaining empty-string normalization.
 */
export const cloudinaryCloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || undefined;
export const cloudinaryApiKey = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY || undefined;
export const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined;
export const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || undefined;
export const analyticsRequireConsent =
  process.env.NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT || undefined;
