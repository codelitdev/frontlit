import { describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
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
        expect(openApiDocument.paths["/settings/esp"]).toMatchObject({
            get: { summary: "Get the team's default SendLit ESP configuration" },
            put: { summary: "Create or update the team's default SendLit ESP" },
            delete: { summary: "Remove the team's default SendLit ESP" },
        });
        expect(openApiDocument.paths["/settings/esp/test"]?.post).toMatchObject({
            summary: "Send a test email through the configured SendLit ESP",
        });
    });
});

describe("OpenAPI HTTP surfaces", () => {
    it("serves the raw document and interactive Swagger UI", async () => {
        const server = createApp().listen(0, "127.0.0.1");

        try {
            await new Promise<void>((resolve) => server.once("listening", resolve));
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
        } finally {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
        }
    });
});
