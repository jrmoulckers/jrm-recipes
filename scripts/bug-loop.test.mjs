// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  classify,
  FAST_MARKER,
  PRESENTATION_FILES,
  runCommands,
  testCommands,
  verifyRegressions,
} from './bug-loop.mjs';

const sourcePath = 'src/components/ui/badge.tsx';
const before = 'export const Badge = () => <span className="px-2 text-sm" />;';
const after = before.replace('px-2', 'px-3');
const change = (path, extra = {}) => ({ path, status: 'M', binary: false, lines: 2, ...extra });
const eligible = () => [
  change(sourcePath, { before, after }),
  change('src/components/ui/badge.test.tsx'),
  change('tests/e2e/bug-1166.spec.ts', { status: 'A' }),
];
const select = (changes = eligible(), extra = {}) => classify({ optIn: true, changes, ...extra });
const fixtures = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe('reported-bug risk boundary', () => {
  it('accepts a bounded class fix and rejects a behavior change in the same fixture', () => {
    expect(select().lane).toBe('fast');
    const changes = eligible();
    changes[0].after = after.replace('<span', '<button');
    expect(select(changes)).toMatchObject({
      lane: 'full',
      reason: expect.stringContaining('class-only'),
    });
  });

  it.each([
    ['imports', `import { secret } from './auth';\n${after}`],
    ['handler', after.replace('/>', 'onClick={() => fetch("/api/delete")} />')],
    ['hidden attribute', after.replace('/>', 'hidden />')],
    ['template expression', 'export const Badge = () => <span className={`px-${size}`} />;'],
    [
      'string-valued API',
      'export const Badge = () => <span className="px-3 text-sm" title="px-3" />;',
    ],
  ])('does not erase %s changes when comparing ASTs', (_name, text) => {
    const changes = eligible();
    changes[0].after = text;
    expect(select(changes).lane).toBe('full');
  });

  it('supports direct cn and cva classes without permitting variant or unrelated string edits', () => {
    for (const original of [
      'const x = cn("px-2 text-sm", props.className);',
      'const x = cva("px-2 text-sm", { defaultVariants: { variant: "default" } });',
    ]) {
      const changes = eligible();
      changes[0] = change(sourcePath, {
        before: original,
        after: original.replace('px-2', 'px-3'),
      });
      expect(select(changes).lane).toBe('fast');
      changes[0].after += '\nconst url = "/api/private";';
      expect(select(changes).lane).toBe('full');
    }
  });

  it('keeps every eligible primitive present on disk and does not allow the whole UI directory', () => {
    expect(PRESENTATION_FILES).toContain(sourcePath);
    for (const path of PRESENTATION_FILES)
      expect(readFileSync(path, 'utf8').length).toBeGreaterThan(0);
    expect(PRESENTATION_FILES).not.toContain('src/components/ui/image-upload.tsx');
  });

  it.each([
    'src/server/auth/index.ts',
    'src/app/api/example/route.ts',
    'src/styles/globals.css',
    'src/components/ui/image-upload.tsx',
    'src/messages/en.json',
    'package.json',
    'pnpm-lock.yaml',
    '.github/workflows/ci.yml',
    'scripts/bug-loop.mjs',
    'drizzle/0001.sql',
    'AGENTS.md',
  ])('routes %s to the full lane even alongside an eligible fix', (path) => {
    expect(select([...eligible(), change(path)]).lane).toBe('full');
  });

  it('requires explicit opt-in and a non-empty bounded diff', () => {
    expect(select(undefined, { optIn: false }).lane).toBe('full');
    expect(select([]).lane).toBe('full');
    expect(
      select([...eligible(), ...Array.from({ length: 6 }, (_, index) => change(`extra-${index}`))])
        .lane,
    ).toBe('full');
    const changes = eligible();
    changes[0].lines = 147;
    expect(select(changes).lane).toBe('full');
    changes[0].lines = 146;
    expect(select(changes).lane).toBe('fast');
  });

  it.each(['D', 'R100', 'mode', 'T'])('rejects file status %s', (status) => {
    const changes = eligible();
    changes[0].status = status;
    expect(select(changes).lane).toBe('full');
  });

  it('rejects binaries, newly added primitives, and unstaged new files', () => {
    const changes = eligible();
    changes[0].binary = true;
    expect(select(changes).lane).toBe('full');
    changes[0].binary = false;
    changes[0].status = 'A';
    expect(select(changes).lane).toBe('full');
    expect(select(undefined, { untracked: ['forgotten.ts'] }).lane).toBe('full');
  });

  it('requires a changed unit test for each primitive and a bug-numbered browser regression', () => {
    expect(select(eligible().slice(0, 2)).lane).toBe('full');
    expect(select(eligible().filter((file) => !file.path.endsWith('.test.tsx'))).lane).toBe('full');
    expect(
      select([...eligible(), change('src/components/ui/card.tsx', { before, after })]).lane,
    ).toBe('full');
    const changes = eligible();
    changes[2].path = 'tests/e2e/smoke.spec.ts';
    expect(select(changes).lane).toBe('full');
  });

  it('surfaces parse failures rather than accepting an unknown AST', () => {
    const changes = eligible();
    changes[0].after = 'export const broken = <';
    expect(() => select(changes)).toThrow('invalid TSX');
  });
});

