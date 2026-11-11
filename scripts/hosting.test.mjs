// @vitest-environment node
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { buildContract, productionSafetyIssues } from '../src/config/deployment.js';
import { runSchedule } from './cron-runner.mjs';

const release = {
  SOURCE_REVISION: 'a'.repeat(40),
  NEXT_PUBLIC_APP_URL: 'https://recipes.example',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('portable release contract', () => {
  it('rejects identity drift and unsafe canonical origins', () => {
    expect(buildContract(release).revision).toBe(release.SOURCE_REVISION);
    expect(() => buildContract({ ...release, GITHUB_SHA: 'b'.repeat(40) })).toThrow(/disagrees/);
    for (const NEXT_PUBLIC_APP_URL of ['http://recipes.example', 'https://recipes.example/path']) {
      expect(() => buildContract({ ...release, NEXT_PUBLIC_APP_URL })).toThrow(/HTTPS origin/);
    }
    expect(() => buildContract({ ...release, SOURCE_REVISION: 'main' })).toThrow(/Git SHA/);
    expect(() => buildContract({ ...release, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: '' })).toThrow(
      /32-byte key/,
    );
    expect(() => buildContract({ ...release, NEXT_PUBLIC_SITE_URL: 'other.example' })).toThrow(
      /canonical app/,
    );
    const noncanonicalKey = `${release.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY.slice(0, -2)}F=`;
    expect(() =>
      buildContract({ ...release, NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: noncanonicalKey }),
    ).toThrow(/32-byte key/);
  });

  it('starts the server only after the actual startup entry point validates the artifact', () => {
    mkdirSync('.tools', { recursive: true });
    const root = mkdtempSync(resolve('.tools', 'startup-'));
    for (const dir of ['scripts', 'src', 'src/config']) mkdirSync(`${root}/${dir}`);
    const files = ['scripts/container-start.mjs', 'src/config/deployment.js'];
    for (const file of files) copyFileSync(file, `${root}/${file}`);
    writeFileSync(`${root}/package.json`, '{"type":"module"}');
    writeFileSync(`${root}/server.js`, 'console.log("SERVER_STARTED");');
    writeFileSync(
      `${root}/.hosting-build.json`,
      JSON.stringify({
        contract: buildContract(release),
        actionKeyHash: createHash('sha256')
          .update(release.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY)
          .digest('hex'),
      }),
    );
    const env = {
      ...release,
      APP_ENV: 'production',
      NODE_ENV: 'production',
      HOST_PROVIDER: 'azure',
      CRON_OWNER: 'none',
      CLERK_SECRET_KEY: 'sk_test_fixture',
      DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
    };
    const invoke = (overrides = {}) => {
      const result = spawnSync(process.execPath, [`${root}/scripts/container-start.mjs`], {
        env: { ...env, ...overrides },
        encoding: 'utf8',
      });
      expect(result.error).toBeUndefined();
      return result;
    };
    try {
      const good = invoke();
      expect(good.status).toBe(0);
      expect(good.stdout).toContain('SERVER_STARTED');
      for (const [overrides, reason] of [
        [{ SKIP_ENV_VALIDATION: '1' }, 'forbidden'],
        [{ SKIP_ENV_VALIDATION: '0' }, 'forbidden'],
        [{ SOURCE_REVISION: 'b'.repeat(40) }, 'differs from the built artifact'],
        [{ NEXT_PUBLIC_POSTHOG_HOST: 'https://other.example' }, 'differs from the built artifact'],
        [
          { NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64') },
          'key differs',
        ],
        [{ CRON_OWNER: 'vercel' }, 'explicit CRON_OWNER'],
        [{ CRON_OWNER: 'azure' }, 'requires CRON_SECRET'],
        [
          { CRON_OWNER: 'azure', CRON_SECRET: 'fixture', HOST_PROVIDER: 'node' },
          'requires HOST_PROVIDER',
        ],
        [{ DATABASE_URL: 'https://db.example' }, 'Postgres protocol'],
      ]) {
        const bad = invoke(overrides);
        expect(bad.status, reason).toBe(1);
        expect(bad.stderr).toContain(reason);
        expect(bad.stdout).not.toContain('SERVER_STARTED');
      }
    } finally {
      for (const file of [...files, 'package.json', 'server.js', '.hosting-build.json'])
        unlinkSync(`${root}/${file}`);
      for (const dir of ['src/config', 'src', 'scripts', '']) rmdirSync(`${root}/${dir}`);
    }
  });

  it('sends credentials only to the explicitly owned verified target, with no redirects or retries', async () => {
    const env = {
      CRON_OWNER: 'azure',
      CRON_SECRET: 'fixture',
      SOURCE_REVISION: release.SOURCE_REVISION,
      CRON_TARGET_ORIGIN: 'https://target.example',
    };
    const request = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sha: release.SOURCE_REVISION }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    await runSchedule('/api/cron/digest', env, request);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0].href).toBe('https://target.example/api/health/live');
    expect(request.mock.calls[0][1].headers).toBeUndefined();
    expect(request.mock.calls[1][0].href).toBe('https://target.example/api/cron/digest');
    expect(request.mock.calls[1][1].headers).toEqual({
      authorization: 'Bearer fixture',
      'x-heirloom-scheduler': 'azure',
    });
    for (const [, options] of request.mock.calls) {
      expect(options.redirect).toBe('error');
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    for (const overrides of [
      { CRON_OWNER: 'none' },
      { CRON_SECRET: '' },
      { CRON_TARGET_ORIGIN: 'http://target.example' },
      { CRON_TARGET_ORIGIN: 'https://user:pass@target.example' },
    ]) {
      const unused = vi.fn();
      await expect(
        runSchedule('/api/cron/digest', { ...env, ...overrides }, unused),
      ).rejects.toThrow();
      expect(unused).not.toHaveBeenCalled();
    }
    for (const result of [
      Response.json({ sha: 'b'.repeat(40) }),
      new Response(null, { status: 503 }),
    ]) {
      const wrongTarget = vi.fn().mockResolvedValue(result);
      await expect(runSchedule('/api/cron/digest', env, wrongTarget)).rejects.toThrow(
        /not the prepared release/,
      );
      expect(wrongTarget).toHaveBeenCalledTimes(1);
    }
    const failed = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ sha: release.SOURCE_REVISION }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(runSchedule('/api/cron/digest', env, failed)).rejects.toThrow(/HTTP 500/);
    expect(failed).toHaveBeenCalledTimes(2);
    const redirected = vi.fn().mockRejectedValue(new Error('redirect/timeout'));
    await expect(runSchedule('/api/cron/digest', env, redirected)).rejects.toThrow(
      'redirect/timeout',
    );
    expect(redirected).toHaveBeenCalledTimes(1);
    const unknown = vi.fn();
    await expect(runSchedule('/api/cron/not-real', env, unknown)).rejects.toThrow(/Unknown/);
    expect(unknown).not.toHaveBeenCalled();
  });

  it('rejects every deployed escape without breaking zero-config CI', () => {
    expect(productionSafetyIssues({ SKIP_ENV_VALIDATION: '1' })).toEqual([]);
    for (const marker of [{ APP_ENV: 'production' }, { VERCEL_ENV: 'production' }]) {
      expect(productionSafetyIssues({ ...marker, SKIP_ENV_VALIDATION: '0' })).toContain(
        'SKIP_ENV_VALIDATION is forbidden on a production host.',
      );
      for (const name of [
        'SKIP_ENV_VALIDATION',
        'NEXT_PUBLIC_DEV_AUTH_BYPASS',
        'E2E_IDENTITY_SELECTOR',
      ]) {
        expect(productionSafetyIssues({ ...marker, [name]: '1' })).toContain(
          `${name} is forbidden on a production host.`,
        );
      }
    }
  });

  it('wires the host-neutral failure into the production preflight', () => {
    const result = spawnSync(process.execPath, ['scripts/preflight-env.mjs'], {
      env: {
        ...process.env,
        ...release,
        APP_ENV: 'production',
        SKIP_ENV_VALIDATION: '1',
        CLERK_SECRET_KEY: 'sk_test_fixture',
        DATABASE_URL: 'postgresql://fixture:fixture@localhost/fixture',
      },
      encoding: 'utf8',
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('SKIP_ENV_VALIDATION is forbidden');
  });

  it('preserves all five UTC schedules in the inactive-by-default Azure adapter', () => {
    const { crons } = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const bicep = readFileSync('infra/azure/main.bicep', 'utf8');
    expect(crons).toHaveLength(5);
    for (const { path, schedule } of crons) {
      expect(bicep).toContain(`path: '${path}', cron: '${schedule}'`);
    }
    expect(bicep).toContain("param schedulerOwner string = 'none'");
    expect(bicep).toContain('param enableSchedules bool = false');
    expect(bicep).toContain('maxReplicas: 1');
  });

  it('does not package credential files or host dependencies as build context', () => {
    const rules = readFileSync('.dockerignore', 'utf8');
    expect(rules.startsWith('**\n')).toBe(true);
    expect(rules).not.toContain('!.env');
    const dockerfile = readFileSync('Dockerfile', 'utf8');
    expect(dockerfile).toContain('type=secret,id=actions_key,required=true');
    expect(dockerfile).not.toMatch(/ARG .*SECRET|ARG NEXT_SERVER_ACTIONS/);
    expect(dockerfile).not.toContain('migrate');
  });

  it('gives Azure readiness headroom beyond the application database deadline', () => {
    const bicep = readFileSync('infra/azure/main.bicep', 'utf8');
    const route = readFileSync('src/app/api/health/route.ts', 'utf8');
    const readiness = bicep.match(/type: 'Readiness'([\s\S]*?)\n {10}\}/);
    const timeout = readiness?.[1].match(/timeoutSeconds: (\d+)/);
    const deadline = route.match(/const DB_PROBE_TIMEOUT_MS = ([\d_]+)/);
    expect(timeout, 'Readiness must set an explicit timeout').not.toBeNull();
    expect(deadline, 'The application database deadline must be measured').not.toBeNull();
    expect(Number(timeout?.[1]) * 1000).toBeGreaterThanOrEqual(
      Number(deadline?.[1].replaceAll('_', '')) + 1000,
    );
    const thresholds = [...bicep.matchAll(/failureThreshold: (\d+)/g)];
    expect(thresholds).toHaveLength(3);
    for (const [, threshold] of thresholds) {
      expect(Number(threshold)).toBeLessThanOrEqual(10);
    }
  });

  it('actually disables the per-host persistent data cache', async () => {
    const { default: Cache } = await import('./container-cache.cjs');
    const cache = new Cache();
    await cache.set('recipe', { value: 'old' });
    expect(await cache.get('recipe')).toBeNull();
    const result = execFileSync(process.execPath, ['--check', 'scripts/cron-runner.mjs'], {
      encoding: 'utf8',
    });
    expect(result).toBe('');
  });
});
