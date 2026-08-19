"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    SidebarGroup,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { isNavHrefActive, isNavItemActive } from "@/lib/nav-active";

export interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    items?: NavItem[];
}

function isGroupActive(
    pathname: string,
    search: string,
    item: NavItem,
): boolean {
    if (item.items?.length) {
        return item.items.some((child) =>
            isNavHrefActive(pathname, child.href, search),
        );
    }
    return isNavItemActive(pathname, item.href);
}

function NavCollapsibleItem({ item }: { item: NavItem }) {
    const pathname = usePathname();
    const search = useSearchParams().toString();
    const children = item.items ?? [];
    const active = isGroupActive(pathname, search, item);
    const [open, setOpen] = useState(active);

    // The sidebar persists across client-side navigations, so a plain
    // `defaultOpen` only applies once at mount — without this, navigating
    // between group sub-pages (or into the group from elsewhere) doesn't
    // keep the group expanded.
    useEffect(() => {
        if (active) setOpen(true);
    }, [active]);

    return (
        <Collapsible
            asChild
            open={open}
            onOpenChange={setOpen}
            className="group/collapsible"
        >
            <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                    <SidebarMenuButton isActive={active} tooltip={item.label}>
                        <item.icon />
                        <span>{item.label}</span>
                        <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <SidebarMenuSub>
                        {children.map((child) => {
                            const itemActive = isNavHrefActive(
                                pathname,
                                child.href,
                                search,
                            );
                            return (
                                <SidebarMenuSubItem key={child.href}>
                                    <SidebarMenuSubButton
                                        asChild
                                        isActive={itemActive}
                                    >
                                        <Link href={child.href}>
                                            <child.icon />
                                            <span>{child.label}</span>
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            );
                        })}
                    </SidebarMenuSub>
                </CollapsibleContent>
            </SidebarMenuItem>
        </Collapsible>
    );
}

/** Bare `<SidebarMenuItem>`s for `items` — compose inside your own `<SidebarMenu>`. */
export function NavItems({ items }: { items: NavItem[] }) {
    const pathname = usePathname();

    return (
        <>
            {items.map((item) => {
                if (item.items?.length) {
                    return <NavCollapsibleItem key={item.label} item={item} />;
                }

                const active = isNavItemActive(pathname, item.href);
                return (
                    <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={item.label}
                        >
                            <Link href={item.href}>
                                <item.icon />
                                <span>{item.label}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </>
    );
}

export function NavMain({ items }: { items: NavItem[] }) {
    return (
        <SidebarGroup>
            <SidebarMenu>
                <NavItems items={items} />
            </SidebarMenu>
        </SidebarGroup>
    );
}
