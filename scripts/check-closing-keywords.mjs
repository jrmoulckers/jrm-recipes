// Fails when a closing keyword points at an issue from inside prose.
//
// GitHub scans the whole of a PR body and every commit message for closing
// keywords, with no negation handling and no scoping. There is no way to
// mention one without arming it: PR #893 wrote "closed #855" while narrating
// that exact bug, and closed #855.
//
// The close fires when the PR merges, not when it is pushed, so a check that
// runs on the pull request lands before the damage -- which is why this is a
// guard and not merely a report.
//
// The rule enforced is the one already written down: a closing reference gets a
// line of its own. Prose mentions are mid-sentence by construction, so "alone
// on its line" separates intent from narration without having to read meaning.

import { execFileSync } from 'node:child_process';

const KEYWORDS = [
  'close',
  'closes',
  'closed',
  'fix',
  'fixes',
  'fixed',
  'resolve',
  'resolves',
  'resolved',
];

const KEYWORD_ALT = KEYWORDS.join('|');
const TARGET = String.raw`(?:#\d+|https?://\S+/issues/\d+)`;

// Anywhere on the line.
const MENTION = new RegExp(String.raw`\b(?:${KEYWORD_ALT})\s+${TARGET}`, 'i');

// The whole line is one or more closing references and nothing else.
const DECLARATION = new RegExp(
  String.raw`^(?:${KEYWORD_ALT})\s+${TARGET}(?:\s*,\s*${TARGET})*\.?$`,
  'i',
);

/**
 * @param {string} text
 * @param {string} source
 * @returns {{ source: string, line: number, text: string }[]}
 */
export function findViolations(text, source = 'text') {
  if (!text) return [];

  const violations = [];

  // Fenced blocks are deliberately NOT skipped. GitHub parses keywords inside
  // them, so a guard that skipped them would pass the exact text that closes an
  // issue -- and would have passed PR #893, which quoted the incident in a
  // fence.
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim().replace(/^>\s*/, '');
    if (!MENTION.test(line)) return;
    if (DECLARATION.test(line)) return;
    violations.push({ source, line: index + 1, text: excerpt(line) });
  });

  return violations;
}

// A PR body can reach this as one very long line, and dumping it verbatim buries
// the offending phrase in a paragraph. Report a window around the match instead.
function excerpt(line, radius = 70) {
  const match = MENTION.exec(line);
  if (!match || line.length <= radius * 2) return line;

  const start = Math.max(0, match.index - radius);
  const end = Math.min(line.length, match.index + match[0].length + radius);

  return `${start > 0 ? '...' : ''}${line.slice(start, end)}${end < line.length ? '...' : ''}`;
}

function commitMessages() {
  const repo = process.env.GITHUB_REPOSITORY;
  const number = process.env.PR_NUMBER;
  if (!repo || !number) return [];

  const out = execFileSync('gh', ['api', '--paginate', `repos/${repo}/pulls/${number}/commits`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  // Parsed rather than shaped with --jq: a delimiter chosen to be absent from
  // commit messages is a guess, and JSON already carries the boundary.
  return JSON.parse(out).map((entry) => ({
    sha: entry.sha.slice(0, 8),
    message: entry.commit.message,
  }));
}

function main() {
  const violations = [...findViolations(process.env.PR_BODY ?? '', 'pull request body')];

  for (const { sha, message } of commitMessages()) {
    violations.push(...findViolations(message, `commit ${sha}`));
  }

  if (violations.length === 0) {
    console.log('closing keywords: every closing reference stands on its own line.');
    return;
  }

  console.error(`closing keywords: ${violations.length} reference(s) sit inside prose.\n`);
  for (const v of violations) {
    console.error(`  ${v.source}, line ${v.line}:\n    ${v.text}\n`);
  }
  console.error(
    [
      'GitHub will act on each of these when this pull request merges. It applies',
      'no negation handling, so a sentence saying you are NOT closing an issue',
      'closes it, and the past tense reads the same as the imperative.',
      '',
      'Give a reference you mean a line of its own:',
      '',
      '    Closes #123',
      '',
      'To mention an issue in prose, drop the keyword -- write "#123 stays open"',
      '-- or replace the number with a placeholder when quoting the pattern.',
      "See docs/ci.md, 'A closing keyword cannot be negated'.",
    ].join('\n'),
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
