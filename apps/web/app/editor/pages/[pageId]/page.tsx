"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { PageBuilder, type PageBuilderState } from "@frontlit/page-builder/builder";
import type { Theme as BuilderTheme } from "@frontlit/page-builder/models";
import { toast } from "sonner";
import {
  createPagePullRequest,
  createTheme,
  discardPageDraft,
  getPage,
  getTeamSettings,
  getTheme,
  listThemes,
  publishPage,
  updatePage,
  updateTeamSettings,
  updateTheme,
  type Page,
} from "@/lib/api";
import {
  persistCustomThemes,
  resolveEditorTheme,
  themeSnapshot,
} from "@/lib/page-theme";
import { EditorToolbar, type SaveState } from "@/components/workspace/editor-toolbar";
import { FullScreenLoading } from "@/components/workspace/loading";
import { SlugEditor } from "@/components/workspace/slug-editor";
import { useEditorAccess } from "@/components/workspace/editor-access-gate";
import { ApiError } from "@/lib/api-client";
import { toSiteBranding, type SiteBranding } from "@frontlit/api-contract";

export default function PageEditorPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = use(params);
  const { currentTeam } = useEditorAccess();
  const [page, setPage] = useState<Page | null>(null);
  const [initialTheme, setInitialTheme] = useState<BuilderTheme | undefined>(undefined);
  const [customThemes, setCustomThemes] = useState<BuilderTheme[] | null>(null);
  const [branding, setBranding] = useState<SiteBranding>(toSiteBranding(null));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [publishing, setPublishing] = useState(false);
  // Bumped only when the draft is reset from outside the builder (discard),
  // forcing a remount so the (otherwise uncontrolled) builder re-reads the
  // fresh draft fields instead of showing stale, already-discarded edits.
  const [resetKey, setResetKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const themeAliasesRef = useRef(new Map<string, string>());
  const knownThemeIdsRef = useRef(new Set<string>());
  const themeSnapshotsRef = useRef(new Map<string, string>());
  const appliedSiteThemeIdRef = useRef<string | null>(null);
  const appliedSiteThemeSnapshotRef = useRef<string | null>(null);
  const canReadSettings = useMemo(
    () =>
      currentTeam.isOwner || currentTeam.effectivePermissions.includes("settings:read"),
    [currentTeam],
  );
  const canWriteSettings = useMemo(
    () =>
      currentTeam.isOwner ||
      currentTeam.effectivePermissions.includes("settings:write"),
    [currentTeam],
  );
  const canReadThemes = useMemo(
    () =>
      currentTeam.isOwner || currentTeam.effectivePermissions.includes("themes:read"),
    [currentTeam],
  );
  const canWriteThemes = useMemo(
    () =>
      currentTeam.isOwner || currentTeam.effectivePermissions.includes("themes:write"),
    [currentTeam],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getPage(pageId),
      canReadThemes ? listThemes() : Promise.resolve({ items: [] }),
      canReadSettings ? getTeamSettings() : Promise.resolve(null),
    ])
      .then(async ([loaded, savedThemes, siteSettings]) => {
        if (cancelled) return;
        const mappedThemes = savedThemes.items.map(
          (theme): BuilderTheme => ({
            id: theme.themeId,
            name: theme.name,
            theme: theme.style as unknown as BuilderTheme["theme"],
          }),
        );

        knownThemeIdsRef.current = new Set(mappedThemes.map((theme) => theme.id));
        themeAliasesRef.current = new Map();
        themeSnapshotsRef.current = new Map(
          mappedThemes.map((theme) => [theme.id, themeSnapshot(theme)]),
        );
        const resolvedTheme = await resolveEditorTheme(
          canReadSettings && canReadThemes
            ? (siteSettings?.themeId ?? "classic")
            : "classic",
          async (themeId) => {
            const loadedTheme = savedThemes.items.find(
              (theme) => theme.themeId === themeId,
            );
            if (loadedTheme) return loadedTheme;
            if (!canReadThemes) {
              throw new Error("Theme is not available");
            }
            return getTheme(themeId);
          },
        );
        appliedSiteThemeIdRef.current =
          canReadSettings && canReadThemes
            ? (siteSettings?.themeId ?? "classic")
            : "classic";
        appliedSiteThemeSnapshotRef.current = resolvedTheme
          ? themeSnapshot(resolvedTheme)
          : null;
        setInitialTheme(resolvedTheme);
        setCustomThemes(mappedThemes);
        setBranding(toSiteBranding(siteSettings));
        setPage(loaded);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "Could not load this page editor.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canReadSettings, canReadThemes, pageId]);

  async function handleChange(state: PageBuilderState) {
    setSaveState("saving");
    try {
      if (canWriteThemes) {
        await persistCustomThemes(state.customThemes, {
          aliases: themeAliasesRef.current,
          knownIds: knownThemeIdsRef.current,
          snapshots: themeSnapshotsRef.current,
          create: createTheme,
          update: updateTheme,
        });
      }
      const updated = await updatePage(pageId, {
        layout: state.layout,
        title: state.seo.title,
        description: state.seo.description,
        socialImage: state.seo.socialImage as unknown as
          | Record<string, unknown>
          | undefined,
        robotsAllowed: state.seo.robotsAllowed,
      });
      const siteThemeId = themeAliasesRef.current.get(state.theme.id) ?? state.theme.id;
      const selectedThemeSnapshot = themeSnapshot(state.theme);
      if (
        canWriteSettings &&
        (appliedSiteThemeIdRef.current !== siteThemeId ||
          appliedSiteThemeSnapshotRef.current !== selectedThemeSnapshot)
      ) {
        await updateTeamSettings({ themeId: siteThemeId });
        appliedSiteThemeIdRef.current = siteThemeId;
        appliedSiteThemeSnapshotRef.current = selectedThemeSnapshot;
      }
      setPage(updated);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      if (page?.git) {
        // Git-owned: the draft goes live when its pull request is merged.
        const pr = await createPagePullRequest(pageId);
        toast.success(`Opened pull request #${pr.number}`, {
          action: { label: "View", onClick: () => window.open(pr.url, "_blank") },
        });
        setPage(await getPage(pageId));
      } else {
        setPage(await publishPage(pageId));
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    } finally {
      setPublishing(false);
    }
  }

  async function handleDiscardDraft() {
    setPublishing(true);
    try {
      setPage(await discardPageDraft(pageId));
      setResetKey((key) => key + 1);
    } finally {
      setPublishing(false);
    }
  }

  async function handleSlugSave(slug: string) {
    const updated = await updatePage(pageId, { slug });
    setPage(updated);
    return updated.slug;
  }

  if (!page || customThemes === null) {
    if (loadError) {
      return (
        <main className="grid min-h-dvh place-items-center p-6 text-center">
          <div>
            <h1 className="text-xl font-semibold">Page editor unavailable</h1>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          </div>
        </main>
      );
    }
    return <FullScreenLoading label="Loading page…" />;
  }

  return (
    <div className="flex h-dvh min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <EditorToolbar
        backHref="/website?tab=pages"
        backLabel="Pages"
        status={page.status}
        statusTestId="page-status-badge"
        saveState={saveState}
        publishing={publishing}
        leading={
          <SlugEditor
            slug={page.slug}
            prefix="/"
            onSave={handleSlugSave}
            disabled={!page.deletable || Boolean(page.git)}
            disabledReason={
              page.git
                ? `The URL comes from the file name, ${page.git.path}.`
                : `The ${page.name} URL is fixed at /${page.slug}.`
            }
            testId="page-slug-input"
            compact
          />
        }
        onPublish={handlePublish}
        publishLabel={page.git ? "Create pull request" : "Publish"}
        publishingLabel={page.git ? "Opening pull request…" : "Publishing…"}
        extra={page.git ? <GitPageLinks git={page.git} /> : undefined}
        onDiscardDraft={handleDiscardDraft}
        discardDescription="Discard all unpublished changes on this page? This cannot be undone."
      />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <PageBuilder
          key={resetKey}
          initialLayout={page.draftLayout}
          initialTheme={initialTheme}
          themes={{ custom: customThemes }}
          pageData={{ ...branding }}
          allowThemeEditing={canWriteThemes && canWriteSettings}
          initialSeo={{
            title: page.draftTitle ?? undefined,
            description: page.draftDescription ?? undefined,
            robotsAllowed: page.draftRobotsAllowed ?? undefined,
            socialImage: (page.draftSocialImage as any) ?? undefined,
          }}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}

/** "Edit in GitHub", the live commit and the latest pull request. */
function GitPageLinks({ git }: { git: NonNullable<Page["git"]> }) {
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      {git.pullRequest?.status === "open" && (
        <a
          href={git.pullRequest.url}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Pull request #{git.pullRequest.number}
        </a>
      )}
      {git.liveSha && (
        <span title="Live commit">
          Live <code>{git.liveSha.slice(0, 7)}</code>
        </span>
      )}
      <a
        href={git.editUrl}
        target="_blank"
        rel="noreferrer"
        className="text-primary hover:underline"
        data-testid="edit-in-github"
      >
        Edit in GitHub
      </a>
    </span>
  );
}
