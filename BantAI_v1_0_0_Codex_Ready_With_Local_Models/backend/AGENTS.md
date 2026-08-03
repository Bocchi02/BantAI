# Backend-Specific Codex Instructions

These instructions apply to all files under `backend/`.

## Framework and runtime

- FastAPI local backend
- Default bind address: `127.0.0.1`
- Default port: `8000`
- Model files are supplied through environment variables:
  - `BANTAI_MODEL_DIR`
  - `BANTAI_RF_MODEL_PATH`

## Frozen endpoints and behavior

- `GET /health`
- `POST /analyze-url`
- `POST /analyze-email`

`/analyze-url` must accept only an HTTP/HTTPS address-bar URL.

`/analyze-email` must reject providers other than Gmail, Outlook, and Yahoo.

## Model invariants

- Email threshold: `0.05`
- Email max length: `256`
- URL threshold: `0.6800401751682739`

The backend must fail loudly when the saved RF threshold does not match the
frozen threshold.

## Privacy

- Do not log email bodies.
- Do not add readable sender logging without explicit user approval.
- Do not transmit model input to third-party services.
- Do not add cloud inference as a fallback.
- Keep the backend local-only unless explicitly authorized.

## Testing

Syntax and invariant checks must run without loading model weights:

```powershell
python ..\scripts\verify_project.py
```

Full API inference tests require the user's local frozen model files.
