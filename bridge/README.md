# COROS MCP bridge

A tiny Node/Express server that holds a COROS OAuth token and proxies MCP
requests from your chat app (or Foundry) to the upstream COROS MCP server.

## Why this exists

The COROS MCP server requires per-user OAuth. The Foundry Responses API's
hosted MCP tool can't perform an interactive OAuth flow on its own. This
bridge does the OAuth dance **once** in a browser, caches the refresh
token, and exposes a simpler endpoint that authenticates via a static
bearer token of your choice.

## Setup

```powershell
cd bridge
copy .env.example .env
# Edit .env: set BRIDGE_TOKEN to a long random string.
# (Optional) re-register the OAuth client if PUBLIC_URL changes:
#   node register.js https://your-public-url
npm install
npm start
```

Then in a browser open `http://localhost:8787/auth/login`, sign in to COROS,
and approve. Tokens are written to `tokens.json` (gitignored).

## Wire it into the webapp

In the webapp Settings → COROS MCP server:

- **Server URL**: `http://localhost:8787/mcp` (or your public bridge URL)
- **Authorization header**: `Bearer <BRIDGE_TOKEN>`
- Enable MCP tool ✅

## Exposing to Foundry

Foundry's hosted MCP tool needs to reach the bridge over the internet.
Easiest options:

- **ngrok** (dev): `ngrok http 8787` → use the HTTPS URL as `PUBLIC_URL` and
  re-run `node register.js https://<your>.ngrok.app` so the OAuth
  `redirect_uri` matches, then `npm start` again.
- **Azure App Service / Container Apps / Functions**: deploy this folder,
  set the same env vars, and use the public hostname.

## Endpoints

- `GET /` — status page
- `GET /health` — JSON status
- `GET /auth/login` → `GET /auth/callback` — OAuth flow
- `POST /mcp` — MCP proxy (requires `Authorization: Bearer <BRIDGE_TOKEN>`)
