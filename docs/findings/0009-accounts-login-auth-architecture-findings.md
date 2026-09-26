# ALE-189 Spike Findings: Accounts, Login, and Auth Architecture

* **Ticket:** [ALE-189](https://linear.app/alex-projects/issue/ALE-189/spike-discover-accountsloginauth-architecture-sessions-vs-jwt-identity)
* **Related:** [ADR-0011](../adr/0011-api-key-authentication.md) (the access-control decision this spike expects a new ADR to supersede), [ADR-0008](../adr/0008-multi-turn-conversation-memory.md) (`SessionState` is chat memory, not a user), [ADR-0013](../adr/0013-deployment-strategy.md) (Render free web service, single instance, Cloudflare Pages frontend), [ADR-0016](../adr/0016-marketing-site-topology-and-capture.md) (apex marketing + `app.` chat; waitlist is an email relay with no store), [ADR-0006](../adr/0006-chat-endpoint-hardening.md) (per-IP in-memory rate limit on `/chat` only), [PRODUCT_VISION](../PRODUCT_VISION.md) (2026-09-23: accounts are invite-only access control), [ALE-114](https://linear.app/alex-projects/issue/ALE-114/spike-discover-authenticationaccess-control-options-to-restrict) (the spike that produced ADR-0011), [ALE-200](https://linear.app/alex-projects/issue/ALE-200) (vision revision that dropped candidate profiles)
* **Date:** 2026-09-26
* **Status:** Spike complete for the decisions below. Datastore limits were checked the same day (Render free Postgres expires; Supabase free pauses). Supabase Auth is the identity recommendation and still has the checks in Open items before the ADR treats it as closed. No implementation.

## Summary

**Recommendation: Supabase free Postgres, and Supabase Auth for invite-only email/password accounts. FastAPI verifies Supabase access tokens. It does not store passwords or sessions. A new ADR (the next number is ADR-0019) supersedes ADR-0011.** Chat `SessionState` stays a separate, in-memory conversation handle, tagged with the token's user id.

The datastore half is a decision. Render cannot keep a users table on the free tier: its free Postgres is deleted about 44 days after creation, and a free web service cannot attach a disk. Supabase free pauses after a quiet week and can be restored for up to a year. The identity half follows from that host: Supabase Auth already hashes passwords, invites, rotates refresh tokens, and rate-limits login. FastAPI keeps the access check.

This matches the product as it stands after ALE-200, not the roadmap paragraph this ticket was written against. [PRODUCT_VISION](../PRODUCT_VISION.md) says accounts exist for access control only: invite-only, email and password, an admin who can invite and revoke. No profile, no stored career data, no persistent conversation history. The Aug 18 ticket text still lists persistent candidate profiles, a curated newsletter, and a waitlist table as reasons to build accounts. Those are not reasons anymore.

| Decision | Recommendation |
|---|---|
| Auth mechanism | Supabase access token (short-lived ES256 JWT) plus rotating refresh tokens. FastAPI verifies the JWT locally. Not a cookie. Not a session table we operate. Not merged with chat `session_id`. |
| Identity for v1 | Supabase Auth, invite-only email + password. Public sign-up off. The admin copies a `generate_link` invite URL and sends it by hand. No SMTP in v1. Magic link and OAuth wait. |
| Data model | `auth.users` and `auth.sessions` are Supabase's. Admin role lives in the token (`app_metadata`). No waitlist table. No feature-flag table. No profile. Service keys stay out of `auth.users`. |
| Datastore | Supabase free Postgres. The first API ticket verifies tokens and calls the admin API over HTTPS; it does not need a SQL connection. The pooler (session mode, port 5432) matters when the first table or the `auth.sessions` check arrives. A scheduled dump outside Supabase is the backup and the keep-alive. |
| Migration | Accept a static key **or** a Supabase access token during cutover. Move people off `TOOKRATT_API_KEYS` one at a time. Leave non-interactive callers (marketing prebuild, CI) on static keys. |
| ADR-0011 | Supersede it with a new ADR. Do not revise ADR-0011 in place. Point both documents at each other when that ADR lands. |

## What the ticket assumed, and what the vision says now

ALE-189 was filed on 2026-08-18, before the 2026-09-23 vision revision. Three constraints in the current vision change what "enough schema to validate auth" means:

1. **Accounts hold login state only.** Email, a password Supabase stores, and a role. There is no candidate profile to attach, and ADR-0008's follow-up (ALE-200) already says `SessionState` is not a profile carrier.
2. **Conversation memory stays the bounded in-tab store.** Putting chat turns in Postgres would smuggle in persistent history, which the vision lists as out of scope for this stage.
3. **The marketing waitlist is already decided.** ADR-0016 stores nothing. Submissions go to `hello@tookratt.com` through the capture Worker's `send_email` binding, and `workers/capture/wrangler.toml` locks the recipient to that address. A size estimate that mentions a waitlist table is not a decision to create one.

Admin-panel screens, profile storage, and newsletter sending stay out of scope, as the ticket said.

## 1. Auth mechanism — Supabase access token, checked in FastAPI

**Recommendation:** The browser holds a Supabase session and sends the access token as `Authorization: Bearer`. FastAPI verifies the signature, issuer, audience, and expiry locally against the project's JWKS. Logout and admin revoke go through Supabase. The chat `session_id` is unchanged, except that the in-memory session records the token's `sub`.

This is a consequence of §2, not a separate vote for JWTs. An earlier pass of this spike recommended an opaque session row we would look up ourselves, and rejected a JWT because revocation needs a store. Supabase Auth is that store. Verifying a short-lived token locally is the check that does not add a network call. Operating a second session table beside `auth.sessions` would duplicate it.

### What FastAPI actually checks

- Algorithm ES256. Public keys come from `https://<project>.supabase.co/auth/v1/.well-known/jwks.json`.
- Supabase caches that key list for 10–20 minutes. The API must not cache it longer.
- The legacy HS256 shared secret is not the production path.
- Claims: `iss`, `aud`, `exp`, and `app_metadata.role` (see §3). The top-level `role` claim is Supabase's Postgres role (`authenticated`). It is not our admin/member flag, and FastAPI must not read it as one.
- The service-role key never reaches the browser. The anon key may. That split is the same rule as `TOOKRATT_API_KEYS` on the marketing build: a secret used to administer users is not a `VITE_` variable.

Revocation is not instant. After a session is revoked, the access token stays valid until it expires (one hour by default). That is acceptable for this invite list. If a later incident needs a hard cutoff, FastAPI can also require that the token's `session_id` still exists in `auth.sessions`. That is one database query per request, and it is the escape hatch, not the default.

### Why the bearer stays, and the cookie does not

The chat UI and the API are different sites. ADR-0013 puts the API on a Render web service. ADR-0016 puts the chat app on `app.tookratt.com` (Cloudflare Pages) and marketing on the apex. CORS today (`api/main.py`) has `allow_credentials=False` and already allows `Authorization`. A bearer token uses that shape as it stands.

A cookie session still fights it: `SameSite=None; Secure`, `allow_credentials=True`, third-party cookie blocking on `app.tookratt.com`, and a CSRF defense because the cookie is sent automatically. HttpOnly cookies are the better XSS story. ADR-0011 already accepted `sessionStorage` for the API key because of this topology. The revisit is the one ADR-0016 wrote down: if the app and the API ever share an origin, revisit cookies then. Do not add a reverse proxy solely to make cookies first-party.

The Supabase browser client persists sessions in `localStorage` by default. ADR-0011 rejected `localStorage` for the API key because a stolen value would survive the tab closing. A refresh token has the same exposure, softened by rotation (each refresh token works once; reusing an old one revokes the session). The ADR should prefer a custom storage adapter on `sessionStorage` unless the invite redirect (§2) cannot work that way. That is a storage choice, not a reason to switch the API to cookies.

### Chat `SessionState` stays a different thing

ADR-0008 minted `session_id` because the API key could not identify a person. It is an opaque id (`uuid4().hex`) from `SessionStore`, carried on `ChatRequest` / `ChatResponse`, held in React state next to the message list. `SessionState` holds at most `CHAT_HISTORY_MAX_TURNS` (default 5) turns, the last country/remote filter, and `last_seen`. Idle TTL is `CHAT_SESSION_TTL_SECONDS` (default 1800). The store is a process-local dict capped at `CHAT_MAX_SESSIONS` (default 1000). A Render redeploy or the free-tier spin-down drops it. ADR-0008 accepted that for chat memory.

Tag the in-memory session with `sub` when the access check has identified a person. That is a label for logs and for "who was in this conversation," not a merge:

- Auth has to survive restart. Chat memory is specified not to.
- Auth expiry is the access token plus the Supabase session. Chat expiry is 30 minutes of inactivity, plus eviction under the cap.
- Two browsers for one person are two conversations. Keying the chat store by user id would mix them.
- Writing turns to Postgres, or a foreign key from a turns table to `auth.users`, would make history persistent. The vision forbids that.

`/chat` keeps resolving `session_id` exactly as it does now, after the access check succeeds. The access dependency does not read or write the turn list.

Rate limiting on `POST /chat` stays where ADR-0006 put it: `10/minute` per client IP, in memory. Login and token endpoints are rate-limited by Supabase, so this spike does not add a second login limiter in FastAPI. Per-user chat quotas remain the revisit trigger ADR-0006 already names for real concurrent users.

## 2. Identity for v1 — Supabase Auth, invite-only email and password

**Recommendation:** Supabase Auth. An admin invites by email. Public sign-up stays off. The invitee sets a password. FastAPI does not hash passwords and does not implement invite or reset. Magic link, as a login method, and GitHub or LinkedIn login wait.

This is the method PRODUCT_VISION already states (email and password, invite, revoke), with the security-critical machinery run by the same Postgres host §4 selects. The pieces a hand-rolled implementation is most likely to get subtly wrong are the ones Supabase already runs: password hashing, invite and reset, per-IP limits on login and token endpoints, and refresh-token rotation.

What stays in our code:

- The FastAPI dependency in §1.
- Admin actions, which call the Supabase admin API with the secret key. Invites use `generate_link` (`type: invite`) and return the URL to the admin. `invite_user_by_email` sends mail, so v1 does not call it. Revoke uses `update_user_by_id` (`ban_duration`) or `delete_user`. `list_users` is 50 per page. The panel UI itself is still out of scope.
- The first admin starts as a user created in the Supabase dashboard. There is no bootstrap env password in the API. Creating that user does not put `app_metadata.role = admin` on later access tokens. Set it with `update_user_by_id`, or an equivalent update of `auth.users` app metadata, and confirm the next token carries `app_metadata.role`. The top-level `role` claim will still say `authenticated`.

### Email — no mail provider in v1

The admin copies an invite link and sends it by hand, the same way API keys are shared today. No Resend, Postmark, or other SMTP.

`invite_user_by_email` is the call that sends mail. v1 does not use it. `generate_link` with `type: invite` creates the user and returns the link (`properties.action_link`). Supabase's own admin reference describes that method as generating the link, and describes `invite_user_by_email` as sending one. The built-in mailer, which only reaches project team addresses at 2 per hour, stays unused. The capture Worker still only delivers to `hello@tookratt.com`, so it is not a fallback sender either.

That call has not been made against a project yet. There is no Supabase project in this repo, and creating one is implementation, not this spike. Until an implementation ticket runs `generate_link` with public sign-up disabled and gets `action_link` back, the no-SMTP choice is the intended path, not a demonstrated one.

Invite links expire. This spike did not read the project's OTP lifetime or how far it can be extended, so the implementation ticket has to read both (Open item 4). A link that dies before the recipient opens it is not a hand-sent invite.

Two further hazards the ADR should not rediscover in production: PKCE does not work with invites, and an email-link scanner (Microsoft Safe Links is the usual one) can consume the token if the link is sent through a mailbox that prefetches URLs. Sending it in a channel that does not prefetch is the point of copying it by hand. Where the invitee sets the password is still unchecked. The likely shape is a React page that receives the link's session and calls `updateUser({ password })`. The docs do not spell that out.

### What Supabase Auth costs

| Tradeoff | Notes |
|---|---|
| Revocation lag | Access token valid until expiry (1 hour) after revoke. Hard cutoff means also checking `auth.sessions`. |
| Pro-only, $25/month | Session time limits, inactivity timeout, one session per user, leaked-password checks. Not needed for v1. |
| Availability | A paused free project stops logins as well as queries. Same pause as the database (§4). The scheduled dump is the mitigation for both. |
| Learning | The project integrates an auth system instead of building one. Token verification and the role rule are still ours. |
| Trust boundary | Emails and password hashes live in Supabase, not only in a database we operate. Same class of shift as Qdrant Cloud in ADR-0013. |

### OAuth and a second human method

OAuth drops password storage and adds a provider that can lock everyone out. GitHub's audience is narrower than the vision. LinkedIn is closer and is the heavier integration. Neither is required to invite a known person. A second human method also means a linking rule ("this GitHub account is the same email") before there is a single real user. Service keys are not a second human method; they are the machine path in §5.

If the Open items fail, the fallback is Supabase as the database only, and the hand-rolled email/password flow this spike described before this revision (argon2id, invite rows, opaque session tokens). Do not start that fallback in the ADR. Run the checks first. The datastore decision does not depend on them.

## 3. Data model sketch

Enough to show the mechanism fits. Column types are the ADR's job. Supabase already has the login tables. v1 does not add a parallel user store.

### Supabase-owned

| What | Why we leave it alone |
|---|---|
| `auth.users` | Email, password hash, ban state. Our tables, if any, reference `id`. |
| `auth.sessions` | Refresh tokens and revocation. Looking up a session is the hard-cutoff option in §1, not a table we design. |
| Invites | Admin API and `generate_link`. No `invites` table of ours. |

### Role

Put `admin` or `member` in `app_metadata.role`, which Supabase copies onto the access token. FastAPI reads that field and no other role field. Supabase already sets a top-level `role` claim to the Postgres role `authenticated` (or `anon`). Treating that claim as "is this person an admin?" would make every signed-in user an admin, or make none of them one. Changing `app_metadata.role` waits for the current access token to expire or for a refresh, the same lag as revocation. A `public.user_roles` table is the alternative if that lag is unacceptable; it costs a query on every admin check, and it is the moment the API needs a database connection (§4). Default for the ADR: `app_metadata.role`. The table is the escape hatch, next to the `auth.sessions` lookup.

`ban_duration` is the revoke operation to confirm (Open items). A banned user must not be able to refresh. There has to be a documented way to lift the ban. Deleting the user is the stronger action and is not required for "revoke access."

### What we do not add

No name, profile, CV, preference, or feature-flag columns. Nothing in the vision gates a feature per user. `role` is the only authorization split v1 needs.

No waitlist table. ADR-0016 Decision 2 is "no KV, no D1, no other persistence," revisited only if volume justifies stored submissions. People who want access are invited.

No chat-turn table. See §1.

### Service keys — not users

The marketing Pages prebuild calls `GET /jobs/stats` with the first entry in `TOOKRATT_API_KEYS` (`marketing/README.md`). CI and the Compose `test` service set `TOOKRATT_API_KEYS=test-api-key`. Those callers have no email and no password. Creating Supabase users for them would force every existing unit test through Auth. Keep them as the static allowlist.

A static key is never an admin. The access dependency returns a caller that says which kind of credential succeeded: a service key, or a user with `sub` and `app_metadata.role`. Invite and revoke require a user caller whose `app_metadata.role` is `admin`. Membership in the key set authorizes the existing product routes (`/chat`, `/jobs/*`) only. A leaked marketing key must not be able to invite or revoke.

## 4. Datastore — Supabase free Postgres

**Recommendation:** Supabase free Postgres for the Auth schema and any later app tables. A scheduled `pg_dump` or `supabase db dump`, stored outside Supabase, is part of this decision.

The first implementation ticket may not open a SQL connection at all. If the only authorization data is `app_metadata.role` and there is no `public` table, FastAPI verifies tokens against the JWKS URL and calls the admin API, both over HTTPS. `DATABASE_URL`, the pooler, and a SQL driver stay out of that ticket. They arrive with the first `public` table, or with the hard-cutoff read of `auth.sessions`. When that connection is added, Render reaches Postgres through the shared pooler (Supavisor) in **session mode on port 5432**, username `postgres.[PROJECT-REF]`. The free tier's direct connection is IPv6-only. Transaction mode (port 6543) does not support prepared statements, which asyncpg and SQLAlchemy use.

Because the API does not touch the database in that first shape, API traffic cannot keep the project awake. The dump workflow is the keep-alive as well as the backup.

Checked 2026-09-26 against Supabase and Render's current docs. This replaces the earlier "confirm the host in the ADR" placeholder.

### Limits that matter here

| Limit | Free project |
|---|---|
| Disk | 500 MB. A new project already uses about 40–60 MB. Past 500 MB the database goes read-only. An invite list of users and sessions stays far under that. |
| Compute | Shared CPU, about 500 MB RAM |
| Projects | Up to 2 active |
| Connections | 60 direct. The pooler accepts up to 200 clients. |
| Egress | 5 GB |
| Auth | Included, up to 50,000 monthly active users |
| Pause | After 7 days of low activity the project is **paused**, not deleted. Resume from the dashboard. A paused project can be restored for up to 1 year. Supabase sends a warning email a week before a pause. |
| Backups | None. No daily backups, no point-in-time recovery. |

### Backups and the pause

Free Supabase will not save us from a bad migration or a dropped table. A scheduled GitHub Action dumps the database and stores the dump outside Supabase. That job is required.

The same job is how a quiet invite-only app avoids the 7-day pause. Supabase says a few database requests a day are enough. Whether a dump counts is still to verify (Open items). If it does not, the workflow needs a trivial query as well. A paused project fails the next login until someone resumes it in the dashboard. That is the accepted availability risk at $0, in the same family as ADR-0013's Render spin-down, and it is worse than a spin-down because it lasts until a person acts.

The repo is public. GitHub disables scheduled workflows on a public repository after 60 days without repository activity, and the disable is silent. The dump keep-alive and the daily ingest (`.github/workflows/ingest.yml`) are both schedules, so a quiet 60 days stops both. Do not treat the ingest run as proof the timer resets. The implementation ticket should say how someone notices a disabled schedule.

### Why not Render

Neither free option on Render can hold a users table.

**Free Postgres.** 256 MB RAM, 1 GB storage, 100 connections. It expires 30 days after creation, then a 14-day grace period, then the instance and the data are deleted. No backups. One free database per workspace. Render may restart it or take it down for maintenance. Usable as a throwaway. Not usable as the account store.

**SQLite on the web service.** Free web services cannot attach a disk. The filesystem is wiped on every redeploy, restart, and spin-down, and a free service spins down after 15 minutes without traffic. A SQLite file there would disappear several times a day. A disk requires a paid instance (`0.5c-512mb` at $7/month, plus disk at $0.25/GB/month). Attaching one drops zero-downtime deploys, caps the service at one instance, and leaves Render's disk snapshots unsafe for restoring a live database file.

**Paid Render Postgres** (`0.1c-256mb`, $6/month, 256 MB RAM, 1 GB included, more at $0.30/GB/month) does not expire and has point-in-time recovery (3 days on Hobby, 7 days on Pro). It was the lean before Supabase's pause-versus-delete behavior was checked. It remains the paid alternative if the free project's pause becomes unacceptable. The next Render size up is `0.5c-1g` at $19/month.

Moving the API itself off the free web service (which would also end cold starts) is a separate decision from this datastore.

### Upgrade

It is ordinary Postgres. Leaving later for Supabase Pro ($25/month: no pausing, 7-day daily backups) or for Render's $6 instance is a dump and restore. Upgrade when someone depending on the app would be hurt by a pause, not before.

Cloudflare D1 stays a poor fit: the API is not a Worker, and ADR-0016 kept product data out of the marketing account's storage. Qdrant stays the job corpus. Chat turns stay out of Postgres.

### Local and CI

Compose has no database service today, and the first API ticket should not add one. Token-verification tests use a local key pair and do not call a live Supabase project. A Postgres service in dev and CI arrives with the first SQL, not before.

The unit-test job does not have a database, and it should not grow one for the whole suite. `Settings` still requires a non-empty `TOOKRATT_API_KEYS`, and tests authenticate with `test-api-key`. Keeping that path (§5) means existing `/chat` and `/jobs/*` tests stay as they are.

There is no SQLAlchemy or Alembic in `pyproject.toml` today. If v1's only schema is Supabase Auth plus `app_metadata`, the first migration is empty and there is no `DATABASE_URL`. The moment a `public` table is added, schema changes are versioned files, not SQL applied by hand in the dashboard.

## 5. Migration — both credentials work until each person has moved

**Recommendation:** One access dependency accepts either a remaining static key or a valid Supabase access token, and it returns a caller that records which one succeeded. A service-key caller has no `sub` and no role. A user caller has `sub` and `app_metadata.role`. Admin routes require the user caller with `role` `admin` inside `app_metadata`. Humans move one at a time. Machines never become `auth.users` rows, and a static key never gains admin rights.

ADR-0011 Decision 2's useful property is independent revocation: remove one key from the comma-separated env var and everyone else keeps working. The cutover should keep that property.

1. Ship token verification and invites **before** deleting any human key. A request with an old key still succeeds. A request with a Supabase access token succeeds as that user.
2. Create the first admin in the Supabase dashboard. That person invites each current key holder by copying a `generate_link` URL and sending it by hand. No SMTP. Nobody is locked out on deploy day, because their key still works.
3. When a person has logged in and confirmed the app works, remove **their** key from `TOOKRATT_API_KEYS` and redeploy. Other keys, including the marketing prebuild key, stay.
4. Stop when the env var contains only service credentials: the marketing snapshot key, `test-api-key` in CI, and whatever local dev still uses. `Settings` rejects an empty set today (`parse_tookratt_api_keys`). After this migration that validator can stay, because the set is not empty.
5. The server distinguishes the two credentials: membership in the static set, otherwise JWT verification. The SPA cannot. A Supabase access token expires after about an hour, and only the Supabase client can refresh it, so an account holder must run that client and send its current access token. A stored string, which is what `frontend/src/api/authStorage.ts` does for the API key today, will not keep an account session alive. Legacy key holders keep that stored string until their key is removed. When the last human key is gone, the lock modal becomes the Supabase login flow. That UI replacement is the frontend implementation ticket.
6. `/health` stays unauthenticated (ADR-0011 Decision 1).
7. `HUBSTER_API_KEYS` remains the ALE-168 alias until that cutover finishes. The new ADR should not invent a second alias.

There is no flag day and no window where a collaborator has neither a key nor an account, as long as step 3 happens only after step 2 for that person.

Service keys are a deliberate remainder. They are how a build and a test suite call the API without a browser. The new ADR should say that plainly so a later cleanup does not delete the marketing key and break the homepage snapshot. It should also say the inverse: those keys authorize product routes only. They do not authorize invite or revoke (§3).

## 6. ADR-0011 — supersede it, in a new number

**Recommendation:** Yes. Write a new ADR. Do not edit ADR-0011's decisions in place. The next unused number is **ADR-0019** (ADR-0018 is the latest file in `docs/adr/`).

ADR-0011 says the shared key is "deliberately an MVP-level improvement, not a step toward real IAM," for a list of people known in advance. Its own revisit trigger has fired: per-user identity is now a product requirement. PRODUCT_VISION requires invite and revoke per person. That is a different access model, not a patch to Decision 2's comma-separated set.

The document is still marked **Proposed**, and the mechanism is already in the tree (`api/auth.py`, `sessionStorage`, CORS `Authorization`). Superseding it records that the shipped MVP is no longer the target.

Precedent for a new file plus a pointer back, rather than a silent rewrite:

- ADR-0002's keyword-precision revisit is answered in ADR-0010, and ADR-0002 carries an "Addressed" note.
- ADR-0013 Decision 2 was revised by ADR-0016, with a follow-up note left on ADR-0013.
- ADR-0001 Decision 4 was superseded by ADR-0008, and the original decision text stayed put.

When ADR-0019 lands it should:

- Say in its header that it supersedes ADR-0011.
- Add a short follow-up note on ADR-0011 pointing at ADR-0019, and set ADR-0011's status accordingly. That edit belongs to the ADR ticket. This spike does not change ADR-0011.

What ADR-0019 should carry forward from ADR-0011:

- The check lives in a FastAPI dependency, not in a proxy Basic-Auth layer.
- `/health` stays open.
- The browser holds the credential in `sessionStorage` rather than `localStorage`, if the Supabase client allows that adapter (§1). `localStorage` is the fallback, not the goal.
- Failure and success states on the credential UI stay explicit.
- `Authorization` stays allowed by CORS.
- A non-person credential still exists, narrowed to service callers.

What it should retire: "a handful of static keys is the user database."

## Decision

| Question | Answer |
|---|---|
| Session cookie or JWT? | **Supabase access token (ES256 JWT) plus rotating refresh tokens.** We do not operate a second session table. Cookies stay out because the app and the API are different sites. |
| Merge with chat `SessionState`? | **No.** Tag the in-memory session with `sub`. Turns stay in the process, with the 30-minute TTL. |
| Identity method for v1? | **Supabase Auth, invite-only email + password.** Public sign-up off. Admin copies a `generate_link` URL. No SMTP. |
| Schema we own? | **No** users, sessions, invites, waitlist, flags, or profile tables in v1. Role is `app_metadata.role`, never the top-level `role` claim. |
| Where does Postgres live? | **Supabase free.** Off-site dump included. The first API does not open SQL; the pooler (session mode, port 5432) waits for the first table or the `auth.sessions` check. |
| Render free Postgres or a disk? | **No.** Free Postgres is deleted after 30 days plus 14 days of grace. A free web service cannot attach a disk. |
| Hard cutover from `TOOKRATT_API_KEYS`? | **No.** Dual-accept, then remove human keys one at a time. Service keys stay. |
| Revise ADR-0011 in place? | **No.** ADR-0019 supersedes it, with pointers both ways. |

## Open items

These are checks, not undecided architecture. The datastore recommendation does not wait on them. The identity recommendation does.

1. **Invites with public sign-up disabled.** Confirm an admin can still invite when "Allow new users to sign up" is off. The docs do not say.
2. **Where the invitee sets a password.** Likely a React page on the invite link's session calling `updateUser({ password })`. Unconfirmed. PKCE does not apply to invites. Link scanners can consume the token.
3. **Ban and unban.** `ban_duration` must stop refresh, and there must be a way to lift it.
4. **`generate_link` without SMTP, and how long the link lives.** v1 will not add a mail provider. The admin copies `action_link` and sends it by hand. The implementation ticket confirms the call returns that link on a project with public sign-up disabled, and reads the OTP expiry (and its maximum) before anyone is told to expect a hand-sent link to wait. This spike does not create that project and does not state a lifetime.
5. **Verify a token from FastAPI.** `get_claims` in `supabase-py`, or PyJWT against the JWKS URL. Confirm `iss`, `aud`, `exp`, ES256, and that we do not cache keys longer than 10–20 minutes.
6. **Does the scheduled dump count as activity** for the 7-day pause? If not, add a trivial query to the same workflow.

## Out of scope (unchanged from the ticket, updated for the vision)

* No implementation: no Supabase project, no endpoints, no login UI, no new dependency.
* No admin-panel UI. The admin API is how invite and revoke will work; screens are a later ticket.
* No candidate profile, CV, or chat-history table. ALE-200 removed them from the vision.
* No OAuth app registration, and no newsletter sender.
* No edit to ADR-0011's status in this change. The ADR ticket does that.

## Sources

Render limits (2026-09-26): [Deploy for Free](https://render.com/docs/free), [pricing](https://render.com/pricing), [Persistent Disks](https://render.com/docs/disks), [Postgres backups](https://render.com/docs/postgresql-backups), [free Postgres expiry changelog](https://render.com/changelog/free-postgresql-instances-now-expire-after-30-days-previously-90).

Supabase limits and Auth (2026-09-26): [pricing](https://supabase.com/pricing), [billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [database size](https://supabase.com/docs/guides/platform/database-size), [backups](https://supabase.com/docs/guides/platform/backups), [compute and disk](https://supabase.com/docs/guides/platform/compute-and-disk), [connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), [general configuration](https://supabase.com/docs/guides/auth/general-configuration), [JWTs](https://supabase.com/docs/guides/auth/jwts), [signing keys](https://supabase.com/docs/guides/auth/signing-keys), [sessions](https://supabase.com/docs/guides/auth/sessions), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [rate limits](https://supabase.com/docs/guides/auth/rate-limits).
