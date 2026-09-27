# Auth and admin screens

* **Ticket:** [ALE-219](https://linear.app/alex-projects/issue/ALE-219/design-decisions-auth-and-admin-screens-login-set-password-admin)
* **Implements against:** [ADR-0019](../adr/0019-accounts-and-access-control-on-supabase-auth.md), [ALE-213](https://linear.app/alex-projects/issue/ALE-213/spike-run-the-seven-supabase-auth-checks-on-the-dev-project-bet-006)
* **Built in:** [ALE-216](https://linear.app/alex-projects/issue/ALE-216/frontend-supabase-login-inviteset-password-page-logout-and-admin-on)
* **Date:** 2026-09-27

Decisions for how login, set-password, and `/admin` look and read. Behaviour stays with ADR-0019. Tokens stay the Baltic set in [ADR-0005](../adr/0005-visual-design-tokens-for-the-chat-ui.md). Copy is short and plain, in the [ALE-208](https://linear.app/alex-projects/issue/ALE-208/copy-apptookrattcom-strings-rebrand) voice. No em dashes. A login error never says whether the email exists.

There is no access-key option anywhere in the app.

## 1. Login and set-password

Both screens use one card, centered on Paper (`--color-surface-alt`).

The app header (wordmark, nav, Log out) is hidden on these screens, so the Ö mark appears once. Inside the card: the mark at `--size-mark-empty` (72px), a Space Grotesk heading, IBM Plex Sans body. The card is white (`--color-surface`), 1px `--color-border`, `--radius-lg`, padding `--space-8`, max width `--max-width-auth` (new, see Tokens).

The set-password screen is not a separate path. Invite and recovery links land on the Site URL with the session in the fragment (`type=invite` or `type=recovery`). A `redirect_to` outside the allow list is rewritten to that same URL. ALE-216 reads the fragment on `/` before the redirect to `/market`. One screen. The heading changes with `type`.

### Form pattern

- Every field has a visible label. No placeholder text. Placeholders today use `--color-text-faint`, which fails contrast, so the label is the cue.
- Inputs use the existing cream field chrome: white fill, `--color-border`, `--radius-sm`, IBM Plex Sans.
- The primary button is the Ask button: `--color-accent` fill, `--color-accent-text`, `--color-accent-hover`, `--radius-pill`, full width of the card.
- A field error sits under that field in `--color-error`, `role="alert"`, tied with `aria-describedby`.
- A form-level error sits above the button in the chat error panel: `--color-error-bg`, `--color-error`, `--color-error-border`, `role="alert"`.
- While the request is in flight the button is disabled and its label changes. No spinner.

### Password rule

Show the rule before the person types: "At least 8 characters." Supabase recommends a minimum of 8. This ticket did not read the live project setting, so dev and prod must set the dashboard minimum to 8, with no required character classes. The sentence and the server rule stay the same. Leaked-password checks are Pro-only and stay off.

A second field, "Confirm password", catches a typo on a link that is only opened once.

## 2. States

| State | Where | Copy |
|---|---|---|
| Empty email | Login or invite, field | Enter your email. |
| Empty password | Login, field | Enter your password. |
| Wrong email or password | Login, form | That email and password don't match. Try again. |
| Account revoked, signing in | Login, form | This account can't sign in. Contact us at hello@tookratt.com. |
| Session ended | Login, form, only after a session that was valid | Your session ended. Sign in again. |
| Never signed in | Login | No extra banner. The heading is enough. |
| Link expired or already used | Set-password, form | This link has expired or was already used. Ask an admin for a new one. |
| Revoked account opening a link | Set-password, form. Error fragment, no session. | This account can't sign in. Contact us and we'll look into it. |
| Opened with no invite or reset | Set-password, form | This page opens from an invite or reset link. Ask an admin if you need one. |
| Paused project | Login or set-password, form | Töökratt is paused right now. Contact us and we'll get it back up. |
| Member opens `/admin` | `/admin`, in the normal app shell | You can't open this page. Admin is limited to admins. |
| Passwords differ | Set-password, confirm field | Those passwords don't match. |
| Password too short | Set-password, password field | Use at least 8 characters. |

"Contact us" and the email address in the revoked and paused messages are links to `mailto:hello@tookratt.com`. The member state includes a "Job market" link back to `/market`.

The wrong-email and wrong-password cases share one sentence.

## 3. `/admin`

The page sits in the normal app shell (header stays). Content uses `--max-width-chat`.

Top to bottom:

1. Heading "People" in Space Grotesk.
2. Invite form: email label, email input, button "Create invite".
3. The show-once panel, only after a successful invite or reset. One panel at a time. A new link replaces the previous panel.
4. The people table.

### Table

Columns: Email, Status, Role, Created, Last sign-in.

- Status is a badge. Active: ink text, white fill, `--color-border`. Banned: `--color-error` text, `--color-error-bg` fill, `--color-error-border`. The words are "Active" and "Banned". Banned means `banned_until` is set.
- Role is "Admin" or "Member" from `app_metadata.role`. A missing role shows "Member".
- Created and last sign-in use the viewer's local time, day month year and 24-hour time, for example "27 Sep 2026, 21:52". No last sign-in shows "Never".
- Empty table: "No one here yet. Invite someone above."

### Row actions

| Status | Actions |
|---|---|
| Active | Revoke, Reset link |
| Banned | Restore |

No Reset link on a banned row. Restore first. Restore does not ask again.

Revoke asks in the row, not in a browser dialog. The confirm line replaces the actions until it is answered:

> Revoke access for ada@example.com? They can keep using the app for up to an hour.

Buttons: "Revoke access" and "Cancel". "Revoke access" uses the error colors. "Cancel" is a text button.

### Show-once link panel

Same panel for invite and reset. White surface, `--color-border`, `--radius-lg`.

- Heading: "Invite link" or "Reset link".
- "This link lasts 24 hours. It won't be shown again."
- "Send it in a channel that doesn't preview links. A mail scanner can use it up."
- Read-only field with the full URL. Focusing it selects the URL.
- Button "Copy". After a successful copy it reads "Copied" and returns to "Copy" after a few seconds.
- "Close" hides the panel. Closing does not bring the link back.

The panel does not log the URL and does not write it into the page after it is closed.

### Mobile

At `max-width: 640px`, the same breakpoint as the header nav (ALE-205), the table becomes a stack of cards. Each card leads with the email, then Status, Role, Created, and Last sign-in as label and value lines, then the actions. The invite form and the show-once panel stay full width above the stack.

## 4. Nav

The Bet 004 nav stays: text tabs under the wordmark, Job market then Chat. Active tab is ink with a `--color-signal` underline.

- "Admin" is a third tab, after Chat, only when `app_metadata.role` is `admin`. Same active style. A member never sees the tab. Typing `/admin` still shows the not-allowed state.
- "Log out" replaces the lock button in the header actions. It is a text button, 44px tall (`--size-lock-button`), not a new icon. On `/chat` it sits to the right of New conversation.
- Login and set-password hide the nav and the header actions.

## 5. Copy

Strings ALE-216 should use as written.

| Place | String |
|---|---|
| Login heading | Sign in |
| Login body | Use the email and password from your invite. |
| Email label | Email |
| Password label | Password |
| Confirm label | Confirm password |
| Login button | Sign in |
| Login button, waiting | Signing in… |
| Set-password heading, invite | Choose a password |
| Set-password heading, reset | Reset your password |
| Password rule | At least 8 characters. |
| Set-password button | Save password |
| Set-password button, waiting | Saving… |
| Admin heading | People |
| Invite button | Create invite |
| Invite button, waiting | Creating… |
| Invite, empty email | Enter an email. |
| Invite, not an email | Enter a valid email. |
| Invite, already a user | That person already has an account. |
| Nav | Job market, Chat, Admin |
| Header action | Log out |
| Member `/admin` link | Job market |
| Copy button | Copy |
| Copy button, after | Copied |
| Show-once close | Close |
| Revoke confirm | Revoke access |
| Revoke dismiss | Cancel |
| Row actions | Revoke, Restore, Reset link |
| Badges | Active, Banned |
| Roles | Admin, Member |
| Empty last sign-in | Never |

The invite "already a user" sentence is for an admin. It may say the account exists. The public login form may not.

## Tokens and components

No new colors. No component library. Marketing tokens do not change.

Add one layout token in `frontend/src/styles/tokens.css` when ALE-216 builds the card:

| Token | Value | Use |
|---|---|---|
| `--max-width-auth` | `28rem` | Centered login and set-password card |

Local components, in `frontend/src/components/`, reusing the tokens above:

- `AuthCard` for the shared login and set-password shell.
- `ShowOnceLink` for the invite and reset panel.
- An inline confirm row for Revoke. Not `window.confirm`.

Noted on [ADR-0005](../adr/0005-visual-design-tokens-for-the-chat-ui.md).

## Out of scope

Building the screens (ALE-216). Motion, illustrations, and the marketing site. A forgot-password link on the login form. The admin sends the reset link.
