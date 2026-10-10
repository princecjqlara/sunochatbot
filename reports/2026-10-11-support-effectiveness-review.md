# Chat support and requirements collection review

Reviewed October 11, 2026, around 03:20–03:26 Philippine time. The chatbot is responding and collecting useful requirements, but live conversations show weaknesses in support, completion, price answers and follow-through. This commit records the audit; it does not implement the recommended behavior changes or change live settings.

## Scope and verification

- Read live configurations for all 12 Pages, 217 saved chatbot states, and seven-day reply, follow-up and inbound aggregates.
- Retrieved 83 Messenger conversations with 976 messages, without retrieval errors or truncated histories. The sample covers sessions started October 10–11 and older sessions with recent suppressed replies.
- Matched conversation message IDs against 542 recorded chatbot outbound events and 438 reply events. Of 599 readable Page messages, 469 could be attributed to the bot. Unmatched messages were not treated as bot output.
- Read the current owner-selected knowledge document and reproduced the pause classifier from local source.
- All 154 existing tests in `chatbot.test.ts`, `chatbot-control.test.ts` and `chatbot-follow-ups.test.ts` passed. Passing controlled tests does not establish conversational effectiveness or confirm production runs the same code as the local checkout.
- Production access was read-only. No customer messages or live setting changes were made during the audit. Customer names, raw transcripts, tokens and private evidence exports are excluded from this report and commit.

## Collection results

These are Hiraya Studio session cohorts grouped by start date, using saved state at audit time. They are not counts of newly acquired customers, fields collected during the calendar day, or paid-order conversions.

| Session start date | October 9 | October 10 |
| --- | ---: | ---: |
| Sessions | 55 | 78 |
| Requirements saved beyond profile name | 12 (22%) | 31 (40%) |
| Only profile name saved | 43 | 47 |
| Stopped as details collected | 10 | 16 |
| All six main business-form fields saved | 0 | 2 |

The six main fields are business name, products/services, tagline, lyrics language, vocals and genre/style. Explicit absence or delegation can be valid answers. Personal songs require an adapted brief, so missing business fields do not necessarily indicate failure.

Nine October 10 sessions received a visible numbered form after session start; six sent readable text afterward. That establishes engagement, not form completion. No session had all seven fields saved, but Additional requests is optional. Initial text can precede state initialization and the export cutoff; attachments and stickers are not readable text. The sample cannot establish a precise abandonment or paid-conversion rate.

## Findings and proposed changes

1. **Completion is based on any six details.** All configurations use a 26% target over 20 labels with automatic stopping enabled. The Messenger profile name counts, so five other fields can close collection before essential requirements are available. Fourteen of October 10's 16 detail-complete sessions lacked at least one main business-form field, including personal-song requests requiring different fields. Ten stopped contacts subsequently sent 25 readable messages, including corrections, added requests, support questions and acknowledgments. Reviewed later requirements were absent from saved fields. Validate essential fields for the actual request type and distinguish collection completion from inbound support/correction eligibility. Making all 20 fields mandatory would require irrelevant information.

2. **Support invents status and drifts into sales.** Attributed replies claimed order records had been found and promised song retrieval without an order lookup or retrieval action in the bot path. Customers seeking existing work received new song ideas. A complaint about an existing video request repeatedly became a new-song questionnaire. Persist support mode, suppress sales reminders during unresolved support, collect an essential reference and route the actual issue to staff. Status claims need a real source or an honest acknowledgment that status is unverified.

3. **Identity and media handling undermine trust.** A confirmed chatbot reply denied being AI and claimed human production capabilities. A customer repeatedly indicated a reference had already been supplied, while the bot kept requesting it and promising listening or YouTube searching. The customer later said they would use another provider; this does not prove a sole cause for the lost sale. Allow truthful identity answers to direct questions. Acknowledge received unsupported media and route it for real review. The local webhook handles text/images, and conversation reads omit attachment fields, leaving audio/video reference handling incomplete.

4. **Some price questions receive no immediate price.** Six of 20 sampled short price-only inquiries followed by an attributed reply received a business question or acknowledgment instead of a price. This narrow sample is not an overall answer rate. One conversation also changed the quoted song count while retaining a total, confusing the customer. Earlier accepted prices are protected, and the export cannot establish all prior acceptance. Recognize short forms such as Hm/Mgkno, answer price first and retain count, accepted total and offer provenance as structured state.

5. **Deferrals do not reliably pause reminders.** The local classifier returns false for “isipin ko muna,” “Balikan kita,” and a real request to defer because of a barangay problem. Attributed reminders followed that request. “Balikan ko kayo” and “not now” return true. Broaden Filipino deferral recognition and persist pauses through reactions and acknowledgments until substantive renewed interest.

6. **Repeated meaning survives text repetition checks.** Attributed reminders translated or lightly reworded the same hook and re-asked the same unknown field. Rapid fragmented messages caused many similar replies. Track the unanswered field and proposed idea across turns and group arriving message fragments before generating another response.

7. **Prompt sources contradict current settings.** Main instructions now request one short message, a single full form and four first-day reminders. Do/don't settings and pinned knowledge retain older bubble, question and reminder rules. Synchronize all policy sources and distinguish sales, support, optional fields and personal-song briefs.

Relevant local implementation: `src/lib/chatbot-control.ts` (target and pause classification), `src/app/api/facebook/webhook/route.ts` (durable stops and generation eligibility), `src/lib/chatbot.ts` (reply rules and quality checks), `src/lib/chatbot-follow-ups.ts` (follow-up eligibility) and `src/lib/facebook.ts` (conversation fields).

## Technical health

- October 10 Hiraya reply events: 292 sent and eight intentionally suppressed as repetitive. The suppressed events say collected answers were retained; they are not ordinary delivery failures.
- Follow-up records updated October 10 include six recipient-unavailable failures, three invalid JSON failures and five unavailable-conversation-history failures. Update-date grouping is not a delivery rate.
- No pending/processing reminder was more than ten minutes overdue at the snapshot.
- The AI provider returned approximately USD9.87 remaining credit at 03:26 Philippine time. Historical October 8 credit failures do not establish a current outage.
- Local error logs were last updated October 7 and cannot establish current production health.

Prioritize request-specific completion and support routing, then truthful status/identity/media handling, price-first answers, durable pauses and semantic repetition. Measure field completion, form engagement, support resolution and paid orders separately. Increasing reminder volume alone does not resolve these findings.
