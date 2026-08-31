import { gzipSync } from 'node:zlib';

export function normalizeRoute(route) {
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
    throw new Error(`Route ${expectedRoute} was not found in bundle-budget-manifest.json.`);
  }

  return [
    ...new Set(
      entries.flatMap(([, chunks]) => (Array.isArray(chunks) ? chunks : [])).filter(Boolean),
    ),
  ];
}

export function measureRouteBundles(manifest, readChunk) {
  const measured = new Map();
  const routes = new Set(
    Object.keys(manifest?.pages ?? {})
      .map(manifestRouteForKey)
      .filter(Boolean),
  );

  for (const route of routes) {
    const chunks = resolveRouteChunks(manifest, route);
    const gzipBytes = chunks.reduce((total, chunk) => total + gzipSync(readChunk(chunk)).length, 0);
    measured.set(route, Math.round(gzipBytes / 1000));
  }

  return measured;
}
