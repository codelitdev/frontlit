"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { listTeams, TEAMS_CHANGED_EVENT, type TeamMembership } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { resolveCurrentTeamId } from "@/lib/tokens";
import {
    canAccessWorkspacePath,
    getWorkspaceLandingPath,
    isTeamScopedWorkspacePath,
} from "@/lib/workspace-access";
import { Banner } from "@/components/workspace/banner";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";

type WorkspaceAccessState = {
    teams: TeamMembership[];
    currentTeamId: string | null;
    currentTeam: TeamMembership | null;
    loading: boolean;
    error: string | null;
    canAccess: (pathname: string) => boolean;
};

const WorkspaceAccessContext = createContext<WorkspaceAccessState | null>(null);

export function WorkspaceAccessProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [teams, setTeams] = useState<TeamMembership[]>([]);
    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const { items } = await listTeams();
            setTeams(items);
            setCurrentTeamId(resolveCurrentTeamId(items));
            setError(null);
        } catch (err) {
            setError(
                err instanceof ApiError ? err.message : "Failed to load teams",
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
        window.addEventListener(TEAMS_CHANGED_EVENT, refresh);
        return () => window.removeEventListener(TEAMS_CHANGED_EVENT, refresh);
    }, [refresh]);

    const currentTeam =
        teams.find((team) => team.teamId === currentTeamId) ?? null;
    const canAccess = useCallback(
        (pathname: string) => canAccessWorkspacePath(pathname, currentTeam),
        [currentTeam],
    );
    const value = useMemo(
        () => ({
            teams,
            currentTeamId,
            currentTeam,
            loading,
            error,
            canAccess,
        }),
        [teams, currentTeamId, currentTeam, loading, error, canAccess],
    );

    return (
        <WorkspaceAccessContext.Provider value={value}>
            {children}
        </WorkspaceAccessContext.Provider>
    );
}

export function useWorkspaceAccess() {
    const context = useContext(WorkspaceAccessContext);
    if (!context) {
        throw new Error(
            "useWorkspaceAccess must be used within WorkspaceAccessProvider",
        );
    }
    return context;
}

export function WorkspaceAccessGate({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const { loading, error, currentTeam, canAccess } = useWorkspaceAccess();
    const teamScoped = isTeamScopedWorkspacePath(pathname);
    const redirectTo = currentTeam
        ? getWorkspaceLandingPath(currentTeam)
        : null;
    const accessDenied =
        teamScoped &&
        !loading &&
        !error &&
        (!currentTeam || !canAccess(pathname));

    useEffect(() => {
        if (!accessDenied) return;
        router.replace(redirectTo ?? "/teams");
    }, [accessDenied, redirectTo, router]);

    if (!teamScoped) return <>{children}</>;
    if (loading) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }
    if (error) {
        return (
            <ScrollablePage>
                <Banner>{error}</Banner>
            </ScrollablePage>
        );
    }
    if (accessDenied) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    return <>{children}</>;
}
