/**
 * A "host app" for FrontLit in-app support
 * (frontlit/docs/developers/in-app-support.md, docs/embedded-support.md).
 *
 * - GET  /                     a fake SaaS dashboard ("Acme Academy") with
 *                              Help and Contact support buttons, preset users
 *                              and a "Trigger random error" button
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

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme Academy · in-app support example</title>
<style>
  :root { --ink: #1d2433; --muted: #667085; --line: #e4e7ec; --bg: #f7f8fa; --brand: #5b4ee6; --danger: #b42318; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: var(--ink); background: var(--bg); }
  button, input, select { font: inherit; }
  button { cursor: pointer; }
  .app { display: grid; grid-template-columns: 232px 1fr; min-height: 100vh; }
  aside { background: #fff; border-right: 1px solid var(--line); padding: 20px 14px; display: flex; flex-direction: column; gap: 18px; }
  .logo { font-weight: 700; font-size: 18px; padding: 0 8px; }
  .logo span { color: var(--brand); }
  nav { display: grid; gap: 2px; }
  nav a { padding: 8px 10px; border-radius: 8px; color: var(--ink); text-decoration: none; }
  nav a[aria-current="page"] { background: #efedff; color: var(--brand); font-weight: 600; }
  .need-help { margin-top: auto; border: 1px solid var(--line); border-radius: 12px; padding: 14px; font-size: 13px; color: var(--muted); }
  .need-help strong { display: block; color: var(--ink); font-size: 14px; }
  header { display: flex; align-items: center; gap: 12px; padding: 12px 24px; background: #fff; border-bottom: 1px solid var(--line); }
  header .crumb { color: var(--muted); }
  header .spacer { flex: 1; }
  main { padding: 24px; max-width: 960px; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  .sub { margin: 0 0 20px; color: var(--muted); }
  .btn { border: 1px solid var(--line); background: #fff; color: var(--ink); border-radius: 8px; padding: 7px 12px; }
  .btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .btn.danger { color: var(--danger); border-color: #fecdca; }
  .help { position: relative; }
  .badge { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--danger); color: #fff; font-size: 11px; line-height: 18px; text-align: center; }
  .banner { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; border: 1px solid #fecdca; background: #fef3f2; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; }
  .banner strong { color: var(--danger); }
  .banner code { font-size: 12px; background: #fff; border-radius: 4px; padding: 1px 5px; }
  .banner .grow { flex: 1; min-width: 220px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .muted { color: var(--muted); font-size: 13px; }
  details summary { cursor: pointer; font-weight: 600; }
  form { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px 14px; margin-top: 12px; }
  label { display: grid; gap: 2px; font-size: 12px; color: var(--muted); }
  input, select { padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); }
  #status { color: var(--muted); font-size: 13px; }
  @media (max-width: 720px) {
    .app { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
    aside { flex-direction: row; flex-wrap: wrap; align-items: center; padding: 10px 14px; border-right: 0; border-bottom: 1px solid var(--line); }
    nav { display: flex; overflow-x: auto; }
    .need-help { display: none; }
    header { padding: 10px 14px; }
    header .crumb { display: none; }
    main { padding: 16px; }
    input, select { font-size: 16px; }
  }
</style>
</head>
<body>
<div class="app">
  <aside>
    <div class="logo">acme<span>academy</span></div>
    <nav id="nav"></nav>
    <div class="need-help">
      <strong>Need a hand?</strong>
      Our team is here when you need us.
      <p><button class="btn" data-action="help" type="button">Contact support</button></p>
    </div>
  </aside>
  <div>
    <header>
      <span class="crumb">Workspace / <span id="crumb"></span></span>
      <span class="spacer"></span>
      <button class="btn help" data-action="help" type="button">Help<span class="badge" id="unread" hidden></span></button>
      <select id="user-select" aria-label="Signed-in user"></select>
    </header>
    <main>
      <div id="banner" class="banner" hidden>
        <div class="grow">
          <strong id="banner-error"></strong><br>
          <code id="banner-page"></code> · Request ID <code id="banner-request"></code>
        </div>
        <button class="btn danger" id="contact-error" type="button">Contact support</button>
        <button class="btn" id="dismiss" type="button" aria-label="Dismiss">✕</button>
      </div>
      <h1 id="title"></h1>
      <p class="sub" id="subtitle"></p>
      <div class="card row">
        <button class="btn primary" id="trigger" type="button">Trigger random error</button>
        <span class="muted">Shows an error, as your product would. Its Contact support button sends the error to FrontLit.</span>
      </div>
      <div class="card">
        <details>
          <summary>Signed-in user and test settings</summary>
          <p class="muted">In a real product these come from your app's session on the server. Here the browser sends them to this example's server, which calls FrontLit with the API key.</p>
          <form id="user">
            <label>Name<input name="name"></label>
            <label>Email<input name="email" type="email"></label>
            <label>User ID in your app<input name="externalId"></label>
            <label>Account ID<input name="accountId"></label>
            <label>Account name<input name="accountName"></label>
            <label>Account URL<input name="accountUrl"></label>
          </form>
          <p class="row">
            <label style="display:flex;gap:6px;align-items:center;font-size:14px;color:inherit">
              <input type="checkbox" id="bubble"> Show FrontLit's chat bubble too (reloads)
            </label>
          </p>
        </details>
      </div>
      <p id="status" role="status"></p>
    </main>
  </div>
</div>

<script>
  const PAGES = {
    dashboard: { label: "Dashboard", path: "/dashboard", subtitle: "Your school at a glance." },
    media: { label: "Media", path: "/dashboard/media", subtitle: "Images and videos for your courses." },
    billing: { label: "Billing", path: "/billing", subtitle: "Plan, invoices and payment method." },
    settings: { label: "Settings", path: "/settings", subtitle: "School profile, preferences and team access." },
  };
  // Errors a real product might surface; FrontLit gets the text as context.error.
  const ERRORS = [
    { page: "media", error: "Image upload failed: 413 Payload Too Large", message: "I can't upload an image." },
    { page: "billing", error: "Payment declined: card_expired", message: "My payment didn't go through." },
    { page: "settings", error: "Failed to save settings: 500 Internal Server Error", message: "I couldn't save my settings." },
    { page: "media", error: "Video processing timed out after 120s", message: "My video is stuck processing." },
    { page: "dashboard", error: "Session expired: 401 Unauthorized", message: "I keep getting logged out." },
  ];
  const USERS = [
    { name: "Maya Chen", email: "maya@acme.example", externalId: "usr_maya", accountId: "school_acme", accountName: "Acme Academy", accountUrl: "https://acme.example.com" },
    { name: "Sam Lee", email: "sam@school.example", externalId: "usr_sam", accountId: "school_42", accountName: "Riverside School", accountUrl: "https://riverside.example.com" },
    { name: "Priya Patel", email: "priya@tutors.example", externalId: "usr_priya", accountId: "school_7", accountName: "Patel Tutors", accountUrl: "https://tutors.example.com" },
  ];

  const $ = (id) => document.getElementById(id);
  const form = $("user");
  const bubble = new URLSearchParams(location.search).get("launcher") === "bubble";
  let currentError = null;

  window.FrontLit = window.FrontLit || { q: [], push(...a) { this.q.push(a); } };
  FrontLit.push("init", { teamId: ${JSON.stringify(TEAM_ID)}, launcher: bubble });
  FrontLit.push("onUnreadCountChange", (count) => {
    $("unread").hidden = !count;
    $("unread").textContent = String(count);
  });

  function pageKey() {
    const key = location.hash.replace("#/", "");
    return PAGES[key] ? key : "dashboard";
  }

  function render() {
    const key = pageKey();
    $("nav").replaceChildren(
      ...Object.entries(PAGES).map(([id, info]) => {
        const link = document.createElement("a");
        link.href = "#/" + id;
        link.textContent = info.label;
        if (id === key) link.setAttribute("aria-current", "page");
        return link;
      }),
    );
    $("crumb").textContent = PAGES[key].label;
    $("title").textContent = PAGES[key].label;
    $("subtitle").textContent = PAGES[key].subtitle;
  }

  function fillUser(user) {
    for (const [name, value] of Object.entries(user)) {
      if (form.elements[name]) form.elements[name].value = value;
    }
  }

  function selectUser(index) {
    fillUser(USERS[index]);
    try { localStorage.setItem("example-user", String(index)); } catch {}
    // A different person is signed in now: close their predecessor's chat.
    FrontLit.close?.();
    $("unread").hidden = true;
    showError(null);
  }

  function showError(entry) {
    currentError = entry;
    $("banner").hidden = !entry;
    if (!entry) return;
    $("banner-error").textContent = entry.error;
    $("banner-page").textContent = PAGES[entry.page].path;
    $("banner-request").textContent = entry.requestId;
  }

  async function contactSupport(withError) {
    const status = $("status");
    status.textContent = "Starting a support session…";
    const user = Object.fromEntries(new FormData(form));
    const context = { page: PAGES[pageKey()].path };
    let message;
    if (withError && currentError) {
      context.error = currentError.error;
      context.requestId = currentError.requestId;
      message = currentError.message;
    }
    const response = await fetch("/api/support-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user, context, message }),
    }).catch(() => null);
    if (!response || !response.ok) {
      status.textContent = "Couldn't start a session: " + (response ? await response.text() : "network error");
      return;
    }
    const { token } = await response.json();
    status.textContent = "";
    FrontLit.open({ token });
  }

  $("user-select").replaceChildren(
    ...USERS.map((user, index) => new Option(user.name + " · " + user.accountName, String(index))),
  );
  let saved = 0;
  try { saved = Number(localStorage.getItem("example-user")) || 0; } catch {}
  $("user-select").value = String(USERS[saved] ? saved : 0);
  fillUser(USERS[USERS[saved] ? saved : 0]);
  $("user-select").addEventListener("change", (event) => selectUser(Number(event.target.value)));

  document.querySelectorAll('[data-action="help"]').forEach((button) =>
    button.addEventListener("click", () => contactSupport(false)),
  );
  $("contact-error").addEventListener("click", () => contactSupport(true));
  $("dismiss").addEventListener("click", () => showError(null));
  $("trigger").addEventListener("click", () => {
    const entry = ERRORS[Math.floor(Math.random() * ERRORS.length)];
    location.hash = "#/" + entry.page;
    showError({ ...entry, requestId: "req_" + Math.random().toString(16).slice(2, 8) });
  });
  $("bubble").checked = bubble;
  $("bubble").addEventListener("change", (event) => {
    const url = new URL(location.href);
    if (event.target.checked) url.searchParams.set("launcher", "bubble");
    else url.searchParams.delete("launcher");
    location.href = url.toString();
  });
  window.addEventListener("hashchange", render);
  render();
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
 * request. Here the page's user picker stands in for that session. */
async function mintSession({ user = {}, context = {}, message }) {
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
      context,
      message: message || undefined,
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
