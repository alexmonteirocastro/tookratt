# Töökratt marketing site

Static landing page for the apex domain (`tookratt.com` / `www`), separate from the chat SPA in `frontend/` ([ADR-0016](../docs/adr/0016-marketing-site-topology-and-capture.md)).

## Local development

```bash
cd marketing
cp .env.example .env   # optional
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

Cloudflare Pages: set **Root directory** to `marketing`, build command `npm run build`, output `dist`.

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_APP_URL` | Chat app URL (default `https://app.tookratt.com`) |
| `VITE_CAPTURE_URL` | ALE-177 Worker endpoint for waitlist/contact JSON POSTs. Empty → `mailto:hello@tookratt.com` fallback |
| `VITE_TURNSTILE_SITE_KEY` | Public Turnstile site key (secret stays in the Worker) |

## Forms

Both forms include Cloudflare Turnstile when `VITE_CAPTURE_URL` is set (script loaded on demand). Until the Worker (ALE-177) is live, leave `VITE_CAPTURE_URL` unset and submit opens the visitor's mail client — no Turnstile script is fetched in that mode.
