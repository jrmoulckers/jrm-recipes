"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "~/server/auth";
import { isDbConfigured } from "~/server/db";
import {
  type ActionResult,
  fail,
  fromZodError,
  ok,
} from "~/server/action-result";
import { messageForError } from "~/server/errors";
import {
  createCookAlongInput,
  deleteCookAlongInput,
  rsvpInput,
  updateCookAlongInput,
} from "./validation";
import {
  createCookAlong,
  deleteCookAlong,
  setRsvp,
  updateCookAlong,
} from "./mutations";

function dbGuard(): ActionResult | null {
  return isDbConfigured()
    ? null
    : { ok: false, error: "Cook-alongs need a database connection." };
}

/** Schedule a cook-along and invite the group (issue #353). */
export async function createCookAlongAction(input: {
  groupSlug: string;
  groupId: string;
  recipeId: string;
  title?: string;
  note?: string;
  scheduledFor: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = createCookAlongInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await createCookAlong(parsed.data, user);
    revalidatePath(`/groups/${input.groupSlug}`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only members of this family can host a cook-along.",
          NOT_FOUND: "Pick a recipe from this group's cookbook.",
        },
        "We couldn't schedule that cook-along.",
      ),
    );
  }
}

/** Edit a cook-along's details (issue #353). */
export async function updateCookAlongAction(input: {
  groupSlug: string;
  cookAlongId: string;
  title?: string;
  note?: string;
  scheduledFor: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = updateCookAlongInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await updateCookAlong(parsed.data, user);
    revalidatePath(`/groups/${input.groupSlug}`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only the host or a group admin can edit this cook-along.",
          NOT_FOUND: "That cook-along is no longer available.",
        },
        "We couldn't update that cook-along.",
      ),
    );
  }
}

/** Cancel a cook-along (issue #353). */
export async function deleteCookAlongAction(input: {
  groupSlug: string;
  cookAlongId: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = deleteCookAlongInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await deleteCookAlong(parsed.data.cookAlongId, user);
    revalidatePath(`/groups/${input.groupSlug}`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only the host or a group admin can cancel this cook-along.",
          NOT_FOUND: "That cook-along is already gone.",
        },
        "We couldn't cancel that cook-along.",
      ),
    );
  }
}

/** RSVP to a cook-along: going / maybe / declined (issue #353). */
export async function rsvpCookAlongAction(input: {
  groupSlug: string;
  cookAlongId: string;
  status: "going" | "maybe" | "declined";
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = rsvpInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await setRsvp(parsed.data, user);
    revalidatePath(`/groups/${input.groupSlug}`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "Only members of this family can RSVP.",
          NOT_FOUND: "That cook-along is no longer available.",
        },
        "We couldn't save your RSVP.",
      ),
    );
  }
}
