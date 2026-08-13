import { initClient } from "@ts-rest/core";
import { contract, pageTypes } from "@frontlit/api-contract";
import type { TextEditorContent } from "@frontlit/text-editor";
import type { WidgetInstance } from "@frontlit/page-builder/models";
import { ApiError } from "./api-client";
import { clientLoginPath } from "./login-url";
import {
    clearTeamIdCookie,
    isStaleTeamSelectionError,
    needsTeamSelection,
} from "./tokens";

function describeApiError(code: string): string {
    switch (code) {
        case "insufficient_permission":
            return "You don't have permission to do that.";
        case "owner_required":
            return "Only the team owner can do that.";
        case "recent_authentication_required":
            return "Confirm your identity with a fresh email code to continue.";
        case "not_a_team_member":
            return "You are not a member of this team.";
        default:
            return code.replace(/_/g, " ");
    }
}

/**
 * Typed client generated from `@frontlit/api-contract` — the same contract
 * that validates requests/responses on the server and generates the OpenAPI
 * doc. Every exported function below is a thin wrapper: unwrap the body on
 * success, redirect on 401/needs-a-team, throw `ApiError` otherwise.
 */
const client = initClient(contract, {
    baseUrl: "/api/proxy",
    baseHeaders: {},
});

// Broadcast so components with their own team-list fetch (e.g. the
// AppSidebar's team switcher) can refresh without a route change or full
// reload.
export const TEAMS_CHANGED_EVENT = "frontlit:teams-changed";
function notifyTeamsChanged() {
    if (typeof window !== "undefined")
        window.dispatchEvent(new Event(TEAMS_CHANGED_EVENT));
}

async function unwrap<T>(
    promise: Promise<{ status: number; body: unknown }>,
): Promise<T> {
    const result = await promise;

    if (result.status >= 200 && result.status < 300) {
        return result.body as T;
    }

    if (result.status === 401 && typeof window !== "undefined") {
        window.location.href = clientLoginPath(
            `${window.location.pathname}${window.location.search}`,
        );
        // Never resolves — the browser is navigating away.
        return new Promise<T>(() => {});
    }

    const errorBody = result.body as
        | {
              error?: string;
              error_description?: string;
          }
        | undefined;
    if (typeof window !== "undefined") {
        if (
            needsTeamSelection(result.status, errorBody?.error) &&
            !window.location.pathname.startsWith("/teams")
        ) {
            if (isStaleTeamSelectionError(errorBody?.error)) {
                clearTeamIdCookie();
            }
            window.location.href = "/teams";
            return new Promise<T>(() => {});
        }
    }

    const code = errorBody?.error || `request_failed`;
    throw new ApiError(
        result.status,
        errorBody?.error_description || describeApiError(code),
        code,
    );
}

export interface Paginated<T> {
    items: T[];
    total: number;
}

// ---- Teams ----------------------------------------------------------------

