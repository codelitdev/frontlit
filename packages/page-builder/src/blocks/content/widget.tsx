import React from "react";
import clsx from "clsx";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { ContentSettings } from "./settings";
import { Image, TextRenderer } from "../../components";
import { Header2, Section } from "../../primitives";

const roundedMap: Record<number, string> = {
    0: "rounded-none",
    1: "rounded-sm",
    2: "rounded",
    3: "rounded-md",
    4: "rounded-lg",
    5: "rounded-xl",
    6: "rounded-2xl",
    7: "rounded-3xl",
    8: "rounded-full",
};

export function ContentWidget({
    settings: {
        title,
        body,
        media,
        alignment = "left",
        headerAlignment = "left",
        mediaRadius = 3,
        layout = "side",
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<ContentSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const hasMedia = Boolean(media && media.file);
    const sideBySide = layout !== "stacked" && layout !== "overlay";
    const direction =
        alignment === "right" ? "md:!flex-row-reverse" : "md:!flex-row";

    if (layout === "overlay") {
        // Media fills the section as a background; the text sits in a card
        // on top — a "feature spotlight" pattern common on product pages.
        const textPosition =
            alignment === "right"
                ? "items-end text-right"
                : "items-start text-left";
        return (
            <Section
                theme={overriddenTheme}
                id={cssId}
                background={background}
                nextTheme={nextTheme}
            >
                <div className="relative min-h-[420px] w-full overflow-hidden rounded-xl">
                    {hasMedia && (
                        <Image
                            src={media?.file || ""}
                            alt={media?.caption || ""}
                            width="w-full"
                            height="h-full"
                            className="absolute inset-0"
                            borderRadius={0}
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div
                        className={clsx(
                            "relative flex h-full flex-col justify-end gap-4 p-6 md:p-10",
                            textPosition,
                        )}
                    >
                        <div className="max-w-lg text-white">
                            {title && (
                                <Header2 theme={overriddenTheme}>
                                    {title}
                                </Header2>
                            )}
                            {body && (
                                <TextRenderer
                                    json={body}
                                    theme={overriddenTheme}
                                />
                            )}
                        </div>
                    </div>
                </div>
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
            <div
                className={clsx("flex flex-col gap-8", sideBySide && direction)}
            >
                {hasMedia && (
                    <div
                        className={clsx(
                            "flex w-full items-center",
                            sideBySide && "md:w-1/2",
                        )}
                    >
                        <div
                            className={`w-full overflow-hidden ${
                                roundedMap[mediaRadius] ?? "rounded-md"
                            }`}
                        >
                            <Image
                                src={media?.file || ""}
                                alt={media?.caption || ""}
                                borderRadius={mediaRadius}
                            />
                        </div>
                    </div>
                )}
                <div
                    className={clsx(
                        "w-full",
                        hasMedia && sideBySide && "md:w-1/2",
                    )}
                >
                    <div
                        className={clsx(
                            "flex h-full flex-col justify-center gap-4",
                            headerAlignment === "center"
                                ? "items-center text-center"
                                : "items-start",
                        )}
                    >
                        {title && (
                            <Header2 theme={overriddenTheme}>{title}</Header2>
                        )}
                        {body && (
                            <TextRenderer json={body} theme={overriddenTheme} />
                        )}
                    </div>
                </div>
            </div>
        </Section>
    );
}
