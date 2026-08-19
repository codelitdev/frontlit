export const EMAIL_TABS = ["broadcasts", "templates"] as const;
export type EmailTab = (typeof EMAIL_TABS)[number];

export const DEFAULT_EMAIL_TAB: EmailTab = "broadcasts";

export function isEmailTab(value: string | null): value is EmailTab {
    return EMAIL_TABS.includes(value as EmailTab);
}

export function emailTabHref(tab: EmailTab): string {
    return `/email?tab=${tab}`;
}

export function parseEmailTab(value: string | string[] | undefined): EmailTab {
    const raw = Array.isArray(value) ? value[0] : value;
    return raw && isEmailTab(raw) ? raw : DEFAULT_EMAIL_TAB;
}
