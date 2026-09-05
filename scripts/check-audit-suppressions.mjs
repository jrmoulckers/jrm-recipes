import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const POLICY_PATH = 'security/audit-suppressions.json';
const GHSA_PATTERN = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;
const SEVERITIES = new Set(['low', 'moderate', 'high', 'critical']);
const CONFIDENCE_LEVELS = new Set(['low', 'medium', 'high']);
const REQUIRED_TEXT_FIELDS = [
  'ecosystem',
  'package',
  'affectedVersions',
  'dependencyPath',
  'reachability',
  'rationale',
  'reviewedAt',
  'expiresAt',
];
const REQUIRED_LIST_FIELDS = [
  'auditPaths',
  'affectedAssets',
  'trustBoundaries',
  'invalidationConditions',
  'sources',
];

function parseDate(value, field, ghsa, errors, endOfDay = false) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${ghsa}.${field} must be an ISO date (YYYY-MM-DD)`);
    return null;
  }

  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    errors.push(`${ghsa}.${field} is not a valid calendar date`);
    return null;
  }
  return date;
}

export function validateAuditSuppressions({
  manifest,
  policy,
  auditReport,
  upstreamAdvisories,
  now = new Date(),
}) {
  const errors = [];
  const auditConfig = manifest?.pnpm?.auditConfig;
  const ignored = auditConfig?.ignoreGhsas;
  const suppressions = policy?.suppressions;

  const unsupportedAuditConfigKeys = Object.keys(auditConfig ?? {}).filter(
    (key) => key !== 'ignoreGhsas',
  );
  for (const key of unsupportedAuditConfigKeys) {
    errors.push(
      `package.json pnpm.auditConfig.${key} is an unsupported suppression path; use ignoreGhsas with a rationale`,
    );
  }
  if (!Array.isArray(ignored)) {
    errors.push('package.json pnpm.auditConfig.ignoreGhsas must be an array');
    return errors;
  }
  if (policy?.schemaVersion !== 1 || !Array.isArray(suppressions)) {
    errors.push(`${POLICY_PATH} must use schemaVersion 1 and contain a suppressions array`);
    return errors;
  }

  const ignoredSet = new Set(ignored);
  if (ignoredSet.size !== ignored.length) {
    errors.push('package.json contains duplicate ignored GHSAs');
  }

  const suppressionIds = suppressions.map((entry) => entry?.ghsa);
  const suppressionSet = new Set(suppressionIds);
  if (suppressionSet.size !== suppressionIds.length) {
    errors.push(`${POLICY_PATH} contains duplicate suppression rationales`);
  }
  for (const ghsa of ignored) {
    if (!suppressionSet.has(ghsa)) {
      errors.push(`${ghsa} is ignored without a rationale in ${POLICY_PATH}`);
    }
  }
  for (const ghsa of suppressionIds) {
    if (!ignoredSet.has(ghsa)) {
      errors.push(`${ghsa} has a rationale but is not ignored in package.json`);
    }
  }

  const actions = Array.isArray(auditReport?.actions) ? auditReport.actions : [];
  const advisories = Array.isArray(upstreamAdvisories) ? upstreamAdvisories : [];
  for (const entry of suppressions) {
    const ghsa = entry?.ghsa ?? '<missing-ghsa>';
    const approvedPaths = Array.isArray(entry?.auditPaths) ? entry.auditPaths : [];
    if (!GHSA_PATTERN.test(ghsa)) {
      errors.push(`${ghsa}.ghsa must be a valid GitHub advisory identifier`);
    }
    if (!Number.isSafeInteger(entry?.auditId) || entry.auditId <= 0) {
      errors.push(`${ghsa}.auditId must be a positive npm advisory identifier`);
    }
    for (const field of REQUIRED_TEXT_FIELDS) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`${ghsa}.${field} must be a non-empty string`);
      }
    }
    for (const field of REQUIRED_LIST_FIELDS) {
      if (
        !Array.isArray(entry?.[field]) ||
        entry[field].length === 0 ||
        entry[field].some((value) => typeof value !== 'string' || value.trim() === '')
      ) {
        errors.push(`${ghsa}.${field} must be a non-empty list of strings`);
      }
    }
    if (!SEVERITIES.has(entry?.severity)) {
      errors.push(`${ghsa}.severity must be low, moderate, high, or critical`);
    }
    if (!SEVERITIES.has(entry?.residualRisk)) {
      errors.push(`${ghsa}.residualRisk must be low, moderate, high, or critical`);
    }
    if (!CONFIDENCE_LEVELS.has(entry?.confidence)) {
      errors.push(`${ghsa}.confidence must be low, medium, or high`);
    }
    if (entry?.fixedVersion !== null) {
      errors.push(`${ghsa} records fixedVersion ${entry?.fixedVersion}; remove the suppression`);
    }
    if (
      Array.isArray(entry?.sources) &&
      entry.sources.some((source) => !source.startsWith('https://'))
    ) {
      errors.push(`${ghsa}.sources must contain only HTTPS URLs`);
    }

    const reviewedAt = parseDate(entry?.reviewedAt, 'reviewedAt', ghsa, errors);
    const expiresAt = parseDate(entry?.expiresAt, 'expiresAt', ghsa, errors, true);
    if (reviewedAt && expiresAt && reviewedAt > expiresAt) {
      errors.push(`${ghsa}.expiresAt must be after reviewedAt`);
    }
    if (expiresAt && now > expiresAt) {
      errors.push(`${ghsa} expired on ${entry.expiresAt}; re-review or remove the suppression`);
    }

    const advisory = advisories.find((candidate) => candidate?.ghsa_id === ghsa);
    if (!advisory) {
      errors.push(`${ghsa} could not be verified against the GitHub Advisory Database`);
    } else {
      if (advisory.severity !== entry?.severity) {
        errors.push(
          `${ghsa} severity changed from ${entry?.severity} to ${advisory.severity}; re-review it`,
        );
      }
      const packageVulnerabilities = advisory.vulnerabilities?.filter(
        (vulnerability) =>
          vulnerability?.package?.ecosystem?.toLowerCase() === entry?.ecosystem &&
          vulnerability?.package?.name === entry?.package,
      );
      if (!packageVulnerabilities?.length) {
        errors.push(
          `${ghsa} no longer describes ${entry?.ecosystem}:${entry?.package}; re-review it`,
        );
      } else {
        if (packageVulnerabilities.length !== advisory.vulnerabilities.length) {
          errors.push(`${ghsa} now covers an additional package or ecosystem; re-review it`);
        }
        const ranges = packageVulnerabilities.map(
          (vulnerability) => vulnerability.vulnerable_version_range,
        );
        if (!ranges.includes(entry?.affectedVersions)) {
          errors.push(`${ghsa} affected versions changed; re-review the suppression`);
        }
        const fixedVersions = packageVulnerabilities
          .map((vulnerability) => vulnerability.first_patched_version)
          .filter(Boolean);
        if (fixedVersions.length > 0) {
          errors.push(
            `${ghsa} now has patched version ${fixedVersions.join(', ')}; remove the suppression`,
          );
        }
      }
    }

    const matchingActions = actions.filter((action) =>
      action?.resolves?.some((resolution) => resolution?.id === entry?.auditId),
    );
    if (matchingActions.length === 0) {
      errors.push(
        `${ghsa} is no longer reported for ${entry?.package}; remove the stale suppression`,
      );
      continue;
    }
    for (const action of matchingActions) {
      if (action.module !== entry?.package) {
        errors.push(
          `${ghsa} audit id ${entry?.auditId} now belongs to ${action.module}, not ${entry?.package}`,
        );
      }
      if (action.action === 'update') {
        errors.push(
          `${ghsa} is fixable by updating ${action.module} to ${action.target}; remove the suppression`,
        );
      } else if (action.action !== 'review') {
        errors.push(`${ghsa} has unexpected pnpm audit action ${action.action}`);
      }
      for (const resolution of action.resolves.filter(
        (candidate) => candidate?.id === entry?.auditId,
      )) {
        if (!approvedPaths.includes(resolution?.path)) {
          errors.push(
            `${ghsa} reached an unapproved dependency path ${resolution?.path}; re-review the suppression`,
          );
          continue;
        }
        const rootDependency = resolution.path.match(/^\.>(@[^>]+|[^>]+)/)?.[1];
        if (
          !rootDependency ||
          !Object.hasOwn(manifest?.devDependencies ?? {}, rootDependency) ||
          Object.hasOwn(manifest?.dependencies ?? {}, rootDependency) ||
          Object.hasOwn(manifest?.optionalDependencies ?? {}, rootDependency)
        ) {
          errors.push(
            `${ghsa} path ${resolution.path} is not rooted exclusively in a devDependency`,
          );
        }
      }
    }
  }

  return errors;
}

function runPnpmAudit() {
  return new Promise((resolveAudit, reject) => {
    const pnpmScript = process.env.npm_execpath;
    const command = pnpmScript ? process.execPath : 'pnpm';
    const args = pnpmScript ? [pnpmScript, 'audit', '--json'] : ['audit', '--json'];
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: !pnpmScript && process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolveAudit(JSON.parse(stdout));
      } catch (error) {
        reject(
          new Error(
            `pnpm audit did not return valid JSON: ${error.message}${stderr ? `\n${stderr}` : ''}`,
          ),
        );
      }
    });
  });
}

async function fetchAdvisories(suppressions) {
  return Promise.all(
    suppressions.map(async ({ ghsa }) => {
      const authorization = process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {};
      const response = await fetch(`https://api.github.com/advisories/${ghsa}`, {
        headers: {
          Accept: 'application/vnd.github+json',
          ...authorization,
          'User-Agent': 'jrm-recipes-audit-suppression-check',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub Advisory Database returned ${response.status} for ${ghsa}`);
      }
      return response.json();
    }),
  );
}

async function main() {
  const [manifest, policy] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile(POLICY_PATH, 'utf8').then(JSON.parse),
  ]);
  const [auditReport, upstreamAdvisories] = await Promise.all([
    runPnpmAudit(),
    fetchAdvisories(policy.suppressions),
  ]);
  const errors = validateAuditSuppressions({
    manifest,
    policy,
    auditReport,
    upstreamAdvisories,
  });
  if (errors.length > 0) {
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Audit suppression policy is current (${policy.suppressions.length} active).`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
