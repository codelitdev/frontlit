"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import PagesPage from "./pages/page";
import BrandingPage from "./branding/page";
import DomainPage from "./domain/page";
import CodeInjectionPage from "./code-injection/page";
import ChatbotPage from "./chatbot/page";
import HelpDeskPage from "./help-desk/page";
import { Loading } from "@/components/workspace/loading";
import { ScrollablePage } from "@/components/workspace/scrollable-page";
import { useWorkspaceAccess } from "@/components/workspace/workspace-access";
import {
    WEBSITE_TABS,
    firstAccessibleWebsiteTab,
    isWebsiteTab,
    websiteTabHref,
} from "@/lib/website-tabs";

export default function WebsitePage({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string | string[] }>;
}) {
    const router = useRouter();
    const query = use(searchParams);
    const { currentTeam, loading, canAccess } = useWorkspaceAccess();
    const requested = typeof query.tab === "string" ? query.tab : null;
    const fallback = firstAccessibleWebsiteTab(currentTeam);
    const selectedTab =
        isWebsiteTab(requested) &&
        canAccess(
            WEBSITE_TABS.find((candidate) => candidate.id === requested)
                ?.accessPath ?? "/website",
        )
            ? requested
            : fallback;

    useEffect(() => {
        if (!loading && selectedTab && requested !== selectedTab) {
            router.replace(websiteTabHref(selectedTab));
        }
    }, [loading, requested, router, selectedTab]);

    if (loading || !selectedTab) {
        return (
            <ScrollablePage>
                <Loading />
            </ScrollablePage>
        );
    }

    const view =
        selectedTab === "branding" ? (
            <BrandingPage />
        ) : selectedTab === "domain" ? (
            <DomainPage />
        ) : selectedTab === "code-injection" ? (
            <CodeInjectionPage />
        ) : selectedTab === "chatbot" ? (
            <ChatbotPage />
        ) : selectedTab === "help-desk" ? (
            <HelpDeskPage />
        ) : (
            <PagesPage />
        );

    return view;
}
