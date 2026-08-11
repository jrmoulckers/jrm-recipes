'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';

import { requireUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import {
  addEntryInput,
  copyWeekInput,
  mealWithLeftoversInput,
  moveEntryInput,
  removeEntryInput,
  type AddEntryInput,
  type CopyWeekInput,
  type MealWithLeftoversInput,
  type MoveEntryInput,
  type RemoveEntryInput,
} from './validation';
import {
  addEntry,
  addMealWithLeftovers,
  copyPreviousWeek,
  moveEntry,
  removeEntry,
} from './mutations';
import { type PlanSafetyWarning } from '~/server/dietary/gating';

export type ActionResult =
  | { ok: true; warnings?: PlanSafetyWarning[] }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type CopyWeekActionResult =
  | { ok: true; copied: number; previousEmpty: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  'The meal planner needs a database. Set DATABASE_URL (see .env.example) to start planning.';

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'NOT_FOUND':
      return "We couldn't find that item on your plan.";
    case 'FORBIDDEN':
      return "You don't have access to that recipe.";
    default:
      return "We couldn't update your plan. Please try again.";
  }
}

export async function addEntryAction(input: AddEntryInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = addEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const { warnings } = await addEntry(parsed.data, user);
    revalidatePath('/plan');
    return { ok: true, warnings };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function moveEntryAction(input: MoveEntryInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = moveEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await moveEntry(parsed.data, user);
    revalidatePath('/plan');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function removeEntryAction(input: RemoveEntryInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = removeEntryInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    await removeEntry(parsed.data.entryId, user, parsed.data.removeAllocations ?? false);
    revalidatePath('/plan');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function addMealWithLeftoversAction(
  input: MealWithLeftoversInput,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = mealWithLeftoversInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const { warnings } = await addMealWithLeftovers(parsed.data, user);
    revalidatePath('/plan');
    return { ok: true, warnings };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function copyPreviousWeekAction(input: CopyWeekInput): Promise<CopyWeekActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = copyWeekInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  try {
    const locale = await getLocale();
    const result = await copyPreviousWeek(user, parsed.data.week, parsed.data.groupId, locale);
    revalidatePath('/plan');
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
