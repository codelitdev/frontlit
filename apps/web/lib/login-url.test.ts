import { describe, expect, it } from "vitest";
import { getWebLoginUrl } from "./login-url";

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
});
