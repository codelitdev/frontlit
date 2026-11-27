import { describe, expect, it } from "vitest";
import {
  createLiveHub,
  type LiveBus,
  publishInboxUpdate,
  publishNeedsReply,
  subscribeInbox,
  subscribeTicket,
} from "./live";

function socket() {
  const seen: unknown[] = [];
  return { seen, readyState: 1, send: (data: string) => seen.push(JSON.parse(data)) };
}

describe("live hub", () => {
  it("delivers ticket updates to that team's agents and that ticket's visitor", () => {
    const agent = socket();
    const otherTeam = socket();
    const visitor = socket();
    const otherVisitor = socket();
    const stops = [
      subscribeInbox("team_a", agent),
      subscribeInbox("team_b", otherTeam),
      subscribeTicket("tkt_1", visitor),
      subscribeTicket("tkt_2", otherVisitor),
    ];
    publishInboxUpdate("team_a", "tkt_1");
    expect(agent.seen).toEqual([{ type: "inbox.updated", ticketId: "tkt_1" }]);
    expect(visitor.seen).toEqual([{ type: "ticket.updated" }]);
    expect(otherTeam.seen).toEqual([]);
    expect(otherVisitor.seen).toEqual([]);
    for (const stop of stops) stop();
    publishInboxUpdate("team_a", "tkt_1");
    expect(agent.seen).toHaveLength(1);
  });

  it("tells agents, not visitors, when a message needs a human", () => {
    const agent = socket();
    const visitor = socket();
    const stops = [subscribeInbox("team_c", agent), subscribeTicket("tkt_3", visitor)];
    publishNeedsReply("team_c", "tkt_3", {
      from: "Jane",
      text: `  ${"x".repeat(200)}`,
    });
    expect(agent.seen).toEqual([
      {
        type: "inbox.updated",
        ticketId: "tkt_3",
        requesterMessage: { from: "Jane", preview: "x".repeat(140) },
      },
    ]);
    expect(visitor.seen).toEqual([]);
    for (const stop of stops) stop();
  });

  it("reaches sockets on other instances through the bus, exactly once", () => {
    // An in-memory stand-in for Redis pub/sub: every subscriber, including
    // the publisher, gets every message.
    const listeners: Array<(message: string) => void> = [];
    const bus: LiveBus = {
      publish: (message) => listeners.forEach((listener) => listener(message)),
      subscribe: (listener) => void listeners.push(listener),
    };
    const a = createLiveHub();
    const b = createLiveHub();
    a.connect(bus);
    b.connect(bus);
    const agentOnA = socket();
    const agentOnB = socket();
    const visitorOnB = socket();
    a.subscribeInbox("team_x", agentOnA);
    b.subscribeInbox("team_x", agentOnB);
    b.subscribeTicket("tkt_x", visitorOnB);

    a.publishInboxUpdate("team_x", "tkt_x");
    expect(agentOnA.seen).toEqual([{ type: "inbox.updated", ticketId: "tkt_x" }]);
    expect(agentOnB.seen).toEqual([{ type: "inbox.updated", ticketId: "tkt_x" }]);
    expect(visitorOnB.seen).toEqual([{ type: "ticket.updated" }]);

    b.publishNeedsReply("team_x", "tkt_x", { from: "Jane", text: "Hi" });
    expect(agentOnA.seen).toHaveLength(2);
    expect(agentOnB.seen).toHaveLength(2);
    expect(visitorOnB.seen).toHaveLength(1);
  });

  it("still delivers locally when the bus drops messages", () => {
    const hub = createLiveHub();
    hub.connect({ publish: () => {}, subscribe: () => {} });
    const agent = socket();
    hub.subscribeInbox("team_y", agent);
    hub.publishInboxUpdate("team_y", "tkt_y");
    expect(agent.seen).toEqual([{ type: "inbox.updated", ticketId: "tkt_y" }]);
  });
});
