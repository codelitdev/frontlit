"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/codelit/button";
import { Input } from "@/components/ui/codelit/input";
import { Label } from "@/components/ui/codelit/label";
import { documentationPanel } from "@/components/content/documentation-panel";
import { ApiError } from "@/lib/api-client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/codelit/select";
import {
  getDocumentationGitSource,
  startDocumentationGitSetup,
  listDocumentationGitRepositories,
  preflightDocumentationGit,
  connectDocumentationGit,
  changeDocumentationGitState,
  getDocumentationSettings,
  planDocumentationGitMigration,
  getDocumentationGitMigration,
  createDocumentationGitMigrationPr,
  verifyDocumentationGitMigration,
  activateDocumentationGitMigration,
  cancelDocumentationGitMigration,
  grantDocumentationGitCapabilities,
  type DocumentationGitSource,
  type DocumentationGitRepositories,
  type DocumentationGitPreflight,
  type DocumentationGitMigration,
} from "@/lib/api";

export function DocumentationSource({
  workspaceKey,
  hasCmsContent,
  canPublish,
  onChanged,
  inline = false,
  triggerLabel = "Source",
}: {
  workspaceKey: string;
  hasCmsContent: boolean;
  canPublish: boolean;
  onChanged: () => Promise<void>;
  inline?: boolean;
  triggerLabel?: string;
}) {
  const { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } =
    documentationPanel(inline);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DocumentationGitSource | null>(null);
  const [setupId, setSetupId] = useState("");
  const [installationReturned, setInstallationReturned] = useState(false);
  const [repositories, setRepositories] = useState<DocumentationGitRepositories | null>(
    null,
  );
  const [installationId, setInstallationId] = useState("");
  const [repositoryId, setRepositoryId] = useState("");
  const [branch, setBranch] = useState(""),
    [directory, setDirectory] = useState("docs");
  const [preflight, setPreflight] = useState<DocumentationGitPreflight | null>(null);
  const [migration, setMigration] = useState<DocumentationGitMigration | null>(null);
  const [acknowledgeSetupPr, setAcknowledgeSetupPr] = useState(false);
  const [verifiedSha, setVerifiedSha] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<
    DocumentationGitMigration["diagnostics"]
  >([]);
  const [consents, setConsents] = useState([false, false, false]);
  const storageKey = `documentation-git-plan:${workspaceKey}`;
  const setupStorageKey = `documentation-git-setup:${workspaceKey}`;
  const upgradeStorageKey = `documentation-git-upgrade:${workspaceKey}`;
  const [grantReview, setGrantReview] = useState<{
    generation: number;
    grantVersion: number;
    idempotencyKey: string;
  } | null>(null);
  const [writeConsents, setWriteConsents] = useState([false, false]);
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.code === "GITHUB_SETUP_EXPIRED") {
        sessionStorage.removeItem(setupStorageKey);
        setSetupId("");
        setRepositories(null);
        setGrantReview(null);
        setError(
          "GitHub setup has expired. Authorize again to continue. Your adoption plan and documentation are unchanged.",
        );
        return;
      }
      setError(
        e instanceof Error ? e.message : "Unable to complete the GitHub action.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const current = await getDocumentationGitSource();
    setSource(current);
    const retained = current.pendingMigrationId ?? sessionStorage.getItem(storageKey);
    let plan: DocumentationGitMigration | null = null;
    if (retained) {
      plan = await getDocumentationGitMigration(retained);
      sessionStorage.setItem(storageKey, plan.planId);
      setMigration(plan);
      setBranch(plan.selection.branch);
      setDirectory(plan.selection.directory);
      setInstallationId(String(plan.selection.installationId));
      setRepositoryId(String(plan.selection.repositoryId));
      setVerifiedSha(plan.status === "verified" ? plan.verifiedSha : null);
    }
    const savedSetup = sessionStorage.getItem(setupStorageKey);
    if (savedSetup) {
      try {
        const result = await listDocumentationGitRepositories(
          savedSetup,
          plan ? { installationId: plan.selection.installationId } : {},
        );
        setSetupId(savedSetup);
        setRepositories(result);
        if (result.installationId) setInstallationId(String(result.installationId));
        const upgrade = sessionStorage.getItem(upgradeStorageKey);
        if (upgrade) setGrantReview(JSON.parse(upgrade));
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "GITHUB_SETUP_EXPIRED")
          throw error;
        sessionStorage.removeItem(setupStorageKey);
        setSetupId("");
        setRepositories(null);
        setGrantReview(null);
      }
    }
    return plan;
  }
  const loadPanel = useEffectEvent(() => {
    const params = new URLSearchParams(window.location.search);
    const returned = params.get("githubSetup");
    if (params.get("githubInstallationReturned") === "1") {
      setOpen(true);
      setInstallationReturned(true);
      params.delete("githubInstallationReturned");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
      void action(load);
      return;
    }
    if (returned || params.has("githubError")) {
      setOpen(true);
      if (returned) {
        setSetupId(returned);
        sessionStorage.setItem(setupStorageKey, returned);
      }
      params.delete("githubSetup");
      params.delete("githubError");
      window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
      void action(async () => {
        const upgrade = sessionStorage.getItem(upgradeStorageKey);
        if (upgrade) {
          setGrantReview(JSON.parse(upgrade));
          setWriteConsents([false, false]);
          setSource(await getDocumentationGitSource());
          if (!returned)
            throw new Error("GitHub permission review was not completed. Restart it.");
          return;
        }
        await load();
        if (!returned)
          throw new Error("GitHub authorization was not completed. Start setup again.");
      });
    } else if (inline) {
      void action(load);
    }
  });
  useEffect(() => {
    loadPanel();
  }, [workspaceKey, inline]);
  useEffect(() => {
    if (
      !migration ||
      !["queued", "writing", "open"].includes(migration.pullRequest?.status ?? "")
    )
      return;
    let canceled = false;
    const timer = setInterval(
      () => {
        void getDocumentationGitMigration(migration.planId)
          .then((plan) => {
            if (!canceled) setMigration(plan);
          })
          .catch((error: unknown) => {
            if (!canceled)
              setError(
                error instanceof Error
                  ? error.message
                  : "Unable to refresh setup PR progress.",
              );
          });
      },
      migration.pullRequest?.status === "open" ? 10000 : 3000,
    );
    return () => {
      canceled = true;
      clearInterval(timer);
    };
  }, [migration?.planId, migration?.pullRequest?.status]);
  async function authorize() {
    sessionStorage.removeItem(setupStorageKey);
    setInstallationReturned(false);
    sessionStorage.removeItem(upgradeStorageKey);
    setGrantReview(null);
    const setup = await startDocumentationGitSetup({
      purpose: source?.source === "git" ? "reconnect" : "connect",
      returnPath: "/settings/content?tab=source",
    });
    window.location.assign(setup.authorizationUrl);
  }
  async function reviewWrites() {
    const current = await getDocumentationGitSource();
    if (!current.binding) throw new Error("Connect the documentation source first.");
    const setup = await startDocumentationGitSetup({
      purpose: "upgrade",
      returnPath: "/settings/content?tab=source",
    });
    sessionStorage.setItem(
      upgradeStorageKey,
      JSON.stringify({
        generation: current.binding.generation,
        grantVersion: current.binding.grantVersion,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
    window.location.assign(setup.authorizationUrl);
  }
  async function chooseInstallation(id: string) {
    setInstallationId(id);
    setRepositoryId("");
    setPreflight(null);
    setConsents([false, false, false]);
    const result = await listDocumentationGitRepositories(setupId, {
      installationId: Number(id),
    });
    setRepositories(result);
  }
  function chooseRepository(id: string) {
    const repo = repositories?.repositories.find((r) => String(r.repositoryId) === id);
    setRepositoryId(id);
    setBranch(repo?.defaultBranch ?? "");
    setPreflight(null);
    setConsents([false, false, false]);
  }
  function selection() {
    return {
      setupId,
      installationId: Number(installationId),
      repositoryId: Number(repositoryId),
      branch,
      directory,
    };
  }
  async function review(createSetup = false) {
    setConsents([false, false, false]);
    setDiagnostics([]);
    setVerifiedSha(null);
    if (source?.source === "editor" && (hasCmsContent || createSetup)) {
      const s = await getDocumentationSettings();
      const plan = await planDocumentationGitMigration({
        ...selection(),
        expectedDocsDraftVersion: s.draftVersion,
        expectedPublicationId: s.activePublicationId,
      });
      setMigration(plan);
      setAcknowledgeSetupPr(false);
      sessionStorage.setItem(storageKey, plan.planId);
    } else {
      const report = await preflightDocumentationGit(selection());
      setPreflight(report);
      setDiagnostics(report.diagnostics);
    }
  }
  function clearSetup() {
    sessionStorage.removeItem(storageKey);
    setMigration(null);
    setVerifiedSha(null);
    setConsents([false, false, false]);
  }
  async function cancelSetup() {
    if (!migration) return;
    await cancelDocumentationGitMigration(migration.planId);
    clearSetup();
  }
  async function verify() {
    if (!migration) return;
    setConsents([false, false, false]);
    setVerifiedSha(null);
    const result = await verifyDocumentationGitMigration(
      migration.planId,
      setupId || migration.setupId,
    );
    setDiagnostics(result.diagnostics);
    if (result.verified) {
      setVerifiedSha(result.commitSha);
      setMigration(await getDocumentationGitMigration(migration.planId));
    }
  }
  async function createSetupPr() {
    if (!migration || !acknowledgeSetupPr) return;
    await createDocumentationGitMigrationPr(migration.planId, {
      setupId: setupId || migration.setupId,
      planHash: migration.planHash,
      expectedDocsDraftVersion: migration.docsDraftVersion,
      expectedPublicationId: migration.activePublicationId,
      acknowledgeExport: true,
      initializeEmptyRepository: migration.initializeEmptyRepositoryRequired,
      idempotencyKey: `setup-pr:${migration.planId}`,
    });
    setMigration(await getDocumentationGitMigration(migration.planId));
  }
  async function activate() {
    const consent = {
      publishSelectedDocsPublicly: true as const,
      automaticallyPublishFuturePushes: true as const,
      delegateToWorkspacePublishers: true as const,
    };
    let result: DocumentationGitSource;
    if (migration && verifiedSha) {
      result = await activateDocumentationGitMigration(migration.planId, {
        setupId: setupId || migration.setupId,
        commitSha: verifiedSha,
        planHash: migration.planHash,
        expectedDocsDraftVersion: migration.docsDraftVersion,
        expectedPublicationId: migration.activePublicationId,
        idempotencyKey: `adopt:${migration.planId}:${verifiedSha}`,
        consent,
      });
      sessionStorage.removeItem(storageKey);
      setMigration(null);
    } else if (preflight?.publishable) {
      result = await connectDocumentationGit({
        preflightId: preflight.preflightId,
        commitSha: preflight.commitSha,
        manifestHash: preflight.manifestHash,
        expectedDocsDraftVersion: preflight.docsDraftVersion,
        idempotencyKey: `connect:${preflight.preflightId}`,
        consent,
      });
    } else return;
    setSource(result);
    setPreflight(null);
    setRepositories(null);
    setSetupId("");
    sessionStorage.removeItem(setupStorageKey);
    setConsents([false, false, false]);
    await onChanged();
  }
  const canReview = Boolean(
    setupId && installationId && repositoryId && branch.trim() && directory.trim(),
  );
  const needsConsent = Boolean(
    (migration && verifiedSha && migration.status === "verified") ||
      preflight?.publishable,
  );
  const repositoryName = repositories?.repositories.find(
    (repository) => String(repository.repositoryId) === repositoryId,
  )?.fullName;
  const setupVerified = migration?.status === "verified" && Boolean(verifiedSha);
  const setupNeedsCorrection =
    !setupVerified &&
    migration?.pullRequest?.status === "merged" &&
    diagnostics.some((diagnostic) => diagnostic.blocksPublish);
  const verificationAttempt = useRef("");
  const verifyMergedSetup = useEffectEvent(() => void action(verify));
  useEffect(() => {
    if (
      !migration ||
      migration.status !== "planned" ||
      migration.pullRequest?.status !== "merged" ||
      !setupId
    )
      return;
    const attempt = `${migration.planId}:${setupId}`;
    if (verificationAttempt.current === attempt) return;
    verificationAttempt.current = attempt;
    verifyMergedSetup();
  }, [migration?.planId, migration?.status, migration?.pullRequest?.status, setupId]);
  return (
    <>
      {!inline && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setOpen(true);
            void action(load);
          }}
        >
          {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Documentation source</DialogTitle>
            <DialogDescription>
              {source?.source === "git"
                ? "Managed in GitHub. Accepted content stays live if sync is paused or unavailable."
                : migration
                  ? "Connect your documentation repository. Your existing docs stay live during setup."
                  : "Manage docs here, or connect GitHub to review changes through pull requests."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {installationReturned && (
            <p role="status">
              Returned from GitHub installation. Authorize GitHub to verify your access
              and load repositories. Organization approval may still be required.
            </p>
          )}
          {busy && <p role="status">Working…</p>}
          {source?.binding && (
            <div className="space-y-2 text-sm">
              <p>
                {source.binding.owner}/{source.binding.repository} ·{" "}
                {source.binding.private ? "Private repository" : "Public repository"}
              </p>
              <p>
                Branch: {source.binding.branch} · Directory: {source.binding.directory}
              </p>
              <p>Connection: {source.status}</p>
              <p>
                Workspace writes: PRs{" "}
                {source.binding.capabilities.proposals ? "enabled" : "disabled"}; direct
                commits{" "}
                {source.binding.capabilities.directCommit ? "enabled" : "disabled"}.
              </p>
              <p>Observed commit: {source.binding.observedSha ?? "None"}</p>
              <p>Validated commit: {source.binding.validatedSha ?? "None"}</p>
              <p>Live commit: {source.binding.liveSha ?? "None"}</p>
              {source.sync && (
                <p>
                  Sync: {source.sync.status} · Publication:{" "}
                  {source.sync.publicationId ?? "None"}
                  {source.sync.commitSha
                    ? ` · Attempted commit: ${source.sync.commitSha}`
                    : ""}
                  {source.sync.diagnostic ? ` · ${source.sync.diagnostic}` : ""}
                </p>
              )}
              {source.binding.lastPrReconcileError && (
                <p role="status">
                  PR checks could not be refreshed:{" "}
                  {source.binding.lastPrReconcileError}. Check reporting is separate
                  from documentation publication.
                </p>
              )}
              {source.binding.lastDiagnostic && (
                <p role="status">{source.binding.lastDiagnostic}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {(source.status === "connected" || source.status === "paused") &&
                  canPublish && (
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() => void action(reviewWrites)}
                    >
                      {grantReview
                        ? "Restart permission review"
                        : "Review Git write permissions"}
                    </Button>
                  )}
                {source.status === "connected" && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await changeDocumentationGitState("sync");
                          setSource(await getDocumentationGitSource());
                        })
                      }
                    >
                      Sync now
                    </Button>
                    <Button
                      disabled={busy}
                      variant="outline"
                      onClick={() =>
                        void action(async () => {
                          await changeDocumentationGitState("pause");
                          setSource(await getDocumentationGitSource());
                        })
                      }
                    >
                      Pause sync
                    </Button>
                  </>
                )}
                {source.status === "paused" && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await changeDocumentationGitState("resume");
                        setSource(await getDocumentationGitSource());
                      })
                    }
                  >
                    Resume sync
                  </Button>
                )}
                {source.status !== "disconnected" && (
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void action(async () => {
                        await changeDocumentationGitState("disconnect");
                        setSource(await getDocumentationGitSource());
                      })
                    }
                  >
                    Disconnect
                  </Button>
                )}
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() => void action(load)}
                >
                  Refresh status
                </Button>
              </div>
            </div>
          )}
          {grantReview && source?.binding && (
            <div className="space-y-3 text-sm">
              <p>
                Approve this workspace&apos;s publishers to write documentation to{" "}
                {source.binding.owner}/{source.binding.repository}, branch{" "}
                {source.binding.branch}, directory {source.binding.directory}. App
                permission approval alone does not grant workspace writes. PRs require
                GitHub review; direct commits still pass documentation validation and
                publication.
              </p>
              {[
                "Allow workspace publishers to open documentation pull requests",
                "Allow workspace publishers to commit directly to the publishing branch",
              ].map((label, i) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={writeConsents[i]}
                    disabled={busy || !canPublish || !setupId}
                    onChange={(event) =>
                      setWriteConsents((current) =>
                        current.map((value, j) =>
                          j === i ? event.target.checked : value,
                        ),
                      )
                    }
                  />
                  {label}
                </label>
              ))}
              <p>
                Leave both unchecked to remove workspace write permission. Existing
                GitHub PRs are retained.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !canPublish || !setupId}
                  onClick={() =>
                    void action(async () => {
                      await grantDocumentationGitCapabilities({
                        setupId,
                        expectedConnectionGeneration: grantReview.generation,
                        expectedGrantVersion: grantReview.grantVersion,
                        idempotencyKey: grantReview.idempotencyKey,
                        consent: {
                          delegatePullRequests: writeConsents[0],
                          delegateDirectCommits: writeConsents[1],
                        },
                      });
                      sessionStorage.removeItem(upgradeStorageKey);
                      setGrantReview(null);
                      setSetupId("");
                      sessionStorage.removeItem(setupStorageKey);
                      setSource(await getDocumentationGitSource());
                      await onChanged();
                    })
                  }
                >
                  Confirm workspace write permissions
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    sessionStorage.removeItem(upgradeStorageKey);
                    setGrantReview(null);
                    setSetupId("");
                    sessionStorage.removeItem(setupStorageKey);
                  }}
                >
                  Cancel permission review
                </Button>
              </div>
            </div>
          )}
          {source && !source.configured && (
            <p>
              The documentation GitHub App must be configured by the operator before
              setup.
            </p>
          )}
          {source?.configured &&
            !setupId &&
            !needsConsent &&
            (!migration ||
              !migration.pullRequest ||
              migration.pullRequest.diagnostic ||
              ["failed", "merged"].includes(migration.pullRequest.status)) &&
            (source.source === "editor" ||
              source.status === "access_lost" ||
              source.status === "disconnected") && (
              <>
                <p className="text-sm">
                  {migration
                    ? "Reconnect GitHub to continue this setup. Your pull request and reviewed files are saved."
                    : "Connect your GitHub account, then choose the repository for your documentation."}
                </p>
                <Button disabled={busy} onClick={() => void action(authorize)}>
                  {setupId
                    ? "Reauthorize GitHub"
                    : source.source === "git"
                      ? "Reconnect GitHub"
                      : migration
                        ? "Reconnect GitHub"
                        : "Connect GitHub"}
                </Button>
              </>
            )}
          {repositories && !migration && !grantReview && (
            <div className="space-y-4">
              {repositories.installUrl && (
                <>
                  <p>
                    No accessible installation yet. Install the App or wait for
                    organization approval, then refresh.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(
                        repositories.installUrl!,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Open App installation
                  </Button>
                </>
              )}
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void action(async () =>
                    setRepositories(
                      await listDocumentationGitRepositories(
                        setupId,
                        installationId
                          ? { installationId: Number(installationId) }
                          : {},
                      ),
                    ),
                  )
                }
              >
                Refresh repositories
              </Button>
              <Label htmlFor="git-installation">Installation</Label>
              <Select
                value={installationId}
                disabled={busy || Boolean(migration)}
                onValueChange={(id) => void action(() => chooseInstallation(id))}
              >
                <SelectTrigger id="git-installation">
                  <SelectValue placeholder="Select installation" />
                </SelectTrigger>
                <SelectContent>
                  {repositories.installations.map((i) => (
                    <SelectItem key={i.installationId} value={String(i.installationId)}>
                      {i.accountLogin} (
                      {i.accountType === "Organization"
                        ? "Organization"
                        : "Personal account"}
                      )
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Label htmlFor="git-repository">Repository</Label>
              <Select
                value={repositoryId}
                disabled={busy || Boolean(migration)}
                onValueChange={chooseRepository}
              >
                <SelectTrigger id="git-repository">
                  <SelectValue placeholder="Select repository" />
                </SelectTrigger>
                <SelectContent>
                  {repositories.repositories.map((r) => (
                    <SelectItem key={r.repositoryId} value={String(r.repositoryId)}>
                      {r.fullName}
                      {r.private ? " (private)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {repositories.nextPage && (
                <Button
                  disabled={busy}
                  variant="outline"
                  onClick={() =>
                    void action(async () => {
                      const next = await listDocumentationGitRepositories(setupId, {
                        installationId: Number(installationId),
                        page: repositories.nextPage!,
                      });
                      setRepositories({
                        ...next,
                        repositories: [
                          ...repositories.repositories,
                          ...next.repositories,
                        ],
                      });
                    })
                  }
                >
                  Load more repositories
                </Button>
              )}
              <Label htmlFor="git-branch">Publishing branch</Label>
              <Input
                id="git-branch"
                value={branch}
                disabled={busy || Boolean(migration)}
                onChange={(e) => {
                  setBranch(e.target.value);
                  setPreflight(null);
                }}
              />
              <Label htmlFor="git-directory">Documentation directory</Label>
              <Input
                id="git-directory"
                value={directory}
                disabled={busy || Boolean(migration)}
                onChange={(e) => {
                  setDirectory(e.target.value);
                  setPreflight(null);
                }}
              />
              {!migration && (
                <Button
                  disabled={busy || !canReview || (hasCmsContent && !canPublish)}
                  onClick={() => void action(() => review())}
                >
                  {source?.source === "editor" && hasCmsContent
                    ? "Review setup PR"
                    : "Review source"}
                </Button>
              )}
              {!migration && source?.source === "editor" && !hasCmsContent && (
                <Button
                  variant="outline"
                  disabled={busy || !canReview || !canPublish}
                  onClick={() => void action(() => review(true))}
                >
                  Review setup PR
                </Button>
              )}
            </div>
          )}
          {migration && (
            <div className="space-y-3 text-sm">
              <h3 className="font-medium text-base">
                {setupVerified
                  ? "Your repository is ready"
                  : ["canceled", "expired"].includes(migration.status)
                    ? "Setup stopped"
                    : setupNeedsCorrection
                      ? "Your setup needs a correction"
                      : migration.pullRequest?.status === "merged"
                        ? "Checking your merged setup"
                        : migration.pullRequest?.status === "open"
                          ? "Review and merge your setup PR"
                          : ["queued", "writing"].includes(
                                migration.pullRequest?.status ?? "",
                              )
                            ? "Creating your setup PR"
                            : migration.pullRequest?.status === "closed"
                              ? "Your setup PR was closed without merging"
                              : "Review your setup"}
              </h3>
              <p>
                {repositoryName ? `${repositoryName} · ` : ""}
                {migration.selection.branch} · {migration.selection.directory}
              </p>
              <p>
                {setupVerified
                  ? "Your setup PR is merged and its files have been checked. Finish connecting below. Existing docs and URLs will be retained."
                  : setupNeedsCorrection
                    ? "Fix the reported files in GitHub so they match your reviewed setup, then check them again."
                    : migration.pullRequest?.status === "merged"
                      ? "FrontLit checks the merged files automatically. Reconnect GitHub if prompted to confirm your access."
                      : migration.pullRequest?.status === "open"
                        ? "Review the files in GitHub and merge the pull request. FrontLit will detect the merge and check the files."
                        : ["queued", "writing"].includes(
                              migration.pullRequest?.status ?? "",
                            )
                          ? "FrontLit is copying the reviewed files to a new branch and opening a pull request."
                          : migration.pullRequest?.status === "closed"
                            ? "Your existing docs are unchanged. Cancel this setup to start again."
                            : ["canceled", "expired"].includes(migration.status)
                              ? "Your existing docs are unchanged. Any branch or pull request already created remains in GitHub."
                              : "FrontLit will open a pull request with these files. Review and merge it in GitHub to continue."}
              </p>
              {["canceled", "expired"].includes(migration.status) &&
                migration.pullRequest &&
                (migration.pullRequest.commitSha ||
                  migration.pullRequest.pullRequestNumber) && (
                  <p>
                    Created in GitHub before setup stopped:{" "}
                    {migration.pullRequest.pullRequestNumber
                      ? `setup PR #${migration.pullRequest.pullRequestNumber}, `
                      : ""}
                    commit{" "}
                    <code>
                      {migration.pullRequest.commitSha?.slice(0, 7) ?? "unknown"}
                    </code>{" "}
                    and possibly branch{" "}
                    <code className="break-all">{migration.pullRequest.branch}</code>.
                    Delete them in GitHub if you no longer need them.
                  </p>
                )}
              {["canceled", "expired"].includes(migration.status) && (
                <Button variant="outline" disabled={busy} onClick={clearSetup}>
                  Start a new setup
                </Button>
              )}
              {migration.pullRequest?.status === "closed" &&
                !["canceled", "expired"].includes(migration.status) && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void action(cancelSetup)}
                  >
                    Cancel setup
                  </Button>
                )}
              {setupNeedsCorrection && (
                <Button
                  variant="outline"
                  disabled={busy || !canPublish || !setupId}
                  onClick={() => void action(verify)}
                >
                  Check files again
                </Button>
              )}
              {(!migration.pullRequest ||
                migration.pullRequest.status === "failed" ||
                migration.pullRequest.diagnostic) && (
                <>
                  <p>
                    {migration.repositoryPrivate === null
                      ? "Repository visibility needs fresh verification"
                      : migration.repositoryPrivate
                        ? "Private repository"
                        : "Public repository"}
                    . {migration.unpublishedDraftCount} never-published draft(s) will be
                    copied to the repository as unpublished text. Repository readers can
                    see that text.
                  </p>
                  {migration.initializeEmptyRepositoryRequired && (
                    <p>
                      This repository is empty. FrontLit will first initialize its
                      default publishing branch with only{" "}
                      {migration.selection.directory}/.gitkeep, then open the
                      documentation PR. No document text will be committed directly to
                      that branch.
                    </p>
                  )}
                </>
              )}
              <details className="space-y-3">
                <summary className="cursor-pointer underline">
                  Setup details · {migration.total} files
                </summary>
                <p>
                  Repository ID: {migration.selection.repositoryId}. Setup:{" "}
                  {migration.status}. Review expires{" "}
                  {new Date(migration.expiresAt).toLocaleString()}.
                </p>
                <p>
                  Plan ID: <code className="break-all">{migration.planId}</code>
                </p>
                {verifiedSha && (
                  <p>
                    Verified commit: <code className="break-all">{verifiedSha}</code>
                  </p>
                )}
                {migration.pullRequest?.bootstrapSha && (
                  <p>
                    Placeholder commit:{" "}
                    <code className="break-all">
                      {migration.pullRequest.bootstrapSha}
                    </code>
                    . It remains in GitHub if setup is canceled.
                  </p>
                )}
                <ul className="space-y-2">
                  {migration.files.map((f) => (
                    <li
                      key={f.path}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="break-all font-mono">{f.path}</span>
                    </li>
                  ))}
                </ul>
                {migration.nextOffset !== null && (
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() =>
                      void action(async () =>
                        setMigration(
                          await getDocumentationGitMigration(
                            migration.planId,
                            migration.nextOffset!,
                          ),
                        ),
                      )
                    }
                  >
                    Next files page
                  </Button>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void action(async () =>
                        setMigration(
                          await getDocumentationGitMigration(migration.planId),
                        ),
                      )
                    }
                  >
                    Refresh status
                  </Button>
                  {migration.pullRequest?.status === "merged" &&
                    !setupNeedsCorrection && (
                      <Button
                        variant="outline"
                        disabled={busy || !canPublish || !setupId}
                        onClick={() => void action(verify)}
                      >
                        Check files again
                      </Button>
                    )}
                  <Button
                    disabled={busy || migration.status === "activated"}
                    variant="outline"
                    onClick={() => void action(cancelSetup)}
                  >
                    Cancel setup
                  </Button>
                </div>
              </details>
              {(!migration.pullRequest ||
                migration.pullRequest.status === "failed" ||
                (migration.pullRequest.status === "open" &&
                  migration.pullRequest.diagnostic)) && (
                <div className="space-y-3">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acknowledgeSetupPr}
                      onChange={(event) => setAcknowledgeSetupPr(event.target.checked)}
                    />
                    <span>
                      I reviewed the destination and files and approve copying their
                      text, including unpublished drafts, to this repository for the
                      setup PR.
                      {migration.initializeEmptyRepositoryRequired &&
                        " I also approve placeholder-only initialization of the empty repository's default branch."}
                    </span>
                  </label>
                  <Button
                    disabled={
                      busy ||
                      !canPublish ||
                      !acknowledgeSetupPr ||
                      !setupId ||
                      ["canceled", "expired", "activated"].includes(migration.status)
                    }
                    onClick={() => void action(createSetupPr)}
                  >
                    {migration.pullRequest ? "Retry setup PR" : "Create setup PR"}
                  </Button>
                </div>
              )}
              {migration.pullRequest && (
                <div className="space-y-2">
                  {migration.pullRequest.diagnostic && (
                    <p role="alert">
                      {migration.pullRequest.diagnostic}. Reauthorize GitHub if access
                      expired, then retry the reviewed setup.
                    </p>
                  )}
                  {migration.pullRequest.pullRequestUrl && (
                    <a
                      href={migration.pullRequest.pullRequestUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      Open setup PR #{migration.pullRequest.pullRequestNumber}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
          {preflight?.publishable && (
            <div className="space-y-2 text-sm">
              <p>
                {preflight.repositoryPrivate
                  ? "Private repository"
                  : "Public repository"}
                : selected published docs become public on this site.
              </p>
              <p>
                Commit: {preflight.commitSha}. {preflight.publishedCount} public docs of{" "}
                {preflight.fileCount} files. Omitted <code>published</code> defaults to
                true.
              </p>
              <p>
                {preflight.excludedFiles.length} files are excluded from public
                publication.
              </p>
              <ul>
                {preflight.routes.map((r) => (
                  <li key={r.path}>
                    {r.path} → /docs/{r.route}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(diagnostics.length > 0 || (source?.sync?.diagnostics.length ?? 0) > 0) && (
            <ul role="alert" className="space-y-1 text-sm">
              {(diagnostics.length
                ? diagnostics
                : (source?.sync?.diagnostics ?? [])
              ).map((d, i) => (
                <li key={i}>
                  {d.file
                    ? `${d.file}${d.line ? `:${d.line}${d.column ? `:${d.column}` : ""}` : ""}: `
                    : ""}
                  {d.code} — {d.message}
                  {d.relatedFiles?.length
                    ? ` · Related files: ${d.relatedFiles.join(", ")}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          {needsConsent && (
            <div className="space-y-3">
              <p className="text-sm">
                Confirm how this repository will manage your documentation:
              </p>
              {[
                "Publish the selected docs on my public documentation site.",
                `Automatically publish valid updates merged or pushed to ${branch}/${directory}.`,
                "Let workspace publishers manage docs through this repository. GitHub writes require separate permission.",
              ].map((label, i) => (
                <Label key={label} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={consents[i]}
                    disabled={busy}
                    onChange={(e) =>
                      setConsents((current) =>
                        current.map((v, n) => (n === i ? e.target.checked : v)),
                      )
                    }
                  />
                  {label}
                </Label>
              ))}
              {!canPublish && (
                <p>
                  Manage and publish permissions are both required to approve this
                  connection.
                </p>
              )}
              {migration && !setupId && (
                <div className="space-y-2 text-sm">
                  <p>
                    Reconnect GitHub to confirm your access and finish setup. Your
                    merged PR and checked files are saved.
                  </p>
                  <Button
                    disabled={busy}
                    variant="outline"
                    onClick={() => void action(authorize)}
                  >
                    Reconnect GitHub
                  </Button>
                </div>
              )}
              <Button
                disabled={
                  busy ||
                  !canPublish ||
                  !consents.every(Boolean) ||
                  Boolean(migration && !setupId)
                }
                onClick={() => void action(activate)}
              >
                {busy ? "Connecting…" : "Finish setup"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
