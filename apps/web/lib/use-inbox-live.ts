"use client";

import { useEffect, useRef } from "react";
import { getTeamIdFromCookie } from "./tokens";

function inboxSocketUrl(teamId: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").replace(
    /\/$/,
    "",
  );
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/inbox/stream?teamId=${encodeURIComponent(teamId)}`;
}

/** Keeps the inbox list/thread in sync with ticket writes on this team. */
export function useInboxLive(
  onUpdate: (ticketId: string) => void,
  teamId?: string | null,
) {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    const resolvedTeamId = teamId || getTeamIdFromCookie();
    if (!resolvedTeamId) return;

    let stopped = false;
    let socket: WebSocket | null = null;
    let retryMs = 1000;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(inboxSocketUrl(resolvedTeamId));
      socket.onopen = () => {
        retryMs = 1000;
      };
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data)) as {
            type?: string;
            ticketId?: string;
          };
          if (
            payload.type === "inbox.updated" &&
            typeof payload.ticketId === "string"
          ) {
            onUpdateRef.current(payload.ticketId);
          }
        } catch {
          // Ignore malformed frames.
        }
      };
      socket.onclose = () => {
        if (stopped) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15_000);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [teamId]);
}
