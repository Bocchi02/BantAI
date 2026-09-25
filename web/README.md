# Signalam web interface

The web client is a React JavaScript application styled with Tailwind CSS. Its
route-level screens are separated into `app/views/*.jsx`, while reusable UI is
kept in `app/components/*.jsx`. It uses the shared platform API for accounts,
dashboards, activity, device pairing, and aggregate administration.

The production dashboard is a standard Next.js Node server packaged by
`web/Dockerfile` and started by the root `docker-compose.yml`. Browser requests
use the same-origin `/api/v1` path; the server-side route privately proxies that
path to the platform API so session and CSRF cookies stay on the dashboard
origin.

For local development, copy `.env.example` to `.env.local`, set the HTTPS
`BANTAI_API_ORIGIN`, then run:

```powershell
npm install
npm run dev
```

For an explicitly local integration test, set
`BANTAI_API_ORIGIN=http://127.0.0.1:8080` and
`BANTAI_ALLOW_HTTP_LOOPBACK=true` in `.env.local`. Only loopback HTTP origins
are accepted by that development override; hosted and production APIs remain
HTTPS-only.

The frontend intentionally contains no database credentials, model files, LLM
keys, device credentials, or raw detector inputs.

Production Compose sets the exact private `http://platform:8080` origin and its
explicit allow flag. Other non-HTTPS, non-loopback origins are rejected. The
browser never receives the upstream origin as application configuration.

Build and start the production server directly with:

```powershell
npm ci
npm run build
npm run start
```

Set `NEXT_PUBLIC_SITE_URL` before the build. The container build receives it
from the root `BANTAI_WEB_ORIGIN` deployment value.
