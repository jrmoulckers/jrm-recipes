/**
 * Recursively list source files under `src/`.
 *
 * The obvious implementation is `globSync` from `node:fs`, but that landed in
 * Node 22 and CI pins Node 20 (`engines` allows >=20), so it would pass locally
 * and crash in CI. This walker uses only long-stable builtins.
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Directories that never contain shipping UI source. */
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage']);

/**
 * Walk `dir` and return repo-relative paths (forward slashes) for every file
 * matching `extensions`. Test files are excluded: they are not shipping copy,
 * and the guards that use this walker exist to check what readers actually see.
 */
export function walkSource(dir = join(repoRoot, 'src'), extensions = ['.tsx']) {
  const prefix = `${repoRoot.replace(/\\/g, '/')}/`;
  const out = [];

  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        visit(full);
        continue;
      }
      if (!extensions.some((ext) => entry.name.endsWith(ext))) continue;
      if (/\.test\.[jt]sx?$/.test(entry.name)) continue;
      out.push(full.replace(/\\/g, '/').replace(prefix, ''));
    }
  };

  visit(dir);
  return out.sort();
}
