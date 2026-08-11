// Fails when a closing keyword points at an issue from inside prose, and when a
// pull request would close an issue that still asks for a human.
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
//
// The second check exists because AGENTS.md tells an agent to leave a
// "## Needs Human Action" note when it hits a gate it cannot pass, and a
// closing keyword then discards that note silently. PR #860 closed #859 while
// #859 was asking a human to decide something, so the request survived only in
// a closed issue that nobody triaging open work would ever see.

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
// A closing reference to a bare #N in this repository. Cross-repository closes
// use a full URL and act on the other repository's issue, which this check
// cannot read, so they are deliberately out of scope rather than looked up
// against the wrong repository.
const BARE_CLOSING_REF = new RegExp(String.raw`\b(?:${KEYWORD_ALT})\s+#(\d+)`, 'gi');

// Matches the heading AGENTS.md prescribes, at any heading level.
export const HUMAN_ACTION_HEADING = /^\s{0,3}#{1,6}\s*Needs Human Action\s*$/im;

/**
 * Issue numbers this text would close on merge.
 *
 * @param {string} text
 * @returns {number[]}
 */
export function closingTargets(text) {
  if (!text) return [];

  const numbers = new Set();
  for (const match of text.matchAll(BARE_CLOSING_REF)) numbers.add(Number(match[1]));

  return [...numbers].sort((a, b) => a - b);
}

/**
 * @param {{ number: number, state?: string, title?: string, body?: string,
 *           isPullRequest?: boolean, error?: string }[]} entries
 * @returns {{ blocked: object[], skipped: object[], checked: number }}
 */
export function evaluateHumanAction(entries) {
  const blocked = [];
  const skipped = [];
  let checked = 0;

  for (const entry of entries) {
    // An entry that could not be read is unknown, not clean. Failing here would
    // turn an API hiccup into a red gate, so it skips loudly instead (#796).
    if (entry.error) {
      skipped.push(entry);
      continue;
    }

    // A pull request is not a request for a human, and closing an already
    // closed issue discards nothing that is not already discarded.
    if (entry.isPullRequest || entry.state !== 'open') continue;

    checked += 1;
    if (HUMAN_ACTION_HEADING.test(entry.body ?? '')) blocked.push(entry);
  }

  return { blocked, skipped, checked };
}

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

function fetchIssue(repo, number) {
  try {
    const out = execFileSync('gh', ['api', `repos/${repo}/issues/${number}`], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const issue = JSON.parse(out);

    return {
      number,
      state: issue.state,
      title: issue.title ?? '',
      body: issue.body ?? '',
      isPullRequest: Boolean(issue.pull_request),
    };
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    return { number, error: message };
  }
}

function checkHumanAction(texts) {
  const repo = process.env.GITHUB_REPOSITORY;
  const numbers = [...new Set(texts.flatMap((text) => closingTargets(text)))].sort((a, b) => a - b);

  if (!repo || numbers.length === 0) return false;

  const { blocked, skipped, checked } = evaluateHumanAction(
    numbers.map((number) => fetchIssue(repo, number)),
  );

  if (skipped.length > 0) {
    console.log(
      `human action: ${skipped.length} referenced issue(s) could not be read and were skipped ` +
        `(${skipped.map((s) => `#${s.number}`).join(', ')}).`,
    );
  }

  if (blocked.length === 0) {
    console.log(
      `human action: ${checked} open issue(s) closed by this pull request carry no ` +
        'unresolved request for a human.',
    );
    return false;
  }

  console.error(
    `\nhuman action: ${blocked.length} issue(s) this pull request would close still ask ` +
      'for a human.\n',
  );
  for (const entry of blocked) {
    console.error(`  #${entry.number}: ${entry.title}`);
  }
  console.error(
    [
      '',
      'Merging closes these, and the request goes with them. A closed issue is not',
      'in anyone\u2019s triage queue, so the ask survives only for someone who already',
      'knows to look -- which is the whole failure (#859, closed this way by #860).',
      '',
      'Pick one:',
      '',
      '  - Use `Refs #N` instead, and leave the issue open for the human.',
      '  - Remove the "Needs Human Action" section from the issue, if this pull',
      '    request resolves it.',
      '  - Route the ask somewhere that stays visible -- an issue on the repository',
      '    that owns the fix -- and say so on the issue before closing it.',
    ].join('\n'),
  );

  return true;
}

function main() {
  const body = process.env.PR_BODY ?? '';
  const commits = commitMessages();
  const violations = [...findViolations(body, 'pull request body')];

  for (const { sha, message } of commits) {
    violations.push(...findViolations(message, `commit ${sha}`));
  }

  if (violations.length === 0) {
    console.log('closing keywords: every closing reference stands on its own line.');
  } else {
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

  // Runs even when the first check failed, so one push surfaces both problems.
  if (checkHumanAction([body, ...commits.map((c) => c.message)])) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  main();
}
