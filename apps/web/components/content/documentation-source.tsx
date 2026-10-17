"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Check, ExternalLink, Github, GitPullRequest, Loader2 } from "lucide-react";
import {
  ManageShell,
  ManageSource,
} from "@/components/content/documentation-source-manage";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import {
  Callout,
  Code,
  ConsentRow,
  Disclosure,
  FileList,
  LinkButton,
  Mono,
  StatusBanner,
  StepIntro,
  SummaryCard,
  SummaryRow,
  Timeline,
  WizardShell,
  type TimelineState,
} from "@/components/content/documentation-connect-parts";
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
  /** Off connects the repository for pages only. */
  const [docsEnabled, setDocsEnabled] = useState(true);
  const [preflight, setPreflight] = useState<DocumentationGitPreflight | null>(null);
  const [migration, setMigration] = useState<DocumentationGitMigration | null>(null);
  const [acknowledgeSetupPr, setAcknowledgeSetupPr] = useState(false);
  const [verifiedSha, setVerifiedSha] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<
    DocumentationGitMigration["diagnostics"]
  >([]);
  const [consents, setConsents] = useState([false]);
  const [folderStep, setFolderStep] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [connectedInfo, setConnectedInfo] = useState<{
    repository: string;
    branch: string;
    directory: string;
  } | null>(null);
  const storageKey = `documentation-git-plan:${workspaceKey}`;
  const setupStorageKey = `documentation-git-setup:${workspaceKey}`;
  const upgradeStorageKey = `documentation-git-upgrade:${workspaceKey}`;
  const installRedirectKey = `documentation-git-install-redirect:${workspaceKey}`;
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
  // No installation yet: send the user to install the App once. The flag stops a
  // redirect loop when the install still awaits organization approval.
  useEffect(() => {
    if (!repositories) return;
    if (repositories.installations.length) {
      sessionStorage.removeItem(installRedirectKey);
      return;
    }
    if (!repositories.installUrl || sessionStorage.getItem(installRedirectKey)) return;
    sessionStorage.setItem(installRedirectKey, "1");
    window.location.assign(repositories.installUrl);
  }, [repositories, installRedirectKey]);
  async function authorize() {
    sessionStorage.removeItem(setupStorageKey);
    setInstallationReturned(false);
    sessionStorage.removeItem(upgradeStorageKey);
    setGrantReview(null);
    const setup = await startDocumentationGitSetup({
      purpose: source?.source === "git" ? "reconnect" : "connect",
      returnPath: "/settings/integrations?tab=github",
    });
    window.location.assign(setup.authorizationUrl);
  }
  async function reviewWrites() {
    const current = await getDocumentationGitSource();
    if (!current.binding) throw new Error("Connect the documentation source first.");
    const setup = await startDocumentationGitSetup({
      purpose: "upgrade",
      returnPath: "/settings/integrations?tab=github",
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
    setConsents([false]);
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
    setConsents([false]);
  }
  function selection() {
    return {
      setupId,
      installationId: Number(installationId),
      repositoryId: Number(repositoryId),
      branch,
      directory,
      ...(docsEnabled ? {} : { docsEnabled: false }),
    };
  }
  async function review(createSetup = false) {
    setConsents([false]);
    setDiagnostics([]);
    setVerifiedSha(null);
    if (docsEnabled && source?.source === "editor" && (hasCmsContent || createSetup)) {
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
    setConsents([false]);
  }
  async function cancelSetup() {
    if (!migration) return;
    await cancelDocumentationGitMigration(migration.planId);
    clearSetup();
  }
  async function verify() {
    if (!migration) return;
    setConsents([false]);
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
    setConnectedInfo({
      repository: migration?.repositoryName ?? repositoryName ?? "your repository",
      branch,
      directory,
    });
    setSource(result);
    setPreflight(null);
    setRepositories(null);
    setSetupId("");
    sessionStorage.removeItem(setupStorageKey);
    setConsents([false]);
    await onChanged();
  }
  const canReview = Boolean(
    setupId && installationId && repositoryId && branch.trim() && directory.trim(),
  );
  const repositoryName = repositories?.repositories.find(
    (repository) => String(repository.repositoryId) === repositoryId,
  )?.fullName;
  const setupVerified = migration?.status === "verified" && Boolean(verifiedSha);
  const setupNeedsCorrection =
    !setupVerified &&
    migration?.pullRequest?.status === "merged" &&
    diagnostics.some((diagnostic) => diagnostic.blocksPublish);
  const pullRequestStatus = migration?.pullRequest?.status ?? "";
  const setupStopped = ["canceled", "expired"].includes(migration?.status ?? "");
  const wizardMode = Boolean(
    connectedInfo || (source?.configured && source.source === "editor" && !grantReview),
  );
  type View =
    | "connect"
    | "repository"
    | "folder"
    | "review"
    | "creating"
    | "pr"
    | "checking"
    | "fix"
    | "finish"
    | "closed"
    | "stopped"
    | "preflight"
    | "done";
  const view: View = connectedInfo
    ? "done"
    : migration
      ? setupStopped
        ? "stopped"
        : pullRequestStatus === "closed"
          ? "closed"
          : setupVerified
            ? "finish"
            : setupNeedsCorrection
              ? "fix"
              : pullRequestStatus === "merged"
                ? "checking"
                : pullRequestStatus === "open"
                  ? "pr"
                  : ["queued", "writing"].includes(pullRequestStatus)
                    ? "creating"
                    : "review"
      : preflight?.publishable
        ? "preflight"
        : !setupId
          ? "connect"
          : folderStep
            ? "folder"
            : "repository";
  const wizardCurrent =
    view === "connect" || view === "repository"
      ? 0
      : view === "folder"
        ? 1
        : view === "review" || view === "preflight"
          ? 2
          : 3;
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
  const repoLabel = migration?.repositoryName ?? repositoryName ?? "your repository";
  const fileCount = migration?.total ?? 0;
  const isEmptyRepo = Boolean(migration?.initializeEmptyRepositoryRequired);
  const draftCount = migration?.unpublishedDraftCount ?? 0;
  const noGitHub = !setupId;
  const repoBadge = (isPrivate: boolean | null | undefined) =>
    isPrivate === null || isPrivate === undefined ? null : (
      <Badge variant="neutral">{isPrivate ? "Private" : "Public"}</Badge>
    );
  const timeline = (
    state: "review" | "creating" | "pr" | "checking" | "finish",
  ): {
    title: string;
    note: string;
    state: TimelineState;
    waiting?: string;
  }[] => {
    const at: TimelineState[] =
      state === "review"
        ? ["todo", "todo", "todo"]
        : state === "creating"
          ? ["current", "todo", "todo"]
          : state === "pr"
            ? ["done", "current", "todo"]
            : state === "checking"
              ? ["done", "done", "current"]
              : ["done", "done", "done"];
    return [
      {
        title: "FrontLit opens a pull request",
        note: `Adds your ${fileCount} files to ${migration?.selection.directory ?? directory}/ on a new branch.`,
        state: at[0],
        waiting: "Opening the pull request…",
      },
      {
        title: "You review and merge it in GitHub",
        note: `Nothing reaches ${migration?.selection.branch ?? branch} until you do.`,
        state: at[1],
        waiting: "Waiting for the merge",
      },
      {
        title: "FrontLit checks the files and connects",
        note: "Usually takes a few seconds.",
        state: at[2],
        waiting: `Checking ${fileCount} files`,
      },
    ];
  };
  const technicalDetails = migration && (
    <Disclosure label="Technical details">
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2">
        {migration.pullRequest?.branch && (
          <>
            <dt className="text-muted-foreground">Pull request branch</dt>
            <dd className="break-all font-mono">{migration.pullRequest.branch}</dd>
          </>
        )}
        {migration.pullRequest?.bootstrapSha && (
          <>
            <dt className="text-muted-foreground">Placeholder commit</dt>
            <dd className="break-all font-mono">
              {migration.pullRequest.bootstrapSha}
            </dd>
          </>
        )}
        {verifiedSha && (
          <>
            <dt className="text-muted-foreground">Verified commit</dt>
            <dd className="break-all font-mono">{verifiedSha}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Plan ID</dt>
        <dd className="break-all font-mono">{migration.planId}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void action(async () =>
              setMigration(await getDocumentationGitMigration(migration.planId)),
            )
          }
        >
          Refresh status
        </Button>
        {migration.pullRequest?.status === "merged" && !setupNeedsCorrection && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !canPublish || !setupId}
            onClick={() => void action(verify)}
          >
            Check files again
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy || migration.status === "activated"}
          onClick={() => void action(cancelSetup)}
        >
          Cancel setup
        </Button>
      </div>
    </Disclosure>
  );
  const consentRows = (
    <div className="space-y-3">
      {[
        `Publish the selected docs now, and automatically publish valid updates merged or pushed to ${branch}/${directory}.`,
      ].map((label, i) => (
        <ConsentRow
          key={label}
          checked={consents[i]}
          disabled={busy}
          onChange={(checked) =>
            setConsents((current) => current.map((v, n) => (n === i ? checked : v)))
          }
        >
          {label}
        </ConsentRow>
      ))}
      {!canPublish && (
        <p className="text-muted-foreground text-sm">
          Manage and publish permissions are both required to approve this connection.
        </p>
      )}
    </div>
  );
  const reconnectButton = (
    <Button disabled={busy} onClick={() => void action(authorize)}>
      Reconnect GitHub
    </Button>
  );
  const closeButton = (
    <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
      Close
    </Button>
  );
  const goBackToSelection = (toFolder: boolean) =>
    void action(async () => {
      await cancelSetup();
      setFolderStep(toFolder);
    });
  const changeLink = (toFolder: boolean) => (
    <LinkButton disabled={busy} onClick={() => goBackToSelection(toFolder)}>
      Change
    </LinkButton>
  );
  const hint = (text: string) => (
    <span className="text-muted-foreground text-xs">{text}</span>
  );

  let wizardBody: React.ReactNode = null;
  let wizardFooter: React.ReactNode = null;
  if (view === "connect") {
    wizardBody = (
      <>
        <StepIntro
          title="Connect your GitHub account"
          lead="FrontLit reads and proposes changes through a GitHub App. You'll choose the repository for your docs next."
        />
        {installationReturned && (
          <Callout tone="info" title="You're back from GitHub">
            Authorize GitHub to verify your access and load repositories. Organization
            approval may still be required.
          </Callout>
        )}
      </>
    );
    wizardFooter = (
      <>
        <span />
        <Button disabled={busy} onClick={() => void action(authorize)}>
          Connect GitHub
        </Button>
      </>
    );
  } else if (view === "repository") {
    wizardBody = (
      <>
        <StepIntro
          title="Choose a repository"
          lead="Pick the GitHub account and repository that will hold your docs."
        />
        {!repositories && <p className="text-muted-foreground text-sm">Loading…</p>}
        {repositories?.installUrl && (
          <Callout tone="info" title="No accessible installation yet">
            Install the GitHub App, or wait for organization approval, then refresh the
            list.
            <div className="mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  window.open(repositories.installUrl!, "_blank", "noopener,noreferrer")
                }
              >
                Open App installation
              </Button>
            </div>
          </Callout>
        )}
        {repositories && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="git-installation">Account</Label>
              <Select
                value={installationId}
                disabled={busy}
                onValueChange={(id) => void action(() => chooseInstallation(id))}
              >
                <SelectTrigger id="git-installation">
                  <SelectValue placeholder="Select account" />
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="git-repository">Repository</Label>
              <Select
                value={repositoryId}
                disabled={busy}
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
              <div className="flex gap-3">
                <LinkButton
                  disabled={busy}
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
                  Refresh list
                </LinkButton>
                {repositories.nextPage && (
                  <LinkButton
                    disabled={busy}
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
                    Load more
                  </LinkButton>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
    wizardFooter = (
      <>
        <span />
        <Button
          disabled={busy || !installationId || !repositoryId}
          onClick={() => setFolderStep(true)}
        >
          Continue
        </Button>
      </>
    );
  } else if (view === "folder") {
    wizardBody = (
      <>
        <StepIntro
          title="Choose where docs live"
          lead={
            <>
              FrontLit publishes from one branch and one folder in{" "}
              <b className="font-medium text-foreground">
                {repositoryName ?? "the repository"}
              </b>
              .
            </>
          }
        />
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="git-branch">Publishing branch</Label>
            <Input
              id="git-branch"
              value={branch}
              disabled={busy}
              onChange={(e) => {
                setBranch(e.target.value);
                setPreflight(null);
              }}
            />
            <p className="text-muted-foreground text-xs">
              Merged changes on this branch go live on your docs site.
            </p>
          </div>
          <ConsentRow
            checked={docsEnabled}
            disabled={busy}
            onChange={(checked) => {
              setDocsEnabled(checked);
              setPreflight(null);
            }}
          >
            Sync docs from this repository. Leave off to sync only landing pages; you
            choose the pages folder after connecting.
          </ConsentRow>
          {docsEnabled && (
            <div className="space-y-1.5">
              <Label htmlFor="git-directory">Documentation folder</Label>
              <Input
                id="git-directory"
                value={directory}
                disabled={busy}
                onChange={(e) => {
                  setDirectory(e.target.value);
                  setPreflight(null);
                }}
              />
              <p className="text-muted-foreground text-xs">
                Relative to the repository root, for example <Code>docs</Code>.
              </p>
            </div>
          )}
        </div>
      </>
    );
    wizardFooter = (
      <>
        <Button variant="ghost" disabled={busy} onClick={() => setFolderStep(false)}>
          Back
        </Button>
        <div className="flex items-center gap-2.5">
          {!hasCmsContent && docsEnabled && (
            <Button
              variant="outline"
              disabled={busy || !canReview || !canPublish}
              onClick={() => void action(() => review(true))}
            >
              Start with an empty docs folder
            </Button>
          )}
          <Button
            disabled={busy || !canReview || (hasCmsContent && !canPublish)}
            onClick={() => void action(() => review())}
          >
            {hasCmsContent && docsEnabled ? "Review setup" : "Check repository"}
          </Button>
        </div>
      </>
    );
  } else if (view === "review" && migration) {
    const files = migration.files.map((f) => f.path);
    wizardBody = (
      <>
        <StepIntro
          title="Review and open a pull request"
          lead="Nothing changes in your repository until you merge the pull request in GitHub."
        />
        <SummaryCard>
          <SummaryRow label="Repository" action={changeLink(false)}>
            <b className="font-medium">{repoLabel}</b>
            {repoBadge(migration.repositoryPrivate)}
          </SummaryRow>
          <SummaryRow label="Branch" action={changeLink(true)}>
            <Mono>{migration.selection.branch}</Mono>
          </SummaryRow>
          <SummaryRow label="Folder" action={changeLink(true)}>
            <Mono>{migration.selection.directory}/</Mono>
          </SummaryRow>
          <SummaryRow
            label="Files"
            action={
              <LinkButton
                aria-expanded={showFiles}
                onClick={() => setShowFiles((v) => !v)}
              >
                {showFiles ? "Hide" : "View"}
              </LinkButton>
            }
          >
            {fileCount} to copy
          </SummaryRow>
          {showFiles && (
            <>
              <FileList files={files} />
              {migration.nextOffset !== null && (
                <div className="border-t border-border bg-background px-4 py-2 text-center">
                  <LinkButton
                    disabled={busy}
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
                    Show next files
                  </LinkButton>
                </div>
              )}
            </>
          )}
        </SummaryCard>
        {isEmptyRepo && (
          <Callout tone="warning" title="This repository is empty">
            A pull request needs a base branch, so FrontLit first adds an empty{" "}
            <Code>{migration.selection.directory}/.gitkeep</Code> to{" "}
            <Code>{migration.selection.branch}</Code>. Your docs only reach{" "}
            <Code>{migration.selection.branch}</Code> when you merge.
          </Callout>
        )}
        {draftCount > 0 && (
          <Callout
            tone="warning"
            title={`${draftCount} unpublished draft${draftCount === 1 ? "" : "s"} included`}
          >
            Drafts are copied as unpublished text.{" "}
            {migration.repositoryPrivate
              ? "Anyone with access to this repository can read them."
              : "Anyone can read them in this public repository."}
          </Callout>
        )}
        <div>
          <span className="mb-3 block font-semibold text-[13px]">
            What happens next
          </span>
          <Timeline items={timeline("review")} />
        </div>
        <ConsentRow
          checked={acknowledgeSetupPr}
          onChange={setAcknowledgeSetupPr}
          disabled={busy}
        >
          {isEmptyRepo
            ? `I approve adding ${migration.selection.directory}/.gitkeep to ${migration.selection.branch} and opening a pull request with these ${fileCount} files.`
            : `I approve opening a pull request with these ${fileCount} files.`}
          {draftCount > 0 && " This includes the unpublished drafts above."}
        </ConsentRow>
        {migration.pullRequest?.diagnostic && (
          <Callout tone="danger" title="The last attempt failed">
            {migration.pullRequest.diagnostic}. Reauthorize GitHub if access expired,
            then try again.
          </Callout>
        )}
      </>
    );
    wizardFooter = (
      <>
        <Button variant="ghost" disabled={busy} onClick={() => goBackToSelection(true)}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {!acknowledgeSetupPr && !busy && hint("Tick the box above to continue")}
          {noGitHub ? (
            reconnectButton
          ) : (
            <Button
              disabled={
                busy ||
                !canPublish ||
                !acknowledgeSetupPr ||
                ["canceled", "expired", "activated"].includes(migration.status)
              }
              onClick={() => void action(createSetupPr)}
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Opening pull request…
                </>
              ) : migration.pullRequest ? (
                "Retry pull request"
              ) : (
                "Create pull request"
              )}
            </Button>
          )}
        </div>
      </>
    );
  } else if (view === "creating" && migration) {
    wizardBody = (
      <>
        <StepIntro
          title="Opening your pull request"
          lead="FrontLit is copying the reviewed files to a new branch. This usually takes a few seconds."
        />
        <Timeline items={timeline("creating")} />
        {technicalDetails}
      </>
    );
    wizardFooter = (
      <>
        {hint("You can close this. We'll keep going in the background.")}
        {closeButton}
      </>
    );
  } else if (view === "pr" && migration) {
    wizardBody = (
      <>
        <StatusBanner>Pull request opened</StatusBanner>
        <StepIntro
          title="Merge it in GitHub to finish"
          lead={`Review the ${fileCount} files and merge when you're happy. FrontLit picks up the merge on its own, so you can close this window.`}
        />
        <div className="flex items-center gap-3.5 rounded-[0.625rem] border border-border p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[0.625rem] bg-[var(--success-soft)] text-[var(--success)]">
            <GitPullRequest className="size-[18px]" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
            <b className="font-semibold">Add FrontLit documentation</b>
            <span className="truncate font-mono text-muted-foreground text-xs">
              {repoLabel}
              {migration.pullRequest?.pullRequestNumber
                ? ` · #${migration.pullRequest.pullRequestNumber}`
                : ""}{" "}
              · {fileCount} files
            </span>
          </span>
          {migration.pullRequest?.pullRequestUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                window.open(
                  migration.pullRequest!.pullRequestUrl!,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Open in GitHub
              <ExternalLink className="size-4" />
            </Button>
          )}
        </div>
        {migration.pullRequest?.diagnostic && (
          <Callout tone="danger" title="GitHub reported a problem">
            {migration.pullRequest.diagnostic}. Reauthorize GitHub if access expired,
            then retry.
          </Callout>
        )}
        <Timeline items={timeline("pr")} />
        {technicalDetails}
      </>
    );
    wizardFooter = (
      <>
        {hint("You can close this. FrontLit keeps checking for the merge.")}
        <div className="flex items-center gap-2.5">
          {closeButton}
          <Button
            disabled={busy}
            onClick={() =>
              void action(async () =>
                setMigration(await getDocumentationGitMigration(migration.planId)),
              )
            }
          >
            I&apos;ve merged it
          </Button>
        </div>
      </>
    );
  } else if (view === "checking" && migration) {
    wizardBody = (
      <>
        <StepIntro
          title="Checking your merged setup"
          lead="FrontLit checks the merged files automatically."
        />
        {noGitHub && (
          <Callout tone="info" title="Reconnect GitHub to continue">
            Your pull request and reviewed files are saved. Reconnect to confirm your
            access.
          </Callout>
        )}
        <Timeline items={timeline("checking")} />
        {technicalDetails}
      </>
    );
    wizardFooter = (
      <>
        <span />
        <div className="flex items-center gap-2.5">
          {closeButton}
          {noGitHub && reconnectButton}
        </div>
      </>
    );
  } else if (view === "fix" && migration) {
    wizardBody = (
      <>
        <StepIntro
          title="Your setup needs a correction"
          lead="Fix the reported files in GitHub so they match your reviewed setup, then check them again."
        />
        {technicalDetails}
      </>
    );
    wizardFooter = (
      <>
        {closeButton}
        <Button
          disabled={busy || !canPublish || !setupId}
          onClick={() => void action(verify)}
        >
          Check files again
        </Button>
      </>
    );
  } else if (view === "finish" && migration) {
    wizardBody = (
      <>
        <StatusBanner>Files checked</StatusBanner>
        <StepIntro
          title="One last step"
          lead="Your pull request is merged and its files check out. Choose how this repository manages your docs. Existing docs and URLs are kept."
        />
        {consentRows}
        {noGitHub && (
          <Callout tone="info" title="Reconnect GitHub to finish">
            Your merged PR and checked files are saved. Reconnect to confirm your
            access.
          </Callout>
        )}
      </>
    );
    wizardFooter = (
      <>
        {closeButton}
        {noGitHub ? (
          reconnectButton
        ) : (
          <Button
            disabled={busy || !canPublish || !consents.every(Boolean)}
            onClick={() => void action(activate)}
          >
            {busy ? "Connecting…" : "Finish setup"}
          </Button>
        )}
      </>
    );
  } else if (view === "closed" && migration) {
    wizardBody = (
      <>
        <StepIntro
          title="Your setup PR was closed without merging"
          lead="Your existing docs are unchanged. Cancel this setup to start again."
        />
        {technicalDetails}
      </>
    );
    wizardFooter = (
      <>
        {closeButton}
        <Button disabled={busy} onClick={() => void action(cancelSetup)}>
          Cancel setup
        </Button>
      </>
    );
  } else if (view === "stopped" && migration) {
    wizardBody = (
      <>
        <StepIntro
          title="Setup stopped"
          lead="Your existing docs are unchanged. Any branch or pull request already created remains in GitHub."
        />
        {migration.pullRequest &&
          (migration.pullRequest.commitSha ||
            migration.pullRequest.pullRequestNumber) && (
            <Callout tone="info" title="Created in GitHub before setup stopped">
              {migration.pullRequest.pullRequestNumber
                ? `Setup PR #${migration.pullRequest.pullRequestNumber}, `
                : ""}
              commit{" "}
              <Code>{migration.pullRequest.commitSha?.slice(0, 7) ?? "unknown"}</Code>{" "}
              and possibly branch <Code>{migration.pullRequest.branch}</Code>. Delete
              them in GitHub if you no longer need them.
            </Callout>
          )}
      </>
    );
    wizardFooter = (
      <>
        {closeButton}
        <Button
          disabled={busy}
          onClick={() => {
            clearSetup();
            setFolderStep(true);
          }}
        >
          Start a new setup
        </Button>
      </>
    );
  } else if (view === "preflight" && preflight?.publishable) {
    wizardBody = (
      <>
        <StepIntro
          title="Review your repository's docs"
          lead={
            preflight.repositoryPrivate
              ? "Published docs found in this folder become public on your docs site."
              : "This repository is public, and published docs in this folder become public on your docs site."
          }
        />
        <SummaryCard>
          <SummaryRow label="Repository" action={null}>
            <b className="font-medium">{repositoryName ?? "Selected repository"}</b>
            {repoBadge(preflight.repositoryPrivate)}
          </SummaryRow>
          <SummaryRow label="Branch" action={null}>
            <Mono>{preflight.branch}</Mono>
          </SummaryRow>
          {docsEnabled ? (
            <>
              <SummaryRow label="Folder" action={null}>
                <Mono>{preflight.directory}/</Mono>
              </SummaryRow>
              <SummaryRow label="Docs" action={null}>
                {preflight.publishedCount} public of {preflight.fileCount} files
              </SummaryRow>
            </>
          ) : (
            <SummaryRow label="Docs" action={null}>
              Stay in FrontLit. Turn on pages after connecting.
            </SummaryRow>
          )}
          <SummaryRow label="Commit" action={null}>
            <Mono>{preflight.commitSha.slice(0, 7)}</Mono>
          </SummaryRow>
        </SummaryCard>
        {preflight.excludedFiles.length > 0 && (
          <p className="text-muted-foreground text-sm">
            {preflight.excludedFiles.length} file
            {preflight.excludedFiles.length === 1 ? " is" : "s are"} excluded from
            public publication.
          </p>
        )}
        <Disclosure label="Pages that will go live">
          <ul className="space-y-1">
            {preflight.routes.map((r) => (
              <li key={r.path} className="font-mono">
                {r.path} → /docs/{r.route}
              </li>
            ))}
          </ul>
        </Disclosure>
        {consentRows}
      </>
    );
    wizardFooter = (
      <>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setPreflight(null);
            setConsents([false]);
          }}
        >
          Back
        </Button>
        <Button
          disabled={busy || !canPublish || !consents.every(Boolean)}
          onClick={() => void action(activate)}
        >
          {busy ? "Connecting…" : "Finish setup"}
        </Button>
      </>
    );
  } else if (view === "done" && connectedInfo) {
    wizardBody = (
      <>
        <div className="flex flex-col items-center gap-3 px-2 pt-4 pb-2 text-center">
          <span className="grid size-16 place-items-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
            <Check className="size-[30px]" strokeWidth={2.4} />
          </span>
          <h3 className="font-semibold text-lg">Documentation connected</h3>
          <p className="max-w-[440px] text-muted-foreground text-sm">
            FrontLit now publishes your docs from{" "}
            <Mono>{connectedInfo.directory}/</Mono> on{" "}
            <Mono>{connectedInfo.branch}</Mono> in {connectedInfo.repository}. Merge
            changes there and they show up on your site.
          </p>
        </div>
        <SummaryCard>
          <SummaryRow label="Repository">
            <b className="font-medium">{connectedInfo.repository}</b>
          </SummaryRow>
          <SummaryRow label="Source">
            <Mono>
              {connectedInfo.branch} · {connectedInfo.directory}/
            </Mono>
          </SummaryRow>
        </SummaryCard>
      </>
    );
    wizardFooter = (
      <>
        <span />
        <Button onClick={() => setOpen(false)}>Done</Button>
      </>
    );
  }
  const refreshSource = async () => setSource(await getDocumentationGitSource());
  const manage =
    !wizardMode && source?.binding
      ? ManageSource({
          source,
          binding: source.binding,
          busy,
          canPublish,
          grantReview: Boolean(grantReview),
          setupId,
          writeConsents,
          onWriteConsentsChange: setWriteConsents,
          onRefresh: () => void action(load),
          onReviewWrites: () => void action(reviewWrites),
          onConfirmGrant: () =>
            void action(async () => {
              if (!grantReview) return;
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
              await refreshSource();
              await onChanged();
            }),
          onCancelReview: () => {
            sessionStorage.removeItem(upgradeStorageKey);
            setGrantReview(null);
            setSetupId("");
            sessionStorage.removeItem(setupStorageKey);
          },
          onSync: () =>
            void action(async () => {
              await changeDocumentationGitState("sync");
              await refreshSource();
            }),
          onPause: () =>
            void action(async () => {
              await changeDocumentationGitState("pause");
              await refreshSource();
            }),
          onResume: () =>
            void action(async () => {
              await changeDocumentationGitState("resume");
              await refreshSource();
            }),
          onDisconnect: () =>
            void action(async () => {
              await changeDocumentationGitState("disconnect");
              await refreshSource();
            }),
          onReconnect: () => void action(authorize),
        })
      : null;
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
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[600px]">
          {wizardMode ? (
            <WizardShell
              current={wizardCurrent}
              finished={view === "done"}
              header={
                <DialogHeader>
                  <DialogTitle>Connect documentation source</DialogTitle>
                  <DialogDescription>
                    Sync docs from GitHub. Your live docs stay up the whole time.
                  </DialogDescription>
                </DialogHeader>
              }
              footer={wizardFooter}
            >
              {error && (
                <Callout tone="danger" title="Something went wrong">
                  {error}
                </Callout>
              )}
              {diagnostics.length > 0 && view !== "done" && (
                <Callout tone="danger" title="This setup can't continue yet">
                  <ul className="mt-1 space-y-1">
                    {diagnostics.map((d, i) => (
                      <li key={i}>
                        {d.file ? `${d.file}: ` : ""}
                        {d.message}
                      </li>
                    ))}
                  </ul>
                </Callout>
              )}
              {wizardBody}
            </WizardShell>
          ) : (
            <ManageShell
              icon={<Github />}
              header={
                <DialogHeader>
                  <DialogTitle>
                    {source?.binding ? "GitHub repository" : "Documentation source"}
                  </DialogTitle>
                  <DialogDescription>
                    {source?.binding
                      ? "Docs and pages sync from GitHub. If a sync fails, readers keep seeing the last good version."
                      : "Manage docs here, or connect GitHub to review changes through pull requests."}
                  </DialogDescription>
                </DialogHeader>
              }
              footer={manage?.footer ?? closeButton}
            >
              {error && (
                <Callout tone="danger" title="Something went wrong">
                  {error}
                </Callout>
              )}
              {installationReturned && (
                <Callout tone="info" title="Returned from GitHub">
                  Authorize GitHub to verify your access and load repositories.
                  Organization approval may still be required.
                </Callout>
              )}
              {busy && !source && (
                <p role="status" className="text-muted-foreground text-sm">
                  Loading…
                </p>
              )}
              {manage?.body}
              {source && !source.configured && (
                <Callout tone="info" title="GitHub isn't set up on this server">
                  The documentation GitHub App must be configured by the operator before
                  setup.
                </Callout>
              )}
            </ManageShell>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
