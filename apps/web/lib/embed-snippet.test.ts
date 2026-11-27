import { describe, expect, it } from "vitest";
import { embedSnippet } from "./embed-snippet";

describe("embedSnippet", () => {
  it("fills in the team and the widget host", () => {
    const code = embedSnippet("team_abc", "https://embed.frontlit.app", false);
    expect(code).toContain('FrontLit.push("init", { teamId: "team_abc" });');
    expect(code).toContain(
      '<script async src="https://embed.frontlit.app/chat.js"></script>',
    );
  });

  it("hides the bubble when the host opens the chat from its own button", () => {
    expect(embedSnippet("team_abc", "https://embed.frontlit.app", true)).toContain(
      '{ teamId: "team_abc", launcher: false }',
    );
  });
});
