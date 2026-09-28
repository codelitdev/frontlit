"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError } from "@/lib/api-client";
import { listTeams, type TeamMembership } from "@/lib/api";
import { resolveCurrentTeamId } from "@/lib/tokens";
import { canAccessEditorPath, getEditorFallbackPath } from "@/lib/workspace-access";
import { FullScreenLoading } from "@/components/workspace/loading";

type EditorAccessState = { currentTeam: TeamMembership };

const EditorAccessContext = createContext<EditorAccessState | null>(null);

export function useEditorAccess() {
  const context = useContext(EditorAccessContext);
  if (!context) {
    throw new Error("useEditorAccess must be used within EditorAccessGate");
  }
  return context;
}

/** Protect chrome-free editors just as strictly as workspace routes. The API
 * remains authoritative; this avoids exposing an editable UI that its initial
 * request cannot complete. */
export function EditorAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [team, setTeam] = useState<TeamMembership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTeams()
      .then(({ items }) => {
        if (cancelled) return;
        const currentTeamId = resolveCurrentTeamId(items);
        setTeam(items.find((item) => item.teamId === currentTeamId) ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load workspace access.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const allowed = canAccessEditorPath(pathname, team);
  const fallback = getEditorFallbackPath(pathname, team);

  useEffect(() => {
    if (!loading && !error && !allowed) router.replace(fallback);
  }, [allowed, error, fallback, loading, router]);

  const value = useMemo(() => (team ? { currentTeam: team } : null), [team]);

  if (loading || (!error && !allowed)) {
    return <FullScreenLoading label="Loading editor…" />;
  }
  if (error || !value) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Editor unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "Select a team before opening this editor."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <EditorAccessContext.Provider value={value}>
      {children}
    </EditorAccessContext.Provider>
  );
}
