export type InboxLiveEvent = {
  type: "inbox.updated";
  ticketId: string;
  /** Set when a requester message needs a human (the AI did not answer
   * it), so the admin app can chime and notify. */
  requesterMessage?: { from: string; preview: string };
};

/** Sent to a visitor's chat when its ticket changes; the chat reloads. */
export type TicketLiveEvent = { type: "ticket.updated" };

type LiveSocket = {
  send: (data: string) => void;
  readyState: number;
};

const OPEN = 1;

/** Agents, by internal team ID. */
const teamRooms = new Map<string, Set<LiveSocket>>();
/** Visitors, by public ticket ID. */
const ticketRooms = new Map<string, Set<LiveSocket>>();

function join(rooms: Map<string, Set<LiveSocket>>, key: string, socket: LiveSocket) {
  let room = rooms.get(key);
  if (!room) {
    room = new Set();
    rooms.set(key, room);
  }
  room.add(socket);
  return () => {
    room?.delete(socket);
    if (room && room.size === 0) rooms.delete(key);
  };
}

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

export function subscribeInbox(teamId: string, socket: LiveSocket): () => void {
  return join(teamRooms, teamId, socket);
}

export function subscribeTicket(ticketId: string, socket: LiveSocket): () => void {
  return join(ticketRooms, ticketId, socket);
}

/** A ticket changed: refresh agents' inbox and the visitor's chat. */
export function publishInboxUpdate(teamId: string, ticketId: string): void {
  broadcast(
    teamRooms.get(teamId),
    JSON.stringify({ type: "inbox.updated", ticketId } satisfies InboxLiveEvent),
  );
  broadcast(
    ticketRooms.get(ticketId),
    JSON.stringify({ type: "ticket.updated" } satisfies TicketLiveEvent),
  );
}

/** A requester message is waiting for a human: agents chime and notify. */
export function publishNeedsReply(
  teamId: string,
  ticketId: string,
  message: { from: string; text: string },
): void {
  broadcast(
    teamRooms.get(teamId),
    JSON.stringify({
      type: "inbox.updated",
      ticketId,
      requesterMessage: {
        from: message.from,
        preview: message.text.trim().slice(0, 140),
      },
    } satisfies InboxLiveEvent),
  );
}
