# `drizzle/` — generated migrations

These SQL files are **generated** from the Drizzle schema in
[`../src/server/db/schema/`](../src/server/db/schema/) via `pnpm db:generate`.
Never hand-edit an already-committed migration — add a new one.

Workflow: **edit schema → `pnpm db:generate` → commit the new `drizzle/*.sql`**.
CI enforces that these stay in sync (the "Migration drift" job fails if a schema
edit wasn't regenerated + committed).

## Before adding a destructive migration

Dropping, renaming, or narrowing a column/table/constraint can break production
mid-deploy (old instances keep serving during rollout). Follow the
**expand/contract** convention and the **destructive-change checklist** in
[`../docs/migrations.md`](../docs/migrations.md), and keep every statement
idempotent (`IF EXISTS` / `IF NOT EXISTS`, `DO $$ … EXCEPTION …`).
