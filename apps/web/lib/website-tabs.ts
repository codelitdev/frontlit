import type { TeamMembership } from "./api";
import { canAccessWorkspacePath } from "./workspace-access";

export const WEBSITE_TABS = [
  {
    id: "pages",
    label: "Pages",
    accessPath: "/website/pages",
  },
  {
    id: "branding",
    label: "Branding",
    accessPath: "/website/branding",
  },
  {
    id: "domain",
    label: "Domain",
    accessPath: "/website/domain",
  },
  {
    id: "code-injection",
    label: "Code injection",
    accessPath: "/website/code-injection",
  },
  {
    id: "chatbot",
    label: "Chatbot",
    accessPath: "/website/chatbot",
  },
  {
    id: "help-desk",
    label: "Help desk",
    accessPath: "/website/help-desk",
  },
] as const;

export type WebsiteTab = (typeof WEBSITE_TABS)[number]["id"];

export function isWebsiteTab(value: string | null): value is WebsiteTab {
  return WEBSITE_TABS.some((tab) => tab.id === value);
}

export function websiteTabHref(tab: WebsiteTab): string {
  return `/website?tab=${tab}`;
}

export function firstAccessibleWebsiteTab(
  team: TeamMembership | null,
): WebsiteTab | null {
  return (
    WEBSITE_TABS.find((tab) => canAccessWorkspacePath(tab.accessPath, team))?.id ?? null
  );
}
