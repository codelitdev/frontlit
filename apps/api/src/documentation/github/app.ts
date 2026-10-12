import {
  createHash,
  createHmac,
  randomBytes,
  sign,
  timingSafeEqual,
} from "node:crypto";
import type { GitTreeEntry } from "./importer";
import {
  normalizeDocsSourceDirectory,
  resolveDocsSourcePath,
} from "@frontlit/text-editor/docs";

/** The worker supplies a fresh lease/credential/grant check, never a cached verdict. */
export type GitWriteGuard = () => Promise<void>;

const API_ORIGIN = "https://api.github.com";
export const GITHUB_API_VERSION = "2026-03-10";
// 2026-03-10 removed merge_commit_sha from all PR responses. Pin PR reads
// to the supported previous version while our validation needs that proof.
export const GITHUB_PR_API_VERSION = "2022-11-28";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
export class GitHubDocsError extends Error {
  constructor(
    public readonly code: string,
    public readonly status?: number,
    public readonly retryAt?: Date,
  ) {
    super(code);
    this.name = "GitHubDocsError";
  }
}
export type GitHubAppConfig = {
  appId: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  callbackUrl: string;
  webhookSecret: string;
  webOrigin: string;
};
export function getDocsGitHubAppConfig(): GitHubAppConfig {
  const env = process.env;
  const fields = {
    appId: env.GITHUB_DOCS_APP_ID,
    appSlug: env.GITHUB_DOCS_APP_SLUG,
    clientId: env.GITHUB_DOCS_CLIENT_ID,
    clientSecret: env.GITHUB_DOCS_CLIENT_SECRET,
    privateKey: env.GITHUB_DOCS_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    callbackUrl: env.GITHUB_DOCS_CALLBACK_URL,
    webhookSecret: env.GITHUB_DOCS_WEBHOOK_SECRET,
    webOrigin: env.GITHUB_DOCS_WEB_ORIGIN,
  };
  if (Object.values(fields).some((v) => !v))
    throw new GitHubDocsError("GITHUB_APP_NOT_CONFIGURED");
  return fields as GitHubAppConfig;
}

