/**
 * Generate (or verify) `src/i18n/route-namespaces.ts` — the manifest that lets
 * every route ship only the message namespaces its client components can reach
 * (issue #674).
 *
 * `node scripts/i18n-route-scope.mjs`           rewrites the manifest
 * `node scripts/i18n-route-scope.mjs --check`   fails if it is out of date
 *
 * The manifest is checked in rather than generated during `next build` so the
 * cost of adding copy is visible in review: a PR that gives a route a new
 * namespace has to show that namespace entering that route's payload.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { format, resolveConfig } from "prettier";

import { analyzeRoutes } from "./lib/i18n-route-scope.mjs";
import { repoRoot } from "./lib/walk-source.mjs";

const TARGET = join(repoRoot, "src", "i18n", "route-namespaces.ts");

const HEADER = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Run \`pnpm i18n:route-scope\` to regenerate; \`pnpm i18n:route-scope --check\`
 * (part of \`pnpm copy:check\`) fails CI when it drifts from the source tree.
 *
 * Which message namespaces each route's **client** components can reach, so the
 * route-scoped \`NextIntlClientProvider\` can hand the client that subset instead
 * of the whole ~130 kB catalog (#674). The provider receives \`messages\` as a
 * prop, so whatever it is given is serialized into the RSC flight payload.
 *
 * Derived by static analysis of the client import graph
 * (\`scripts/lib/i18n-route-scope.mjs\`), which over-approximates on purpose: an
 * extra namespace only costs bytes, a missing one is a visible
 * \`MISSING_MESSAGE\` in the UI.
 */
`;

export async function renderManifest(analysis) {
  const shell = analysis.shell
    .map((ns) => `  ${JSON.stringify(ns)},`)
    .join("\n");
  const routes = analysis.routes
    .map(([pattern, namespaces]) => {
      if (namespaces.length === 0) return `  ${JSON.stringify(pattern)}: [],`;
      const list = namespaces.map((ns) => `${JSON.stringify(ns)}`).join(", ");
      return `  ${JSON.stringify(pattern)}: [${list}],`;
    })
    .join("\n");

  const source = `${HEADER}
/**
 * Namespaces rendered *above* every route-scoped provider — the root layout and
 * the group layouts (site header, bottom nav, error and offline UI). These
 * layouts are preserved across client-side navigation, so this set ships once
 * per document and must be a superset of what the persistent shell uses.
 */
export const SHELL_NAMESPACES: readonly string[] = [
${shell}
];

/**
 * Extra namespaces per route, on top of {@link SHELL_NAMESPACES}. Patterns use
 * \`:\` for a dynamic segment; route groups are erased because they do not appear
 * in the URL.
 */
export const ROUTE_NAMESPACES: Readonly<Record<string, readonly string[]>> = {
${routes}
};
`;

  // Emit through the repo's own Prettier config so the generated file is
  // byte-identical to what `pnpm format:check` expects, and so `--check` can
  // compare rendered output against the committed file directly.
  return format(source, {
    ...(await resolveConfig(TARGET)),
    parser: "typescript",
  });
}

async function main() {
  const analysis = analyzeRoutes();

  if (analysis.dynamic.length > 0) {
    console.error(
      "i18n route scope: cannot statically resolve these `useTranslations` " +
        "namespaces, so the route-scoped payload cannot be proven complete:",
    );
    for (const { file, site } of analysis.dynamic) {
      console.error(`  ${file}: ${site}`);
    }
    process.exit(1);
  }

  const rendered = await renderManifest(analysis);
  const check = process.argv.includes("--check");
  const current = (() => {
    try {
      return readFileSync(TARGET, "utf8");
    } catch {
      return null;
    }
  })();

  if (check) {
    if (current?.replace(/\r\n/g, "\n") !== rendered) {
      console.error(
        "i18n route scope: src/i18n/route-namespaces.ts is out of date.\n" +
          "Run `pnpm i18n:route-scope` and commit the result.",
      );
      process.exit(1);
    }
    console.log(
      `i18n route scope: manifest current (${analysis.routes.length} routes).`,
    );
    return;
  }

  writeFileSync(TARGET, rendered, "utf8");
  console.log(
    `i18n route scope: wrote ${analysis.routes.length} routes to ${TARGET}.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
