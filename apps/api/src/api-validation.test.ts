import { describe, expect, it } from "vitest";
import {
    attachCustomDomainBodySchema,
    captureLeadBodySchema,
    chatRequestBodySchema,
    createApiKeyBodySchema,
    createBlogBodySchema,
    createDocBodySchema,
    createDocSectionBodySchema,
    createMediaBodySchema,
    createPageBodySchema,
    createTeamBodySchema,
    createThemeBodySchema,
    createTicketBodySchema,
    listDocumentsQuerySchema,
    listPagesQuerySchema,
    listTicketsQuerySchema,
    provisionTeamBodySchema,
    publicCreateTicketBodySchema,
    renameTeamBodySchema,
    resolveHostQuerySchema,
    searchDocsQuerySchema,
    setTeamSubdomainBodySchema,
    testEspConfigBodySchema,
    textEditorContentSchema,
    updateChatbotSettingsBodySchema,
    updatePageBodySchema,
    updateTeamSettingsBodySchema,
    updateTicketBodySchema,
    upsertEspConfigBodySchema,
} from "@frontlit/api-contract";
import { openApiDocument } from "./openapi";

describe("API input validation schemas", () => {
    it("validates team management and provisioning bodies", () => {
        for (const schema of [
            createTeamBodySchema,
            renameTeamBodySchema,
            createApiKeyBodySchema,
        ]) {
            expect(schema.safeParse({ name: "" }).success).toBe(false);
            expect(schema.safeParse({ name: "Main" }).success).toBe(true);
        }

        expect(
            provisionTeamBodySchema.safeParse({
                externalId: "",
                ownerEmail: "bad",
                name: "",
            }).success,
        ).toBe(false);
        expect(
            provisionTeamBodySchema.safeParse({
                externalId: "consumer:tenant-1",
                ownerEmail: "owner@example.com",
                name: "Tenant 1",
            }).success,
        ).toBe(true);
    });

    it("validates page create/update bodies and list query coercion", () => {
        expect(
            createPageBodySchema.safeParse({
                name: "",
                type: "custom",
            }).success,
        ).toBe(false);
        expect(
            createPageBodySchema.safeParse({
                name: "About",
                type: "not-a-type",
            }).success,
        ).toBe(false);
        expect(
            createPageBodySchema.safeParse({
                name: "About",
                type: "custom",
                themeId: "learning",
            }).success,
        ).toBe(true);

        expect(
            updatePageBodySchema.safeParse({
                slug: "",
            }).success,
        ).toBe(false);
        expect(
            updatePageBodySchema.safeParse({
                slug: "about-us",
                title: "About us",
                layout: [
                    {
                        widgetId: "header-1",
                        name: "header",
                        deleteable: false,
                        shared: true,
                    },
                ],
            }).success,
        ).toBe(true);

        expect(
            listPagesQuerySchema.parse({
                offset: "2",
                itemsPerPage: "25",
                type: "site",
            }),
        ).toEqual({
            offset: 2,
            itemsPerPage: 25,
            type: "site",
        });
        expect(listPagesQuerySchema.safeParse({ offset: "0" }).success).toBe(
            false,
        );
    });

    it("validates document bodies, TipTap content, and search queries", () => {
        expect(createBlogBodySchema.safeParse({ title: "" }).success).toBe(
            false,
        );
        expect(createBlogBodySchema.parse({ title: "Hello" })).toMatchObject({
            title: "Hello",
            meta: { tags: [] },
        });
        expect(
            createDocBodySchema.safeParse({
                title: "Install",
                meta: { order: 1 },
            }).success,
        ).toBe(true);

        expect(
            textEditorContentSchema.safeParse({
                type: "paragraph",
                content: [],
            }).success,
        ).toBe(false);
        expect(textEditorContentSchema.parse({ type: "doc" })).toEqual({
            type: "doc",
            content: [],
        });

        expect(
            listDocumentsQuerySchema.parse({
                offset: "1",
                itemsPerPage: "10",
            }),
        ).toEqual({ offset: 1, itemsPerPage: 10 });
        expect(searchDocsQuerySchema.safeParse({ q: "" }).success).toBe(false);
        expect(searchDocsQuerySchema.parse({ q: "pricing", k: "5" })).toEqual({
            q: "pricing",
            k: 5,
        });
        expect(createDocSectionBodySchema.safeParse({ name: "" }).success).toBe(
            false,
        );
        expect(
            createDocSectionBodySchema.safeParse({ name: "Getting started" })
                .success,
        ).toBe(true);
    });

    it("validates domain, settings, theme, and media bodies", () => {
        expect(
            setTeamSubdomainBodySchema.safeParse({ slug: "Acme!" }).success,
        ).toBe(false);
        expect(
            setTeamSubdomainBodySchema.safeParse({ slug: "acme-co" }).success,
        ).toBe(true);

        expect(
            attachCustomDomainBodySchema.safeParse({
                hostname: "not a domain",
            }).success,
        ).toBe(false);
        expect(
            attachCustomDomainBodySchema.safeParse({
                hostname: "docs.example.com",
            }).success,
        ).toBe(true);

        expect(resolveHostQuerySchema.safeParse({ host: "" }).success).toBe(
            false,
        );
        expect(
            resolveHostQuerySchema.safeParse({ host: "acme.localhost" })
                .success,
        ).toBe(true);

        expect(
            updateTeamSettingsBodySchema.safeParse({
                title: "x".repeat(201),
            }).success,
        ).toBe(false);
        expect(
            updateTeamSettingsBodySchema.safeParse({
                title: "Acme",
                codeInjectionHead: null,
            }).success,
        ).toBe(true);

        expect(
            createThemeBodySchema.safeParse({ name: "", style: {} }).success,
        ).toBe(false);
        expect(
            createThemeBodySchema.safeParse({
                name: "Brand",
                style: { primary: "#112233" },
            }).success,
        ).toBe(true);

        expect(
            createMediaBodySchema.safeParse({ mediaLitId: "" }).success,
        ).toBe(false);
        expect(
            createMediaBodySchema.safeParse({
                mediaLitId: "ml_123",
                alt: "Hero",
            }).success,
        ).toBe(true);
    });

    it("validates public write and help-desk bodies", () => {
        expect(
            captureLeadBodySchema.safeParse({ email: "not-an-email" }).success,
        ).toBe(false);
        expect(
            captureLeadBodySchema.safeParse({
                email: "lead@example.com",
                sourcePath: "/pricing",
            }).success,
        ).toBe(true);

        expect(chatRequestBodySchema.safeParse({ message: "" }).success).toBe(
            false,
        );
        expect(
            chatRequestBodySchema.safeParse({
                message: "How do I start?",
                conversationId: "tkt_1",
            }).success,
        ).toBe(true);

        expect(
            publicCreateTicketBodySchema.safeParse({
                subject: "Help",
                message: "Broken",
                email: "bad",
            }).success,
        ).toBe(false);
        expect(
            publicCreateTicketBodySchema.parse({
                subject: "Help",
                message: "Broken",
                email: "user@example.com",
            }),
        ).toMatchObject({ source: "form" });

        expect(
            createTicketBodySchema.safeParse({
                subject: "API ticket",
                message: "Need access",
                requesterEmail: "agent@example.com",
            }).success,
        ).toBe(true);
        expect(
            updateTicketBodySchema.safeParse({ status: "snoozed" }).success,
        ).toBe(false);
        expect(
            updateTicketBodySchema.safeParse({
                status: "pending",
                assigneeAccountId: null,
            }).success,
        ).toBe(true);
        expect(
            listTicketsQuerySchema.parse({
                status: "open",
                offset: "1",
            }),
        ).toEqual({ status: "open", offset: 1 });
    });

    it("validates chatbot, ESP, and newsletter-adjacent bodies", () => {
        expect(
            updateChatbotSettingsBodySchema.safeParse({
                enabled: true,
                variant: "bubble",
                widgetStyle: { bubbleSize: "lg" },
            }).success,
        ).toBe(true);
        expect(
            updateChatbotSettingsBodySchema.safeParse({
                variant: "toast",
            }).success,
        ).toBe(false);

        expect(
            upsertEspConfigBodySchema.safeParse({
                provider: "smtp",
                host: "smtp.example.com",
                port: "587",
                secure: false,
            }).success,
        ).toBe(false);
        expect(
            upsertEspConfigBodySchema.safeParse({
                provider: "smtp",
                host: "smtp.example.com",
                port: 587,
                secure: false,
                fromEmail: "sender@example.com",
            }).success,
        ).toBe(true);
        expect(
            upsertEspConfigBodySchema.safeParse({
                provider: "smtp",
                host: "",
                port: 70_000,
                secure: false,
                fromEmail: "bad",
            }).success,
        ).toBe(false);
        expect(testEspConfigBodySchema.safeParse({ to: "bad" }).success).toBe(
            false,
        );
        expect(
            testEspConfigBodySchema.safeParse({
                to: "recipient@example.com",
            }).success,
        ).toBe(true);
    });
});

describe("OpenAPI surface for critical contract paths", () => {
    it("documents public, pages, tickets, and domain operations", () => {
        expect(openApiDocument.paths["/public/resolve-host"]?.get).toBeTruthy();
        expect(
            openApiDocument.paths["/public/{teamId}/leads"]?.post,
        ).toBeTruthy();
        expect(
            openApiDocument.paths["/public/{teamId}/tickets"]?.post,
        ).toBeTruthy();
        expect(openApiDocument.paths["/pages"]?.post).toBeTruthy();
        expect(openApiDocument.paths["/tickets"]?.get).toBeTruthy();
        expect(openApiDocument.paths["/domain"]?.get).toBeTruthy();
        expect(openApiDocument.paths["/provisioning/teams"]?.post).toBeTruthy();
    });
});
