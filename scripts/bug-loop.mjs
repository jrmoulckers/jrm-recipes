import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export const FAST_MARKER = '<!-- recipes:bug-loop:fast -->';
export const PRESENTATION_FILES = [
  'src/components/ui/badge.tsx',
  'src/components/ui/card.tsx',
  'src/components/ui/separator.tsx',
  'src/components/ui/skeleton.tsx',
  'src/components/ui/spinner.tsx',
  'src/components/ui/typography.tsx',
];

function classFingerprint(source) {
  const file = ts.createSourceFile(
    'component.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (file.parseDiagnostics.length) throw new Error('Cannot classify invalid TSX');
  const transformed = ts.transform(file, [
    (context) => {
      const visit = (node) => {
        if (
          ts.isStringLiteral(node) &&
          /^[\w:/()[\].%,#! -]+$/.test(node.text) &&
          node.text.includes('-')
        ) {
          const parent = node.parent;
          const classAttribute =
            ts.isJsxAttribute(parent) && parent.name.getText(file) === 'className';
          const classCall =
            ts.isCallExpression(parent) &&
            ((parent.expression.getText(file) === 'cva' && parent.arguments[0] === node) ||
              parent.expression.getText(file) === 'cn');
          if (classAttribute || classCall) return ts.factory.createStringLiteral('__classes__');
        }
        return ts.visitEachChild(node, visit, context);
      };
      return (root) => ts.visitNode(root, visit);
    },
  ]);
  try {
    return ts.createPrinter({ removeComments: true }).printFile(transformed.transformed[0]);
  } finally {
    transformed.dispose();
  }
}

export function classify({ optIn, changes, untracked = [] }) {
  const full = (reason) => ({ lane: 'full', reason, source: [], unit: [], browser: [] });
  if (!optIn) return full('No explicit fast-lane request');
  if (untracked.length) return full('Untracked files must be staged before classification');
  if (!changes.length || changes.length > 8) return full('Requires 1-8 changed files');
  if (changes.some((file) => !['A', 'M'].includes(file.status) || file.binary)) {
    return full('Deletes, renames, mode changes, and binary changes require full validation');
  }
  if (changes.reduce((sum, file) => sum + file.lines, 0) > 150) {
    return full('Diff exceeds 150 added/deleted lines');
  }
  const source = changes.filter((file) => PRESENTATION_FILES.includes(file.path));
  if (!source.length || source.length > 3) return full('Requires 1-3 presentation primitives');
  for (const file of source) {
    if (file.status !== 'M' || classFingerprint(file.before) !== classFingerprint(file.after)) {
      return full(`Not a static class-only change: ${file.path}`);
    }
  }
  const unit = changes.filter((file) =>
    source.some((component) => file.path === component.path.replace(/\.tsx$/, '.test.tsx')),
  );
  const browser = changes.filter((file) => /^tests\/e2e\/bug-\d+\.spec\.ts$/.test(file.path));
  if (unit.length !== source.length || !browser.length)
    return full('Requires changed unit and bug-numbered browser regressions');
  const allowed = new Set([...source, ...unit, ...browser].map((file) => file.path));
  if (changes.some((file) => !allowed.has(file.path)))
    return full('Diff includes a full-lane path');
  return {
    lane: 'fast',
    reason: 'Bounded static-class change with unit and browser regressions',
    source: source.map((file) => file.path),
    unit: unit.map((file) => file.path),
    browser: browser.map((file) => file.path),
  };
}

function git(args) {
  return execFileSync('git', args, { maxBuffer: 8 * 1024 * 1024 }).toString('utf8');
}

export function inspect({ base, optIn }) {
  if (!/^[0-9a-f]{40}$/.test(base)) throw new Error('Base must be a full commit SHA');
  // Reusable CI checkouts are shallow. Fetch only the validated object, without
  // updating shared remote-tracking refs or weakening checkout credentials.
  git(['fetch', '--no-tags', '--depth=1', 'origin', base]);
  git(['cat-file', '-e', `${base}^{commit}`]);
  const records = git(['diff', '--raw', '--no-abbrev', '--no-renames', '-z', base]).split('\0');
  const stats = git(['diff', '--numstat', '--no-renames', '-z', base]).split('\0');
  const counts = new Map(
    stats.filter(Boolean).map((record) => {
      const [added, deleted, path] = record.split('\t');
      return [
        path,
        { binary: added === '-' || deleted === '-', lines: Number(added) + Number(deleted) },
      ];
    }),
  );
  const changes = [];
  for (let index = 0; index < records.length - 1; index += 2) {
    const [oldMode, newMode, , , status] = records[index].slice(1).split(' ');
    const path = records[index + 1];
    const count = counts.get(path);
    if (!count) throw new Error(`Missing diff statistics for ${path}`);
    const regular = newMode === '100644' && (oldMode === newMode || oldMode === '000000');
    const component = regular && status === 'M' && PRESENTATION_FILES.includes(path);
    changes.push({
      path,
      status: regular ? status : 'mode',
      ...count,
      before: component ? git(['show', `${base}:${path}`]) : '',
      after: component ? readFileSync(resolve(path), 'utf8') : '',
    });
  }
  return classify({
    optIn,
    changes,
    untracked: git(['ls-files', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean),
  });
}

export function testCommands(selection, mode) {
  if (mode === 'unit') {
    return selection.lane === 'fast'
      ? [['exec', 'vitest', 'related', '--run', ...selection.source, ...selection.unit]]
      : [['test']];
  }
  if (mode === 'e2e') {
    return [
      [
        'exec',
        'playwright',
        'test',
        ...(selection.lane === 'fast' ? ['tests/e2e/smoke.spec.ts', ...selection.browser] : []),
      ],
    ];
  }
  throw new Error(`Unknown test mode: ${mode}`);
}

export function runCommands(commands, run) {
  for (const args of commands) run(args);
}

export function verifyRegressions(report, mode, selection) {
  let files;
  if (mode === 'unit') {
    if (!Array.isArray(report.testResults)) throw new Error('Invalid unit test report');
    files = report.testResults.map((file) => ({
      path: resolve(file.name),
      passed:
        file.assertionResults?.length > 0 &&
        file.assertionResults.every((test) => test.status === 'passed'),
    }));
  } else {
    if (!Array.isArray(report.suites)) throw new Error('Invalid browser test report');
    files = [];
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        files.push({
          path: resolve('tests/e2e', spec.file),
          passed:
            spec.tests?.length > 0 &&
            spec.tests.every(
              (test) =>
                test.expectedStatus === 'passed' && test.results?.at(-1)?.status === 'passed',
            ),
        });
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites) visit(suite);
  }
  for (const path of selection[mode === 'unit' ? 'unit' : 'browser']) {
    const matches = files.filter((file) => file.path === resolve(path));
    if (!matches.length || matches.some((file) => !file.passed)) {
      throw new Error(`Regression must execute and pass without skips: ${path}`);
    }
  }
}

function runTests(selection, mode) {
  const commands = testCommands(selection, mode);
  if (selection.lane !== 'fast') return runCommands(commands, pnpm);
  if (mode === 'e2e') {
    const report = resolve('playwright-report/results.json');
    rmSync(report, { force: true });
    runCommands(commands, pnpm);
    verifyRegressions(JSON.parse(readFileSync(report, 'utf8')), mode, selection);
    return;
  }
  const directory = mkdtempSync(resolve('node_modules/.bug-loop-report-'));
  const report = join(directory, 'results.json');
  try {
    pnpm([...commands[0], '--reporter=default', '--reporter=json', `--outputFile.json=${report}`]);
    verifyRegressions(JSON.parse(readFileSync(report, 'utf8')), mode, selection);
  } finally {
    rmSync(report, { force: true });
    rmdirSync(directory);
  }
}

function pnpm(args) {
  // npm_execpath is supplied by pnpm run; executing its JS entry point avoids
  // cmd.exe argument reparsing on Windows.
  if (!process.env.npm_execpath) throw new Error('Run this command through pnpm');
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], { stdio: 'inherit' });
}

