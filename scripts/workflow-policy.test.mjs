import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const canonicalWorkflowSha = "97ff60ec21321563fa0fc7ba80015261e7dcd6fa";
const postgresDigest =
  "sha256:95206741a5b214807675e14165369d05b93a9cf692223b616d07cca227e74b0b";

const [ci, release, keepWarm, deploy, lighthouse, packageBuild] =
  await Promise.all([
    readFile(resolve(".github/workflows/ci.yml"), "utf8"),
    readFile(resolve(".github/workflows/release.yml"), "utf8"),
    readFile(resolve(".github/workflows/keep-warm.yml"), "utf8"),
    readFile(resolve("DEPLOY.md"), "utf8"),
    readFile(resolve("lighthouserc.cjs"), "utf8"),
    readFile(resolve("scripts/package-ci-build.mjs"), "utf8"),
  ]);

function jobBlocks(workflow) {
  const jobs = workflow.slice(workflow.indexOf("\njobs:\n") + 7);
  const starts = [...jobs.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];

  return starts.map((match, index) => ({
    name: match[1],
    body: jobs.slice(match.index, starts[index + 1]?.index ?? jobs.length),
  }));
}

describe("workflow integrity policy", () => {
  it("pins every canonical caller to the reviewed commit", () => {
    for (const workflow of [
      "reusable-ci-lint.yml",
      "reusable-security-ci.yml",
      "reusable-ci-web.yml",
      "reusable-perf-budget.yml",
    ]) {
      expect(ci).toContain(
        `uses: jrmoulckers/.github/.github/workflows/${workflow}@${canonicalWorkflowSha}`,
      );
    }
    expect(ci).toContain("pull-requests: read");
    expect(ci).toContain("lint-command: pnpm lint");
    expect(ci).toContain("format-check-command: pnpm format:check");
    expect(ci).toContain("audit-command: pnpm audit:ci");
    expect(ci).not.toContain("secrets: inherit");
    expect(ci).not.toContain("gitleaks/gitleaks-action");
  });

  it("reuses the canonical build artifact without exposing Lighthouse reports", () => {
    expect(ci).toContain("build-command: pnpm ci:build");
    expect(ci).toContain("artifact-path: ci-artifact");
    expect(ci).toContain(
      "artifact-name: ${{ needs.web.outputs.artifact-name }}",
    );
    expect(ci.match(/tar -xzf ci-artifact\/next-build\.tar\.gz/g)).toHaveLength(
      2,
    );
    expect(ci).toContain("lighthouse-public-upload: false");
    expect(ci).toContain("bundle-budget-kb: 32768");
    expect(lighthouse).toContain('target: "filesystem"');
    expect(packageBuild).toContain('requireGeneratedFile(".next/BUILD_ID")');
    expect(packageBuild).toContain('serviceWorkerAssets.includes("sw.js")');
  });

  it("keeps only product-specialized runner jobs local", () => {
    const names = jobBlocks(ci).map(({ name }) => name);
    for (const replacedJob of [
      "lint",
      "format",
      "semantic-pr-title",
      "typecheck",
      "unit",
      "build",
    ]) {
      expect(names).not.toContain(replacedJob);
    }
    for (const localJob of [
      "dispatch-guard",
      "i18n",
      "migration-drift",
      "migrations",
      "e2e",
      "lighthouse",
    ]) {
      expect(names).toContain(localJob);
    }
  });

  it("fails closed for manually selected dispatch refs", () => {
    expect(ci).toMatch(/^\s{2}workflow_dispatch:\s*$/m);
    expect(ci).not.toMatch(/workflow_dispatch:\s*\n\s+inputs:/);
    expect(ci).not.toContain("pull_request_target");
    expect(ci).toContain('GITHUB_REF_TYPE" != "branch');
    expect(ci).toContain("release-please--branches--main--components--");
    expect(ci).toContain(".head.repo.full_name == $repo");
    expect(ci).toContain('.user.login == "github-actions[bot]"');
    expect(ci).toContain('startswith("chore(main): release")');
  });

  it("dispatches release CI from supported, verified action output", () => {
    expect(release).toContain("id: release");
    expect(release).toContain(
      "if: steps.release.outputs.prs_created == 'true'",
    );
    expect(release).toContain("RELEASE_PR: ${{ steps.release.outputs.pr }}");
    expect(release).toContain("actions: write");
    expect(release).toContain(
      'gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$release_branch"',
    );
    expect(release).not.toContain("pull_request_target");
  });

  it("bounds every local runner job", () => {
    const localJobs = [ci, release, keepWarm].flatMap((workflow) =>
      jobBlocks(workflow).filter(({ body }) => body.includes("runs-on:")),
    );

    expect(localJobs.length).toBeGreaterThan(0);
    for (const { name, body } of localJobs) {
      expect(body, `${name} needs timeout-minutes`).toMatch(
        /^\s{4}timeout-minutes: \d+$/m,
      );
    }
  });

  it("pins each ephemeral PostgreSQL service to the verified digest", () => {
    expect(
      ci.match(new RegExp(`image: postgres:16@${postgresDigest}`, "g")),
    ).toHaveLength(3);
    expect(ci).not.toMatch(/image:\s+postgres:16\s*$/m);
  });

  it("documents the automated issue-title exception", () => {
    expect(deploy).toContain("This automation-generated PR is the sole");
    expect(deploy).toContain("`chore(main): release ...`");
  });
});
