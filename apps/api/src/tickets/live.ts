export type InboxLiveEvent = {
  type: "inbox.updated";
  ticketId: string;
};

type InboxSocket = {
  send: (data: string) => void;
  readyState: number;
};

const OPEN = 1;

const rooms = new Map<string, Set<InboxSocket>>();

export function subscribeInbox(teamId: string, socket: InboxSocket): () => void {
  let room = rooms.get(teamId);
  if (!room) {
    room = new Set();
    rooms.set(teamId, room);
  }
  room.add(socket);
  return () => {
    room?.delete(socket);
    if (room && room.size === 0) rooms.delete(teamId);
  };
}

export function publishInboxUpdate(teamId: string, ticketId: string): void {
  const room = rooms.get(teamId);
  if (!room || room.size === 0) return;
  const payload = JSON.stringify({
    type: "inbox.updated",
    ticketId,
  } satisfies InboxLiveEvent);
  for (const socket of room) {
    if (socket.readyState !== OPEN) continue;
    try {
      socket.send(payload);
    } catch {
      room.delete(socket);
    }
  }
}