describe('test execution and production wiring', () => {
  it('requires executed passing tests in each exact changed unit file, not just another badge file', () => {
    const selection = select();
    const file = { name: resolve(selection.unit[0]), assertionResults: [{ status: 'passed' }] };
    expect(() => verifyRegressions({ testResults: [file] }, 'unit', selection)).not.toThrow();
    for (const replacement of [
      { ...file, name: resolve('src/components/dietary/dietary-assessment-badge.test.tsx') },
      { ...file, assertionResults: [] },
      { ...file, assertionResults: [{ status: 'pending' }] },
    ]) {
      expect(() => verifyRegressions({ testResults: [replacement] }, 'unit', selection)).toThrow(
        'Regression must execute',
      );
    }
    expect(() => verifyRegressions({}, 'unit', selection)).toThrow('Invalid unit');
  });

  it('does not let smoke, skipped, expected-failing or unexecuted tests mask a missing browser regression', () => {
    const selection = select();
    const test = { expectedStatus: 'passed', results: [{ status: 'passed' }] };
    const spec = { file: 'bug-1166.spec.ts', tests: [test] };
    const report = (specs) => ({ suites: [{ suites: [{ specs }] }] });
    expect(() => verifyRegressions(report([spec]), 'e2e', selection)).not.toThrow();
    for (const replacement of [
      { ...spec, file: 'smoke.spec.ts' },
      { ...spec, tests: [] },
      { ...spec, tests: [{ ...test, expectedStatus: 'failed' }] },
      { ...spec, tests: [{ ...test, results: [] }] },
      { ...spec, tests: [{ ...test, results: [{ status: 'skipped' }] }] },
    ]) {
      expect(() => verifyRegressions(report([replacement]), 'e2e', selection)).toThrow(
        'Regression must execute',
      );
    }
    expect(() => verifyRegressions({}, 'e2e', selection)).toThrow('Invalid browser');
  });

  it('runs related unit tests and both smoke and bug browser tests only for fast selections', () => {
    const selection = select();
    expect(testCommands(selection, 'unit')).toEqual([
      ['exec', 'vitest', 'related', '--run', sourcePath, 'src/components/ui/badge.test.tsx'],
    ]);
    expect(testCommands(selection, 'e2e')).toEqual([
      ['exec', 'playwright', 'test', 'tests/e2e/smoke.spec.ts', 'tests/e2e/bug-1166.spec.ts'],
    ]);
    expect(testCommands(select([], {}), 'unit')).toEqual([['test']]);
    expect(testCommands(select([], {}), 'e2e')).toEqual([['exec', 'playwright', 'test']]);
  });

  it('stops at a failed command instead of continuing to build or publishing', () => {
    const seen = [];
    expect(() =>
      runCommands([['lint'], ['test'], ['check:bundle']], (args) => {
        seen.push(args[0]);
        if (args[0] === 'test') throw new Error('test failed');
      }),
    ).toThrow('test failed');
    expect(seen).toEqual(['lint', 'test']);
  });

  it('wires both actual CI test entry points without weakening the aggregate', () => {
    const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(ci).toContain('test-command: pnpm test:bug');
    expect(ci).toMatch(/name: E2E tests\s+run: pnpm test:e2e:bug/);
    expect(pkg.scripts['test:bug']).toBe('node scripts/bug-loop.mjs unit');
    expect(pkg.scripts['test:e2e:bug']).toBe('node scripts/bug-loop.mjs e2e');
    expect(ci).toContain('name: Quality gate');
  });

  it('drives the real entry point against a real diff, event and argument-safe test launcher', () => {
    const root = mkdtempSync(resolve('node_modules', '.bug-loop-fixture-'));
    fixtures.push(root);
    const git = (...args) => execFileSync('git', args, { cwd: root }).toString('utf8').trim();
    const put = (path, content) => {
      mkdirSync(resolve(root, path, '..'), { recursive: true });
      writeFileSync(join(root, path), content);
    };
    git('init', '-q', '-b', 'main');
    git('remote', 'add', 'origin', '.');
    put('.gitignore', 'event.json\nlauncher.cjs\nnode_modules/\nplaywright-report/\n');
    put(sourcePath, before);
    put('src/components/ui/badge.test.tsx', 'initial unit');
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'base',
    );
    const base = git('rev-parse', 'HEAD');
    put(sourcePath, after);
    put('src/components/ui/badge.test.tsx', 'changed regression');
    put('tests/e2e/bug-1166.spec.ts', 'browser regression');
    git('add', '.');
    mkdirSync(join(root, 'node_modules'));
    put(
      'launcher.cjs',
      `
      const fs = require('fs'), path = require('path'), args = process.argv.slice(2);
      console.log("LAUNCHED " + JSON.stringify(args));
      const output = args.find(arg => arg.startsWith('--outputFile.json='));
      if (output) fs.writeFileSync(output.slice('--outputFile.json='.length), JSON.stringify({
        testResults: [{ name: path.resolve('src/components/ui/badge.test.tsx'), assertionResults: [{ status: 'passed' }] }]
      }));
      if (args.includes('playwright')) {
        fs.mkdirSync('playwright-report', { recursive: true });
        fs.writeFileSync('playwright-report/results.json', JSON.stringify({
          suites: [{ specs: [{ file: 'bug-1166.spec.ts', tests: [{ expectedStatus: 'passed', results: [{ status: 'passed' }] }] }] }]
        }));
      }
    `,
    );
    const event = { pull_request: { base: { sha: base, ref: 'main' }, body: FAST_MARKER } };
    const invoke = (mode, eventName = 'pull_request') => {
      put('event.json', JSON.stringify(event));
      // Exercise Windows' case-insensitive environment keys even outside pnpm run.
      const inherited = { ...process.env, NPM_EXECPATH: 'fixture-must-not-run.cjs' };
      return execFileSync(process.execPath, [resolve('scripts/bug-loop.mjs'), mode], {
        cwd: root,
        stdio: 'pipe',
        env: {
          ...Object.fromEntries(
            Object.entries(inherited).filter(([name]) => name.toLowerCase() !== 'npm_execpath'),
          ),
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: eventName,
          GITHUB_EVENT_PATH: join(root, 'event.json'),
          npm_execpath: join(root, 'launcher.cjs'),
        },
      }).toString('utf8');
    };
    expect(invoke('unit')).toContain('"exec","vitest","related","--run"');
    expect(invoke('e2e')).toContain('tests/e2e/bug-1166.spec.ts');
    const launcher = readFileSync(join(root, 'launcher.cjs'), 'utf8');
    put(
      'launcher.cjs',
      launcher.replace("assertionResults: [{ status: 'passed' }]", 'assertionResults: []'),
    );
    expect(() => invoke('unit')).toThrow('Regression must execute');
    put('launcher.cjs', launcher.replace("file: 'bug-1166.spec.ts'", "file: 'smoke.spec.ts'"));
    expect(() => invoke('e2e')).toThrow('Regression must execute');
    put('launcher.cjs', launcher);
    event.pull_request.body = '';
    expect(invoke('unit')).toContain('LAUNCHED ["test"]');
    event.pull_request.body = FAST_MARKER;
    event.pull_request.base.ref = 'staging';
    expect(invoke('unit')).toContain('LAUNCHED ["test"]');
    expect(invoke('unit', 'push')).toContain('LAUNCHED ["test"]');
    event.pull_request.base.ref = 'main';
    put('untracked.ts', 'missed file');
    expect(invoke('unit')).toContain('LAUNCHED ["test"]');
    git('add', 'untracked.ts');
    expect(invoke('unit')).toContain('LAUNCHED ["test"]');
  }, 30000);
});
