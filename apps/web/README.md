# Introduction

Contains the web UI for managing the FrontLit backend.

## Authorization

Authentication is entirely API-based: this app has zero `better-auth` client
dependency. `/login` hosts a passwordless email-OTP form that calls the
API's Better Auth REST endpoints through a same-origin `/api/auth/*` proxy
(`app/api/auth/[...path]/route.ts`), so the session cookie lands on this
app's own origin. All typed API calls (teams, pages, themes) go through a
same-origin `/api/proxy/*` BFF (`lib/api.ts`, built on the shared
`@frontlit/api-contract` ts-rest client) — the browser never talks to the
API app's origin directly.

## Current status

- `/` — the authenticated workspace overview.
- `/builder` — an authenticated, standalone in-memory demo of the WYSIWYG
  `PageBuilder` from the same package (see `app/builder/page.tsx`).
- `/login` — passwordless email-OTP sign-in.
- `/teams` — team switcher and team/API-key management.
- `/website/*`, `/blog`, `/docs`, `/support`, and the other top-level sections —
  authenticated management routes backed by the API.
- `/editor/pages/[pageId]` — loads a page's layout/theme from the API into
  `PageBuilder` and persists edits back through it.
