import { describe, expect, it } from "vitest";
import {
    describeChatProvider,
    resolveChatModelId,
    resolveModelId,
} from "./provider";

describe("resolveChatModelId", () => {
    it("uses the team's chosen model", () => {
        expect(resolveChatModelId("opencode", "kimi-k2.7-code")).toBe(
            "kimi-k2.7-code",
        );
    });

    it("falls back to a cheap default per provider", () => {
        expect(resolveChatModelId("opencode")).toBe("openai/gpt-5.1");
        expect(resolveChatModelId("openai")).toBe("gpt-4o-mini");
        expect(resolveChatModelId("azure")).toBe("gpt-4o-mini");
        expect(resolveChatModelId("anthropic")).toBe(
            "claude-haiku-4-5-20251001",
        );
        expect(resolveChatModelId("openrouter")).toBe("openai/gpt-4o-mini");
        expect(resolveChatModelId("bedrock")).toBe(
            "anthropic.claude-3-5-haiku-20241022-v1:0",
        );
    });
});

describe("resolveModelId", () => {
    it("keeps model choices independent by product purpose", () => {
        expect(resolveModelId("openai", "chatbot")).toBe("gpt-4o-mini");
        expect(resolveModelId("openai", "grammar")).toBe("gpt-4o-mini");
        expect(resolveModelId("openai", "builder")).toBe("gpt-4.1");
        expect(resolveModelId("openai", "builder", "gpt-4.1-mini")).toBe(
            "gpt-4.1-mini",
        );
    });
});

describe("describeChatProvider", () => {
    it("states that providers are configured per team", () => {
        expect(describeChatProvider()).toMatch(/team-configured/);
    });
});
