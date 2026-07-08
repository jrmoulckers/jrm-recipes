"use server";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import { incrementUsage } from "./usage";

/** One mebibyte, so byte counts convert to the `storage_mb` metric's unit. */
const BYTES_PER_MB = 1024 * 1024;

/**
 * Record the size of a just-completed media upload against the caller's storage
 * usage (issue #318).
 *
 * The Cloudinary upload happens directly browser→Cloudinary, so the only moment
 * we learn the real byte size is the widget's success callback. This action is
 * called from there to accumulate `storage_mb`, which feeds both the soft cap
 * (this issue) and the billing usage meter (#319). It is best-effort and never
 * throws: an unconfigured DB, a signed-out caller, or a non-positive size all
 * quietly no-op so a metering hiccup can never break an otherwise good upload.
 */
export async function recordStorageUsageAction(bytes: number): Promise<void> {
  if (!isDbConfigured()) return;
  if (!Number.isFinite(bytes) || bytes <= 0) return;

  try {
    const user = await requireUser();
    const megabytes = Math.ceil(bytes / BYTES_PER_MB);
    await incrementUsage(user, "storage_mb", megabytes);
  } catch {
    // Metering is non-critical; swallow (e.g. unauthenticated) rather than
    // surfacing an error over a successful upload.
  }
}
