# ADR-0019: Accounts and Access Control on Supabase Auth

* **Status:** Accepted
* **Date:** 2026-09-27
* **Supersedes:** [ADR-0011](0011-api-key-authentication.md)
* **Related:** [ALE-189](https://linear.app/alex-projects/issue/ALE-189/spike-discover-accountsloginauth-architecture-sessions-vs-jwt-identity) (spike), [findings 0009](../findings/0009-accounts-login-auth-architecture-findings.md), [ALE-213](https://linear.app/alex-projects/issue/ALE-213/spike-run-the-seven-supabase-auth-checks-on-the-dev-project-bet-006) (the seven checks, go), [ALE-200](https://linear.app/alex-projects/issue/ALE-200) (vision: invite and revoke per person), [ALE-212](https://linear.app/alex-projects/issue/ALE-212/adr-0019-accounts-and-access-control-on-supabase-auth-supersedes-adr) (this ADR), [ALE-214](https://linear.app/alex-projects/issue/ALE-214) (backend access dependency and admin endpoints), [ALE-215](https://linear.app/alex-projects/issue/ALE-215) (production project and off-site dump), [ALE-216](https://linear.app/alex-projects/issue/ALE-216) (frontend login and `/admin`), [ALE-218](https://linear.app/alex-projects/issue/ALE-218/security-headers-csp-for-apptookrattcom-report-only-first-enforce-if) (CSP on `app.tookratt.com`, report-only), [ALE-249](https://linear.app/alex-projects/issue/ALE-249/enforce-csp-on-apptookrattcom-after-a-clean-report-only-day-ale-218) (enforce that CSP), [ADR-0008](0008-multi-turn-conversation-memory.md) (chat `SessionState`), [ADR-0013](0013-deployment-strategy.md) (Render API), [ADR-0016](0016-marketing-site-topology-and-capture.md) (`app.tookratt.com`), [PRODUCT_VISION](../PRODUCT_VISION.md)

## Context

ADR-0011 protected `/chat` and `/jobs/*` with a shared set of static bearer keys. That was the right scope for a handful of named people and no per-person identity. PRODUCT_VISION, after ALE-200, now requires inviting and revoking access per person. That is the revisit trigger ADR-0011 named, and it is a different access model, not a patch to the comma-separated key list.

ALE-189 recorded the replacement in findings 0009: Supabase free Postgres, Supabase Auth for invite-only email and password, and FastAPI verifying access tokens locally. This ADR records those decisions. It does not implement them. ALE-214, ALE-215, and ALE-216 implement them.

ALE-213 ran the seven preconditions on the permanent dev project (`uuaoiyzztkxzrzvfddil`, `https://uuaoiyzztkxzrzvfddil.supabase.co`) on 2026-09-27. Checks 1–5 passed. The result is **go**. The checks are closed observations, not open architecture. Where a check was tighter than the findings wording, this ADR uses the tighter statement.

## Decision 1: Auth mechanism — Supabase access token, checked locally

**Decision:** The browser holds a Supabase session (access token plus rotating refresh tokens) and sends the access token as `Authorization: Bearer`. FastAPI verifies the signature, `iss`, `aud`, and `exp` locally against the project's JWKS. There is no session table of our own. Chat `SessionState` stays a separate in-memory conversation and is only tagged with `sub`.

**Rationale:**

- Supabase Auth is the session store. Verifying a short-lived token locally is the check that does not add a network call. A second session table beside `auth.sessions` would duplicate it.
- The chat UI (`app.tookratt.com`, Cloudflare Pages) and the API (Render) are different sites. CORS already allows `Authorization` and sets `allow_credentials=False`. A bearer token uses that shape. A cookie would need `SameSite=None; Secure`, `allow_credentials=True`, and a CSRF defense, and it would still be a third-party cookie. If the app and the API ever share an origin, revisit cookies then. Do not add a reverse proxy solely to make cookies first-party.
- ADR-0008 minted `session_id` because the API key could not identify a person. Tag the in-memory session with `sub` for logs. Do not key the chat store by user id, and do not write turns to Postgres. Auth has to survive a restart. Chat memory is specified not to.

**What FastAPI checks:**

- Algorithm ES256. Public keys come from `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`. The legacy HS256 shared secret is not the production path.
- Supabase sends `Cache-Control: public, max-age=600` on that key list (ALE-213). Cache the keys for at most 10 minutes.
- Claims: `iss`, `aud` (`authenticated`), `exp`, and `app_metadata.role` (Decision 3). The access-token lifetime observed on dev is 3600 seconds. That clock is separate from the invite and recovery link lifetime (Decision 2).

## Decision 2: Identity — invite-only email and password, no SMTP in v1

**Decision:** Supabase Auth. Public sign-up stays off. An admin invites by copying a `generate_link` (`type: invite`) URL and sending it by hand. The invitee sets a password on a page that receives the link's session and calls `updateUser({ password })`. Password reset uses the same page with `generate_link` (`type: recovery`). Magic link, as a login method, and GitHub or LinkedIn login wait. v1 does not call `invite_user_by_email` and does not add SMTP.

**Rationale:**

- This is the method PRODUCT_VISION already states. Supabase hashes passwords, rotates refresh tokens, and rate-limits login. FastAPI does not implement those.
- `invite_user_by_email` sends mail. The built-in mailer only reaches project team addresses, at 2 per hour. The capture Worker only delivers to `hello@tookratt.com`. Hand-sending the link is the v1 path, and it avoids mailbox link scanners (Microsoft Safe Links is the usual one) that can consume a one-time token.
- PKCE does not apply to invites. ALE-213 confirmed the verify URL returns 303 to the Site URL with the session in the fragment (`type=invite` or `type=recovery`, `expires_in=3600`), not a PKCE `code`.

**Link handling, from ALE-213:**

- The REST admin response puts `action_link` on the top-level object. Client SDKs expose `properties.action_link`. The same response includes an 8-digit `email_otp` and a `hashed_token`. The admin endpoint must not return those.
- A `redirect_to` outside the allow list is rewritten to the Site URL. It is not an error. Dev Site URL is `http://localhost:5173`.
- Email OTP expiration on the dev project is set to 86400 seconds (24 hours). That setting is the invite and recovery link lifetime. `auth.one_time_tokens.expires_at` is null, and `GET /auth/v1/settings` does not return the value, so production (ALE-215) must set the same dashboard value rather than reading it back. The dashboard rejects a value above 86400 seconds.
- A banned user's recovery link is still issued, but opening it does not create a session. Unban first, or set a password with `update_user_by_id`.

The first admin is created in the Supabase dashboard. Creating that user does not put `app_metadata.role = admin` on later tokens. Set it with `update_user_by_id`. There is no bootstrap env password in the API.

The browser receives the publishable key only (`sb_publishable_…`). The secret key (`sb_secret_…`) is server-only. It never appears in `frontend/.env`.

## Decision 3: Roles — `app_metadata.role`, never the top-level `role` claim

**Decision:** FastAPI reads `app_metadata.role`, which is `admin` or `member`. It never reads the top-level `role` claim. That claim is Supabase's Postgres role and stays `authenticated` for every signed-in user. A role change and a revocation both take effect for our local check when the current access token expires (at most 1 hour). The hard-cutoff options, if a later incident needs them, are a lookup of `auth.sessions` or a `public.user_roles` table. Neither is the default.

**Rationale:**

- Treating the top-level `role` as "is this person an admin?" would make every signed-in user an admin, or none of them. ALE-213 confirmed a fresh login after `update_user_by_id` carries `app_metadata.role = admin` while the top-level `role` stays `authenticated`. An older token does not pick up the new role.
- ALE-213 also confirmed the lag: a locally verified access token stays valid until `exp`. GoTrue's own `GET /auth/v1/user` returns 403 `user_banned` immediately, and refresh fails immediately with `user_banned`. The accepted lag is our local check. Calling GoTrue on every request to close it is the hard cutoff, not the default.
- Revoke is `update_user_by_id` with `ban_duration` (for example `"24h"`). Lift it with `ban_duration: "none"`. Deleting the user is the stronger action and is not required for "revoke access."
- `user_roles` and the `auth.sessions` lookup each cost a query on the request they protect, and each is the moment the API needs a database connection (Decision 5).

## Decision 4: Callers — a service key or a user, and only a user admin can invite

**Decision:** The access dependency returns a caller that records which credential succeeded. A service-key caller has no `sub` and no role. A user caller has `sub` and `app_metadata.role`. Static keys may call `/chat` and `/jobs/*` only. Invite and revoke require a user caller whose `app_metadata.role` is `admin`.

**Rationale:**

- The marketing Pages prebuild calls `GET /jobs/stats` with the first entry in `TOOKRATT_API_KEYS`. CI and the Compose `test` service set `TOOKRATT_API_KEYS=test-api-key`. Those callers have no email and no password. Creating Supabase users for them would force every existing test through Auth.
- A leaked marketing key must not be able to invite or revoke. Membership in the static set is not an admin role.

## Decision 5: Datastore — Supabase free Postgres, no SQL in the first API ticket

**Decision:** Supabase free Postgres holds the Auth schema and any later app tables. The first implementation (ALE-214) opens no SQL connection: it verifies tokens against the JWKS URL and calls the admin API, both over HTTPS. `DATABASE_URL`, the pooler, and a SQL driver arrive with the first `public` table or with the `auth.sessions` hard cutoff. When that connection is added, Render uses the shared pooler (Supavisor) in session mode on port 5432, username `postgres.[PROJECT-REF]`. The free tier's direct connection is IPv6-only. Transaction mode (port 6543) does not support the prepared statements asyncpg and SQLAlchemy use.

A scheduled off-site dump (`pg_dump` or `supabase db dump`) is both the backup and the keep-alive against the 7-day pause. The same workflow also runs a trivial query. ALE-213 could not show that a dump alone counts as activity.

**Rationale:**

- Render free Postgres is deleted after 30 days plus a 14-day grace period. A free Render web service cannot attach a disk. Neither can hold accounts.
- Free Supabase pauses after 7 days of low activity. It is not deleted. A paused project can be restored for up to 1 year, and someone has to resume it from the dashboard. Supabase provides no backups on the free tier.
- The free tier allows two active projects. The dev project already exists (ALE-213). Production is ALE-215. API traffic cannot keep the project awake, because the first API does not touch the database.
- Compose and the unit-test job do not grow a database for this ticket. Token-verification tests use a local key pair. `Settings` still requires a non-empty `TOOKRATT_API_KEYS`, and existing tests keep using `test-api-key`.

Paid Render Postgres and Supabase Pro remain the upgrade if a pause becomes unacceptable. Leaving is a dump and restore. Upgrade when someone depending on the app would be hurt by a pause.

## Decision 6: Migration — both credentials work until each person has moved

**Decision:** One access dependency accepts either a remaining static key or a valid Supabase access token. Move people off `TOOKRATT_API_KEYS` one at a time. Service keys stay. Account holders run the Supabase client in the browser, because a stored string cannot refresh a token.

**Cutover:**

1. Ship token verification and invites before deleting any human key.
2. The first admin invites each current key holder by copying a `generate_link` URL. Their old key still works on deploy day.
3. After that person has logged in, remove their key from `TOOKRATT_API_KEYS` and redeploy. Other keys, including the marketing prebuild key, stay.
4. Stop when the env var holds only service credentials: the marketing snapshot key, `test-api-key` in CI, and whatever local dev still uses. `parse_tookratt_api_keys` can keep rejecting an empty set.
5. Legacy key holders keep `frontend/src/api/authStorage.ts` until their key is removed. When the last human key is gone, the lock modal becomes the Supabase login flow (ALE-216).
6. `/health` stays unauthenticated.
7. `HUBSTER_API_KEYS` remains the ALE-168 alias until that cutover finishes. This ADR does not add a second alias.

## Decision 7: What carries forward from ADR-0011, and the browser session

**Decision:** The check stays a FastAPI dependency, not proxy-layer Basic Auth. `/health` stays open. `Authorization` stays in CORS `allow_headers`. Credential UI keeps an explicit failure state and an explicit success state. The Supabase client uses a `sessionStorage` adapter where that adapter works with the invite redirect; `localStorage` is the fallback, not the goal.

Because the session lives where page script can read it, [ALE-218](https://linear.app/alex-projects/issue/ALE-218/security-headers-csp-for-apptookrattcom-report-only-first-enforce-if) ships a Content-Security-Policy and the other security headers on `app.tookratt.com` from `frontend/public/_headers`. The policy is report-only until [ALE-249](https://linear.app/alex-projects/issue/ALE-249/enforce-csp-on-apptookrattcom-after-a-clean-report-only-day-ale-218) renames the header. That is the XSS mitigation for this decision. It is not a reason to switch the API to cookies.

**Rationale:** ADR-0011 rejected `localStorage` for the API key because a stolen value would survive the tab closing. A refresh token has the same exposure, softened by rotation (each refresh token works once; reuse revokes the session). The storage choice does not change Decision 1.

## Preconditions — checked on the dev project (ALE-213)

These were checks, not undecided architecture. The fallback if checks 1–5 had failed was Supabase as the database only, with email/password auth written in FastAPI. That fallback is not taken.

| Check | Result |
|---|---|
| 1. Invite with public sign-up off | Pass. Signup returned `signup_disabled`. `generate_link` (`type: invite`) returned `action_link`. |
| 2. Where the invitee sets a password | Pass. Fragment session, then `updateUser({ password })`, then email + password login. |
| 3. Ban and unban | Pass. `ban_duration: "24h"` stops refresh and password login. `ban_duration: "none"` lifts it. |
| 4. `generate_link` without SMTP, and link lifetime | Pass. No mail-send error. Link lifetime is the dashboard Email OTP expiration, set to 86400 seconds on dev. |
| 5. ES256 verification | Pass. EC P-256, `aud` `authenticated`, lifetime 3600 seconds, JWKS `max-age=600`. |
| 6. Does a dump count as pause activity? | Inconclusive. The dump workflow also runs a trivial query. |
| 7. Password reset without SMTP | Pass. Recovery lands on the same Site URL with `type=recovery`. A banned user gets no session. |

## Consequences

**Positive:**

- Invite and revoke are per person, which PRODUCT_VISION requires, without FastAPI storing passwords or sessions.
- The first API ticket stays on HTTPS: JWKS verification and the admin API. No new SQL driver until a table needs one.
- Existing `/chat` and `/jobs/*` tests keep the static key. Machines never become `auth.users` rows.

**Negative / accepted risks:**

- Revocation and role changes lag by up to one hour on the local check.
- A free project pauses after a quiet week and stays paused until a person resumes it. Logins stop with it.
- The only backup is the dump we run. Supabase free has no daily backups and no point-in-time recovery.
- GitHub disables scheduled workflows on a public repository after 60 days without repository activity, and the disable is silent. That hits the dump and the daily ingest together. The implementation must say how someone notices.
- Emails and password hashes live in Supabase. That is a new trust boundary, the same class of shift as Qdrant Cloud in ADR-0013.

**Follow-up (ALE-220, 2026-09-27):** A leaked service key can only read `GET /jobs/stats`. The bullets above stay as written. The correction is in [Follow-up notes](#follow-up-notes).

## Revisit triggers

- If an incident needs a hard cutoff inside the access-token hour, add the `auth.sessions` lookup or a `public.user_roles` table. That is also the moment to add the pooler connection.
- If someone depending on the app would be hurt by a pause, move to Supabase Pro or paid Render Postgres. Do not do that before then.
- If the off-site dump misses a restore we actually needed, revisit the backup design. Do not add a second backup system before that.
- If a scheduled workflow is disabled, or the notice path in the dump ticket never fires, revisit how the schedule is watched. Do not treat a successful ingest run as proof the timer reset.
- If holding emails and password hashes at Supabase becomes unacceptable, the fallback is Supabase as the database only and auth written in FastAPI. Do not start that path while checks 1–5 stand.
- If the app and the API share an origin, revisit cookies (Decision 1) together with ADR-0016.

## Out of scope

* Endpoints, login UI, a new dependency, and the production project. Those are ALE-214, ALE-216, and ALE-215.
* Admin-panel screens are [ALE-216](https://linear.app/alex-projects/issue/ALE-216). If Bet 006's day-3 circuit breaker fires, invite and revoke run through the admin API or the Supabase dashboard, and the screens move to a follow-up.
* Profiles, chat history in Postgres, SMTP, and OAuth.
* Turning off the legacy `anon` / `service_role` keys. Done: they are disabled on the dev project and on production.

## Follow-up notes

### Login-only app, and static keys limited to `/jobs/stats` (ALE-220, 2026-09-27)

Recorded first as a [comment on ALE-212](https://linear.app/alex-projects/issue/ALE-212/adr-0019-accounts-and-access-control-on-supabase-auth-supersedes-adr#comment-c7363a9e-0d41-4260-8b9f-558b8bf81126). This note folds that correction into the ADR. The decision text above is unchanged. Both changes narrow it. They do not reopen the Supabase choice.

**Login-only app (Decisions 6 and 7).** There is no dual-accept period in the frontend. [ALE-216](https://linear.app/alex-projects/issue/ALE-216) removes `ApiKeyModal`, `authStorage.ts`, and any "use an access key" option. The only human key is Alex's, and [ALE-217](https://linear.app/alex-projects/issue/ALE-217) removes it after he has logged in with his account. Decision 6's per-person cutover no longer applies.

**Static keys limited to `GET /jobs/stats` (Decision 4).** The only production static key is the marketing prebuild's stats snapshot key. `/jobs/search` and `/chat` require a user caller. A static key gets 403 on both, because a leaked marketing key must not be able to spend Qdrant budget on search or Gemini and Qdrant budget on chat. CI and the Compose `test` service keep `test-api-key` for `/jobs/stats`. `/jobs/search` and `/chat` tests use a token signed with a local test key, which [ALE-214](https://linear.app/alex-projects/issue/ALE-214) builds.

**Consequence.** A leaked service key can only read `GET /jobs/stats`. It still cannot invite or revoke.

### Local verification lag, as shipped (ALE-214)

The API verifies access tokens locally and does not ask GoTrue on each request. A revoke (`ban_duration`) or a demotion stays invisible to this check until the current access token expires, at most one hour. [ALE-213](https://linear.app/alex-projects/issue/ALE-213/spike-run-the-seven-supabase-auth-checks-on-the-dev-project-bet-006) already measured that lag. The hard cutoff (`auth.sessions` or a `user_roles` table) stays out of scope, and it is the moment the API would open SQL. Merging ALE-214 also makes the pre-login frontend key receive 403 on `/chat` and `/jobs/search` until [ALE-216](https://linear.app/alex-projects/issue/ALE-216) ships. That 403 is the cutover, not an outage. `GET /jobs/stats` still accepts the marketing key.

### Off-site dumps and the schedule heartbeat (ALE-247, 2026-09-29)

Decision 5's text is unchanged. The accepted risks in Consequences — a free project pauses after a quiet week, Supabase free has no backups, and GitHub can disable a scheduled workflow without saying so — now point at [`.github/workflows/supabase-dump.yml`](../../.github/workflows/supabase-dump.yml) and [docs/ops/supabase-production.md](../ops/supabase-production.md).

The workflow dumps `auth` (data only) and `public` once a day into the private EU bucket `tookratt-supabase-dumps`. Objects expire after 30 days. The same run issues a trivial query so the free project does not pause. A Loki line `event=schedule_heartbeat` is written only after a scheduled success, on the dump workflow and on `ingest.yml`. The ops doc specifies the Grafana absence rule that pages `tookratt-email` when either source is missing for 36 hours. A manual `workflow_dispatch` does not refresh that window.

A restore of `dumps/20260929T065405Z` into a scratch local stack confirmed the admin account. The restore commands and the expected `pg_restore` messages are in the ops doc. Legacy `anon` and `service_role` keys are disabled on the dev project and on production.
