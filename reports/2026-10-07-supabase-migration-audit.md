# Supabase migration audit

Repository follow-up: the recovered October 6 SQL is now restored in `supabase/migrations/202610060001_complete_media_link_and_rpc_permissions.sql`. The optional file-ledger alteration is guarded for clean installations. The findings below describe the database and repository at audit time; production SQL was not rerun.

Checked: 2026-10-07T15:47:54.694Z (UTC).
Deployment: https://sunochatbot.vercel.app
Production database: cxgynadprukyeuqbchbs.supabase.co. The local app configuration points to the same project.

## Result

No missing required production migration was found. All 30 SQL files currently in supabase/migrations have application evidence: 29 match the recorded file SHA-256 (allowing Windows/Linux newline differences); the October 7 migration is recorded as 20261007_001 and its history_start_at column is present in PostgreSQL and the live REST schema.

Production includes an additional October 6 repair, 202610060001_complete_media_link_and_rpc_permissions.sql, that is missing from the local migration folder. Its SQL was recovered into reports/recovered-migrations for review. The repair adds the media reverse-link foreign key/index and restricts privileged RPC execution. Its effects were verified in production. The recovered file has not been applied or inserted into the migration directory.

## Verification

| Check | Result |
|---|---|
| Local SQL files reviewed | 70, including current migrations, baseline, and legacy database scripts |
| Application migration records | 40 |
| Missing required tables or columns | None |
| Missing active indexes, named constraints, triggers, functions, or required extensions | None |
| Index integrity | 126 indexes valid and ready |
| Constraint validation | 200 constraints validated |
| Functions | 26 present; normalized bodies match their latest local source |
| Triggers | 19 present and enabled |
| Public table RLS | Enabled on all 29 public tables |
| Row access policies | No public/app_private policies, matching the server service-role access design in the SQL files |
| Privileged function access | No application SECURITY DEFINER function grants EXECUTE to anon or authenticated |
| Internal table access | Anonymous requests to page_activity_history and page_sync_leases rejected with HTTP 401 |
| Supabase REST schema cache | All public relations/columns and all 14 RPCs referenced by the app exposed to the service role |
| Latest schema API checks | history_start_at and media_asset_id selectable with HTTP 200 |
| Storage | chatbot-media, conversation-exports, and photo-headers buckets present and private |
| Scheduled database maintenance | Hourly job active; last three executions succeeded |
| Database health | healthy, approximately 20.5 MiB |
| Default/outcome tags | All three Pages have a default tag and the four required outcome tags; no duplicate defaults |
| Contact-name repair | No blank or disallowed placeholder contact names |
| Follow-up cadence | Current four-send default present; no old stock five-send configurations |
| Nullable user emails | Verified |

The contact_interactions relation is intentionally a compatibility view over compact hourly statistics. Its old table indexes and table-level RLS do not apply to this view. campaign_recipients_compact_pkey_idx is represented by the final campaign_recipients_pkey. The manual-draft follow-up index was removed by a later migration. These are superseded objects, not missing migrations.

## Current migration files

| File | Application evidence |
|---|---|
| 001_initial_schema.sql | Recorded SHA-256 matches |
| 202609210001_chatbot_and_outbound_events.sql | Recorded SHA-256 matches |
| 202609210002_welcome_message_rls.sql | Recorded SHA-256 matches |
| 202609210003_chatbot_knowledge_rag.sql | Recorded SHA-256 matches |
| 202609210004_chatbot_sales_flow.sql | Recorded SHA-256 matches |
| 202609210005_chatbot_media_rag.sql | Recorded SHA-256 matches |
| 202609210006_chatbot_natural_bubbles.sql | Recorded SHA-256 matches |
| 202609210007_chatbot_rules_and_detail_target.sql | Recorded SHA-256 matches |
| 202609210008_chatbot_follow_up_scheduler.sql | Recorded SHA-256 matches |
| 202609210009_chatbot_human_agent_drafts.sql | Recorded SHA-256 matches |
| 202609210010_chatbot_ai_follow_up_content.sql | Recorded SHA-256 matches |
| 202609220001_chatbot_direct_human_agent_follow_ups.sql | Recorded SHA-256 matches |
| 202609220002_contact_pipeline.sql | Recorded SHA-256 matches |
| 202609220003_chatbot_analytics.sql | Recorded SHA-256 matches |
| 202609220004_contact_pipeline_summary.sql | Recorded SHA-256 matches |
| 202609230001_chatbot_drive_folders.sql | Recorded SHA-256 matches |
| 202609240001_chatbot_drive_files.sql | Recorded SHA-256 matches |
| 202609240002_disable_drive_folder_fallback.sql | Recorded SHA-256 matches |
| 202609240003_chatbot_media_source_paths.sql | Recorded SHA-256 matches |
| 202609240004_chatbot_drive_file_paths.sql | Recorded SHA-256 matches |
| 202609250001_chatbot_live_trial.sql | Recorded SHA-256 matches |
| 202609250002_repair_default_page_tags.sql | Recorded SHA-256 matches |
| 202609250003_messenger_outcome_tags.sql | Recorded SHA-256 matches |
| 202609250004_terminal_chatbot_stop_rules.sql | Recorded SHA-256 matches |
| 202609250005_shared_chatbot_knowledge.sql | Recorded SHA-256 matches |
| 202609280001_chatbot_interruption_log.sql | Recorded SHA-256 matches |
| 202609290001_lead_stage_interruption_log.sql | Recorded SHA-256 matches |
| 202610040001_reduce_default_quick_followups.sql | Recorded SHA-256 matches |
| 202610050001_protect_internal_page_tables.sql | Recorded SHA-256 matches |
| 202610070001_chatbot_trial_history_reset.sql | 20261007_001 recorded; column and REST schema verified |

## Legacy SQL notes

The baseline consolidates earlier operational scripts. An old standalone file need not have its own migration-file ledger row when its resulting schema is already supplied by the baseline or later migrations. All active objects introduced by the legacy SQL were checked against the catalogs.

- database/migration_compact_campaign_delivery_finalize.sql: Final schema already exists in the baseline: composite campaign_id/contact_id primary key; no redundant id column. Historical version 20260808_007 is absent, but rerunning this old conversion is unnecessary.
- database/migration_compact_contact_interactions_finalize.sql: Applied via baseline (20260808_005); raw archive removed and compatibility view retained.
- database/migration_repair_stopped_follow_up_states.sql: Data-only historical repair. No workflow states currently exist, so there are no eligible rows to repair.

## Migration tracking

This database uses app_private.schema_migrations and app_private.sunobot_migration_files. The standard supabase_migrations.schema_migrations table is absent. A future Supabase CLI migration workflow must reconcile that tracking before using db push; its history is not currently the source of truth.

## Scope and limitations

The audit used production Vercel configuration, PostgreSQL catalog queries inside READ ONLY transactions, read-only aggregate data checks, and authenticated REST metadata/empty-result requests. No migrations, data updates, or grants were applied. Historical data-only scripts without ledger entries cannot be proven to have executed, although their relevant current invariants were checked where applicable. This is a migration/schema audit; it does not test every application feature end to end.
