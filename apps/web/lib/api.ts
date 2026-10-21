import { initClient } from "@ts-rest/core";
import { contract } from "@frontlit/api-contract";
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
    case "GITHUB_REFERENCE_UNAVAILABLE":
      return "The repository or publishing branch is unavailable. Check repository access and choose an existing branch. For an empty repository, use Review setup PR with its default branch; FrontLit handles initialization.";
    case "GITHUB_PROPOSAL_NOT_FOUND":
      return "This documentation proposal is unavailable.";
    case "GITHUB_CHECK_NOT_FOUND":
      return "This documentation check is unavailable.";
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
        code?: string;
        diagnostics?: Array<{ message: string }>;
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

  const code = errorBody?.code || errorBody?.error || `request_failed`;
  throw new ApiError(
    result.status,
    errorBody?.error_description ||
      errorBody?.diagnostics?.[0]?.message ||
      // Coded errors carry a human message in `error`; plain errors use it as the code.
      (errorBody?.code && errorBody.error && errorBody.error !== errorBody.code
        ? errorBody.error
        : describeApiError(code)),
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
  return unwrap<{ items: ApiKey[] }>(client.teams.listKeys({ params: { teamId } }));
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

export interface AcceptedTeamMember extends TeamMember {
  teamId: string;
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
  return unwrap<void>(client.teams.removeMember({ params: { teamId, memberId } }));
}

export function leaveTeam(teamId: string) {
  return unwrap<void>(client.teams.leave({ params: { teamId } } as any));
}

export function transferTeamOwnership(
  teamId: string,
  body: { memberId: string; revokeApiKeys?: boolean },
) {
  return unwrap<Team>(client.teams.transferOwnership({ params: { teamId }, body }));
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

export function previewTeamInvitation(body: { invitationId: string; token: string }) {
  return unwrap<InvitationPreview>(client.teamInvitations.preview({ body }));
}

export function acceptTeamInvitation(body: { invitationId: string; token: string }) {
  return unwrap<AcceptedTeamMember>(client.teamInvitations.accept({ body }));
}

export function rejectTeamInvitation(body: { invitationId: string; token: string }) {
  return unwrap<void>(client.teamInvitations.reject({ body }));
}

// ---- Pages ------------------------------------------------------------

export type PageStatus = "draft" | "published" | "published_with_changes";

export interface Page {
  pageId: string;
  name: string;
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
  /** Set while pages sync from GitHub: where this page's file lives. */
  git?: {
    path: string;
    editUrl: string;
    repositoryUrl: string;
    branch: string;
    liveSha: string | null;
    pullRequest: {
      number: number;
      url: string;
      status: "open" | "merged" | "closed";
    } | null;
  } | null;
}

export function listPages(
  params: { q?: string; offset?: number; itemsPerPage?: number } = {},
) {
  return unwrap<Paginated<Page>>(client.pages.list({ query: params }));
}

export function createPage(input: { name: string }) {
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
  return unwrap<Page>(client.pages.update({ params: { pageId }, body: patch }));
}

export function deletePage(pageId: string) {
  return unwrap<void>(client.pages.remove({ params: { pageId } }));
}

export function publishPage(pageId: string) {
  return unwrap<Page>(client.pages.publish({ params: { pageId } }));
}

export function createPagePullRequest(pageId: string) {
  return unwrap<{ number: number; url: string }>(
    client.pages.createPullRequest({ params: { pageId } }),
  );
}

export function discardPageDraft(pageId: string) {
  return unwrap<Page>(client.pages.discardDraft({ params: { pageId } }));
}

export type SiteRelease = import("@ts-rest/core").ClientInferResponseBody<
  typeof contract.pages.activateRelease,
  200
>;

export function listSiteReleases() {
  return unwrap<{ items: SiteRelease[] }>(client.pages.listReleases());
}

export function activateSiteRelease(releaseId: string) {
  return unwrap<SiteRelease>(client.pages.activateRelease({ params: { releaseId } }));
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

export function createTheme(input: { name: string; style: Record<string, unknown> }) {
  return unwrap<Theme>(client.themes.create({ body: input }));
}

export function getTheme(themeId: string) {
  return unwrap<Theme>(client.themes.get({ params: { themeId } }));
}

export function updateTheme(
  themeId: string,
  patch: Partial<{ name: string; style: Record<string, unknown> }>,
) {
  return unwrap<Theme>(client.themes.update({ params: { themeId }, body: patch }));
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
  referenceCount?: number;
}

export function listMedia(params: { offset?: number; itemsPerPage?: number } = {}) {
  return unwrap<Paginated<Media>>(client.media.list({ query: params }));
}

export interface UnsplashPhoto {
  id: string;
  alt?: string;
  thumbUrl: string;
  url: string;
  photographer?: string;
}

export function searchUnsplash(q?: string) {
  return unwrap<{ configured: boolean; items: UnsplashPhoto[] }>(
    client.media.searchUnsplash({ query: { q } }),
  );
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
  return unwrap<Media>(client.media.update({ params: { mediaId }, body: patch }));
}

export function deleteMedia(mediaId: string) {
  return unwrap<void>(client.media.remove({ params: { mediaId } }));
}

// ---- Content: articles --------------------------------------------------

export type DocumentStatus = "draft" | "published" | "published_with_changes";

export interface ArticleMeta {
  tags: string[];
  indexable?: boolean;
}

export interface Article {
  documentId: string;
  slug: string;
  status: DocumentStatus;
  index?: DocumentationIndex | null;
  publishedAt?: string | null;
  title?: string | null;
  content?: TextEditorContent | null;
  excerpt?: string | null;
  featuredImage?: Record<string, unknown> | null;
  meta: ArticleMeta;
  draftTitle: string;
  draftContent: TextEditorContent;
  draftExcerpt?: string | null;
  draftFeaturedImage?: Record<string, unknown> | null;
  draftMeta: ArticleMeta;
  createdAt: string | null;
  updatedAt: string | null;
}

export function listArticles(
  params: { q?: string; offset?: number; itemsPerPage?: number } = {},
) {
  return unwrap<Paginated<Article>>(client.content.articles.list({ query: params }));
}

export function createArticle(input: { title: string; meta?: Partial<ArticleMeta> }) {
  return unwrap<Article>(client.content.articles.create({ body: input }));
}

export function getArticle(documentId: string) {
  return unwrap<Article>(client.content.articles.get({ params: { documentId } }));
}

export function updateArticle(
  documentId: string,
  patch: Partial<{
    slug: string;
    title: string;
    content: TextEditorContent;
    excerpt: string;
    featuredImage: Record<string, unknown> | null;
    meta: Partial<ArticleMeta>;
  }>,
) {
  return unwrap<Article>(
    client.content.articles.update({ params: { documentId }, body: patch }),
  );
}

export function publishArticle(documentId: string) {
  return unwrap<Article>(client.content.articles.publish({ params: { documentId } }));
}

export function discardArticleDraft(documentId: string) {
  return unwrap<Article>(
    client.content.articles.discardDraft({ params: { documentId } }),
  );
}

export function deleteArticle(documentId: string) {
  return unwrap<void>(client.content.articles.remove({ params: { documentId } }));
}

// ---- Content: documentation --------------------------------------------

export interface DocumentationMeta {
  sectionId?: string | null;
  order: number;
  indexable?: boolean;
  frontmatter?: Record<string, unknown>;
}

export type DocumentationIndexState = "pending" | "indexed" | "failed" | "excluded";

export interface DocumentationIndex {
  state: DocumentationIndexState;
  lastError?: string | null;
}

export interface DocumentationPage {
  draftVersion: number;
  draftGitSource?: import("@ts-rest/core").ClientInferResponseBody<
    typeof contract.content.documentation.get,
    200
  >["draftGitSource"];
  source?: "editor" | "git";
  draftSlug: string | null;
  publishable?: boolean;
  diagnostics?: Array<{ code: string; message: string; blocksPublish: boolean }>;
  documentId: string;
  slug: string;
  status: DocumentStatus;
  index?: DocumentationIndex | null;
  publishedAt?: string | null;
  title?: string | null;
  content?: TextEditorContent | null;
  excerpt?: string | null;
  featuredImage?: Record<string, unknown> | null;
  meta: DocumentationMeta;
  draftTitle: string;
  draftContent: TextEditorContent;
  draftExcerpt?: string | null;
  draftFeaturedImage?: Record<string, unknown> | null;
  draftMeta: DocumentationMeta;
  createdAt: string | null;
  updatedAt: string | null;
}

export function listDocumentationPages(
  params: { q?: string; offset?: number; itemsPerPage?: number } = {},
) {
  return unwrap<Paginated<DocumentationPage>>(
    client.content.documentation.list({ query: params }),
  );
}

/** Load complete administrative selections rather than silently stopping at 500. */
export async function listAllDocumentationPages() {
  const items: DocumentationPage[] = [];
  let total = 0;
  let pageNumber = 1;
  do {
    const page = await listDocumentationPages({
      offset: pageNumber,
      itemsPerPage: 500,
    });
    total = page.total;
    if (!page.items.length && items.length < total)
      throw new Error("Documentation changed while loading. Refresh and try again.");
    items.push(...page.items);
    pageNumber += 1;
  } while (items.length < total);
  if (new Set(items.map((item) => item.documentId)).size !== items.length)
    throw new Error("Documentation changed while loading. Refresh and try again.");
  return items;
}

export function createDocumentationPage(input: {
  title: string;
  gitSourcePath?: string;
  meta?: Partial<DocumentationMeta>;
}) {
  return unwrap<DocumentationPage>(
    client.content.documentation.create({ body: input }),
  );
}

export function getDocumentationPage(documentId: string) {
  return unwrap<DocumentationPage>(
    client.content.documentation.get({ params: { documentId } }),
  );
}

export function updateDocumentationPage(
  documentId: string,
  patch: Partial<{
    slug: string;
    gitSourcePath: string;
    title: string;
    content: TextEditorContent;
    excerpt: string | null;
    featuredImage: Record<string, unknown> | null;
    meta: Partial<DocumentationMeta>;
  }>,
  expectedDraftVersion: number,
) {
  return unwrap<DocumentationPage>(
    client.content.documentation.update({
      params: { documentId },
      body: { ...patch, expectedDraftVersion },
    }),
  );
}

export async function publishDocumentationPage(
  documentId: string,
  expectedDraftVersion: number,
) {
  const settings = await getDocumentationSettings();
  return unwrap<DocumentationPage>(
    client.content.documentation.publish({
      params: { documentId },
      body: {
        expectedDraftVersion,
        expectedDocsDraftVersion: settings.draftVersion,
        expectedPublicationId: settings.activePublicationId,
      },
    }),
  );
}

export function discardDocumentationPageDraft(
  documentId: string,
  expectedDraftVersion: number,
) {
  return unwrap<DocumentationPage>(
    client.content.documentation.discardDraft({
      params: { documentId },
      body: { expectedDraftVersion },
    }),
  );
}

export function deleteDocumentationPage(
  documentId: string,
  expectedDraftVersion: number,
) {
  return unwrap<void>(
    client.content.documentation.remove({
      params: { documentId },
      query: { expectedDraftVersion },
    }),
  );
}

export interface DocumentationSection {
  sectionId: string;
  name: string;
  slug: string;
  order: number;
  createdAt: string | null;
  updatedAt: string | null;
}

export function listDocumentationSections() {
  return unwrap<{ items: DocumentationSection[] }>(
    client.content.documentationSections.list(),
  );
}

export function getDocumentationSettings() {
  return unwrap<{
    draftVersion: number;
    activePublicationId: string | null;
    navigationPending?: boolean;
    publishedNavigation?: {
      sectionId: string;
      name: string;
      slug: string;
      order: number;
    }[];
    requestedGeneration: number;
    policyEpoch: number;
    purgeGeneration: number;
    source: "editor" | "git";
    indexing: { enabled: boolean; mode?: "lexical" | "semantic" };
  }>(client.content.documentationSections.getSettings());
}

export function createDocumentationSection(
  input: { name: string; order?: number },
  expectedDocsDraftVersion: number,
) {
  return unwrap<DocumentationSection>(
    client.content.documentationSections.create({
      body: { ...input, expectedDocsDraftVersion },
    }),
  );
}

export function updateDocumentationSection(
  sectionId: string,
  patch: Partial<{ name: string; order: number }>,
  expectedDocsDraftVersion: number,
) {
  return unwrap<DocumentationSection>(
    client.content.documentationSections.update({
      params: { sectionId },
      body: { ...patch, expectedDocsDraftVersion },
    }),
  );
}

export function deleteDocumentationSection(
  sectionId: string,
  expectedDocsDraftVersion: number,
) {
  return unwrap<void>(
    client.content.documentationSections.remove({
      params: { sectionId },
      query: { expectedDocsDraftVersion },
    }),
  );
}

export interface DocumentationSearchResult {
  documentId: string;
  slug: string;
  title: string | null;
  heading: string | null;
  anchor: string | null;
  content: string;
  similarity: number;
  kind?: "blog" | "doc" | "changelog";
}

export function searchDocumentation(q: string, k?: number) {
  return unwrap<{ items: DocumentationSearchResult[] }>(
    client.content.documentationSections.search({ query: { q, k } }),
  );
}

// ---- Content: product updates -------------------------------------------

export interface ProductUpdateMeta {
  version?: string;
  labels: string[];
  releaseDate?: string;
  github?: { releaseId: number; releaseUrl: string; tagName: string };
  indexable?: boolean;
}

export interface ProductUpdate {
  documentId: string;
  slug: string;
  status: DocumentStatus;
  index?: DocumentationIndex | null;
  publishedAt?: string | null;
  title?: string | null;
  content?: TextEditorContent | null;
  excerpt?: string | null;
  featuredImage?: Record<string, unknown> | null;
  meta: ProductUpdateMeta;
  draftTitle: string;
  draftContent: TextEditorContent;
  draftExcerpt?: string | null;
  draftFeaturedImage?: Record<string, unknown> | null;
  draftMeta: ProductUpdateMeta;
  createdAt: string | null;
  updatedAt: string | null;
}

export function listProductUpdates(params: { q?: string } = {}) {
  return unwrap<Paginated<ProductUpdate>>(
    client.content.productUpdates.list({ query: params }),
  );
}

export function createProductUpdate(input: {
  title: string;
  meta?: Partial<ProductUpdateMeta>;
}) {
  return unwrap<ProductUpdate>(client.content.productUpdates.create({ body: input }));
}

export function getProductUpdate(documentId: string) {
  return unwrap<ProductUpdate>(
    client.content.productUpdates.get({ params: { documentId } }),
  );
}

export function updateProductUpdate(
  documentId: string,
  patch: Partial<{
    slug: string;
    title: string;
    content: TextEditorContent;
    excerpt: string;
    featuredImage: Record<string, unknown> | null;
    meta: Partial<ProductUpdateMeta>;
  }>,
) {
  return unwrap<ProductUpdate>(
    client.content.productUpdates.update({
      params: { documentId },
      body: patch,
    }),
  );
}

export function publishProductUpdate(documentId: string) {
  return unwrap<ProductUpdate>(
    client.content.productUpdates.publish({ params: { documentId } }),
  );
}

export function discardProductUpdateDraft(documentId: string) {
  return unwrap<ProductUpdate>(
    client.content.productUpdates.discardDraft({ params: { documentId } }),
  );
}

export function deleteProductUpdate(documentId: string) {
  return unwrap<void>(client.content.productUpdates.remove({ params: { documentId } }));
}

export interface GithubIntegration {
  connected: boolean;
  repo: string | null;
}

export function getGithubIntegration() {
  return unwrap<GithubIntegration>(
    client.content.productUpdates.getGithubIntegration(),
  );
}

export function connectGithubIntegration(input: { token: string; repo: string }) {
  return unwrap<GithubIntegration>(
    client.content.productUpdates.connectGithub({ body: input }),
  );
}

export function disconnectGithubIntegration() {
  return unwrap<void>(client.content.productUpdates.disconnectGithub());
}

export function importGithubReleases() {
  return unwrap<{ imported: number; skipped: number }>(
    client.content.productUpdates.importGithubReleases(),
  );
}

// ---- Email (SendLit, read-through) ------------------------------------

export interface Contact {
  contactId: string;
  email: string;
  name?: string | null;
  tags: string[];
  subscribed: boolean;
  createdAt?: string;
}

export function createContact(input: {
  email: string;
  name?: string;
  tags?: string[];
}) {
  return unwrap<Contact>(client.contacts.create({ body: input }));
}

export function listContacts(
  params: {
    email?: string;
    tag?: string;
    subscribed?: boolean;
    q?: string;
    segmentId?: string;
    filter?: string;
    offset?: number;
    itemsPerPage?: number;
  } = {},
) {
  return unwrap<Paginated<Contact>>(client.contacts.list({ query: params }));
}

export function getContact(contactId: string) {
  return unwrap<Contact>(client.contacts.get({ params: { contactId } }));
}

export function updateContact(
  contactId: string,
  patch: { name?: string; subscribed?: boolean },
) {
  return unwrap<Contact>(
    client.contacts.update({ params: { contactId }, body: patch }),
  );
}

export function deleteContact(contactId: string) {
  return unwrap<void>(client.contacts.remove({ params: { contactId } }));
}

export function addContactTag(contactId: string, tag: string) {
  return unwrap<Contact>(client.contacts.addTag({ params: { contactId, tag } }));
}

export function removeContactTag(contactId: string, tag: string) {
  return unwrap<Contact>(client.contacts.removeTag({ params: { contactId, tag } }));
}

export interface ContactFilterCondition {
  name: string;
  condition: string;
  value?: string;
  key?: string;
  valueLabel?: string;
}

export interface ContactFilter {
  aggregator: "and" | "or";
  filters: ContactFilterCondition[];
}

export interface Segment {
  segmentId: string;
  name: string;
  filter: ContactFilter;
}

export function listSegments() {
  return unwrap<{ items: Segment[] }>(client.segments.list());
}

export function createSegment(input: { name: string; filter: ContactFilter }) {
  return unwrap<Segment>(client.segments.create({ body: input }));
}

export function deleteSegment(segmentId: string) {
  return unwrap<void>(client.segments.remove({ params: { segmentId } }));
}

export interface EmailSettings {
  connected: boolean;
  mailingAddress?: string | null;
  updatedAt?: string | null;
}

export function getEmailSettings() {
  return unwrap<EmailSettings>(client.email.getSettings());
}

export function updateEmailSettings(patch: { mailingAddress?: string }) {
  return unwrap<EmailSettings>(client.email.updateSettings({ body: patch }));
}

export function retryEmailProvision() {
  return unwrap<EmailSettings & { error?: string }>(client.email.retryProvision());
}

export type EspProvider =
  | "smtp"
  | "sendgrid"
  | "mailgun"
  | "postmark"
  | "ses"
  | "resend"
  | "custom";

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
  filter?: ContactFilter | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EmailTemplate {
  templateId: string;
  title: string;
  body: Record<string, unknown>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface SystemEmailTemplate {
  templateId: string;
  title: string;
  description?: string;
  body: Record<string, unknown>;
}

export function listEmailTemplates() {
  return unwrap<{ items: EmailTemplate[] }>(client.email.listTemplates());
}

export function listSystemEmailTemplates() {
  return unwrap<{ items: SystemEmailTemplate[] }>(client.email.listSystemTemplates());
}

export function createEmailTemplate(input: {
  title: string;
  body: Record<string, unknown>;
}) {
  return unwrap<EmailTemplate>(client.email.createTemplate({ body: input }));
}

export function updateEmailTemplate(
  templateId: string,
  patch: Partial<{ title: string; body: Record<string, unknown> }>,
) {
  return unwrap<EmailTemplate>(
    client.email.updateTemplate({
      params: { templateId },
      body: patch,
    }),
  );
}

export function listBroadcasts() {
  return unwrap<{ items: Broadcast[] }>(client.email.listBroadcasts());
}

export function createBroadcast(input: {
  name: string;
  subject?: string;
  body?: Record<string, unknown>;
  templateId?: string;
  filter?: ContactFilter;
}) {
  return unwrap<Broadcast>(client.email.createBroadcast({ body: input }));
}

export function updateBroadcast(
  broadcastId: string,
  patch: Partial<{
    name: string;
    subject: string;
    body: Record<string, unknown>;
    filter: ContactFilter | null;
  }>,
) {
  return unwrap<Broadcast>(
    client.email.updateBroadcast({
      params: { broadcastId },
      body: patch,
    }),
  );
}

export function sendBroadcast(broadcastId: string) {
  return unwrap<{ status: string }>(
    client.email.sendBroadcast({ params: { broadcastId } }),
  );
}

export function deleteBroadcast(broadcastId: string) {
  return unwrap<void>(client.email.removeBroadcast({ params: { broadcastId } }));
}

// ---- AI -------------------------------------------------------------------

export type AiProvider =
  | "openai"
  | "azure"
  | "anthropic"
  | "openrouter"
  | "bedrock"
  | "opencode";
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

export interface AiIndexContent {
  articles: boolean;
  changelog: boolean;
}

export interface AiConfig {
  provider: AiProvider;
  models: AiModelSettings;
  region: string | null;
  endpoint: string | null;
  hasApiKey: boolean;
  embedding: EmbeddingConfig | null;
  indexContent: AiIndexContent;
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
  indexContent?: Partial<AiIndexContent>;
}) {
  return unwrap<AiConfig>(client.ai.update({ body: input }));
}

export function deleteAiConfig() {
  return unwrap<void>(client.ai.remove());
}

export type InboxAiChannel = "chatbot" | "tickets";

export interface InboxAiPolicy {
  channel: InboxAiChannel;
  autoReply: boolean;
  escalateOnVisitorRequest: boolean;
  escalateWhenUnsure: boolean;
  escalateTopics: string[];
  escalateAfterBotTurns: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface InboxAiSettings {
  aiConfigured: boolean;
  channels: {
    chatbot?: InboxAiPolicy;
    tickets?: InboxAiPolicy;
  };
}

export type InboxAiPolicyPatch = Partial<{
  autoReply: boolean;
  escalateOnVisitorRequest: boolean;
  escalateWhenUnsure: boolean;
  escalateTopics: string[];
  escalateAfterBotTurns: number | null;
}>;

export function getInboxAiSettings() {
  return unwrap<InboxAiSettings>(client.inboxAi.get());
}

export function updateInboxAiSettings(channels: {
  chatbot?: InboxAiPolicyPatch;
  tickets?: InboxAiPolicyPatch;
}) {
  return unwrap<InboxAiSettings>(client.inboxAi.update({ body: { channels } }));
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
export type TicketSource = "form" | "chatbot" | "api" | "email";

export interface TicketAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  createdAt: string | null;
}

export interface TicketMessageSource {
  documentId: string;
  slug: string;
  title: string | null;
  anchor: string | null;
  kind?: "blog" | "doc" | "changelog";
}

export interface TicketMessage {
  messageId: string;
  author: "requester" | "agent" | "bot";
  authorAccountId?: string | null;
  content: TextEditorContent;
  attachments?: TicketAttachment[];
  sources?: TicketMessageSource[];
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
  aiState?: "idle" | "generating" | "waiting" | "escalated" | "taken_over";
  lastMessageAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TicketAiRetrieval {
  documentId: string;
  slug: string;
  title: string | null;
  heading?: string | null;
  anchor: string | null;
  similarity?: number;
  kind?: "blog" | "doc" | "changelog";
}

export interface TicketAiRun {
  triggerMessageId: string;
  status: string;
  stopReason?: string | null;
  lastError?: string | null;
  retrieval: TicketAiRetrieval[];
  createdAt: string | null;
}

export interface TicketAiOptics {
  state: string;
  stopReason: string | null;
  runs: TicketAiRun[];
}

export interface TicketWithMessages extends Ticket {
  messages: TicketMessage[];
  ai?: TicketAiOptics;
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
  return unwrap<TicketWithMessages>(client.tickets.get({ params: { ticketId } }));
}

export function replyToTicket(
  ticketId: string,
  content: TextEditorContent,
  attachmentIds: string[] = [],
) {
  return unwrap<TicketWithMessages>(
    client.tickets.reply({
      params: { ticketId },
      body: {
        content: content as any,
        ...(attachmentIds.length ? { attachmentIds } : {}),
      },
    }),
  );
}

export function presignTicketAttachment(ticketId: string) {
  return unwrap<{ signature: string; endpoint: string }>(
    client.tickets.presignAttachment({ params: { ticketId } }),
  );
}

export function completeTicketAttachment(
  ticketId: string,
  mediaLitId: string,
  meta: { fileName?: string; mimeType?: string; size?: number } = {},
) {
  return unwrap<TicketAttachment>(
    client.tickets.completeAttachment({
      params: { ticketId },
      body: { mediaLitId, ...meta },
    }),
  );
}

export function updateTicket(
  ticketId: string,
  patch: Partial<{ status: TicketStatus; assigneeAccountId: string | null }>,
) {
  return unwrap<Ticket>(client.tickets.update({ params: { ticketId }, body: patch }));
}

// ---- Domains ----------------------------------------------------------------

export interface Subdomain {
  name: string;
  hostname: string;
}

export interface CustomDomain {
  hostname: string;
  primary: boolean;
  status: "pending" | "verified" | "failed";
  verifiedAt: string | null;
  record: { type: "A" | "CNAME"; values: string[] };
  routingSatisfied: boolean | null;
}

export interface DomainSettings {
  subdomain: Subdomain | null;
  customDomains: CustomDomain[];
  verification: {
    txtName: string;
    txtValue: string;
    txtSatisfied: boolean | null;
  } | null;
  canonicalHost: string | null;
  redirectSubdomain: boolean;
  hideFromSearch: boolean;
  platformDomain: string;
}

export function getDomainSettings() {
  return unwrap<DomainSettings>(client.domains.get());
}

export function setTeamSubdomain(slug: string) {
  return unwrap<DomainSettings>(client.domains.setSubdomain({ body: { slug } }));
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

export function setPrimaryCustomDomain(hostname: string) {
  return unwrap<DomainSettings>(
    client.domains.setPrimaryCustomDomain({ body: { hostname } }),
  );
}

export function setHideFromSearch(hideFromSearch: boolean) {
  return unwrap<DomainSettings>(
    client.domains.setHideFromSearch({ body: { hideFromSearch } }),
  );
}

export function setRedirectSubdomain(redirectSubdomain: boolean) {
  return unwrap<DomainSettings>(
    client.domains.setRedirectSubdomain({ body: { redirectSubdomain } }),
  );
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

export type DocsPublication = import("@ts-rest/core").ClientInferResponseBody<
  typeof contract.content.documentationSections.getPublication,
  200
>;
export type DocsPreview = import("@ts-rest/core").ClientInferResponseBody<
  typeof contract.content.documentationSections.preview,
  200
>;
export type DocsRevision = import("@ts-rest/core").ClientInferResponseBody<
  typeof contract.content.documentationSections.getRevision,
  200
>;
export function previewDocumentationPage(
  documentId: string,
  expectedDraftVersion: number,
) {
  return unwrap<DocsPreview>(
    client.content.documentationSections.preview({
      params: { documentId },
      body: { expectedDraftVersion },
    }),
  );
}
export function listDocumentationPublications(cursor?: string) {
  return unwrap<{ items: DocsPublication[]; nextCursor: string | null }>(
    client.content.documentationSections.listPublications({
      query: { limit: 20, cursor },
    }),
  );
}
export function getDocumentationPublication(publicationId: string) {
  return unwrap<DocsPublication>(
    client.content.documentationSections.getPublication({ params: { publicationId } }),
  );
}
export function queueDocumentationPublication(
  input: import("@ts-rest/core").ClientInferRequest<
    typeof contract.content.documentationSections.queuePublication
  >["body"],
) {
  return unwrap<DocsPublication>(
    client.content.documentationSections.queuePublication({ body: input }),
  );
}
export function retryDocumentationPublication(
  publicationId: string,
  idempotencyKey: string,
) {
  return unwrap<DocsPublication>(
    client.content.documentationSections.retryPublication({
      params: { publicationId },
      body: { idempotencyKey },
    }),
  );
}
export function unpublishDocumentationPage(
  documentId: string,
  expectedPublicationId: string | null,
  expectedDocsDraftVersion: number,
  idempotencyKey: string,
) {
  return unwrap<DocsPublication>(
    client.content.documentationSections.unpublish({
      params: { documentId },
      body: { expectedPublicationId, expectedDocsDraftVersion, idempotencyKey },
    }),
  );
}
export function listDocumentationRevisions(documentId: string) {
  return unwrap<{ items: Omit<DocsRevision, "content" | "markdown">[] }>(
    client.content.documentationSections.listRevisions({ params: { documentId } }),
  );
}
export function getDocumentationRevision(documentId: string, revisionId: string) {
  return unwrap<DocsRevision>(
    client.content.documentationSections.getRevision({
      params: { documentId, revisionId },
    }),
  );
}
export function validateDocumentationPublication(
  selected: { documentId: string; expectedDraftVersion: number }[],
  removals: string[],
  includeSectionChanges = true,
) {
  return unwrap<
    import("@ts-rest/core").ClientInferResponseBody<
      typeof contract.content.documentationSections.validate,
      200
    >
  >(
    client.content.documentationSections.validate({
      body: { mode: "publication", selected, removals, includeSectionChanges },
    }),
  );
}

export type DocumentationImprovement = import("@ts-rest/core").ClientInferResponseBody<
  typeof contract.content.documentationSections.getImprovement,
  200
>;
export function listDocumentationImprovements(
  query: import("@ts-rest/core").ClientInferRequest<
    typeof contract.content.documentationSections.listImprovements
  >["query"] = {},
) {
  return unwrap<
    import("@ts-rest/core").ClientInferResponseBody<
      typeof contract.content.documentationSections.listImprovements,
      200
    >
  >(client.content.documentationSections.listImprovements({ query }));
}
export function getDocumentationImprovement(itemId: string) {
  return unwrap<DocumentationImprovement>(
    client.content.documentationSections.getImprovement({ params: { itemId } }),
  );
}
export function reviewDocumentationImprovement(
  itemId: string,
  body: import("@ts-rest/core").ClientInferRequest<
    typeof contract.content.documentationSections.reviewImprovement
  >["body"],
) {
  return unwrap<DocumentationImprovement>(
    client.content.documentationSections.reviewImprovement({
      params: { itemId },
      body,
    }),
  );
}
export function createDocumentationImprovementDraft(
  itemId: string,
  body: import("@ts-rest/core").ClientInferRequest<
    typeof contract.content.documentationSections.createImprovementDraft
  >["body"],
) {
  return unwrap<
    import("@ts-rest/core").ClientInferResponseBody<
      typeof contract.content.documentationSections.createImprovementDraft,
      201
    >
  >(
    client.content.documentationSections.createImprovementDraft({
      params: { itemId },
      body,
    }),
  );
}
export function recordTicketDocumentationFeedback(ticketId: string, messageId: string) {
  return unwrap<{ itemId: string; evidenceId: string }>(
    client.tickets.documentationFeedback({
      params: { ticketId },
      body: { messageId, eventId: crypto.randomUUID(), trigger: "negative_feedback" },
    }),
  );
}

export function updateDocumentationSettings(
  body: import("@ts-rest/core").ClientInferRequest<
    typeof contract.content.documentationSections.updateSettings
  >["body"],
) {
  return unwrap<
    import("@ts-rest/core").ClientInferResponseBody<
      typeof contract.content.documentationSections.updateSettings,
      200
    >
  >(client.content.documentationSections.updateSettings({ body }));
}

type GitContract = typeof contract.content.documentationGithub;
type GitRequest<K extends keyof GitContract> =
  import("@ts-rest/core").ClientInferRequest<GitContract[K]>;
type GitResponse<
  K extends keyof GitContract,
  S extends number = 200,
> = import("@ts-rest/core").ClientInferResponseBody<
  GitContract[K],
  S & keyof GitContract[K]["responses"]
>;
export type DocumentationGitSource = GitResponse<"get">;
export type DocumentationGitRepositories = GitResponse<"repositories">;
export type DocumentationGitPreflight = GitResponse<"preflight">;
export type DocumentationGitMigration = GitResponse<"getMigration">;
export function grantDocumentationGitCapabilities(
  body: GitRequest<"capabilities">["body"],
) {
  return unwrap<GitResponse<"capabilities">>(
    client.content.documentationGithub.capabilities({ body }),
  );
}
export type GitPagesPreview = GitResponse<"previewPages">;
export function previewGitPages(directory: string) {
  return unwrap<GitPagesPreview>(
    client.content.documentationGithub.previewPages({ body: { directory } }),
  );
}
export function enableGitPages(body: GitRequest<"enablePages">["body"]) {
  return unwrap<{ pagesDirectory: string | null }>(
    client.content.documentationGithub.enablePages({ body }),
  );
}
export function disableGitPages() {
  return unwrap<{ pagesDirectory: string | null }>(
    client.content.documentationGithub.disablePages({}),
  );
}
export function exportGitPages(directory: string) {
  return unwrap<{ number: number; url: string }>(
    client.content.documentationGithub.exportPages({ body: { directory } }),
  );
}
export function getDocumentationGitSource() {
  return unwrap<DocumentationGitSource>(client.content.documentationGithub.get({}));
}
export type DocumentationGitProposal = GitResponse<"getProposal">;
export function submitDocumentationGitProposal(
  body: GitRequest<"submitProposal">["body"],
) {
  return unwrap<GitResponse<"submitProposal", 202>>(
    client.content.documentationGithub.submitProposal({ body }),
  );
}
export function listDocumentationGitProposals(
  query: GitRequest<"listProposals">["query"] = {},
) {
  return unwrap<GitResponse<"listProposals">>(
    client.content.documentationGithub.listProposals({ query }),
  );
}
export function getDocumentationGitProposal(proposalId: string) {
  return unwrap<DocumentationGitProposal>(
    client.content.documentationGithub.getProposal({ params: { proposalId } }),
  );
}
export function startDocumentationGitSetup(body: GitRequest<"setup">["body"]) {
  return unwrap<GitResponse<"setup", 201>>(
    client.content.documentationGithub.setup({ body }),
  );
}
export function listDocumentationGitRepositories(
  setupId: string,
  query: GitRequest<"repositories">["query"] = {},
) {
  return unwrap<DocumentationGitRepositories>(
    client.content.documentationGithub.repositories({ params: { setupId }, query }),
  );
}
export function preflightDocumentationGit(body: GitRequest<"preflight">["body"]) {
  return unwrap<DocumentationGitPreflight>(
    client.content.documentationGithub.preflight({ body }),
  );
}
export function connectDocumentationGit(body: GitRequest<"connect">["body"]) {
  return unwrap<DocumentationGitSource>(
    client.content.documentationGithub.connect({ body }),
  );
}
export async function changeDocumentationGitState(
  action: "sync" | "pause" | "resume" | "disconnect",
) {
  if (action === "disconnect")
    return unwrap<DocumentationGitSource>(
      client.content.documentationGithub.disconnect({}),
    );
  if (action === "sync")
    return unwrap<GitResponse<"sync", 202>>(
      client.content.documentationGithub.sync({ body: {} }),
    );
  if (action === "resume")
    return unwrap<DocumentationGitSource>(
      client.content.documentationGithub.resume({ body: {} }),
    );
  return unwrap<DocumentationGitSource>(
    client.content.documentationGithub.pause({ body: {} }),
  );
}
export function planDocumentationGitMigration(
  body: GitRequest<"planMigration">["body"],
) {
  return unwrap<GitResponse<"planMigration", 201>>(
    client.content.documentationGithub.planMigration({ body }),
  );
}
export function getDocumentationGitMigration(planId: string, offset = 0) {
  return unwrap<DocumentationGitMigration>(
    client.content.documentationGithub.getMigration({
      params: { planId },
      query: { offset, limit: 25 },
    }),
  );
}
export function createDocumentationGitMigrationPr(
  planId: string,
  body: GitRequest<"createMigrationPr">["body"],
) {
  return unwrap<GitResponse<"createMigrationPr", 202>>(
    client.content.documentationGithub.createMigrationPr({ params: { planId }, body }),
  );
}
export function verifyDocumentationGitMigration(planId: string, setupId: string) {
  return unwrap<GitResponse<"verifyMigration">>(
    client.content.documentationGithub.verifyMigration({
      params: { planId },
      body: { setupId },
    }),
  );
}
export function activateDocumentationGitMigration(
  planId: string,
  body: GitRequest<"activateMigration">["body"],
) {
  return unwrap<DocumentationGitSource>(
    client.content.documentationGithub.activateMigration({ params: { planId }, body }),
  );
}
export function cancelDocumentationGitMigration(planId: string) {
  return unwrap<GitResponse<"cancelMigration">>(
    client.content.documentationGithub.cancelMigration({ params: { planId } }),
  );
}

export type DocumentationGitCheck = GitResponse<"getCheck">;
export function getDocumentationGitCheck(checkId: string) {
  return unwrap<DocumentationGitCheck>(
    client.content.documentationGithub.getCheck({ params: { checkId } }),
  );
}
export function listDocumentationGitChecks(
  query: GitRequest<"listChecks">["query"] = {},
) {
  return unwrap<GitResponse<"listChecks">>(
    client.content.documentationGithub.listChecks({ query }),
  );
}
