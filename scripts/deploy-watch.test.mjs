import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/deploy-watch.yml', 'utf8');

function runHealthJob(name, health, { httpFailure = false, inFlight = false } = {}) {
  const start = workflow.indexOf(`\n  ${name}:`);
  expect(start, `missing ${name}`).toBeGreaterThan(0);
  const rest = workflow.slice(start);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z-]+:\n/);
  const block = next < 0 ? rest : rest.slice(0, next + 1);
  const run = block.indexOf('        run: |\n');
  expect(run, `missing run in ${name}`).toBeGreaterThan(0);
  const script = block
    .slice(run + '        run: |\n'.length)
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');

  // Execute the shipped shell, replacing only its external transports. Real jq
  // is used on CI; the local shim supports the three scalar health projections.
  const result = spawnSync('bash', ['-s'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: {
      ...process.env,
      DEPLOY_SHA: 'expected-sha',
      HEALTH_URL: 'https://invalid.example/api/health',
      REPO: 'fixture/repo',
      FIXTURE_HEALTH: JSON.stringify(health),
      FIXTURE_HTTP_FAILURE: httpFailure ? '1' : '0',
      FIXTURE_IN_FLIGHT: inFlight ? '1' : '0',
    },
    input: `
curl() {
  echo PROBE >&2
  if [ "$FIXTURE_HTTP_FAILURE" = 1 ]; then return 22; fi
  printf '%s' "$FIXTURE_HEALTH"
}
git() {
  if [ "$1" = rev-parse ]; then echo expected-sha; else echo 0; fi
}
gh() {
  if [[ "$*" == *"/statuses?"* ]]; then
    if [ "$FIXTURE_IN_FLIGHT" = 1 ]; then echo pending; else echo success; fi
  elif [[ "$*" == *"/deployments?"* ]]; then echo 1;
  else echo "Deployment rate limited"; fi
}
if ! command -v jq >/dev/null; then
  jq() {
    node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const key=process.argv[1].match(/^\\.(sha|status|db) /)[1];console.log(JSON.parse(s)[key]??"");});' "$2"
  }
fi
${script}`,
  });
  expect(result.error, 'shell fixture failed to start or timed out').toBeUndefined();
  expect(result.status, result.stderr).not.toBeNull();
  expect(result.stderr.match(/^PROBE$/gm), result.stderr).toHaveLength(1);
  return { status: result.status, output: result.stdout + result.stderr };
}

describe('production health workflow behavior', () => {
  for (const name of ['production-serving', 'production-drift']) {
    it(`${name} accepts only the expected healthy SHA`, () => {
      const result = runHealthJob(name, { sha: 'expected-sha', status: 'ok', db: 'ok' });
      expect(result.status, result.output).toBe(0);
      expect(result.output).toContain('Production is serving');
    });

    it.each([
      { sha: 'expected-sha', status: 'degraded', db: 'degraded' },
      { sha: 'expected-sha', status: 'ok', db: 'not_configured' },
      { sha: 'expected-sha' },
    ])(`${name} rejects unhealthy or incomplete health %j`, (health) => {
      const result = runHealthJob(name, health);
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain('::error');
    });

    it(`${name} rejects a different SHA even when its ancestry count is zero`, () => {
      const result = runHealthJob(name, { sha: 'other-sha', status: 'ok', db: 'ok' });
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain('::error');
    });

    it(`${name} reports HTTP failure without retrying`, () => {
      const result = runHealthJob(name, {}, { httpFailure: true });
      expect(result.status, result.output).toBe(1);
      expect(result.output).toContain('::error');
    });
  }

  it('reports an in-flight deployment as deferred rather than verified', () => {
    const result = runHealthJob(
      'production-drift',
      { sha: 'other-sha', status: 'ok', db: 'ok' },
      { inFlight: true },
    );
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain('in flight');
    expect(result.output).not.toContain('Production is serving');
  });
});
