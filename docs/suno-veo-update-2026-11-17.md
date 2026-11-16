# Veo update adapted for Suno, November 17

The source recheck fetched both upstream repositories without changing their working files. Jaucian remains at `fc78db9ea8a5817c01eec47c161141658a605d99`. The paired app advanced from `39ffb879251c432ee010ebd4a5a31bdbcf463575` to `7cf71acf484b56002d2ccf0bfd37dc6ec5d453aa`, adding two commits:

- `5ac3aad`: prevent database timeout cascades and bound quota maintenance.
- `7cf71ac`: complete quota-refresh rounds with resource-pressure checks between batches.

All twenty changed runtime/test/SQL/tool files were adapted without merge conflicts. The upstream database-timeout guide was reviewed separately; this document records Suno's deployment boundaries.

## Resulting behavior

- Calendar, performance and salary reads use existing salary/planning snapshots. Opening a report or changing its filters does not run quota maintenance. Missing snapshots remain retryable errors rather than invented zero totals.
- Concurrent permission lookups for the same identity share only the pending request. Other identities remain separate, and completed results are discarded so the next request checks current permissions.
- SQL timeouts, lock contention, pool exhaustion and transport deadlines stop without immediately repeating expensive work. A transient gateway error can retry once. Writes retain their single-attempt behavior.
- The availability circuit also observes response-body failures after headers arrive. A recovery probe remains exclusive until its body completes; delayed failures from an older generation cannot undo a successful recovery.
- The existing quota worker uses a shared 150-second coordinator lease around a run that starts work for at most 90 seconds. It claims at most four staff leases per batch and checks resource pressure between batches. Each staff calculation is a separate request with a five-second SQL deadline, preserving completed updates if a later request fails. Slow or abandoned work remains retryable through cooldowns and expiring leases.
- Salary reconciliation handles at most ten queued days per invocation. Optional maintenance failures defer heavier planning phases while collection, receipt expiry, intake maintenance and due delivery checks can continue.
- The separately invoked Suno schema-cache repair tool adds a thirty-second idle-transaction setting while preserving query deadlines and unrelated role settings. It retains Suno project/credential guards and explicit preflight/apply modes. It is not invoked by deployment and was not executed against a database during this update.

## Suno compatibility and checks

Suno's head-admin sign-in alias, retained owner identity, Page grants, approved Danny groups, Makata topic routes, on-demand employee profile, song intake/profile thresholds and tenant isolation are preserved. No bot source or bot scheduler changed in this sync. No new schedule, webhook registration, Telegram send, database-role change or live CRM migration was performed.

The two added SQL files are `202611160007_veo_bounded_database_work.sql` and `202611160008_veo_quota_run_budget.sql`. The isolated incremental rehearsal now applies 162 pending files, retains the original 443 table columns and runs its tenant-launch checks in a rolled-back fixture savepoint. Focused verification passed 87 application tests in ten files and 50 SQL tests, plus type checking and lint over all seventeen changed TypeScript files.

The complete hosted regression/build gate remains mandatory. These changes do not choose Suno pay rates or complete its financial adapter. Both deployments stay in setup mode while the live tenant/schema, Page routing and historical-work handover remain incomplete.
