import { generateOpenApi } from "@ts-rest/open-api";
import { contract } from "@frontlit/api-contract";
import { createOpenAPI } from "fumadocs-openapi/server";

const openApiDocument = generateOpenApi(
    contract,
    {
        info: {
            title: "FrontLit API",
            description: "REST API for building and serving pages.",
            version: "0.1.0",
        },
        servers: [
            {
                url: "{protocol}://{host}",
                description: "API Server",
                variables: {
                    protocol: { default: "https", enum: ["https", "http"] },
                    host: { default: "api.frontlit.dev" },
                },
            },
        ],
        tags: [
            { name: "Pages", description: "Pages built with the page-builder block layout." },
            { name: "Themes", description: "Saved, reusable theme styles (colors, typography, structure)." },
            {
                name: "Teams",
                description: "Team management (list/create/rename/delete), per-team API keys, and server-to-server provisioning.",
            },
            {
                name: "Domains",
                description: "A team's default `<slug>.<DOMAIN>` subdomain plus an optional attached, DNS-verified custom domain.",
            },
            {
                name: "Settings",
                description: "Per-team site-wide branding (title, subtitle, logo) and code-injection snippets for the public site.",
            },
        ],
        components: {
            securitySchemes: {
                apiKeyAuth: { type: "apiKey", in: "header", name: "x-frontlit-apikey" },
                provisioningSecretAuth: { type: "apiKey", in: "header", name: "X-Frontlit-Provisioning-Secret" },
            },
        },
        security: [{ apiKeyAuth: [] }],
    },
    {
        operationMapper: (operation, route) => {
            const path = (route as { path?: string }).path;
            return {
                ...operation,
                tags: (route.metadata as { tag?: string } | undefined)?.tag
                    ? [(route.metadata as { tag: string }).tag]
                    : operation.tags,
                security: path === "/provisioning/teams" ? [{ provisioningSecretAuth: [] }] : operation.security,
            };
        },
    },
);

export const openapi = createOpenAPI({
    input: () => {
        return {
            "frontlit-openapi": openApiDocument as any,
        };
    },
});
