"use client";

import { FileStack, Send } from "lucide-react";
import { emailTabHref, type EmailTab } from "@/lib/email-tabs";
import { WorkspaceSectionTabs } from "@/components/workspace/workspace-section-tabs";

const ITEMS: Array<{
    tab: EmailTab;
    label: string;
    icon: typeof Send;
}> = [
    { tab: "broadcasts", label: "Broadcasts", icon: Send },
    { tab: "templates", label: "Templates", icon: FileStack },
];

export function EmailTabs({ currentTab }: { currentTab: EmailTab }) {
    return (
        <WorkspaceSectionTabs
            ariaLabel="Email sections"
            currentId={currentTab}
            items={ITEMS.map((item) => ({
                id: item.tab,
                label: item.label,
                href: emailTabHref(item.tab),
                icon: item.icon,
            }))}
        />
    );
}
