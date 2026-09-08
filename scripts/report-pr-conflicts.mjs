import { appendFile } from 'node:fs/promises';

export const MANAGED_LABEL = 'needs-rebase';

export function classifyPullRequest({ mergeable, mergeStateStatus }) {
  if (mergeable === 'CONFLICTING' && mergeStateStatus === 'DIRTY') return 'conflicting';
  if (mergeable === 'MERGEABLE' && mergeStateStatus !== 'DIRTY' && mergeStateStatus !== 'UNKNOWN') {
    return 'recovered';
  }
  return 'uncertain';
}

function hasManagedLabel(pullRequest) {
  return pullRequest.labels.nodes.some(({ name }) => name === MANAGED_LABEL);
}

function validateRepository(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be an owner/repository pair');
  }
  const [owner, name] = repository.split('/');
  return { owner, name };
}

const PAGE_QUERY = `
  query OpenPullRequests($owner: String!, $name: String!, $cursor: String) {
    repository(owner: $owner, name: $name) {
      label(name: "needs-rebase") { id }
      pullRequests(states: OPEN, first: 100, after: $cursor, orderBy: {field: CREATED_AT, direction: ASC}) {
        nodes {
          id number isDraft baseRefName mergeable mergeStateStatus
          labels(first: 100) { nodes { name } }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const REREAD_QUERY = `
  query PullRequestState($owner: String!, $name: String!, $number: Int!) {
    repository(owner: $owner, name: $name) {
      pullRequest(number: $number) {
        id number isDraft baseRefName mergeable mergeStateStatus
        labels(first: 100) { nodes { name } }
      }
    }
  }
`;

const ADD_LABEL_MUTATION = `
  mutation AddNeedsRebase($pullRequestId: ID!, $labelId: ID!) {
    addLabelsToLabelable(input: {labelableId: $pullRequestId, labelIds: [$labelId]}) {
      clientMutationId
    }
  }
`;

const REMOVE_LABEL_MUTATION = `
  mutation RemoveNeedsRebase($pullRequestId: ID!, $labelId: ID!) {
    removeLabelsFromLabelable(input: {labelableId: $pullRequestId, labelIds: [$labelId]}) {
      clientMutationId
    }
  }
`;

async function listOpenPullRequests(graphql, variables) {
  const pullRequests = [];
  let cursor = null;
  let labelId;

  do {
    const data = await graphql(PAGE_QUERY, { ...variables, cursor });
    const repository = data?.repository;
    if (!repository) throw new Error('Repository was not returned by GitHub');
    if (!repository.label) {
      throw new Error(`Required label "${MANAGED_LABEL}" does not exist`);
    }
    labelId = repository.label.id;
    pullRequests.push(...repository.pullRequests.nodes);
    cursor = repository.pullRequests.pageInfo.hasNextPage
      ? repository.pullRequests.pageInfo.endCursor
      : null;
    if (repository.pullRequests.pageInfo.hasNextPage && !cursor) {
      throw new Error('GitHub returned another page without an end cursor');
    }
  } while (cursor);

  return { pullRequests, labelId };
}

async function rereadPullRequest(graphql, variables, number) {
  const data = await graphql(REREAD_QUERY, { ...variables, number });
  return data?.repository?.pullRequest ?? null;
}

export async function reconcilePullRequestConflicts({
  graphql,
  repository,
  retryDelay = () => {},
}) {
  const variables = validateRepository(repository);
  const { pullRequests, labelId } = await listOpenPullRequests(graphql, variables);
  const result = {
    scanned: pullRequests.length,
    added: [],
    removed: [],
    conflicts: [],
    warnings: [],
  };

  for (const listed of pullRequests) {
    const listedState = classifyPullRequest(listed);
    const listedHasLabel = hasManagedLabel(listed);
    const needsFreshState =
      listedState === 'uncertain' ||
      (listedState === 'conflicting' && !listedHasLabel) ||
      (listedState === 'recovered' && listedHasLabel);

    let current = listed;
    if (needsFreshState) {
      if (listedState === 'uncertain') await retryDelay();
      current = await rereadPullRequest(graphql, variables, listed.number);
      if (!current) {
        result.warnings.push(`#${listed.number}: closed while being inspected; no label changed.`);
        continue;
      }
    }

    const state = classifyPullRequest(current);
    const hasLabel = hasManagedLabel(current);
    if (state === 'uncertain') {
      result.warnings.push(
        `#${current.number}: mergeability stayed unknown or inconsistent; labels preserved.`,
      );
      continue;
    }

    if (state === 'conflicting') {
      result.conflicts.push(current.number);
      if (!hasLabel) {
        await graphql(ADD_LABEL_MUTATION, { pullRequestId: current.id, labelId });
        result.added.push(current.number);
      }
      continue;
    }

    if (hasLabel) {
      await graphql(REMOVE_LABEL_MUTATION, { pullRequestId: current.id, labelId });
      result.removed.push(current.number);
    }
  }

  return result;
}

export function renderSummary(result) {
  const lines = [
    '## Pull request conflict report',
    '',
    `Scanned ${result.scanned} open pull request(s).`,
    '',
    `- Conflicting: ${result.conflicts.length}`,
    `- Added \`${MANAGED_LABEL}\`: ${result.added.length}`,
    `- Removed \`${MANAGED_LABEL}\`: ${result.removed.length}`,
    `- Warnings: ${result.warnings.length}`,
  ];

  if (result.conflicts.length > 0) {
    lines.push('', `Conflicting pull requests: ${result.conflicts.map((n) => `#${n}`).join(', ')}`);
  }
  if (result.warnings.length > 0) {
    lines.push('', '### Warnings', '', ...result.warnings.map((warning) => `- ${warning}`));
  }
  return `${lines.join('\n')}\n`;
}

export function createGitHubGraphql(token, fetchImpl = fetch) {
  if (!token) throw new Error('GITHUB_TOKEN is required');

  return async (query, variables) => {
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'user-agent': 'jrm-recipes-conflict-reporter',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error(`GitHub GraphQL request failed with HTTP ${response.status}`);

    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(`GitHub GraphQL request failed: ${payload.errors[0].message}`);
    }
    return payload.data;
  };
}

async function main() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is required');

  try {
    const result = await reconcilePullRequestConflicts({
      graphql: createGitHubGraphql(process.env.GITHUB_TOKEN),
      repository: process.env.GITHUB_REPOSITORY,
      retryDelay: () => new Promise((resolve) => setTimeout(resolve, 1_000)),
    });
    await appendFile(summaryPath, renderSummary(result));
  } catch (error) {
    await appendFile(
      summaryPath,
      `## Pull request conflict report\n\n**Reporter failed:** ${String(error.message ?? error)}\n`,
    );
    throw error;
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  await main();
}
