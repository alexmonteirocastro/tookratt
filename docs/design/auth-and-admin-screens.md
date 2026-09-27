# Auth and admin screens

* **Ticket:** [ALE-219](https://linear.app/alex-projects/issue/ALE-219/design-decisions-auth-and-admin-screens-login-set-password-admin)
* **Implements against:** [ADR-0019](../adr/0019-accounts-and-access-control-on-supabase-auth.md), [ALE-213](https://linear.app/alex-projects/issue/ALE-213/spike-run-the-seven-supabase-auth-checks-on-the-dev-project-bet-006)
* **Built in:** [ALE-216](https://linear.app/alex-projects/issue/ALE-216/frontend-supabase-login-inviteset-password-page-logout-and-admin-on)
* **Date:** 2026-09-27

Checked against the ALE-219 screen designs. Behaviour stays with ADR-0019. Tokens stay the Baltic set in [ADR-0005](../adr/0005-visual-design-tokens-for-the-chat-ui.md). Copy is short and plain, in the [ALE-208](https://linear.app/alex-projects/issue/ALE-208/copy-apptookrattcom-strings-rebrand) voice. No em dashes. A login error never says whether the email exists.

There is no access-key option anywhere in the app. The login card links out to the marketing site for people who do not have an account.

## 1. Login and set-password

Paper page (`--color-surface-alt`). The app header (subtitle, nav, email, Log out) is hidden. Above the card, centered: the Ö mark and the wordmark "töökratt", the same lockup as the header brand, not a second mark inside the card.

The card is white (`--color-surface`), 1px `--color-border`, `--radius-lg`, padding `--space-8`, max width `--max-width-auth` (new, see Tokens). Heading is Space Grotesk. Body is IBM Plex Sans.

The set-password screen is not a separate path. Invite and recovery links land on the Site URL with the session in the fragment (`type=invite` or `type=recovery`). A `redirect_to` outside the allow list is rewritten to that same URL. ALE-216 reads the fragment on `/` before the redirect to `/market`. One screen. The heading and the first field label change with `type`. The email in the body is the address on the session.

Some failures replace the form with a state card (expired link, revoked link, paused project). Those cards use the same shell: a small line icon, a heading, body, and one link.

### Form pattern

- Every field has a visible label. Login fields have no placeholder. The invite field's placeholder is the example `name@example.com`. The label is still the cue, because placeholders use `--color-text-faint`.
- Inputs are white, `--color-border`, `--radius-sm`, IBM Plex Sans. A focused field uses a `--color-accent` ring, as on the login email field in the design.
- The primary button is full width of the card on auth screens: `--color-accent` fill, `--color-accent-text`, `--color-accent-hover`, `--radius-lg` (the design's button is a rounded rectangle, not the Ask pill).
- A field error turns the input border `--color-error` and sits under the field with a small error icon, `--color-error` text, `role="alert"`, tied with `aria-describedby`.
- A form-level error is the pink panel from the design: `--color-error-bg`, `--color-error` text, `--radius-lg`, `role="alert"`. On login it replaces the body under the heading, and the fields stay.
- While login is in flight the button is disabled, shows a spinner, and reads "Logging in". The other primary buttons use the same spinner and stay disabled. Their labels do not change. The design only specifies the login waiting label.

### Password rule

Under the first password field, before the person submits: "At least 8 characters." Supabase recommends a minimum of 8. This ticket did not read the live project setting, so dev and prod must set the dashboard minimum to 8, with no required character classes. The sentence and the server rule stay the same. Leaked-password checks are Pro-only and stay off.

The second field is labeled "Type it again".

### Login, under the card

"No account? Request access at tookratt.com". "Request access at tookratt.com" links to `https://tookratt.com`. It does not open a sign-up form.

## 2. States

| State | Where | Copy |
|---|---|---|
| Field, not a full email | Under the email field | Enter a full email address. |
| Wrong email or password | Login, form panel | That email and password don't match. Try again, or ask us for a reset link. |
| Passwords differ | Under "Type it again" | The two passwords don't match. |
| Password too short | Under the first password field | Use at least 8 characters. |
| Logging in | Login button | Logging in |
| Session ended | Gray note above the "Log in" heading | You've been logged out. Log in again to keep going. |
| Link expired or already used | Replaces the form | Heading: This link has expired. Body: Links work once and last 24 hours. Ask for a new one at hello@tookratt.com. Link: Go to log in. |
| Revoked account opening a link | Replaces the form. Error fragment, no session. | Heading: This link doesn't work. Body: Your account can't use it right now. Write to hello@tookratt.com if that seems wrong. |
| Paused project | Replaces the form | Heading: Paused right now. Body: Töökratt is paused right now. Contact us and we'll get it back up. Link on its own line: hello@tookratt.com. |
| Member opens `/admin` | Replaces the People content. The header stays. | Heading: Admins only. Body: This page is for inviting and managing people. Your account can use Job market and Chat. Link: Go to Job market. |

"hello@tookratt.com" is a `mailto:hello@tookratt.com` link. "Go to log in" goes to the login screen. "Go to Job market" goes to `/market`.

The wrong-email and wrong-password cases share one sentence. A revoked account that tries to log in with a password uses that same sentence. The design does not give those two cases different copy, and a different sentence would tell them the email exists.

A session that simply is not there shows the login card with no gray note.

## 3. `/admin`

The page uses the normal app shell. Header: Ö mark, wordmark, subtitle "Job market research for Nordic and European startups", then the signed-in email and a "Log out" button on the right. Nav underneath: Job market, Chat, Admin. Admin is the active tab (ink, `--color-signal` underline).

Content width is `--max-width-chat`.

Top to bottom:

1. Heading "People". Intro: "Invite someone, send a reset link, or revoke access."
2. A white card. Label "Invite by email", input, button "Create invite link" on the same row. On a narrow screen the button drops under the input and becomes full width.
3. The show-once panel, inside that card, only after a successful invite or reset. One panel at a time. A new link replaces the previous one.
4. The people table, in its own white card.

### Table

Columns: Email, Role, Status, Added, Last login, Actions.

- Email for the signed-in user adds "(you)" on a second line. That row has no buttons. The actions cell reads "No actions on your own account".
- Role is "Admin" or "Member" from `app_metadata.role`. A missing role shows "Member".
- Status is a pill. "Active" uses `--color-accent` text on a light blue wash. "Invited" uses muted ink on a light gray wash. "Revoked" uses `--color-error` text on `--color-error-bg`. Invited means not revoked and no last login. Revoked means `banned_until` is set, and it wins over Invited.
- Added and last login are short: "2 Oct", "Today", "Yesterday". No last login shows "Never".
- Empty table: "No one here yet. Invite someone above."

### Row actions

| Status | Actions |
|---|---|
| Active, not you | Reset link, Revoke |
| Invited, not you | Reset link, Revoke |
| Revoked | Restore access |
| You | None |

"Reset link" and "Restore access" are white buttons with a border. "Revoke" is a white button with `--color-error` text and border.

Revoke does not use a browser dialog. The row turns a light `--color-error-bg`. The other columns stay. The actions cell becomes: "Revoke access? Takes effect within an hour." then "Cancel" (white) and "Revoke" (solid `--color-error` fill, white text). Cancel restores the row.

Restore access does not ask again.

### Show-once link panel

Same panel for invite and reset. Pale wash of `--color-signal` on white, `--radius-lg`, a warning icon in `--color-signal`.

- Heading: "Invite link for sara@example.com" or "Reset link for jonas@example.com", with the real address.
- "Done" dismisses the panel. On desktop it sits at the top right of the panel. On a narrow screen it sits centered under the warning. Closing does not bring the link back.
- Read-only field with the `action_link`. The box may ellipsize. Copy uses the full link. The mock redacts the token in the picture. The product shows the real link.
- Button "Copy link", accent fill, with a small copy icon. After a successful copy it reads "Copied" and returns to "Copy link" after a few seconds.
- Warning, under the field: "Send it in a chat app like Slack or Signal, not email. Some mail scanners open links and use them up. It works once, lasts 24 hours, and won't be shown again."

That warning is stricter than "send it by hand". The screen tells the admin not to use email.

The panel does not log the URL.

### Mobile

At `max-width: 640px`, the same breakpoint as the header nav (ALE-205):

- The subtitle is hidden. Log out is the arrow icon only. The email next to it is hidden. Nav stays, three tabs, Admin underlined.
- Invite button is full width under the field.
- The table becomes a stack of cards. Each card: email (and "(you)" if it is you), status pill on the right, then one meta line. Active and revoked use "Role · Last login …". Invited uses "Role · Never logged in". Added is not repeated. Actions sit under the meta line, full width, side by side.
- The confirm state replaces the meta line with "Revoke access? Takes effect within an hour." and puts Cancel and Revoke under it.

## 4. Nav

The Bet 004 nav stays: text tabs under the wordmark, Job market then Chat. Active tab is ink with a `--color-signal` underline.

- "Admin" is a third tab, after Chat, only when `app_metadata.role` is `admin`. A member never sees the tab. Typing `/admin` shows the Admins only card.
- The signed-in email sits in the header, to the left of Log out. "Log out" is a white bordered button at `--size-lock-button` height, with a small arrow icon and the label. It replaces the lock button. On `/chat` it sits to the right of New conversation.
- Login and set-password hide the nav, the email, and Log out. They keep the mark and wordmark above the card.

## 5. Copy

Strings ALE-216 should use as written.

| Place | String |
|---|---|
| Login heading | Log in |
| Login body | Töökratt is invite-only. Use the email your invite was sent to. |
| Below the login card | No account? Request access at tookratt.com |
| Email label | Email |
| Invite placeholder | name@example.com |
| Password label, invite | Password |
| Password label, reset | New password |
| Second password label | Type it again |
| Password rule | At least 8 characters. |
| Invite button | Set password and continue |
| Reset button | Save new password |
| Invite heading | Welcome to Töökratt |
| Invite body | Set a password for {email}. You'll log in with this email and password from now on. |
| Reset heading | Set a new password |
| Reset body | For {email}. Your old password stops working once you save this one. |
| Login button | Log in |
| Login button, waiting | Logging in |
| Admin heading | People |
| Admin intro | Invite someone, send a reset link, or revoke access. |
| Invite label | Invite by email |
| Invite button | Create invite link |
| Nav | Job market, Chat, Admin |
| Header | {email}, Log out |
| Own row | (you) |
| Own row, actions | No actions on your own account |
| Row actions | Reset link, Revoke, Restore access, Cancel |
| Revoke confirm | Revoke access? Takes effect within an hour. |
| Badges | Active, Invited, Revoked |
| Roles | Admin, Member |
| Empty last login | Never |
| Relative last login | Today, Yesterday |
| Show-once heading | Invite link for {email} |
| Show-once heading, reset | Reset link for {email} |
| Show-once warning | Send it in a chat app like Slack or Signal, not email. Some mail scanners open links and use them up. It works once, lasts 24 hours, and won't be shown again. |
| Copy button | Copy link |
| Copy button, after | Copied |
| Show-once dismiss | Done |
| Expired heading | This link has expired |
| Expired body | Links work once and last 24 hours. Ask for a new one at hello@tookratt.com. |
| Expired link | Go to log in |
| Revoked link heading | This link doesn't work |
| Revoked link body | Your account can't use it right now. Write to hello@tookratt.com if that seems wrong. |
| Paused heading | Paused right now |
| Paused body | Töökratt is paused right now. Contact us and we'll get it back up. |
| Admins heading | Admins only |
| Admins body | This page is for inviting and managing people. Your account can use Job market and Chat. |
| Admins link | Go to Job market |
| Session note | You've been logged out. Log in again to keep going. |
| Email field error | Enter a full email address. |
| Login form error | That email and password don't match. Try again, or ask us for a reset link. |
| Confirm field error | The two passwords don't match. |
| Short password | Use at least 8 characters. |

An admin invite that hits an existing user can say "That person already has an account." The public login form cannot.

## Tokens and components

No new colors. The show-once panel is a light wash of `--color-signal`. Status pills reuse accent, muted ink, and the error tokens. No component library. Marketing tokens do not change.

Add one layout token in `frontend/src/styles/tokens.css` when ALE-216 builds the card:

| Token | Value | Use |
|---|---|---|
| `--max-width-auth` | `28rem` | Centered login and set-password card |

Local components, in `frontend/src/components/`:

- `AuthCard` for the shared login and set-password shell, including the state cards that replace the form.
- `ShowOnceLink` for the invite and reset panel.
- An inline confirm in the row for Revoke. Not `window.confirm`.

Noted on [ADR-0005](../adr/0005-visual-design-tokens-for-the-chat-ui.md).

## Out of scope

Building the screens (ALE-216). Motion beyond the login spinner. Illustrations. The marketing site, other than the request-access link pointing at it.
