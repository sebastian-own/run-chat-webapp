// One-off: dynamically register a new OAuth client with the COROS MCP server.
// Usage: node register.js [PUBLIC_URL]
import { request } from "undici";
import "dotenv/config";

const base = process.env.COROS_BASE || "https://mcpeu.coros.com";
const publicUrl = (process.argv[2] || process.env.PUBLIC_URL || "http://localhost:8787").replace(/\/$/, "");
const redirectUri = `${publicUrl}/auth/callback`;

const body = {
  client_name: "run-chat-webapp bridge",
  redirect_uris: [redirectUri],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none",
  scope: "openid mcp.tools offline_access"
};

const { statusCode, body: resBody } = await request(`${base}/connect/register`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});
const text = await resBody.text();
console.log("status:", statusCode);
console.log(text);
