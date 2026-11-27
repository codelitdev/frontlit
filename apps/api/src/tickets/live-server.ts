import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveAuth } from "../auth/resolve-auth";
import { getTeamByTeamId, getTeamMembership } from "../team/queries";
import { logger } from "../services/log";
import { subscribeInbox, subscribeTicket } from "./live";
import { getTicketByTicketId, verifyTicketAccess } from "./queries";

const PATH = "/inbox/stream";
/** A visitor's chat follows its own ticket. Any origin may embed the chat;
 * the ticket's access token is the credential. */
const VISITOR_PATH = "/public/stream";

type LiveAuth = { room: "team"; key: string } | { room: "ticket"; key: string };

function trustedOrigin(): string {
  return (process.env.WEB_CLIENT || "http://localhost:3000").replace(/\/$/, "");
}

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return origin.replace(/\/$/, "") === trustedOrigin();
}

async function authorizeVisitor(url: URL): Promise<LiveAuth | null> {
  const teamPublicId = url.searchParams.get("teamId");
  const ticketId = url.searchParams.get("ticketId");
  const token = url.searchParams.get("token");
  if (!teamPublicId || !ticketId || !token) return null;
  const team = await getTeamByTeamId(teamPublicId);
  if (!team) return null;
  const ticket = await getTicketByTicketId(team.id, ticketId);
  if (!ticket || !(await verifyTicketAccess(ticket, token))) return null;
  return { room: "ticket", key: ticket.ticketId };
}

async function authorizeUpgrade(request: IncomingMessage): Promise<LiveAuth | null> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === VISITOR_PATH) return authorizeVisitor(url);

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

export function attachInboxLive(server: Server): WebSocketServer {
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
        ? subscribeInbox(auth.key, ws)
        : subscribeTicket(auth.key, ws);
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
