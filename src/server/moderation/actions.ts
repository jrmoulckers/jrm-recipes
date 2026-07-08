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
  blockUserInput,
  dismissReportInput,
  hideContentInput,
  reportContentInput,
  unblockUserInput,
} from "./validation";
import { blockUser, unblockUser } from "./blocks";
import { reportContent } from "./reports";
import { dismissReport, hideContent } from "./mutations";

function dbGuard(): ActionResult | null {
  return isDbConfigured()
    ? null
    : { ok: false, error: "That needs a database connection." };
}

/** Block another member (issue #355). */
export async function blockUserAction(
  input: { blockedId: string },
): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = blockUserInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await blockUser(user.id, parsed.data.blockedId);
    revalidatePath("/settings/blocked");
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        { FORBIDDEN: "You can't block yourself." },
        "We couldn't block that person.",
      ),
    );
  }
}

/** Reverse a block (issue #355). */
export async function unblockUserAction(
  input: { blockedId: string },
): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = unblockUserInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await unblockUser(user.id, parsed.data.blockedId);
    revalidatePath("/settings/blocked");
    return ok();
  } catch {
    return fail("We couldn't unblock that person.");
  }
}

/** File a report against a comment/review/cook post (issue #356). */
export async function reportContentAction(input: {
  targetType: "comment" | "review" | "cook_log";
  targetId: string;
  reason: "spam" | "harassment" | "inappropriate" | "other";
  detail?: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = reportContentInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await reportContent(parsed.data, user);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        {
          FORBIDDEN: "You can't report that.",
          NOT_FOUND: "That content is no longer available.",
        },
        "We couldn't file that report.",
      ),
    );
  }
}

/** Hide reported content from members/kids (issue #357, owner/admin only). */
export async function hideContentAction(input: {
  targetType: "comment" | "review" | "cook_log";
  targetId: string;
  groupSlug: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = hideContentInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await hideContent(parsed.data, user);
    revalidatePath(`/groups/${parsed.data.groupSlug}/moderation`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        { FORBIDDEN: "Only owners and admins can moderate this group." },
        "We couldn't hide that content.",
      ),
    );
  }
}

/** Dismiss the reports on a target without hiding it (issue #357). */
export async function dismissReportAction(input: {
  targetType: "comment" | "review" | "cook_log";
  targetId: string;
  groupSlug: string;
}): Promise<ActionResult> {
  const guard = dbGuard();
  if (guard) return guard;
  const parsed = dismissReportInput.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  const user = await requireUser();
  try {
    await dismissReport(parsed.data, user);
    revalidatePath(`/groups/${parsed.data.groupSlug}/moderation`);
    return ok();
  } catch (error) {
    return fail(
      messageForError(
        error,
        { FORBIDDEN: "Only owners and admins can moderate this group." },
        "We couldn't dismiss that report.",
      ),
    );
  }
}
