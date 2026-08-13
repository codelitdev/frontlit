"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Building2,
    Images,
    Inbox,
    LayoutGrid,
    Mail,
    Library,
    Send,
    Sparkles,
    Settings,
    ContactRound,
    Users,
} from "lucide-react";
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarRail,
} from "@/components/ui/sidebar";
import {
    NavMain,
    NavItems,
    type NavItem,
} from "@/components/workspace/nav-main";
import { NavUser } from "@/components/workspace/nav-user";
import { TeamSwitcher } from "@/components/workspace/team-switcher";
import { Banner } from "@/components/workspace/banner";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { canAccessWorkspacePath } from "@/lib/workspace-access";

const NAV: NavItem[] = [
    { href: "/", label: "Inbox", icon: Inbox },
    {
        href: "/website?tab=pages",
        label: "Website",
        icon: LayoutGrid,
    },
    { href: "/content?type=articles", label: "Content", icon: Library },
    { href: "/email?tab=broadcasts", label: "Email", icon: Mail },
    { href: "/contacts", label: "Contacts", icon: ContactRound },
];

const FOOTER_NAV: NavItem[] = [
    { href: "/teams", label: "Account", icon: Building2 },
    { href: "/media", label: "Media library", icon: Images },
    {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        items: [
            { href: "/settings/members", label: "Members", icon: Users },
            { href: "/settings/esp", label: "ESP", icon: Send },
            { href: "/settings/ai", label: "AI", icon: Sparkles },
        ],
    },
];

interface CurrentAccount {
    email: string;
    name?: string | null;
}

function visibleNavItems(
    items: NavItem[],
    canAccess: (href: string) => boolean,
): NavItem[] {
    return items.flatMap((item) => {
        const children = item.items
            ? visibleNavItems(item.items, canAccess)
            : undefined;
        if (item.items) {
            return children?.length ? [{ ...item, items: children }] : [];
        }
        return canAccess(item.href) ? [item] : [];
    });
}

export function AppSidebar() {
    const { teams, currentTeamId, currentTeam, error } = useWorkspaceAccess();
    const [account, setAccount] = useState<CurrentAccount | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetch("/api/auth/get-session", { cache: "no-store" })
            .then(async (res) => {
                if (!res.ok) return null;
                const session = (await res.json()) as {
                    user?: CurrentAccount;
                };
                return session.user ?? null;
            })
            .then((user) => {
                if (!cancelled && user) setAccount(user);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const canAccess = useCallback(
        (href: string) => canAccessWorkspacePath(href, currentTeam),
        [currentTeam],
    );
    const mainNav = useMemo(() => visibleNavItems(NAV, canAccess), [canAccess]);
    const footerNav = useMemo(
        () => visibleNavItems(FOOTER_NAV, canAccess),
        [canAccess],
    );

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
                {currentTeamId &&
                    currentTeam?.subdomain == null &&
                    canAccess("/website/domain") && (
                        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
                            <Banner variant="warning">
                                <Link
                                    href="/website?tab=domain"
                                    className="font-medium underline"
                                >
                                    Finish website setup
                                </Link>{" "}
                                by choosing your public subdomain.
                            </Banner>
                        </div>
                    )}
                <NavMain items={mainNav} />
                <SidebarMenu className="mt-auto px-2">
                    <NavItems items={footerNav} />
                </SidebarMenu>
            </SidebarContent>

            <SidebarFooter>
                <NavUser account={account} />
            </SidebarFooter>

            <SidebarRail />
        </Sidebar>
    );
}
