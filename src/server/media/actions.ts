'use server';

import { revalidatePath } from 'next/cache';

import { requireUser } from '~/server/auth';
import { isDbConfigured } from '~/server/db';
import { type MediaAsset } from '~/server/db/schema';
import { deleteAsset, recordUpload, updateAltText } from './mutations';
import { getAssetUsage, listAssets, type AssetUsage, type MediaPage } from './queries';
import {
  deleteAssetInput,
  listAssetsInput,
  recordUploadInput,
  updateAltTextInput,
  type ListAssetsInput,
  type RecordUploadInput,
  type UpdateAltTextInput,
} from './validation';

/**
 * Server actions for the media library (issue #657). Thin wrappers: validate,
 * authenticate, delegate, revalidate. All authorization lives in `mutations.ts`
 * so it can't be bypassed by a future non-action caller.
 */

export type ActionResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type RecordUploadResult =
  { ok: true; asset: MediaAsset | null } | { ok: false; error: string };

export type ListAssetsResult = { ok: true; page: MediaPage } | { ok: false; error: string };

export type AssetUsageResult = { ok: true; usage: AssetUsage } | { ok: false; error: string };

const NO_DB =
  'Photo library needs a database. Set DATABASE_URL (see .env.example) to start saving photos.';

function messageFor(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Sign in to manage your photos.';
    case 'NOT_FOUND':
      return "We couldn't find that photo.";
    case 'NOT_CONFIGURED':
      return "Photo storage isn't set up, so this photo can't be removed right now.";
    case 'PROVIDER_ERROR':
      return "We couldn't remove that photo from storage. Please try again.";
    default:
      return "We couldn't save that change.";
  }
}

/**
 * Record a completed upload. Called from the picker's success callback, which
 * replaces the older fire-and-forget storage metering: the asset row is now the
 * thing that carries the byte count, so metering happens inside `recordUpload`.
 */
export async function recordUploadAction(input: RecordUploadInput): Promise<RecordUploadResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = recordUploadInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't save that photo." };
  }

  try {
    const user = await requireUser();
    const asset = await recordUpload(parsed.data, user);
    revalidatePath('/settings/photos');
    return { ok: true, asset };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateAltTextAction(input: UpdateAltTextInput): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = updateAltTextInput.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const user = await requireUser();
    await updateAltText(parsed.data.id, parsed.data.altText, user);
    revalidatePath('/settings/photos');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteAssetAction(id: string): Promise<ActionResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = deleteAssetInput.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't remove that photo." };
  }

  try {
    const user = await requireUser();
    await deleteAsset(parsed.data.id, user);
    revalidatePath('/settings/photos');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/** Paginated library listing, used by the picker's "Your photos" tab. */
export async function listAssetsAction(input: ListAssetsInput = {}): Promise<ListAssetsResult> {
  if (!isDbConfigured()) {
    return { ok: true, page: { assets: [], nextCursor: null } };
  }

  const parsed = listAssetsInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "We couldn't load your photos." };
  }

  try {
    const user = await requireUser();
    const page = await listAssets(user, parsed.data);
    return { ok: true, page };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/**
 * Where an asset is still referenced, for the delete confirm dialog (#658).
 *
 * Called when the dialog opens, never on grid render: it is six indexed lookups
 * and would otherwise run once per thumbnail. Ownership and the
 * caller-visibility scoping of each count both live in `getAssetUsage`, so this
 * wrapper stays a validate-authenticate-delegate shell like the others.
 */
export async function getAssetUsageAction(id: string): Promise<AssetUsageResult> {
  if (!isDbConfigured()) return { ok: false, error: NO_DB };

  const parsed = deleteAssetInput.safeParse({ id });
  if (!parsed.success) {
    return { ok: false, error: "We couldn't find that photo." };
  }

  try {
    const user = await requireUser();
    const usage = await getAssetUsage(parsed.data.id, user);
    return { ok: true, usage };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