export function main(args = process.argv.slice(2)) {
  const [mode, ...options] = args;
  if (!['classify', 'unit', 'e2e', 'check'].includes(mode))
    throw new Error('Expected classify, unit, e2e, or check');
  let base;
  let optIn = false;
  if (process.env.GITHUB_ACTIONS === 'true') {
    if (options.length) throw new Error('CI selection comes only from its event');
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      base = event.pull_request.base.sha;
      optIn =
        event.pull_request.base.ref === 'main' &&
        event.pull_request.body?.split(/\r?\n/).includes(FAST_MARKER);
    }
  } else {
    if (options.length !== 3 || options[0] !== '--base' || options[2] !== '--fast') {
      throw new Error('Local usage: pnpm bug:check --base <full-main-sha> --fast');
    }
    [, base] = options;
    optIn = true;
  }
  const selection =
    base && optIn ? inspect({ base, optIn }) : classify({ optIn: false, changes: [] });
  console.log(`Bug loop: ${selection.lane} -- ${selection.reason}`);
  if (mode === 'classify') return selection;
  if (mode === 'check') {
    runCommands(
      [
        ['install', '--frozen-lockfile'],
        ['format:check'],
        ['lint'],
        ['typecheck'],
        ['copy:check'],
        ['audit:ci'],
      ],
      pnpm,
    );
    runTests(selection, 'unit');
    pnpm(['db:generate']);
    git(['diff', '--exit-code', '--', 'drizzle']);
    pnpm(['check:bundle']);
  } else {
    runTests(selection, mode);
  }
  return selection;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
