import { describe, expect, it } from "vitest";
import { publishInboxUpdate, subscribeInbox } from "./live";

describe("inbox live hub", () => {
  it("delivers an update only to subscribers of that team", () => {
    const seen: string[] = [];
    const socket = {
      readyState: 1,
      send: (data: string) => seen.push(data),
    };
    const other = {
      readyState: 1,
      send: () => {
        throw new Error("other team should not receive");
      },
    };
    const stop = subscribeInbox("team_a", socket);
    const stopOther = subscribeInbox("team_b", other);
    publishInboxUpdate("team_a", "tkt_1");
    expect(seen).toEqual([
      JSON.stringify({ type: "inbox.updated", ticketId: "tkt_1" }),
    ]);
    stop();
    publishInboxUpdate("team_a", "tkt_2");
    expect(seen).toHaveLength(1);
    stopOther();
  });

  it("describes a new requester message so the admin app can notify", () => {
    const seen: string[] = [];
    const stop = subscribeInbox("team_c", {
      readyState: 1,
      send: (data: string) => seen.push(data),
    });
    publishInboxUpdate("team_c", "tkt_3", {
      from: "Jane",
      text: `  ${"x".repeat(200)}`,
    });
    expect(JSON.parse(seen[0])).toEqual({
      type: "inbox.updated",
      ticketId: "tkt_3",
      requesterMessage: { from: "Jane", preview: "x".repeat(140) },
    });
    stop();
  });
});
