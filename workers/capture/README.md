# Capture Worker (`tookratt-capture`)

Cloudflare Worker that accepts waitlist/contact JSON POSTs from the marketing landing page and relays them to `hello@tookratt.com` via Email Routing's `send_email` binding ([ADR-0016](../../docs/adr/0016-marketing-site-topology-and-capture.md) / ALE-177).

**No storage** — no KV, D1, or queue. Turnstile is the only abuse guard.

## Request contract (matches `marketing/src/forms.ts`)

`POST` `application/json`:

```json
{
  "type": "waitlist" | "contact",
  "email": "user@example.com",
  "name": "optional for waitlist, required for contact",
  "message": "required for contact",
  "turnstileToken": "…"
}
```

Success: `200` `{ "ok": true }`  
Error: `4xx/5xx` `{ "error": "…" }` (surfaced by the landing form)

CORS: `https://tookratt.com` and `https://www.tookratt.com` only.

## Local

```bash
cd workers/capture
npm install
cp .dev.vars.example .dev.vars   # TURNSTILE_SECRET_KEY for local wrangler
npm run typecheck
npm test
npx wrangler dev
```

## Deploy

```bash
npx wrangler deploy
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Optional custom domain (e.g. `capture.tookratt.com`) in the Cloudflare dashboard, then set marketing Pages build env:

- `VITE_CAPTURE_URL=https://capture.tookratt.com` (or the `*.workers.dev` URL)
- `VITE_TURNSTILE_SITE_KEY=…` (public site key; secret stays here)

## Email binding

`wrangler.toml` locks the recipient to `hello@tookratt.com`. Sender is bare `noreply@tookratt.com` (no Unicode display name — avoids RFC 2047 encoding surprises on receiving MTAs) with a `Reply-To` header set to the submitter (MIME via `mimetext` + `EmailMessage`). Ensure Email Routing is enabled for `tookratt.com` and `hello@` is a verified destination (Bet 001).
