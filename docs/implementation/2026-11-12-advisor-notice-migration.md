# Advisor Notice Additive Migration

This release adds one nullable TEXT column, `acu_advisor_notifications.notice_json`.
It contains optional structured notification copy and Router-validated provenance.
Existing problem/advice, delivery records, identity and reference semantics remain
unchanged. No historical backfill, deletion or conversion is needed.

Production HTTP slots and worker run with auto migration disabled. Apply the
reviewed additive expansion separately, under the shared release lock, before
starting candidate application code. Do not enable auto migration on a live slot.

PostgreSQL migration, in a bounded transaction:

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
ALTER TABLE acu_advisor_notifications ADD COLUMN notice_json TEXT NULL;
COMMIT;
```

Before applying, verify the column is absent (or already exactly nullable TEXT),
capture a table-scoped `pg_dump -Fc` backup including schema/data, validate its
archive listing, and record the notification count. The table is small; no
full database backup or rewrite is required for this additive field. A lock
timeout aborts the transaction and retains old application traffic. Inspect
state before any retry after an uncertain result.

Old application readers ignore the extra column, old inserts omit it and get
NULL, new readers fall back for NULL/empty/invalid content. New application writes
still satisfy the old schema contract. The established Console schema label
`acu_usage_finalize_rc22` describes the existing compatible baseline; this
nullable optional extension does not change that baseline. The separate migration
receipt documents the expansion; no runtime configuration/hash relabeling is
performed. Routine application publishing only occurs after this step completes.

Rollback restores the previous HTTP/worker images with the normal release tool;
retain the extra nullable column and any generated summaries. Do not drop the
column during traffic rollback, restore a full database or erase new audit rows.
Optional destructive column removal requires a separate review after all new
writers are gone. Both old/new GORM models work with the expanded schema.

SQLite uses the same nullable TEXT addition via GORM. MySQL uses `ADD COLUMN
notice_json TEXT NULL`; no default, JSON type or dialect-specific query is used.
Automated compatibility tests must exercise old inserts, new inserts and fallback
reads after expansion. Production migration receipt and actual PostgreSQL result
are recorded in the Router release report.
