# Musicly frontend

React 19 + Vite + TypeScript client for Musicly. See the [root README](../README.md) for the full-stack setup, API overview and PWA notes.

## Commands

```powershell
pnpm install
pnpm dev          # http://localhost:5173, proxies /api and /media to Django on :8000
pnpm exec tsc -b  # type-check
pnpm build        # production build in dist/ (includes sw.js + manifest.webmanifest)
pnpm preview      # serve the production build on :4173
pnpm lint         # oxlint
```

## Stack notes

- Tailwind CSS is pinned to **v3** for `@tremor/react@3` compatibility. Do not upgrade to v4.
- Tremor color tokens and the emerald chart safelist live in `tailwind.config.js`; charts depend on them.
- `src/lib/api.ts` uses `VITE_API_URL` when set, otherwise the relative `/api` path.
- `scripts/visual-check.mjs` and `scripts/flows-check.mjs` drive headless Chrome via the DevTools protocol for screenshots and end-to-end smoke tests.
