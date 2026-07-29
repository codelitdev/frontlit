import { afterEach, describe, expect, it } from "vitest";
import {
    describeChatProvider,
    resolveChatModelId,
    resolveChatProvider,
} from "./provider";

const KEYS = [
    "CHAT_PROVIDER",
    "CHAT_MODEL",
    "OPENCODE_API_KEY",
    "OPENCODE_GO_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
] as const;

const snapshot: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

afterEach(() => {
    for (const key of KEYS) {
        if (key in snapshot) {
            const value = snapshot[key];
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
            delete snapshot[key];
        }
    }
});

function setEnv(
    partial: Partial<Record<(typeof KEYS)[number], string | undefined>>,
) {
    for (const [key, value] of Object.entries(partial) as [
        (typeof KEYS)[number],
        string | undefined,
    ][]) {
        if (!(key in snapshot)) snapshot[key] = process.env[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

describe("resolveChatProvider", () => {
    it("defaults to local when no keys are set", () => {
        setEnv({
            CHAT_PROVIDER: undefined,
            OPENCODE_API_KEY: undefined,
            OPENCODE_GO_API_KEY: undefined,
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
        });
        expect(resolveChatProvider()).toBe("local");
    });

    it("prefers OpenCode Go when its key is present", () => {
        setEnv({
            CHAT_PROVIDER: undefined,
            OPENCODE_API_KEY: "sk-go-test",
            OPENAI_API_KEY: "sk-openai",
            ANTHROPIC_API_KEY: "sk-ant",
        });
        expect(resolveChatProvider()).toBe("opencode-go");
    });

    it("honors an explicit CHAT_PROVIDER override", () => {
        setEnv({
            CHAT_PROVIDER: "openai",
            OPENCODE_API_KEY: "sk-go-test",
            OPENAI_API_KEY: "sk-openai",
        });
        expect(resolveChatProvider()).toBe("openai");
    });

    it("accepts opencode/go aliases for OpenCode Go", () => {
        setEnv({ CHAT_PROVIDER: "go", OPENCODE_API_KEY: "sk-go-test" });
        expect(resolveChatProvider()).toBe("opencode-go");
        setEnv({ CHAT_PROVIDER: "opencode" });
        expect(resolveChatProvider()).toBe("opencode-go");
    });
});

describe("resolveChatModelId", () => {
    it("uses CHAT_MODEL when set", () => {
        setEnv({
            CHAT_MODEL: "kimi-k2.7-code",
            CHAT_PROVIDER: "opencode-go",
            OPENCODE_API_KEY: "sk",
        });
        expect(resolveChatModelId("opencode-go")).toBe("kimi-k2.7-code");
    });

    it("falls back to a cheap default per provider", () => {
        setEnv({ CHAT_MODEL: undefined });
        expect(resolveChatModelId("opencode-go")).toBe("deepseek-v4-flash");
        expect(resolveChatModelId("openai")).toBe("gpt-4o-mini");
        expect(resolveChatModelId("anthropic")).toBe(
            "claude-haiku-4-5-20251001",
        );
    });
});

describe("describeChatProvider", () => {
    it("mentions AI SDK when a remote provider is active", () => {
        setEnv({
            CHAT_PROVIDER: undefined,
            OPENCODE_API_KEY: "sk-test",
            OPENAI_API_KEY: undefined,
            ANTHROPIC_API_KEY: undefined,
        });
        expect(describeChatProvider()).toMatch(/Vercel AI SDK/);
        expect(describeChatProvider()).toMatch(/opencode-go/);
    });
});
