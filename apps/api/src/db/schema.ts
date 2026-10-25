import {
  bigint,
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

export {
  authUser,
  authSession,
  authAccount,
  authVerification,
  jwks,
  authOAuthClient,
  authOAuthResource,
  authOAuthClientResource,
  authOAuthRefreshToken,
  authOAuthAccessToken,
  authOAuthConsent,
  authOAuthClientAssertion,
} from "./auth-schema";
import { authSession, authUser } from "./auth-schema";

/**
 * ID convention: every table has an internal UUIDv7 `id` (surrogate PK,
 * never exposed) and a public `<prefix>_...` id (the only id ever exposed
 * to API/MCP consumers), enforced by a CHECK constraint on the prefix.
 * Mirrors the convention used across FrontLit's sibling projects.
 */
function publicIdCheck(column: string, prefix: string) {
  return check(
    `${column}_prefix_check`,
    sql.raw(`"${column}" LIKE '${prefix}\\_%' ESCAPE '\\'`),
  );
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
 * custom domain (an apex/www pair, see `customDomains`). Once a custom host
 * is verified the subdomain 301-redirects to it unless `redirectSubdomain`
 * is off. */
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
      .references(() => accounts.id, { onDelete: "restrict" }),
    externalId: text("external_id").unique(),
    subdomain: text("subdomain").unique(),
    redirectSubdomain: boolean("redirect_subdomain").notNull().default(true),
    /** Pre-launch: every host serves `noindex`, robots.txt disallows all and
     * the sitemap is empty. On for new sites; cleared when a custom domain is
     * first verified. */
    hideFromSearch: boolean("hide_from_search").notNull().default(true),
    customDomainCnameTarget: text("custom_domain_cname_target"),
    customDomainTxtRecordName: text("custom_domain_txt_record_name"),
    /** One ownership TXT token shared by every host in `customDomains`. */
    customDomainVerificationToken: text("custom_domain_verification_token"),
    customDomainTxtSatisfied: boolean("custom_domain_txt_satisfied"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  () => [publicIdCheck("team_id", "team")],
);

/** The hosts of a team's custom domain: the typed hostname plus, for an
 * apex or `www.` host, its pair. Each host's routing is verified
 * independently; exactly one is `primary` (the canonical host once
 * verified). */
export const customDomains = pgTable(
  "custom_domains",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    primary: boolean("primary").notNull().default(false),
    status: text("status", { enum: customDomainStatuses }).notNull().default("pending"),
    routingSatisfied: boolean("routing_satisfied"),
    verifiedAt: timestamp("verified_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("custom_domains_team_idx").on(table.teamId),
    check(
      "custom_domains_verified_at_check",
      sql`("status" <> 'verified' OR "verified_at" IS NOT NULL)`,
    ),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    memberId: text("member_id")
      .notNull()
      .unique()
      .$defaultFn(() => genPublicId("tmem")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] })
      .notNull()
      .default("member"),
    permissions: text("permissions").array().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("team_members_team_account_idx").on(table.teamId, table.accountId),
    publicIdCheck("member_id", "tmem"),
  ],
);

