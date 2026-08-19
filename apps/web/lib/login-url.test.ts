import { describe, expect, it } from "vitest";
import { clientLoginPath, getWebLoginUrl } from "./login-url";

describe("getWebLoginUrl", () => {
    it("builds a login URL against the API with an encoded root redirect", () => {
        const url = getWebLoginUrl({
            apiPublicUrl: "http://localhost:4000",
            webClient: "http://localhost:3001",
        });

        expect(url).toBe(
            "http://localhost:4000/login?redirect=http%3A%2F%2Flocalhost%3A3001%2F",
        );
    });

    it("encodes special characters in the web client origin", () => {
        const url = getWebLoginUrl({
            apiPublicUrl: "https://api.frontlit.dev",
            webClient: "https://app.frontlit.dev",
        });

        expect(url).toContain("redirect=https%3A%2F%2Fapp.frontlit.dev%2F");
    });

    it("preserves a same-origin next path for invitation return", () => {
        const url = getWebLoginUrl({
            apiPublicUrl: "http://localhost:4000",
            webClient: "http://localhost:3001",
            next: "/team-invitations/tinv_abc",
        });
        expect(url).toContain(
            "redirect=http%3A%2F%2Flocalhost%3A3001%2Fteam-invitations%2Ftinv_abc",
        );
    });

    it("keeps a same-page next path on the browser login hop", () => {
        expect(clientLoginPath("/team-invitations/tinv_abc")).toBe(
            "/login?next=%2Fteam-invitations%2Ftinv_abc",
        );
        expect(clientLoginPath("/login")).toBe("/login");
        expect(clientLoginPath("https://evil.example/")).toBe("/login");
    });
});
