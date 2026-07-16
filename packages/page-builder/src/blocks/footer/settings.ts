import type { WidgetDefaultSettings } from "../../models";

export interface FooterLink {
    id: string;
    label: string;
    href: string;
}

export interface FooterColumn {
    id: string;
    title: string;
    links: FooterLink[];
}

export interface FooterSettings extends WidgetDefaultSettings {
    logoText?: string;
    tagline?: string;
    columns?: FooterColumn[];
    copyrightText?: string;
    layout?: "columns" | "centered" | "minimal";
}