export const invitationStatuses = [
  "pending",
  "accepted",
  "rejected",
  "revoked",
  "expired",
] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    invitationId: text("invitation_id")
      .notNull()
      .unique()
      .$defaultFn(() => genPublicId("tinv")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    permissions: text("permissions").array().notNull().default([]),
    invitedByAccountId: text("invited_by_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    tokenHash: text("token_hash").notNull().unique(),
    status: text("status", { enum: invitationStatuses }).notNull().default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    acceptedAt: timestamp("accepted_at"),
    rejectedAt: timestamp("rejected_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    publicIdCheck("invitation_id", "tinv"),
    uniqueIndex("team_invitations_pending_team_email_idx")
      .on(table.teamId, table.email)
      .where(sql`${table.status} = 'pending'`),
    index("team_invitations_team_created_idx").on(table.teamId, table.createdAt),
    index("team_invitations_team_email_idx").on(table.teamId, table.email),
    index("team_invitations_expires_idx").on(table.expiresAt),
  ],
);

export const authorizationAuditEventTypes = [
  "invitation.created",
  "invitation.resent",
  "invitation.accepted",
  "invitation.rejected",
  "invitation.expired",
  "invitation.revoked",
  "member.permissions_changed",
  "member.removed",
  "member.left",
  "ownership.transferred",
  "api_key.created",
  "api_key.revoked",
] as const;
export type AuthorizationAuditEventType = (typeof authorizationAuditEventTypes)[number];

export const authorizationAuditEvents = pgTable(
  "authorization_audit_events",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    eventType: text("event_type", {
      enum: authorizationAuditEventTypes,
    }).notNull(),
    teamPublicId: text("team_public_id").notNull(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    targetMemberId: text("target_member_id"),
    targetEmail: text("target_email"),
    beforePermissions: text("before_permissions").array(),
    afterPermissions: text("after_permissions").array(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("authorization_audit_team_created_idx").on(
      table.teamPublicId,
      table.createdAt,
    ),
    index("authorization_audit_expires_idx").on(table.expiresAt),
  ],
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
  (table) => [
    index("themes_team_idx").on(table.teamId),
    publicIdCheck("theme_id", "thm"),
  ],
);

export type WidgetInstanceRow = {
  widgetId: string;
  name: string;
  deletable: boolean;
  moveable: boolean;
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
    deletable: false,
    moveable: false,
    shared: true,
    // Slider value 1 (`py-4`). Without this the header inherits the
    // theme's content-section padding and renders much taller than a nav.
    settings: { verticalPadding: "py-4" },
  },
  footer: {
    widgetId: "shared-footer",
    name: "footer",
    deletable: false,
    moveable: false,
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
    draftVersion: integer("draft_version").notNull().default(1),
    draftSlug: text("draft_slug"),
    draftMarkdown: text("draft_markdown"),
    draftHash: text("draft_hash"),
    draftGitSource: jsonb("draft_git_source").$type<{
      sourcePath: string;
      base: { commitSha: string; sourcePath: string; sourceHash: string } | null;
    }>(),
    draftTitle: text("draft_title").notNull(),
    draftContent: jsonb("draft_content").$type<TextEditorContentRow>().notNull(),
    draftExcerpt: text("draft_excerpt"),
    draftFeaturedImage: jsonb("draft_featured_image").$type<Record<string, unknown>>(),
    draftMeta: jsonb("draft_meta")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    authorAccountId: text("author_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("documents_team_kind_slug_idx")
      .on(table.teamId, table.kind, table.slug)
      .where(sql`${table.kind} <> 'doc'`),
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
    index("document_chunks_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const documentIndexJobStatuses = [
  "queued",
  "running",
  "done",
  "failed",
] as const;
export type DocumentIndexJobStatus = (typeof documentIndexJobStatuses)[number];

/** One durable index job per document. Publish and AI-config changes enqueue
 * (or re-enqueue) instead of embedding inline on the request. */
export const documentIndexJobs = pgTable(
  "document_index_jobs",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    status: text("status", { enum: documentIndexJobStatuses })
      .notNull()
      .default("queued"),
    generation: integer("generation").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    uniqueIndex("document_index_jobs_document_idx").on(table.documentId),
    index("document_index_jobs_poll_idx").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
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
  variant: text("variant", { enum: ["bubble", "text_input"] })
    .notNull()
    .default("bubble"),
  /** Visual knobs for the selected launcher variant. */
  widgetStyle: jsonb("widget_style")
    .$type<ChatbotWidgetStyleRow>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// AI provider configuration. Credentials are AES-GCM encrypted before they
// reach this table and are deliberately never included in API responses.
// ---------------------------------------------------------------------------

export const aiProviderNames = [
  "openai",
  "azure",
  "anthropic",
  "openrouter",
  "bedrock",
  "opencode",
] as const;
export type AiProviderName = (typeof aiProviderNames)[number];

export const aiSettings = pgTable("ai_settings", {
  id: text("id").primaryKey().$defaultFn(genId),
  teamId: text("team_id")
    .notNull()
    .unique()
    .references(() => teams.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: aiProviderNames }).notNull(),
  /** Deprecated single-model setting retained to migrate existing teams. */
  model: text("model"),
  modelSettings: jsonb("model_settings")
    .$type<{
      chatbot?: string | null;
      grammar?: string | null;
      builder?: string | null;
    }>()
    .notNull()
    .default({}),
  region: text("region"),
  azureEndpoint: text("azure_endpoint"),
  encryptedApiKey: text("encrypted_api_key"),
  embeddingProvider: text("embedding_provider", {
    enum: ["openai", "azure"],
  }),
  encryptedEmbeddingApiKey: text("encrypted_embedding_api_key"),
  embeddingDeployment: text("embedding_deployment"),
  embeddingEndpoint: text("embedding_endpoint"),
  indexArticles: boolean("index_articles").notNull().default(false),
  indexChangelog: boolean("index_changelog").notNull().default(false),
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
    uniqueIndex("media_medialit_idx").on(table.mediaLitId),
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
  (table) => [
    uniqueIndex("integrations_team_provider_idx").on(table.teamId, table.provider),
  ],
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
  /** One theme for the entire public FrontLit site. System themes use their
   * logical id; custom themes use their public `thm_*` id. */
  themeId: text("theme_id"),
  codeInjectionHead: text("code_injection_head"),
  codeInjectionBody: text("code_injection_body"),
  /** Draft header/footer. Publishing copies them into the new release's
   * site snapshot. Not exposed by the generic settings API; page reads
   * hydrate them into the layout instead. */
  draftSharedWidgets: jsonb("draft_shared_widgets")
    .$type<SharedWidgetsRow>()
    .notNull()
    .default(DEFAULT_SHARED_WIDGETS),
  /** The live site: every public page, sitemap and chrome read comes from
   * this release. Swapped atomically on publish, Git sync and rollback. */
  activeReleaseId: text("active_release_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Site releases: immutable snapshots of every published page plus site
// chrome. Publishing (builder or Git) creates a release and activates it;
// rollback re-activates an older one.
// ---------------------------------------------------------------------------

/** Canonical page content (`PageDocument` from `@frontlit/page-builder/schema`,
 * minus the `published` flag). Header/footer are not part of it. */
export type PageRevisionContent = {
  title?: string;
  description?: string;
  socialImage?: { url: string; alt?: string };
  robotsAllowed?: boolean;
  layout: { name: string; settings?: Record<string, unknown> }[];
};

/** Content-addressed: `hash` is the sha256 of the canonical page file, so
 * identical content (from the builder or a repo) shares one revision. */
export const pageRevisions = pgTable(
  "page_revisions",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    content: jsonb("content").$type<PageRevisionContent>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("page_revisions_team_hash_idx").on(table.teamId, table.hash)],
);

export type SiteReleaseSnapshot = {
  header: Record<string, unknown>;
  footer: Record<string, unknown>;
  /** Set when the site comes from a repo's `site.json`; otherwise the
   * team's selected theme applies. */
  theme?: Record<string, unknown>;
  redirects?: { from: string; to: string; permanent?: boolean }[];
};

/** "preview": built from a pull request's head; never activated. */
export const siteReleaseSources = ["builder", "git", "preview"] as const;
export type SiteReleaseSource = (typeof siteReleaseSources)[number];

export const siteReleases = pgTable(
  "site_releases",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    releaseId: text("release_id")
      .notNull()
      .unique()
      .$defaultFn(() => genPublicId("rel")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    source: text("source", { enum: siteReleaseSources }).notNull(),
    /** Git commit the release was built from. */
    commitSha: text("commit_sha"),
    /** Docs publication activated together with this release (Git releases
     * that include docs). Builder releases leave docs alone. */
    docsPublicationId: text("docs_publication_id"),
    site: jsonb("site").$type<SiteReleaseSnapshot>().notNull(),
    /** One line on what changed, e.g. "Published Pricing". */
    summary: text("summary"),
    /** Git releases: the pages source key they were built from. */
    sourceKey: text("source_key"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("site_releases_team_idx").on(table.teamId, table.createdAt),
    publicIdCheck("release_id", "rel"),
  ],
);

/** Repo images uploaded to MediaLit by the pages importer, keyed by blob
 * SHA so an unchanged image is uploaded once. */
export const gitAssets = pgTable(
  "git_assets",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    blobSha: text("blob_sha").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("git_assets_team_blob_idx").on(table.teamId, table.blobSha)],
);

/** Pull requests FrontLit opened against a Git-owned pages folder: a
 * builder draft ("page") or the export of existing pages ("setup"). */
export const pagePullRequests = pgTable(
  "page_pull_requests",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["page", "setup"] }).notNull(),
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    branch: text("branch").notNull(),
    baseSha: text("base_sha").notNull(),
    commitSha: text("commit_sha").notNull(),
    number: integer("number").notNull(),
    url: text("url").notNull(),
    status: text("status", { enum: ["open", "merged", "closed"] })
      .notNull()
      .default("open"),
    /** Setup PRs: the pages folder they create; merging turns pages sync on. */
    directory: text("directory"),
    /** Setup PRs: the exported files' paths and canonical hashes. */
    files: jsonb("files").$type<{ path: string; hash: string }[]>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("page_pull_requests_team_idx").on(table.teamId, table.createdAt)],
);

export const siteReleasePages = pgTable(
  "site_release_pages",
  {
    releaseId: text("release_id")
      .notNull()
      .references(() => siteReleases.id, { onDelete: "cascade" }),
    /** The builder page this entry publishes; null once the page is deleted
     * (the release still renders it if re-activated). */
    pageId: text("page_id").references(() => pages.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => pageRevisions.id),
  },
  (table) => [
    uniqueIndex("site_release_pages_slug_idx").on(table.releaseId, table.slug),
    index("site_release_pages_page_idx").on(table.pageId),
  ],
);

// ---------------------------------------------------------------------------
// Help desk (architecture.md §11): support tickets and persisted chatbot
// conversations raised from the public site, API, or workspace.
// ---------------------------------------------------------------------------

export const ticketStatuses = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];

/** "form" = support-form page-builder block, "chatbot" = RAG escalation
 * (§11.2), "api" = headless MCP/REST submission, "email" = inbound
 * support@ mailbox. */
export const ticketSources = ["form", "chatbot", "api", "email"] as const;
export type TicketSource = (typeof ticketSources)[number];

export const ticketAiStates = [
  "idle",
  "generating",
  "waiting",
  "escalated",
  "taken_over",
] as const;
export type TicketAiState = (typeof ticketAiStates)[number];

export const ticketAiStopReasons = [
  "visitor_request",
  "unsure",
  "empty_retrieval",
  "topic",
  "turn_cap",
  "agent_takeover",
] as const;
export type TicketAiStopReason = (typeof ticketAiStopReasons)[number];

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
    /** SHA-256 hash of the visitor's first magic-link token. Additional
     * grants live in `ticket_access_grants`; this column stays so older
     * links remain valid. */
    accessTokenHash: text("access_token_hash").notNull(),
    assigneeAccountId: text("assignee_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    aiState: text("ai_state", {
      enum: ticketAiStates,
    })
      .notNull()
      .default("idle"),
    aiGeneration: integer("ai_generation").notNull().default(0),
    aiTriggerMessageId: text("ai_trigger_message_id"),
    aiStopReason: text("ai_stop_reason", {
      enum: ticketAiStopReasons,
    }),
    aiStoppedAt: timestamp("ai_stopped_at"),
    lastMessageAt: timestamp("last_message_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("tickets_team_status_idx").on(
      table.teamId,
      table.status,
      table.lastMessageAt,
    ),
    publicIdCheck("ticket_id", "tkt"),
  ],
);

