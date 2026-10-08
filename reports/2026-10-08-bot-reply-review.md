# Bot conversation review — October 8, 2026

Reviewed all 78 contacts with saved chatbot state, including their fully paginated Facebook conversation histories: 4,611 messages. The review retrieved all 78 conversations successfully. Imported contacts without chatbot state were outside this review.

The repetition scan found 252 repeated message occurrences across 37 conversations. This is a candidate count: some repetitions can be legitimate responses to a customer's request. No bot messages were found more than ten seconds after a saved stop or closed pipeline cutoff. The main failures were repeated requirements forms and individual follow-up bubbles, older answers falling outside the short context window, and extra questions in the turn that reached the detail target.

## Changes

- Keep up to 100 history messages in chronological context and preserve extracted answers during correction and fallback requests.
- Check generated replies for questions about saved answers, previously sent forms, and repeated individual bubbles. Attempt one correction; suppress a reply that still fails while retaining its collected answers.
- Apply the same repetition checks to follow-ups and refuse follow-ups when saved answers meet the target.
- Replace the goal-reaching reply with a single closing message without a further question or form.
- Recheck saved stops and qualification after generation. Save collected answers and the stop before delivery, so a delivery failure cannot restart collection.
- Suppress previously sent fallback bubbles after provider errors.

## Live configuration repair

Enabled `stop_when_details_collected` on all 12 configured pages, preserving their 26% detail thresholds and enabled/disabled settings. With 20 configured fields, the threshold requires six collected fields. Stopped one existing completed contact whose chatbot state was still active. Private conversation exports and the pre-change database backup remain in ignored local JSON files and are not committed.

## Validation

All 451 tests across 72 test files passed, including regression coverage for saved answers across the 20 configured fields, repeated forms and follow-up bubbles, the goal-reaching turn, provider retry failures, delivery failures, and qualification or stops during generation. The production build passed; existing dashboard lint warnings remain.

This audit and validation did not send test messages to customers.
