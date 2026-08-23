# BantAI web interface

The web client is a React JavaScript application styled with Tailwind CSS. Its
route-level screens are separated into `app/views/*.jsx`, while reusable UI is
kept in `app/components/*.jsx`. It uses the shared platform API for accounts,
dashboards, activity, device pairing, and aggregate administration.

Copy `.env.example` to `.env.local`, set the shared API URL, then run:

```powershell
npm install
npm run dev
```

The frontend intentionally contains no database credentials, model files, LLM
keys, device credentials, or raw detector inputs.
