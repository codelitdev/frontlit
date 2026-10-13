"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/codelit/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { FrontLitLogo } from "@/components/workspace/frontlit-logo";
import type { TeamMembership } from "@/lib/api";
import {
  canAccessWorkspacePath,
  getWorkspaceLandingPath,
} from "@/lib/workspace-access";

export function TeamSwitcher({
  teams,
  currentTeamId,
}: {
  teams: TeamMembership[];
  currentTeamId: string | null;
}) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const currentTeam = teams.find((team) => team.teamId === currentTeamId) ?? teams[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft">
                <FrontLitLogo className="size-8" />
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {currentTeam?.name ?? "FrontLit"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {currentTeam ? "Team workspace" : "Select team"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Teams
            </DropdownMenuLabel>
            {teams.length === 0 ? (
              <div className="px-2 py-2 text-sm text-muted-foreground">
                No teams available.
              </div>
            ) : (
              teams.map((team) => (
                <DropdownMenuItem key={team.teamId} asChild className="gap-2 p-2">
                  <form action="/api/team/switch" method="POST">
                    <input type="hidden" name="teamId" value={team.teamId} />
                    <input
                      type="hidden"
                      name="redirectTo"
                      value={
                        canAccessWorkspacePath(pathname, team)
                          ? pathname
                          : (getWorkspaceLandingPath(team) ?? "/teams")
                      }
                    />
                    <button
                      type="submit"
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-medium">
                        {team.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{team.name}</span>
                    </button>
                  </form>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link href="/teams">
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <Plus className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Add team</div>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
