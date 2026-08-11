import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Guards the async-query budget raised in `setup.ts` for #854.
 *
 * The budget is invisible: nothing referenced it, nothing failed when it was at
 * its default, and the only symptom was an occasional red that read as a real
 * accessibility regression. A number that can be lowered back without anything
 * noticing is the same silent-defeat shape as an unasserted list, so it is
 * pinned three ways — the applied value, the ordering that keeps failures
 * informative, and a behavioural proof that the extra budget is actually spent.
 */

// jsdom replaces the global `URL`, and `fileURLToPath` rejects the result, so
// resolve from the module's own directory the way the other source-scanning
// guards in this repo do.
const VITEST_CONFIG = join(
  resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  'vitest.config.ts',
);

function configuredTestTimeout(): number {
  const source = readFileSync(VITEST_CONFIG, 'utf8');
  const match = /testTimeout:\s*(\d+)/.exec(source);
  // A regex that stops matching must fail here rather than yield `undefined`
  // and let the comparisons below pass on a value nobody read.
  expect(match, `no testTimeout found in ${VITEST_CONFIG}`).not.toBeNull();
  return Number(match![1]);
}

describe('Testing Library async budget (#854)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('applies the raised asyncUtilTimeout from setup.ts', () => {
    // Runtime rather than a source scan: this also catches a later `configure`
    // call overriding setup.ts, which reading the file could not see.
    expect(getConfig().asyncUtilTimeout).toBe(3000);
  });

  it('pins the configured test budget', () => {
    expect(configuredTestTimeout()).toBe(5000);
  });

  it('keeps the async budget strictly below the test budget', () => {
    // If the async budget outlived the test budget, an expiring query would be
    // killed before it could report what it failed to find, and every such
    // failure would arrive as a bare timeout with no DOM dump.
    expect(getConfig().asyncUtilTimeout).toBeLessThan(configuredTestTimeout());
  });

  it('waits past the 1000ms default for a late-arriving element', async () => {
    const timer = setTimeout(() => {
      const el = document.createElement('div');
      el.setAttribute('role', 'alert');
      el.textContent = 'late';
      document.body.append(el);
    }, 1_500);

    try {
      // Fails on the stock 1000ms budget and passes on the configured one, so
      // this test measures the setting rather than restating it.
      await expect(screen.findByRole('alert')).resolves.toHaveTextContent('late');
    } finally {
      clearTimeout(timer);
    }
  });
});
