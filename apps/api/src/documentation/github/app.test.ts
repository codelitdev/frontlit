import { createHash, createHmac, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createAppJwt,
  createSetupProof,
  DocsGitHubApp,
  githubAuthorizationUrl,
  verifyGitHubSignature,
  type GitHubAppConfig,
} from "./app";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const config: GitHubAppConfig = {
  appId: "42",
  appSlug: "test",
  clientId: "client",
  clientSecret: "secret",
  privateKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  callbackUrl: "http://localhost:4000/integrations/github/docs/callback",
  webhookSecret: "webhook-secret",
  webOrigin: "http://localhost:3000",
};
const response = (value: unknown, status = 200, headers?: Record<string, string>) =>
  new Response(JSON.stringify(value), { status, headers });
describe("documentation GitHub App adapter", () => {
  it("requires explicit empty-repository proof and creates only the placeholder on the default branch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ default_branch: "main" }))
      .mockResolvedValueOnce(response({ message: "Git Repository is empty." }, 409))
      .mockResolvedValueOnce(
        response(
          { content: { path: "docs/.gitkeep" }, commit: { sha: "a".repeat(40) } },
          201,
        ),
      );
    const guard = vi.fn(async () => undefined);
    expect(
      await new DocsGitHubApp(config, fetcher).initializeDocsRepository(
        "token",
        "org",
        "docs",
        {
          planId: "gmig_test",
          directory: "docs",
          branch: "main",
        },
        guard,
      ),
    ).toBe("a".repeat(40));
    expect(fetcher.mock.calls[2][0]).toBe(
      "https://api.github.com/repos/org/docs/contents/docs/.gitkeep",
    );
    const body = JSON.parse(fetcher.mock.calls[2][1]!.body as string);
    expect(body.branch).toBe("main");
    expect(body.sha).toBeUndefined();
    expect(Buffer.from(body.content, "base64").toString()).toBe(
      "FrontLit documentation directory.\n",
    );
    expect(guard.mock.invocationCallOrder[0]).toBeLessThan(
      fetcher.mock.invocationCallOrder[2],
    );
  });
  it("never interprets missing access, a generic conflict or a nonempty repository as empty", async () => {
    for (const result of [
      response({ message: "Not Found" }, 404),
      response({ message: "Conflict" }, 409),
      response([]),
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(result);
      await expect(
        new DocsGitHubApp(config, fetcher).repositoryIsEmpty("token", "org", "docs"),
      ).rejects.toThrow();
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ default_branch: "main" }))
      .mockResolvedValueOnce(response([{ sha: "a".repeat(40) }]));
    await expect(
      new DocsGitHubApp(config, fetcher).initializeDocsRepository(
        "token",
        "org",
        "docs",
        {
          planId: "gmig_test",
          directory: "docs",
          branch: "main",
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_INITIALIZATION_CONFLICT" });
    expect(fetcher.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });
  it("stops initialization for a different selected branch or revoked write authority", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ default_branch: "main" }));
    await expect(
      new DocsGitHubApp(config, fetcher).initializeDocsRepository(
        "token",
        "org",
        "docs",
        {
          planId: "gmig_test",
          directory: "docs",
          branch: "missing",
        },
        async () => undefined,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_REPOSITORY_INITIALIZATION_CONFLICT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const other = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ default_branch: "main" }))
      .mockResolvedValueOnce(response({ message: "Git Repository is empty." }, 409));
    await expect(
      new DocsGitHubApp(config, other).initializeDocsRepository(
        "token",
        "org",
        "docs",
        {
          planId: "gmig_test",
          directory: "docs",
          branch: "main",
        },
        async () => {
          throw new Error("revoked");
        },
      ),
    ).rejects.toThrow("revoked");
    expect(other.mock.calls.every((call) => call[1]?.method === "GET")).toBe(true);
  });
  it("reads merged PR detail when the list omits its merge commit SHA", async () => {
    const row = {
      number: 2,
      html_url: "https://github.com/org/docs/pull/2",
      state: "closed",
      merged_at: "2026-10-02T09:18:51Z",
      head: {
        ref: "frontlit/docs-setup/gmig_test",
        sha: "a".repeat(40),
        repo: { id: 9 },
      },
      base: { ref: "main", sha: "b".repeat(40), repo: { id: 9 } },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([row]))
      .mockResolvedValueOnce(response({ ...row, merge_commit_sha: "c".repeat(40) }));
    const app = new DocsGitHubApp(config, fetcher);
    expect(
      await app.findMigrationPullRequest("token", "org", "docs", {
        planId: "gmig_test",
        base: "main",
        repositoryId: 9,
      }),
    ).toMatchObject({ merged: true, mergeCommitSha: "c".repeat(40) });
    expect(fetcher.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/org/docs/pulls/2",
    );
    for (const call of fetcher.mock.calls)
      expect((call[1]!.headers as Record<string, string>)["X-GitHub-Api-Version"]).toBe(
        "2022-11-28",
      );
  });
  it("writes a setup capture on its own branch with metadata, fixed commit identity and draft disclosure", async () => {
    const sha = "a".repeat(40);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ sha }))
      .mockResolvedValueOnce(response({ sha }))
      .mockResolvedValueOnce(
        response({ ref: "refs/heads/frontlit/docs-setup/gmig_test", object: { sha } }),
      )
      .mockResolvedValueOnce(
        response({ number: 2, html_url: "https://github.com/org/docs/pull/2" }),
      );
    const guard = vi.fn(async () => undefined);
    const app = new DocsGitHubApp(config, fetcher);
    await app.createMigrationTree(
      "token",
      "org",
      "docs",
      {
        baseTreeSha: sha,
        directory: "docs",
        files: [
          { path: "docs/_sections.json", content: '{"version":1,"sections":[]}' },
          {
            path: "docs/doc_test.md",
            content: "---\npublished: false\n---\nPrivate draft",
          },
        ],
      },
      guard,
    );
    await app.createMigrationCommit(
      "token",
      "org",
      "docs",
      {
        parentSha: sha,
        treeSha: sha,
        planId: "gmig_test",
        createdAt: "2026-10-02T00:00:00Z",
      },
      guard,
    );
    await app.createMigrationBranch("token", "org", "docs", "gmig_test", sha, guard);
    expect(
      await app.createMigrationPullRequest(
        "token",
        "org",
        "docs",
        {
          planId: "gmig_test",
          base: "main",
          fileCount: 2,
          draftCount: 1,
        },
        guard,
      ),
    ).toEqual({ number: 2, url: "https://github.com/org/docs/pull/2" });
    const bodies = fetcher.mock.calls.map((call) =>
      JSON.parse(call[1]!.body as string),
    );
    expect(bodies[0]).toMatchObject({ base_tree: sha });
    expect(bodies[1]).toMatchObject({
      parents: [sha],
      author: { date: "2026-10-02T00:00:00Z" },
    });
    expect(bodies[2]).toEqual({ ref: "refs/heads/frontlit/docs-setup/gmig_test", sha });
    expect(bodies[3]).toMatchObject({
      head: "frontlit/docs-setup/gmig_test",
      base: "main",
    });
    expect(bodies[3].body).toContain("1 never-published draft(s)");
    expect(guard).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++)
      expect(guard.mock.invocationCallOrder[i]).toBeLessThan(
        fetcher.mock.invocationCallOrder[i],
      );
  });
  it("rejects escaped, duplicate and unsupported setup paths before remote work", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const app = new DocsGitHubApp(config, fetcher);
    for (const paths of [
      ["docs/../secret.md"],
      ["docs-private/doc.md"],
      ["docs/_sections.json", "docs/_sections.json"],
      ["docs/file.json"],
      ["docs/.github/workflows/job.md"],
    ]) {
      await expect(
        app.createMigrationTree(
          "token",
          "org",
          "docs",
          {
            baseTreeSha: "a".repeat(40),
            directory: "docs",
            files: paths.map((path) => ({ path, content: "private" })),
          },
          async () => undefined,
        ),
      ).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("checks fresh authority before setup mutations and recovers closed setup PRs", async () => {
    const row = {
      number: 3,
      html_url: "https://github.com/org/docs/pull/3",
      state: "closed",
      merged_at: null,
      head: {
        ref: "frontlit/docs-setup/gmig_test",
        sha: "a".repeat(40),
        repo: { id: 9 },
      },
      base: { ref: "main", sha: "b".repeat(40), repo: { id: 9 } },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response([row]));
    const app = new DocsGitHubApp(config, fetcher);
    await expect(
      app.createMigrationBranch(
        "token",
        "org",
        "docs",
        "gmig_test",
        "a".repeat(40),
        async () => {
          throw new Error("revoked");
        },
      ),
    ).rejects.toThrow("revoked");
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      await app.findMigrationPullRequest("token", "org", "docs", {
        planId: "gmig_test",
        base: "main",
        repositoryId: 9,
      }),
    ).toMatchObject({ number: 3, state: "closed", merged: false });
    const query = new URL(fetcher.mock.calls[0][0] as string).searchParams;
    expect(query.get("head")).toBe("org:frontlit/docs-setup/gmig_test");
    expect(query.get("state")).toBe("all");
  });
  it("lists complete open PR candidates with scoped pagination and no private prose", async () => {
    const row = (number: number, repositoryId = 9) => ({
      number,
      state: "open",
      merge_commit_sha: "c".repeat(40),
      title: "private-title",
      body: "private-body",
      head: { sha: "a".repeat(40), repo: { id: repositoryId } },
      base: { ref: "trunk", sha: "b".repeat(40), repo: { id: 9 } },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(Array.from({ length: 100 }, (_, index) => row(index + 1))),
      )
      .mockResolvedValueOnce(response([row(101, 99)]));
    const app = new DocsGitHubApp(config, fetcher);
    const result = await app.openPullRequestCandidates("token", "org", "docs", {
      repositoryId: 9,
      base: "trunk",
    });
    expect(result).toHaveLength(101);
    expect(result.at(-1)).toMatchObject({ number: 101, supported: false });
    expect(JSON.stringify(result)).not.toMatch(/private-title|private-body/);
    const query = new URL(fetcher.mock.calls[1][0] as string).searchParams;
    expect(query.get("page")).toBe("2");
    expect(query.get("base")).toBe("trunk");
    expect(query.get("state")).toBe("open");
  });
  it("rejects over-limit, duplicate or foreign-target PR listings instead of returning partial proof", async () => {
    const row = (number: number) => ({
      number,
      state: "open",
      merge_commit_sha: null,
      head: { sha: "a".repeat(40), repo: { id: 9 } },
      base: { ref: "trunk", sha: "b".repeat(40), repo: { id: 9 } },
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const page = Number(new URL(url as string).searchParams.get("page"));
      return response(
        Array.from({ length: 100 }, (_, index) => row((page - 1) * 100 + index + 1)),
      );
    });
    await expect(
      new DocsGitHubApp(config, fetcher).openPullRequestCandidates(
        "token",
        "org",
        "docs",
        { repositoryId: 9, base: "trunk" },
      ),
    ).rejects.toMatchObject({ code: "GITHUB_RECONCILIATION_LIMIT" });
    const duplicate = new DocsGitHubApp(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(response([row(1), row(1)])),
    );
    await expect(
      duplicate.openPullRequestCandidates("token", "org", "docs", {
        repositoryId: 9,
        base: "trunk",
      }),
    ).rejects.toMatchObject({ code: "GITHUB_PR_CHANGED" });
    const foreign = new DocsGitHubApp(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response([{ ...row(1), base: { ...row(1).base, ref: "other" } }]),
        ),
    );
    await expect(
      foreign.openPullRequestCandidates("token", "org", "docs", {
        repositoryId: 9,
        base: "trunk",
      }),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_RESPONSE" });
  });
  it("projects only immutable PR merge metadata and explicitly marks fork candidates unsupported", async () => {
    const row = {
      number: 12,
      state: "open",
      merged: false,
      mergeable: true,
      merge_commit_sha: "c".repeat(40),
      title: "private title",
      body: "private body",
      head: { sha: "b".repeat(40), repo: { id: 9 } },
      base: { ref: "trunk", sha: "a".repeat(40), repo: { id: 9 } },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(row))
      .mockResolvedValueOnce(
        response({ ...row, head: { ...row.head, repo: { id: 99 } } }),
      )
      .mockResolvedValueOnce(response({ ...row, base: { ...row.base, ref: "other" } }));
    const app = new DocsGitHubApp(config, fetcher),
      input = { number: 12, repositoryId: 9, base: "trunk" };
    const projected = await app.pullRequestCandidate("token", "org", "docs", input);
    expect(projected).toMatchObject({
      headSha: row.head.sha,
      baseSha: row.base.sha,
      mergeSha: row.merge_commit_sha,
      supported: true,
    });
    expect(JSON.stringify(projected)).not.toMatch(/private/);
    expect(await app.pullRequestCandidate("token", "org", "docs", input)).toMatchObject(
      { supported: false },
    );
    await expect(
      app.pullRequestCandidate("token", "org", "docs", input),
    ).rejects.toMatchObject({ code: "GITHUB_PR_TARGET_CHANGED" });
  });
  it("guards check delivery, enforces 50-annotation batches and validates provider identity", async () => {
    const input = {
      headSha: "a".repeat(40),
      name: "FrontLit / docs validation" as const,
      externalId: "frontlit:validation:report_1",
      detailsUrl:
        "http://localhost:3000/content/documentation/github/proposals/gproposal_test",
      output: { title: "Docs validation", summary: "1 file validated." },
    };
    const row = {
      id: 11,
      name: input.name,
      head_sha: input.headSha,
      external_id: input.externalId,
      app: { id: 42 },
      status: "in_progress",
      conclusion: null,
      output: { annotations_count: 0 },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(row))
      .mockResolvedValueOnce(
        response({
          ...row,
          status: "completed",
          conclusion: "success",
          output: { annotations_count: 50 },
        }),
      )
      .mockResolvedValueOnce(response({ ...row, head_sha: "b".repeat(40) }));
    const app = new DocsGitHubApp(config, fetcher),
      guard = vi.fn(async () => {});
    expect(
      await app.createCheckRun("token", "org", "docs", input, guard),
    ).toMatchObject({ id: 11, annotationsCount: 0 });
    const annotation = {
      path: "docs/guide.md",
      start_line: 1,
      end_line: 1,
      annotation_level: "warning" as const,
      message: "Check route.",
    };
    expect(
      await app.updateCheckRun(
        "token",
        "org",
        "docs",
        {
          ...input,
          checkRunId: 11,
          conclusion: "success",
          output: { ...input.output, annotations: Array(50).fill(annotation) },
        },
        guard,
      ),
    ).toMatchObject({ conclusion: "success", annotationsCount: 50 });
    await expect(
      app.updateCheckRun(
        "token",
        "org",
        "docs",
        {
          ...input,
          checkRunId: 11,
          output: { ...input.output, annotations: Array(51).fill(annotation) },
        },
        guard,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_REQUEST" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      app.createCheckRun("token", "org", "docs", input, guard),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_RESPONSE" });
    expect(guard).toHaveBeenCalledTimes(3);
  });
  it("recovers a response-lost check by exact App/head/name/external ID across pages", async () => {
    const input = {
      headSha: "a".repeat(40),
      name: "FrontLit / docs publication" as const,
      externalId: "frontlit:publication:pub_test",
    };
    const row = {
      id: 11,
      name: input.name,
      head_sha: input.headSha,
      external_id: input.externalId,
      app: { id: 42 },
      status: "completed",
      conclusion: "success",
      output: { annotations_count: 70 },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          total_count: 101,
          check_runs: Array(100).fill({ ...row, external_id: "another_report" }),
        }),
      )
      .mockResolvedValueOnce(response({ total_count: 101, check_runs: [row] }))
      .mockResolvedValueOnce(response({ total_count: 2, check_runs: [row, row] }))
      .mockResolvedValueOnce(
        response({ total_count: 1, check_runs: [{ ...row, app: { id: 99 } }] }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    expect(await app.findCheckRun("token", "org", "docs", input)).toMatchObject({
      id: 11,
      annotationsCount: 70,
    });
    expect(new URL(fetcher.mock.calls[1][0] as string).searchParams.get("page")).toBe(
      "2",
    );
    expect(new URL(fetcher.mock.calls[0][0] as string).searchParams.get("app_id")).toBe(
      "42",
    );
    await expect(app.findCheckRun("token", "org", "docs", input)).rejects.toMatchObject(
      { code: "GITHUB_CHECK_RECOVERY_CONFLICT" },
    );
    await expect(app.findCheckRun("token", "org", "docs", input)).rejects.toMatchObject(
      { code: "GITHUB_INVALID_RESPONSE" },
    );
  });
  it("never delivers a check after a rejected fresh guard or to an untrusted details origin", async () => {
    const input = {
      headSha: "a".repeat(40),
      name: "FrontLit / docs validation" as const,
      externalId: "report_1",
      detailsUrl:
        "http://localhost:3000/content/documentation/github/proposals/gproposal_test",
      output: { title: "Validation", summary: "Complete tree." },
    };
    const fetcher = vi.fn<typeof fetch>(),
      app = new DocsGitHubApp(config, fetcher),
      guard = vi.fn(async () => {
        throw new Error("revoked");
      });
    await expect(
      app.createCheckRun("token", "org", "docs", input, guard),
    ).rejects.toThrow("revoked");
    await expect(
      app.createCheckRun(
        "token",
        "org",
        "docs",
        {
          ...input,
          detailsUrl: "https://untrusted.invalid/content/documentation/github/test",
        },
        guard,
      ),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses identical explicit automation commit metadata across response-lost creation retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => response({ sha: "a".repeat(40) }));
    const app = new DocsGitHubApp(config, fetcher),
      guard = vi.fn(async () => {});
    const input = {
      parentSha: "b".repeat(40),
      treeSha: "c".repeat(40),
      proposalId: "gproposal_retry",
      title: "Captured guide",
      createdAt: "2026-10-01T00:00:00Z",
    };
    await app.createProposalCommit("token", "org", "docs", input, guard);
    await app.createProposalCommit("token", "org", "docs", input, guard);
    expect(fetcher.mock.calls[0][1]!.body).toBe(fetcher.mock.calls[1][1]!.body);
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
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
    });
  });
  it("accepts direct-write ancestry only from a matching immutable comparison base", async () => {
    const ancestor = "a".repeat(40),
      head = "b".repeat(40);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({
          status: "ahead",
          base_commit: { sha: ancestor },
          merge_base_commit: { sha: ancestor },
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: "diverged",
          base_commit: { sha: ancestor },
          merge_base_commit: { sha: head },
        }),
      )
      .mockResolvedValueOnce(
        response({
          status: "ahead",
          base_commit: { sha: head },
          merge_base_commit: { sha: ancestor },
        }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    expect(await app.isAncestor("token", "org", "docs", ancestor, head)).toBe(true);
    expect(await app.isAncestor("token", "org", "docs", ancestor, head)).toBe(false);
    await expect(
      app.isAncestor("token", "org", "docs", ancestor, head),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_RESPONSE" });
  });
  it("recovers an existing closed PR by deterministic branch without creating another or exposing its body", async () => {
    const row = {
      number: 3,
      html_url: "https://github.com/org/docs/pull/3",
      state: "closed",
      merged_at: null,
      body: "private review prose",
      head: {
        ref: "frontlit/docs/gproposal_test",
        sha: "a".repeat(40),
        repo: { id: 9 },
      },
      base: { ref: "main", sha: "b".repeat(40), repo: { id: 9 } },
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([row]));
    const app = new DocsGitHubApp(config, fetcher),
      input = { proposalId: "gproposal_test", base: "main", repositoryId: 9 };
    expect(await app.findProposalPullRequest("token", "org", "docs", input)).toEqual({
      number: 3,
      url: row.html_url,
      state: "closed",
      merged: false,
      headSha: row.head.sha,
      baseSha: row.base.sha,
      mergeCommitSha: null,
    });
    fetcher.mockResolvedValueOnce(
      response([
        { ...row, merged_at: "2026-10-01T10:00:00Z", merge_commit_sha: "c".repeat(40) },
      ]),
    );
    expect(
      await app.findProposalPullRequest("token", "org", "docs", input),
    ).toMatchObject({ merged: true, mergeCommitSha: "c".repeat(40) });
    fetcher.mockResolvedValueOnce(
      response([{ ...row, merged_at: "2026-10-01T10:00:00Z", merge_commit_sha: null }]),
    );
    await expect(
      app.findProposalPullRequest("token", "org", "docs", input),
    ).rejects.toMatchObject({ code: "GITHUB_INVALID_RESPONSE" });
    const query = new URL(fetcher.mock.calls[0][0] as string).searchParams;
    expect(query.get("head")).toBe("org:frontlit/docs/gproposal_test");
    expect(query.get("state")).toBe("all");
    expect(fetcher.mock.calls[0][1]!.method).toBe("GET");
    fetcher.mockResolvedValueOnce(response([]));
    expect(await app.findProposalPullRequest("token", "org", "docs", input)).toBeNull();
    fetcher.mockResolvedValueOnce(response([row, row]));
    await expect(
      app.findProposalPullRequest("token", "org", "docs", input),
    ).rejects.toMatchObject({ code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT" });
    fetcher.mockResolvedValueOnce(
      response([{ ...row, head: { ...row.head, repo: { id: 10 } } }]),
    );
    await expect(
      app.findProposalPullRequest("token", "org", "docs", input),
    ).rejects.toMatchObject({ code: "GITHUB_PROPOSAL_RECOVERY_CONFLICT" });
  });
  it("creates a patch tree, single-parent commit and deterministic branch, checking fresh authority before each mutation", async () => {
    const sha = "a".repeat(40),
      tree = "b".repeat(40),
      commit = "c".repeat(40);
    const guard = vi.fn(async () => {});
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      expect(guard.mock.calls.length).toBe(fetcher.mock.calls.length);
      const body = JSON.parse(options!.body as string);
      return response(
        body.ref
          ? { ref: body.ref, object: { sha: commit } }
          : { sha: body.parents ? commit : tree },
      );
    });
    const app = new DocsGitHubApp(config, fetcher);
    expect(
      await app.createProposalTree(
        "token",
        "org",
        "docs",
        {
          baseTreeSha: sha,
          directory: "docs",
          edits: [
            { path: "docs/old.md", mode: "100644", content: null },
            { path: "docs/new.md", mode: "100644", content: "# Captured guide" },
          ],
        },
        guard,
      ),
    ).toBe(tree);
    expect(
      await app.createProposalCommit(
        "token",
        "org",
        "docs",
        {
          parentSha: sha,
          treeSha: tree,
          proposalId: "gproposal_test",
          title: "Review guide",
        },
        guard,
      ),
    ).toBe(commit);
    expect(
      await app.createProposalBranch(
        "token",
        "org",
        "docs",
        "gproposal_test",
        commit,
        guard,
      ),
    ).toBe("frontlit/docs/gproposal_test");
    expect(
      fetcher.mock.calls.map(([, options]) => JSON.parse(options!.body as string)),
    ).toEqual([
      {
        base_tree: sha,
        tree: [
          { path: "docs/old.md", mode: "100644", type: "blob", sha: null },
          {
            path: "docs/new.md",
            mode: "100644",
            type: "blob",
            content: "# Captured guide",
          },
        ],
      },
      {
        parents: [sha],
        tree,
        message: "Review guide\n\nFrontLit proposal: gproposal_test",
      },
      { ref: "refs/heads/frontlit/docs/gproposal_test", sha: commit },
    ]);
  });
  it("sends no tree/commit/branch/PR mutation when the immediate authority check fails", async () => {
    const sha = "a".repeat(40),
      fetcher = vi.fn<typeof fetch>(),
      app = new DocsGitHubApp(config, fetcher);
    const guard = vi.fn(async () => {
      throw new Error("revoked");
    });
    const calls = [
      () =>
        app.createProposalTree(
          "token",
          "org",
          "docs",
          {
            baseTreeSha: sha,
            directory: "docs",
            edits: [{ path: "docs/a.md", mode: "100644", content: "guide" }],
          },
          guard,
        ),
      () =>
        app.createProposalCommit(
          "token",
          "org",
          "docs",
          {
            parentSha: sha,
            treeSha: sha,
            proposalId: "gproposal_test",
            title: "Review",
          },
          guard,
        ),
      () =>
        app.createProposalBranch("token", "org", "docs", "gproposal_test", sha, guard),
      () =>
        app.createProposalPullRequest(
          "token",
          "org",
          "docs",
          {
            proposalId: "gproposal_test",
            base: "main",
            title: "Review",
            detailsUrl:
              "http://localhost:3000/content/documentation/github/proposals/gproposal_test",
            documentCount: 1,
          },
          guard,
        ),
    ];
    for (const call of calls) await expect(call()).rejects.toThrow("revoked");
    expect(guard).toHaveBeenCalledTimes(4);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects unsafe tree edits and credential-bearing report links before remote calls", async () => {
    const fetcher = vi.fn<typeof fetch>(),
      guard = vi.fn(async () => {}),
      app = new DocsGitHubApp(config, fetcher),
      sha = "a".repeat(40);
    for (const path of [
      "../secrets.md",
      "other/a.md",
      "docs/image.png",
      "docs/.github/workflows/job.md",
    ])
      await expect(
        app.createProposalTree(
          "token",
          "org",
          "docs",
          {
            baseTreeSha: sha,
            directory: "docs",
            edits: [{ path, mode: "100644", content: "x" }],
          },
          guard,
        ),
      ).rejects.toThrow();
    for (const detailsUrl of [
      "https://evil.test/report",
      "http://localhost:3000/content/documentation/github/proposals/gproposal_test?token=secret",
      "http://secret@localhost:3000/content/documentation/github/proposals/gproposal_test",
    ])
      await expect(
        app.createProposalPullRequest(
          "token",
          "org",
          "docs",
          {
            proposalId: "gproposal_test",
            base: "main",
            title: "Review",
            documentCount: 1,
            detailsUrl,
          },
          guard,
        ),
      ).rejects.toMatchObject({ code: "GITHUB_INVALID_REQUEST" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
  });
  it("advances a verified single-parent commit without force and sanitizes a provider race rejection", async () => {
    const parent = "a".repeat(40),
      sha = "b".repeat(40),
      guard = vi.fn(async () => {});
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response({ sha, tree: { sha: parent }, parents: [{ sha: parent }] }),
      )
      .mockResolvedValueOnce(response({ commit: { sha: parent } }))
      .mockResolvedValueOnce(
        response({ message: "private provider details secret" }, 422),
      );
    const app = new DocsGitHubApp(config, fetcher);
    await expect(
      app.advanceBranch(
        "token",
        "org",
        "docs",
        { branch: "release/docs", expectedHead: parent, commitSha: sha },
        guard,
      ),
    ).rejects.toMatchObject({
      code: "GITHUB_WRITE_REJECTED",
      status: 422,
      message: "GITHUB_WRITE_REJECTED",
    });
    expect(guard).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[2][0]).toBe(
      "https://api.github.com/repos/org/docs/git/refs/heads/release%2Fdocs",
    );
    expect(JSON.parse(fetcher.mock.calls[2][1]!.body as string)).toEqual({
      sha,
      force: false,
    });
  });
  it("does not update a changed branch or a commit with a different parent", async () => {
    const parent = "a".repeat(40),
      sha = "b".repeat(40),
      other = "c".repeat(40),
      guard = vi.fn(async () => {});
    for (const changedParent of [true, false]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          response({
            sha,
            tree: { sha: parent },
            parents: [{ sha: changedParent ? other : parent }],
          }),
        )
        .mockResolvedValueOnce(response({ commit: { sha: other } }));
      await expect(
        new DocsGitHubApp(config, fetcher).advanceBranch(
          "token",
          "org",
          "docs",
          { branch: "main", expectedHead: parent, commitSha: sha },
          guard,
        ),
      ).rejects.toMatchObject({ code: "UPSTREAM_CHANGED" });
      expect(fetcher.mock.calls.every(([, init]) => init?.method === "GET")).toBe(true);
    }
    expect(guard).not.toHaveBeenCalled();
  });
  it("creates a PR with only a summary and authenticated report link", async () => {
    const guard = vi.fn(async () => {}),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          response({ number: 12, html_url: "https://github.com/org/docs/pull/12" }),
        );
    expect(
      await new DocsGitHubApp(config, fetcher).createProposalPullRequest(
        "token",
        "org",
        "docs",
        {
          proposalId: "gproposal_test",
          base: "main",
          title: "Review",
          documentCount: 2,
          detailsUrl:
            "http://localhost:3000/content/documentation/github/proposals/gproposal_test",
        },
        guard,
      ),
    ).toEqual({ number: 12, url: "https://github.com/org/docs/pull/12" });
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({
      title: "Review",
      head: "frontlit/docs/gproposal_test",
      base: "main",
      body: "Updates 2 captured documentation version(s).\n\nReview in FrontLit: http://localhost:3000/content/documentation/github/proposals/gproposal_test",
    });
    expect(guard).toHaveBeenCalledTimes(1);
  });
  it("signs short-lived App JWT and creates independent hashed state and S256 PKCE", () => {
    const jwt = createAppJwt(config, 1_700_000_000_000);
    const [header, body, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toEqual({
      iss: "client",
      iat: 1_699_999_940,
      exp: 1_700_000_540,
    });
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${body}`),
        keys.publicKey,
        Buffer.from(signature, "base64url"),
      ),
    ).toBe(true);
    const proof = createSetupProof();
    expect(proof.verifier.length).toBe(43);
    expect(proof.stateHash).toBe(
      createHash("sha256").update(proof.state).digest("hex"),
    );
    expect(proof.challenge).toBe(
      createHash("sha256").update(proof.verifier).digest("base64url"),
    );
    const url = new URL(githubAuthorizationUrl(config, proof.state, proof.challenge));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.has("scope")).toBe(false);
  });
  it("authenticates the exact raw webhook bytes, rejecting malformed and modified signatures", () => {
    const raw = Buffer.from('{ "a": 1 }');
    const header = `sha256=${createHmac("sha256", config.webhookSecret).update(raw).digest("hex")}`;
    expect(verifyGitHubSignature(raw, header, config.webhookSecret)).toBe(true);
    expect(
      verifyGitHubSignature(Buffer.from('{"a":1}'), header, config.webhookSecret),
    ).toBe(false);
    expect(verifyGitHubSignature(raw, "sha256=abc", config.webhookSecret)).toBe(false);
    expect(verifyGitHubSignature(raw, header, "")).toBe(false);
  });
  it("restricts read installation tokens to one selected stable repository", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ token: "ephemeral", expires_at: "2030-01-01T00:00:00Z" }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    expect((await app.installationToken(5, 7)).token).toBe("ephemeral");
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.github.com/app/installations/5/access_tokens");
    expect(JSON.parse(options!.body as string)).toEqual({
      repository_ids: [7],
      permissions: { metadata: "read", contents: "read" },
    });
    expect(options!.redirect).toBe("error");
  });
  it("scopes proposal, direct-commit and check tokens to the selected repository and required permissions", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        response({ token: "ephemeral", expires_at: "2030-01-01T00:00:00Z" }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    for (const purpose of ["proposal", "direct", "checks", "review"] as const)
      await app.installationToken(5, 7, purpose);
    expect(
      fetcher.mock.calls.map(([, options]) => JSON.parse(options!.body as string)),
    ).toEqual([
      {
        repository_ids: [7],
        permissions: { metadata: "read", contents: "write", pull_requests: "write" },
      },
      { repository_ids: [7], permissions: { metadata: "read", contents: "write" } },
      {
        repository_ids: [7],
        permissions: { metadata: "read", contents: "read", checks: "write" },
      },
      {
        repository_ids: [7],
        permissions: { metadata: "read", contents: "read", pull_requests: "read" },
      },
    ]);
  });
  it("uses nonrecursive complete trees when GitHub truncates recursive trees", async () => {
    const sha = "a".repeat(40);
    const sub = "b".repeat(40);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ tree: [{ path: "partial" }], truncated: true }))
      .mockResolvedValueOnce(
        response({
          tree: [{ path: "docs", mode: "040000", type: "tree", sha: sub }],
          truncated: false,
        }),
      )
      .mockResolvedValueOnce(
        response({
          tree: [{ path: "guide.md", mode: "100644", type: "blob", sha }],
          truncated: false,
        }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    const entries = await app.tree("token", "owner", "repo", sha);
    expect(entries.map((e) => e.path)).toEqual(["docs", "docs/guide.md"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const incomplete = new DocsGitHubApp(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response({ tree: [], truncated: true }))
        .mockResolvedValueOnce(response({ tree: [], truncated: true })),
    );
    await expect(incomplete.tree("token", "owner", "repo", sha)).rejects.toMatchObject({
      code: "GITHUB_TREE_INCOMPLETE",
    });
  });
  it("returns bounded retry timing on rate limits and never leaks provider bodies", async () => {
    const app = new DocsGitHubApp(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(
        response({ leaked: "secret-token" }, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "2000000000",
        }),
      ),
    );
    await expect(app.user("private-token")).rejects.toMatchObject({
      code: "GITHUB_RATE_LIMITED",
      retryAt: new Date(2_000_000_000_000),
    });
    const forbidden = new DocsGitHubApp(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response({ leaked: "secret-token" }, 403)),
    );
    await expect(forbidden.user("private-token")).rejects.toMatchObject({
      message: "GITHUB_ACCESS_LOST",
    });
  });
  it("exchanges OAuth codes with the verifier and rejects error or malformed credentials", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ access_token: "user-token", token_type: "bearer" }),
      );
    const app = new DocsGitHubApp(config, fetcher);
    expect(await app.exchangeCode("code", "verifier")).toBe("user-token");
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({
      code_verifier: "verifier",
      redirect_uri: config.callbackUrl,
    });
    await expect(
      new DocsGitHubApp(
        config,
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(response({ error: "bad_verification_code" })),
      ).exchangeCode("bad", "verifier"),
    ).rejects.toMatchObject({ code: "GITHUB_OAUTH_REJECTED" });
  });
});
