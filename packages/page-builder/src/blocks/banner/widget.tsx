import React from "react";
import clsx from "clsx";
import type { ThemeStyle, WidgetProps } from "../../models";
import type { BannerSettings } from "./settings";
import { NavLink, TextRenderer } from "../../components";
import {
    Button,
    Header1,
    PageCard,
    PageCardContent,
    Section,
    Subheader1,
} from "../../primitives";

export function BannerWidget({
    settings: {
        title,
        description,
        buttonCaption,
        buttonAction,
        secondaryButtonCaption,
        secondaryButtonAction,
        contentAlignment = "center",
        layout = "stacked",
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    nextTheme,
}: WidgetProps<BannerSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const isCentered = contentAlignment === "center";
    const isSplit = layout === "split";
    const isBoxed = layout === "boxed";

    const heading = (
        <>
            <Header1 theme={overriddenTheme}>{title}</Header1>
            {description && (
                <Subheader1 theme={overriddenTheme} component="span">
                    <TextRenderer json={description} theme={overriddenTheme} />
                </Subheader1>
            )}
        </>
    );

    const buttons = (buttonAction || secondaryButtonAction) && (
        <div
            className={clsx(
                "flex flex-col md:!flex-row gap-2 w-full md:w-auto",
                isSplit ? "shrink-0" : "mt-2",
                !isSplit && isCentered ? "md:!justify-center" : "",
            )}
        >
            {buttonAction && buttonCaption && (
                <NavLink href={buttonAction}>
                    <Button
                        theme={overriddenTheme}
                        className="w-full md:min-w-[150px]"
                    >
                        {buttonCaption}
                    </Button>
                </NavLink>
            )}
            {secondaryButtonAction && secondaryButtonCaption && (
                <NavLink href={secondaryButtonAction}>
                    <Button
                        theme={overriddenTheme}
                        variant="secondary"
                        className="w-full md:min-w-[150px]"
                    >
                        {secondaryButtonCaption}
                    </Button>
                </NavLink>
            )}
        </div>
    );

    const content = isSplit ? (
        <div className="flex flex-col gap-6 md:!flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-start gap-4">{heading}</div>
            {buttons}
        </div>
    ) : (
        <div
            className={clsx(
                "flex flex-col gap-4",
                isCentered ? "items-center text-center" : "items-start",
            )}
        >
            {heading}
            {buttons}
        </div>
    );

    return (
        <Section
            theme={overriddenTheme}
            id={cssId}
            background={background}
            nextTheme={nextTheme}
        >
            {isBoxed ? (
                <PageCard theme={overriddenTheme} className="mx-auto max-w-3xl">
                    <PageCardContent
                        theme={overriddenTheme}
                        className="items-center p-8 text-center md:p-12"
                    >
                        {content}
                    </PageCardContent>
                </PageCard>
            ) : (
                content
            )}
        </Section>
    );
}
