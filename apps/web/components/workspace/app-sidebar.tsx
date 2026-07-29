"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    BookOpen,
    Bot,
    Building2,
    Code,
    FileText,
    Globe,
    History,
    Images,
    Inbox,
    LayoutGrid,
    Mail,
    Newspaper,
    Palette,
    Send,
    Settings,
    Users,
} from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarRail } from "@/components/ui/sidebar";
import { NavMain, NavItems, type NavItem } from "@/components/workspace/nav-main";
import { NavUser } from "@/components/workspace/nav-user";
import { TeamSwitcher } from "@/components/workspace/team-switcher";
import { Banner } from "@/components/workspace/banner";
import { ApiError } from "@/lib/api-client";
import { listTeams, TEAMS_CHANGED_EVENT, type Team } from "@/lib/api";
import { resolveCurrentTeamId } from "@/lib/tokens";

const NAV: NavItem[] = [
    { href: "/", label: "Inbox", icon: Inbox },
    {
        href: "/website",
        label: "Website",
        icon: LayoutGrid,
        items: [
            { href: "/website/pages", label: "Pages", icon: FileText },
            { href: "/website/branding", label: "Branding", icon: Palette },
            { href: "/website/domain", label: "Domain", icon: Globe },
            { href: "/website/code-injection", label: "Code injection", icon: Code },
            { href: "/website/chatbot", label: "Chatbot", icon: Bot },
        ],
    },
    { href: "/blog", label: "Blog", icon: Newspaper },
    { href: "/docs", label: "Docs", icon: BookOpen },
    { href: "/newsletter", label: "Newsletter", icon: Mail },
    { href: "/changelog", label: "Changelog", icon: History },
    { href: "/users", label: "Users", icon: Users },
];

const FOOTER_NAV: NavItem[] = [
    { href: "/teams", label: "Account", icon: Building2 },
    { href: "/media", label: "Media library", icon: Images },
    {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        items: [{ href: "/settings/esp", label: "ESP", icon: Send }],
    },
];

interface CurrentAccount {
    email: string;
    name?: string | null;
}

export function AppSidebar() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
    const [account, setAccount] = useState<CurrentAccount | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const [teamsResult, sessionResult] = await Promise.allSettled([
                    listTeams(),
                    fetch("/api/auth/get-session", { cache: "no-store" }).then(async (res) => {
                        if (!res.ok) return null;
                        const session = (await res.json()) as { user?: CurrentAccount };
                        return session.user ?? null;
                    }),
                ]);
                if (cancelled) return;

                if (teamsResult.status === "fulfilled") {
                    const { items } = teamsResult.value;
                    setTeams(items);
                    setCurrentTeamId(resolveCurrentTeamId(items));
                } else {
                    throw teamsResult.reason;
                }

                if (sessionResult.status === "fulfilled" && sessionResult.value) {
                    setAccount(sessionResult.value);
                }
            } catch (err) {
                if (cancelled) return;
                setError(err instanceof ApiError ? err.message : "Failed to load teams");
            }
        }
        load();
        window.addEventListener(TEAMS_CHANGED_EVENT, load);
        return () => {
            cancelled = true;
            window.removeEventListener(TEAMS_CHANGED_EVENT, load);
        };
    }, []);

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <TeamSwitcher teams={teams} currentTeamId={currentTeamId} />
            </SidebarHeader>

            {error && (
                <div className="px-2 group-data-[collapsible=icon]:hidden">
                    <Banner>{error}</Banner>
                </div>
            )}

            <SidebarContent>
                {currentTeamId && teams.find((team) => team.teamId === currentTeamId)?.subdomain == null && (
                    <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
                        <Banner variant="warning">
                            <Link href="/website/domain" className="font-medium underline">Finish website setup</Link>{" "}
                            by choosing your public subdomain.
                        </Banner>
                    </div>
                )}
                <NavMain items={NAV} />
                <SidebarMenu className="mt-auto px-2">
                    <NavItems items={FOOTER_NAV} />
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter>
                <NavUser account={account} />
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}
