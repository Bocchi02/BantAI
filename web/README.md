# Signalam web interface

The web client is a React JavaScript application styled with Tailwind CSS. Its
route-level screens are separated into `app/views/*.jsx`, while reusable UI is
kept in `app/components/*.jsx`. It uses the shared platform API for accounts,
dashboards, activity, device pairing, and aggregate administration.

Copy `.env.example` to `.env.local`, set the HTTPS `BANTAI_API_ORIGIN`, then run:

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

Browser API requests use the same-origin `/api/v1` path. The hosting worker
proxies that path to `BANTAI_API_ORIGIN`, which keeps the web session and CSRF
cookies on the dashboard origin. The browser never receives the upstream
origin as application configuration.
