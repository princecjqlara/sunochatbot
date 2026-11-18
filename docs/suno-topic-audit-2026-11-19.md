# Suno topic routing audit

Live Telegram checks on November 18, 2026 at 16:15 UTC (November 19 PHT) confirmed that Danny is an administrator with topic-management rights in both approved forum groups. Telegram accepted each of the ten configured non-General topic IDs while retaining its existing name and icon. No messages were sent, topics created, existing topics renamed or history deleted.

| Route | Trabawho? | Suno makata |
| --- | --- | --- |
| General | 1 | 1 |
| Announcements and scheduled reports | 16 | 4 |
| Active tomorrow | 7581 | 132 |
| Clients and assignment controls | 7673 | 13 |
| Receipts, Closed Deals and Done Deals | 4 | 8 |
| Songs | 7692 | 133 |

The existing shared receipt destinations are intentional. Closed and Done milestones retain separate records and deduplication; they share a Telegram topic. No duplicate topic was needed.

The audit found three software gaps. The bot directory and web refresh omitted Songs and Receipts. The topic report endpoint required the upstream Veo DAILY REPORTS recipient, which Suno does not use. Song-work confirmations also fell back to General when no team override existed. The release includes all eight operational roles, displays the existing destinations as links in each group card and provides an authenticated, read-only inventory for the approved Suno groups. Shared destinations appear once with all their roles. Song confirmations now use each group's existing Songs topic, while preserving explicit team overrides.

The inventory distinguishes operational role labels from observed Telegram topic names. Names are returned only when supported by archived creation/edit events. Telegram's Bot API does not provide a complete forum-topic listing, and Browser/Computer Use was unavailable. This audit therefore verifies configured destinations, not the titles or existence of unrelated topics. General was identified by the existing forum profile; the ten non-General destinations were checked individually. The report endpoint never calls Telegram or changes topic state.

Regression coverage includes both Suno groups, all operational roles, shared receipt destinations, invalid IDs, scope isolation, current archived-name precedence, anonymous access and archive outages. The existing Messenger chatbot and its UI are unchanged.
