export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', sha: process.env.HEIRLOOM_BUILD_REVISION ?? 'dev' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
