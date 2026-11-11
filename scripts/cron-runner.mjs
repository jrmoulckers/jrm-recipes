import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { crons } = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
export async function runSchedule(path, env, request = fetch) {
  if (!crons.some((cron) => cron.path === path)) throw new Error('Unknown business schedule.');
  if (env.CRON_OWNER !== 'azure' || !env.CRON_SECRET) {
    throw new Error('Azure scheduler is not explicitly enabled/configured.');
  }
  const origin = new URL(env.CRON_TARGET_ORIGIN || '');
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('CRON_TARGET_ORIGIN must be the prepared target HTTPS origin.');
  }
  const expected = env.SOURCE_REVISION;
  if (!expected || !/^[a-f0-9]{40}$/.test(expected))
    throw new Error('SOURCE_REVISION is required.');
  const live = await request(new URL('/api/health/live', origin), {
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!live.ok || (await live.json()).sha !== expected) {
    throw new Error('Cron target revision is not the prepared release.');
  }
  const response = await request(new URL(path, origin), {
    redirect: 'error',
    headers: {
      authorization: `Bearer ${env.CRON_SECRET}`,
      'x-heirloom-scheduler': 'azure',
    },
    signal: AbortSignal.timeout(540_000),
  });
  if (!response.ok) throw new Error(`Cron request failed (HTTP ${response.status}).`);
  console.log(`Completed ${path}: HTTP ${response.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runSchedule(process.argv[2], process.env);
}
