import { describe, expect, it } from "vitest";
import {
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
});
