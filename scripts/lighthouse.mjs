import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktop from 'lighthouse/core/config/desktop-config.js';

import configuration from '../lighthouserc.cjs';

export function checkBudgets(reports, assertions, warn = console.warn) {
  if (!reports.length) throw new Error('Lighthouse returned no reports');
  for (const [id, [level, limits]] of Object.entries(assertions)) {
    if (!['warn', 'error'].includes(level))
      throw new Error(`Unsupported assertion level: ${level}`);
    const values = reports.map((report) => {
      const value = id.startsWith('categories:')
        ? report.categories?.[id.slice('categories:'.length)]?.score
        : report.audits?.[id]?.numericValue;
      if (!Number.isFinite(value)) throw new Error(`Missing Lighthouse measurement: ${id}`);
      return value;
    });
    // LHCI's default optimistic aggregation: each budget uses its best run.
    const failures = [];
    if (limits.minScore !== undefined && Math.max(...values) < limits.minScore) {
      failures.push(`score below ${limits.minScore}`);
    }
    if (limits.maxNumericValue !== undefined && Math.min(...values) > limits.maxNumericValue) {
      failures.push(`value above ${limits.maxNumericValue}`);
    }
    if (failures.length) {
      const message = `${id}: ${failures.join(', ')} (runs: ${values.join(', ')})`;
      if (level === 'error') throw new Error(message);
      warn(message);
    }
  }
}

export async function stopServer(server) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit');
  server.kill();
  const timeout = setTimeout(() => server.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}

export async function startServer(collect) {
  const server = spawn(
    process.execPath,
    [fileURLToPath(import.meta.resolve('next/dist/bin/next')), 'start'],
    {
      stdio: ['ignore', 'pipe', 'inherit'],
      env: process.env,
    },
  );
  try {
    await new Promise((ready, reject) => {
      let output = '';
      const timeout = setTimeout(
        () => failed(new Error('Production server readiness timed out')),
        collect.startServerReadyTimeout,
      );
      const cleanup = () => {
        clearTimeout(timeout);
        server.off('error', failed);
        server.off('exit', exited);
      };
      const failed = (error) => {
        cleanup();
        reject(error);
      };
      const exited = (code, signal) =>
        failed(new Error(`Production server exited: ${code ?? signal}`));
      server.once('error', failed);
      server.once('exit', exited);
      server.stdout.on('data', (data) => {
        process.stdout.write(data);
        output = (output + data.toString('utf8')).slice(-8192);
        if (new RegExp(collect.startServerReadyPattern).test(output)) {
          cleanup();
          ready();
        }
      });
    });
    return server;
  } catch (error) {
    await stopServer(server);
    throw error;
  }
}

export async function runLighthouse(
  config = configuration.ci,
  {
    start = startServer,
    stop = stopServer,
    launchChrome = launch,
    audit = lighthouse,
    makeDirectory = mkdir,
    save = writeFile,
    warn = console.warn,
  } = {},
) {
  const { collect, assert, upload } = config;
  if (upload.target !== 'filesystem')
    throw new Error('Lighthouse reports must remain private filesystem artifacts');
  if (collect.settings.preset !== 'desktop')
    throw new Error('Expected the desktop Lighthouse profile');
  if (!Number.isInteger(collect.numberOfRuns) || collect.numberOfRuns < 1 || !collect.url.length) {
    throw new Error('Lighthouse requires routes and a positive run count');
  }
  await makeDirectory(upload.outputDir, { recursive: true });
  const server = await start(collect);
  let chrome;
  try {
    chrome = await launchChrome({
      chromeFlags: ['--headless=new', ...collect.settings.chromeFlags.split(/\s+/)],
    });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const [route, url] of collect.url.entries()) {
      const reports = [];
      for (let run = 0; run < collect.numberOfRuns; run++) {
        const result = await audit(url, { port: chrome.port, output: ['html', 'json'] }, desktop);
        if (!result?.lhr || result.lhr.runtimeError) {
          throw new Error(
            `Lighthouse failed for ${url}: ${result?.lhr?.runtimeError?.message ?? 'missing result'}`,
          );
        }
        if (
          !Array.isArray(result.report) ||
          result.report.length !== 2 ||
          result.report.some((report) => typeof report !== 'string' || !report.length)
        ) {
          throw new Error(`Lighthouse omitted HTML/JSON reports for ${url}`);
        }
        const stem = resolve(upload.outputDir, `route-${route + 1}-${stamp}-run-${run + 1}.report`);
        await save(`${stem}.html`, result.report[0]);
        await save(`${stem}.json`, result.report[1]);
        reports.push(result.lhr);
      }
      checkBudgets(reports, assert.assertions, (message) => warn(`${url}: ${message}`));
    }
  } finally {
    try {
      if (chrome) await chrome.kill();
    } finally {
      await stop(server);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runLighthouse();
}
