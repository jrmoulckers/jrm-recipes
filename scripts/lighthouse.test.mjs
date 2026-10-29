import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import configuration from '../lighthouserc.cjs';
import { checkBudgets, runLighthouse } from './lighthouse.mjs';

const config = configuration.ci;
const report = (score = 0.9, lcp = 2000, cls = 0.05, tbt = 100) => ({
  categories: { performance: { score } },
  audits: {
    'largest-contentful-paint': { numericValue: lcp },
    'cumulative-layout-shift': { numericValue: cls },
    'total-blocking-time': { numericValue: tbt },
  },
});

function harness() {
  const chrome = { port: 9222, kill: vi.fn().mockResolvedValue(undefined) };
  const server = {};
  return {
    chrome,
    server,
    dependencies: {
      start: vi.fn().mockResolvedValue(server),
      stop: vi.fn().mockResolvedValue(undefined),
      launchChrome: vi.fn().mockResolvedValue(chrome),
      audit: vi.fn().mockImplementation(async () => ({
        lhr: report(),
        report: ['<html>private report</html>', JSON.stringify(report())],
      })),
      makeDirectory: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(undefined),
      warn: vi.fn(),
    },
  };
}

describe('private Lighthouse runner', () => {
  it('preserves the production routes, three desktop runs, and calibrated warning budgets', () => {
    expect(config.collect.url).toEqual([
      'http://localhost:3000/',
      'http://localhost:3000/recipes',
      'http://localhost:3000/recipes/home-cook/nonnas-sunday-gravy',
    ]);
    expect(config.collect.numberOfRuns).toBe(3);
    expect(config.collect.settings.preset).toBe('desktop');
    expect(config.assert.assertions).toEqual({
      'categories:performance': ['warn', { minScore: 0.8 }],
      'largest-contentful-paint': ['warn', { maxNumericValue: 2500 }],
      'cumulative-layout-shift': ['warn', { maxNumericValue: 0.1 }],
      'total-blocking-time': ['warn', { maxNumericValue: 200 }],
    });
    expect(config.upload).toEqual({ target: 'filesystem', outputDir: '.lighthouseci' });
  });

  it('collects nine audits using the desktop profile, writes both report formats, and cleans up', async () => {
    const { dependencies, chrome, server } = harness();
    await runLighthouse(config, dependencies);
    expect(dependencies.start).toHaveBeenCalledWith(config.collect);
    expect(dependencies.launchChrome).toHaveBeenCalledWith({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
    });
    expect(dependencies.audit).toHaveBeenCalledTimes(9);
    for (const [url, flags, profile] of dependencies.audit.mock.calls) {
      expect(config.collect.url).toContain(url);
      expect(flags).toEqual({ port: chrome.port, output: ['html', 'json'] });
      expect(profile.settings.formFactor).toBe('desktop');
      expect(profile.settings.throttling.cpuSlowdownMultiplier).toBe(1);
    }
    expect(dependencies.save).toHaveBeenCalledTimes(18);
    const files = dependencies.save.mock.calls.map(([path]) => path);
    expect(new Set(files).size).toBe(18);
    expect(files.every((path) => path.startsWith(resolve('.lighthouseci')))).toBe(true);
    expect(files.filter((path) => path.endsWith('.html'))).toHaveLength(9);
    expect(files.filter((path) => path.endsWith('.json'))).toHaveLength(9);
    expect(chrome.kill).toHaveBeenCalledOnce();
    expect(dependencies.stop).toHaveBeenCalledWith(server);
  });

  it('preserves warning severity and optimistic aggregation, including at the boundary', () => {
    const warn = vi.fn();
    checkBudgets([report(0.7, 2600, 0.2, 201)], config.assert.assertions, warn);
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockClear();
    checkBudgets(
      [report(0.7, 2600, 0.2, 201), report(0.8, 2500, 0.1, 200)],
      config.assert.assertions,
      warn,
    );
    expect(warn).not.toHaveBeenCalled();
    expect(() =>
      checkBudgets([report(0.7)], {
        'categories:performance': ['error', { minScore: 0.8 }],
      }),
    ).toThrow('score below 0.8');
  });

  it('cannot certify missing measurements or an empty report population', () => {
    expect(() => checkBudgets([], config.assert.assertions)).toThrow('no reports');
    for (const missing of [undefined, null, NaN, Infinity]) {
      const incomplete = report();
      incomplete.audits['total-blocking-time'].numericValue = missing;
      expect(() => checkBudgets([incomplete], config.assert.assertions)).toThrow(
        'Missing Lighthouse measurement: total-blocking-time',
      );
    }
  });

  it.each([
    undefined,
    { lhr: { runtimeError: { message: 'navigation failed' } }, report: ['html', 'json'] },
    { lhr: report(), report: ['html'] },
    { lhr: report(), report: ['', 'json'] },
    { lhr: { categories: { performance: { score: 0.9 } } }, report: ['html', 'json'] },
  ])('fails incomplete or unsuccessful audits and releases both processes', async (result) => {
    const { dependencies, chrome, server } = harness();
    dependencies.audit.mockResolvedValue(result);
    await expect(runLighthouse(config, dependencies)).rejects.toThrow();
    expect(chrome.kill).toHaveBeenCalledOnce();
    expect(dependencies.stop).toHaveBeenCalledWith(server);
  });

  it('propagates audit exceptions and write failures without leaving processes behind', async () => {
    for (const failing of ['audit', 'save']) {
      const { dependencies, chrome, server } = harness();
      dependencies[failing].mockRejectedValue(new Error(`${failing} failed`));
      await expect(runLighthouse(config, dependencies)).rejects.toThrow(`${failing} failed`);
      expect(chrome.kill).toHaveBeenCalledOnce();
      expect(dependencies.stop).toHaveBeenCalledWith(server);
    }
  });

  it('stops the server when Chrome cannot launch or cannot clean up', async () => {
    for (const failing of ['launch', 'cleanup']) {
      const { dependencies, chrome, server } = harness();
      if (failing === 'launch') dependencies.launchChrome.mockRejectedValue(new Error(failing));
      else chrome.kill.mockRejectedValue(new Error(failing));
      await expect(runLighthouse(config, dependencies)).rejects.toThrow(failing);
      expect(dependencies.stop).toHaveBeenCalledWith(server);
    }
  });

  it('does not launch Chrome after server startup fails', async () => {
    const { dependencies } = harness();
    dependencies.start.mockRejectedValue(new Error('server failed'));
    await expect(runLighthouse(config, dependencies)).rejects.toThrow('server failed');
    expect(dependencies.launchChrome).not.toHaveBeenCalled();
  });

  it('refuses public upload and vacuous collections before starting a process', async () => {
    for (const invalid of [
      { ...config, upload: { ...config.upload, target: 'temporary-public-storage' } },
      { ...config, collect: { ...config.collect, numberOfRuns: 0 } },
      { ...config, collect: { ...config.collect, url: [] } },
    ]) {
      const { dependencies } = harness();
      await expect(runLighthouse(invalid, dependencies)).rejects.toThrow();
      expect(dependencies.start).not.toHaveBeenCalled();
    }
  });

  it('wires CI and the package command to the same executable runner', async () => {
    const [ci, manifest, runner] = await Promise.all([
      readFile(resolve('.github/workflows/ci.yml'), 'utf8'),
      readFile(resolve('package.json'), 'utf8').then(JSON.parse),
      readFile(resolve('scripts/lighthouse.mjs'), 'utf8'),
    ]);
    expect(ci).toContain('run: pnpm lhci');
    expect(manifest.scripts.lhci).toBe('node scripts/lighthouse.mjs');
    expect(manifest.devDependencies['@lhci/cli']).toBeUndefined();
    expect(runner).toMatch(/if \(process\.argv\[1][\s\S]*await runLighthouse\(\)/);
    expect(ci).toContain('path: .lighthouseci');
  });
});
