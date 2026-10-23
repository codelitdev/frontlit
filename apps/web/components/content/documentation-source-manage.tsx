"use client";

import type { ReactNode } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Pause,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/codelit/badge";
import { Button } from "@/components/ui/codelit/button";
import {
  Callout,
  ConsentRow,
  Disclosure,
  Mono,
  StepIntro,
  SummaryCard,
  SummaryRow,
} from "@/components/content/documentation-connect-parts";
import type { DocumentationGitSource } from "@/lib/api";
import { PagesSourceSection } from "@/components/content/pages-source-section";
import { cn } from "@/lib/utils";

type Binding = NonNullable<DocumentationGitSource["binding"]>;

function ago(iso: string | null) {
  if (!iso) return null;
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : null);

/** Dialog chrome for managing a connected source: icon header, scrolling body, footer. */
export function ManageShell({
  icon,
  header,
  footer,
  children,
}: {
  icon: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex max-h-[85vh] flex-col">
      <header className="flex items-start gap-3.5 border-b border-border px-6 pt-5 pb-4 pr-14">
        <span className="grid size-10 shrink-0 place-items-center rounded-[0.625rem] bg-[var(--primary-soft)] text-primary [&>svg]:size-5">
          {icon}
        </span>
        <div className="min-w-0">{header}</div>
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-y-auto px-6 py-5">
        {children}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
        {footer}
      </footer>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h3 className="-mb-2.5 font-medium text-muted-foreground text-[13px]">
      {children}
    </h3>
  );
}

type Health = {
  tone: "success" | "info" | "warning" | "danger";
  title: string;
  body: string;
};

function health(source: DocumentationGitSource, binding: Binding): Health {
  if (source.status === "access_lost")
    return {
      tone: "danger",
      title: "Access lost",
      body: "FrontLit can no longer read the repository. Your site keeps showing the last good version.",
    };
  if (source.status === "disconnected")
    return {
      tone: "danger",
      title: "Disconnected",
      body: "Sync is off. Your site keeps showing the last good version.",
    };
  if (source.status === "paused")
    return {
      tone: "warning",
      title: "Sync paused",
      body: "New commits aren't being picked up. Your site keeps showing the last good version.",
    };
  if (source.sync?.status === "failed" || binding.lastDiagnostic)
    return {
      tone: "warning",
      title: "Latest sync didn't go live",
      body: "Your site keeps showing the last good version. Fix the problem in GitHub and sync again.",
    };
  if (
    source.sync?.status === "queued" ||
    source.sync?.status === "running" ||
    binding.observedSha !== binding.liveSha
  )
    return {
      tone: "info",
      title: "Syncing",
      body: `Checking the newest commit on ${binding.branch}. Your site still shows the previous version.`,
    };
  return {
    tone: "success",
    title: "In sync",
    body: `Your site shows the latest commit on ${binding.branch}.`,
  };
}

function HealthBanner({
  state,
  checked,
  onRefresh,
  busy,
}: {
  state: Health;
  checked: string | null;
  onRefresh: () => void;
  busy: boolean;
}) {
  const Icon =
    state.tone === "success"
      ? Check
      : state.tone === "info"
        ? Loader2
        : state.tone === "warning" && state.title === "Sync paused"
          ? Pause
          : TriangleAlert;
  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-[0.625rem] px-4 py-4",
        state.tone === "success" && "bg-[var(--success-soft)]",
        state.tone === "info" && "bg-[var(--primary-soft)]",
        state.tone === "warning" && "bg-[var(--warning-soft)]",
        state.tone === "danger" && "bg-[var(--destructive-soft)]",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full bg-card",
          state.tone === "success" && "text-[var(--success)]",
          state.tone === "info" && "text-primary",
          state.tone === "warning" && "text-[var(--warning)]",
          state.tone === "danger" && "text-destructive",
        )}
      >
        <Icon className={cn("size-4", state.tone === "info" && "animate-spin")} />
      </span>
      <div className="min-w-0 text-sm">
        <b className="block font-semibold">{state.title}</b>
        <p className="mt-0.5">{state.body}</p>
        <p className="mt-1.5 flex items-center gap-3 text-muted-foreground text-xs">
          {checked && <span>Checked {checked}</span>}
          <button
            type="button"
            disabled={busy}
            onClick={onRefresh}
            className="font-semibold text-primary hover:underline disabled:opacity-50"
          >
            Refresh
          </button>
        </p>
      </div>
    </div>
  );
}

