import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function selectServiceWorkerAssets(entries) {
  return entries
    .filter(
      (name) =>
        name === "sw.js" ||
        name === "sw.js.map" ||
        /^swe-worker-[A-Za-z0-9._-]+\.js$/.test(name),
    )
    .sort();
}

function requireGeneratedFile(relativePath) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    throw new Error(
      `required generated build asset is missing: ${relativePath}`,
    );
  }
}

function main() {
  requireGeneratedFile(".next/BUILD_ID");

  const serviceWorkerAssets = selectServiceWorkerAssets(
    readdirSync(resolve(repoRoot, "public")),
  );
  if (!serviceWorkerAssets.includes("sw.js")) {
    throw new Error("required generated build asset is missing: public/sw.js");
  }

  const artifactDirectory = resolve(repoRoot, "ci-artifact");
  const archive = resolve(artifactDirectory, "next-build.tar.gz");
  mkdirSync(artifactDirectory, { recursive: true });

  const result = spawnSync(
    "tar",
    [
      "-czf",
      archive,
      "--exclude=.next/cache",
      ".next",
      ...serviceWorkerAssets.map((name) => `public/${name}`),
    ],
    {
      cwd: repoRoot,
      shell: false,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`tar exited with status ${result.status ?? "unknown"}`);
  }
  if (!existsSync(archive) || statSync(archive).size === 0) {
    throw new Error("CI build archive was not created");
  }

  console.log(
    `Packaged .next and ${serviceWorkerAssets.length} service-worker asset(s) in ci-artifact/next-build.tar.gz`,
  );
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
