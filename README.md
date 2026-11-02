# Musicly

A full-stack Spotify-style music app with a Deezer-powered catalog, 30-second previews, optional licensed full-track uploads, synced lyrics, playlists, listening analytics, and a custom staff dashboard.

![React](https://img.shields.io/badge/React-19-61dafb)
![Django](https://img.shields.io/badge/Django-6.1-092e20)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-18-336791)
![PWA](https://img.shields.io/badge/PWA-installable-1ed760)

## Features

- **Discover** - personalized greeting, recently played quick picks, charts, an editorial alt and indie spotlight, genre browsing, and live search across tracks, artists, albums, playlists, and genres.
- **Play** - persistent player with queue, shuffle, repeat, seek, volume, media-session integration, and a full-screen mobile player. Licensed local audio is used when available; otherwise the app falls back to Deezer's 30-second preview.
- **Lyrics** - on-demand synced or plain lyrics with active-line highlighting and auto-scroll. Lyrics are cached in PostgreSQL after the first lookup.
- **Collect** - like songs, create and edit playlists, reorder tracks, and follow artists.
- **Analytics** - listening totals, minutes, unique tracks, top artists, most-played tracks, and activity charts built with Tremor and Recharts.
- **Custom admin dashboard** - staff-only dashboard at `/admin` with Tremor KPI cards, catalog health, top tracks, recent uploads, listener analytics, track search and filters, inline preview playback, full-audio upload/removal, and lyrics editing.
- **Accounts** - JWT authentication, registration, profile editing, and avatar upload.
- **PWA and mobile** - installable app shell with offline caching, a desktop sidebar, mobile tab bar, and mobile mini player.

> **Audio licensing:** the app always has a Deezer 30-second preview as a fallback. Full-length playback only works for tracks where an admin has uploaded an audio file they own or are licensed to host. Do not upload copyrighted music without permission.

## Tech stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, Vite 8, TypeScript, React Router 7, Zustand |
| UI | Tailwind CSS v3, shadcn-style components on Radix UI, Lucide icons, Tremor 3, Recharts |
| Backend | Django 6.1, Django REST Framework, SimpleJWT, django-cors-headers, Whitenoise |
| Data | PostgreSQL 18, Django ORM |
| Catalog | Public Deezer API proxied and cached by Django |
| Local audio | Optional uploaded MP3/audio file per track, streamed with HTTP Range support |
| Lyrics | On-demand LRCLIB lookup plus admin-entered plain or LRC lyrics, cached in PostgreSQL |
| PWA | vite-plugin-pwa and Workbox |

## Project layout

```text
musicly/
  backend/
    accounts/            # registration, login, JWT, profile, avatar
    catalog/             # Deezer client, models, API views, demo seed
    musicly/             # Django settings and URL configuration
    manage.py
    requirements.txt
  frontend/
    public/              # PWA icons, favicon, robots.txt
    scripts/             # headless Chrome visual and flow checks
    src/
      components/        # layout, player, music, dialogs, UI components
      pages/             # home, search, album, artist, playlist, admin, dashboard
      store/             # auth, player, library, UI state (Zustand)
      lib/               # API client, types, utilities
    tailwind.config.js   # Tremor theme tokens and chart safelist
    vite.config.ts       # dev proxy and PWA manifest/workbox
```

## Quick start

### Prerequisites

- Node.js 20+ and pnpm
- Python 3.12+
- PostgreSQL 14+ (tested on PostgreSQL 18)

### 1. Database

Create a local database:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "CREATE DATABASE musicly;"
```

### 2. Backend

```powershell
cd backend

# From the repository root, the virtualenv lives at .venv
..\.venv\Scripts\python.exe -m pip install -r requirements.txt

Copy-Item .env.example .env
# Edit backend/.env and set your own PostgreSQL password and secret key.
```

`backend/.env` supports:

| Variable | Purpose |
| --- | --- |
| `DJANGO_SECRET_KEY` | Django signing secret. Use a long random value in production. |
| `DJANGO_DEBUG` | `True` for local development. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated host names. |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Local PostgreSQL connection values. |
| `POSTGRES_HOST` / `POSTGRES_PORT` | PostgreSQL host and port. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated frontend origins allowed to call the API. |
| `DEEZER_API` | Deezer API base URL. |
| `LRCLIB_API` | LRCLIB API base URL. |

Then run migrations, seed demo data, and start Django:

```powershell
..\.venv\Scripts\python.exe manage.py migrate
..\.venv\Scripts\python.exe manage.py seed_demo
..\.venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

### 3. Frontend

```powershell
cd frontend
pnpm install
Copy-Item .env.example .env   # optional; defaults are fine for local development
pnpm dev
```

Open **http://localhost:5173**. Vite proxies `/api`, `/media`, `/django-admin`, and `/static` to `http://127.0.0.1:8000`.

The frontend `.env` supports:

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL. Use `/api` with the Vite proxy or a same-origin deployment. Set an absolute URL for a split deployment. |

### Demo account

`seed_demo` creates a local demo listener:

```text
username: demo
password: Musicly123!
```

The command is idempotent. It caches the demo catalog, creates playlists, likes, followed artists, and 14 days of play history for the demo user.

## Staff dashboard

Create a staff account once:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py createsuperuser
```

Sign in with that account. Staff users are redirected to the custom dashboard at **http://localhost:5173/admin**.

The dashboard includes:

- **Overview** - Tremor KPI cards, catalog health, recent full-audio uploads, most-played tracks, and newest listeners.
- **Tracks** - search and filter the catalog, play a preview or full track from each row, upload or replace licensed full audio, remove audio, and edit plain or synced lyrics.
- **Listeners** - account list with playlists, likes, and play counts.

The stock Django admin remains available as an emergency model editor at **http://localhost:5173/django-admin/** (or `http://localhost:8000/django-admin/`).

Uploaded audio lives under `MEDIA_ROOT/tracks/` and is served through `GET /api/tracks/<id>/stream/`, which supports HTTP `Range` requests and works with the browser audio element without a JWT header. The serializer returns `has_full_audio`, `audio_source`, and `stream_url`, and the UI labels each player as **Full track** or **Preview 30s**.

## Production build

```powershell
cd frontend
pnpm build        # emits dist/ including sw.js and manifest.webmanifest
pnpm preview      # local check on http://localhost:4173
```

Backend production checklist:

```powershell
cd backend
$env:DJANGO_DEBUG="False"
$env:DJANGO_ALLOWED_HOSTS="your-domain.com"
..\.venv\Scripts\python.exe manage.py collectstatic --noinput
..\.venv\Scripts\python.exe manage.py migrate
```

Serve `frontend/dist` from your web server and reverse-proxy `/api`, `/media`, `/django-admin`, and `/static` to Django, or set `VITE_API_URL` at build time. Keep the SPA fallback in front of `/admin` so the custom dashboard loads. The PWA requires HTTPS outside `localhost`; installation and the service worker are disabled on plain HTTP for non-local hosts.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register/` | Create account |
| `POST` | `/api/auth/login/` | Obtain JWT access and refresh tokens |
| `POST` | `/api/auth/refresh/` | Refresh an access token |
| `GET/PATCH` | `/api/auth/me/` | Current user or update profile |
| `POST/DELETE` | `/api/auth/admin-session/` | Open or close the Django admin session bridge |
| `GET` | `/api/home/` | Home feed (personalized when authenticated) |
| `GET` | `/api/search/?q=&type=` | Catalog search |
| `GET` | `/api/tracks/<id>/` | Track detail |
| `GET` | `/api/tracks/<id>/stream/` | Stream locally uploaded full audio (supports Range) |
| `GET` | `/api/tracks/<id>/preview/` | Redirect to a fresh Deezer preview when the cached URL has expired |
| `GET` | `/api/tracks/<id>/lyrics/` | Cached or LRCLIB lyrics |
| `GET` | `/api/albums/<id>/` | Album with tracks |
| `GET` | `/api/artists/<id>/` | Artist, top tracks, and albums |
| `GET` | `/api/genres/` | Genre grid |
| `GET` | `/api/genres/<id>/` | Genre artists |
| `GET` | `/api/playlists/dz-<id>/` | Deezer editorial playlist proxy |
| `GET/POST` | `/api/playlists/` | List or create local playlists |
| `GET/PATCH/DELETE` | `/api/playlists/<id>/` | Playlist detail |
| `POST` | `/api/playlists/<id>/tracks/` | Add a track |
| `DELETE` | `/api/playlists/<id>/tracks/<track_id>/` | Remove a track |
| `PATCH` | `/api/playlists/<id>/tracks/<track_id>/` | Reorder a track |
| `GET/POST` | `/api/likes/` | List or like tracks |
| `DELETE` | `/api/likes/<track_id>/` | Unlike a track |
| `GET/POST` | `/api/history/` | Listening history |
| `GET/POST` | `/api/follows/` | Followed artists |
| `DELETE` | `/api/follows/<artist_id>/` | Unfollow an artist |
| `GET` | `/api/library/` | Playlists, likes, follows, and recent activity |
| `GET/PATCH` | `/api/profile/` | Profile summary |
| `GET` | `/api/insights/` | Dashboard aggregates |

Staff-only dashboard endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/overview/` | KPI and activity summary |
| `GET` | `/api/admin/tracks/` | Search and filter catalog tracks |
| `GET/PATCH` | `/api/admin/tracks/<id>/` | Read or update a track, including lyrics and audio uploads |
| `DELETE` | `/api/admin/tracks/<id>/audio/` | Remove uploaded full audio |
| `GET` | `/api/admin/users/` | Listener list with activity counts |

All user-data endpoints require `Authorization: Bearer <access>`. Catalog, lyrics, preview redirects, and local-audio stream endpoints are public so the browser audio element and guest browsing work without a token. Saved tracks (likes, playlists, history) use the preview redirect endpoint because Deezer signs preview URLs with a short expiry.

## Quality checks

The repository ships headless-Chrome scripts (Chrome must be installed):

```powershell
cd frontend
$env:ACCESS = "<jwt-access>"
$env:REFRESH = "<jwt-refresh>"
node scripts/visual-check.mjs   # desktop and mobile screenshots in %TEMP%\opencode\shots
node scripts/flows-check.mjs    # playback, lyrics, like, playlist CRUD, follow, search
```

Type-check, lint, and build:

```powershell
cd frontend
pnpm exec tsc -b
pnpm lint
pnpm build
```

Backend checks:

```powershell
cd backend
..\.venv\Scripts\python.exe manage.py check
..\.venv\Scripts\python.exe manage.py makemigrations --check --dry-run
```

## Security notes

- `.env` files, private keys, local audio uploads, build output, and virtual environments are ignored by Git.
- Start from `backend/.env.example` and `frontend/.env.example`; never commit real credentials.
- Use a strong, unique `DJANGO_SECRET_KEY` in production.
- Keep `DJANGO_DEBUG=False` and restrict `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` in production.
- Only upload audio you own or are licensed to host.

## Troubleshooting

- **Blank or stale styles** - this project requires **Tailwind CSS v3** because Tremor 3 does not support v4. If a package manager rewrites `tailwindcss`, reinstall v3 (`pnpm add -D tailwindcss@3.4.19`) and restart Vite.
- **Charts render gray** - verify `tailwind.config.js` still contains the Tremor theme tokens and the emerald safelist, then restart the dev server.
- **API errors or timeouts** - Deezer occasionally drops TLS connections. The client retries; refresh the page or retry the request.
- **CORS errors** - add your frontend origin to `CORS_ALLOWED_ORIGINS` in `backend/.env`.
- **PWA not installable** - serve over HTTPS or `localhost`, run a production build, and confirm `dist/sw.js` is served with a JavaScript MIME type.
- **Lyrics unavailable** - LRCLIB may not have the track or the exact-match endpoint can be temporarily unavailable; the app falls back to search. Check the admin row and clear `lyrics checked at` to retry.

## License

Released under the [MIT License](LICENSE).

---

Built as a full-stack portfolio project. Music metadata and previews courtesy of the [Deezer API](https://developers.deezer.com/). Lyrics via [LRCLIB](https://lrclib.net).
