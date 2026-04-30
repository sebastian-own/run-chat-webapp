# Foundry Chat Webapp

A minimal static HTML/JS chat client for an Azure AI Foundry model deployment using the **Responses API**.

## Files
- `index.html` – UI
- `styles.css` – styling
- `app.js` – calls the Foundry endpoint directly from the browser

## Run

Just open `index.html` in a browser, **or** serve it locally to avoid any CORS quirks:

```powershell
cd C:\Users\shalbwirth\foundry-chat-webapp
python -m http.server 8080
# then visit http://localhost:8080
```

## Configure

On first load, click the ⚙️ button and fill in:
- **Endpoint URL** – pre-filled with your Foundry responses endpoint
- **Model / Deployment name** – pre-filled with `run-chat`
- **API Key** – your Foundry/Azure AI key (stored in `localStorage` only)
- **System prompt** – optional

## ⚠️ Security note

Because this is a pure static app, the API key lives in the browser. That's fine for local/personal use, but **don't deploy this to a public website with a key embedded** — anyone could read it via DevTools. For production, put a small backend in front (Node/Express, FastAPI, Azure Functions) that holds the key as a server-side secret and proxies requests.

## CORS

If your Foundry resource doesn't allow browser-origin requests, you'll see a CORS error in the console. Either:
1. Enable CORS on the Azure AI resource (Networking → CORS), or
2. Add a small proxy backend.

## Features
- Multi-turn conversation with history
- Optional system prompt
- Settings persisted in localStorage
- Clear conversation, Enter-to-send / Shift+Enter for newline
