'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import {
  createCustomUnit,
  deleteCustomUnit,
  saveUnitPreferences,
  updateCustomUnit,
} from './mutations';
import {
  customUnitInput,
  unitPreferencesInput,
  type CustomUnitInputRaw,
  type UnitPreferencesInputRaw,
} from './validation';

export type ActionResult =
  { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const NO_DB =
  'Unit preferences need a database. Set DATABASE_URL (see .env.example) to start saving.';

const SETTINGS_PATH = '/settings/units';

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Sign in to manage your units.';
    case 'NOT_FOUND':
      return "We couldn't find that unit.";
    case 'DUPLICATE':
      return 'You already have a unit with that name.';
    default:
      return "We couldn't save that change.";
  }
}

function duplicateFields(error: unknown): Record<string, string[]> | undefined {
  return error instanceof Error && error.message === 'DUPLICATE'
    ? { name: ['You already have a unit with that name.'] }
    : undefined;
}

export async function saveUnitPreferencesAction(
  input: UnitPreferencesInputRaw,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = unitPreferencesInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    const row = await saveUnitPreferences(parsed.data, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id: row.id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function createCustomUnitAction(input: CustomUnitInputRaw): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = customUnitInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    const row = await createCustomUnit(parsed.data, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id: row.id };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error),
      fieldErrors: duplicateFields(error),
    };
  }
}

export async function updateCustomUnitAction(
  id: string,
  input: CustomUnitInputRaw,
): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = customUnitInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    await updateCustomUnit(id, parsed.data, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      error: messageFor(error),
      fieldErrors: duplicateFields(error),
    };
  }
}

export async function deleteCustomUnitAction(id: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  try {
    const user = await requireUser();
    await deleteCustomUnit(id, user);
    revalidatePath(SETTINGS_PATH);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
