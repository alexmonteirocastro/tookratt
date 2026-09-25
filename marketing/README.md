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
| `TOOKRATT_API_KEYS` | Build-time only. `prebuild` uses the first key to snapshot `GET /jobs/stats` into `public/market-stats.json`. Never prefix with `VITE_`. That would ship the key to the browser. Unset or a failed fetch leaves the file out and the build still succeeds. |

## Market stats (ALE-209)

`npm run build` fetches aggregate counts for `DK`, `SE`, `NO`, `FI`, `IS`, and `EU` and writes `public/market-stats.json`. Vite copies it to `/market-stats.json`. The file is gitignored. `public/_headers` sets `Cache-Control: max-age=3600`.

tookratt.com gets the numbers two ways, and neither puts a key in the browser:

- A marketing git deploy runs the same prebuild. Set `TOOKRATT_API_KEYS` as a **Production** environment variable on the `tookratt-marketing` Pages project (the GitHub Actions secret is not visible to Pages).
- The daily ingestion workflow POSTs `CLOUDFLARE_PAGES_DEPLOY_HOOK` after a successful sync, which rebuilds `main`. Create that hook in the Pages project (branch `main`) and store the URL as a GitHub Actions secret. A failed hook does not fail the Qdrant sync.

## Forms

Both forms include Cloudflare Turnstile when `VITE_CAPTURE_URL` is set (script loaded on demand). Until the Worker (ALE-177) is live, leave `VITE_CAPTURE_URL` unset and submit opens the visitor's mail client — no Turnstile script is fetched in that mode.
