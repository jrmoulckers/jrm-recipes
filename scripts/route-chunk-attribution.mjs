#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function normalizeRoute(route) {
  const withLeadingSlash = route.startsWith('/') ? route : `/${route}`;
  return withLeadingSlash === '/' ? withLeadingSlash : withLeadingSlash.replace(/\/+$/, '');
}

export function manifestRouteForKey(key) {
  const segments = key.split('/').filter(Boolean);
  if (segments.at(-1) !== 'page') return null;

  const routeSegments = segments
    .slice(0, -1)
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .filter((segment) => !segment.startsWith('@'));
  return routeSegments.length === 0 ? '/' : `/${routeSegments.join('/')}`;
}

export function resolveRouteChunks(manifest, route) {
  const expectedRoute = normalizeRoute(route);
  const entries = Object.entries(manifest?.pages ?? {}).filter(
    ([key]) => manifestRouteForKey(key) === expectedRoute,
  );
  if (entries.length === 0) {
    throw new Error(`Route ${expectedRoute} was not found in app-build-manifest.json.`);
  }

  return [
    ...new Set(
      entries.flatMap(([, chunks]) => (Array.isArray(chunks) ? chunks : [])).filter(Boolean),
    ),
  ];
}

export function countLiteral(content, query) {
  if (!query) throw new Error('Chunk query cannot be empty.');
  return content.split(query).length - 1;
}

export function evaluateChunkExpectations(chunks, expectations, readChunk) {
  if (expectations.length === 0) {
    throw new Error('Provide at least one --expect-present or --expect-absent assertion.');
  }
  if (
    expectations.some(({ expected }) => expected === 'absent') &&
    !expectations.some(({ expected }) => expected === 'present')
  ) {
    throw new Error(
      'An absence assertion requires --expect-present in the same command as a positive control.',
    );
  }

  const contents = chunks.map((chunk) => ({ chunk, content: readChunk(chunk) }));
  const rows = expectations.map(({ expected, query }) => {
    const matches = contents
      .map(({ chunk, content }) => ({ chunk, hits: countLiteral(content, query) }))
      .filter(({ hits }) => hits > 0);
    const hits = matches.reduce((total, match) => total + match.hits, 0);
    const passed = expected === 'present' ? hits > 0 : hits === 0;
    return { expected, query, hits, matches, passed };
  });

  return { rows, failed: rows.some(({ passed }) => !passed) };
}

function parseArgs(argv) {
  const options = { buildDir: '.next', expectations: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!['--route', '--build-dir', '--expect-present', '--expect-absent'].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
    index += 1;

    if (flag === '--route') options.route = value;
    else if (flag === '--build-dir') options.buildDir = value;
    else {
      options.expectations.push({
        expected: flag === '--expect-present' ? 'present' : 'absent',
        query: value,
      });
    }
  }
  if (!options.route) throw new Error('--route is required.');
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const buildDir = resolve(repoRoot, options.buildDir);
    const manifestPath = resolve(buildDir, 'app-build-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const chunks = resolveRouteChunks(manifest, options.route);
    const result = evaluateChunkExpectations(chunks, options.expectations, (chunk) =>
      readFileSync(resolve(buildDir, chunk), 'utf8'),
    );

    console.log(`${normalizeRoute(options.route)}: ${chunks.length} first-load chunk(s)`);
    for (const row of result.rows) {
      const mark = row.passed ? 'PASS' : 'FAIL';
      const label = row.expected === 'present' ? 'PRESENT' : 'ABSENT';
      console.log(
        `${mark} ${label.padEnd(7)} ${JSON.stringify(row.query)}: ${row.hits} hit(s) in ` +
          `${row.matches.length}/${chunks.length} chunk(s)`,
      );
      for (const match of row.matches) {
        console.log(`    ${match.chunk} (${match.hits})`);
      }
    }
    if (result.failed) process.exitCode = 1;
  } catch (error) {
    console.error(`Route chunk attribution failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
