import { describe, expect, it } from 'vitest';

import { validateAuditSuppressions } from './check-audit-suppressions.mjs';

const ghsa = 'GHSA-jmr9-qjv8-65gv';
const auditId = 1139346;

function fixture() {
  return {
    manifest: {
      devDependencies: {
        '@lhci/cli': '0.15.1',
      },
      pnpm: {
        auditConfig: {
          ignoreGhsas: [ghsa],
        },
      },
    },
    policy: {
      schemaVersion: 1,
      suppressions: [
        {
          ghsa,
          auditId,
          ecosystem: 'npm',
          package: 'extract-zip',
          severity: 'high',
          residualRisk: 'low',
          confidence: 'high',
          affectedVersions: '<= 2.0.1',
          fixedVersion: null,
          dependencyPath: '@lhci/cli > extract-zip',
          auditPaths: ['.>@lhci/cli>extract-zip'],
          affectedAssets: ['CI workspace'],
          trustBoundaries: ['Downloaded archive enters an ephemeral CI runner'],
          reachability: 'Development-only browser installation path',
          rationale: 'No patched release exists and product users cannot provide the archive',
          invalidationConditions: ['A patched release is published'],
          reviewedAt: '2026-09-04',
          expiresAt: '2026-10-04',
          sources: [`https://github.com/advisories/${ghsa}`],
        },
      ],
    },
    auditReport: {
      actions: [
        {
          action: 'review',
          module: 'extract-zip',
          resolves: [{ id: auditId, path: '.>@lhci/cli>extract-zip' }],
        },
      ],
    },
    upstreamAdvisories: [
      {
        ghsa_id: ghsa,
        severity: 'high',
        vulnerabilities: [
          {
            package: { ecosystem: 'npm', name: 'extract-zip' },
            vulnerable_version_range: '<= 2.0.1',
            first_patched_version: null,
          },
        ],
      },
    ],
    now: new Date('2026-09-05T00:00:00.000Z'),
  };
}

describe('audit suppression policy', () => {
  it('accepts a current, unfixable suppression with a complete rationale', () => {
    expect(validateAuditSuppressions(fixture())).toEqual([]);
  });

  it('rejects an ignore without a matching rationale', () => {
    const input = fixture();
    input.manifest.pnpm.auditConfig.ignoreGhsas.push('GHSA-aaaa-bbbb-cccc');

    expect(validateAuditSuppressions(input)).toContain(
      'GHSA-aaaa-bbbb-cccc is ignored without a rationale in security/audit-suppressions.json',
    );
  });

  it('rejects unsupported suppression paths that bypass GHSA rationales', () => {
    const input = fixture();
    input.manifest.pnpm.auditConfig.ignoreCves = ['CVE-2026-56876'];

    expect(validateAuditSuppressions(input)).toContain(
      'package.json pnpm.auditConfig.ignoreCves is an unsupported suppression path; use ignoreGhsas with a rationale',
    );
  });

  it('surfaces an expired rationale', () => {
    const input = fixture();
    input.now = new Date('2026-10-05T00:00:00.000Z');

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} expired on 2026-10-04; re-review or remove the suppression`,
    );
  });

  it('surfaces a suppression that the audit no longer reports', () => {
    const input = fixture();
    input.auditReport.actions = [];

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} is no longer reported for extract-zip; remove the stale suppression`,
    );
  });

  it('surfaces a newly available fixed version', () => {
    const input = fixture();
    input.upstreamAdvisories[0].vulnerabilities[0].first_patched_version = '2.0.2';

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} now has patched version 2.0.2; remove the suppression`,
    );
  });

  it('surfaces an advisory that expands to another package', () => {
    const input = fixture();
    input.upstreamAdvisories[0].vulnerabilities.push({
      package: { ecosystem: 'npm', name: 'another-package' },
      vulnerable_version_range: '< 1.0.0',
      first_patched_version: null,
    });

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} now covers an additional package or ecosystem; re-review it`,
    );
  });

  it('surfaces a new dependency path outside the reviewed dev-only tree', () => {
    const input = fixture();
    input.auditReport.actions[0].resolves.push({
      id: auditId,
      path: '.>runtime-package>extract-zip',
    });

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} reached an unapproved dependency path .>runtime-package>extract-zip; re-review the suppression`,
    );
  });

  it('surfaces an approved path whose root moves into production dependencies', () => {
    const input = fixture();
    input.manifest.dependencies = { '@lhci/cli': '0.15.1' };

    expect(validateAuditSuppressions(input)).toContain(
      `${ghsa} path .>@lhci/cli>extract-zip is not rooted exclusively in a devDependency`,
    );
  });
});
