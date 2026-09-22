# Pair the extension with local Docker

With `docker-compose.local.yml` running, configure the extension:

```powershell
python scripts/configure_remote_endpoint.py http://127.0.0.1:8080/api/v1 --allow-http-loopback
```

Reload Signalam on `edge://extensions` or `chrome://extensions`. Generate a fresh
code from the local dashboard's Devices page, then enter it in the extension.
Pairing uses the authenticated platform API on port 8080.

For deployment, run the same script with the public HTTPS API URL and omit
`--allow-http-loopback`. This removes the local HTTP permission and disables the
development option. Reload or repackage the extension afterward.