export const ticketMessageAuthors = ["requester", "agent", "bot"] as const;
export type TicketMessageAuthor = (typeof ticketMessageAuthors)[number];

export type TicketMessageSource = {
  kind?: "blog" | "doc" | "changelog" | "api-operation";
  revisionId?: string;
  publicationId?: string | null;
  policyEpoch?: number;
  evidenceId?: string;
  url?: string;
  documentId: string;
  slug: string;
  title: string | null;
  anchor: string | null;
};

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
    authorAccountId: text("author_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    content: jsonb("content").$type<TextEditorContentRow>().notNull(),
    sources: jsonb("sources")
      .$type<TicketMessageSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ticket_messages_ticket_idx").on(table.ticketId),
    publicIdCheck("message_id", "tmsg"),
  ],
);

/** Files shared on a ticket thread. Stored in MediaLit, never the media
 * library table. Ticket (and message) delete cascades the row. */
export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    attachmentId: text("attachment_id")
      .notNull()
      .unique()
      .$defaultFn(() => genPublicId("att")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => ticketMessages.id, {
      onDelete: "cascade",
    }),
    mediaLitId: text("media_lit_id").notNull(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("ticket_attachments_ticket_idx").on(table.ticketId),
    index("ticket_attachments_message_idx").on(table.messageId),
    publicIdCheck("attachment_id", "att"),
  ],
);

export const inboxAiChannels = ["chatbot", "tickets"] as const;
export type InboxAiChannel = (typeof inboxAiChannels)[number];

export const inboxAiSettings = pgTable(
  "inbox_ai_settings",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: inboxAiChannels }).notNull(),
    autoReply: boolean("auto_reply").notNull().default(false),
    escalateOnVisitorRequest: boolean("escalate_on_visitor_request")
      .notNull()
      .default(true),
    escalateWhenUnsure: boolean("escalate_when_unsure").notNull().default(true),
    escalateTopics: text("escalate_topics")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    escalateAfterBotTurns: integer("escalate_after_bot_turns"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("inbox_ai_settings_team_channel_idx").on(table.teamId, table.channel),
  ],
);

export const inboxAiRunStatuses = [
  "queued",
  "generating",
  "succeeded",
  "skipped",
  "failed",
] as const;
export type InboxAiRunStatus = (typeof inboxAiRunStatuses)[number];

