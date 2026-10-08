# Shorter, natural chatbot replies

The previous live configuration allowed 400 characters split into up to five tiny bubbles and added a creative question after the requirements form. Recent conversations showed the resulting clusters of messages and repeated sales nudges. Reviewed the eight most recently active chatbot conversations to check this behavior.

The new `SHORT_HUMAN_REPLIES` profile sends one message per reply. Ordinary replies aim for 60–140 characters and cannot exceed 180 characters. Only a genuine fill-up form may use up to 700 characters; its missing fields remain together in one readable message, without an extra question. Pricing menus do not qualify for the form allowance.

The bot mirrors the customer's language and tone, answers the current question, keeps saved answers and chosen scope, and asks a question only when needed. A simple thanks receives a brief acknowledgment. Pricing-only questions do not gain a separate request for customer details. Stops at the 26% collection goal still apply. Older generated replies are suppressed when a newer customer message arrives.

Follow-ups use one message under 120 characters. The configuration rollout reduces the unanswered sequence to three reminders at one hour, eight hours and 23 hours after the latest customer message. Existing excess or overdue reminders are cancelled; remaining future reminders are rescheduled without catch-up sends. Backups remain in ignored local JSON files.

Validation: 461 tests passed across 72 test files; the final chatbot regression file and TypeScript check passed after the form detection adjustment. The production build passed before the final guard refinements, which are checked again by deployment. Existing dashboard lint warnings remain.

Five synthetic conversations were previewed with the actual configured model and pinned knowledge, without sending messages to customers. The final preview returned an 82-character price answer, a 17-character thanks acknowledgment, a complete 184-character form, and retained new language/vocal answers while omitting known form fields. Model wording can vary; bubble and length limits are enforced in code.
