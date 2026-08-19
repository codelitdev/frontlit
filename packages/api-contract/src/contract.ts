import { initContract } from "@ts-rest/core";
import { z } from "zod";
import { errorSchema, itemsList, paginated } from "./schemas/common";
import {
    apiKeySchema,
    createApiKeyBodySchema,
    createdApiKeySchema,
    createTeamBodySchema,
    provisionTeamBodySchema,
    provisionTeamResponseSchema,
    renameTeamBodySchema,
    teamMembershipSchema,
    teamSchema,
} from "./schemas/teams";
import {
    acceptedTeamMemberSchema,
    createTeamInvitationBodySchema,
    cursorPage,
    invitationPreviewSchema,
    invitationSecretBodySchema,
    membershipListQuerySchema,
    teamInvitationSchema,
    teamMemberPageSchema,
    teamMemberSchema,
    transferOwnershipBodySchema,
    updateTeamMemberBodySchema,
} from "./schemas/memberships";
import {
    createPageBodySchema,
    listPagesQuerySchema,
    pageSchema,
    updatePageBodySchema,
} from "./schemas/pages";
import {
    createThemeBodySchema,
    themeSchema,
    updateThemeBodySchema,
} from "./schemas/themes";
import {
    createMediaBodySchema,
    listMediaQuerySchema,
    mediaSchema,
    mediaUploadSignatureSchema,
    searchUnsplashQuerySchema,
    searchUnsplashResponseSchema,
    updateMediaBodySchema,
} from "./schemas/media";
import { listDocumentsQuerySchema } from "./schemas/documents";
import {
    articleMetaSchema,
    articleSchema,
    createArticleBodySchema,
    updateArticleBodySchema,
} from "./schemas/articles";
import {
    createDocumentationBodySchema,
    createDocumentationSectionBodySchema,
    documentationMetaSchema,
    documentationSchema,
    documentationSearchResultSchema,
    documentationSectionSchema,
    searchDocumentationQuerySchema,
    updateDocumentationBodySchema,
    updateDocumentationSectionBodySchema,
} from "./schemas/documentation";
import {
    makePublicDocumentSchema,
    publicPageSchema,
    sitemapResponseSchema,
} from "./schemas/public";
import {
    chatAttachmentCompleteBodySchema,
    chatAttachmentPresignBodySchema,
    chatRequestBodySchema,
    chatResponseSchema,
    chatbotSettingsSchema,
    publicChatbotSettingsSchema,
    updateChatbotSettingsBodySchema,
} from "./schemas/chatbot";
import {
    inboxAiSettingsSchema,
    updateInboxAiSettingsBodySchema,
} from "./schemas/inbox-ai";
import {
    productUpdateMetaSchema,
    productUpdateSchema,
    createProductUpdateBodySchema,
    githubIntegrationConfigSchema,
    githubIntegrationSchema,
    importGithubReleasesResponseSchema,
    updateProductUpdateBodySchema,
} from "./schemas/product-updates";
import {
    broadcastSchema,
    captureLeadBodySchema,
    captureLeadResponseSchema,
    contactSchema,
    createBroadcastBodySchema,
    createContactBodySchema,
    updateContactBodySchema,
    createEmailTemplateBodySchema,
    createSegmentBodySchema,
    listContactsQuerySchema,
    emailSettingsSchema,
    retryEmailProvisionResponseSchema,
    emailTemplateSchema,
    systemEmailTemplateSchema,
    segmentSchema,
    updateBroadcastBodySchema,
    updateEmailTemplateBodySchema,
    updateEmailSettingsBodySchema,
    updateSegmentBodySchema,
} from "./schemas/email";
import {
    createTicketBodySchema,
    listTicketsQuerySchema,
    publicCreateTicketBodySchema,
    publicCreateTicketResponseSchema,
    publicReplyToTicketBodySchema,
    publicTicketThreadQuerySchema,
    completeTicketAttachmentBodySchema,
    replyToTicketBodySchema,
    ticketAttachmentSchema,
    ticketSchema,
    ticketWithMessagesSchema,
    updateTicketBodySchema,
} from "./schemas/help-desk";
import {
    attachCustomDomainBodySchema,
    domainSettingsSchema,
    resolveHostQuerySchema,
    resolveHostResponseSchema,
    setSubdomainPublicBodySchema,
    setTeamSubdomainBodySchema,
} from "./schemas/domains";
import {
    publicTeamSettingsSchema,
    teamSettingsSchema,
    updateTeamSettingsBodySchema,
} from "./schemas/settings";
import {
    espConfigSchema,
    testEspConfigBodySchema,
    testEspConfigResponseSchema,
    upsertEspConfigBodySchema,
} from "./schemas/esp";
import { aiConfigSchema, updateAiConfigBodySchema } from "./schemas/ai";

const c = initContract();

/**
 * Team scope is not encoded in most resource URLs (e.g. `/pages`, `/themes`)
 * — it's derived from the auth context (API key, or session + selected-team
 * header). Only team-management endpoints themselves use `/teams/:teamId`
 * since they operate on the team resource directly.
 */
