import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveAuth } from "../auth/resolve-auth";
import { getTeamByTeamId, getTeamMembership } from "../team/queries";
import { logger } from "../services/log";
import { liveHub } from "./live";
import { createRedisLiveBus } from "./live-redis";
import { getTicketByTicketId, verifyTicketAccess } from "./queries";

const PATH = "/inbox/stream";
/** A visitor's chat follows its own ticket. Any origin may embed the chat;
 * the ticket's access token is the credential. It comes in the first
 * message, `{"type":"auth","token":"..."}`, never in the URL (URLs end up in
 * proxy and access logs). */
const VISITOR_PATH = "/public/stream";
/** Close code for a missing or bad visitor token. */
export const LIVE_UNAUTHORIZED = 4401;

type LiveAuth =
  | { room: "team"; key: string }
  | { room: "visitor"; teamId: string; ticketId: string };

function trustedOrigin(): string {
  return (process.env.WEB_CLIENT || "http://localhost:3000").replace(/\/$/, "");
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return origin.replace(/\/$/, "") === trustedOrigin();
}

/** Checks a visitor's ticket token; returns the public ticket ID to follow. */
export async function authorizeVisitor(
  teamPublicId: string,
  ticketId: string,
  token: string,
): Promise<string | null> {
  const team = await getTeamByTeamId(teamPublicId);
  if (!team) return null;
  const ticket = await getTicketByTicketId(team.id, ticketId);
  if (!ticket || !(await verifyTicketAccess(ticket, token))) return null;
  return ticket.ticketId;
}

async function authorizeUpgrade(request: IncomingMessage): Promise<LiveAuth | null> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === VISITOR_PATH) {
    const teamId = url.searchParams.get("teamId");
    const ticketId = url.searchParams.get("ticketId");
    if (!teamId || !ticketId) return null;
    return { room: "visitor", teamId, ticketId };
  }

  if (!originAllowed(request.headers.origin)) return null;
  if (url.pathname !== PATH) return null;

  const teamPublicId = url.searchParams.get("teamId");
  if (!teamPublicId) return null;

  const auth = await resolveAuth({
    headers: request.headers as Record<string, string | string[] | undefined>,
  });
  if (auth.status !== "authenticated" || auth.kind !== "session") {
    return null;
  }

  const team = await getTeamByTeamId(teamPublicId);
  if (!team) return null;
  const membership = await getTeamMembership(team.id, auth.accountId);
  if (!membership) return null;

  return { room: "team", key: team.id };
}

/** Waits for the visitor's auth message, then follows the ticket. */
function acceptVisitor(
  ws: WebSocket,
  auth: { teamId: string; ticketId: string },
  authTimeoutMs: number,
): () => void {
  let unsubscribe: (() => void) | null = null;
  let checking = false;
  let closed = false;
  const reject = () => ws.close(LIVE_UNAUTHORIZED, "Unauthorized");
  const timer = setTimeout(reject, authTimeoutMs);

  ws.on("message", (data) => {
    if (unsubscribe || checking) return;
    let message: { type?: unknown; token?: unknown };
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message?.type !== "auth") return;
    if (typeof message.token !== "string" || !message.token) return reject();
    checking = true;
    void authorizeVisitor(auth.teamId, auth.ticketId, message.token)
      .then((ticketId) => {
        if (closed) return;
        if (!ticketId) return reject();
        clearTimeout(timer);
        unsubscribe = liveHub.subscribeTicket(ticketId, ws);
      })
      .catch(reject);
  });

  return () => {
    closed = true;
    clearTimeout(timer);
    unsubscribe?.();
  };
}

export function attachInboxLive(
  server: Server,
  options: { authTimeoutMs?: number } = {},
): WebSocketServer {
  const authTimeoutMs = options.authTimeoutMs ?? 5_000;
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== PATH && url.pathname !== VISITOR_PATH) return;

    void authorizeUpgrade(request)
      .then((auth) => {
        if (!auth) {
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request, auth);
        });
      })
      .catch((error) => {
        logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          "Inbox websocket upgrade failed",
        );
        socket.destroy();
      });
  });

  wss.on("connection", (ws: WebSocket, _request: IncomingMessage, auth: LiveAuth) => {
    const unsubscribe =
      auth.room === "team"
        ? liveHub.subscribeInbox(auth.key, ws)
        : acceptVisitor(ws, auth, authTimeoutMs);
    const heartbeat = setInterval(() => {
      if (ws.readyState !== ws.OPEN) return;
      ws.ping();
    }, 30_000);
    ws.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
    ws.on("error", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return wss;
}

/** With `REDIS_URL`, share live events with the other API instances. */
export function startLiveBackplane(): void {
  const url = process.env.REDIS_URL;
  if (!url) return;
  liveHub.connect(createRedisLiveBus(url));
  logger.info("Live events: Redis backplane enabled");
}
