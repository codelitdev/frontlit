import { describe, expect, it } from "vitest";
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationTokensMatch,
  normalizeInvitationEmail,
} from "./invitation-token";

describe("invitation tokens", () => {
  it("uses at least 256 bits of randomness and stores only a hash", () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();
    expect(first.raw).not.toBe(second.raw);
    expect(Buffer.from(first.raw, "base64url").length).toBeGreaterThanOrEqual(32);
    expect(first.hash).toBe(hashInvitationToken(first.raw));
    expect(first.hash).not.toBe(first.raw);
    expect(invitationTokensMatch(first.raw, first.hash)).toBe(true);
    expect(invitationTokensMatch(second.raw, first.hash)).toBe(false);
  });

  it("normalizes emails without stripping plus suffixes", () => {
    expect(normalizeInvitationEmail("  Ada+News@Example.COM ")).toBe(
      "ada+news@example.com",
    );
  });
});
