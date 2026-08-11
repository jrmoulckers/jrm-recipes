/**
 * Static analysis of which message namespaces each App Router route can reach
 * from its **client** components.
 *
 * Why this exists: `NextIntlClientProvider` receives `messages` as a prop, so
 * whatever it is handed is serialized into the RSC flight payload and sent over
 * the wire. Handing it the whole catalog means every route pays for every
 * feature's copy (issue #674). This module resolves, per route, the namespaces
 * that route's client subtree actually asks for, so the provider can ship that
 * subset instead.
 *
 * The analysis deliberately **over**-approximates: a namespace that is included
 * but unused only costs bytes, whereas a namespace that is missing is a runtime
 * `MISSING_MESSAGE` in the UI. Anything it cannot resolve statically (a computed
 * namespace, `useMessages()`) is reported as a hard failure or widens the set to
 * the whole catalog rather than silently narrowing it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { repoRoot, walkSource } from './walk-source.mjs';

const SRC = join(repoRoot, 'src');
const APP = join(SRC, 'app');

/** Extension/index candidates tried when resolving a module specifier. */
const CANDIDATES = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '/index.ts',
  '/index.tsx',
  '/index.js',
  '/index.jsx',
];

/** Route files that are rendered *outside* a route's own scoped provider. */
const SHELL_FILES = new Set([
  'layout.tsx',
  'template.tsx',
  'error.tsx',
  'global-error.tsx',
  'not-found.tsx',
  'loading.tsx',
  'providers.tsx',
]);

const toPosix = (p) => p.replace(/\\/g, '/');

function tryResolve(candidatePath) {
  for (const suffix of CANDIDATES) {
    const full = `${candidatePath}${suffix}`;
    if (suffix === '' && !/\.[jt]sx?$/.test(full)) continue;
    try {
      readFileSync(full);
      return toPosix(full);
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/** Resolve an import specifier to an absolute source path, or null if external. */
function resolveSpecifier(specifier, fromFile) {
  if (specifier.startsWith('~/')) {
    return tryResolve(join(SRC, specifier.slice(2)));
  }
  if (specifier.startsWith('.')) {
    return tryResolve(resolve(dirname(fromFile), specifier));
  }
  return null;
}

const IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|(?:^|\n)\s*import\s*["']([^"']+)["']/g;

function readImports(file, source) {
  const out = new Set();
  IMPORT_RE.lastIndex = 0;
  let match;
  while ((match = IMPORT_RE.exec(source))) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (!specifier) continue;
    const resolved = resolveSpecifier(specifier, file);
    if (resolved) out.add(resolved);
  }
  return out;
}

const USE_CLIENT_RE = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)\s*)*["']use client["']/;

/**
 * Namespace call sites. `useTranslations("x")` is the client hook; the analysis
 * ignores `getTranslations` because that is server-only and never reaches the
 * client provider.
 */
const NAMESPACE_RE = /\buseTranslations\s*\(\s*(["']([^"']*)["'])?\s*\)/g;
const USE_MESSAGES_RE = /\buseMessages\s*\(/;

/** Build the whole-`src` module graph plus per-file i18n facts. */
export function buildGraph() {
  const files = walkSource(SRC, ['.ts', '.tsx']).map((rel) => toPosix(join(repoRoot, rel)));
  const graph = new Map();

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const namespaces = new Set();
    const dynamicCallSites = [];

    NAMESPACE_RE.lastIndex = 0;
    let match;
    while ((match = NAMESPACE_RE.exec(source))) {
      if (match[2]) {
        namespaces.add(match[2].split('.')[0]);
      } else if (match[1]) {
        dynamicCallSites.push(match[0]);
      }
      // `useTranslations()` with no argument reads the catalog root; treated as
      // "needs everything" below via `wantsAll`.
    }

    graph.set(file, {
      file,
      imports: readImports(file, source),
      isClient: USE_CLIENT_RE.test(source),
      namespaces,
      dynamicCallSites,
      wantsAll: USE_MESSAGES_RE.test(source) || /\buseTranslations\s*\(\s*\)/.test(source),
    });
  }

  return graph;
}

function closure(graph, roots) {
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current) || !graph.has(current)) continue;
    seen.add(current);
    for (const next of graph.get(current).imports) stack.push(next);
  }
  return seen;
}

/** Every file transitively reachable from a `"use client"` entry point. */
function clientFiles(graph) {
  const roots = [...graph.values()].filter((n) => n.isClient).map((n) => n.file);
  return closure(graph, roots);
}

function collect(graph, files, clientSet) {
  const namespaces = new Set();
  let wantsAll = false;
  const dynamic = [];
  for (const file of files) {
    if (!clientSet.has(file)) continue;
    const node = graph.get(file);
    if (!node) continue;
    for (const ns of node.namespaces) namespaces.add(ns);
    if (node.wantsAll) wantsAll = true;
    for (const site of node.dynamicCallSites) dynamic.push({ file, site });
  }
  return { namespaces, wantsAll, dynamic };
}

/**
 * Turn `src/app/(main)/recipes/[cook]/[recipe]/page.tsx` into `/recipes/:/:`.
 * Route groups drop out and every dynamic segment collapses to `:`, which is
 * all the runtime matcher needs.
 */
export function routePatternFor(pagePath) {
  const rel = toPosix(pagePath).slice(toPosix(APP).length + 1);
  const segments = rel
    .split('/')
    .slice(0, -1)
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => (segment.startsWith('[') ? ':' : segment));
  return `/${segments.join('/')}`.replace(/\/+$/, '') || '/';
}

/**
 * Analyze the app directory.
 *
 * Returns the shell namespace set (rendered above every route-scoped provider,
 * so it must always ship), the per-route sets, and any unresolvable call sites.
 */
export function analyzeRoutes() {
  const graph = buildGraph();
  const clientSet = clientFiles(graph);

  const appFiles = [...graph.keys()].filter((f) => f.startsWith(`${toPosix(APP)}/`));
  const pages = appFiles.filter((f) => f.endsWith('/page.tsx')).sort();
  const shellEntries = appFiles.filter((f) => SHELL_FILES.has(f.slice(f.lastIndexOf('/') + 1)));
  shellEntries.push(toPosix(join(APP, 'providers.tsx')));

  const shell = collect(graph, closure(graph, shellEntries), clientSet);

  const routes = new Map();
  const dynamic = [...shell.dynamic];
  let wantsAll = shell.wantsAll;

  for (const page of pages) {
    const pattern = routePatternFor(page);
    const found = collect(graph, closure(graph, [page]), clientSet);
    dynamic.push(...found.dynamic);
    wantsAll ||= found.wantsAll;
    const merged = routes.get(pattern) ?? new Set();
    for (const ns of found.namespaces) {
      if (!shell.namespaces.has(ns)) merged.add(ns);
    }
    routes.set(pattern, merged);
  }

  return {
    shell: [...shell.namespaces].sort(),
    routes: [...routes.entries()]
      .map(([pattern, set]) => [pattern, [...set].sort()])
      .sort(([a], [b]) => a.localeCompare(b)),
    dynamic,
    wantsAll,
  };
}
