import { describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";

const dbMock = vi.hoisted(() => ({
    select: vi.fn(() => ({
        from: vi.fn(() => ({
            where: vi.fn(() => ({ limit: vi.fn(async () => []) })),
        })),
    })),
    insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn(async () => [{}]) })),
    })),
}));

// Importing the full app initializes Better Auth's protected-resource seed.
// This HTTP-surface test must not depend on an external Postgres instance;
// real schema/migration behavior is covered by src/test/db.test.ts.
vi.mock("./db/client", () => ({ db: dbMock, pool: {} }));

import { createApp } from "./app";
import { openApiDocument } from "./openapi";

describe("OpenAPI authentication", () => {
    it("documents API keys and OAuth bearer tokens as alternatives", () => {
        expect(openApiDocument.components?.securitySchemes).toMatchObject({
            apiKeyAuth: {
                type: "apiKey",
                in: "header",
                name: "x-frontlit-apikey",
            },
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        });
        expect(openApiDocument.security).toEqual([
            { apiKeyAuth: [] },
            { bearerAuth: [] },
        ]);
    });

    it("marks public operations unauthenticated and provisioning separately authenticated", () => {
        expect(
            openApiDocument.paths["/public/resolve-host"]?.get?.security,
        ).toEqual([]);
        expect(
            openApiDocument.paths["/provisioning/teams"]?.post?.security,
        ).toEqual([{ provisioningSecretAuth: [] }]);
    });

    it("documents the SendLit-backed ESP management surface", () => {
        expect(
            openApiDocument.paths["/teams/{teamId}/members"]?.get,
        ).toBeTruthy();
        expect(
            openApiDocument.paths["/team-invitations/accept"]?.post,
        ).toBeTruthy();
        expect(
            JSON.stringify(openApiDocument.paths["/teams/{teamId}/members"]),
        ).toContain("memberId");
        expect(
            JSON.stringify(openApiDocument.paths["/team-invitations/accept"]),
        ).toContain("invitationId");
        expect(
            JSON.stringify(openApiDocument.paths["/teams/{teamId}/members"]),
        ).not.toMatch(/"accountId"|"membershipId"/);

        expect(openApiDocument.paths["/settings/esp"]).toMatchObject({
            get: {
                summary: "Get the team's default SendLit ESP configuration",
            },
            put: { summary: "Create or update the team's default SendLit ESP" },
            delete: { summary: "Remove the team's default SendLit ESP" },
        });
        expect(
            openApiDocument.paths["/domain/subdomain-public"]?.patch,
        ).toMatchObject({
            summary:
                "Show or hide the team's FrontLit subdomain after a custom domain is verified",
        });
        expect(JSON.stringify(openApiDocument.paths["/domain"])).toContain(
            "subdomainPublic",
        );

        expect(openApiDocument.paths["/settings/esp/test"]?.post).toMatchObject(
            {
                summary: "Send a test email through the configured SendLit ESP",
            },
        );
    });
});

describe("OpenAPI HTTP surfaces", () => {
    it("serves the raw document and interactive Swagger UI", async () => {
        const server = createApp().listen(0, "127.0.0.1");

        try {
            await new Promise<void>((resolve) =>
                server.once("listening", resolve),
            );
            const { port } = server.address() as AddressInfo;
            const origin = `http://127.0.0.1:${port}`;

            const documentResponse = await fetch(`${origin}/openapi.json`);
            expect(documentResponse.status).toBe(200);
            expect(await documentResponse.json()).toMatchObject({
                info: { title: "FrontLit API" },
            });

            const swaggerResponse = await fetch(`${origin}/docs/`);
            expect(swaggerResponse.status).toBe(200);
            expect(await swaggerResponse.text()).toContain("Swagger UI");

            const oauthMetadataResponse = await fetch(
                `${origin}/.well-known/oauth-authorization-server/api/auth`,
            );
            expect(oauthMetadataResponse.status).toBe(200);
            expect(await oauthMetadataResponse.json()).toMatchObject({
                issuer: "http://localhost:4000/api/auth",
                client_id_metadata_document_supported: true,
                authorization_response_iss_parameter_supported: true,
            });
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
