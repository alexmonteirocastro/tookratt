# Töökratt concept preview

Standalone conversational stub for TechBBQ (ALE-196). Separate from `frontend/` — same visual language, no shared package imports.

Persistent banner: **Concept Preview — not live functionality**.

## Local development

```bash
cd concept
cp .env.example .env.local   # optional; committed .env.development already enables snapshot
npm install
npm run dev
```

Opens on [http://localhost:5174](http://localhost:5174). The conversation runs on a baked JSON snapshot (`VITE_USE_SNAPSHOT=true`) by default — no API and no key.

## Snapshot vs live

| Mode | How |
| --- | --- |
| Snapshot (default, booth-safe) | `VITE_USE_SNAPSHOT=true` in `.env.development` / `.env.production`. Production never ships a key. |
| Live `/jobs/stats` + `/jobs/search` | Gitignored `.env.local` with `VITE_USE_SNAPSHOT=false` and `VITE_DEMO_API_KEY`. The same key also authorizes `POST /chat`, so it must not land in the production bundle. Network/auth failures fall back to the snapshot. |

The CV file is never read, uploaded, or stored — choosing any file only advances the scripted turns.

## Build

```bash
npm run build
npm run preview
```

Cloudflare Pages (ALE-195): root directory `concept`, build `npm run build`, output `dist`.
