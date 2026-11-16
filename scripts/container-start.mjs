import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildContract, productionSafetyIssues } from '../src/config/deployment.js';

if (
  process.env.APP_ENV !== 'production' ||
  !['azure', 'node'].includes(process.env.HOST_PROVIDER || '')
) {
  throw new Error('Container requires APP_ENV=production and HOST_PROVIDER=azure or node.');
}
const issues = productionSafetyIssues();
if (issues.length) throw new Error(issues.join(' '));
const built = JSON.parse(readFileSync(new URL('../.hosting-build.json', import.meta.url), 'utf8'));
const running = buildContract(process.env);
if (JSON.stringify(running) !== JSON.stringify(built.contract)) {
  throw new Error(
    'Runtime public configuration/revision differs from the built artifact. Rebuild.',
  );
}
const keyHash = createHash('sha256')
  .update(process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY || '')
  .digest('hex');
if (keyHash !== built.actionKeyHash) {
  throw new Error('Server Actions key differs from the build-time key.');
}
if (!process.env.CLERK_SECRET_KEY || !process.env.DATABASE_URL) {
  throw new Error('Container requires CLERK_SECRET_KEY and DATABASE_URL.');
}
if (!/^postgres(ql)?:/.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must use a Postgres protocol.');
}
if (!['none', 'azure'].includes(process.env.CRON_OWNER || '')) {
  throw new Error('Container requires explicit CRON_OWNER=none or azure.');
}
if (process.env.CRON_OWNER === 'azure' && !process.env.CRON_SECRET) {
  throw new Error('Active scheduler requires CRON_SECRET.');
}
if (process.env.CRON_OWNER === 'azure' && process.env.HOST_PROVIDER !== 'azure') {
  throw new Error('Azure scheduler ownership requires HOST_PROVIDER=azure.');
}
await import('../server.js');
