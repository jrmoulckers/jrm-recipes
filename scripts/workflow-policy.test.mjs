import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const canonicalWorkflowSha = "3b2d5cbb2cd619aca8e7cb1ac794086976033ace";
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
    expect(ci).toContain("run-dependency-review: false");
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

  // #672: `pull_request: branches: [main]` meant a PR based on any other branch
  // ran none of this gate while Vercel's non-Actions checks still reported
  // green, so the absence of checks presented as success. Narrowing the trigger
  // again would silently restore that, and nothing else in the repo would
  // notice, so assert the shape here.
  describe("stacked-PR gate (#672)", () => {
    const heavyJobs = ["e2e", "lighthouse"];
    const baseRefCondition =
      "if: github.event_name != 'pull_request' || github.base_ref == 'main'";

    it("runs pull_request CI for every base branch", () => {
      expect(ci).toMatch(/^\s{2}pull_request:\s*$/m);
      expect(ci).not.toMatch(/pull_request:\s*\n\s+branches:/);
      expect(ci).not.toMatch(/pull_request:\s*\n\s+branches-ignore:/);
    });

    it("gates only the two heaviest jobs on a main-based PR", () => {
      const gated = jobBlocks(ci)
        .filter(({ body }) => body.includes("github.base_ref"))
        .map(({ name }) => name);

      expect(gated.sort()).toEqual([...heavyJobs].sort());
    });

    it("uses the same condition for each gated job", () => {
      for (const { name, body } of jobBlocks(ci).filter(({ name }) =>
        heavyJobs.includes(name),
      )) {
        expect(body, `${name} needs the main-based PR condition`).toContain(
          baseRefCondition,
        );
      }
    });

    it("explains to the next person stacking a PR what runs", () => {
      expect(ci).toContain("What runs on a stacked PR (#672)");
      expect(ci).toContain("gh pr edit <n> --base main");
      expect(deploy).toContain("What runs on a stacked PR");
    });
  });
});