export type InboxAiRetrievalHit = {
  revisionId?: string;
  publicationId?: string | null;
  policyEpoch?: number;
  evidenceId?: string;
  documentId: string;
  slug: string;
  title: string | null;
  heading: string | null;
  anchor: string | null;
  similarity: number;
  kind?: "blog" | "doc" | "changelog" | "api-operation";
};

export const inboxAiRuns = pgTable(
  "inbox_ai_runs",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    triggerMessageId: text("trigger_message_id")
      .notNull()
      .references(() => ticketMessages.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: inboxAiChannels }).notNull(),
    status: text("status", { enum: inboxAiRunStatuses }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    skipReason: text("skip_reason"),
    stopReason: text("stop_reason"),
    lastError: text("last_error"),
    retrieval: jsonb("retrieval")
      .$type<InboxAiRetrievalHit[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    uniqueIndex("inbox_ai_runs_ticket_trigger_idx").on(
      table.ticketId,
      table.triggerMessageId,
    ),
    index("inbox_ai_runs_poll_idx").on(
      table.status,
      table.leaseExpiresAt,
      table.createdAt,
    ),
  ],
);

export const ticketAccessGrants = pgTable(
  "ticket_access_grants",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("ticket_access_grants_ticket_idx").on(table.ticketId)],
);

export const aiUsageDaily = pgTable(
  "ai_usage_daily",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    usageDate: text("usage_date").notNull(),
    reservedTokens: integer("reserved_tokens").notNull().default(0),
    usedTokens: integer("used_tokens").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_usage_daily_team_date_idx").on(table.teamId, table.usageDate),
  ],
);

export const ticketMailKinds = ["receipt", "reply"] as const;
export type TicketMailKind = (typeof ticketMailKinds)[number];

export const ticketMailStatuses = ["pending", "sending", "sent", "failed"] as const;
export type TicketMailStatus = (typeof ticketMailStatuses)[number];

export const ticketMailOutbox = pgTable(
  "ticket_mail_outbox",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    kind: text("kind", { enum: ticketMailKinds }).notNull(),
    status: text("status", { enum: ticketMailStatuses }).notNull().default("pending"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ticket_mail_outbox_ticket_seq_idx").on(table.ticketId, table.sequence),
    index("ticket_mail_outbox_poll_idx").on(table.status, table.nextAttemptAt),
  ],
);

export const rateLimitBuckets = pgTable("rate_limit_buckets", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
});

