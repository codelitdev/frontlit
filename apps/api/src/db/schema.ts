import {
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { genId, genPublicId } from "./id";

/**
 * Better Auth core tables + the `jwt()`/`oauthProvider()` plugin tables
 * (OAuth2 authorization server), shared verbatim across CodeLit's
 * Express/Drizzle apps — see `@codelitdev/oauth-server-kit`. Custom
 * modelNames configured in auth/better-auth.ts to avoid colliding with the
 * app's own `accounts`/`teams` tables below.
 */
export {
    authUser,
    authSession,
    authAccount,
    authVerification,
    jwks,
    authOAuthClient,
    authOAuthRefreshToken,
    authOAuthAccessToken,
    authOAuthConsent,
} from "@codelitdev/oauth-server-kit";
import { authSession, authUser } from "@codelitdev/oauth-server-kit";

/**
 * ID convention: every table has an internal UUIDv7 `id` (surrogate PK,
 * never exposed) and a public `<prefix>_...` id (the only id ever exposed
 * to API/MCP consumers), enforced by a CHECK constraint on the prefix.
 * Mirrors the convention used across FrontLit's sibling projects.
 */
function publicIdCheck(column: string, prefix: string) {
    return check(`${column}_prefix_check`, sql.raw(`"${column}" LIKE '${prefix}\\_%' ESCAPE '\\'`));
}

// ---------------------------------------------------------------------------
// Domain tables: login identity (accounts) and multi-tenancy (teams).
// Better Auth only owns login identity/session; teams, membership and API
// keys are hand-rolled here rather than a better-auth "organization" plugin.
// ---------------------------------------------------------------------------

export const accounts = pgTable("accounts", {
    id: text("id").primaryKey().$defaultFn(genId),
    /** Null until the account's owner actually signs in via Better Auth —
     * provisioning (server-to-server) creates a bare account by email only,
     * linked lazily on first real login (see auth/better-auth.ts). */
    authUserId: text("auth_user_id")
        .unique()
        .references(() => authUser.id, { onDelete: "set null" }),
    email: text("email").notNull().unique(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** A team owns exactly one website. Its FrontLit subdomain is selected during
 * setup (not inferred from a person's name or email), and is
 * environment-independent; the full hostname is assembled from
 * `PLATFORM_SITE_DOMAIN` at runtime. A team may additionally attach one
 * verified custom domain. */
export const customDomainStatuses = ["pending", "verified", "failed"] as const;
export type CustomDomainStatus = (typeof customDomainStatuses)[number];

export const teams = pgTable(
    "teams",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("team")),
        name: text("name").notNull(),
        ownerAccountId: text("owner_account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        externalId: text("external_id").unique(),
        subdomain: text("subdomain").unique(),
        customDomain: text("custom_domain").unique(),
        customDomainStatus: text("custom_domain_status", {
            enum: customDomainStatuses,
        }),
        customDomainVerificationToken: text("custom_domain_verification_token"),
        customDomainVerifiedAt: timestamp("custom_domain_verified_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    () => [
        publicIdCheck("team_id", "team"),
        check(
            "teams_custom_domain_state_check",
            sql`(
                ("custom_domain" IS NULL
                    AND "custom_domain_status" IS NULL
                    AND "custom_domain_verification_token" IS NULL
                    AND "custom_domain_verified_at" IS NULL)
                OR
                ("custom_domain" IS NOT NULL
                    AND "custom_domain_status" IS NOT NULL
                    AND "custom_domain_verification_token" IS NOT NULL
                    AND ("custom_domain_status" <> 'verified' OR "custom_domain_verified_at" IS NOT NULL))
            )`,
        ),
    ],
);

export const teamMembers = pgTable(
    "team_members",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        accountId: text("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("team_members_team_account_idx").on(table.teamId, table.accountId)],
);

/**
 * Team selected during an OAuth authorization flow. Generic OAuth/MCP
 * clients do not send FrontLit's dashboard-specific team header, so the
 * selected internal team id is carried through Better Auth's referenceId and
 * emitted as a `team_id` access-token claim.
 */
export const oauthPostLoginTeamSelections = pgTable(
    "oauth_post_login_team_selections",
    {
        sessionId: text("session_id")
            .primaryKey()
            .references(() => authSession.id, { onDelete: "cascade" }),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
);

export const apiKeys = pgTable(
    "api_keys",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        name: text("name"),
        keyHash: text("key_hash").notNull().unique(),
        keyPrefix: text("key_prefix").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [index("api_keys_team_idx").on(table.teamId)],
);

// ---------------------------------------------------------------------------
// Product domain: pages (built with @frontlit/page-builder) and saved themes.
// ---------------------------------------------------------------------------

export const themes = pgTable(
    "themes",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        themeId: text("theme_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("thm")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        style: jsonb("style").$type<Record<string, unknown>>().notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [index("themes_team_idx").on(table.teamId), publicIdCheck("theme_id", "thm")],
);

export type WidgetInstanceRow = {
    widgetId: string;
    name: string;
    deleteable: boolean;
    shared: boolean;
    settings?: Record<string, unknown>;
};

export type SharedWidgetsRow = {
    header: WidgetInstanceRow;
    footer: WidgetInstanceRow;
};

/** Team-level shared layout blocks. Page rows retain only a header/footer
 * placeholder (and its page-local widget id); these settings are hydrated
 * into every page at read time, matching CourseLit's shared-widget model. */
export const DEFAULT_SHARED_WIDGETS: SharedWidgetsRow = {
    header: {
        widgetId: "shared-header",
        name: "header",
        deleteable: false,
        shared: true,
        settings: {},
    },
    footer: {
        widgetId: "shared-footer",
        name: "footer",
        deleteable: false,
        shared: true,
        settings: {},
    },
};

// ---------------------------------------------------------------------------
// Documents (architecture.md §5): the shared blog / docs / changelog engine.
// One table, one `kind` discriminator, one draft/publish queries module —
// blog posts, help docs and changelog entries differ only in kind-specific
// `meta` and in their public REST surface (three thin kind-scoped routers).
// ---------------------------------------------------------------------------

export const documentKinds = ["blog", "doc", "changelog"] as const;
export type DocumentKind = (typeof documentKinds)[number];

/** Matches `@frontlit/text-editor`'s `TextEditorContent` shape. Kept as a
 * plain local type (not imported from the package) so this Node server
 * never pulls in the editor's browser/React dependency graph — to this
 * table, content is opaque TipTap JSON. */
export type TextEditorContentRow = {
    type: "doc";
    content: Record<string, unknown>[];
};

export const documents = pgTable(
    "documents",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        documentId: text("document_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("doc")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        kind: text("kind", { enum: documentKinds }).notNull(),
        slug: text("slug").notNull(),

        // Published side — read by the public site + public API. Only ever
        // written by `publish()`, which copies the draft columns into these.
        title: text("title"),
        content: jsonb("content").$type<TextEditorContentRow>(),
        excerpt: text("excerpt"),
        featuredImage: jsonb("featured_image").$type<Record<string, unknown>>(),
        meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
        publishedAt: timestamp("published_at"),

        // Draft side — written by every editor save. `publish()` copies
        // these into the published columns; `discardDraft()` does the
        // reverse. Unlike pages, a document always has draft content (there's
        // no "empty until first save" state — creation seeds an empty doc).
        draftTitle: text("draft_title").notNull(),
        draftContent: jsonb("draft_content").$type<TextEditorContentRow>().notNull(),
        draftExcerpt: text("draft_excerpt"),
        draftFeaturedImage: jsonb("draft_featured_image").$type<Record<string, unknown>>(),
        draftMeta: jsonb("draft_meta").$type<Record<string, unknown>>().notNull().default({}),

        authorAccountId: text("author_account_id").references(() => accounts.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("documents_team_kind_slug_idx").on(table.teamId, table.kind, table.slug),
        index("documents_team_kind_idx").on(table.teamId, table.kind),
        index("documents_published_idx").on(table.teamId, table.kind, table.publishedAt),
        publicIdCheck("document_id", "doc"),
    ],
);

// ---------------------------------------------------------------------------
// Documentation (architecture.md §5.1/§6): help-center nav sections for the
// "doc" document kind, and the pgvector chunks used for search/RAG.
// ---------------------------------------------------------------------------

export const docSections = pgTable(
    "doc_sections",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        sectionId: text("section_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("sec")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        slug: text("slug").notNull(),
        order: integer("order").notNull().default(0),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        uniqueIndex("doc_sections_team_slug_idx").on(table.teamId, table.slug),
        index("doc_sections_team_idx").on(table.teamId),
        publicIdCheck("section_id", "sec"),
    ],
);

/** 1536 dims matches `text-embedding-3-small` (and this repo's deterministic
 * local fallback provider — see `documentation/embeddings.ts`). */
export const documentChunks = pgTable(
    "document_chunks",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        documentId: text("document_id")
            .notNull()
            .references(() => documents.id, { onDelete: "cascade" }),
        heading: text("heading"),
        anchor: text("anchor"),
        content: text("content").notNull(),
        embedding: vector("embedding", { dimensions: 1536 }).notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("document_chunks_team_idx").on(table.teamId),
        index("document_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    ],
);

// ---------------------------------------------------------------------------
// Chatbot (architecture.md §7): per-team RAG chat settings.
// ---------------------------------------------------------------------------

export type ChatbotWidgetVariant = "bubble" | "text_input";
export type ChatbotWidgetStyleRow = {
    bubbleShape?: "circle" | "rounded" | "square";
    bubbleIcon?: "chat" | "message" | "sparkles" | "bot";
    bubbleSize?: "sm" | "md" | "lg";
    inputRadius?: "none" | "sm" | "md" | "lg" | "full";
    inputPlaceholder?: string | null;
    inputWidth?: "sm" | "md" | "lg";
};

export const chatbotSettings = pgTable("chatbot_settings", {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
        .notNull()
        .unique()
        .references(() => teams.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    name: text("name").notNull().default("Assistant"),
    greeting: text("greeting"),
    accentColor: text("accent_color"),
    /** Offer "talk to a human" (creates a help-desk ticket, §11.3) when the
     * bot can't answer. Independent of the help desk being used at all. */
    escalationEnabled: boolean("escalation_enabled").notNull().default(false),
    /** Public launcher: classic bubble button vs bottom text-input bar. */
    variant: text("variant", { enum: ["bubble", "text_input"] }).notNull().default("bubble"),
    /** Visual knobs for the selected launcher variant. */
    widgetStyle: jsonb("widget_style").$type<ChatbotWidgetStyleRow>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Media library (architecture.md §9): FrontLit's own record of files
// uploaded through MediaLit. FrontLit never stores file bytes — `mediaLitId`
// is the source of truth on MediaLit's side; this row is metadata + cache of
// the sealed (permanent) URL for fast, team-scoped listing.
// ---------------------------------------------------------------------------

export const media = pgTable(
    "media",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        mediaId: text("media_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("med")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        mediaLitId: text("media_lit_id").notNull(),
        url: text("url").notNull(),
        thumbnailUrl: text("thumbnail_url"),
        fileName: text("file_name"),
        mimeType: text("mime_type"),
        size: integer("size"),
        alt: text("alt"),
        caption: text("caption"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        index("media_team_idx").on(table.teamId, table.createdAt),
        uniqueIndex("media_team_medialit_idx").on(table.teamId, table.mediaLitId),
        publicIdCheck("media_id", "med"),
    ],
);

// ---------------------------------------------------------------------------
// Integrations (architecture.md §8.1): per-team third-party connections.
// v1 has one provider ("github"), config is provider-shaped jsonb holding
// secrets (PAT) — never returned verbatim over the API (see routes.ts).
// ---------------------------------------------------------------------------

export const integrationProviders = ["github", "sendlit"] as const;
export type IntegrationProvider = (typeof integrationProviders)[number];

export const integrations = pgTable(
    "integrations",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        provider: text("provider", { enum: integrationProviders }).notNull(),
        config: jsonb("config").$type<Record<string, unknown>>().notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [uniqueIndex("integrations_team_provider_idx").on(table.teamId, table.provider)],
);

// ---------------------------------------------------------------------------
// Team settings (branding + code injection). One row per team, lazily
// created on first read — mirrors chatbotSettings.
// ---------------------------------------------------------------------------

export const teamSettings = pgTable("team_settings", {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
        .notNull()
        .unique()
        .references(() => teams.id, { onDelete: "cascade" }),
    title: text("title"),
    subtitle: text("subtitle"),
    logo: jsonb("logo").$type<Record<string, unknown>>(),
    codeInjectionHead: text("code_injection_head"),
    codeInjectionBody: text("code_injection_body"),
    /** Published and draft copies follow the same promotion model as page
     * layouts. They are intentionally not exposed by the generic settings
     * API; page reads hydrate them into the layout instead. */
    sharedWidgets: jsonb("shared_widgets")
        .$type<SharedWidgetsRow>()
        .notNull()
        .default(DEFAULT_SHARED_WIDGETS),
    draftSharedWidgets: jsonb("draft_shared_widgets")
        .$type<SharedWidgetsRow>()
        .notNull()
        .default(DEFAULT_SHARED_WIDGETS),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Help desk (architecture.md §11): support tickets and persisted chatbot
// conversations raised from the public site, API, or workspace.
// ---------------------------------------------------------------------------

export const ticketStatuses = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

/** "form" = support-form page-builder block, "chatbot" = RAG escalation
 * (§11.2), "api" = headless MCP/REST submission. */
export const ticketSources = ["form", "chatbot", "api"] as const;
export type TicketSource = (typeof ticketSources)[number];

export const tickets = pgTable(
    "tickets",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        ticketId: text("ticket_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("tkt")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        subject: text("subject").notNull(),
        status: text("status", { enum: ticketStatuses }).notNull().default("open"),
        /** Null for an anonymous chatbot visitor. Support-form and API
         * tickets always provide an email address. */
        requesterEmail: text("requester_email"),
        requesterName: text("requester_name"),
        source: text("source", { enum: ticketSources }).notNull().default("form"),
        /** SHA-256 hash of the visitor's magic-link token (§13.4); never store
         * the raw token. */
        accessTokenHash: text("access_token_hash").notNull(),
        assigneeAccountId: text("assignee_account_id").references(() => accounts.id, { onDelete: "set null" }),
        lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        index("tickets_team_status_idx").on(table.teamId, table.status, table.lastMessageAt),
        publicIdCheck("ticket_id", "tkt"),
    ],
);

export const ticketMessageAuthors = ["requester", "agent", "bot"] as const;
export type TicketMessageAuthor = (typeof ticketMessageAuthors)[number];

export const ticketMessages = pgTable(
    "ticket_messages",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        messageId: text("message_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("tmsg")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        ticketId: text("ticket_id")
            .notNull()
            .references(() => tickets.id, { onDelete: "cascade" }),
        author: text("author", { enum: ticketMessageAuthors }).notNull(),
        authorAccountId: text("author_account_id").references(() => accounts.id, { onDelete: "set null" }),
        content: jsonb("content").$type<TextEditorContentRow>().notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [index("ticket_messages_ticket_idx").on(table.ticketId), publicIdCheck("message_id", "tmsg")],
);

// ---------------------------------------------------------------------------
// Newsletter (architecture.md §10): FrontLit stores no contact data of its
// own — SendLit is the system of record. This is just the outbox: durable,
// retryable background jobs (contact sync on lead capture, SendLit team
// re-provisioning on transient failure) so a public lead-capture request
// never depends on SendLit being reachable.
// ---------------------------------------------------------------------------

export const outboxJobTypes = ["contact_sync", "provision_sendlit"] as const;
export type OutboxJobType = (typeof outboxJobTypes)[number];

export const outboxJobStatuses = ["pending", "processing", "done", "failed"] as const;
export type OutboxJobStatus = (typeof outboxJobStatuses)[number];

export const outboxJobs = pgTable(
    "outbox_jobs",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        type: text("type", { enum: outboxJobTypes }).notNull(),
        payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
        status: text("status", { enum: outboxJobStatuses }).notNull().default("pending"),
        attempts: integer("attempts").notNull().default(0),
        lastError: text("last_error"),
        nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [index("outbox_jobs_poll_idx").on(table.status, table.nextAttemptAt)],
);

export const pages = pgTable(
    "pages",
    {
        id: text("id").primaryKey().$defaultFn(genId),
        pageId: text("page_id")
            .notNull()
            .unique()
            .$defaultFn(() => genPublicId("pg")),
        teamId: text("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        type: text("type", { enum: ["site", "blog", "landing", "post", "custom"] }).notNull(),
        slug: text("slug").notNull(),
        deleteable: boolean("deleteable").notNull().default(true),
        // Logical theme reference: a built-in id such as "learning", or a
        // saved theme's public `thm_*` id. Public ids keep this boundary
        // consistent with the pages/themes API and let system themes work
        // without manufacturing database rows for them.
        themeId: text("theme_id"),

        // Published side — read by public rendering. Only ever written by
        // `publish()`, which copies the draft columns below into these.
        layout: jsonb("layout").$type<WidgetInstanceRow[]>().notNull().default([]),
        title: text("title"),
        description: text("description"),
        socialImage: jsonb("social_image").$type<Record<string, unknown>>(),
        robotsAllowed: boolean("robots_allowed"),
        publishedAt: timestamp("published_at"),

        // Draft side — written by every builder/editor save. `publish()`
        // copies these into the published columns; `discardDraft()` does
        // the reverse.
        draftLayout: jsonb("draft_layout").$type<WidgetInstanceRow[]>().notNull().default([]),
        draftTitle: text("draft_title"),
        draftDescription: text("draft_description"),
        draftSocialImage: jsonb("draft_social_image").$type<Record<string, unknown>>(),
        draftRobotsAllowed: boolean("draft_robots_allowed"),

        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        index("pages_team_idx").on(table.teamId),
        uniqueIndex("pages_team_slug_idx").on(table.teamId, table.slug),
        publicIdCheck("page_id", "pg"),
    ],
);
