import type { AddressInfo } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn(async () => null as any);
const listTeamsForUser = vi.fn(async () => [] as any[]);
const getSelectedTeamId = vi.fn(async () => null as string | null);
const setSelectedTeamId = vi.fn(async () => {});

vi.mock("./better-auth", () => ({
    webClientUrl: "http://localhost:3000",
    auth: { api: { getSession } },
    oauthTeamSelectionAdapter: {
        listTeamsForUser,
        getSelectedTeamId,
        setSelectedTeamId,
    },
}));

vi.mock("better-auth/node", () => ({
    fromNodeHeaders: (headers: unknown) => headers,
}));

describe("Hosted login pages", () => {
    let app: express.Express;

    beforeEach(async () => {
        vi.clearAllMocks();
        getSession.mockResolvedValue(null);
        listTeamsForUser.mockResolvedValue([]);
        getSelectedTeamId.mockResolvedValue(null);

        vi.resetModules();
        const oauthPagesRoutes = (await import("./oauth-pages")).default;
        app = express();
        app.use(oauthPagesRoutes);
    });

    async function request(
        path: string,
        init: RequestInit = {},
    ): Promise<{
        status: number;
        headers: Headers;
        body: string;
        json: () => any;
    }> {
        const server = app.listen(0, "127.0.0.1");
        try {
            await new Promise<void>((resolve) =>
                server.once("listening", resolve),
            );
            const { port } = server.address() as AddressInfo;
            const response = await fetch(
                `http://127.0.0.1:${port}${path}`,
                // Keep 302s visible — Node fetch follows redirects by default.
                { redirect: "manual", ...init },
            );
            const body = await response.text();
            return {
                status: response.status,
                headers: response.headers,
                body,
                json: () => JSON.parse(body),
            };
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    }

    function jsonRequest(path: string, body: unknown) {
        return request(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    function redirectTargetFrom(body: string): string | undefined {
        return body.match(/var redirectTarget = "([^"]*)"/)?.[1];
    }

    describe("GET /login", () => {
        it("defaults to the web client root when no redirect is given", async () => {
            const res = await request("/login");

            expect(res.status).toBe(200);
            expect(redirectTargetFrom(res.body)).toBe("http://localhost:3000/");
            expect(res.body).toContain("Sign in to FrontLit");
        });

        it("honors a redirect on the web client's own origin", async () => {
            const res = await request(
                "/login?redirect=" +
                    encodeURIComponent("http://localhost:3000/pages/foo"),
            );

            expect(redirectTargetFrom(res.body)).toBe(
                "http://localhost:3000/pages/foo",
            );
        });

        it("rejects a redirect to a different origin (open-redirect protection)", async () => {
            const res = await request(
                "/login?redirect=" +
                    encodeURIComponent("http://evil.com/steal"),
            );

            expect(redirectTargetFrom(res.body)).toBe("http://localhost:3000/");
        });

        it("rejects a malformed redirect instead of throwing", async () => {
            const res = await request(
                "/login?redirect=" + encodeURIComponent("not-a-valid-url"),
            );

            expect(res.status).toBe(200);
            expect(redirectTargetFrom(res.body)).toBe("http://localhost:3000/");
        });

        it("sets anti-clickjacking headers", async () => {
            const res = await request("/login");

            expect(res.headers.get("content-security-policy")).toBe(
                "frame-ancestors 'none'",
            );
            expect(res.headers.get("x-frame-options")).toBe("DENY");
        });

        it("renders the email/OTP login form", async () => {
            const res = await request("/login");

            expect(res.body).toContain('id="email-form"');
            expect(res.body).toContain('id="otp-form"');
            expect(res.body).toContain('id="google-submit"');
        });
    });

    describe("GET /oauth/login", () => {
        it("renders the OAuth-flow login page without a web redirect target", async () => {
            const res = await request(
                "/oauth/login?client_id=abc&response_type=code",
            );

            expect(res.status).toBe(200);
            expect(res.body).toContain('id="email-form"');
            expect(res.body).toContain("oauth_query");
            expect(res.body).not.toContain("redirectTarget");
        });
    });

    const session = {
        user: { id: "user-1", email: "owner@example.com" },
        session: { id: "session-1" },
    };
    const teamA = {
        id: "internal-a",
        publicId: "team_aaa",
        name: "Team A",
    };
    const teamB = {
        id: "internal-b",
        publicId: "team_bbb",
        name: "Team B",
    };

    describe("GET /oauth/select-team", () => {
        it("sends an unauthenticated visitor back through login", async () => {
            getSession.mockResolvedValue(null);

            const res = await request(
                "/oauth/select-team?client_id=abc&scope=pages:read",
            );

            expect(res.status).toBe(302);
            expect(res.headers.get("location")).toBe(
                "/oauth/login?client_id=abc&scope=pages:read",
            );
        });

        it("auto-continues instead of showing a picker for a single-team account", async () => {
            getSession.mockResolvedValue(session);
            listTeamsForUser.mockResolvedValue([teamA]);

            const res = await request("/oauth/select-team?client_id=abc");

            expect(res.status).toBe(200);
            expect(res.body).toContain("oauth2/continue");
            expect(res.body).not.toContain('class="team-option"');
        });

        it("renders public team ids without leaking internal ids", async () => {
            getSession.mockResolvedValue(session);
            listTeamsForUser.mockResolvedValue([teamA, teamB]);

            const res = await request("/oauth/select-team?client_id=abc");

            expect(res.status).toBe(200);
            expect(res.body).toContain(`value="${teamA.publicId}"`);
            expect(res.body).toContain(`value="${teamB.publicId}"`);
            expect(res.body).not.toContain(teamA.id);
            expect(res.body).not.toContain(teamB.id);
            expect(res.body).toContain("Team A");
            expect(res.body).toContain("Team B");
            expect(res.headers.get("x-frame-options")).toBe("DENY");
        });
    });

    describe("POST /oauth/select-team", () => {
        it("rejects an unauthenticated request", async () => {
            getSession.mockResolvedValue(null);

            const res = await jsonRequest("/oauth/select-team", {
                teamId: teamA.publicId,
            });

            expect(res.status).toBe(401);
            expect(res.json()).toMatchObject({ error: "unauthorized" });
        });

        it("requires a teamId", async () => {
            getSession.mockResolvedValue(session);

            const res = await jsonRequest("/oauth/select-team", {});

            expect(res.status).toBe(400);
            expect(res.json().error).toBe("invalid_request");
        });

        it("rejects a team the account does not belong to", async () => {
            getSession.mockResolvedValue(session);
            listTeamsForUser.mockResolvedValue([teamA]);

            const res = await jsonRequest("/oauth/select-team", {
                teamId: teamB.publicId,
            });

            expect(res.status).toBe(403);
            expect(res.json().error).toBe("not_a_team_member");
            expect(setSelectedTeamId).not.toHaveBeenCalled();
        });

        it("records the selection against the internal team id, keyed by session", async () => {
            getSession.mockResolvedValue(session);
            listTeamsForUser.mockResolvedValue([teamA, teamB]);

            const res = await jsonRequest("/oauth/select-team", {
                teamId: teamB.publicId,
            });

            expect(res.status).toBe(200);
            expect(res.json()).toEqual({ ok: true });
            expect(setSelectedTeamId).toHaveBeenCalledWith(
                session.session.id,
                teamB.id,
            );
        });
    });

    describe("GET /oauth/consent", () => {
        it("shows the previously selected team for a multi-team account", async () => {
            getSession.mockResolvedValue(session);
            listTeamsForUser.mockResolvedValue([teamA, teamB]);
            getSelectedTeamId.mockResolvedValue(teamB.id);

            const res = await request(
                "/oauth/consent?client_id=abc&scope=pages:read",
            );

            expect(res.status).toBe(200);
            expect(res.body).toContain("Team B");
            expect(res.body).not.toContain("Team A");
            expect(res.body).toContain("pages:read");
        });
    });
});
