# Supabase migration double-check

Repository follow-up: the October 6 SQL file has since been restored to `supabase/migrations`, with an `IF EXISTS` guard for its optional file ledger. The gaps listed below describe the audit snapshot. No production migration was rerun.

Fresh production snapshot: 2026-10-07T15:58:42.072Z (UTC).
Project: cxgynadprukyeuqbchbs.supabase.co, used by https://sunochatbot.vercel.app.

The second audit independently parsed the current SQL with PostgreSQL syntax, reconstructed the ordered schema definitions in memory, and compared them with fresh live catalog data. No SQL migration was executed. No required production schema difference was found.

| Detailed check | Result |
|---|---|
| Migration inputs | 30 current local migrations plus the recovered October 6 migration; 636 top-level SQL statements parsed |
| Migration hashes | 29 local files match the production SHA-256 ledger |
| October 7 migration | 20261007_001 recorded; history_start_at is present with the expected timestamp type and nullability |
| Column definitions | 419 active table columns compared: types, dimensions, defaults, nullability, and identity generation match |
| Index definitions | 69 explicitly created active indexes compared: columns, ordering, operator classes, uniqueness, and predicates match |
| Constraint definitions | 200 reconstructed constraint requirements match: checks, allowed values, keys, foreign-key targets, and delete/update actions |
| Function signatures | 26 signatures match: input/output names, types, defaults, and return shape |
| Function bodies | Fresh live function definitions match the preceding snapshot; the preceding audit compared all 26 with their latest local bodies |
| Trigger definitions | 19 match: relation, event, timing, row mode, function, and condition |
| Index and constraint integrity | No invalid/not-ready index and no unvalidated constraint |
| RLS | No public base table without RLS |
| Privileged RPC access | No application SECURITY DEFINER function executable by anon or authenticated |
| Private schema access | Neither anon nor authenticated has USAGE on app_private |
| Maintenance | Hourly job active and latest execution succeeded |
| Database health | healthy |

## Remaining repository and bookkeeping gaps

- 202610060001_complete_media_link_and_rpc_permissions.sql is applied in production but absent from supabase/migrations. The recovered source remains in reports/recovered-migrations. Its media linkage, foreign key/index, and RPC permission changes exist in the database.
- 202610070001_chatbot_trial_history_reset.sql has no row in the file hash ledger, but its application version 20261007_001 is recorded and the exact resulting column definition is present. This is a ledger gap, not a missing schema change.
- The standard Supabase CLI history table is absent. The two app_private tracking tables currently hold migration history. This must be accounted for when adopting a CLI migration workflow.

## Comparison details

The reconstruction honors CREATE/ADD IF NOT EXISTS, explicit default/nullability changes, renamed/dropped relations, conditional constraint creation, and later constraint/index replacements. Historical raw interaction-table indexes are excluded because the relation became a compatibility view. All 200 constraint comparisons include semantic normalization of IN/ANY and BETWEEN expressions emitted differently by PostgreSQL.

Operator classes verified as extensions.gin_trgm_ops and extensions.vector_cosine_ops. PostgreSQL formats the 10-minute function lease as 00:10:00; a read-only interval comparison confirmed equality. PostgreSQL discards parenthesized type modifiers from function parameter signatures, so vector(1536) in CREATE FUNCTION correctly appears as vector in the catalog; the actual knowledge column dimension was checked separately. See [PostgreSQL CREATE FUNCTION documentation](https://www.postgresql.org/docs/16/sql-createfunction.html).

A file hash confirms the recorded applied SQL matches the current source; it does not independently prove every past data-only effect. Historical repair scripts without ledger entries cannot be proven to have executed. Their relevant current data invariants were checked in the first audit. No database writes were made in either audit.