export function createAppJwt(
  config: Pick<GitHubAppConfig, "clientId" | "privateKey">,
  now = Date.now(),
) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const seconds = Math.floor(now / 1000);
  const data = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: seconds - 60, exp: seconds + 540, iss: config.clientId })}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), config.privateKey).toString("base64url")}`;
}
export function createSetupProof() {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  return {
    state,
    stateHash: createHash("sha256").update(state).digest("hex"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}
export function githubAuthorizationUrl(
  config: Pick<GitHubAppConfig, "clientId" | "callbackUrl">,
  state: string,
  challenge: string,
) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}
export function verifyGitHubSignature(
  raw: Buffer,
  header: string | undefined,
  secret: string,
) {
  if (!secret || !header || !/^sha256=[a-f0-9]{64}$/.test(header)) return false;
  const expected = createHmac("sha256", secret).update(raw).digest();
  return timingSafeEqual(expected, Buffer.from(header.slice(7), "hex"));
}

type Fetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;
async function readResponse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new GitHubDocsError("GITHUB_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
  }
}

/** Fixed-origin requests; provider errors never contain response bodies or credentials. */
export class DocsGitHubApp {
  constructor(
    private readonly config: GitHubAppConfig,
    private readonly fetcher: Fetch = fetch,
  ) {}
  private async request<T>(
    path: string,
    token: string,
    options: {
      method?: string;
      body?: unknown;
      apiVersion?: string;
      emptyRepositoryProof?: boolean;
    } = {},
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    let response: Response;
    try {
      response = await this.fetcher(`${API_ORIGIN}${path}`, {
        method: options.method ?? "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": options.apiVersion ?? GITHUB_API_VERSION,
          "Content-Type": "application/json",
        },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new GitHubDocsError("GITHUB_UNAVAILABLE");
    }
    if (!response.ok) {
      if (options.emptyRepositoryProof && response.status === 409) {
        const body = (await readResponse(response)) as { message?: unknown };
        if (body?.message === "Git Repository is empty.")
          throw new GitHubDocsError("GITHUB_REPOSITORY_EMPTY", 409);
        throw new GitHubDocsError("GITHUB_UNAVAILABLE", 409);
      }
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const retry = Number(response.headers.get("retry-after"));
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" || retry > 0));
      await response.body?.cancel().catch(() => {});
      throw new GitHubDocsError(
        limited
          ? "GITHUB_RATE_LIMITED"
          : response.status === 401 || response.status === 403
            ? "GITHUB_ACCESS_LOST"
            : response.status === 404
              ? "GITHUB_REFERENCE_UNAVAILABLE"
              : options.method && [409, 422].includes(response.status)
                ? "GITHUB_WRITE_REJECTED"
                : "GITHUB_UNAVAILABLE",
        response.status,
        limited
          ? new Date(
              Math.max(Date.now() + Math.max(retry, 60) * 1000, reset * 1000 || 0),
            )
          : undefined,
      );
    }
    return readResponse(response);
  }
  async exchangeCode(code: string, verifier: string) {
    let response: Response;
    try {
      response = await this.fetcher("https://github.com/login/oauth/access_token", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.callbackUrl,
          code,
          code_verifier: verifier,
        }),
      });
    } catch {
      throw new GitHubDocsError("GITHUB_UNAVAILABLE");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new GitHubDocsError("GITHUB_OAUTH_REJECTED");
    }
    const result = await readResponse(response);
    if (
      typeof result.access_token !== "string" ||
      result.token_type?.toLowerCase() !== "bearer" ||
      result.error
    )
      throw new GitHubDocsError("GITHUB_OAUTH_REJECTED");
    // Setup verification only. Installation tokens service all ongoing imports.
    return result.access_token as string;
  }
  async user(token: string) {
    const user = await this.request<{ id: number; login: string }>("/user", token);
    if (
      !Number.isSafeInteger(user.id) ||
      user.id <= 0 ||
      typeof user.login !== "string"
    )
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return { id: user.id, login: user.login };
  }
  async installations(token: string, page = 1) {
    return this.request<{
      installations: {
        id: number;
        app_id: number;
        account: { login: string; type: "User" | "Organization" };
        suspended_at: string | null;
        permissions: Record<string, string>;
      }[];
      total_count: number;
    }>(`/user/installations?per_page=100&page=${page}`, token);
  }
  async repositories(token: string, installationId: number, page = 1) {
    requireId(installationId);
    return this.request<{ total_count: number; repositories: GitHubRepository[] }>(
      `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
      token,
    );
  }
  async repository(token: string, owner: string, name: string) {
    return this.request<GitHubRepository>(repoPath(owner, name), token);
  }
  async repositoryById(token: string, id: number) {
    requireId(id);
    return this.request<GitHubRepository>(`/repositories/${id}`, token);
  }
  async installation(installationId: number) {
    requireId(installationId);
    return this.request<{
      id: number;
      app_id: number;
      suspended_at: string | null;
      permissions: Record<string, string>;
    }>(`/app/installations/${installationId}`, createAppJwt(this.config));
  }
  async installationToken(
    installationId: number,
    repositoryId: number,
    purpose: "read" | "review" | "proposal" | "direct" | "checks" = "read",
  ) {
    requireId(installationId);
    requireId(repositoryId);
    const result = await this.request<{ token: string; expires_at: string }>(
      `/app/installations/${installationId}/access_tokens`,
      createAppJwt(this.config),
      {
        method: "POST",
        body: {
          repository_ids: [repositoryId],
          permissions: {
            metadata: "read",
            contents: purpose === "proposal" || purpose === "direct" ? "write" : "read",
            ...(purpose === "proposal" ? { pull_requests: "write" } : {}),
            ...(purpose === "review" ? { pull_requests: "read" } : {}),
            ...(purpose === "checks" ? { checks: "write" } : {}),
          },
        },
      },
    );
    if (!result.token || !Number.isFinite(Date.parse(result.expires_at)))
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return result;
  }
  async branchHead(token: string, owner: string, name: string, branch: string) {
    if (!branch || branch.length > 255 || /[\x00-\x1f]/.test(branch))
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const result = await this.request<{ commit: { sha: string } }>(
      `${repoPath(owner, name)}/branches/${encodeURIComponent(branch)}`,
      token,
    );
    if (!/^[a-f0-9]{40}$/.test(result.commit?.sha))
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return result.commit.sha;
  }
  /** A missing branch, zero repository size, or generic 409 is not proof that
   * initializing a repository is safe. Require GitHub's explicit empty verdict. */
  async repositoryIsEmpty(token: string, owner: string, name: string) {
    try {
      const commits = await this.request<{ sha: string }[]>(
        `${repoPath(owner, name)}/commits?per_page=1`,
        token,
        { emptyRepositoryProof: true },
      );
      if (!Array.isArray(commits) || commits.length !== 1)
        throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
      requireResponseSha(commits[0].sha);
      return false;
    } catch (error) {
      if (error instanceof GitHubDocsError && error.code === "GITHUB_REPOSITORY_EMPTY")
        return true;
      throw error;
    }
  }
  async initializeDocsRepository(
    token: string,
    owner: string,
    name: string,
    input: { planId: string; directory: string; branch: string },
    beforeWrite: GitWriteGuard,
  ) {
    requireMigrationId(input.planId);
    const directory = normalizeDocsSourceDirectory(input.directory);
    if (
      directory !== input.directory ||
      /(^|\/)\.github\/workflows(\/|$)/.test(directory) ||
      !input.branch ||
      input.branch.length > 255 ||
      /[\x00-\x1f]/.test(input.branch)
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const repository = await this.repository(token, owner, name);
    // Initializing GitHub's default branch avoids silently creating a missing
    // publishing branch in a nonempty repository or changing repository settings.
    if (
      repository.default_branch !== input.branch ||
      !(await this.repositoryIsEmpty(token, owner, name))
    )
      throw new GitHubDocsError("GITHUB_REPOSITORY_INITIALIZATION_CONFLICT", 409);
    const file = `${directory}/.gitkeep`;
    const path = `${repoPath(owner, name)}/contents/${file.split("/").map(encodeURIComponent).join("/")}`;
    await beforeWrite();
    const result = await this.request<{
      content: { path: string } | null;
      commit: { sha: string };
    }>(path, token, {
      method: "PUT",
      body: {
        message: `Initialize FrontLit documentation directory\n\nFrontLit setup: ${input.planId}`,
        content: Buffer.from("FrontLit documentation directory.\n").toString("base64"),
        branch: input.branch,
      },
    });
    if (result.content?.path !== file)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    requireResponseSha(result.commit?.sha);
    return result.commit.sha;
  }
  async isAncestor(
    token: string,
    owner: string,
    name: string,
    ancestor: string,
    head: string,
  ) {
    requireSha(ancestor);
    requireSha(head);
    const result = await this.request<{
      status: string;
      base_commit: { sha: string };
      merge_base_commit: { sha: string };
    }>(`${repoPath(owner, name)}/compare/${ancestor}...${head}?per_page=1`, token);
    if (
      !["ahead", "behind", "identical", "diverged"].includes(result.status) ||
      result.base_commit?.sha !== ancestor
    )
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    requireResponseSha(result.merge_base_commit?.sha);
    return (
      ["ahead", "identical"].includes(result.status) &&
      result.merge_base_commit.sha === ancestor
    );
  }
  async tree(token: string, owner: string, name: string, sha: string) {
    requireSha(sha);
    const base = `${repoPath(owner, name)}/git/trees/`;
    const recursive = await this.request<{ tree: GitTreeEntry[]; truncated: boolean }>(
      `${base}${sha}?recursive=1`,
      token,
    );
    if (recursive.truncated === false && Array.isArray(recursive.tree))
      return recursive.tree;
    if (recursive.truncated !== true)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    // A truncated recursive response is never interpreted as a complete manifest.
    const entries: GitTreeEntry[] = [];
    const queue = [{ sha, prefix: "", depth: 0 }];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      if (i >= 10_000 || current.depth > 100)
        throw new GitHubDocsError("GITHUB_TREE_TOO_LARGE");
      requireSha(current.sha);
      const result = await this.request<{ tree: GitTreeEntry[]; truncated: boolean }>(
        `${base}${current.sha}`,
        token,
      );
      if (result.truncated !== false || !Array.isArray(result.tree))
        throw new GitHubDocsError("GITHUB_TREE_INCOMPLETE");
      for (const entry of result.tree) {
        if (
          !entry.path ||
          entry.path.includes("/") ||
          entry.path === "." ||
          entry.path === ".."
        )
          throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
        const path = `${current.prefix}${entry.path}`;
        entries.push({ ...entry, path });
        if (entries.length > 100_000)
          throw new GitHubDocsError("GITHUB_TREE_TOO_LARGE");
        if (entry.type === "tree")
          queue.push({ sha: entry.sha, prefix: `${path}/`, depth: current.depth + 1 });
      }
    }
    return entries;
  }
  async commitTree(token: string, owner: string, name: string, commitSha: string) {
    const commit = await this.commit(token, owner, name, commitSha);
    return this.tree(token, owner, name, commit.tree.sha);
  }
  async commit(token: string, owner: string, name: string, commitSha: string) {
    requireSha(commitSha);
    const commit = await this.request<{
      sha: string;
      message?: string;
      tree: { sha: string };
      parents?: { sha: string }[];
    }>(`${repoPath(owner, name)}/git/commits/${commitSha}`, token);
    if (commit.sha !== commitSha || !commit.tree)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    requireSha(commit.tree.sha);
    return commit;
  }
  /** Setup captures include strict Section metadata in addition to Markdown.
   * Every entry is an addition; preserving the base tree preserves unrelated files. */
  async createMigrationTree(
    token: string,
    owner: string,
    name: string,
    input: {
      baseTreeSha: string;
      directory: string;
      files: { path: string; content: string }[];
    },
    beforeWrite: GitWriteGuard,
  ) {
    requireSha(input.baseTreeSha);
    const directory = normalizeDocsSourceDirectory(input.directory);
    if (
      directory !== input.directory ||
      !input.files.length ||
      input.files.length > 2000
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const paths = new Set<string>();
    let bytes = 0;
    const tree = input.files.map((file) => {
      if (file.path !== `${directory}/_sections.json`)
        resolveDocsSourcePath(file.path, directory, "migration-path");
      if (
        paths.has(file.path) ||
        typeof file.content !== "string" ||
        /(^|\/)\.github\/workflows(\/|$)/.test(file.path)
      )
        throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
      paths.add(file.path);
      bytes += Buffer.byteLength(file.content);
      if (bytes > 10 * 1024 * 1024) throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
      return { path: file.path, mode: "100644", type: "blob", content: file.content };
    });
    const path = `${repoPath(owner, name)}/git/trees`;
    await beforeWrite();
    const result = await this.request<{ sha: string }>(path, token, {
      method: "POST",
      body: { base_tree: input.baseTreeSha, tree },
    });
    requireResponseSha(result.sha);
    return result.sha;
  }
  async createMigrationCommit(
    token: string,
    owner: string,
    name: string,
    input: { parentSha: string; treeSha: string; planId: string; createdAt: string },
    beforeWrite: GitWriteGuard,
  ) {
    requireMigrationId(input.planId);
    requireSha(input.parentSha);
    requireSha(input.treeSha);
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(input.createdAt) ||
      !Number.isFinite(Date.parse(input.createdAt))
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const identity = {
      name: "FrontLit",
      email: "docs@frontlit.invalid",
      date: input.createdAt,
    };
    const path = `${repoPath(owner, name)}/git/commits`;
    await beforeWrite();
    const result = await this.request<{ sha: string }>(path, token, {
      method: "POST",
      body: {
        message: `Set up FrontLit documentation\n\nFrontLit setup: ${input.planId}`,
        parents: [input.parentSha],
        tree: input.treeSha,
        author: identity,
        committer: identity,
      },
    });
    requireResponseSha(result.sha);
    return result.sha;
  }
  async createMigrationBranch(
    token: string,
    owner: string,
    name: string,
    planId: string,
    sha: string,
    beforeWrite: GitWriteGuard,
  ) {
    requireMigrationId(planId);
    requireSha(sha);
    const branch = `frontlit/docs-setup/${planId}`;
    const path = `${repoPath(owner, name)}/git/refs`;
    await beforeWrite();
    const result = await this.request<{ ref: string; object: { sha: string } }>(
      path,
      token,
      {
        method: "POST",
        body: { ref: `refs/heads/${branch}`, sha },
      },
    );
    if (result.ref !== `refs/heads/${branch}` || result.object?.sha !== sha)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return branch;
  }
  async createMigrationPullRequest(
    token: string,
    owner: string,
    name: string,
    input: { planId: string; base: string; fileCount: number; draftCount: number },
    beforeWrite: GitWriteGuard,
  ) {
    requireMigrationId(input.planId);
    if (
      !input.base ||
      input.base.length > 255 ||
      /[\x00-\x1f]/.test(input.base) ||
      !Number.isSafeInteger(input.fileCount) ||
      input.fileCount < 1 ||
      input.fileCount > 2000 ||
      !Number.isSafeInteger(input.draftCount) ||
      input.draftCount < 0 ||
      input.draftCount >= input.fileCount
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const path = `${repoPath(owner, name)}/pulls`;
    await beforeWrite();
    const result = await this.request<{ number: number; html_url: string }>(
      path,
      token,
      {
        method: "POST",
        body: {
          title: "Set up FrontLit documentation",
          head: `frontlit/docs-setup/${input.planId}`,
          base: input.base,
          body: `Adds ${input.fileCount} reviewed documentation file(s), including Section metadata.\n\n${input.draftCount} never-published draft(s) are included as unpublished text.\n\nFrontLit setup: ${input.planId}\n\nEditor ownership and the current public site remain unchanged until merge, verification and administrator activation in FrontLit.`,
        },
      },
    );
    if (
      !Number.isSafeInteger(result.number) ||
      result.number < 1 ||
      result.html_url !== `https://github.com/${owner}/${name}/pull/${result.number}`
    )
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return { number: result.number, url: result.html_url };
  }
  async findMigrationPullRequest(
    token: string,
    owner: string,
    name: string,
    input: { planId: string; base: string; repositoryId: number },
  ) {
    requireMigrationId(input.planId);
    return this.findCapturedPullRequest(token, owner, name, {
      branch: `frontlit/docs-setup/${input.planId}`,
      base: input.base,
      repositoryId: input.repositoryId,
    });
  }
  async createProposalTree(
    token: string,
    owner: string,
    name: string,
    input: {
      baseTreeSha: string;
      directory: string;
      edits: { path: string; mode: string; content: string | null }[];
    },
    beforeWrite: GitWriteGuard,
  ) {
    requireSha(input.baseTreeSha);
    if (!input.edits.length || input.edits.length > 2000)
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const paths = new Set<string>();
    let bytes = 0;
    const tree = input.edits.map((edit) => {
      resolveDocsSourcePath(edit.path, input.directory, "proposal-path");
      if (
        paths.has(edit.path) ||
        !["100644", "100755"].includes(edit.mode) ||
        /(^|\/)\.github\/workflows(\/|$)/.test(edit.path) ||
        (edit.content !== null && typeof edit.content !== "string")
      )
        throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
      paths.add(edit.path);
      bytes += Buffer.byteLength(edit.content ?? "");
      if (bytes > 10 * 1024 * 1024) throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
      return {
        path: edit.path,
        mode: edit.mode,
        type: "blob",
        ...(edit.content === null ? { sha: null } : { content: edit.content }),
      };
    });
    const path = `${repoPath(owner, name)}/git/trees`;
    await beforeWrite();
    const result = await this.request<{ sha: string }>(path, token, {
      method: "POST",
      body: { base_tree: input.baseTreeSha, tree },
    });
    requireResponseSha(result.sha);
    return result.sha;
  }
  async createProposalCommit(
    token: string,
    owner: string,
    name: string,
    input: {
      parentSha: string;
      treeSha: string;
      proposalId: string;
      title: string;
      createdAt?: string;
    },
    beforeWrite: GitWriteGuard,
  ) {
    requireSha(input.parentSha);
    requireSha(input.treeSha);
    requireProposalId(input.proposalId);
    if (
      !input.title.trim() ||
      input.title.length > 200 ||
      /[\x00-\x1f]/.test(input.title)
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const path = `${repoPath(owner, name)}/git/commits`;
    if (
      input.createdAt &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(input.createdAt) ||
        !Number.isFinite(Date.parse(input.createdAt)))
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    await beforeWrite();
    const result = await this.request<{ sha: string }>(path, token, {
      method: "POST",
      body: {
        message: `${input.title}\n\nFrontLit proposal: ${input.proposalId}`,
        parents: [input.parentSha],
        tree: input.treeSha,
        // Fixed author/committer timestamps keep retries of a response-lost
        // commit creation identical. This is an automation identity, not a user.
        ...(input.createdAt
          ? {
              author: {
                name: "FrontLit",
                email: "docs@frontlit.invalid",
                date: input.createdAt,
              },
              committer: {
                name: "FrontLit",
                email: "docs@frontlit.invalid",
                date: input.createdAt,
              },
            }
          : {}),
      },
    });
    requireResponseSha(result.sha);
    return result.sha;
  }
  async createProposalBranch(
    token: string,
    owner: string,
    name: string,
    proposalId: string,
    sha: string,
    beforeWrite: GitWriteGuard,
  ) {
    requireProposalId(proposalId);
    requireSha(sha);
    const branch = `frontlit/docs/${proposalId}`,
      path = `${repoPath(owner, name)}/git/refs`;
    await beforeWrite();
    const result = await this.request<{ ref: string; object: { sha: string } }>(
      path,
      token,
      { method: "POST", body: { ref: `refs/heads/${branch}`, sha } },
    );
    if (result.ref !== `refs/heads/${branch}` || result.object?.sha !== sha)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return branch;
  }
  /** Check the verified parent again; GitHub's force:false also rejects races after this read. */
  async advanceBranch(
    token: string,
    owner: string,
    name: string,
    input: { branch: string; expectedHead: string; commitSha: string },
    beforeWrite: GitWriteGuard,
  ) {
    requireSha(input.expectedHead);
    requireSha(input.commitSha);
    const path = `${repoPath(owner, name)}/git/refs/heads/${encodeURIComponent(input.branch)}`;
    const commit = await this.commit(token, owner, name, input.commitSha);
    if (commit.parents?.length !== 1 || commit.parents[0].sha !== input.expectedHead)
      throw new GitHubDocsError("UPSTREAM_CHANGED", 409);
    if (
      (await this.branchHead(token, owner, name, input.branch)) !== input.expectedHead
    )
      throw new GitHubDocsError("UPSTREAM_CHANGED", 409);
    await beforeWrite();
    const result = await this.request<{ object: { sha: string } }>(path, token, {
      method: "PATCH",
      body: { sha: input.commitSha, force: false },
    });
    if (result.object?.sha !== input.commitSha)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return input.commitSha;
  }
  async createProposalPullRequest(
    token: string,
    owner: string,
    name: string,
    input: {
      proposalId: string;
      base: string;
      title: string;
      detailsUrl: string;
      documentCount: number;
    },
    beforeWrite: GitWriteGuard,
  ) {
    requireProposalId(input.proposalId);
    if (
      !input.base ||
      input.base.length > 255 ||
      /[\x00-\x1f]/.test(input.base) ||
      !input.title.trim() ||
      input.title.length > 200 ||
      /[\x00-\x1f]/.test(input.title) ||
      !Number.isSafeInteger(input.documentCount) ||
      input.documentCount < 1 ||
      input.documentCount > 1000
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const details = new URL(input.detailsUrl);
    const web = new URL(this.config.webOrigin);
    if (
      details.origin !== web.origin ||
      details.username ||
      details.password ||
      details.search ||
      details.hash ||
      details.pathname !== `/content/documentation/github/proposals/${input.proposalId}`
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const path = `${repoPath(owner, name)}/pulls`;
    await beforeWrite();
    const result = await this.request<{ number: number; html_url: string }>(
      path,
      token,
      {
        method: "POST",
        body: {
          title: input.title,
          head: `frontlit/docs/${input.proposalId}`,
          base: input.base,
          body: `Updates ${input.documentCount} captured documentation version(s).\n\nReview in FrontLit: ${details.toString()}`,
        },
      },
    );
    if (
      !Number.isSafeInteger(result.number) ||
      result.number < 1 ||
      result.html_url !== `https://github.com/${owner}/${name}/pull/${result.number}`
    )
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return { number: result.number, url: result.html_url };
  }
  /** Recover an acknowledged or response-lost creation before attempting another PR.
   * Include closed PRs: retrying a closed proposal must not open another one. */
  async findProposalPullRequest(
    token: string,
    owner: string,
    name: string,
    input: { proposalId: string; base: string; repositoryId: number },
  ) {
    requireProposalId(input.proposalId);
    return this.findCapturedPullRequest(token, owner, name, {
      branch: `frontlit/docs/${input.proposalId}`,
      base: input.base,
      repositoryId: input.repositoryId,
    });
  }
  private async findCapturedPullRequest(
    token: string,
    owner: string,
    name: string,
    input: { branch: string; base: string; repositoryId: number },
  ) {
    requireId(input.repositoryId);
    if (!input.base || input.base.length > 255 || /[\x00-\x1f]/.test(input.base))
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const branch = input.branch;
    const query = new URLSearchParams({
      state: "all",
      head: `${owner}:${branch}`,
      base: input.base,
      per_page: "100",
    });
    const rows = await this.request<
      {
        number: number;
        html_url: string;
        state: string;
        merged_at: string | null;
        merge_commit_sha?: string | null;
        head: { ref: string; sha: string; repo: { id: number } | null };
        base: { ref: string; sha: string; repo: { id: number } | null };
      }[]
    >(`${repoPath(owner, name)}/pulls?${query}`, token, {
      apiVersion: GITHUB_PR_API_VERSION,
    });
    if (!Array.isArray(rows) || rows.length > 1)
      throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
    if (!rows.length) return null;
    let row = rows[0];
    // The list endpoint can omit merge_commit_sha. Read the PR detail to
    // obtain immutable merge proof rather than treating a merged PR as broken.
    if (row.merged_at && row.merge_commit_sha === undefined) {
      if (!Number.isSafeInteger(row.number) || row.number < 1)
        throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
      const number = row.number;
      row = await this.request<(typeof rows)[number]>(
        `${repoPath(owner, name)}/pulls/${number}`,
        token,
        { apiVersion: GITHUB_PR_API_VERSION },
      );
      if (row.number !== number) throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    }
    if (
      !Number.isSafeInteger(row.number) ||
      row.number < 1 ||
      row.html_url !== `https://github.com/${owner}/${name}/pull/${row.number}` ||
      !["open", "closed"].includes(row.state) ||
      row.head?.ref !== branch ||
      row.base?.ref !== input.base ||
      row.head?.repo?.id !== input.repositoryId ||
      row.base?.repo?.id !== input.repositoryId ||
      (row.merged_at !== null &&
        (typeof row.merged_at !== "string" ||
          !Number.isFinite(Date.parse(row.merged_at))))
    )
      throw new GitHubDocsError("GITHUB_PROPOSAL_RECOVERY_CONFLICT", 409);
    requireResponseSha(row.head.sha);
    requireResponseSha(row.base.sha);
    if (row.merged_at !== null) requireResponseSha(row.merge_commit_sha!);
    return {
      number: row.number,
      url: row.html_url,
      state: row.state as "open" | "closed",
      merged: row.merged_at !== null,
      mergeCommitSha: row.merged_at !== null ? row.merge_commit_sha! : null,
      headSha: row.head.sha,
      baseSha: row.base.sha,
    };
  }
  /** Complete bounded open-PR listing; never retain titles, bodies or users. */
  async openPullRequestCandidates(
    token: string,
    owner: string,
    name: string,
    input: { repositoryId: number; base: string },
  ) {
    requireId(input.repositoryId);
    if (!input.base || input.base.length > 255 || /[\x00-\x1f]/.test(input.base))
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const query = new URLSearchParams({
      state: "open",
      base: input.base,
      per_page: "100",
      sort: "created",
      direction: "asc",
    });
    const seen = new Set<number>();
    const candidates: {
      number: number;
      headSha: string;
      baseSha: string;
      mergeSha: string | null;
      supported: boolean;
    }[] = [];
    for (let page = 1; page <= 11; page++) {
      query.set("page", String(page));
      const rows = await this.request<
        {
          number: number;
          state: string;
          merge_commit_sha: string | null;
          head: { sha: string; repo: { id: number } | null };
          base: { ref: string; sha: string; repo: { id: number } | null };
        }[]
      >(`${repoPath(owner, name)}/pulls?${query}`, token, {
        apiVersion: GITHUB_PR_API_VERSION,
      });
      if (!Array.isArray(rows) || rows.length > 100)
        throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
      if (page === 11 && rows.length)
        throw new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409);
      for (const row of rows) {
        if (
          !row ||
          !Number.isSafeInteger(row.number) ||
          row.number < 1 ||
          row.state !== "open" ||
          row.base?.ref !== input.base ||
          row.base?.repo?.id !== input.repositoryId
        )
          throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
        if (seen.has(row.number)) throw new GitHubDocsError("GITHUB_PR_CHANGED", 409);
        requireResponseSha(row.head?.sha);
        requireResponseSha(row.base.sha);
        if (row.merge_commit_sha !== null) requireResponseSha(row.merge_commit_sha);
        seen.add(row.number);
        candidates.push({
          number: row.number,
          headSha: row.head.sha,
          baseSha: row.base.sha,
          mergeSha: row.merge_commit_sha,
          supported: row.head.repo?.id === input.repositoryId,
        });
      }
      if (rows.length < 100) return candidates;
    }
    throw new GitHubDocsError("GITHUB_RECONCILIATION_LIMIT", 409);
  }
  /** Minimal candidate metadata; never retain PR titles, descriptions or users. */
  async pullRequestCandidate(
    token: string,
    owner: string,
    name: string,
    input: { number: number; repositoryId: number; base: string },
  ) {
    requireId(input.number);
    requireId(input.repositoryId);
    if (!input.base || input.base.length > 255 || /[\x00-\x1f]/.test(input.base))
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    const row = await this.request<{
      number: number;
      state: string;
      merged: boolean;
      mergeable: boolean | null;
      merge_commit_sha: string | null;
      head: { sha: string; repo: { id: number } | null };
      base: { ref: string; sha: string; repo: { id: number } | null };
    }>(`${repoPath(owner, name)}/pulls/${input.number}`, token, {
      apiVersion: GITHUB_PR_API_VERSION,
    });
    if (
      row.number !== input.number ||
      !["open", "closed"].includes(row.state) ||
      typeof row.merged !== "boolean" ||
      ![true, false, null].includes(row.mergeable) ||
      row.base?.ref !== input.base ||
      row.base?.repo?.id !== input.repositoryId
    )
      throw new GitHubDocsError("GITHUB_PR_TARGET_CHANGED", 409);
    requireResponseSha(row.head?.sha);
    requireResponseSha(row.base.sha);
    if (row.merge_commit_sha !== null) requireResponseSha(row.merge_commit_sha);
    return {
      number: row.number,
      state: row.state as "open" | "closed",
      merged: row.merged,
      headSha: row.head.sha,
      baseSha: row.base.sha,
      mergeable: row.mergeable,
      mergeSha: row.merge_commit_sha,
      // Forks cannot inherit the base repository's read or check-write consent.
      supported: row.head.repo?.id === input.repositoryId,
    };
  }

  async findCheckRun(
    token: string,
    owner: string,
    name: string,
    input: {
      headSha: string;
      name: GitDocsCheckName;
      externalId: string;
    },
  ) {
    requireCheckInput(input);
    const query = new URLSearchParams({
      check_name: input.name,
      filter: "all",
      per_page: "100",
      app_id: this.config.appId,
    });
    let match: GitDocsCheckRun | null = null;
    for (let page = 1; page <= 10; page++) {
      query.set("page", String(page));
      const result = await this.request<{ total_count: number; check_runs: unknown[] }>(
        `${repoPath(owner, name)}/commits/${input.headSha}/check-runs?${query}`,
        token,
      );
      if (
        !Number.isSafeInteger(result.total_count) ||
        result.total_count < 0 ||
        !Array.isArray(result.check_runs) ||
        result.check_runs.length > 100
      )
        throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
      for (const raw of result.check_runs) {
        const row = raw as GitDocsCheckRun & {
          external_id: string;
          head_sha: string;
          app: { id: number };
        };
        if (!row || typeof row !== "object")
          throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
        if (row.external_id !== input.externalId) continue;
        if (match) throw new GitHubDocsError("GITHUB_CHECK_RECOVERY_CONFLICT", 409);
        match = checkRunProjection(row, input, Number(this.config.appId));
      }
      if (result.check_runs.length < 100 || page * 100 >= result.total_count)
        return match;
    }
    throw new GitHubDocsError("GITHUB_CHECK_RECOVERY_LIMIT", 409);
  }
  async createCheckRun(
    token: string,
    owner: string,
    name: string,
    input: GitDocsCheckInput,
    beforeWrite: GitWriteGuard,
  ) {
    requireCheckInput(input);
    validateGitDocsCheckOutput(input.output);
    const details = new URL(input.detailsUrl);
    if (
      Boolean(details.username || details.password || details.hash) ||
      details.origin !== new URL(this.config.webOrigin).origin ||
      !details.pathname.startsWith("/content/documentation/github/")
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    await beforeWrite();
    const row = await this.request<unknown>(
      `${repoPath(owner, name)}/check-runs`,
      token,
      {
        method: "POST",
        body: {
          name: input.name,
          head_sha: input.headSha,
          external_id: input.externalId,
          details_url: details.toString(),
          status: "in_progress",
          output: input.output,
        },
      },
    );
    return checkRunProjection(row, input, Number(this.config.appId));
  }
  async updateCheckRun(
    token: string,
    owner: string,
    name: string,
    input: {
      checkRunId: number;
      headSha: string;
      name: GitDocsCheckName;
      externalId: string;
      output: GitDocsCheckOutput;
      conclusion?: "success" | "failure" | "neutral";
    },
    beforeWrite: GitWriteGuard,
  ) {
    requireId(input.checkRunId);
    requireCheckInput(input);
    validateGitDocsCheckOutput(input.output);
    if (
      input.conclusion &&
      !["success", "failure", "neutral"].includes(input.conclusion)
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
    await beforeWrite();
    const row = await this.request<unknown>(
      `${repoPath(owner, name)}/check-runs/${input.checkRunId}`,
      token,
      {
        method: "PATCH",
        body: {
          output: input.output,
          ...(input.conclusion
            ? { status: "completed", conclusion: input.conclusion }
            : {}),
        },
      },
    );
    const result = checkRunProjection(row, input, Number(this.config.appId));
    if (result.id !== input.checkRunId)
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return result;
  }
  async blob(token: string, owner: string, name: string, sha: string) {
    requireSha(sha);
    const blob = await this.request<{
      content: string;
      encoding: string;
      size: number;
    }>(`${repoPath(owner, name)}/git/blobs/${sha}`, token);
    if (blob.encoding !== "base64" || typeof blob.content !== "string")
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    const compact = blob.content.replace(/\s/g, "");
    if (
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)
    )
      throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    const data = Buffer.from(compact, "base64");
    if (data.length !== blob.size) throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
    return data;
  }
}
export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  owner: { id: number; login: string };
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
};
function requireId(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
}
function requireSha(sha: string) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
}
function requireResponseSha(sha: string) {
  if (typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha))
    throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
}
function requireProposalId(id: string) {
  if (!/^gproposal_[a-z0-9]+$/.test(id))
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
}
function requireMigrationId(id: string) {
  if (!/^gmig_[a-z0-9]+$/.test(id)) throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
}
function repoPath(owner: string, name: string) {
  if (
    !/^[A-Za-z0-9-]+$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(name) ||
    [".", ".."].includes(name)
  )
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

export type GitDocsCheckName =
  | "FrontLit / docs validation"
  | "FrontLit / docs publication";
export type GitDocsCheckOutput = {
  title: string;
  summary: string;
  annotations?: {
    path: string;
    start_line: number;
    end_line: number;
    annotation_level: "notice" | "warning" | "failure";
    message: string;
    title?: string;
  }[];
};
export type GitDocsCheckInput = {
  headSha: string;
  name: GitDocsCheckName;
  externalId: string;
  detailsUrl: string;
  output: GitDocsCheckOutput;
};
export type GitDocsCheckRun = {
  id: number;
  status: "queued" | "in_progress" | "completed";
  conclusion: string | null;
  annotationsCount: number;
};
function requireCheckInput(input: {
  headSha: string;
  name: GitDocsCheckName;
  externalId: string;
}) {
  requireSha(input.headSha);
  if (
    !["FrontLit / docs validation", "FrontLit / docs publication"].includes(
      input.name,
    ) ||
    !/^[A-Za-z0-9:_-]{1,200}$/.test(input.externalId)
  )
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
}
export function validateGitDocsCheckOutput(output: GitDocsCheckOutput) {
  if (
    !output.title ||
    output.title.length > 255 ||
    !output.summary ||
    Buffer.byteLength(output.summary) > 60_000 ||
    (output.annotations &&
      (!Array.isArray(output.annotations) || output.annotations.length > 50))
  )
    throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
  for (const annotation of output.annotations ?? []) {
    if (
      !annotation.path ||
      annotation.path.startsWith("/") ||
      /[\\\x00-\x1f]/.test(annotation.path) ||
      annotation.path
        .split("/")
        .some((segment) => !segment || segment === "." || segment === "..") ||
      !Number.isSafeInteger(annotation.start_line) ||
      annotation.start_line < 1 ||
      !Number.isSafeInteger(annotation.end_line) ||
      annotation.end_line < annotation.start_line ||
      !["notice", "warning", "failure"].includes(annotation.annotation_level) ||
      !annotation.message ||
      Buffer.byteLength(annotation.message) > 60_000 ||
      (annotation.title && annotation.title.length > 255)
    )
      throw new GitHubDocsError("GITHUB_INVALID_REQUEST");
  }
}
function checkRunProjection(
  raw: unknown,
  input: { headSha: string; name: GitDocsCheckName; externalId: string },
  appId: number,
): GitDocsCheckRun {
  const row = raw as {
    id: number;
    name: string;
    head_sha: string;
    external_id: string;
    app: { id: number };
    status: string;
    conclusion: string | null;
    output: { annotations_count: number };
  };
  if (
    !row ||
    !Number.isSafeInteger(row.id) ||
    row.id < 1 ||
    row.name !== input.name ||
    row.head_sha !== input.headSha ||
    row.external_id !== input.externalId ||
    row.app?.id !== appId ||
    !["queued", "in_progress", "completed"].includes(row.status) ||
    (row.conclusion !== null && typeof row.conclusion !== "string") ||
    !Number.isSafeInteger(row.output?.annotations_count) ||
    row.output.annotations_count < 0
  )
    throw new GitHubDocsError("GITHUB_INVALID_RESPONSE");
  return {
    id: row.id,
    status: row.status as GitDocsCheckRun["status"],
    conclusion: row.conclusion,
    annotationsCount: row.output.annotations_count,
  };
}
