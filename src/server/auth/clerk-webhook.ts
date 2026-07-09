import "server-only";

import {
  applyClerkUserDeletion,
  applyClerkUserUpdate,
  type ClerkUserProfile,
} from "~/server/auth";

/** Minimal shape of a Clerk `user.*` webhook event (issue #217). */
export type ClerkWebhookEvent = {
  type: string;
  data: ClerkUserData;
};

type ClerkUserData = {
  id?: string;
  email_addresses?: { id?: string; email_address?: string }[];
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  image_url?: string | null;
};

/** Pull the primary (or first) email out of a Clerk user payload. */
function primaryEmail(data: ClerkUserData): string | null {
  const list = data.email_addresses ?? [];
  const primary = list.find((e) => e.id === data.primary_email_address_id);
  return primary?.email_address ?? list[0]?.email_address ?? null;
}

/** Map a Clerk user payload onto the local profile fields we mirror. */
export function extractProfile(data: ClerkUserData): ClerkUserProfile {
  const joinedName = [data.first_name, data.last_name]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  const name =
    joinedName.length > 0 ? joinedName : (data.username ?? null);
  return {
    email: primaryEmail(data),
    name,
    handle: data.username ?? null,
    avatarUrl: data.image_url ?? null,
  };
}

/**
 * Route a verified Clerk webhook event to the matching sync side effect
 * (issue #217): `user.updated` refreshes the local profile, `user.deleted`
 * soft-deletes + anonymizes it. Unknown event types are ignored so Clerk can
 * fan out additional events without this endpoint erroring.
 */
export async function handleClerkEvent(event: ClerkWebhookEvent): Promise<void> {
  const clerkId = event.data?.id;
  if (!clerkId) return;
  switch (event.type) {
    case "user.updated":
      await applyClerkUserUpdate(clerkId, extractProfile(event.data));
      return;
    case "user.deleted":
      await applyClerkUserDeletion(clerkId);
      return;
    default:
      return;
  }
}
