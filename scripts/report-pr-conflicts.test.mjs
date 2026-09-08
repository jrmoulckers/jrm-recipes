import { describe, expect, it, vi } from 'vitest';

import {
  classifyPullRequest,
  createGitHubGraphql,
  reconcilePullRequestConflicts,
  renderSummary,
} from './report-pr-conflicts.mjs';

const pr = (number, over = {}) => ({
  id: `PR_${number}`,
  number,
  isDraft: false,
  baseRefName: 'main',
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  labels: { nodes: [] },
  ...over,
});

const page = (nodes, over = {}) => ({
  repository: {
    label: { id: 'LABEL_needs_rebase' },
    pullRequests: {
      nodes,
      pageInfo: { hasNextPage: false, endCursor: null },
    },
    ...over,
  },
});

describe('pull request conflict classification', () => {
  it('requires both conclusive conflict signals', () => {
    expect(
      classifyPullRequest(pr(1, { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' })),
    ).toBe('conflicting');
    expect(
      classifyPullRequest(pr(1, { mergeable: 'CONFLICTING', mergeStateStatus: 'CLEAN' })),
    ).toBe('uncertain');
    expect(classifyPullRequest(pr(1, { mergeable: 'MERGEABLE', mergeStateStatus: 'DIRTY' }))).toBe(
      'uncertain',
    );
    expect(classifyPullRequest(pr(1, { mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' }))).toBe(
      'uncertain',
    );
    expect(classifyPullRequest(pr(1))).toBe('recovered');
  });
});

describe('conflict reconciliation', () => {
  it('paginates every open PR without filtering drafts or non-main bases', async () => {
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(
        page([pr(1, { isDraft: true }), pr(2, { baseRefName: 'release' })], {
          pullRequests: {
            nodes: [pr(1, { isDraft: true }), pr(2, { baseRefName: 'release' })],
            pageInfo: { hasNextPage: true, endCursor: 'next-page' },
          },
        }),
      )
      .mockResolvedValueOnce(page([pr(3)]));

    const result = await reconcilePullRequestConflicts({
      graphql,
      repository: 'owner/repo',
    });

    expect(result.scanned).toBe(3);
    expect(graphql.mock.calls[0][1]).toEqual({ owner: 'owner', name: 'repo', cursor: null });
    expect(graphql.mock.calls[1][1]).toEqual({
      owner: 'owner',
      name: 'repo',
      cursor: 'next-page',
    });
    expect(graphql.mock.calls[0][0]).toContain('states: OPEN');
    expect(graphql.mock.calls[0][0]).not.toContain('isDraft:');
    expect(graphql.mock.calls[0][0]).not.toContain('baseRefName:');
  });

  it('retries unknown state once and preserves labels when it stays unknown', async () => {
    const uncertain = pr(4, {
      mergeable: 'UNKNOWN',
      mergeStateStatus: 'UNKNOWN',
      labels: { nodes: [{ name: 'needs-rebase' }] },
    });
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page([uncertain]))
      .mockResolvedValueOnce({ repository: { pullRequest: uncertain } });
    const retryDelay = vi.fn();

    const result = await reconcilePullRequestConflicts({
      graphql,
      repository: 'owner/repo',
      retryDelay,
    });

    expect(retryDelay).toHaveBeenCalledOnce();
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('adds only its label after a conclusive fresh conflict read', async () => {
    const conflict = pr(5, { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' });
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page([conflict]))
      .mockResolvedValueOnce({ repository: { pullRequest: conflict } })
      .mockResolvedValueOnce({ addLabelsToLabelable: { clientMutationId: null } });

    const result = await reconcilePullRequestConflicts({ graphql, repository: 'owner/repo' });

    expect(result.added).toEqual([5]);
    expect(graphql).toHaveBeenCalledTimes(3);
    expect(graphql.mock.calls[2][0]).toContain('addLabelsToLabelable');
    expect(graphql.mock.calls[2][1]).toEqual({
      pullRequestId: 'PR_5',
      labelId: 'LABEL_needs_rebase',
    });
  });

  it('removes only its label after conclusive recovery', async () => {
    const labeled = pr(6, { labels: { nodes: [{ name: 'needs-rebase' }, { name: 'blocked' }] } });
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page([labeled]))
      .mockResolvedValueOnce({ repository: { pullRequest: labeled } })
      .mockResolvedValueOnce({ removeLabelsFromLabelable: { clientMutationId: null } });

    const result = await reconcilePullRequestConflicts({ graphql, repository: 'owner/repo' });

    expect(result.removed).toEqual([6]);
    expect(graphql.mock.calls[2][0]).toContain('removeLabelsFromLabelable');
    expect(graphql.mock.calls[2][0]).not.toContain('blocked');
  });

  it('avoids no-op writes for an already labeled conflict and an unlabeled recovery', async () => {
    const conflict = pr(7, {
      mergeable: 'CONFLICTING',
      mergeStateStatus: 'DIRTY',
      labels: { nodes: [{ name: 'needs-rebase' }] },
    });
    const graphql = vi.fn().mockResolvedValueOnce(page([conflict, pr(8)]));

    const result = await reconcilePullRequestConflicts({ graphql, repository: 'owner/repo' });

    expect(graphql).toHaveBeenCalledOnce();
    expect(result.conflicts).toEqual([7]);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });

  it('honors a state race observed by the mandatory pre-mutation reread', async () => {
    const conflict = pr(9, { mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' });
    const graphql = vi
      .fn()
      .mockResolvedValueOnce(page([conflict]))
      .mockResolvedValueOnce({ repository: { pullRequest: pr(9) } });

    const result = await reconcilePullRequestConflicts({ graphql, repository: 'owner/repo' });

    expect(graphql).toHaveBeenCalledTimes(2);
    expect(result.added).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('surfaces invalid input, missing configuration, and API failures', async () => {
    await expect(
      reconcilePullRequestConflicts({ graphql: vi.fn(), repository: 'not-a-repository' }),
    ).rejects.toThrow('owner/repository');
    await expect(
      reconcilePullRequestConflicts({
        graphql: vi.fn().mockResolvedValue(page([], { label: null })),
        repository: 'owner/repo',
      }),
    ).rejects.toThrow('does not exist');

    const graphql = createGitHubGraphql(
      'token',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(graphql('query Test { viewer { login } }', {})).rejects.toThrow('HTTP 503');
  });

  it('renders conflict and uncertainty details only in an Actions summary', () => {
    const summary = renderSummary({
      scanned: 2,
      conflicts: [10],
      added: [10],
      removed: [],
      warnings: ['#11: mergeability stayed unknown or inconsistent; labels preserved.'],
    });
    expect(summary).toContain('Conflicting pull requests: #10');
    expect(summary).toContain('labels preserved');
  });
});
