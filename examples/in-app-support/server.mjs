/**
 * A minimal "host app" for FrontLit in-app support
 * (frontlit/docs/developers/in-app-support.md, docs/embedded-support.md).
 *
 * - GET  /                     a fake dashboard with a Contact support button
 * - POST /api/support-session  this app's backend route: mints a FrontLit
 *                              support session with the API key, server side
 *
 * No dependencies; run with `node server.mjs`. Configure with env vars, see
 * README.md.
 */
import http from "node:http";

const env = (name, fallback) => process.env[name] || fallback;
const API_KEY = env("FRONTLIT_API_KEY", "");
const TEAM_ID = env("FRONTLIT_TEAM_ID", "");
const API_URL = env("FRONTLIT_API_URL", "http://localhost:4000").replace(/\/+$/, "");
const EMBED_URL = env("FRONTLIT_EMBED_URL", "http://embed.localhost:3002").replace(
  /\/+$/,
  "",
);
const PORT = Number(env("PORT", "3299"));

if (!API_KEY || !TEAM_ID) {
  console.error(
    "Set FRONTLIT_API_KEY (a 'Support sessions only' key) and FRONTLIT_TEAM_ID. See README.md.",
  );
  process.exit(1);
}

// The signed-in user, as your app's session would know them. Editable on the
// page so you can try new and returning users and different accounts.
const defaults = {
  name: "Sam Lee",
  email: "sam@school.example",
  externalId: "user_31c",
  accountId: "school_42",
  accountName: "Acme Academy",
  accountUrl: "https://acme.example.com",
  page: "/dashboard/media",
  error: "Image upload failed (413)",
  message: "My image upload failed",
};

const field = (key, label) =>
  `<label>${label}<input name="${key}" value="${defaults[key]}"></label>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>In-app support example</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 0; padding: 24px; max-width: 760px; }
  form { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 16px; margin: 16px 0; }
  label { display: grid; gap: 2px; font-size: 13px; color: #555; }
  input { font: inherit; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }
  .error { color: #b42318; }
  button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 1px solid #222; background: #222; color: #fff; cursor: pointer; }
  #status { margin-left: 8px; color: #555; }
</style>
</head>
<body>
<h1>Demo dashboard</h1>
<p>Pretend this user is signed in to your product. Their details go to FrontLit
from this app's server, never from the browser.</p>
<form id="user">
  ${field("name", "Name")}
  ${field("email", "Email")}
  ${field("externalId", "User ID in your app")}
  ${field("accountId", "Account ID")}
  ${field("accountName", "Account name")}
  ${field("accountUrl", "Account URL")}
  ${field("page", "Context: page")}
  ${field("error", "Context: error")}
  ${field("message", "Prefilled message")}
</form>
<p class="error">${defaults.error}</p>
<button id="help" type="button">Contact support</button><span id="status"></span>

<script>
  window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
  FrontLit.push("init", { teamId: ${JSON.stringify(TEAM_ID)}, launcher: false });

  document.getElementById("help").addEventListener("click", async () => {
    const status = document.getElementById("status");
    status.textContent = "Starting a session…";
    const user = Object.fromEntries(new FormData(document.getElementById("user")));
    const response = await fetch("/api/support-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(user),
    }).catch(() => null);
    if (!response || !response.ok) {
      status.textContent = "Could not start a session: " + (response ? await response.text() : "network error");
      return;
    }
    const { token } = await response.json();
    status.textContent = "";
    FrontLit.open({ token });
  });
</script>
<script async src="${EMBED_URL}/chat.js"></script>
</body>
</html>`;

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

/** Your backend route: who is signed in comes from your session, not the
 * request. Here the form stands in for that session. */
async function mintSession(user) {
  const response = await fetch(`${API_URL}/support-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-frontlit-apikey": API_KEY },
    body: JSON.stringify({
      contact: {
        email: user.email,
        name: user.name || undefined,
        externalId: user.externalId || undefined,
      },
      account: user.accountId
        ? {
            id: user.accountId,
            name: user.accountName || undefined,
            url: user.accountUrl || undefined,
          }
        : undefined,
      context: {
        page: user.page || undefined,
        error: user.error || undefined,
        requestId: `req_${Date.now()}`,
      },
      message: user.message || undefined,
    }),
  });
  return { status: response.status, body: await response.text() };
}

http
  .createServer(async (request, response) => {
    try {
      if (request.method === "POST" && request.url === "/api/support-session") {
        const minted = await mintSession(await readJson(request));
        response.writeHead(minted.status, { "content-type": "application/json" });
        response.end(minted.body);
        return;
      }
      if (
        request.method === "GET" &&
        (request.url === "/" || request.url?.startsWith("/?"))
      ) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(page);
        return;
      }
      response.writeHead(404).end();
    } catch (error) {
      response.writeHead(502, { "content-type": "text/plain" });
      response.end(String(error));
    }
  })
  .listen(PORT, () => {
    console.warn(`In-app support example on http://localhost:${PORT}`);
  });
