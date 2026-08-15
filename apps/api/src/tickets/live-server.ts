import type { IncomingMessage, Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { resolveAuth } from "../auth/resolve-auth";
import { getTeamByTeamId, getTeamMembership } from "../team/queries";
import { logger } from "../services/log";
import { subscribeInbox } from "./live";

const PATH = "/inbox/stream";

function trustedOrigin(): string {
    return (process.env.WEB_CLIENT || "http://localhost:3000").replace(
        /\/$/,
        "",
    );
}

function originAllowed(origin: string | undefined): boolean {
    if (!origin) return true;
    return origin.replace(/\/$/, "") === trustedOrigin();
}

async function authorizeUpgrade(request: IncomingMessage) {
    if (!originAllowed(request.headers.origin)) return null;

    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== PATH) return null;

    const teamPublicId = url.searchParams.get("teamId");
    if (!teamPublicId) return null;

    const auth = await resolveAuth({
        headers: request.headers as Record<
            string,
            string | string[] | undefined
        >,
    });
    if (auth.status !== "authenticated" || auth.kind !== "session") {
        return null;
    }

    const team = await getTeamByTeamId(teamPublicId);
    if (!team) return null;
    const membership = await getTeamMembership(team.id, auth.accountId);
    if (!membership) return null;

    return { teamInternalId: team.id };
}

export function attachInboxLive(server: Server): WebSocketServer {
    const wss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== PATH) return;

        void authorizeUpgrade(request)
            .then((auth) => {
                if (!auth) {
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }
                wss.handleUpgrade(request, socket, head, (ws) => {
                    wss.emit("connection", ws, request, auth.teamInternalId);
                });
            })
            .catch((error) => {
                logger.warn(
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                    "Inbox websocket upgrade failed",
                );
                socket.destroy();
            });
    });

    wss.on(
        "connection",
        (ws: WebSocket, _request: IncomingMessage, teamId: string) => {
            const unsubscribe = subscribeInbox(teamId, ws);
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
        },
    );

    return wss;
}
