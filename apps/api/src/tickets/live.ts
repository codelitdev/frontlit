import { randomUUID } from "node:crypto";

export type InboxLiveEvent = {
  type: "inbox.updated";
  ticketId: string;
  /** Set when a requester message needs a human (the AI did not answer
   * it), so the admin app can chime and notify. */
  requesterMessage?: { from: string; preview: string };
};

/** Sent to a visitor's chat when its ticket changes; the chat reloads. */
export type TicketLiveEvent = { type: "ticket.updated" };

export type LiveSocket = {
  send: (data: string) => void;
  readyState: number;
};

type Room = "team" | "ticket";

/** What travels between API instances on the backplane. */
type BusMessage = { origin: string; room: Room; key: string; payload: string };

/** Cross-instance pub/sub (Redis in production). `publish` must never
 * throw or block; a lost message only costs a client one refetch. */
export type LiveBus = {
  publish: (message: string) => void;
  subscribe: (onMessage: (message: string) => void) => void;
};

const OPEN = 1;

function broadcast(room: Set<LiveSocket> | undefined, payload: string) {
  if (!room) return;
  for (const socket of room) {
    if (socket.readyState !== OPEN) continue;
    try {
      socket.send(payload);
    } catch {
      room.delete(socket);
    }
  }
}

/** One instance's sockets. Publishes reach local sockets at once and, when
 * a bus is connected, the other instances' sockets through it. */
export function createLiveHub() {
  const instanceId = randomUUID();
  /** Agents, by internal team ID. */
  const teamRooms = new Map<string, Set<LiveSocket>>();
  /** Visitors, by public ticket ID. */
  const ticketRooms = new Map<string, Set<LiveSocket>>();
  let bus: LiveBus | null = null;

  const roomsFor = (room: Room) => (room === "team" ? teamRooms : ticketRooms);

  function join(room: Room, key: string, socket: LiveSocket) {
    const rooms = roomsFor(room);
    let sockets = rooms.get(key);
    if (!sockets) {
      sockets = new Set();
      rooms.set(key, sockets);
    }
    sockets.add(socket);
    return () => {
      sockets?.delete(socket);
      if (sockets && sockets.size === 0 && rooms.get(key) === sockets) {
        rooms.delete(key);
      }
    };
  }

  function send(room: Room, key: string, event: InboxLiveEvent | TicketLiveEvent) {
    const payload = JSON.stringify(event);
    broadcast(roomsFor(room).get(key), payload);
    bus?.publish(
      JSON.stringify({ origin: instanceId, room, key, payload } satisfies BusMessage),
    );
  }

  function receive(raw: string) {
    let message: BusMessage;
    try {
      message = JSON.parse(raw) as BusMessage;
    } catch {
      return;
    }
    if (message.origin === instanceId) return;
    if (message.room !== "team" && message.room !== "ticket") return;
    broadcast(roomsFor(message.room).get(message.key), message.payload);
  }

  return {
    /** Share publishes with other instances. Call once at startup. */
    connect(next: LiveBus) {
      bus = next;
      next.subscribe(receive);
    },

    subscribeInbox(teamId: string, socket: LiveSocket): () => void {
      return join("team", teamId, socket);
    },

    subscribeTicket(ticketId: string, socket: LiveSocket): () => void {
      return join("ticket", ticketId, socket);
    },

    /** A ticket changed: refresh agents' inbox and the visitor's chat. */
    publishInboxUpdate(teamId: string, ticketId: string): void {
      send("team", teamId, { type: "inbox.updated", ticketId });
      send("ticket", ticketId, { type: "ticket.updated" });
    },

    /** A requester message is waiting for a human: agents chime and notify. */
    publishNeedsReply(
      teamId: string,
      ticketId: string,
      message: { from: string; text: string },
    ): void {
      send("team", teamId, {
        type: "inbox.updated",
        ticketId,
        requesterMessage: {
          from: message.from,
          preview: message.text.trim().slice(0, 140),
        },
      });
    },
  };
}

/** This process's hub. */
export const liveHub = createLiveHub();
export const subscribeInbox = liveHub.subscribeInbox;
export const subscribeTicket = liveHub.subscribeTicket;
export const publishInboxUpdate = liveHub.publishInboxUpdate;
export const publishNeedsReply = liveHub.publishNeedsReply;
