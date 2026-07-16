"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { listTeams, type Team, TEAMS_CHANGED_EVENT } from "@/lib/api";
import { resolveCurrentTeamId } from "@/lib/tokens";

export function TeamSwitcher() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // The dashboard layout (and this component) persists across
    // client-side navigations, so refetch whenever the route changes —
    // otherwise creating/renaming a team on /dashboard/teams wouldn't show
    // up here until a full reload.
    const pathname = usePathname();

    useEffect(() => {
        function refetch() {
            setLoading(true);
            return listTeams()
                .then(({ items }) => {
                    setTeams(items);
                    setCurrentTeamId(resolveCurrentTeamId(items));
                })
                .finally(() => setLoading(false));
        }
        refetch();
        // The teams page mutates the team list without a route change, so
        // it also broadcasts TEAMS_CHANGED_EVENT — listen for that too.
        window.addEventListener(TEAMS_CHANGED_EVENT, refetch);
        return () => window.removeEventListener(TEAMS_CHANGED_EVENT, refetch);
    }, [pathname]);

    if (loading) return <div className="text-sm text-neutral-400">Loading teams…</div>;

    if (teams.length === 0) {
        return <div className="text-sm text-neutral-500">No teams yet</div>;
    }

    return (
        <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium hover:bg-neutral-100">
                {teams.find((t) => t.teamId === currentTeamId)?.name || "Select a team"}
            </summary>
            <div className="mt-1 space-y-1">
                {teams.map((team) => (
                    <form key={team.teamId} action="/api/team/switch" method="POST">
                        <input type="hidden" name="teamId" value={team.teamId} />
                        <input type="hidden" name="redirectTo" value="/dashboard" />
                        <button
                            type="submit"
                            className={`w-full rounded-md px-2 py-1 text-left text-sm hover:bg-neutral-100 ${
                                team.teamId === currentTeamId ? "font-medium" : "text-neutral-600"
                            }`}
                        >
                            {team.name}
                        </button>
                    </form>
                ))}
                <a href="/dashboard/teams" className="block rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100">
                    + Add team
                </a>
            </div>
        </details>
    );
}
