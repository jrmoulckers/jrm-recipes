export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type DraftEnvelope<T> = {
  version: number;
  savedAt: number;
  data: T;
};

export type DraftReadResult<T> =
  | { status: 'empty' }
  | { status: 'valid'; data: T }
  | { status: 'invalid'; issue: 'expired' | 'incompatible' | 'malformed' };

export function serializeDraft<T>(data: T, savedAt = Date.now(), version = 1): string {
  const envelope: DraftEnvelope<T> = { version, savedAt, data };
  return JSON.stringify(envelope);
}

export function readDraft<T>(
  raw: string | null,
  snapshotShape: T,
  now: number,
  version: number,
): DraftReadResult<T> {
  if (raw === null) return { status: 'empty' };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: 'invalid', issue: 'malformed' };
  }
  if (typeof value !== 'object' || value === null) {
    return { status: 'invalid', issue: 'malformed' };
  }

  const envelope = value as Partial<DraftEnvelope<unknown>>;
  if (envelope.version !== version) {
    return { status: 'invalid', issue: 'incompatible' };
  }
  if (
    typeof envelope.savedAt !== 'number' ||
    !Number.isFinite(envelope.savedAt) ||
    envelope.savedAt > now
  ) {
    return { status: 'invalid', issue: 'malformed' };
  }
  if (now - envelope.savedAt > DRAFT_TTL_MS) {
    return { status: 'invalid', issue: 'expired' };
  }
  return hasSameShape(envelope.data, snapshotShape)
    ? { status: 'valid', data: envelope.data }
    : { status: 'invalid', issue: 'incompatible' };
}

function hasSameShape<T>(value: unknown, template: T): value is T {
  if (Array.isArray(template)) {
    if (!Array.isArray(value)) return false;
    if (template.length === 0) return value.every((item) => typeof item === 'string');
    return value.every((item) => hasSameShape(item, template[0]));
  }
  if (typeof template === 'object' && template !== null) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const expected = template as Record<string, unknown>;
    const candidate = value as Record<string, unknown>;
    const keys = Object.keys(expected);
    return (
      Object.keys(candidate).length === keys.length &&
      keys.every((key) => hasSameShape(candidate[key], expected[key]))
    );
  }
  return typeof value === typeof template;
}
