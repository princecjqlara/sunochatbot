# Suno tenant isolation

The copied workspace model gives each owner a tenant and binds staff accounts, teams, Pages, orders, payments, reports and archives to that workspace. Each login has one workspace membership. Owner, Team Leader, Manager and Member roles use the current database permissions and supervisor branch; a previous session does not preserve revoked Page access. Page authorization/reconnection and the CRM-to-bot bridge also validate workspace ownership.

This installation uses the retained Suno CRM and its configured owner/Pages. Its Telegram archive is a separate Suno project. Additional workspaces require their own verified Page and bot destinations. Tenant creation is a server-only operation; public tenant signup and account switching are not implemented.

## Corrected launch behavior

The inherited launch routine performed database-wide permission deletion, Page unbinding, campaign cancellation, profile-job deletion and historical archiving. Those operations were unsafe when another tenant or retained legacy work existed in the same database.

`202611150104_suno_tenant_launch.sql` replaces that routine while retaining its existing RPC name. It now:

- Requires an active existing owner and a nonempty, distinct list of Pages already granted to that owner.
- Rejects Pages bound to another tenant, including a foreign Page accidentally named in a legacy grant.
- Locks the selected Pages and checks membership before creating or reusing the owner's tenant.
- Binds only the selected Pages and archives only records belonging to them. Contact-linked finance records resolve through the contact's Page. An unrecognized archive relation causes the entire launch statement to roll back.
- Retains existing user/Page permissions, scheduled campaigns, profile jobs, contacts and other tenants' ownership and history.
- Keeps the original launch cutoff on retries and directs later Page additions through the Owner Page connection flow.
- Grants launch execution only to the server's service role.

The SQL regression launches two independent tenants and checks isolation, retained work, foreign-grant rejection, invalid inputs, retry behavior, prepared tenant reuse, transaction rollback and SQL role access. Existing regressions cover hierarchy/branch isolation, Page connections, employee-profile privacy, request-scoped permission checks and bot tenant checks.

## Deployment and activation

The migration is included in the checksum-based incremental review and isolated rehearsal. Publishing application source does not install it in the live CRM. No real tenant was created or launched during these tests. The web and bot remain in setup mode.

Live activation still requires a restorable CRM backup, the compatible incremental upgrade, account recovery, approved Page/group/topic routes, verified Meta runtime ownership, Suno financial policy and retained-work reconciliation. The bot's configured tenant must match the CRM tenant before handoff or scheduling is enabled.