export interface Team {
    teamId: string;
    name: string;
    ownerAccountId?: string;
    externalId?: string | null;
    subdomain?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface TeamMembership extends Team {
    isOwner: boolean;
    effectivePermissions: TeamPermission[];
}

export interface ApiKey {
    id: string;
    keyPrefix: string;
    name?: string | null;
    createdAt?: string | null;
}

export interface CreatedApiKey extends ApiKey {
    key: string;
}

export function listTeams() {
    return client.teams.list().then((result) => {
        if (result.status >= 200 && result.status < 300) {
            return result.body as { items: TeamMembership[] };
        }

        const errorBody = result.body as
            | {
                  error?: string;
                  teams?: Pick<Team, "teamId" | "name">[];
              }
            | undefined;
        if (result.status === 409 && errorBody?.teams) {
            return {
                items: errorBody.teams.map((team) => ({
                    ...team,
                    isOwner: false,
                    effectivePermissions: [],
                })),
            };
        }

        return unwrap<{ items: TeamMembership[] }>(Promise.resolve(result));
    });
}

export async function createTeam(name: string) {
    const team = await unwrap<Team>(client.teams.create({ body: { name } }));
    notifyTeamsChanged();
    return team;
}

export async function renameTeam(teamId: string, name: string) {
    const team = await unwrap<Team>(
        client.teams.rename({ params: { teamId }, body: { name } }),
    );
    notifyTeamsChanged();
    return team;
}

export async function deleteTeam(teamId: string) {
    await unwrap<void>(client.teams.remove({ params: { teamId } }));
    notifyTeamsChanged();
}

export function listTeamKeys(teamId: string) {
    return unwrap<{ items: ApiKey[] }>(
        client.teams.listKeys({ params: { teamId } }),
    );
}

export function createTeamKey(teamId: string, name: string) {
    return unwrap<CreatedApiKey>(
        client.teams.createKey({ params: { teamId }, body: { name } }),
    );
}

export function deleteTeamKey(teamId: string, keyId: string) {
    return unwrap<void>(client.teams.removeKey({ params: { teamId, keyId } }));
}

export type TeamPermission = import("@frontlit/api-contract").TeamPermission;

export interface TeamMember {
    memberId: string;
    email: string;
    name: string | null;
    isOwner: boolean;
    permissions: TeamPermission[];
    effectivePermissions: TeamPermission[];
    version: number;
    createdAt: string;
    updatedAt: string;
}

export interface TeamInvitation {
    invitationId: string;
    email: string;
    permissions: TeamPermission[];
    effectivePermissions: TeamPermission[];
    status: string;
    invitedByName: string | null;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

export interface InvitationPreview {
    invitationId: string;
    teamName: string;
    inviterName: string | null;
    expiresAt: string;
    permissions: TeamPermission[];
    email: string;
}

export function listTeamMembers(
    teamId: string,
    query: { cursor?: string; limit?: number } = {},
) {
    return unwrap<{
        items: TeamMember[];
        nextCursor: string | null;
        viewer: TeamMember;
    }>(client.teams.listMembers({ params: { teamId }, query }));
}

export function updateTeamMember(
    teamId: string,
    memberId: string,
    body: { permissions: TeamPermission[]; version: number },
) {
    return unwrap<TeamMember>(
        client.teams.updateMember({ params: { teamId, memberId }, body }),
    );
}

export function removeTeamMember(teamId: string, memberId: string) {
    return unwrap<void>(
        client.teams.removeMember({ params: { teamId, memberId } }),
    );
}

export function leaveTeam(teamId: string) {
    return unwrap<void>(client.teams.leave({ params: { teamId } } as any));
}

export function transferTeamOwnership(
    teamId: string,
    body: { memberId: string; revokeApiKeys?: boolean },
) {
    return unwrap<Team>(
        client.teams.transferOwnership({ params: { teamId }, body }),
    );
}

export function listTeamInvitations(
    teamId: string,
    query: { cursor?: string; limit?: number } = {},
) {
    return unwrap<{ items: TeamInvitation[]; nextCursor: string | null }>(
        client.teams.listInvitations({ params: { teamId }, query }),
    );
}

export function createTeamInvitation(
    teamId: string,
    body: { email: string; permissions: TeamPermission[] },
) {
    return unwrap<TeamInvitation>(
        client.teams.createInvitation({ params: { teamId }, body }),
    );
}

export function resendTeamInvitation(teamId: string, invitationId: string) {
    return unwrap<TeamInvitation>(
        client.teams.resendInvitation({
            params: { teamId, invitationId },
        } as any),
    );
}

export function revokeTeamInvitation(teamId: string, invitationId: string) {
    return unwrap<void>(
        client.teams.revokeInvitation({ params: { teamId, invitationId } }),
    );
}

export function previewTeamInvitation(body: {
    invitationId: string;
    token: string;
}) {
    return unwrap<InvitationPreview>(client.teamInvitations.preview({ body }));
}

export function acceptTeamInvitation(body: {
    invitationId: string;
    token: string;
}) {
    return unwrap<TeamMember>(client.teamInvitations.accept({ body }));
}

export function rejectTeamInvitation(body: {
    invitationId: string;
    token: string;
}) {
    return unwrap<void>(client.teamInvitations.reject({ body }));
}

// ---- Pages ------------------------------------------------------------

export type PageType = (typeof pageTypes)[number];
export type PageStatus = "draft" | "published" | "published_with_changes";

export interface Page {
    pageId: string;
    name: string;
    type: PageType;
    slug: string;
    deletable: boolean;
    status: PageStatus;
    publishedAt?: string | null;
    // Published fields — what the public site renders.
    layout: WidgetInstance[];
    title?: string | null;
    description?: string | null;
    socialImage?: Record<string, unknown> | null;
    robotsAllowed?: boolean | null;
    // Draft fields — what the builder/editor reads and writes.
    draftLayout: WidgetInstance[];
    draftTitle?: string | null;
    draftDescription?: string | null;
    draftSocialImage?: Record<string, unknown> | null;
    draftRobotsAllowed?: boolean | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listPages(
    params: {
        type?: PageType;
        q?: string;
        offset?: number;
        itemsPerPage?: number;
    } = {},
) {
    return unwrap<Paginated<Page>>(client.pages.list({ query: params }));
}

export function createPage(input: { name: string; type: PageType }) {
    return unwrap<Page>(client.pages.create({ body: input }));
}

export function getPage(pageId: string) {
    return unwrap<Page>(client.pages.get({ params: { pageId } }));
}

export function updatePage(
    pageId: string,
    patch: Partial<{
        name: string;
        slug: string;
        layout: WidgetInstance[];
        title: string;
        description: string;
        socialImage: Record<string, unknown>;
        robotsAllowed: boolean;
    }>,
) {
    return unwrap<Page>(
        client.pages.update({ params: { pageId }, body: patch }),
    );
}

export function deletePage(pageId: string) {
    return unwrap<void>(client.pages.remove({ params: { pageId } }));
}

export function publishPage(pageId: string) {
    return unwrap<Page>(client.pages.publish({ params: { pageId } }));
}

export function discardPageDraft(pageId: string) {
    return unwrap<Page>(client.pages.discardDraft({ params: { pageId } }));
}

// ---- Themes -----------------------------------------------------------

export interface Theme {
    themeId: string;
    name: string;
    style: Record<string, unknown>;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listThemes() {
    return unwrap<{ items: Theme[] }>(client.themes.list());
}

export function createTheme(input: {
    name: string;
    style: Record<string, unknown>;
}) {
    return unwrap<Theme>(client.themes.create({ body: input }));
}

export function getTheme(themeId: string) {
    return unwrap<Theme>(client.themes.get({ params: { themeId } }));
}

export function updateTheme(
    themeId: string,
    patch: Partial<{ name: string; style: Record<string, unknown> }>,
) {
    return unwrap<Theme>(
        client.themes.update({ params: { themeId }, body: patch }),
    );
}

export function deleteTheme(themeId: string) {
    return unwrap<void>(client.themes.remove({ params: { themeId } }));
}

// ---- Media -----------------------------------------------------------

export interface Media {
    mediaId: string;
    mediaLitId: string;
    url: string;
    thumbnailUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
    alt?: string | null;
    caption?: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listMedia(
    params: { offset?: number; itemsPerPage?: number } = {},
) {
    return unwrap<Paginated<Media>>(client.media.list({ query: params }));
}

export function registerMedia(input: {
    mediaLitId: string;
    alt?: string;
    caption?: string;
}) {
    return unwrap<Media>(client.media.create({ body: input }));
}

export function updateMedia(
    mediaId: string,
    patch: Partial<{ alt: string; caption: string }>,
) {
    return unwrap<Media>(
        client.media.update({ params: { mediaId }, body: patch }),
    );
}

export function deleteMedia(mediaId: string) {
    return unwrap<void>(client.media.remove({ params: { mediaId } }));
}

// ---- Blog ---------------------------------------------------------------

export type DocumentStatus = "draft" | "published" | "published_with_changes";

export interface BlogMeta {
    tags: string[];
}

export interface BlogPost {
    documentId: string;
    slug: string;
    status: DocumentStatus;
    publishedAt?: string | null;
    title?: string | null;
    content?: TextEditorContent | null;
    excerpt?: string | null;
    featuredImage?: Record<string, unknown> | null;
    meta: BlogMeta;
    draftTitle: string;
    draftContent: TextEditorContent;
    draftExcerpt?: string | null;
    draftFeaturedImage?: Record<string, unknown> | null;
    draftMeta: BlogMeta;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listBlogPosts(
    params: { q?: string; offset?: number; itemsPerPage?: number } = {},
) {
    return unwrap<Paginated<BlogPost>>(client.blogs.list({ query: params }));
}

export function createBlogPost(input: {
    title: string;
    meta?: Partial<BlogMeta>;
}) {
    return unwrap<BlogPost>(client.blogs.create({ body: input }));
}

export function getBlogPost(documentId: string) {
    return unwrap<BlogPost>(client.blogs.get({ params: { documentId } }));
}

export function updateBlogPost(
    documentId: string,
    patch: Partial<{
        slug: string;
        title: string;
        content: TextEditorContent;
        excerpt: string;
        featuredImage: Record<string, unknown>;
        meta: Partial<BlogMeta>;
    }>,
) {
    return unwrap<BlogPost>(
        client.blogs.update({ params: { documentId }, body: patch }),
    );
}

export function publishBlogPost(documentId: string) {
    return unwrap<BlogPost>(client.blogs.publish({ params: { documentId } }));
}

export function discardBlogPostDraft(documentId: string) {
    return unwrap<BlogPost>(
        client.blogs.discardDraft({ params: { documentId } }),
    );
}

export function deleteBlogPost(documentId: string) {
    return unwrap<void>(client.blogs.remove({ params: { documentId } }));
}

// ---- Docs (help center) --------------------------------------------------

export interface DocMeta {
    sectionId?: string;
    order: number;
}

export interface HelpDoc {
    documentId: string;
    slug: string;
    status: DocumentStatus;
    publishedAt?: string | null;
    title?: string | null;
    content?: TextEditorContent | null;
    excerpt?: string | null;
    featuredImage?: Record<string, unknown> | null;
    meta: DocMeta;
    draftTitle: string;
    draftContent: TextEditorContent;
    draftExcerpt?: string | null;
    draftFeaturedImage?: Record<string, unknown> | null;
    draftMeta: DocMeta;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listHelpDocs(
    params: { q?: string; offset?: number; itemsPerPage?: number } = {},
) {
    return unwrap<Paginated<HelpDoc>>(client.docs.list({ query: params }));
}

export function createHelpDoc(input: {
    title: string;
    meta?: Partial<DocMeta>;
}) {
    return unwrap<HelpDoc>(client.docs.create({ body: input }));
}

export function getHelpDoc(documentId: string) {
    return unwrap<HelpDoc>(client.docs.get({ params: { documentId } }));
}

export function updateHelpDoc(
    documentId: string,
    patch: Partial<{
        slug: string;
        title: string;
        content: TextEditorContent;
        excerpt: string;
        featuredImage: Record<string, unknown>;
        meta: Partial<DocMeta>;
    }>,
) {
    return unwrap<HelpDoc>(
        client.docs.update({ params: { documentId }, body: patch }),
    );
}

export function publishHelpDoc(documentId: string) {
    return unwrap<HelpDoc>(client.docs.publish({ params: { documentId } }));
}

export function discardHelpDocDraft(documentId: string) {
    return unwrap<HelpDoc>(
        client.docs.discardDraft({ params: { documentId } }),
    );
}

export function deleteHelpDoc(documentId: string) {
    return unwrap<void>(client.docs.remove({ params: { documentId } }));
}

export interface DocSection {
    sectionId: string;
    name: string;
    slug: string;
    order: number;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listDocSections() {
    return unwrap<{ items: DocSection[] }>(client.docSections.list());
}

export function createDocSection(input: { name: string; order?: number }) {
    return unwrap<DocSection>(client.docSections.create({ body: input }));
}

export function updateDocSection(
    sectionId: string,
    patch: Partial<{ name: string; order: number }>,
) {
    return unwrap<DocSection>(
        client.docSections.update({ params: { sectionId }, body: patch }),
    );
}

export function deleteDocSection(sectionId: string) {
    return unwrap<void>(client.docSections.remove({ params: { sectionId } }));
}

export interface DocSearchResult {
    documentId: string;
    slug: string;
    title: string | null;
    heading: string | null;
    anchor: string | null;
    content: string;
    similarity: number;
}

export function searchDocs(q: string, k?: number) {
    return unwrap<{ items: DocSearchResult[] }>(
        client.docSections.search({ query: { q, k } }),
    );
}

// ---- Changelog -----------------------------------------------------------

export interface ChangelogMeta {
    version?: string;
    labels: string[];
    releaseDate?: string;
    github?: { releaseId: number; releaseUrl: string; tagName: string };
}

export interface ChangelogEntry {
    documentId: string;
    slug: string;
    status: DocumentStatus;
    publishedAt?: string | null;
    title?: string | null;
    content?: TextEditorContent | null;
    excerpt?: string | null;
    featuredImage?: Record<string, unknown> | null;
    meta: ChangelogMeta;
    draftTitle: string;
    draftContent: TextEditorContent;
    draftExcerpt?: string | null;
    draftFeaturedImage?: Record<string, unknown> | null;
    draftMeta: ChangelogMeta;
    createdAt: string | null;
    updatedAt: string | null;
}

export function listChangelogEntries(params: { q?: string } = {}) {
    return unwrap<Paginated<ChangelogEntry>>(
        client.changelogs.list({ query: params }),
    );
}

export function createChangelogEntry(input: {
    title: string;
    meta?: Partial<ChangelogMeta>;
}) {
    return unwrap<ChangelogEntry>(client.changelogs.create({ body: input }));
}

export function getChangelogEntry(documentId: string) {
    return unwrap<ChangelogEntry>(
        client.changelogs.get({ params: { documentId } }),
    );
}

export function updateChangelogEntry(
    documentId: string,
    patch: Partial<{
        slug: string;
        title: string;
        content: TextEditorContent;
        excerpt: string;
        featuredImage: Record<string, unknown>;
        meta: Partial<ChangelogMeta>;
    }>,
) {
    return unwrap<ChangelogEntry>(
        client.changelogs.update({ params: { documentId }, body: patch }),
    );
}

export function publishChangelogEntry(documentId: string) {
    return unwrap<ChangelogEntry>(
        client.changelogs.publish({ params: { documentId } }),
    );
}

export function discardChangelogEntryDraft(documentId: string) {
    return unwrap<ChangelogEntry>(
        client.changelogs.discardDraft({ params: { documentId } }),
    );
}

export function deleteChangelogEntry(documentId: string) {
    return unwrap<void>(client.changelogs.remove({ params: { documentId } }));
}

export interface GithubIntegration {
    connected: boolean;
    repo: string | null;
}

export function getGithubIntegration() {
    return unwrap<GithubIntegration>(client.changelogs.getGithubIntegration());
}

export function connectGithubIntegration(input: {
    token: string;
    repo: string;
}) {
    return unwrap<GithubIntegration>(
        client.changelogs.connectGithub({ body: input }),
    );
}

export function disconnectGithubIntegration() {
    return unwrap<void>(client.changelogs.disconnectGithub());
}

export function importGithubReleases() {
    return unwrap<{ imported: number; skipped: number }>(
        client.changelogs.importGithubReleases(),
    );
}

// ---- Newsletter (SendLit, read-through) ------------------------------------

export interface Contact {
    contactId: string;
    email: string;
    name?: string | null;
    tags: string[];
    subscribed: boolean;
    createdAt?: string;
}

export function listContacts(
    params: { email?: string; tag?: string; subscribed?: boolean } = {},
) {
    return unwrap<Paginated<Contact>>(client.contacts.list({ query: params }));
}

export function getContact(contactId: string) {
    return unwrap<Contact>(client.contacts.get({ params: { contactId } }));
}

export function deleteContact(contactId: string) {
    return unwrap<void>(client.contacts.remove({ params: { contactId } }));
}

export function addContactTag(contactId: string, tag: string) {
    return unwrap<Contact>(
        client.contacts.addTag({ params: { contactId, tag } }),
    );
}

export function removeContactTag(contactId: string, tag: string) {
    return unwrap<Contact>(
        client.contacts.removeTag({ params: { contactId, tag } }),
    );
}

export interface Segment {
    segmentId: string;
    name: string;
    conditions: Record<string, unknown>[];
}

export function listSegments() {
    return unwrap<{ items: Segment[] }>(client.segments.list());
}

export function createSegment(input: {
    name: string;
    conditions?: Record<string, unknown>[];
}) {
    return unwrap<Segment>(
        client.segments.create({
            body: { name: input.name, conditions: input.conditions ?? [] },
        }),
    );
}

export function deleteSegment(segmentId: string) {
    return unwrap<void>(client.segments.remove({ params: { segmentId } }));
}

export interface NewsletterSettings {
    connected: boolean;
    mailingAddress?: string | null;
    updatedAt?: string | null;
}

export function getNewsletterSettings() {
    return unwrap<NewsletterSettings>(client.newsletter.getSettings());
}

export function updateNewsletterSettings(patch: { mailingAddress?: string }) {
    return unwrap<NewsletterSettings>(
        client.newsletter.updateSettings({ body: patch }),
    );
}

export type EspProvider =
    "smtp" | "sendgrid" | "mailgun" | "postmark" | "ses" | "resend" | "custom";

export interface EspConfig {
    espId: string;
    name: string;
    isDefault: boolean;
    provider: EspProvider;
    host: string;
    port: number;
    secure: boolean;
    username?: string | null;
    hasPassword: boolean;
    fromName?: string | null;
    fromEmail?: string | null;
    lastTestedAt?: string | null;
    lastTestStatus?: "success" | "failed" | null;
    lastTestError?: string | null;
    updatedAt?: string | null;
}

export interface EspConnectionInput {
    provider: EspProvider;
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    /** Omit to retain the secret already stored by SendLit. */
    password?: string;
    fromName?: string;
    fromEmail?: string;
}

export function getEspConfig() {
    return unwrap<EspConfig | null>(client.settings.esp.get());
}

export function updateEspConfig(input: EspConnectionInput) {
    return unwrap<EspConfig>(client.settings.esp.upsert({ body: input }));
}

export function deleteEspConfig() {
    return unwrap<void>(client.settings.esp.remove());
}

export function testEspConfig(to: string) {
    return unwrap<{ success: boolean; error?: string }>(
        client.settings.esp.test({ body: { to } }),
    );
}

export interface Broadcast {
    broadcastId: string;
    name: string;
    status: string;
    subject?: string | null;
    /** SendLit's structured email document, edited with @sendlit/email-blocks. */
    body?: Record<string, unknown> | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface NewsletterTemplate {
    templateId: string;
    title: string;
    body: Record<string, unknown>;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export function listNewsletterTemplates() {
    return unwrap<{ items: NewsletterTemplate[] }>(
        client.newsletter.listTemplates(),
    );
}

export function createNewsletterTemplate(input: {
    title: string;
    body: Record<string, unknown>;
}) {
    return unwrap<NewsletterTemplate>(
        client.newsletter.createTemplate({ body: input }),
    );
}

export function updateNewsletterTemplate(
    templateId: string,
    patch: Partial<{ title: string; body: Record<string, unknown> }>,
) {
    return unwrap<NewsletterTemplate>(
        client.newsletter.updateTemplate({
            params: { templateId },
            body: patch,
        }),
    );
}

export function listBroadcasts() {
    return unwrap<{ items: Broadcast[] }>(client.newsletter.listBroadcasts());
}

export function createBroadcast(input: {
    name: string;
    subject?: string;
    body?: Record<string, unknown>;
    templateId?: string;
}) {
    return unwrap<Broadcast>(
        client.newsletter.createBroadcast({ body: input }),
    );
}

export function updateBroadcast(
    broadcastId: string,
    patch: Partial<{
        name: string;
        subject: string;
        body: Record<string, unknown>;
    }>,
) {
    return unwrap<Broadcast>(
        client.newsletter.updateBroadcast({
            params: { broadcastId },
            body: patch,
        }),
    );
}

export function sendBroadcast(broadcastId: string) {
    return unwrap<{ status: string }>(
        client.newsletter.sendBroadcast({ params: { broadcastId } }),
    );
}

// ---- AI -------------------------------------------------------------------

export type AiProvider =
    "openai" | "azure" | "anthropic" | "openrouter" | "bedrock" | "opencode";
export type EmbeddingProvider = "openai" | "azure";
export interface AiModelSettings {
    chatbot: string | null;
    grammar: string | null;
    builder: string | null;
}

export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    deployment: string | null;
    endpoint: string | null;
    hasApiKey: boolean;
}

export interface AiConfig {
    provider: AiProvider;
    models: AiModelSettings;
    region: string | null;
    endpoint: string | null;
    hasApiKey: boolean;
    embedding: EmbeddingConfig | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export function getAiConfig() {
    return unwrap<AiConfig | null>(client.ai.get());
}

export function updateAiConfig(input: {
    provider: AiProvider;
    models?: Partial<AiModelSettings>;
    region?: string;
    endpoint?: string;
    /** Omit to retain the team's currently stored credential. */
    apiKey?: string;
    embedding?: {
        provider: EmbeddingProvider;
        apiKey?: string;
        deployment?: string;
        endpoint?: string;
    };
}) {
    return unwrap<AiConfig>(client.ai.update({ body: input }));
}

export function deleteAiConfig() {
    return unwrap<void>(client.ai.remove());
}

// ---- Chatbot --------------------------------------------------------------

export type ChatbotWidgetVariant = "bubble" | "text_input";
export type ChatbotWidgetStyle = {
    bubbleShape: "circle" | "rounded" | "square";
    bubbleIcon: "chat" | "message" | "sparkles" | "bot";
    bubbleSize: "sm" | "md" | "lg";
    inputRadius: "none" | "sm" | "md" | "lg" | "full";
    inputPlaceholder: string | null;
    inputWidth: "sm" | "md" | "lg";
};

export interface ChatbotSettings {
    enabled: boolean;
    name: string;
    greeting?: string | null;
    accentColor?: string | null;
    escalationEnabled: boolean;
    variant: ChatbotWidgetVariant;
    widgetStyle: ChatbotWidgetStyle;
    createdAt: string | null;
    updatedAt: string | null;
}

export function getChatbotSettings() {
    return unwrap<ChatbotSettings>(client.chatbot.get());
}

export function updateChatbotSettings(
    patch: Partial<{
        enabled: boolean;
        name: string;
        greeting: string;
        /** `null` clears the override so the public widget uses the site theme primary. */
        accentColor: string | null;
        escalationEnabled: boolean;
        variant: ChatbotWidgetVariant;
        widgetStyle: Partial<ChatbotWidgetStyle>;
    }>,
) {
    return unwrap<ChatbotSettings>(client.chatbot.update({ body: patch }));
}

// ---- Help desk (support tickets) -------------------------------------------

export type TicketStatus = "open" | "pending" | "resolved" | "closed";
export type TicketSource = "form" | "chatbot" | "api";

export interface TicketMessage {
    messageId: string;
    author: "requester" | "agent" | "bot";
    authorAccountId?: string | null;
    content: TextEditorContent;
    createdAt: string | null;
}

export interface Ticket {
    ticketId: string;
    subject: string;
    status: TicketStatus;
    requesterEmail: string | null;
    requesterName?: string | null;
    source: TicketSource;
    assigneeAccountId?: string | null;
    lastMessageAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export interface TicketWithMessages extends Ticket {
    messages: TicketMessage[];
}

export function listTickets(
    params: {
        status?: TicketStatus;
        assigneeAccountId?: string;
        q?: string;
        offset?: number;
        itemsPerPage?: number;
    } = {},
) {
    return unwrap<Paginated<Ticket>>(client.tickets.list({ query: params }));
}

export function getTicket(ticketId: string) {
    return unwrap<TicketWithMessages>(
        client.tickets.get({ params: { ticketId } }),
    );
}

export function replyToTicket(ticketId: string, content: TextEditorContent) {
    return unwrap<TicketWithMessages>(
        client.tickets.reply({
            params: { ticketId },
            body: { content: content as any },
        }),
    );
}

export function updateTicket(
    ticketId: string,
    patch: Partial<{ status: TicketStatus; assigneeAccountId: string | null }>,
) {
    return unwrap<Ticket>(
        client.tickets.update({ params: { ticketId }, body: patch }),
    );
}

// ---- Domains ----------------------------------------------------------------

export interface Subdomain {
    name: string;
    hostname: string;
}

export interface CustomDomain {
    hostname: string;
    status: "pending" | "verified" | "failed";
    verifiedAt: string | null;
}

export interface DomainSettings {
    subdomain: Subdomain | null;
    customDomain: CustomDomain | null;
    canonicalHost: string | null;
    verificationRecords: {
        cnameTarget: string;
        txtName: string;
        txtValue: string;
    } | null;
}

export function getDomainSettings() {
    return unwrap<DomainSettings>(client.domains.get());
}

export function setTeamSubdomain(slug: string) {
    return unwrap<DomainSettings>(
        client.domains.setSubdomain({ body: { slug } }),
    );
}

export function attachCustomDomain(hostname: string) {
    return unwrap<DomainSettings>(
        client.domains.attachCustomDomain({ body: { hostname } }),
    );
}

export function verifyCustomDomain() {
    return unwrap<DomainSettings>(client.domains.verifyCustomDomain());
}

export function removeCustomDomain() {
    return unwrap<DomainSettings>(client.domains.removeCustomDomain());
}

// ---- Team settings (branding + code injection) -------------------------------

export interface TeamSettings {
    title: string | null;
    subtitle: string | null;
    logo: Record<string, unknown> | null;
    themeId: string | null;
    codeInjectionHead: string | null;
    codeInjectionBody: string | null;
    createdAt: string | null;
    updatedAt: string | null;
}

export function getTeamSettings() {
    return unwrap<TeamSettings>(client.settings.get());
}

export function updateTeamSettings(
    patch: Partial<{
        title: string;
        subtitle: string;
        logo: Record<string, unknown> | null;
        themeId: string | null;
        codeInjectionHead: string | null;
        codeInjectionBody: string | null;
    }>,
) {
    return unwrap<TeamSettings>(client.settings.update({ body: patch }));
}
