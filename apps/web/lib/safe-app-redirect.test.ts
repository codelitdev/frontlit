import { afterEach, describe, expect, it, vi } from "vitest";

describe("safeAppRedirect", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    async function loadWithWebClient(webClient: string) {
        vi.stubEnv("WEB_CLIENT", webClient);
        vi.resetModules();
        return import("./safe-app-redirect");
    }

    it("resolves relative paths against WEB_CLIENT", async () => {
        const { safeAppRedirect } = await loadWithWebClient(
            "https://app.frontlit.cluster.clqa.site",
        );

        expect(safeAppRedirect("/teams").toString()).toBe(
            "https://app.frontlit.cluster.clqa.site/teams",
        );
        expect(safeAppRedirect("/contacts?from=team").toString()).toBe(
            "https://app.frontlit.cluster.clqa.site/contacts?from=team",
        );
    });

    it("allows absolute URLs on the same public origin", async () => {
        const { safeAppRedirect } = await loadWithWebClient(
            "https://app.frontlit.example",
        );

        expect(
            safeAppRedirect("https://app.frontlit.example/settings").toString(),
        ).toBe("https://app.frontlit.example/settings");
    });

    it.each([
        "https://attacker.example/steal",
        "//attacker.example/steal",
        "https://app.frontlit.evil/teams",
    ])("rejects external redirect target %s", async (redirectTo) => {
        const { safeAppRedirect } = await loadWithWebClient(
            "https://app.frontlit.example",
        );

        expect(safeAppRedirect(redirectTo).toString()).toBe(
            "https://app.frontlit.example/",
        );
    });

    it("falls back to home for empty or invalid targets", async () => {
        const { safeAppRedirect } = await loadWithWebClient(
            "http://localhost:3000",
        );

        expect(safeAppRedirect("").toString()).toBe("http://localhost:3000/");
        expect(safeAppRedirect("not a url").toString()).toBe(
            "http://localhost:3000/",
        );
    });
});
