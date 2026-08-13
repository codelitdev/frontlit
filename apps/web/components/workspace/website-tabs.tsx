"use client";

import { Bot, Code, FileText, Globe, Palette } from "lucide-react";
import {
    WEBSITE_TABS,
    websiteTabHref,
    type WebsiteTab,
} from "@/lib/website-tabs";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import { WorkspaceSectionTabs } from "@/components/workspace/workspace-section-tabs";

const ICONS = {
    pages: FileText,
    branding: Palette,
    domain: Globe,
    "code-injection": Code,
    chatbot: Bot,
} as const;

/** Permission-aware primary navigation for the Website workspace. */
export function WebsiteTabs({ currentTab }: { currentTab: WebsiteTab }) {
    const { canAccess } = useWorkspaceAccess();
    const tabs = WEBSITE_TABS.filter((tab) => canAccess(tab.accessPath));

    return (
        <div className="px-8 pt-8">
            <div className="mx-auto w-full max-w-6xl">
                <WorkspaceSectionTabs
                    ariaLabel="Website sections"
                    className="mb-0"
                    currentId={currentTab}
                    items={tabs.map((tab) => ({
                        id: tab.id,
                        label: tab.label,
                        href: websiteTabHref(tab.id),
                        icon: ICONS[tab.id],
                    }))}
                />
            </div>
        </div>
    );
}
