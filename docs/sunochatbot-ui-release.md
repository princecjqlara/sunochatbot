# Sunochatbot login and workspace UI

This release targets the existing `sunochatbot` Vercel project and
`sunochatbot.vercel.app`. The baseline commit `258e810` captures 317 source,
configuration and database files verified against the prior live deployment
`dpl_AkzRfT39GBmfPNQasViVVkDhMoVZ`.

The sign-in page and dashboard shell use the Veo layout, slate/indigo palette,
grouped searchable navigation, responsive menu and shared form/table styles.
All 14 existing dashboard screens remain linked to their original implementations.
The Facebook sign-in option and permission scopes are retained.

Email/password sign-in verifies the retained active user's existing password
hash. Optional server-side email aliases are documented in `.env.example`.
Sign-in does not create users, reset passwords, or modify Page grants. Passwords
are not stored in source or deployment settings.

Chatbot handlers, all API routes, existing dashboard page implementations,
database scripts, dependencies and Vercel function settings are unchanged from
the verified live baseline. No data migration or sample-data substitution is
part of this release.

Validation before publication:

- 875 tests passed in 86 test files, including 17 new sign-in/navigation checks.
- TypeScript checking passed.
- A normal NextAuth credentials sign-in resolved to the retained account.
- Authenticated read requests returned 12 connected Pages and a real contact
  from the first Page (1,880 contacts reported for that Page).
- Browser visual verification was unavailable because no in-app browser was
  connected; HTML, source, authentication and API checks were used instead.

The Vercel build runs `npm test && npm run build` before production activation.
