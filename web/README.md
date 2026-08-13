# BantAI web interface

The web client is a React/TypeScript application styled with Tailwind CSS. It
uses the shared platform API for verified accounts, dashboards, activity,
device pairing, and aggregate administration.

Copy `.env.example` to `.env.local`, set the shared API URL, then run:

```powershell
npm install
npm run dev
```

The frontend intentionally contains no database credentials, model files, LLM
keys, device credentials, or raw detector inputs.

