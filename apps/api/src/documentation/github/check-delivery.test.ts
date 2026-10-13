import { describe, expect, it, vi } from "vitest";
import { deliverGitDocsCheck } from "./check-delivery";
import {
  GitHubDocsError,
  type DocsGitHubApp,
  type GitDocsCheckInput,
  type GitDocsCheckRun,
  type GitWriteGuard,
} from "./app";
function fixture() {
  const input: GitDocsCheckInput & { conclusion: "success" } = {
    headSha: "a".repeat(40),
    name: "FrontLit / docs validation",
    externalId: "frontlit:validation:fixed_report",
    detailsUrl:
      "http://localhost:3000/content/documentation/github/proposals/gproposal_test",
    conclusion: "success",
    output: {
      title: "Validation",
      summary: "70 warnings, no blocking errors.",
      annotations: Array.from({ length: 70 }, (_, index) => ({
        path: "docs/guide.md",
        start_line: index + 1,
        end_line: index + 1,
        annotation_level: "warning",
        message: `Warning ${index + 1}`,
      })),
    },
  };
  const remote = {
    run: null as GitDocsCheckRun | null,
    annotations: [] as unknown[],
    loseCreateResponse: false,
    loseAppendResponse: false,
    loseCompletionResponse: false,
  };
  const guard = vi.fn(async () => {});
  const app = {
    findCheckRun: vi.fn(async () => remote.run && { ...remote.run }),
    createCheckRun: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        _input: GitDocsCheckInput,
        check: GitWriteGuard,
      ) => {
        await check();
        remote.run = {
          id: 11,
          status: "in_progress",
          conclusion: null,
          annotationsCount: 0,
        };
        if (remote.loseCreateResponse) {
          remote.loseCreateResponse = false;
          throw new GitHubDocsError("GITHUB_UNAVAILABLE");
        }
        return { ...remote.run };
      },
    ),
    updateCheckRun: vi.fn(
      async (
        _token: string,
        _owner: string,
        _name: string,
        value: { output: GitDocsCheckInput["output"]; conclusion?: string },
        check: GitWriteGuard,
      ) => {
        await check();
        if (value.output.annotations) {
          remote.annotations.push(...value.output.annotations);
          remote.run!.annotationsCount = remote.annotations.length;
          if (remote.loseAppendResponse) {
            remote.loseAppendResponse = false;
            throw new GitHubDocsError("GITHUB_UNAVAILABLE");
          }
        }
        if (value.conclusion) {
          remote.run!.status = "completed";
          remote.run!.conclusion = value.conclusion;
          if (remote.loseCompletionResponse) {
            remote.loseCompletionResponse = false;
            throw new GitHubDocsError("GITHUB_UNAVAILABLE");
          }
        }
        return { ...remote.run! };
      },
    ),
  };
  const deliver = () =>
    deliverGitDocsCheck(
      app as unknown as DocsGitHubApp,
      "token",
      "org",
      "docs",
      input,
      guard,
    );
  return { input, remote, guard, app, deliver };
}
describe("independent GitHub check delivery", () => {
  it("batches annotations in groups of 50, then completes and makes completed replays read-only", async () => {
    const f = fixture();
    expect(await f.deliver()).toMatchObject({
      status: "completed",
      conclusion: "success",
      annotationsCount: 70,
    });
    expect(
      f.app.updateCheckRun.mock.calls.map(
        (call) => call[3].output.annotations?.length ?? 0,
      ),
    ).toEqual([50, 20, 0]);
    expect(f.guard).toHaveBeenCalledTimes(4);
    await f.deliver();
    expect(f.guard).toHaveBeenCalledTimes(4);
    expect(f.app.createCheckRun).toHaveBeenCalledTimes(1);
  });
  it("recovers lost creation, append and completion responses without duplicate checks or annotations", async () => {
    const f = fixture();
    f.remote.loseCreateResponse = true;
    await expect(f.deliver()).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
    f.remote.loseAppendResponse = true;
    await expect(f.deliver()).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
    expect(f.remote.annotations).toHaveLength(50);
    f.remote.loseCompletionResponse = true;
    await expect(f.deliver()).rejects.toMatchObject({ code: "GITHUB_UNAVAILABLE" });
    expect(await f.deliver()).toMatchObject({
      status: "completed",
      annotationsCount: 70,
    });
    expect(f.remote.annotations).toEqual(f.input.output.annotations);
    expect(f.app.createCheckRun).toHaveBeenCalledTimes(1);
  });
  it("does not resume appends after fresh authority is revoked", async () => {
    const f = fixture();
    f.remote.loseAppendResponse = true;
    await expect(f.deliver()).rejects.toThrow();
    f.guard.mockRejectedValue(new GitHubDocsError("GITHUB_SUPERSEDED", 409));
    await expect(f.deliver()).rejects.toMatchObject({ code: "GITHUB_SUPERSEDED" });
    expect(f.remote.annotations).toHaveLength(50);
    expect(f.remote.run?.status).toBe("in_progress");
  });
  it("rejects malformed or oversized reports before remote creation", async () => {
    const f = fixture();
    f.input.output.annotations![60].path = "../private.md";
    await expect(f.deliver()).rejects.toMatchObject({ code: "GITHUB_INVALID_REQUEST" });
    expect(f.app.findCheckRun).not.toHaveBeenCalled();
    f.input.output.annotations = Array(1001).fill(f.input.output.annotations![0]);
    await expect(f.deliver()).rejects.toMatchObject({
      code: "GITHUB_CHECK_ANNOTATION_LIMIT",
    });
    expect(f.app.createCheckRun).not.toHaveBeenCalled();
  });
  it("does not accept a completed report with a different conclusion or appended count", async () => {
    const f = fixture();
    f.remote.run = {
      id: 11,
      status: "completed",
      conclusion: "failure",
      annotationsCount: 70,
    };
    await expect(f.deliver()).rejects.toMatchObject({
      code: "GITHUB_CHECK_RECOVERY_CONFLICT",
    });
    f.remote.run.conclusion = "success";
    f.remote.run.annotationsCount = 71;
    await expect(f.deliver()).rejects.toMatchObject({
      code: "GITHUB_CHECK_RECOVERY_CONFLICT",
    });
    expect(f.guard).not.toHaveBeenCalled();
  });
});