const teamsContract = c.router(
    {
        list: {
            method: "GET",
            path: "/teams",
            responses: { 200: itemsList(teamMembershipSchema) },
            summary: "List the teams the current account belongs to",
        },
        create: {
            method: "POST",
            path: "/teams",
            body: createTeamBodySchema,
            responses: { 201: teamSchema },
            summary: "Create a new team",
        },
        rename: {
            method: "PATCH",
            path: "/teams/:teamId",
            body: renameTeamBodySchema,
            responses: { 200: teamSchema, 404: errorSchema },
            summary: "Rename a team",
        },
        remove: {
            method: "DELETE",
            path: "/teams/:teamId",
            responses: { 204: c.noBody(), 403: errorSchema, 404: errorSchema },
            summary:
                "Delete a team and everything scoped to it (pages, themes, ...)",
        },
        listKeys: {
            method: "GET",
            path: "/teams/:teamId/keys",
            responses: { 200: itemsList(apiKeySchema), 404: errorSchema },
            summary: "List a team's API keys",
        },
        createKey: {
            method: "POST",
            path: "/teams/:teamId/keys",
            body: createApiKeyBodySchema,
            responses: { 201: createdApiKeySchema, 404: errorSchema },
            summary: "Create a new API key for a team",
            description:
                "The response's `key` field is the full secret and is only ever returned once — store it securely. Subsequent listings only expose the key's prefix.",
        },
        removeKey: {
            method: "DELETE",
            path: "/teams/:teamId/keys/:keyId",
            responses: { 204: c.noBody(), 404: errorSchema },
            summary: "Revoke an API key by its id",
        },
        listMembers: {
            method: "GET",
            path: "/teams/:teamId/members",
            query: membershipListQuerySchema,
            responses: {
                200: teamMemberPageSchema,
                403: errorSchema,
                404: errorSchema,
            },
            summary: "List accepted members of a team",
        },
        updateMember: {
            method: "PATCH",
            path: "/teams/:teamId/members/:memberId",
            body: updateTeamMemberBodySchema,
            responses: {
                200: teamMemberSchema,
                403: errorSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Replace a member's permission set",
        },
        removeMember: {
            method: "DELETE",
            path: "/teams/:teamId/members/:memberId",
            responses: {
                204: c.noBody(),
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Remove a non-owner member from a team",
        },
        leave: {
            method: "POST",
            path: "/teams/:teamId/members/leave",
            body: c.noBody(),
            responses: {
                204: c.noBody(),
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Leave a team (non-owners only)",
        },
        transferOwnership: {
            method: "POST",
            path: "/teams/:teamId/transfer-ownership",
            body: transferOwnershipBodySchema,
            responses: {
                200: teamSchema,
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Transfer team ownership to an accepted member",
        },
        listInvitations: {
            method: "GET",
            path: "/teams/:teamId/invitations",
            query: membershipListQuerySchema,
            responses: {
                200: cursorPage(teamInvitationSchema),
                403: errorSchema,
                404: errorSchema,
            },
            summary: "List pending invitations for a team",
        },
        createInvitation: {
            method: "POST",
            path: "/teams/:teamId/invitations",
            body: createTeamInvitationBodySchema,
            responses: {
                201: teamInvitationSchema,
                403: errorSchema,
                404: errorSchema,
                409: errorSchema,
                502: errorSchema,
            },
            summary: "Create or rotate a pending invitation",
        },
        resendInvitation: {
            method: "POST",
            path: "/teams/:teamId/invitations/:invitationId/resend",
            body: c.noBody(),
            responses: {
                200: teamInvitationSchema,
                403: errorSchema,
                404: errorSchema,
                502: errorSchema,
            },
            summary: "Rotate the token and resend a pending invitation",
        },
        revokeInvitation: {
            method: "DELETE",
            path: "/teams/:teamId/invitations/:invitationId",
            responses: {
                204: c.noBody(),
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Revoke a pending invitation",
        },
    },
    { metadata: { tag: "Teams" } },
);

const teamInvitationsContract = c.router(
    {
        preview: {
            method: "POST",
            path: "/team-invitations/preview",
            body: invitationSecretBodySchema,
            responses: {
                200: invitationPreviewSchema,
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Preview a team invitation for the signed-in account",
        },
        accept: {
            method: "POST",
            path: "/team-invitations/accept",
            body: invitationSecretBodySchema,
            responses: {
                200: acceptedTeamMemberSchema,
                403: errorSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Accept a team invitation",
        },
        reject: {
            method: "POST",
            path: "/team-invitations/reject",
            body: invitationSecretBodySchema,
            responses: {
                204: c.noBody(),
                403: errorSchema,
                404: errorSchema,
            },
            summary: "Reject a team invitation",
        },
    },
    { metadata: { tag: "Teams" } },
);

/**
 * Server-to-server endpoint for multi-tenant consumers to provision one
 * FrontLit team per one of their own tenants. Auth is a static shared
 * secret (`X-Frontlit-Provisioning-Secret` header), not a normal API
 * key/session — at provisioning time no team/key exists yet for the caller.
 */
const provisioningContract = c.router(
    {
        provisionTeam: {
            method: "POST",
            path: "/provisioning/teams",
            body: provisionTeamBodySchema,
            responses: {
                200: provisionTeamResponseSchema,
                400: errorSchema,
                401: errorSchema,
                500: errorSchema,
            },
            summary: "Find-or-create a team for a consumer-supplied tenant id",
            description:
                "Idempotent by `externalId`. Requires the X-Frontlit-Provisioning-Secret header.",
        },
    },
    { metadata: { tag: "Teams" } },
);

const pagesContract = c.router(
    {
        create: {
            method: "POST",
            path: "/pages",
            body: createPageBodySchema,
            responses: { 201: pageSchema },
            summary: "Create a page",
        },
        list: {
            method: "GET",
            path: "/pages",
            query: listPagesQuerySchema,
            responses: { 200: paginated(pageSchema), 400: errorSchema },
            summary: "List pages",
            description:
                "Returns a paginated list of pages belonging to the current team.",
        },
        get: {
            method: "GET",
            path: "/pages/:pageId",
            responses: { 200: pageSchema, 404: errorSchema },
            summary: "Get a page",
        },
        update: {
            method: "PATCH",
            path: "/pages/:pageId",
            body: updatePageBodySchema,
            responses: {
                200: pageSchema,
                400: errorSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a page",
            description:
                "Used for metadata edits and for persisting the builder's draft layout. Custom-page slug changes apply immediately; standard-page URLs are fixed. Layouts must retain exactly one locked, team-shared header and footer, plus FrontLit's required host-resolved data slot on dynamic standard pages.",
        },
        remove: {
            method: "DELETE",
            path: "/pages/:pageId",
            responses: { 204: c.noBody(), 404: errorSchema, 409: errorSchema },
            summary: "Delete a page",
            description: "Standard (non-deletable) pages return 409.",
        },
        publish: {
            method: "POST",
            path: "/pages/:pageId/publish",
            body: c.noBody(),
            responses: { 200: pageSchema, 404: errorSchema },
            summary: "Publish a page",
            description:
                "Copies the page's draft layout and SEO fields into the published fields the public site renders.",
        },
        discardDraft: {
            method: "POST",
            path: "/pages/:pageId/discard-draft",
            body: c.noBody(),
            responses: { 200: pageSchema, 404: errorSchema },
            summary: "Discard a page's draft changes",
            description:
                "Resets the draft layout and SEO fields back to whatever is currently published.",
        },
    },
    { metadata: { tag: "Pages" } },
);

const themesContract = c.router(
    {
        create: {
            method: "POST",
            path: "/themes",
            body: createThemeBodySchema,
            responses: { 201: themeSchema },
            summary: "Create a saved theme",
        },
        list: {
            method: "GET",
            path: "/themes",
            responses: { 200: itemsList(themeSchema) },
            summary: "List saved themes for the current team",
        },
        get: {
            method: "GET",
            path: "/themes/:themeId",
            responses: { 200: themeSchema, 404: errorSchema },
            summary: "Get a saved theme",
        },
        update: {
            method: "PATCH",
            path: "/themes/:themeId",
            body: updateThemeBodySchema,
            responses: { 200: themeSchema, 404: errorSchema },
            summary: "Update a saved theme",
        },
        remove: {
            method: "DELETE",
            path: "/themes/:themeId",
            responses: { 204: c.noBody(), 404: errorSchema },
            summary: "Delete a saved theme",
        },
    },
    { metadata: { tag: "Themes" } },
);

const mediaContract = c.router(
    {
        presigned: {
            method: "POST",
            path: "/media/presigned",
            body: c.noBody(),
            responses: { 200: mediaUploadSignatureSchema, 500: errorSchema },
            summary: "Generate a MediaLit upload signature",
            description:
                "Returns a short-lived MediaLit signature and endpoint. Upload files directly to `${endpoint}/media/create/resumable` with the signature in the `x-medialit-signature` header (TUS resumable upload).",
        },
        create: {
            method: "POST",
            path: "/media",
            body: createMediaBodySchema,
            responses: { 201: mediaSchema, 500: errorSchema },
            summary: "Register an uploaded file in the team's media library",
            description:
                "Seals the MediaLit upload (temp → permanent) and adds it to the team's library. Idempotent by `mediaLitId`.",
        },
        list: {
            method: "GET",
            path: "/media",
            query: listMediaQuerySchema,
            responses: { 200: paginated(mediaSchema) },
            summary: "List the team's media library",
        },
        searchUnsplash: {
            method: "GET",
            path: "/media/unsplash",
            query: searchUnsplashQuerySchema,
            responses: {
                200: searchUnsplashResponseSchema,
                502: errorSchema,
            },
            summary: "Search Unsplash through the FrontLit API",
            description:
                "Uses the server-side UNSPLASH_ACCESS_KEY. When the key is unset, `configured` is false and the client should fall back to a pasted Unsplash URL.",
        },
        get: {
            method: "GET",
            path: "/media/:mediaId",
            responses: { 200: mediaSchema, 404: errorSchema },
            summary: "Get a media item",
        },
        update: {
            method: "PATCH",
            path: "/media/:mediaId",
            body: updateMediaBodySchema,
            responses: { 200: mediaSchema, 404: errorSchema },
            summary: "Update a media item's alt text or caption",
        },
        remove: {
            method: "DELETE",
            path: "/media/:mediaId",
            responses: { 204: c.noBody(), 404: errorSchema },
            summary: "Delete a media item",
            description:
                "Deletes the file from MediaLit and removes it from the team's library.",
        },
    },
    { metadata: { tag: "Media" } },
);

/**
 * Shared factory behind the three typed Content resources. One
 * implementation, type-named endpoints, so the OpenAPI spec and MCP tool
 * list stay self-describing for API consumers instead of exposing the
 * internal document-kind discriminator.
 */
function makeDocumentContract(
    resource: string,
    tag: string,
    label: string,
    pluralLabel: string,
    schema: z.ZodTypeAny,
    createBody: z.ZodTypeAny,
    updateBody: z.ZodTypeAny,
) {
    return c.router(
        {
            create: {
                method: "POST",
                path: `/${resource}`,
                body: createBody,
                responses: { 201: schema },
                summary: `Create a ${label}`,
            },
            list: {
                method: "GET",
                path: `/${resource}`,
                query: listDocumentsQuerySchema,
                responses: { 200: paginated(schema) },
                summary: `List ${pluralLabel}`,
            },
            get: {
                method: "GET",
                path: `/${resource}/:documentId`,
                responses: { 200: schema, 404: errorSchema },
                summary: `Get a ${label}`,
            },
            update: {
                method: "PATCH",
                path: `/${resource}/:documentId`,
                body: updateBody,
                responses: {
                    200: schema,
                    400: errorSchema,
                    404: errorSchema,
                    409: errorSchema,
                },
                summary: `Update a ${label}`,
                description:
                    "Writes content to draft fields (architecture.md §3). Slug changes apply to the public URL immediately; publish content changes separately.",
            },
            publish: {
                method: "POST",
                path: `/${resource}/:documentId/publish`,
                body: c.noBody(),
                responses: { 200: schema, 404: errorSchema },
                summary: `Publish a ${label}`,
            },
            discardDraft: {
                method: "POST",
                path: `/${resource}/:documentId/discard-draft`,
                body: c.noBody(),
                responses: { 200: schema, 404: errorSchema },
                summary: `Discard a ${label}'s draft changes`,
            },
            remove: {
                method: "DELETE",
                path: `/${resource}/:documentId`,
                responses: { 204: c.noBody(), 404: errorSchema },
                summary: `Delete a ${label}`,
            },
        },
        { metadata: { tag } },
    );
}

const articlesContract = makeDocumentContract(
    "content/articles",
    "Content: Articles",
    "article",
    "articles",
    articleSchema,
    createArticleBodySchema,
    updateArticleBodySchema,
);
const documentationContract = makeDocumentContract(
    "content/documentation",
    "Content: Documentation",
    "documentation page",
    "documentation pages",
    documentationSchema,
    createDocumentationBodySchema,
    updateDocumentationBodySchema,
);
const baseProductUpdatesContract = makeDocumentContract(
    "content/product-updates",
    "Content: Product updates",
    "product update",
    "product updates",
    productUpdateSchema,
    createProductUpdateBodySchema,
    updateProductUpdateBodySchema,
);

/** Product updates are documents internally plus a GitHub Releases importer. */
const productUpdatesContract = c.router(
    {
        // Register literal GitHub routes before the generic
        // `/content/product-updates/:documentId` routes below (spread last),
        // because Express matches routes in registration order.
        connectGithub: {
            method: "PUT",
            path: "/content/product-updates/github",
            body: githubIntegrationConfigSchema,
            responses: { 200: githubIntegrationSchema },
            summary: "Connect a GitHub repo for product-update import",
        },
        getGithubIntegration: {
            method: "GET",
            path: "/content/product-updates/github",
            responses: { 200: githubIntegrationSchema },
            summary: "Get the team's GitHub integration status",
        },
        disconnectGithub: {
            method: "DELETE",
            path: "/content/product-updates/github",
            responses: { 204: c.noBody() },
            summary: "Disconnect the team's GitHub integration",
        },
        importGithubReleases: {
            method: "POST",
            path: "/content/product-updates/import-github",
            body: c.noBody(),
            responses: {
                200: importGithubReleasesResponseSchema,
                400: errorSchema,
            },
            summary: "Import GitHub Releases as draft product updates",
            description:
                "Lists Releases from the connected repo and creates one draft product update per release, idempotent by meta.github.releaseId (architecture.md §8.1). Nothing is auto-published.",
        },
        ...baseProductUpdatesContract,
    },
    { metadata: { tag: "Content: Product updates" } },
);

/** The help-center nav tree a "doc" document's `meta.sectionId` points
 * into (architecture.md §5.1), plus semantic search over published docs
 * (§6.4), backed by the pgvector chunks generated on publish. */
const documentationSectionsContract = c.router(
    {
        create: {
            method: "POST",
            path: "/content/documentation/sections",
            body: createDocumentationSectionBodySchema,
            responses: { 201: documentationSectionSchema },
            summary: "Create a help-center section",
        },
        list: {
            method: "GET",
            path: "/content/documentation/sections",
            responses: { 200: itemsList(documentationSectionSchema) },
            summary: "List help-center sections, ordered",
        },
        update: {
            method: "PATCH",
            path: "/content/documentation/sections/:sectionId",
            body: updateDocumentationSectionBodySchema,
            responses: { 200: documentationSectionSchema, 404: errorSchema },
            summary: "Update a help-center section",
        },
        remove: {
            method: "DELETE",
            path: "/content/documentation/sections/:sectionId",
            responses: { 204: c.noBody(), 404: errorSchema },
            summary: "Delete a help-center section",
        },
        search: {
            method: "GET",
            path: "/content/documentation/search",
            query: searchDocumentationQuerySchema,
            responses: { 200: itemsList(documentationSearchResultSchema) },
            summary: "Semantic search over the team's published docs",
            description:
                "Embeds `q` and ranks the team's pgvector doc chunks by cosine similarity (architecture.md §6.4).",
        },
    },
    { metadata: { tag: "Content: Documentation" } },
);

const publicArticleSchema = makePublicDocumentSchema(articleMetaSchema);
const publicDocumentationSchema = makePublicDocumentSchema(
    documentationMetaSchema,
);
const publicProductUpdateSchema = makePublicDocumentSchema(
    productUpdateMetaSchema,
);

/**
 * Unauthenticated, published-only reads for public site rendering
 * (architecture.md §5.4). Resolved by the team's *public* id — no
 * session/API key. Draft fields never appear in these responses.
 */
const publicContract = c.router(
    {
        resolveHost: {
            method: "GET",
            path: "/public/resolve-host",
            query: resolveHostQuerySchema,
            responses: { 200: resolveHostResponseSchema, 404: errorSchema },
            summary:
                'Resolve a request Host to a team (apps/sites tenant middleware + TLS "ask")',
            description:
                "Answers 200 only for a public claimed `<slug>.<PLATFORM_SITE_DOMAIN>` subdomain or a verified custom host (architecture.md §12.1/§12.2). A hidden platform subdomain is the same as an unknown host (404).",
        },
        getSettings: {
            method: "GET",
            path: "/public/:teamId/settings",
            responses: { 200: publicTeamSettingsSchema, 404: errorSchema },
            summary: "Get a team's public branding + code-injection settings",
            description:
                "Feeds the apps/sites site shell (architecture.md §12.5) — never leaks anything beyond what already ships in the page HTML.",
        },
        getPageBySlug: {
            method: "GET",
            path: "/public/:teamId/pages",
            // A `:slug` path param can't carry an empty string (the
            // homepage's slug, architecture.md §4.2), so it's a query param
            // instead of a `/pages/:slug` path segment.
            query: z.object({ slug: z.string().optional() }),
            responses: { 200: publicPageSchema, 404: errorSchema },
            summary: "Get a team's published page layout by slug",
            description:
                "Omit `slug` (or pass an empty string) to resolve the homepage.",
        },
        getSitemap: {
            method: "GET",
            path: "/public/:teamId/sitemap",
            responses: { 200: sitemapResponseSchema, 404: errorSchema },
            summary: "List every published, robots-allowed URL for a team",
            description:
                "Fully derived from what's published — feeds sitemap.xml and RSS generation (architecture.md §12.3). No authored/curated state.",
        },
        getChatbotSettings: {
            method: "GET",
            path: "/public/:teamId/chatbot",
            responses: { 200: publicChatbotSettingsSchema, 404: errorSchema },
            summary: "Get a team's public chatbot widget settings",
            description:
                "Lets apps/sites decide whether to mount the floating widget and how to skin it (architecture.md §7.3).",
        },
        listArticles: {
            method: "GET",
            path: "/public/:teamId/content/articles",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: {
                200: paginated(publicArticleSchema),
                404: errorSchema,
            },
            summary: "List a team's published articles",
        },
        getArticleBySlug: {
            method: "GET",
            path: "/public/:teamId/content/articles/:slug",
            responses: { 200: publicArticleSchema, 404: errorSchema },
            summary: "Get a team's published article by slug",
        },
        listDocumentationSections: {
            method: "GET",
            path: "/public/:teamId/content/documentation/sections",
            responses: {
                200: itemsList(documentationSectionSchema),
                404: errorSchema,
            },
            summary: "List a team's help-center nav sections",
        },
        searchDocumentation: {
            method: "GET",
            path: "/public/:teamId/content/documentation/search",
            query: searchDocumentationQuerySchema,
            responses: {
                200: itemsList(documentationSearchResultSchema),
                404: errorSchema,
                429: errorSchema,
            },
            summary:
                "Semantic search over a team's published docs (deflection before ticket submission, §11.2)",
        },
        listDocumentation: {
            method: "GET",
            path: "/public/:teamId/content/documentation",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: {
                200: paginated(publicDocumentationSchema),
                404: errorSchema,
            },
            summary: "List a team's published documentation",
        },
        getDocumentationBySlug: {
            method: "GET",
            path: "/public/:teamId/content/documentation/:slug",
            responses: { 200: publicDocumentationSchema, 404: errorSchema },
            summary: "Get a team's published documentation page by slug",
        },
        listProductUpdates: {
            method: "GET",
            path: "/public/:teamId/content/product-updates",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: {
                200: paginated(publicProductUpdateSchema),
                404: errorSchema,
            },
            summary: "List a team's published product updates",
        },
        getProductUpdateBySlug: {
            method: "GET",
            path: "/public/:teamId/content/product-updates/:slug",
            responses: { 200: publicProductUpdateSchema, 404: errorSchema },
            summary: "Get a team's published product update by slug",
        },
        presignChatAttachment: {
            method: "POST",
            path: "/public/:teamId/chat/attachments/presign",
            body: chatAttachmentPresignBodySchema,
            responses: {
                200: mediaUploadSignatureSchema.extend({
                    conversationId: z.string(),
                    conversationToken: z.string(),
                }),
                401: errorSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary:
                "Mint a MediaLit signature for a chatbot file. Does not add the file to the media library.",
        },
        completeChatAttachment: {
            method: "POST",
            path: "/public/:teamId/chat/attachments",
            body: chatAttachmentCompleteBodySchema,
            responses: {
                201: ticketAttachmentSchema,
                400: errorSchema,
                401: errorSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary:
                "Seal a MediaLit upload and attach it to the chatbot ticket, not the media library.",
        },
        chat: {
            method: "POST",
            path: "/public/:teamId/chat",
            body: chatRequestBodySchema,
            responses: {
                200: chatResponseSchema,
                400: errorSchema,
                401: errorSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary: "Ask the team's RAG chatbot a question",
            description:
                "Persists the conversation, retrieves the team's top matching published doc chunks, and returns an answer grounded in them plus cited sources. The returned conversation credentials let the widget receive later agent replies. 403 if the chatbot is disabled for the team.",
        },
        captureLead: {
            method: "POST",
            path: "/public/:teamId/leads",
            body: captureLeadBodySchema,
            responses: {
                200: captureLeadResponseSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary: "Capture a lead from a page's email-form block",
            description:
                "Enqueues a contact-sync job to SendLit and returns immediately — capture never depends on SendLit being reachable (architecture.md §10.2).",
        },
        createTicket: {
            method: "POST",
            path: "/public/:teamId/tickets",
            body: publicCreateTicketBodySchema,
            responses: {
                200: publicCreateTicketResponseSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary:
                "Raise a support ticket (support-form block, chatbot escalation, or headless)",
            description:
                "One of the three submission doors in architecture.md §11.2. Returns the magic-link token once.",
        },
        getTicketThread: {
            method: "GET",
            path: "/public/:teamId/tickets/:ticketId/messages",
            query: publicTicketThreadQuerySchema,
            responses: {
                200: ticketWithMessagesSchema,
                401: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary: "Read a ticket thread via its magic-link token",
        },
        replyToTicketThread: {
            method: "POST",
            path: "/public/:teamId/tickets/:ticketId/messages",
            body: publicReplyToTicketBodySchema,
            responses: {
                200: ticketWithMessagesSchema,
                401: errorSchema,
                403: errorSchema,
                404: errorSchema,
                429: errorSchema,
            },
            summary: "Reply on a ticket thread via its magic-link token",
        },
    },
    { metadata: { tag: "Public" } },
);

/** Team-scoped support ticket inbox (architecture.md §11.3). Public
 * submission and the magic-link thread endpoints live on `publicContract`
 * instead — visitors never authenticate. */
const ticketsContract = c.router(
    {
        list: {
            method: "GET",
            path: "/tickets",
            query: listTicketsQuerySchema,
            responses: { 200: paginated(ticketSchema) },
            summary: "List the team's support tickets",
        },
        create: {
            method: "POST",
            path: "/tickets",
            body: createTicketBodySchema,
            responses: { 201: ticketWithMessagesSchema },
            summary:
                "Create a ticket via the authed API/MCP surface (source: api)",
        },
        get: {
            method: "GET",
            path: "/tickets/:ticketId",
            responses: { 200: ticketWithMessagesSchema, 404: errorSchema },
            summary: "Get a ticket with its full message thread",
        },
        reply: {
            method: "POST",
            path: "/tickets/:ticketId/messages",
            body: replyToTicketBodySchema,
            responses: {
                201: ticketWithMessagesSchema,
                400: errorSchema,
                404: errorSchema,
            },
            summary: "Reply to a ticket as an agent",
        },
        presignAttachment: {
            method: "POST",
            path: "/tickets/:ticketId/attachments/presign",
            body: c.noBody(),
            responses: {
                200: mediaUploadSignatureSchema,
                404: errorSchema,
            },
            summary:
                "Mint a MediaLit signature for an inbox attachment (not the media library)",
        },
        completeAttachment: {
            method: "POST",
            path: "/tickets/:ticketId/attachments",
            body: completeTicketAttachmentBodySchema,
            responses: {
                201: ticketAttachmentSchema,
                400: errorSchema,
                404: errorSchema,
            },
            summary:
                "Seal a MediaLit upload onto the ticket without registering it in the media library",
        },
        update: {
            method: "PATCH",
            path: "/tickets/:ticketId",
            body: updateTicketBodySchema,
            responses: { 200: ticketSchema, 404: errorSchema },
            summary: "Update a ticket's status and/or assignee",
        },
    },
    { metadata: { tag: "Help Desk" } },
);

/** Per-team RAG chatbot settings. Its LLM provider is configured separately
 * through the team's `/settings/ai` connection. */
const chatbotContract = c.router(
    {
        get: {
            method: "GET",
            path: "/chatbot",
            responses: { 200: chatbotSettingsSchema },
            summary: "Get the team's chatbot settings",
        },
        update: {
            method: "PATCH",
            path: "/chatbot",
            body: updateChatbotSettingsBodySchema,
            responses: { 200: chatbotSettingsSchema },
            summary: "Update the team's chatbot settings",
        },
    },
    { metadata: { tag: "Chatbot" } },
);

const inboxAiContract = c.router(
    {
        get: {
            method: "GET",
            path: "/inbox/ai",
            responses: { 200: inboxAiSettingsSchema, 403: errorSchema },
            summary: "Get per-channel inbox AI auto-reply policy",
        },
        update: {
            method: "PATCH",
            path: "/inbox/ai",
            body: updateInboxAiSettingsBodySchema,
            responses: {
                200: inboxAiSettingsSchema,
                400: errorSchema,
                403: errorSchema,
                409: errorSchema,
            },
            summary: "Update Chatbot and/or Tickets inbox AI policy",
        },
    },
    { metadata: { tag: "Inbox AI" } },
);

const aiContract = c.router(
    {
        get: {
            method: "GET",
            path: "/settings/ai",
            responses: { 200: aiConfigSchema.nullable() },
            summary: "Get the team's AI provider configuration",
        },
        update: {
            method: "PUT",
            path: "/settings/ai",
            body: updateAiConfigBodySchema,
            responses: { 200: aiConfigSchema },
            summary: "Create or update the team's AI provider configuration",
        },
        remove: {
            method: "DELETE",
            path: "/settings/ai",
            body: c.noBody(),
            responses: { 204: c.noBody() },
            summary: "Remove the team's AI provider configuration",
        },
    },
    { metadata: { tag: "AI" } },
);

/** A team's default `<slug>.<PLATFORM_SITE_DOMAIN>` host plus an optional attached custom
 * domain (architecture.md §12.1). Team-scoped like `/chatbot` — not a
 * `/teams/:teamId` sub-resource, since it always operates on the caller's
 * current team. */
const domainsContract = c.router(
    {
        get: {
            method: "GET",
            path: "/domain",
            responses: { 200: domainSettingsSchema },
            summary: "Get the team's domain settings",
        },
        setSubdomain: {
            method: "PATCH",
            path: "/domain",
            body: setTeamSubdomainBodySchema,
            responses: { 200: domainSettingsSchema, 409: errorSchema },
            summary: "Change the team's default subdomain slug",
        },
        setSubdomainPublic: {
            method: "PATCH",
            path: "/domain/subdomain-public",
            body: setSubdomainPublicBodySchema,
            responses: { 200: domainSettingsSchema, 409: errorSchema },
            summary:
                "Show or hide the team's FrontLit subdomain after a custom domain is verified",
            description:
                "Hiding is not a redirect: resolve-host returns 404 for the platform subdomain. Requires a verified custom domain.",
        },
        attachCustomDomain: {
            method: "POST",
            path: "/domain/custom",
            body: attachCustomDomainBodySchema,
            responses: { 200: domainSettingsSchema, 409: errorSchema },
            summary: "Attach a custom domain (starts DNS verification)",
        },
        verifyCustomDomain: {
            method: "POST",
            path: "/domain/custom/verify",
            body: c.noBody(),
            responses: { 200: domainSettingsSchema, 404: errorSchema },
            summary: "Re-check DNS for the attached custom domain",
            description:
                "Looks up the ownership TXT record and the routing CNAME/apex records. Status becomes verified only when both pass. Re-runnable.",
        },
        removeCustomDomain: {
            method: "DELETE",
            path: "/domain/custom",
            responses: { 200: domainSettingsSchema, 404: errorSchema },
            summary: "Remove the team's custom domain",
        },
    },
    { metadata: { tag: "Domains" } },
);

/** SendLit-backed default email delivery provider for this FrontLit team. */
const espSettingsContract = c.router(
    {
        get: {
            method: "GET",
            path: "/settings/esp",
            responses: {
                200: espConfigSchema.nullable(),
                409: errorSchema,
            },
            summary: "Get the team's default SendLit ESP configuration",
            description:
                "Returns null when no ESP is configured. Passwords and API keys are never returned.",
        },
        upsert: {
            method: "PUT",
            path: "/settings/esp",
            body: upsertEspConfigBodySchema,
            responses: {
                200: espConfigSchema,
                409: errorSchema,
            },
            summary: "Create or update the team's default SendLit ESP",
            description:
                "Credentials are forwarded directly to the team's SendLit workspace. Omit password to retain the existing secret.",
        },
        remove: {
            method: "DELETE",
            path: "/settings/esp",
            responses: {
                204: c.noBody(),
                409: errorSchema,
            },
            summary: "Remove the team's default SendLit ESP",
        },
        test: {
            method: "POST",
            path: "/settings/esp/test",
            body: testEspConfigBodySchema,
            responses: {
                200: testEspConfigResponseSchema,
                400: errorSchema,
                409: errorSchema,
                422: errorSchema,
                502: errorSchema,
            },
            summary: "Send a test email through the configured SendLit ESP",
        },
    },
    { metadata: { tag: "Settings" } },
);

/** Per-team site-wide branding + code injection (architecture.md §12.5). */
const settingsContract = c.router(
    {
        get: {
            method: "GET",
            path: "/settings",
            responses: { 200: teamSettingsSchema },
            summary: "Get the team's branding and code-injection settings",
        },
        update: {
            method: "PATCH",
            path: "/settings",
            body: updateTeamSettingsBodySchema,
            responses: {
                200: teamSettingsSchema,
                400: errorSchema,
                403: errorSchema,
            },
            summary: "Update the team's branding and code-injection settings",
            description:
                "Changing either code-injection field requires the caller to hold the team owner role.",
        },
        esp: espSettingsContract,
    },
    { metadata: { tag: "Settings" } },
);

/** Read-through proxies over the team's provisioned SendLit team —
 * FrontLit stores no contact/segment/broadcast data of its own
 * (architecture.md §10). All fan out to `SENDLIT_API_URL` server-side. */
const contactsContract = c.router(
    {
        create: {
            method: "POST",
            path: "/contacts",
            body: createContactBodySchema,
            responses: { 201: contactSchema, 409: errorSchema },
            summary: "Create a SendLit contact",
        },
        list: {
            method: "GET",
            path: "/contacts",
            query: listContactsQuerySchema,
            responses: { 200: paginated(contactSchema), 409: errorSchema },
            summary: "List the team's SendLit contacts",
        },
        get: {
            method: "GET",
            path: "/contacts/:contactId",
            responses: {
                200: contactSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Get a SendLit contact",
        },
        update: {
            method: "PATCH",
            path: "/contacts/:contactId",
            body: updateContactBodySchema,
            responses: {
                200: contactSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a SendLit contact",
        },
        remove: {
            method: "DELETE",
            path: "/contacts/:contactId",
            responses: { 204: c.noBody(), 404: errorSchema, 409: errorSchema },
            summary: "Delete a SendLit contact (GDPR erasure)",
        },
        addTag: {
            method: "POST",
            path: "/contacts/:contactId/tags/:tag",
            body: c.noBody(),
            responses: {
                200: contactSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Tag a contact",
        },
        removeTag: {
            method: "DELETE",
            path: "/contacts/:contactId/tags/:tag",
            responses: {
                200: contactSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Untag a contact",
        },
    },
    { metadata: { tag: "Email" } },
);

const segmentsContract = c.router(
    {
        create: {
            method: "POST",
            path: "/email/segments",
            body: createSegmentBodySchema,
            responses: { 201: segmentSchema, 409: errorSchema },
            summary: "Create a saved segment",
        },
        list: {
            method: "GET",
            path: "/email/segments",
            responses: { 200: itemsList(segmentSchema), 409: errorSchema },
            summary: "List saved segments",
        },
        update: {
            method: "PATCH",
            path: "/email/segments/:segmentId",
            body: updateSegmentBodySchema,
            responses: {
                200: segmentSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a saved segment",
        },
        remove: {
            method: "DELETE",
            path: "/email/segments/:segmentId",
            responses: { 204: c.noBody(), 404: errorSchema, 409: errorSchema },
            summary: "Delete a saved segment",
        },
    },
    { metadata: { tag: "Email" } },
);

const emailContract = c.router(
    {
        getSettings: {
            method: "GET",
            path: "/email",
            responses: { 200: emailSettingsSchema },
            summary: "Get the team's SendLit compliance settings",
        },
        updateSettings: {
            method: "PATCH",
            path: "/email",
            body: updateEmailSettingsBodySchema,
            responses: { 200: emailSettingsSchema, 409: errorSchema },
            summary: "Update the team's SendLit compliance settings",
        },
        retryProvision: {
            method: "POST",
            path: "/email/provision",
            body: c.noBody(),
            responses: {
                200: retryEmailProvisionResponseSchema,
                409: errorSchema,
            },
            summary: "Retry SendLit team provisioning for this FrontLit team",
        },
        listTemplates: {
            method: "GET",
            path: "/email/templates",
            responses: {
                200: itemsList(emailTemplateSchema),
                409: errorSchema,
            },
            summary: "List the team's reusable email templates",
        },
        listSystemTemplates: {
            method: "GET",
            path: "/email/system-templates",
            responses: {
                200: itemsList(systemEmailTemplateSchema),
                409: errorSchema,
            },
            summary: "List SendLit's built-in marketing starter templates",
        },
        createTemplate: {
            method: "POST",
            path: "/email/templates",
            body: createEmailTemplateBodySchema,
            responses: {
                201: emailTemplateSchema,
                409: errorSchema,
            },
            summary: "Create a reusable email template",
        },
        updateTemplate: {
            method: "PATCH",
            path: "/email/templates/:templateId",
            body: updateEmailTemplateBodySchema,
            responses: {
                200: emailTemplateSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a reusable email template",
        },
        listBroadcasts: {
            method: "GET",
            path: "/email/broadcasts",
            responses: { 200: itemsList(broadcastSchema), 409: errorSchema },
            summary: "List broadcasts",
        },
        createBroadcast: {
            method: "POST",
            path: "/email/broadcasts",
            body: createBroadcastBodySchema,
            responses: { 201: broadcastSchema, 409: errorSchema },
            summary: "Create a broadcast (draft)",
        },
        updateBroadcast: {
            method: "PATCH",
            path: "/email/broadcasts/:broadcastId",
            body: updateBroadcastBodySchema,
            responses: {
                200: broadcastSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a broadcast (draft)",
        },
        sendBroadcast: {
            method: "POST",
            path: "/email/broadcasts/:broadcastId/send",
            body: c.noBody(),
            responses: {
                200: z.object({ status: z.string() }),
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Send a broadcast to its audience",
        },
        removeBroadcast: {
            method: "DELETE",
            path: "/email/broadcasts/:broadcastId",
            responses: {
                204: c.noBody(),
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Delete a broadcast on SendLit",
        },
        getBroadcastStats: {
            method: "GET",
            path: "/email/broadcasts/:broadcastId/stats",
            responses: {
                200: z.record(z.any()),
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Get delivery/open/click stats for a broadcast",
        },
    },
    { metadata: { tag: "Email" } },
);

export const contract = c.router({
    teams: teamsContract,
    teamInvitations: teamInvitationsContract,
    provisioning: provisioningContract,
    pages: pagesContract,
    themes: themesContract,
    media: mediaContract,
    content: c.router({
        articles: articlesContract,
        documentation: documentationContract,
        productUpdates: productUpdatesContract,
        documentationSections: documentationSectionsContract,
    }),
    contacts: contactsContract,
    segments: segmentsContract,
    email: emailContract,
    chatbot: chatbotContract,
    ai: aiContract,
    inboxAi: inboxAiContract,
    tickets: ticketsContract,
    domains: domainsContract,
    settings: settingsContract,
    public: publicContract,
});

export type Contract = typeof contract;
