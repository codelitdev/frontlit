import { describe, expect, it } from "vitest";
import { getDashboardLoginUrl } from "./login-url";

describe("getDashboardLoginUrl", () => {
    it("builds a login URL against the API with an encoded dashboard redirect", () => {
        const url = getDashboardLoginUrl({
            apiPublicUrl: "http://localhost:4000",
            webClient: "http://localhost:3001",
        });

        expect(url).toBe(
            "http://localhost:4000/login?redirect=http%3A%2F%2Flocalhost%3A3001%2Fdashboard",
        );
    });

    it("encodes special characters in the web client origin", () => {
        const url = getDashboardLoginUrl({
            apiPublicUrl: "https://api.frontlit.dev",
            webClient: "https://app.frontlit.dev",
        });

        expect(url).toContain("redirect=https%3A%2F%2Fapp.frontlit.dev%2Fdashboard");
    });
});
