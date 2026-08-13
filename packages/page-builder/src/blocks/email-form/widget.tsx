import React, { useState } from "react";
import clsx from "clsx";
import type { PageData, ThemeStyle, WidgetProps } from "../../models";
import type { EmailFormSettings } from "./settings";
import { TextRenderer } from "../../components";
import {
    Button,
    Header1,
    Input,
    Label,
    Section,
    Subheader1,
    Text2,
} from "../../primitives";

/**
 * Captures a lead via FrontLit's public, unauthenticated lead-capture
 * endpoint (architecture.md §10.2), which enqueues a SendLit contact-sync
 * job and returns immediately — capture never depends on SendLit being
 * reachable. Falls back to a local-only success (no network call) when the
 * page isn't wired to a live team/API, e.g. an isolated component preview.
 */
async function subscribeEmail(
    email: string,
    pageData: PageData,
): Promise<{ success: boolean }> {
    if (!pageData.teamId || !pageData.publicApiBaseUrl) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return { success: Boolean(email) };
    }

    try {
        const res = await fetch(
            `${pageData.publicApiBaseUrl}/public/${pageData.teamId}/leads`,
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    email,
                    sourcePath: pageData.pageSlug
                        ? `/${pageData.pageSlug}`
                        : undefined,
                }),
            },
        );
        if (!res.ok) return { success: false };
        const body = (await res.json()) as { accepted: boolean };
        return { success: body.accepted };
    } catch {
        return { success: false };
    }
}

export function EmailFormWidget({
    settings: {
        title,
        description,
        buttonCaption = "Subscribe",
        successMessage = "Thanks for subscribing!",
        alignment = "left",
        layout = "stacked",
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    pageData,
    editing,
    nextTheme,
}: WidgetProps<EmailFormSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const [email, setEmail] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const isCentered = alignment === "center";

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editing) return;

        setIsSubmitting(true);
        try {
            const result = await subscribeEmail(email, pageData);
            if (result.success) {
                setSuccess(true);
                setEmail("");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (layout === "inline") {
        // Single-row minimal prompt — title/description beside a bare
        // input+button, no label. Common for a compact in-page nudge
        // rather than a dedicated email section.
        return (
            <Section
                theme={overriddenTheme}
                id={cssId}
                background={background}
                nextTheme={nextTheme}
            >
                <form
                    onSubmit={onSubmit}
                    className="flex flex-col items-start gap-4 md:!flex-row md:items-center md:justify-between"
                >
                    <div className="flex flex-col gap-1">
                        <Header1 theme={overriddenTheme} className="text-xl">
                            {title}
                        </Header1>
                        {description && (
                            <Subheader1
                                theme={overriddenTheme}
                                component="span"
                            >
                                <TextRenderer
                                    json={description}
                                    theme={overriddenTheme}
                                />
                            </Subheader1>
                        )}
                    </div>
                    {success ? (
                        <Text2 theme={overriddenTheme}>{successMessage}</Text2>
                    ) : (
                        <div className="flex w-full flex-col gap-2 sm:!flex-row md:w-auto md:shrink-0">
                            <Input
                                theme={overriddenTheme}
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                type="email"
                                required
                                className="md:w-64"
                            />
                            <Button
                                theme={overriddenTheme}
                                type="submit"
                                disabled={!editing && (isSubmitting || !email)}
                            >
                                {buttonCaption}
                            </Button>
                        </div>
                    )}
                </form>
            </Section>
        );
    }

    return (
        <Section
            theme={overriddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme}
        >
            <form
                onSubmit={onSubmit}
                className={clsx(
                    "flex gap-4",
                    layout === "split"
                        ? "flex-col md:!flex-row md:items-center md:justify-between md:gap-10"
                        : clsx(
                              "flex-col",
                              isCentered
                                  ? "items-center text-center"
                                  : "items-start",
                          ),
                )}
            >
                <div
                    className={clsx(
                        "flex flex-col gap-4",
                        layout === "split" ? "items-start" : "contents",
                    )}
                >
                    <Header1 theme={overriddenTheme}>{title}</Header1>
                    {description && (
                        <Subheader1 theme={overriddenTheme} component="span">
                            <TextRenderer
                                json={description}
                                theme={overriddenTheme}
                            />
                        </Subheader1>
                    )}
                </div>
                {success ? (
                    <Text2 theme={overriddenTheme}>{successMessage}</Text2>
                ) : (
                    <div
                        className={clsx(
                            "flex flex-col md:!flex-row md:!items-end gap-2",
                            layout === "split" ? "md:shrink-0" : "w-full",
                            layout !== "split" && isCentered
                                ? "md:!justify-center"
                                : "",
                        )}
                    >
                        <div className="flex flex-col gap-1 items-start">
                            <Label theme={overriddenTheme} htmlFor="email">
                                Email
                            </Label>
                            <Input
                                theme={overriddenTheme}
                                id="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="Enter your email"
                                type="email"
                                required
                            />
                        </div>
                        <Button
                            theme={overriddenTheme}
                            type="submit"
                            disabled={!editing && (isSubmitting || !email)}
                        >
                            {buttonCaption}
                        </Button>
                    </div>
                )}
            </form>
        </Section>
    );
}
