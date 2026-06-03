// COROS MCP bridge — exposes /mcp speaking MCP HTTP transport,
// forwards to the upstream COROS MCP server using a cached OAuth access token.
//
// One-time login: open http://<PUBLIC_URL>/auth/login in your browser.
// Then point Foundry at <PUBLIC_URL>/mcp with Authorization: Bearer <BRIDGE_TOKEN>.

import express from "express";
import { request } from "undici";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import "dotenv/config";

const PORT = parseInt(process.env.PORT || "8787", 10);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN;
const COROS_BASE = (process.env.COROS_BASE || "https://mcpeu.coros.com").replace(/\/$/, "");
const COROS_CLIENT_ID = process.env.COROS_CLIENT_ID;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const REDIRECT_URI = `${PUBLIC_URL}/auth/callback`;
const TOKENS_FILE = new URL("./tokens.json", import.meta.url);

if (!BRIDGE_TOKEN) { console.error("Missing BRIDGE_TOKEN in .env"); process.exit(1); }
if (!COROS_CLIENT_ID) { console.error("Missing COROS_CLIENT_ID in .env (run `node register.js` first)"); process.exit(1); }

// ---------- token store ----------
let tokens = null; // { access_token, refresh_token, expires_at, ... }
let pkce = null;   // { verifier, state } for in-flight authorize request

async function loadTokens() {
  try { tokens = JSON.parse(await readFile(TOKENS_FILE, "utf8")); }
  catch { tokens = null; }
}
async function saveTokens(t) {
  tokens = t;
  await writeFile(TOKENS_FILE, JSON.stringify(t, null, 2));
}

function b64url(buf) { return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function makePkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

async function refreshIfNeeded() {
  if (!tokens) return null;
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && tokens.expires_at - 30 > now) return tokens.access_token;
  if (!tokens.refresh_token) return tokens.access_token; // can't refresh

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: COROS_CLIENT_ID
  });
  const { statusCode, body } = await request(`${COROS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const text = await body.text();
  if (statusCode !== 200) {
    console.error("Refresh failed:", statusCode, text);
    return tokens.access_token;
  }
  const data = JSON.parse(text);
  const newTokens = {
    ...tokens,
    ...data,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600)
  };
  await saveTokens(newTokens);
  return newTokens.access_token;
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req, res) => {
  const status = tokens ? "✅ COROS tokens loaded" : "❌ Not authorized — visit /auth/login";
  res.type("html").send(`<h2>COROS MCP bridge</h2>
    <p>${status}</p>
    <ul>
      <li><a href="/auth/login">/auth/login</a> — sign in to COROS</li>
      <li><code>/mcp</code> — MCP endpoint (POST, requires bridge token)</li>
      <li><a href="/health">/health</a></li>
    </ul>
    <p>Configured upstream: <code>${COROS_BASE}/mcp</code></p>
    <p>Redirect URI: <code>${REDIRECT_URI}</code></p>`);
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    authorized: !!tokens,
    expires_at: tokens?.expires_at,
    upstream: `${COROS_BASE}/mcp`
  });
});

// ---------- OAuth ----------
app.get("/auth/login", (_req, res) => {
  pkce = { ...makePkce(), state: b64url(randomBytes(16)) };
  const url = new URL(`${COROS_BASE}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", COROS_CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", "openid mcp.tools offline_access");
  url.searchParams.set("state", pkce.state);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  console.log("[auth] redirecting user to", url.toString());
  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    console.error("[auth] error from COROS:", error, error_description);
    return res.status(400).type("html").send(`<h2>OAuth error</h2><pre>${error}: ${error_description || ""}</pre>`);
  }
  if (!pkce || state !== pkce.state) {
    return res.status(400).send("State mismatch or no in-flight login. Restart /auth/login.");
  }
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: String(code),
    redirect_uri: REDIRECT_URI,
    client_id: COROS_CLIENT_ID,
    code_verifier: pkce.verifier
  });
  const { statusCode, body } = await request(`${COROS_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  const text = await body.text();
  if (statusCode !== 200) {
    console.error("[auth] token exchange failed:", statusCode, text);
    return res.status(502).type("html").send(`<h2>Token exchange failed</h2><pre>${statusCode}\n${text}</pre>`);
  }
  const data = JSON.parse(text);
  await saveTokens({ ...data, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) });
  pkce = null;
  console.log("[auth] tokens stored. scope:", data.scope, "expires_in:", data.expires_in);
  res.type("html").send("<h2>✅ Logged in to COROS.</h2><p>You can close this tab.</p>");
});

// ---------- MCP proxy ----------
function requireBridgeAuth(req, res, next) {
  const got = req.headers.authorization || "";
  if (got !== `Bearer ${BRIDGE_TOKEN}`) {
    return res.status(401).json({ error: "unauthorized_bridge" });
  }
  next();
}

app.post("/mcp", requireBridgeAuth, async (req, res) => {
  const accessToken = await refreshIfNeeded();
  if (!accessToken) {
    return res.status(503).json({ error: "bridge_not_authorized", message: "Visit /auth/login first." });
  }

  // Forward the JSON-RPC body to COROS with the user's access token.
  const headers = {
    "content-type": "application/json",
    "accept": "application/json, text/event-stream",
    "authorization": `Bearer ${accessToken}`
  };
  // Forward MCP session header if the client sends one.
  if (req.headers["mcp-session-id"]) headers["mcp-session-id"] = req.headers["mcp-session-id"];

  let upstream;
  try {
    upstream = await request(`${COROS_BASE}/mcp`, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body)
    });
  } catch (e) {
    console.error("[mcp] upstream fetch failed:", e);
    return res.status(502).json({ error: "upstream_unreachable", detail: String(e) });
  }

  // Mirror status, content-type, and session header.
  res.status(upstream.statusCode);
  const ct = upstream.headers["content-type"];
  if (ct) res.setHeader("content-type", Array.isArray(ct) ? ct[0] : ct);
  const sess = upstream.headers["mcp-session-id"];
  if (sess) res.setHeader("mcp-session-id", Array.isArray(sess) ? sess[0] : sess);

  // Stream the body through (handles both JSON and SSE).
  upstream.body.pipe(res);
});

// ---------- start ----------
await loadTokens();
app.listen(PORT, () => {
  console.log(`COROS MCP bridge listening on http://localhost:${PORT}`);
  console.log(`Public URL (for OAuth redirect): ${PUBLIC_URL}`);
  console.log(`Upstream: ${COROS_BASE}/mcp`);
  if (!tokens) console.log("Not yet authorized — open " + PUBLIC_URL + "/auth/login in your browser.");
});
