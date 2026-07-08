import { z } from "zod";

/**
 * Validation contracts for saved recipe searches. Shared by the client UI and
 * the server actions so the shape is guaranteed end to end.
 */

/** Per-user ceiling on saved searches, enforced in the mutation + surfaced in UI. */
export const MAX_SAVED_SEARCHES = 30;

export const savedSearchInput = z.object({
  name: z.string().trim().min(1, "Name this search").max(80),
  /** The normalized recipe querystring (no leading "?"). */
  query: z.string().trim().min(1, "Add a filter before saving").max(1000),
});

export const savedSearchIdInput = z.object({
  id: z.string().trim().min(1),
});

export type SavedSearchInput = z.infer<typeof savedSearchInput>;
export type SavedSearchIdInput = z.infer<typeof savedSearchIdInput>;
