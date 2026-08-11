import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const canonicalWorkflowSha = 'f06bc9f51d347d2681d551f944fbbdf2e9514b53';
const postgresDigest = 'sha256:95206741a5b214807675e14165369d05b93a9cf692223b616d07cca227e74b0b';

const [ci, release, keepWarm, deployWatch, rawDeploy, rawLighthouse, rawPackageBuild] =
  await Promise.all([
    readFile(resolve('.github/workflows/ci.yml'), 'utf8'),
    readFile(resolve('.github/workflows/release.yml'), 'utf8'),
    readFile(resolve('.github/workflows/keep-warm.yml'), 'utf8'),
    readFile(resolve('.github/workflows/deploy-watch.yml'), 'utf8'),
    readFile(resolve('DEPLOY.md'), 'utf8'),
    readFile(resolve('lighthouserc.cjs'), 'utf8'),
    readFile(resolve('scripts/package-ci-build.mjs'), 'utf8'),
  ]);

// These two guards assert against their own source text, which makes them
// sensitive to formatting rather than to the policy they exist to protect.
// Normalize at the read boundary so a Prettier setting cannot silently turn a
// real assertion into a no-op: `singleQuote` rewrites the quotes in
// `lighthouserc.cjs`, and the shared markdown `printWidth` reflows DEPLOY.md
// prose across line breaks. The anchor assertions below prove the normalized
// text is still non-empty.
const lighthouse = rawLighthouse.replace(/'/g, '"');
const packageBuild = rawPackageBuild.replace(/'/g, '"');
const deploy = rawDeploy.replace(/\s+/g, ' ');

// Returns the body of one trigger under `on:`, or null when that trigger is not
// declared. Returning null rather than '' is deliberate: the caller below bans a
// substring, and a ban over '' passes, so a deleted trigger would read exactly
// like a correctly unfiltered one (#844).
function triggerBody(workflow, trigger) {
  const source = workflow.replace(/^[^\S\n]*#.*$/gm, '');
  const start = source.search(/^on:[^\S\n]*$/m);
  if (start === -1) return null;

  const rest = source.slice(start + 'on:'.length);
  const end = rest.search(/^[A-Za-z_]/m);
  const block = end === -1 ? rest : rest.slice(0, end);
  const keys = [...block.matchAll(/^ {2}([A-Za-z_]+):/gm)];
  const index = keys.findIndex((key) => key[1] === trigger);
  if (index === -1) return null;

  return block.slice(keys[index].index, keys[index + 1]?.index ?? block.length);
}

function jobBlocks(workflow) {
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n') + 7);
  const starts = [...jobs.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)];

  return starts.map((match, index) => ({
    name: match[1],
    body: jobs.slice(match.index, starts[index + 1]?.index ?? jobs.length),
  }));
}

describe('workflow integrity policy', () => {
  it('pins every canonical caller to the reviewed commit', () => {
    for (const workflow of [
      'reusable-ci-lint.yml',
      'reusable-security-ci.yml',
      'reusable-ci-web.yml',
      'reusable-perf-budget.yml',
    ]) {
      expect(ci).toContain(
        `uses: jrmoulckers/.github/.github/workflows/${workflow}@${canonicalWorkflowSha}`,
      );
    }
    expect(ci).toContain('pull-requests: read');
    expect(ci).toContain('lint-command: pnpm lint');
    expect(ci).toContain('format-check-command: pnpm format:check');
    expect(ci).toContain('audit-command: pnpm audit:ci');
    expect(ci).toContain('run-dependency-review: false');
    expect(ci).not.toContain('secrets: inherit');
    expect(ci).not.toContain('gitleaks/gitleaks-action');
  });

  it('runs the pull request gate on every base branch', () => {
    // #672: `pull_request` must stay unfiltered. It was once `branches: [main]`,
    // which meant a PR based on any other branch ran none of this workflow — and
    // that did not present as "not run", because Vercel reported regardless and
    // a stacked PR showed a green check list and MERGEABLE. Measured on #670,
    // green while stacked and over the first-load JS budget the moment it was
    // retargeted at main. The failure mode is absence presenting as success, so
    // narrowing the trigger again is invisible unless something asserts it.
    const pullRequest = triggerBody(ci, 'pull_request');
    const push = triggerBody(ci, 'push');

    expect(pullRequest, 'ci.yml declares no pull_request trigger').not.toBeNull();
    expect(push, 'ci.yml declares no push trigger').not.toBeNull();

    // Positive control: `push` is branch-filtered on purpose, so a matcher that
    // can see its filter is a matcher that would see one on `pull_request`.
    expect(push).toMatch(/^ {4}branches: \[main, staging]$/m);
    expect(pullRequest).not.toMatch(/^\s+branches(-ignore)?:/m);
  });

  it('reuses the canonical build artifact without exposing Lighthouse reports', () => {
    expect(ci).toContain('build-command: pnpm ci:build');
    expect(ci).toContain('artifact-path: ci-artifact');
    expect(ci).toContain('artifact-name: ${{ needs.web.outputs.artifact-name }}');
    expect(ci.match(/tar -xzf ci-artifact\/next-build\.tar\.gz/g)).toHaveLength(2);
    expect(ci).toContain('lighthouse-public-upload: false');
    expect(ci).toContain('bundle-budget-kb: 32768');
    expect(lighthouse.length).toBeGreaterThan(0);
    expect(lighthouse).toContain('target: "filesystem"');
    expect(packageBuild.length).toBeGreaterThan(0);
    expect(packageBuild).toContain('requireGeneratedFile(".next/BUILD_ID")');
    expect(packageBuild).toContain('serviceWorkerAssets.includes("sw.js")');
  });

  it('keeps only product-specialized runner jobs local', () => {
    const names = jobBlocks(ci).map(({ name }) => name);
    for (const replacedJob of [
      'lint',
      'format',
      'semantic-pr-title',
      'typecheck',
      'unit',
      'build',
    ]) {
      expect(names).not.toContain(replacedJob);
    }
    for (const localJob of [
      'dispatch-guard',
      'i18n',
      'migration-drift',
      'migrations',
      'e2e',
      'lighthouse',
    ]) {
      expect(names).toContain(localJob);
    }
  });

  it('fails closed for manually selected dispatch refs', () => {
    expect(ci).toMatch(/^\s{2}workflow_dispatch:\s*$/m);
    expect(ci).not.toMatch(/workflow_dispatch:\s*\n\s+inputs:/);
    expect(ci).not.toContain('pull_request_target');
    expect(ci).toContain('GITHUB_REF_TYPE" != "branch');
    expect(ci).toContain('release-please--branches--main--components--');
    expect(ci).toContain('.head.repo.full_name == $repo');
    expect(ci).toContain('.user.login == "github-actions[bot]"');
    expect(ci).toContain('startswith("chore(main): release")');
  });

  it('dispatches release CI from supported, verified action output', () => {
    expect(release).toContain('id: release');
    expect(release).toContain("if: steps.release.outputs.prs_created == 'true'");
    expect(release).toContain('RELEASE_PR: ${{ steps.release.outputs.pr }}');
    expect(release).toContain('actions: write');
    expect(release).toContain(
      'gh workflow run ci.yml --repo "$GITHUB_REPOSITORY" --ref "$release_branch"',
    );
    expect(release).not.toContain('pull_request_target');
  });

  it('bounds every local runner job', () => {
    const localJobs = [ci, release, keepWarm].flatMap((workflow) =>
      jobBlocks(workflow).filter(({ body }) => body.includes('runs-on:')),
    );

    expect(localJobs.length).toBeGreaterThan(0);
    for (const { name, body } of localJobs) {
      expect(body, `${name} needs timeout-minutes`).toMatch(/^\s{4}timeout-minutes: \d+$/m);
    }
  });

  it('pins each ephemeral PostgreSQL service to the verified digest', () => {
    expect(ci.match(new RegExp(`image: postgres:16@${postgresDigest}`, 'g'))).toHaveLength(3);
    expect(ci).not.toMatch(/image:\s+postgres:16\s*$/m);
  });

  it('documents the automated issue-title exception', () => {
    expect(deploy.length).toBeGreaterThan(0);
    expect(deploy).toContain('This automation-generated PR is the sole');
    expect(deploy).toContain('`chore(main): release ...`');
  });

  it('lets the deploy-failure report time the build it cannot read', () => {
    // The `log_url` Vercel hands this workflow is the deployment's URL, not its
    // build output; the log needs a Vercel token no CI job holds. So the report
    // diagnoses by duration instead (#877): the Vercel commit status goes
    // pending -> terminal, and that delta bounds the phase the build died in.
    //
    // That reads the statuses API, so the job needs `statuses: read`. Losing it
    // degrades silently and in the worst possible direction: `gh` 403s, the
    // `|| printf` fallback swallows it, and every future failure reports "could
    // not be timed" — indistinguishable from a deploy that genuinely emitted no
    // pending status. The instrument would go blind while still running green,
    // so the permission is asserted rather than assumed.
    const failureJob = jobBlocks(deployWatch).find(
      ({ name }) => name === 'production-deploy-failed',
    );

    expect(failureJob, 'deploy-watch.yml declares no production-deploy-failed job').toBeDefined();
    // Anchor: proves the body was actually sliced, so the assertions below
    // cannot pass by matching against an empty string.
    expect(failureJob.body).toContain('DEPLOY_SHA: ${{ github.event.deployment.sha }}');
    expect(failureJob.body).toMatch(/^\s{4}permissions:\s*\n\s{6}statuses: read$/m);

    // Both arms, because a one-armed classifier is not a classifier. The second
    // is the one with no precedent in the data: every failure since #804 died
    // inside 11-17s, so a build that survives past install means the cause
    // changed and the standing diagnosis has expired.
    expect(failureJob.body).toContain('-le 20');
    expect(failureJob.body).toContain('died at or before');
    expect(failureJob.body).toContain('got PAST install');
  });

  it('keeps the closing-keyword guard on a job the gate waits for', () => {
    // The guard only works because it runs before the merge that performs the
    // close. Moving it to a job outside `gate.needs` would leave it reporting
    // a violation the merge then commits anyway -- green check, closed issue.
    const jobs = jobBlocks(ci);
    const i18n = jobs.find(({ name }) => name === 'i18n');
    const gate = jobs.find(({ name }) => name === 'gate');

    expect(i18n, 'ci.yml declares no i18n job').toBeDefined();
    expect(gate, 'ci.yml declares no gate job').toBeDefined();
    // Anchor: proves the slice is the real job body, so the checks below
    // cannot pass against an empty string.
    expect(i18n.body).toContain('name: Copy and i18n guards');

    expect(i18n.body).toContain('run: node scripts/check-closing-keywords.mjs');
    // Reading the body needs an explicit scope: this job's permissions block
    // replaces the default, so dropping the line degrades it to a 404 rather
    // than to an obvious failure.
    expect(i18n.body).toContain('pull-requests: read');
    // Same argument for issues: without this scope the human-action lookup 404s
    // and the check reports "skipped", which is indistinguishable from finding
    // nothing wrong. A guard that can only skip has not been shown to work.
    expect(i18n.body).toContain('issues: read');
    expect(i18n.body).toContain('PR_BODY: ${{ github.event.pull_request.body }}');

    expect(gate.body).toMatch(/^\s+- i18n$/m);
  });
});
