import React from "react";
import clsx from "clsx";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { GridItem, GridSettings } from "./settings";
import { Image, NavLink, TextRenderer } from "../../components";
import {
    Button,
    Header1,
    Header4,
    PageCard,
    PageCardContent,
    Section,
    Subheader1,
    Text2,
} from "../../primitives";

function resolveIcon(name?: string): LucideIcon | null {
    if (!name) return null;
    return (Icons as unknown as Record<string, LucideIcon>)[name] ?? null;
}

function GridItemCard({ item, theme }: { item: GridItem; theme: ThemeStyle }) {
    const Icon = resolveIcon(item.icon);
    const hasMedia = Boolean(item.media?.file);
    const isOverlay = item.mediaAlignment === "overlay";
    const mediaFirst = item.mediaAlignment !== "bottom";

    if (isOverlay) {
        const card = (
            <PageCard theme={theme} isLink={Boolean(item.buttonAction)}>
                <div className="relative aspect-[4/5] w-full overflow-hidden">
                    {hasMedia && (
                        <Image
                            src={item.media?.file || ""}
                            alt={item.media?.caption || ""}
                            className="absolute inset-0"
                            width="w-full"
                            height="h-full"
                            objectFit="cover"
                            borderRadius={0}
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4">
                        <Header4 theme={theme} className="text-white">
                            {item.title}
                        </Header4>
                    </div>
                </div>
            </PageCard>
        );

        return item.buttonAction ? (
            <NavLink href={item.buttonAction} className="block">
                {card}
            </NavLink>
        ) : (
            card
        );
    }

    const media = hasMedia ? (
        <div className="overflow-hidden rounded-md">
            <Image
                src={item.media?.file || ""}
                alt={item.media?.caption || ""}
            />
        </div>
    ) : Icon ? (
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
        </div>
    ) : null;

    const text = (
        <div className="flex flex-col gap-2">
            <Header4 theme={theme}>{item.title}</Header4>
            {item.description && (
                <Text2 theme={theme}>{item.description}</Text2>
            )}
            {item.buttonAction && item.buttonCaption && (
                <NavLink href={item.buttonAction} className="mt-2">
                    <Button theme={theme} variant="secondary" size="sm">
                        {item.buttonCaption}
                    </Button>
                </NavLink>
            )}
        </div>
    );

    return (
        <PageCard theme={theme}>
            <PageCardContent
                theme={theme}
                className="flex h-full flex-col gap-3"
            >
                {mediaFirst ? (
                    <>
                        {media}
                        {text}
                    </>
                ) : (
                    <>
                        {text}
                        {media}
                    </>
                )}
            </PageCardContent>
        </PageCard>
    );
}

export function GridWidget({
    settings: {
        title,
        description,
        headerAlignment = "center",
        buttonCaption,
        buttonAction,
        items,
        columns = 3,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<GridSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    return (
        <Section
            theme={overriddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme}
        >
            <div className="flex flex-col gap-8">
                <div
                    className={clsx(
                        "flex flex-col gap-4",
                        headerAlignment === "center"
                            ? "items-center text-center"
                            : "items-start",
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
                    {buttonAction && buttonCaption && (
                        <NavLink href={buttonAction} className="mt-2">
                            <Button theme={overriddenTheme}>
                                {buttonCaption}
                            </Button>
                        </NavLink>
                    )}
                </div>
                {items && items.length > 0 && (
                    <div
                        className={clsx(
                            "grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch",
                            columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2",
                        )}
                    >
                        {items.map((item, index) => (
                            <GridItemCard
                                key={index}
                                item={item}
                                theme={overriddenTheme}
                            />
                        ))}
                    </div>
                )}
            </div>
        </Section>
    );
}
