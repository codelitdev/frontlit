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
    updateMediaBodySchema,
} from "./schemas/media";
import { listDocumentsQuerySchema } from "./schemas/documents";
import {
    blogMetaSchema,
    blogSchema,
    createBlogBodySchema,
    updateBlogBodySchema,
} from "./schemas/blogs";
import {
    createDocBodySchema,
    createDocSectionBodySchema,
    docMetaSchema,
    docSchema,
    docSearchResultSchema,
    docSectionSchema,
    searchDocsQuerySchema,
    updateDocBodySchema,
    updateDocSectionBodySchema,
} from "./schemas/docs";
import {
    makePublicDocumentSchema,
    publicPageSchema,
    sitemapResponseSchema,
} from "./schemas/public";
import {
    chatRequestBodySchema,
    chatResponseSchema,
    chatbotSettingsSchema,
    publicChatbotSettingsSchema,
    updateChatbotSettingsBodySchema,
} from "./schemas/chatbot";
import {
    changelogMetaSchema,
    changelogSchema,
    createChangelogBodySchema,
    githubIntegrationConfigSchema,
    githubIntegrationSchema,
    importGithubReleasesResponseSchema,
    updateChangelogBodySchema,
} from "./schemas/changelogs";
import {
    broadcastSchema,
    captureLeadBodySchema,
    captureLeadResponseSchema,
    contactSchema,
    createBroadcastBodySchema,
    createNewsletterTemplateBodySchema,
    createSegmentBodySchema,
    listContactsQuerySchema,
    newsletterSettingsSchema,
    newsletterTemplateSchema,
    segmentSchema,
    updateBroadcastBodySchema,
    updateNewsletterTemplateBodySchema,
    updateNewsletterSettingsBodySchema,
    updateSegmentBodySchema,
} from "./schemas/newsletter";
import {
    createTicketBodySchema,
    listTicketsQuerySchema,
    publicCreateTicketBodySchema,
    publicCreateTicketResponseSchema,
    publicReplyToTicketBodySchema,
    publicTicketThreadQuerySchema,
    replyToTicketBodySchema,
    ticketSchema,
    ticketWithMessagesSchema,
    updateTicketBodySchema,
} from "./schemas/help-desk";
import {
    attachCustomDomainBodySchema,
    domainSettingsSchema,
    resolveHostQuerySchema,
    resolveHostResponseSchema,
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
                200: teamMemberSchema,
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
                "Used for metadata edits and for persisting the builder's draft layout. Custom-page slug changes apply immediately; standard-page URLs are fixed. Layouts must retain exactly one locked, team-shared header and footer, plus the required page-content block on dynamic standard pages.",
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
 * Shared factory behind the three kind-scoped document routers
 * (`/blogs`, `/help-docs`, `/changelogs` — architecture.md §5.3). One
 * implementation, kind-named endpoints, so the OpenAPI spec and MCP tool
 * list stay self-describing for API consumers instead of exposing a
 * generic `/documents?kind=`.
 */
function makeDocumentContract(
    resource: string,
    tag: string,
    schema: z.ZodTypeAny,
    createBody: z.ZodTypeAny,
    updateBody: z.ZodTypeAny,
) {
    const label = tag.toLowerCase();
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
                summary: `List ${label}s`,
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

const blogsContract = makeDocumentContract(
    "blogs",
    "Blog",
    blogSchema,
    createBlogBodySchema,
    updateBlogBodySchema,
);
const docsContract = makeDocumentContract(
    "help-docs",
    "Doc",
    docSchema,
    createDocBodySchema,
    updateDocBodySchema,
);
const baseChangelogsContract = makeDocumentContract(
    "changelogs",
    "Changelog",
    changelogSchema,
    createChangelogBodySchema,
    updateChangelogBodySchema,
);

/** Changelog entries are documents (kind: "changelog") plus a GitHub
 * Releases importer (architecture.md §8.1). */
const changelogsContract = c.router(
    {
        // GitHub-specific routes must be registered before the generic
        // `/changelogs/:documentId` CRUD routes below (spread last) — Express
        // matches routes in registration order, so a literal `/changelogs/github`
        // would otherwise be shadowed by the `:documentId` wildcard (same bug
        // class as `/help-docs/search` vs `/help-docs/:documentId` — see §5.3).
        connectGithub: {
            method: "PUT",
            path: "/changelogs/github",
            body: githubIntegrationConfigSchema,
            responses: { 200: githubIntegrationSchema },
            summary: "Connect a GitHub repo for changelog import",
        },
        getGithubIntegration: {
            method: "GET",
            path: "/changelogs/github",
            responses: { 200: githubIntegrationSchema },
            summary: "Get the team's GitHub integration status",
        },
        disconnectGithub: {
            method: "DELETE",
            path: "/changelogs/github",
            responses: { 204: c.noBody() },
            summary: "Disconnect the team's GitHub integration",
        },
        importGithubReleases: {
            method: "POST",
            path: "/changelogs/import-github",
            body: c.noBody(),
            responses: {
                200: importGithubReleasesResponseSchema,
                400: errorSchema,
            },
            summary: "Import GitHub Releases as draft changelog entries",
            description:
                "Lists Releases from the connected repo and creates one draft changelog entry per release, idempotent by meta.github.releaseId (architecture.md §8.1). Nothing is auto-published.",
        },
        ...baseChangelogsContract,
    },
    { metadata: { tag: "Changelog" } },
);

/** The help-center nav tree a "doc" document's `meta.sectionId` points
 * into (architecture.md §5.1), plus semantic search over published docs
 * (§6.4), backed by the pgvector chunks generated on publish. */
const docSectionsContract = c.router(
    {
        create: {
            method: "POST",
            path: "/doc-sections",
            body: createDocSectionBodySchema,
            responses: { 201: docSectionSchema },
            summary: "Create a help-center section",
        },
        list: {
            method: "GET",
            path: "/doc-sections",
            responses: { 200: itemsList(docSectionSchema) },
            summary: "List help-center sections, ordered",
        },
        update: {
            method: "PATCH",
            path: "/doc-sections/:sectionId",
            body: updateDocSectionBodySchema,
            responses: { 200: docSectionSchema, 404: errorSchema },
            summary: "Update a help-center section",
        },
        remove: {
            method: "DELETE",
            path: "/doc-sections/:sectionId",
            responses: { 204: c.noBody(), 404: errorSchema },
            summary: "Delete a help-center section",
        },
        search: {
            method: "GET",
            path: "/help-docs/search",
            query: searchDocsQuerySchema,
            responses: { 200: itemsList(docSearchResultSchema) },
            summary: "Semantic search over the team's published docs",
            description:
                "Embeds `q` and ranks the team's pgvector doc chunks by cosine similarity (architecture.md §6.4).",
        },
    },
    { metadata: { tag: "Docs" } },
);

const publicBlogSchema = makePublicDocumentSchema(blogMetaSchema);
const publicDocSchema = makePublicDocumentSchema(docMetaSchema);
const publicChangelogSchema = makePublicDocumentSchema(changelogMetaSchema);

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
                "Answers only for hosts it actually knows: a team's `<slug>.<PLATFORM_SITE_DOMAIN>` subdomain, or a verified custom domain (architecture.md §12.1/§12.2).",
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
        listBlogs: {
            method: "GET",
            path: "/public/:teamId/blogs",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: { 200: paginated(publicBlogSchema), 404: errorSchema },
            summary: "List a team's published blog posts",
        },
        getBlogBySlug: {
            method: "GET",
            path: "/public/:teamId/blogs/:slug",
            responses: { 200: publicBlogSchema, 404: errorSchema },
            summary: "Get a team's published blog post by slug",
        },
        listDocSections: {
            method: "GET",
            path: "/public/:teamId/doc-sections",
            responses: { 200: itemsList(docSectionSchema), 404: errorSchema },
            summary: "List a team's help-center nav sections",
        },
        searchDocs: {
            method: "GET",
            path: "/public/:teamId/docs/search",
            query: searchDocsQuerySchema,
            responses: {
                200: itemsList(docSearchResultSchema),
                404: errorSchema,
                429: errorSchema,
            },
            summary:
                "Semantic search over a team's published docs (deflection before ticket submission, §11.2)",
        },
        listDocs: {
            method: "GET",
            path: "/public/:teamId/docs",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: { 200: paginated(publicDocSchema), 404: errorSchema },
            summary: "List a team's published docs",
        },
        getDocBySlug: {
            method: "GET",
            path: "/public/:teamId/docs/:slug",
            responses: { 200: publicDocSchema, 404: errorSchema },
            summary: "Get a team's published doc by slug",
        },
        listChangelogs: {
            method: "GET",
            path: "/public/:teamId/changelogs",
            query: z.object({
                offset: z.coerce.number().int().min(1).optional(),
                itemsPerPage: z.coerce.number().int().min(1).optional(),
            }),
            responses: {
                200: paginated(publicChangelogSchema),
                404: errorSchema,
            },
            summary: "List a team's published changelog entries",
        },
        getChangelogBySlug: {
            method: "GET",
            path: "/public/:teamId/changelogs/:slug",
            responses: { 200: publicChangelogSchema, 404: errorSchema },
            summary: "Get a team's published changelog entry by slug",
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
            responses: { 201: ticketWithMessagesSchema, 404: errorSchema },
            summary: "Reply to a ticket as an agent",
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
                "Looks up the required TXT record and flips status to verified on a match. Re-runnable.",
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
        list: {
            method: "GET",
            path: "/contacts",
            query: listContactsQuerySchema,
            responses: { 200: itemsList(contactSchema), 409: errorSchema },
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
    { metadata: { tag: "Newsletter" } },
);

const segmentsContract = c.router(
    {
        create: {
            method: "POST",
            path: "/newsletter/segments",
            body: createSegmentBodySchema,
            responses: { 201: segmentSchema, 409: errorSchema },
            summary: "Create a saved segment",
        },
        list: {
            method: "GET",
            path: "/newsletter/segments",
            responses: { 200: itemsList(segmentSchema), 409: errorSchema },
            summary: "List saved segments",
        },
        update: {
            method: "PATCH",
            path: "/newsletter/segments/:segmentId",
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
            path: "/newsletter/segments/:segmentId",
            responses: { 204: c.noBody(), 404: errorSchema, 409: errorSchema },
            summary: "Delete a saved segment",
        },
    },
    { metadata: { tag: "Newsletter" } },
);

const newsletterContract = c.router(
    {
        getSettings: {
            method: "GET",
            path: "/newsletter",
            responses: { 200: newsletterSettingsSchema },
            summary: "Get the team's SendLit compliance settings",
        },
        updateSettings: {
            method: "PATCH",
            path: "/newsletter",
            body: updateNewsletterSettingsBodySchema,
            responses: { 200: newsletterSettingsSchema, 409: errorSchema },
            summary: "Update the team's SendLit compliance settings",
        },
        listTemplates: {
            method: "GET",
            path: "/newsletter/templates",
            responses: {
                200: itemsList(newsletterTemplateSchema),
                409: errorSchema,
            },
            summary: "List the team's reusable newsletter templates",
        },
        createTemplate: {
            method: "POST",
            path: "/newsletter/templates",
            body: createNewsletterTemplateBodySchema,
            responses: {
                201: newsletterTemplateSchema,
                409: errorSchema,
            },
            summary: "Create a reusable newsletter template",
        },
        updateTemplate: {
            method: "PATCH",
            path: "/newsletter/templates/:templateId",
            body: updateNewsletterTemplateBodySchema,
            responses: {
                200: newsletterTemplateSchema,
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Update a reusable newsletter template",
        },
        listBroadcasts: {
            method: "GET",
            path: "/newsletter/broadcasts",
            responses: { 200: itemsList(broadcastSchema), 409: errorSchema },
            summary: "List broadcasts",
        },
        createBroadcast: {
            method: "POST",
            path: "/newsletter/broadcasts",
            body: createBroadcastBodySchema,
            responses: { 201: broadcastSchema, 409: errorSchema },
            summary: "Create a broadcast (draft)",
        },
        updateBroadcast: {
            method: "PATCH",
            path: "/newsletter/broadcasts/:broadcastId",
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
            path: "/newsletter/broadcasts/:broadcastId/send",
            body: c.noBody(),
            responses: {
                200: z.object({ status: z.string() }),
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Send a broadcast to its audience",
        },
        getBroadcastStats: {
            method: "GET",
            path: "/newsletter/broadcasts/:broadcastId/stats",
            responses: {
                200: z.record(z.any()),
                404: errorSchema,
                409: errorSchema,
            },
            summary: "Get delivery/open/click stats for a broadcast",
        },
    },
    { metadata: { tag: "Newsletter" } },
);

export const contract = c.router({
    teams: teamsContract,
    teamInvitations: teamInvitationsContract,
    provisioning: provisioningContract,
    pages: pagesContract,
    themes: themesContract,
    media: mediaContract,
    blogs: blogsContract,
    docs: docsContract,
    changelogs: changelogsContract,
    docSections: docSectionsContract,
    contacts: contactsContract,
    segments: segmentsContract,
    newsletter: newsletterContract,
    chatbot: chatbotContract,
    ai: aiContract,
    tickets: ticketsContract,
    domains: domainsContract,
    settings: settingsContract,
    public: publicContract,
});

export type Contract = typeof contract;
