# Danny group and topic audit

Read-only live checks on November 16, 2026 at 15:28 UTC identified `@dannysunobot` (Telegram ID `9210209211`) as an administrator with topic-management permission in both **Trabawho?** (`-1002894511895`) and **Suno makata** (`-1004498344479`).

The hosted Danny service is in setup mode with automation paused, no approved groups, no archived messages, no scheduled actions and no saved topic events. Telegram reports no registered webhook and twelve pending incoming updates. These are not twelve pending outgoing deliveries. No update was consumed, message sent, topic created, group approved or scheduler configured during this audit.

## Topic routes

| Group | General | Announcements | Active | Contacts | Receipts / Done / Closed | Songs |
| --- | --- | --- | --- | --- | --- | --- |
| Trabawho? | 1 | 16 | 7581 | 7673 | 4 | 7692 |
| Suno makata | 1 | 4 | 132 | 13 | 8 | 133 |

Danny's Makata profile was missing the Active and Songs mappings. The original Jaucian archive has persisted `makata-topic-config:active` and `makata-topic-config:songs` markers for topics **132** and **133**, saved on October 21, 2026 at 13:22 UTC. Named topic-event records identify them as **ACTIVE TOMORROW** and **SONGS**. This change restores those existing IDs without creating new topics or authorizing delivery. The regression exercises poll delivery and registration using mocked Telegram calls for both Suno teams; the missing Active key previously made Makata fail before a poll could be delivered.

The old live-bot archive also contains a Makata Active reminder in topic 132: [message 678](https://t.me/c/4498344479/678), November 5, 2026 at 03:00:44 UTC. Its author was **Jaucian**, not Danny. The latest stored Trabawho post is likewise from Jaucian: [message 13227](https://t.me/c/2894511895/13227), November 5, 2026 at 04:00:39 UTC. These archived posts do not establish current Danny deliveries.

## Coverage and remaining setup

The original archive has no stored messages after those November 5 timestamps in these groups. Danny's dedicated archive is empty. Current topic existence, names and open/closed state could not be inspected in Telegram Desktop because the computer-use runtime failed to start with `failed to write kernel assets: The system cannot find the path specified. (os error 3)`. The saved IDs are historical routing evidence; a complete current topic inventory remains unverified.

Both group profiles still have no CRM Page mapping. Approved group/topic routes, compatible CRM and tenant setup, Suno financial and historical handover, and the single scheduler/webhook cutover remain prerequisites to operational activation. Restoring topic IDs does not change setup mode or bypass these requirements.
