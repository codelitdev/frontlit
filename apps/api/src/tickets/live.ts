export type InboxLiveEvent = {
  type: "inbox.updated";
  ticketId: string;
  /** Set when the update is a new message from the requester, so the
   * admin app can chime and notify. */
  requesterMessage?: { from: string; preview: string };
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

export function publishInboxUpdate(
  teamId: string,
  ticketId: string,
  requesterMessage?: { from: string; text: string },
): void {
  const room = rooms.get(teamId);
  if (!room || room.size === 0) return;
  const payload = JSON.stringify({
    type: "inbox.updated",
    ticketId,
    ...(requesterMessage
      ? {
          requesterMessage: {
            from: requesterMessage.from,
            preview: requesterMessage.text.trim().slice(0, 140),
          },
        }
      : {}),
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
