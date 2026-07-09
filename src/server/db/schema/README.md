# `src/server/db/schema/` — schema source of truth

Drizzle table definitions. This is the **source of truth** for the database
schema; the SQL in [`../../../../drizzle/`](../../../../drizzle/) is generated
from it.

Workflow: **edit a `*.ts` schema file → `pnpm db:generate` → commit the new
`drizzle/*.sql`** it produces. CI's "Migration drift" job fails if a schema edit
was not regenerated and committed.

Before a **destructive** change (drop/rename/narrow a column, table, or
constraint), read the expand/contract convention, idempotency rules, and the
rollback runbook in [`../../../../docs/migrations.md`](../../../../docs/migrations.md).
