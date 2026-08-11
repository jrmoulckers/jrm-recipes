import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `config/engineering/` is vendored from jrmoulckers/engineering at a pinned ref
 * and `engineering-configs.lock.json` records a SHA-256 per file. Nothing
 * verified those hashes: `vendor-configs.mjs` writes the lock but has no check
 * mode, and re-running it overwrites the files rather than reporting that they
 * changed. So an edit to a vendored file — deliberate or from a bad conflict
 * resolution — was silently authoritative, and the lock documented a state that
 * no longer existed.
 *
 * This asserts the working tree still matches the lock, offline.
 */
const LOCK = 'engineering-configs.lock.json';

const readLock = async () => JSON.parse(await readFile(LOCK, 'utf8'));

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('vendored engineering configs', () => {
  it('locks a non-empty set of files at a pinned tag', async () => {
    const lock = await readLock();

    // Anti-vacuity: without this, emptying the lock would make every
    // per-file assertion below vacuously true and the suite would still pass.
    expect(Object.keys(lock.files ?? {}).length).toBeGreaterThan(0);
    expect(lock.repository).toBe('jrmoulckers/engineering');
    expect(lock.ref).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it('matches the recorded SHA-256 of every vendored file', async () => {
    const lock = await readLock();

    const drifted = [];
    for (const [path, entry] of Object.entries(lock.files)) {
      const actual = sha256(await readFile(join(...path.split('/')), 'utf8'));
      if (actual !== entry.sha256) {
        drifted.push(`${path}\n  locked ${entry.sha256}\n  actual ${actual}`);
      }
    }

    expect(
      drifted,
      `Vendored files differ from ${LOCK}. These are upstream-owned: fix the ` +
        `content in jrmoulckers/engineering and re-run ` +
        `\`node scripts/vendor-configs.mjs <ref>\` rather than editing them here.\n\n` +
        drifted.join('\n'),
    ).toEqual([]);
  });

  it('references the vendored config rather than the removed packages', async () => {
    const [tsconfig, prettier] = await Promise.all([
      readFile('tsconfig.json', 'utf8'),
      readFile('prettier.config.js', 'utf8'),
    ]);

    expect(tsconfig).toContain('./config/engineering/tsconfig/next.json');
    expect(prettier).toContain('./config/engineering/prettier/index.js');
    // The packages are no longer installed, so a stale specifier would only
    // surface as a resolution failure at gate time.
    expect(tsconfig).not.toContain('@jrmoulckers/tsconfig');
    expect(prettier).not.toContain('@jrmoulckers/prettier-config');
  });
});
