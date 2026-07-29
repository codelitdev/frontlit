import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDb, seedTeam, type TestDb } from "../test/db";

vi.mock("../db/client", async () => ({ db: await makeTestDb() }));

import { db as testDb } from "../db/client";
import { getChatbotSettings, updateChatbotSettings } from "./queries";

describe("chatbot settings", () => {
    const db = testDb as unknown as TestDb;
    let teamId: string;

    beforeEach(async () => {
        const seeded = await seedTeam(db);
        teamId = seeded.team.id;
    });

    it("lazily creates disabled defaults on first read", async () => {
        const settings = await getChatbotSettings(teamId);
        expect(settings.enabled).toBe(false);
        expect(settings.name).toBe("Assistant");
        expect(settings.variant).toBe("bubble");
        expect(settings.widgetStyle.bubbleShape).toBe("circle");
        expect(settings.widgetStyle.bubbleIcon).toBe("chat");
    });

    it("is idempotent: reading twice returns the same row", async () => {
        const first = await getChatbotSettings(teamId);
        const second = await getChatbotSettings(teamId);
        expect(second.id).toBe(first.id);
    });

    it("updates settings", async () => {
        const updated = await updateChatbotSettings(teamId, {
            enabled: true,
            name: "Helper",
            greeting: "Hi there!",
        });
        expect(updated.enabled).toBe(true);
        expect(updated.name).toBe("Helper");
        expect(updated.greeting).toBe("Hi there!");
    });

    it("updates launcher variant and merges widget style patches", async () => {
        const updated = await updateChatbotSettings(teamId, {
            variant: "text_input",
            widgetStyle: { inputRadius: "lg", inputPlaceholder: "Need help?" },
        });
        expect(updated.variant).toBe("text_input");
        expect(updated.widgetStyle.inputRadius).toBe("lg");
        expect(updated.widgetStyle.inputPlaceholder).toBe("Need help?");
        // Unpatched bubble defaults remain present.
        expect(updated.widgetStyle.bubbleIcon).toBe("chat");

        const again = await updateChatbotSettings(teamId, {
            widgetStyle: { bubbleShape: "square" },
        });
        expect(again.widgetStyle.bubbleShape).toBe("square");
        expect(again.widgetStyle.inputPlaceholder).toBe("Need help?");
    });

    it("clears accentColor so the site theme primary can apply", async () => {
        await updateChatbotSettings(teamId, { accentColor: "#ff0000" });
        const cleared = await updateChatbotSettings(teamId, {
            accentColor: null,
        });
        expect(cleared.accentColor).toBeNull();
    });
});
