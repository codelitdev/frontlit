"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { FileX2, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/codelit/button";
import { IconButton } from "@/components/ui/codelit/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/codelit/tooltip";
import {
  DocumentStatusBadge,
  type DocumentStatus,
} from "@/components/workspace/document-status-badge";
import { DocumentIndexBadge } from "@/components/workspace/document-index-badge";
import type { DocumentationIndex } from "@/lib/api";
import { formatSavedAt } from "@/lib/writing-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WritingEditorShellProps {
  backHref: string;
  backLabel: string;
  contextLabel?: string;
  title: string;
  status: DocumentStatus;
  statusTestId?: string;
  index?: DocumentationIndex | null;
  updatedAt?: string | null;
  saving: boolean;
  saveError?: boolean;
  publishing: boolean;
  publishingLabel?: string;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  onPublish: () => void;
  canPublish?: boolean;
  publishBlockedReason?: string;
  publishAction?: ReactNode;
  headerActions?: ReactNode;
  onDiscardDraft: () => void;
  discardDescription: string;
  actions?: ReactNode;
  settings: ReactNode;
  children: ReactNode;
}

export function WritingEditorShell({
  backHref,
  backLabel,
  contextLabel,
  title,
  status,
  statusTestId,
  index,
  updatedAt,
  saving,
  saveError = false,
  publishing,
  publishingLabel = "Publishing…",
  settingsOpen,
  onSettingsOpenChange,
  onPublish,
  canPublish = true,
  publishBlockedReason,
  publishAction,
  headerActions,
  onDiscardDraft,
  discardDescription,
  settings,
  actions,
  children,
}: WritingEditorShellProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const hasDraftChanges = status !== "published";

  return (
    <div className="flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link
            href={backHref}
            className="shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {backLabel}
          </Link>
          <span aria-hidden className="h-7 w-px bg-border" />
          {contextLabel && (
            <>
              <span className="hidden shrink-0 text-sm text-muted-foreground md:inline">
                {contextLabel}
              </span>
              <span
                aria-hidden
                className="hidden text-sm text-muted-foreground md:inline"
              >
                /
              </span>
            </>
          )}
          <span className="truncate text-sm font-semibold">{title}</span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <DocumentStatusBadge status={status} data-testid={statusTestId} />
          <DocumentIndexBadge index={index} />
          <span
            className="hidden min-w-24 text-right text-xs text-muted-foreground lg:inline"
            aria-live="polite"
          >
            {saveError
              ? "Save failed"
              : saving
                ? "Saving…"
                : now === null
                  ? "Saved"
                  : formatSavedAt(updatedAt, now)}
          </span>
          {headerActions}
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <AlertDialogTrigger asChild>
                    <IconButton
                      type="button"
                      size="sm"
                      aria-label="Discard draft"
                      disabled={publishing || saving || !hasDraftChanges}
                    >
                      <FileX2 />
                    </IconButton>
                  </AlertDialogTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {hasDraftChanges ? "Discard draft" : "No draft changes to discard"}
              </TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Discard draft?</AlertDialogTitle>
                <AlertDialogDescription>{discardDescription}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onDiscardDraft}>Discard</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {publishAction ?? (
            <Button
              size="sm"
              onClick={onPublish}
              disabled={
                !canPublish ||
                Boolean(publishBlockedReason) ||
                publishing ||
                saving ||
                !hasDraftChanges
              }
              title={
                !canPublish
                  ? "Documentation publish permission is required."
                  : publishBlockedReason
              }
              data-testid="publish-button"
            >
              {publishing ? publishingLabel : "Publish changes"}
            </Button>
          )}
          <span aria-hidden className="hidden h-7 w-px bg-border sm:block" />
          <Tooltip>
            <TooltipTrigger asChild>
              <IconButton
                type="button"
                size="sm"
                aria-label={
                  settingsOpen ? "Close document settings" : "Open document settings"
                }
                onClick={() => onSettingsOpenChange(!settingsOpen)}
                className={settingsOpen ? "bg-muted text-foreground" : undefined}
              >
                <Settings2 />
              </IconButton>
            </TooltipTrigger>
            <TooltipContent>
              {settingsOpen ? "Close document settings" : "Open document settings"}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
      {actions && <div className="shrink-0 border-b bg-card px-4 py-2">{actions}</div>}

      <div className="relative flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
        {settingsOpen && (
          <>
            <button
              type="button"
              aria-label="Close document settings"
              className="absolute inset-0 z-20 bg-foreground/10 md:hidden"
              onClick={() => onSettingsOpenChange(false)}
            />
            <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(20rem,calc(100vw-2rem))] flex-col border-l bg-card shadow-xl md:relative md:z-auto md:w-80 md:shadow-none">
              <div className="flex h-14 shrink-0 items-center justify-between border-b px-5">
                <h2 className="font-semibold">Document settings</h2>
                <IconButton
                  type="button"
                  size="sm"
                  aria-label="Close document settings"
                  onClick={() => onSettingsOpenChange(false)}
                >
                  <X />
                </IconButton>
              </div>
              <div className="flex-1 overflow-y-auto p-5">{settings}</div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
