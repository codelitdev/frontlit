// Receives FrontLit's signed edge purges (EDGE_PURGE_ADAPTER=http) and
// purges the tagged pages from Varnish with xkey.
//
//   EDGE_PURGE_SECRET  same value as on frontlit-api
//   VARNISH_URL        e.g. http://varnish:80
//   PORT               default 8090
//
// FrontLit sends POST { teamId, tags } with x-frontlit-timestamp and
// x-frontlit-signature = hex(HMAC-SHA256(secret, `${timestamp}.${body}`)).
import { createHmac, timingSafeEqual } from "node:crypto";
import http from "node:http";

const secret = process.env.EDGE_PURGE_SECRET;
const varnish = process.env.VARNISH_URL ?? "http://varnish:80";
if (!secret) throw new Error("EDGE_PURGE_SECRET is required");

function verified(body, timestamp, signature) {
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 300_000)
    return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const given = Buffer.from(signature ?? "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

http
  .createServer(async (req, res) => {
    if (req.method !== "POST") return res.writeHead(405).end();
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 65_536) return res.writeHead(413).end();
    }
    const timestamp = Number(req.headers["x-frontlit-timestamp"]);
    if (!verified(body, timestamp, req.headers["x-frontlit-signature"])) {
      return res.writeHead(401).end("Invalid signature");
    }
    const { tags } = JSON.parse(body);
    if (!Array.isArray(tags) || !tags.every((tag) => /^[^\s]+$/.test(tag))) {
      return res.writeHead(400).end("Invalid tags");
    }
    const purge = await fetch(varnish, {
      method: "PURGE",
      headers: { "xkey-purge": tags.join(" ") },
    }).catch((error) => ({ ok: false, status: 502, statusText: String(error) }));
    // A non-2xx answer makes FrontLit retry: a purge must not be lost.
    res.writeHead(purge.ok ? 200 : 502).end(purge.ok ? "Purged" : purge.statusText);
  })
  .listen(Number(process.env.PORT ?? 8090));
