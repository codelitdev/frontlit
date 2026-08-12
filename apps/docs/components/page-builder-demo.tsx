"use client";

import { useMemo, useState } from "react";
import {
    PageBuilder,
    PageRenderer,
    createDefaultLayout,
    createWidgetInstance,
    getDefaultTheme,
    type WidgetInstance,
} from "@frontlit/page-builder";

type DemoName =
    | "hero"
    | "header"
    | "footer"
    | "pricing"
    | "faq"
    | "grid"
    | "rich-text"
    | "email-form"
    | "page-builder";

function DemoFrame({
    title,
    description,
    tall,
    children,
}: {
    title: string;
    description?: string;
    tall?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="page-builder-demo">
            <div className="page-builder-demo__header">
                <h3>{title}</h3>
                {description && <p>{description}</p>}
            </div>
            <div
                className={`page-builder-demo__body ${tall ? "page-builder-demo__tall" : ""}`}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * Renders a single block, wired to the real `@frontlit/page-builder`
 * registry and theme — not a mock. Mirrors how the block actually appears
 * on a page: `PageRenderer` given a one-widget layout.
 */
function BlockDemo({
    name,
    title,
    description,
}: {
    name: string;
    title: string;
    description?: string;
}) {
    const theme = useMemo(() => getDefaultTheme(), []);
    const layout = useMemo<WidgetInstance[]>(
        () => [createWidgetInstance(name)],
        [name],
    );

    return (
        <DemoFrame title={title} description={description}>
            <div className="overflow-hidden rounded-md border">
                <PageRenderer
                    layout={layout}
                    theme={theme}
                    pageData={{ pageType: "landing" }}
                />
            </div>
        </DemoFrame>
    );
}

function PageBuilderDemoFull() {
    const [layout] = useState<WidgetInstance[]>(() => createDefaultLayout());
    const [theme] = useState(() => getDefaultTheme());

    return (
        <DemoFrame
            title="PageBuilder"
            description="The full WYSIWYG editor — add, remove, reorder and edit blocks."
            tall
        >
            <PageBuilder
                pageData={{ pageType: "landing" }}
                initialLayout={layout}
                initialTheme={theme}
                className="h-full"
            />
        </DemoFrame>
    );
}

export function PageBuilderDemo({ demo }: { demo: DemoName }) {
    switch (demo) {
        case "hero":
            return (
                <BlockDemo
                    name="hero"
                    title="Hero"
                    description="The page's opening section — headline, subhead and a primary call to action."
                />
            );
        case "header":
            return (
                <BlockDemo
                    name="header"
                    title="Header"
                    description="Sticky site navigation, pinned to the top of every page."
                />
            );
        case "footer":
            return (
                <BlockDemo
                    name="footer"
                    title="Footer"
                    description="Site-wide footer links, pinned to the bottom of every page."
                />
            );
        case "pricing":
            return (
                <BlockDemo
                    name="pricing"
                    title="Pricing"
                    description="A comparison of pricing tiers."
                />
            );
        case "faq":
            return (
                <BlockDemo
                    name="faq"
                    title="FAQ"
                    description="An expandable list of frequently asked questions."
                />
            );
        case "grid":
            return (
                <BlockDemo
                    name="grid"
                    title="Grid"
                    description="A responsive grid of cards — features, team members, logos, etc."
                />
            );
        case "rich-text":
            return (
                <BlockDemo
                    name="rich-text"
                    title="Rich Text"
                    description="Freeform formatted text, powered by the FrontLit text editor."
                />
            );
        case "email-form":
            return (
                <BlockDemo
                    name="email-form"
                    title="Email Form"
                    description="A newsletter/waitlist signup form."
                />
            );
        case "page-builder":
            return <PageBuilderDemoFull />;
    }
}