function ProgressCell({
  label,
  sha,
  note,
}: {
  label: string;
  sha: string | null;
  note: string;
}) {
  return (
    <div className="space-y-1 px-4 py-3 text-xs">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className={cn(
            "size-1.5 rounded-full",
            sha ? "bg-[var(--success)]" : "bg-muted-foreground/40",
          )}
        />
        {label}
      </p>
      <Mono>{short(sha) ?? "—"}</Mono>
      <p className="text-muted-foreground leading-snug">{note}</p>
    </div>
  );
}

export function ManageSource({
  source,
  binding,
  busy,
  canPublish,
  grantReview,
  setupId,
  writeConsents,
  onWriteConsentsChange,
  onRefresh,
  onReviewWrites,
  onConfirmGrant,
  onCancelReview,
  onSync,
  onPause,
  onResume,
  onDisconnect,
  onReconnect,
}: {
  source: DocumentationGitSource;
  binding: Binding;
  busy: boolean;
  canPublish: boolean;
  grantReview: boolean;
  setupId: string;
  writeConsents: boolean[];
  onWriteConsentsChange: (next: boolean[]) => void;
  onRefresh: () => void;
  onReviewWrites: () => void;
  onConfirmGrant: () => void;
  onCancelReview: () => void;
  onSync: () => void;
  onPause: () => void;
  onResume: () => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}): { body: ReactNode; footer: ReactNode } {
  const repo = `${binding.owner}/${binding.repository}`;
  const caps = binding.capabilities;

  if (grantReview) {
    return {
      body: (
        <>
          <StepIntro
            title="Review write access"
            lead={
              <>
                Choose what workspace publishers can do in <Mono>{repo}</Mono> (
                <Mono>{binding.branch}</Mono>
                {binding.docsEnabled && (
                  <>
                    , <Mono>{binding.directory}/</Mono>
                  </>
                )}
                ). App permission on GitHub alone doesn&apos;t grant this.
              </>
            }
          />
          <div className="space-y-3">
            {[
              "Allow workspace publishers to open pull requests",
              "Allow workspace publishers to commit directly to the publishing branch",
            ].map((label, i) => (
              <ConsentRow
                key={label}
                checked={writeConsents[i]}
                disabled={busy || !canPublish || !setupId}
                onChange={(checked) =>
                  onWriteConsentsChange(
                    writeConsents.map((v, j) => (j === i ? checked : v)),
                  )
                }
              >
                {label}
              </ConsentRow>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">
            Pull requests still need review in GitHub; direct commits still pass
            validation before going live. Leave both unchecked to remove write access.
            Existing pull requests are kept.
          </p>
        </>
      ),
      footer: (
        <>
          <Button variant="outline" disabled={busy} onClick={onCancelReview}>
            Cancel
          </Button>
          <Button disabled={busy || !canPublish || !setupId} onClick={onConfirmGrant}>
            Confirm write access
          </Button>
        </>
      ),
    };
  }

  const state = health(source, binding);
  const edits = caps.proposals || caps.directCommit;
  // What the builder or docs editor sends to GitHub for this connection.
  const synced =
    [binding.docsEnabled && "docs", binding.pagesDirectory && "pages"]
      .filter(Boolean)
      .join(" and ") || "content";
  const body = (
    <>
      <HealthBanner
        state={state}
        checked={ago(binding.lastSuccessfulSyncAt)}
        onRefresh={onRefresh}
        busy={busy}
      />
      {(binding.lastDiagnostic || source.sync?.diagnostic) && (
        <Callout tone="warning" title="What went wrong">
          {binding.lastDiagnostic ?? source.sync?.diagnostic}
        </Callout>
      )}
      {binding.lastPrReconcileError && (
        <Callout tone="warning" title="Pull request checks couldn't refresh">
          {binding.lastPrReconcileError}. This doesn&apos;t affect what&apos;s
          published.
        </Callout>
      )}
      <SectionLabel>Repository</SectionLabel>
      <SummaryCard>
        <SummaryRow
          label="Repository"
          action={
            <a
              href={`https://github.com/${repo}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-[13px] text-primary hover:underline"
            >
              Open in GitHub
              <ExternalLink className="size-3.5" />
            </a>
          }
        >
          <b className="font-medium">{repo}</b>
          <Badge variant="neutral">{binding.private ? "Private" : "Public"}</Badge>
        </SummaryRow>
        <SummaryRow label="Branch">
          <Mono>{binding.branch}</Mono>
        </SummaryRow>
        <SummaryRow label="Site folder">
          <Mono>{binding.root ? `${binding.root}/` : "Repository root"}</Mono>
        </SummaryRow>
        <SummaryRow label="Docs folder">
          {binding.docsEnabled ? (
            <Mono>{binding.directory ? `${binding.directory}/` : "/"}</Mono>
          ) : (
            <span className="text-muted-foreground">Not synced</span>
          )}
        </SummaryRow>
      </SummaryCard>
      <SectionLabel>Pages</SectionLabel>
      <PagesSourceSection
        binding={binding}
        canManage={source.status === "connected"}
        onChanged={onRefresh}
      />
      <SectionLabel>Sync progress</SectionLabel>
      <div className="grid grid-cols-1 divide-y overflow-clip rounded-[0.625rem] border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <ProgressCell
          label="Latest on GitHub"
          sha={binding.observedSha}
          note="Newest commit FrontLit has seen"
        />
        <ProgressCell
          label="Checked"
          sha={binding.validatedSha}
          note="Passed format and link checks"
        />
        <ProgressCell
          label="Live"
          sha={binding.liveSha}
          note="What your site shows now"
        />
      </div>
      <SectionLabel>Changes made in FrontLit</SectionLabel>
      <div className="flex items-start gap-3.5 rounded-[0.625rem] border border-border px-4 py-3.5 text-sm">
        <Pencil className="mt-0.5 size-[18px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-medium">
              {edits ? "Sent to GitHub" : "Not sent to GitHub"}
            </b>
            <Badge variant={caps.proposals ? "success" : "neutral"}>
              Pull requests {caps.proposals ? "on" : "off"}
            </Badge>
            <Badge variant={caps.directCommit ? "success" : "neutral"}>
              Direct commits {caps.directCommit ? "on" : "off"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            {edits
              ? `Edits to your ${synced} in FrontLit are sent to GitHub, so your repository stays the source of truth.`
              : `Edit your ${synced} in GitHub. To let FrontLit open pull requests with edits, grant write access.`}
          </p>
        </div>
        {(source.status === "connected" || source.status === "paused") &&
          canPublish && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={onReviewWrites}
            >
              Review access
            </Button>
          )}
      </div>
      <Disclosure label="Technical details">
        <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">Connection</dt>
          <dd>{source.status.replaceAll("_", " ")}</dd>
          <dt className="text-muted-foreground">Latest on GitHub</dt>
          <dd className="break-all font-mono">{binding.observedSha ?? "—"}</dd>
          <dt className="text-muted-foreground">Checked</dt>
          <dd className="break-all font-mono">{binding.validatedSha ?? "—"}</dd>
          <dt className="text-muted-foreground">Live</dt>
          <dd className="break-all font-mono">{binding.liveSha ?? "—"}</dd>
          {source.sync && (
            <>
              <dt className="text-muted-foreground">Last sync run</dt>
              <dd>
                {source.sync.status}
                {source.sync.commitSha ? ` · ${short(source.sync.commitSha)}` : ""}
              </dd>
              <dt className="text-muted-foreground">Publication</dt>
              <dd className="break-all font-mono">
                {source.sync.publicationId ?? "—"}
              </dd>
            </>
          )}
        </dl>
      </Disclosure>
    </>
  );
  const footer = (
    <>
      {source.status !== "disconnected" ? (
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      ) : (
        <span />
      )}
      <span className="flex gap-2">
        {source.status === "connected" && (
          <>
            <Button variant="outline" disabled={busy} onClick={onPause}>
              Pause sync
            </Button>
            <Button disabled={busy} onClick={onSync}>
              Sync now
            </Button>
          </>
        )}
        {source.status === "paused" && (
          <Button disabled={busy} onClick={onResume}>
            Resume sync
          </Button>
        )}
        {(source.status === "access_lost" || source.status === "disconnected") && (
          <Button disabled={busy} onClick={onReconnect}>
            Reconnect GitHub
          </Button>
        )}
      </span>
    </>
  );
  return { body, footer };
}
