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
import { DraftSaveBanner } from "@/components/workspace/draft-save-banner";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";

type PagePatch = Parameters<typeof updatePage>[1];

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const themeAliasesRef = useRef(new Map<string, string>());
  const knownThemeIdsRef = useRef(new Set<string>());
  const themeSnapshotsRef = useRef(new Map<string, string>());
  const appliedSiteThemeIdRef = useRef<string | null>(null);
  const appliedSiteThemeSnapshotRef = useRef<string | null>(null);
  const pageRef = useRef<Page | null>(null);

  function showPage(next: Page) {
    pageRef.current = next;
    setPage(next);
  }

  // The builder is uncontrolled: a reset (discard, reload, keep my version)
  // remounts it through `resetKey` so it re-reads the draft.
  const autosave = useDraftAutosave<Page, PagePatch>({
    save: (patch, expectedDraftVersion) =>
      updatePage(pageId, patch, expectedDraftVersion),
    load: () => getPage(pageId),
    onSaved: showPage,
    onReset: (loaded) => {
      showPage(loaded);
      setSaveState("saved");
    },
  });
  const { adopt, reset, isCurrent, resetKey } = autosave;
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
        adopt(loaded);
        showPage(loaded);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per page
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
      const saved = await autosave.save({
        layout: state.layout,
        title: state.seo.title,
        description: state.seo.description,
        // null, not undefined, so removing the image reaches the API.
        socialImage:
          (state.seo.socialImage as unknown as Record<string, unknown> | undefined) ??
          null,
        robotsAllowed: state.seo.robotsAllowed,
      });
      if (!saved) {
        setSaveState("error");
        return;
      }
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
      reset(await discardPageDraft(pageId));
    } finally {
      setPublishing(false);
    }
  }

  async function handleSlugSave(slug: string) {
    if (!(await autosave.save({ slug })))
      throw new Error("The URL could not be saved. Resolve the save error first.");
    return pageRef.current?.slug ?? slug;
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
        pendingSharedChanges={page.sharedWidgetsHaveChanges}
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
        publishBlockedReason={
          autosave.conflict ? "Resolve the save conflict before publishing." : undefined
        }
        publishLabel={page.git ? "Create pull request" : "Publish"}
        publishingLabel={page.git ? "Opening pull request…" : "Publishing…"}
        extra={page.git ? <GitPageLinks git={page.git} /> : undefined}
        onDiscardDraft={handleDiscardDraft}
        discardDescription={
          page.sharedWidgetsHaveChanges
            ? "Discard all unpublished changes on this page, and the unpublished header/footer edits shared by every page? This cannot be undone."
            : "Discard all unpublished changes on this page? This cannot be undone."
        }
      />
      <DraftSaveBanner autosave={autosave} className="shrink-0 border-b px-4 py-2" />
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
          onChange={(state) => {
            if (isCurrent(resetKey)) void handleChange(state);
          }}
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
