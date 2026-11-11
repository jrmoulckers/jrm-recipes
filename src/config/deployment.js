// @ts-check

/** @param {Record<string, string | undefined>} [vars] */
export function isProductionDeploy(vars = process.env) {
  return vars.APP_ENV === 'production' || vars.VERCEL_ENV === 'production';
}

/** @param {Record<string, string | undefined>} [vars] */
export function productionSafetyIssues(vars = process.env) {
  if (!isProductionDeploy(vars)) return [];
  const issues = [];
  for (const name of [
    'SKIP_ENV_VALIDATION',
    'NEXT_PUBLIC_DEV_AUTH_BYPASS',
    'E2E_IDENTITY_SELECTOR',
  ]) {
    if (vars[name] && (name === 'SKIP_ENV_VALIDATION' || vars[name] !== '0')) {
      issues.push(`${name} is forbidden on a production host.`);
    }
  }
  if (vars.NODE_ENV && vars.NODE_ENV !== 'production') {
    issues.push('NODE_ENV must be production on a production host.');
  }
  return issues;
}

export const publicBuildVariables = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_CLERK_SIGN_IN_URL',
  'NEXT_PUBLIC_CLERK_SIGN_UP_URL',
  'NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME',
  'NEXT_PUBLIC_CLOUDINARY_API_KEY',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_ANALYTICS_REQUIRE_CONSENT',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
];

/** @param {Record<string, string | undefined>} [vars] */
export function buildContract(vars = process.env) {
  const revision = vars.SOURCE_REVISION || vars.VERCEL_GIT_COMMIT_SHA || vars.GITHUB_SHA;
  if (!revision || !/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error('SOURCE_REVISION (or platform commit SHA) must be a full lowercase Git SHA.');
  }
  for (const name of ['VERCEL_GIT_COMMIT_SHA', 'GITHUB_SHA']) {
    if (vars[name] && vars[name] !== revision) {
      throw new Error(`${name} disagrees with SOURCE_REVISION.`);
    }
  }
  let origin;
  try {
    origin = new URL(vars.NEXT_PUBLIC_APP_URL || '');
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be the canonical HTTPS origin.');
  }
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('NEXT_PUBLIC_APP_URL must be the canonical HTTPS origin.');
  }
  if (!vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is required for a release build.');
  }
  const key = vars.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || '';
  if (!/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(key)) {
    throw new Error('NEXT_SERVER_ACTIONS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  if (
    vars.NEXT_PUBLIC_SITE_URL &&
    ![origin.host, origin.origin].includes(vars.NEXT_PUBLIC_SITE_URL)
  ) {
    throw new Error('NEXT_PUBLIC_SITE_URL must match the canonical app host or origin.');
  }
  return {
    revision,
    publicEnvironment: Object.fromEntries(
      publicBuildVariables.map((name) => [name, vars[name] || '']),
    ),
  };
}

/** @param {Record<string, string | undefined>} [vars] */
export function schedulerOwner(vars = process.env) {
  const provider = vars.HOST_PROVIDER || (vars.VERCEL ? 'vercel' : 'local');
  const owner = vars.CRON_OWNER || (provider === 'vercel' ? 'vercel' : 'none');
  return { provider, owner, enabled: owner !== 'none' && owner === provider };
}