export const emailReplyTokens = pgTable(
  "email_reply_tokens",
  {
    id: text("id").primaryKey().$defaultFn(genId),
    token: text("token").notNull().unique(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    requesterEmail: text("requester_email").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("email_reply_tokens_ticket_requester_idx").on(
      table.teamId,
      table.ticketId,
      table.requesterEmail,
    ),
  ],
);

export const inboundEmails = pgTable("inbound_emails", {
  id: text("id").primaryKey().$defaultFn(genId),
  messageId: text("message_id").notNull().unique(),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  ticketId: text("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Email (architecture.md §10): FrontLit stores no contact data of its
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
    slug: text("slug").notNull(),
    deletable: boolean("deletable").notNull().default(true),
    // Draft side — written by every builder/editor save. Publishing
    // snapshots it into a `page_revisions` row inside a new site release;
    // what's live is whatever the team's active release says.
    draftLayout: jsonb("draft_layout")
      .$type<WidgetInstanceRow[]>()
      .notNull()
      .default([]),
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

// Shared authoring/publication coordination.
export const documentationSettings = pgTable("documentation_settings", {
  teamId: text("team_id")
    .primaryKey()
    .references(() => teams.id, { onDelete: "cascade" }),
  source: text("source", { enum: ["editor", "git"] })
    .notNull()
    .default("editor"),
  draftVersion: integer("draft_version").notNull().default(1),
  activePublicationId: text("active_publication_id"),
  /** The live API reference (docs/openapi-support.md); independent of docs. */
  activeApiSpecId: text("active_api_spec_id"),
  requestedGeneration: integer("requested_generation").notNull().default(0),
  policyEpoch: integer("policy_epoch").notNull().default(0),
  purgeGeneration: integer("purge_generation").notNull().default(0),
  indexing: jsonb("indexing")
    .$type<{
      enabled: boolean;
      mode?: "lexical" | "semantic";
      configHash?: string | null;
    }>()
    .notNull()
    .default({ enabled: true }),
});

/** D3 immutable publication store. Payloads are captured at admission, never
 * reconstructed from newer drafts by a retry. Terminal reports contain codes,
 * not document bodies. Published membership is the route authority. */
export const documentationRevisions = pgTable(
  "documentation_revisions",
  {
    revisionId: text("revision_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("rev")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    hash: text("hash").notNull(),
    schemaVersion: text("schema_version").notNull().default("docs-v1"),
    snapshot: jsonb("snapshot").$type<Record<string, any>>().notNull(),
    markdown: text("markdown").notNull(),
    headings: jsonb("headings").$type<Record<string, any>[]>().notNull(),
    chunks: jsonb("chunks")
      .$type<{ heading: string | null; anchor: string | null; content: string }[]>()
      .notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_revisions_team_idx").on(t.teamId)],
);
export const documentationPublications = pgTable(
  "documentation_publications",
  {
    publicationId: text("publication_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("pub")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    basePublicationId: text("base_publication_id"),
    source: text("source", { enum: ["editor", "git"] }).notNull(),
    admissionType: text("admission_type", { enum: ["explicit", "automatic"] })
      .notNull()
      .default("explicit"),
    gitContext: jsonb("git_context").$type<{
      installationId: string;
      repositoryId: string;
      ownerId: string;
      connectionGeneration: number;
      requestGeneration: number;
      commitSha: string;
      runId: string;
      proposalIds?: string[];
      /** Tree SHA of the docs directory at `commitSha`. */
      docsTreeSha?: string;
    }>(),
    generation: integer("generation").notNull(),
    purgeGeneration: integer("purge_generation").notNull(),
    docsDraftVersion: integer("docs_draft_version").notNull(),
    indexing: jsonb("indexing")
      .$type<{
        enabled: boolean;
        mode?: "lexical" | "semantic";
        configHash?: string | null;
      }>()
      .notNull(),
    navigation: jsonb("navigation").$type<Record<string, any>[]>().notNull(),
    status: text("status", {
      enum: [
        "queued",
        "preparing",
        "prepared",
        "active",
        "archived",
        "failed",
        "superseded",
      ],
    })
      .notNull()
      .default("queued"),
    diagnostics: jsonb("diagnostics")
      .$type<Record<string, any>[]>()
      .notNull()
      .default([]),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    activatedAt: timestamp("activated_at"),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    uniqueIndex("documentation_publications_idempotency_idx").on(
      t.teamId,
      t.idempotencyKey,
    ),
    index("documentation_publications_poll_idx").on(t.status, t.nextAttemptAt),
  ],
);
export const documentationMemberships = pgTable(
  "documentation_memberships",
  {
    publicationId: text("publication_id")
      .notNull()
      .references(() => documentationPublications.publicationId, {
        onDelete: "cascade",
      }),
    documentId: text("document_id").notNull(),
    revisionId: text("revision_id")
      .notNull()
      .references(() => documentationRevisions.revisionId, { onDelete: "restrict" }),
    route: text("route").notNull(),
  },
  (t) => [
    uniqueIndex("documentation_memberships_route_idx").on(t.publicationId, t.route),
    uniqueIndex("documentation_memberships_document_idx").on(
      t.publicationId,
      t.documentId,
    ),
  ],
);
export const documentationDeliveryOutbox = pgTable("documentation_delivery_outbox", {
  eventId: text("event_id")
    .primaryKey()
    .$defaultFn(() => genPublicId("evt")),
  teamId: text("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  publicationId: text("publication_id"),
  policyEpoch: integer("policy_epoch").notNull(),
  type: text("type", {
    enum: ["activation", "policy", "purge", "api_reference"],
  }).notNull(),
  payload: jsonb("payload").$type<Record<string, any>>().notNull().default({}),
  destinations: jsonb("destinations").$type<string[]>().notNull().default(["local"]),
  acknowledgments: jsonb("acknowledgments").$type<string[]>().notNull().default([]),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
  leaseToken: text("lease_token"),
  leaseExpiresAt: timestamp("lease_expires_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** API reference imported from a team's OpenAPI spec in Git
 * (docs/openapi-support.md). Only the live spec and the latest failed
 * attempt are kept. Specs and slices are `text` because `jsonb` reorders
 * object keys. */
export const documentationApiSpecs = pgTable(
  "documentation_api_specs",
  {
    specId: text("spec_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("aspec")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["active", "failed"] }).notNull(),
    commitSha: text("commit_sha").notNull(),
    sourcePath: text("source_path").notNull(),
    sourceBlobSha: text("source_blob_sha"),
    mount: text("mount").notNull(),
    /** The served `/openapi.json`; null for a failed attempt. */
    spec: text("spec"),
    specHash: text("spec_hash"),
    info: jsonb("info").$type<Record<string, unknown>>(),
    diagnostics: jsonb("diagnostics")
      .$type<Record<string, unknown>[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_api_specs_team_idx").on(t.teamId, t.status)],
);
export const documentationApiOperations = pgTable(
  "documentation_api_operations",
  {
    specId: text("spec_id")
      .notNull()
      .references(() => documentationApiSpecs.specId, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** Relative to `/docs`, like docs memberships: `api-reference/list-contacts`. */
    route: text("route").notNull(),
    title: text("title").notNull(),
    group: text("group").notNull(),
    order: integer("order").notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    deprecated: boolean("deprecated").notNull().default(false),
    slice: text("slice").notNull(),
    chunks: jsonb("chunks")
      .$type<{ heading: string | null; anchor: string | null; content: string }[]>()
      .notNull(),
  },
  (t) => [
    uniqueIndex("documentation_api_operations_route_idx").on(t.specId, t.route),
    index("documentation_api_operations_team_idx").on(t.teamId),
  ],
);
export const documentationPurges = pgTable(
  "documentation_purges",
  {
    purgeId: text("purge_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("purge")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    planHash: text("plan_hash").notNull(),
    manifest: jsonb("manifest").$type<Record<string, any>>().notNull(),
    actorAccountId: text("actor_account_id"),
    idempotencyKey: text("idempotency_key"),
    status: text("status", { enum: ["preflight", "completed"] })
      .notNull()
      .default("preflight"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    uniqueIndex("documentation_purges_idempotency_idx").on(t.teamId, t.idempotencyKey),
  ],
);

/** D5 private review artifacts and publication-bound derived vectors. */
export const documentationImprovements = pgTable(
  "documentation_improvements",
  {
    itemId: text("item_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("imp")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    state: text("state", { enum: ["open", "dismissed", "draft_created", "published"] })
      .notNull()
      .default("open"),
    groupKey: text("group_key").notNull(),
    reason: text("reason").notNull(),
    targetDocumentId: text("target_document_id"),
    predecessorId: text("predecessor_id"),
    mergedIntoId: text("merged_into_id"),
    approved: jsonb("approved").$type<{
      version: number;
      title: string;
      description: string;
      correction: string;
      actorAccountId: string;
      approvedAt: string;
      noCustomerDetails: true;
    }>(),
    draftDocumentId: text("draft_document_id"),
    draftVersion: integer("draft_version"),
    draftHash: text("draft_hash"),
    revisionId: text("revision_id"),
    publicationId: text("publication_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_improvements_team_idx").on(t.teamId, t.createdAt)],
);
export const documentationEvidence = pgTable(
  "documentation_evidence",
  {
    evidenceId: text("evidence_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("evd")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => documentationImprovements.itemId, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .notNull()
      .references(() => ticketMessages.id, { onDelete: "cascade" }),
    dedupeKey: text("dedupe_key").notNull(),
    trigger: text("trigger", {
      enum: ["retrieval_miss", "negative_feedback", "escalation"],
    }).notNull(),
    retrieved: jsonb("retrieved")
      .$type<
        {
          documentId: string;
          revisionId?: string;
          publicationId?: string | null;
          anchor?: string | null;
        }[]
      >()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [uniqueIndex("documentation_evidence_dedupe_idx").on(t.teamId, t.dedupeKey)],
);
export const documentationImprovementDrafts = pgTable(
  "documentation_improvement_drafts",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => documentationImprovements.itemId, { onDelete: "cascade" }),
    approvedVersion: integer("approved_version").notNull(),
    itemVersion: integer("item_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    documentId: text("document_id").notNull(),
    draftVersion: integer("draft_version").notNull(),
  },
  (t) => [
    uniqueIndex("documentation_improvement_drafts_version_idx").on(
      t.itemId,
      t.approvedVersion,
    ),
  ],
);
export const documentationEmbeddings = pgTable(
  "documentation_embeddings",
  {
    revisionId: text("revision_id")
      .notNull()
      .references(() => documentationRevisions.revisionId, { onDelete: "cascade" }),
    configHash: text("config_hash").notNull(),
    vectors: jsonb("vectors").$type<number[][]>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documentation_embeddings_revision_config_idx").on(
      t.revisionId,
      t.configHash,
    ),
  ],
);

export const documentationEmbeddingConfigs = pgTable(
  "documentation_embedding_configs",
  {
    configHash: text("config_hash").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["openai", "azure"] }).notNull(),
    deployment: text("deployment"),
    endpoint: text("endpoint"),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
);

export const documentationImprovementReviews = pgTable(
  "documentation_improvement_reviews",
  {
    reviewId: text("review_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("drv")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => documentationImprovements.itemId, { onDelete: "cascade" }),
    actorAccountId: text("actor_account_id").notNull(),
    itemVersion: integer("item_version").notNull(),
    action: text("action").notNull(),
    // Validated reviewer input only. Raw source evidence is never copied here.
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_improvement_reviews_item_idx").on(t.teamId, t.itemId)],
);

/** Temporary, account-bound OAuth proof. Raw state is never persisted. */
export const documentationGitSetups = pgTable(
  "documentation_git_setups",
  {
    setupId: text("setup_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gsetup")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    actorAccountId: text("actor_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    stateHash: text("state_hash").notNull().unique(),
    encryptedVerifier: text("encrypted_verifier"),
    encryptedUserToken: text("encrypted_user_token"),
    githubUserId: text("github_user_id"),
    githubLogin: text("github_login"),
    purpose: text("purpose", { enum: ["connect", "reconnect", "upgrade"] }).notNull(),
    returnPath: text("return_path").notNull(),
    status: text("status", {
      enum: ["pending", "verifying", "authorized", "consumed", "failed", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_git_setups_expiry_idx").on(t.expiresAt)],
);

/** One independently delegated binding per team; installation is not team identity. */
export const documentationGitBindings = pgTable(
  "documentation_git_bindings",
  {
    teamId: text("team_id")
      .primaryKey()
      .references(() => teams.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    repositoryId: text("repository_id").notNull(),
    ownerId: text("owner_id").notNull(),
    ownerLogin: text("owner_login").notNull(),
    repositoryName: text("repository_name").notNull(),
    repositoryPrivate: boolean("repository_private").notNull(),
    branch: text("branch").notNull(),
    /** Docs source directory; only read when `docsEnabled`. */
    directory: text("directory").notNull(),
    /** The repo can feed docs, pages, or both. */
    docsEnabled: boolean("docs_enabled").notNull().default(true),
    /** Pages source directory (`frontlit/pages`); null when pages are
     * builder-owned. `site.json` lives in its parent directory. */
    pagesDirectory: text("pages_directory"),
    /** `<pages tree sha>:<site.json blob sha>` of the last activated pages
     * import; a sync skips the pages import while it's unchanged. */
    pagesSourceKey: text("pages_source_key"),
    /** Tree SHA of the docs directory behind the live docs publication; a
     * push that leaves it unchanged publishes no new docs. */
    docsSourceKey: text("docs_source_key"),
    /** Problems and warnings from the last pages import. */
    pagesDiagnostics: jsonb("pages_diagnostics").$type<Record<string, unknown>[]>(),
    /** Repo-relative path of the OpenAPI spec; null turns the API reference off. */
    apiSpecPath: text("api_spec_path"),
    /** The API reference is served under `/docs/<apiMount>`. */
    apiMount: text("api_mount").notNull().default("api-reference"),
    status: text("status", {
      enum: ["connected", "paused", "access_lost", "disconnected"],
    }).notNull(),
    generation: integer("generation").notNull().default(1),
    requestedGeneration: integer("requested_generation").notNull().default(0),
    grantVersion: integer("grant_version").notNull().default(1),
    grantActorAccountId: text("grant_actor_account_id").notNull(),
    grantGithubUserId: text("grant_github_user_id").notNull(),
    repositoryAdminVerified: boolean("repository_admin_verified").notNull(),
    capabilities: jsonb("capabilities")
      .$type<{ read: boolean; proposals: boolean; directCommit: boolean }>()
      .notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
    observedSha: text("observed_sha"),
    validatedSha: text("validated_sha"),
    liveSha: text("live_sha"),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at"),
    lastDiagnostic: text("last_diagnostic"),
    connectionReceipt: jsonb("connection_receipt").$type<{
      actorAccountId: string;
      inputHash: string;
      key: string;
      runId: string;
    }>(),
    nextReconcileAt: timestamp("next_reconcile_at").notNull().defaultNow(),
    nextPrReconcileAt: timestamp("next_pr_reconcile_at").notNull().defaultNow(),
    lastPrReconcileError: text("last_pr_reconcile_error"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("documentation_git_bindings_installation_idx").on(t.installationId),
    index("documentation_git_bindings_reconcile_idx").on(t.status, t.nextReconcileAt),
    index("documentation_git_bindings_pr_reconcile_idx").on(
      t.status,
      t.nextPrReconcileAt,
    ),
  ],
);

export const documentationGitPreflights = pgTable(
  "documentation_git_preflights",
  {
    preflightId: text("preflight_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gpre")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    setupId: text("setup_id")
      .notNull()
      .references(() => documentationGitSetups.setupId, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    repositoryId: text("repository_id").notNull(),
    ownerId: text("owner_id").notNull(),
    ownerLogin: text("owner_login").notNull(),
    repositoryName: text("repository_name").notNull(),
    repositoryPrivate: boolean("repository_private").notNull(),
    branch: text("branch").notNull(),
    directory: text("directory").notNull(),
    // Setup captures for genuinely empty repositories have no Git commit yet.
    // Normal source connection still requires a nonnull validated manifest/SHA.
    commitSha: text("commit_sha"),
    docsDraftVersion: integer("docs_draft_version").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    manifest:
      jsonb("manifest").$type<
        import("../documentation/github/importer").DocumentationGitManifest
      >(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("documentation_git_preflights_team_idx").on(t.teamId, t.expiresAt)],
);

/** Imported source is separate from unsubmitted editor proposals. */
export const documentationGitGrants = pgTable(
  "documentation_git_grants",
  {
    grantId: text("grant_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("ggrant")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    actorAccountId: text("actor_account_id").notNull(),
    githubUserId: text("github_user_id").notNull(),
    installationId: text("installation_id").notNull(),
    repositoryId: text("repository_id").notNull(),
    ownerId: text("owner_id").notNull(),
    branch: text("branch").notNull(),
    directory: text("directory").notNull(),
    grantVersion: integer("grant_version").notNull(),
    connectionGeneration: integer("connection_generation").notNull(),
    capabilities: jsonb("capabilities")
      .$type<{ read: boolean; proposals: boolean; directCommit: boolean }>()
      .notNull(),
    repositoryAdminVerified: boolean("repository_admin_verified").notNull(),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documentation_git_grants_idempotency_idx").on(
      t.teamId,
      t.idempotencyKey,
    ),
    uniqueIndex("documentation_git_grants_version_idx").on(t.teamId, t.grantVersion),
  ],
);

export const documentationGitProposals = pgTable(
  "documentation_git_proposals",
  {
    proposalId: text("proposal_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gproposal")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    actorCredential: jsonb("actor_credential")
      .$type<import("../documentation/github/publisher").GitPublisherCredential>()
      .notNull(),
    sourceContext: jsonb("source_context").$type<{
      installationId: string;
      repositoryId: string;
      ownerId: string;
      branch: string;
      directory: string;
    }>(),
    connectionGeneration: integer("connection_generation").notNull(),
    grantVersion: integer("grant_version").notNull(),
    mode: text("mode", { enum: ["pull_request", "direct"] }).notNull(),
    title: text("title").notNull(),
    /** Set when this submission appends a commit to another proposal's open PR. */
    updatesProposalId: text("updates_proposal_id"),
    changes: jsonb("changes")
      .$type<import("../documentation/github/proposal-patch").CapturedGitChange[]>()
      .notNull(),
    baseSha: text("base_sha"),
    treeSha: text("tree_sha"),
    commitSha: text("commit_sha"),
    mergedCommitSha: text("merged_commit_sha"),
    branch: text("branch"),
    pullRequestNumber: integer("pull_request_number"),
    pullRequestUrl: text("pull_request_url"),
    status: text("status", {
      enum: [
        "queued",
        "validating",
        "prepared",
        "writing",
        "open",
        "updated",
        "merged",
        "published",
        "closed",
        "failed",
        "conflict",
        "canceled",
      ],
    })
      .notNull()
      .default("queued"),
    diagnostics: jsonb("diagnostics")
      .$type<Record<string, any>[]>()
      .notNull()
      .default([]),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    uniqueIndex("documentation_git_proposals_idempotency_idx").on(
      t.teamId,
      t.idempotencyKey,
    ),
    index("documentation_git_proposals_poll_idx").on(t.status, t.nextAttemptAt),
  ],
);
export const documentationGitProposalDocuments = pgTable(
  "documentation_git_proposal_documents",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => documentationGitProposals.proposalId, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull(),
    draftVersion: integer("draft_version").notNull(),
    sourcePath: text("source_path"),
    targetPath: text("target_path"),
    open: boolean("open").notNull().default(true),
  },
  (t) => [
    uniqueIndex("documentation_git_proposal_documents_identity_idx").on(
      t.proposalId,
      t.documentId,
    ),
    uniqueIndex("documentation_git_proposal_documents_open_idx")
      .on(t.teamId, t.documentId)
      .where(sql`${t.open} = true`),
  ],
);

/** Imported source is separate from unsubmitted editor proposals. */
export const documentationGitFiles = pgTable(
  "documentation_git_files",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    sourcePath: text("source_path").notNull(),
    documentId: text("document_id").notNull(),
    commitSha: text("commit_sha").notNull(),
    blobSha: text("blob_sha").notNull(),
    sourceHash: text("source_hash").notNull(),
    markdown: text("markdown").notNull(),
    frontmatter: jsonb("frontmatter")
      .$type<import("@frontlit/text-editor/docs").DocsFrontmatter>()
      .notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    removedAt: timestamp("removed_at"),
  },
  (t) => [
    uniqueIndex("documentation_git_files_path_idx").on(t.teamId, t.sourcePath),
    uniqueIndex("documentation_git_files_document_idx")
      .on(t.teamId, t.documentId)
      .where(sql`${t.removedAt} is null`),
  ],
);

export const documentationGitJobs = pgTable(
  "documentation_git_jobs",
  {
    runId: text("run_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gsync")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    connectionGeneration: integer("connection_generation").notNull(),
    requestGeneration: integer("request_generation").notNull(),
    trigger: text("trigger", {
      enum: ["manual", "webhook", "reconcile", "connect", "migration", "configuration"],
    })
      .notNull()
      .default("reconcile"),
    reviewedSha: text("reviewed_sha"),
    observedSha: text("observed_sha"),
    publicationId: text("publication_id"),
    status: text("status", {
      enum: ["queued", "running", "preparing", "active", "failed", "superseded"],
    })
      .notNull()
      .default("queued"),
    diagnostic: text("diagnostic"),
    diagnosticReport: jsonb("diagnostic_report").$type<{
      diagnostics: import("@frontlit/text-editor/docs").DocsDiagnostic[];
      policyEpoch: number;
      purgeGeneration: number;
    }>(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    uniqueIndex("documentation_git_jobs_generation_idx").on(
      t.teamId,
      t.connectionGeneration,
      t.requestGeneration,
    ),
    index("documentation_git_jobs_poll_idx").on(t.status, t.nextAttemptAt),
  ],
);

/** Signature-verified delivery receipt; minimal payload, no raw headers/body. */
export const documentationGitDeliveries = pgTable("documentation_git_deliveries", {
  deliveryId: text("delivery_id").primaryKey(),
  event: text("event").notNull(),
  action: text("action"),
  outcome: text("outcome", { enum: ["ignored", "queued", "processed"] })
    .notNull()
    .default("ignored"),
  runIds: jsonb("run_ids").$type<string[]>().notNull().default([]),
  payload: jsonb("payload")
    .$type<{
      ref?: string;
      deleted?: boolean;
      senderId?: string;
      removedRepositoryIds?: string[];
      addedRepositoryIds?: string[];
      contentsPermission?: string;
    }>()
    .notNull()
    .default({}),
  installationId: text("installation_id"),
  repositoryId: text("repository_id"),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const documentationGitMigrations = pgTable(
  "documentation_git_migrations",
  {
    planId: text("plan_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gmig")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    setupId: text("setup_id")
      .notNull()
      .references(() => documentationGitSetups.setupId, { onDelete: "cascade" }),
    actorAccountId: text("actor_account_id").notNull(),
    preflightId: text("preflight_id").references(
      () => documentationGitPreflights.preflightId,
      { onDelete: "set null" },
    ),
    docsDraftVersion: integer("docs_draft_version").notNull(),
    activePublicationId: text("active_publication_id"),
    planHash: text("plan_hash").notNull(),
    // Server-generated identity map and export; never accept document IDs from Git metadata.
    selection: jsonb("selection")
      .$type<{
        installationId: number;
        repositoryId: number;
        branch: string;
        directory: string;
      }>()
      .notNull(),
    files: jsonb("files")
      .$type<
        {
          path: string;
          documentId: string | null;
          draftVersion: number | null;
          markdown: string;
          hash: string;
          /** The editor draft has edits newer than the exported published state. */
          unpublished?: boolean;
        }[]
      >()
      .notNull(),
    sections: jsonb("sections").$type<Record<string, unknown>[]>().notNull(),
    status: text("status", {
      enum: ["planned", "verified", "activated", "canceled", "expired"],
    })
      .notNull()
      .default("planned"),
    verifiedSha: text("verified_sha"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    activatedAt: timestamp("activated_at"),
  },
  (t) => [index("documentation_git_migrations_team_idx").on(t.teamId, t.expiresAt)],
);

/** Setup writes stay editor-owned until their merged capture is verified/adopted.
 * Bodies remain solely in the reviewed migration capture; this row stores work
 * and recovery references, never a second copy of exported documentation. */
export const documentationGitMigrationPrs = pgTable(
  "documentation_git_migration_prs",
  {
    planId: text("plan_id")
      .primaryKey()
      .references(() => documentationGitMigrations.planId, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    setupId: text("setup_id")
      .notNull()
      .references(() => documentationGitSetups.setupId),
    actorCredential: jsonb("actor_credential")
      .$type<import("../documentation/github/publisher").GitPublisherCredential>()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    policyEpoch: integer("policy_epoch").notNull(),
    purgeGeneration: integer("purge_generation").notNull(),
    initializeEmptyRepository: boolean("initialize_empty_repository")
      .notNull()
      .default(false),
    status: text("status", {
      enum: ["queued", "writing", "open", "merged", "closed", "failed", "canceled"],
    })
      .notNull()
      .default("queued"),
    ownerId: text("owner_id").notNull(),
    branch: text("branch").notNull(),
    baseSha: text("base_sha"),
    treeSha: text("tree_sha"),
    commitSha: text("commit_sha"),
    bootstrapSha: text("bootstrap_sha"),
    pullRequestNumber: integer("pull_request_number"),
    pullRequestUrl: text("pull_request_url"),
    mergedCommitSha: text("merged_commit_sha"),
    diagnostic: text("diagnostic"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    uniqueIndex("documentation_git_migration_prs_idempotency_idx").on(
      t.teamId,
      t.idempotencyKey,
    ),
    index("documentation_git_migration_prs_work_idx").on(t.status, t.nextAttemptAt),
  ],
);

/** Validation/report work is independent from public import/preparation. */
export const documentationGitChecks = pgTable(
  "documentation_git_checks",
  {
    checkId: text("check_id")
      .primaryKey()
      .$defaultFn(() => genPublicId("gcheck")),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    connectionGeneration: integer("connection_generation").notNull(),
    pullRequestNumber: integer("pull_request_number"),
    syncRunId: text("sync_run_id"),
    publicationResult:
      jsonb("publication_result").$type<
        import("../documentation/github/publication-checks").GitPublicationCheckResult
      >(),
    status: text("status", {
      enum: ["queued", "validating", "reporting", "delivered", "superseded"],
    })
      .notNull()
      .default("queued"),
    result:
      jsonb("result").$type<
        import("../documentation/github/pr-validation").GitPullRequestValidation
      >(),
    checkRunId: bigint("check_run_id", { mode: "number" }),
    lastError: text("last_error"),
    errorPhase: text("error_phase", { enum: ["validation", "delivery"] }),
    attempts: integer("attempts").notNull().default(0),
    leaseToken: text("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => [
    index("documentation_git_checks_poll_idx").on(t.status, t.nextAttemptAt),
    uniqueIndex("documentation_git_checks_sync_run_idx").on(t.teamId, t.syncRunId),
    uniqueIndex("documentation_git_checks_active_pr_idx")
      .on(t.teamId, t.pullRequestNumber)
      .where(sql`${t.status} in ('queued', 'validating', 'reporting')`),
  ],
);
