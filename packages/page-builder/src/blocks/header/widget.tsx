import React, { useState } from "react";
import clsx from "clsx";
import { MenuIcon } from "lucide-react";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { HeaderNavLink, HeaderSettings } from "./settings";
import { Image, NavLink, ThemeModeSwitcher } from "../../components";
import {
    Button,
    Drawer,
    Header4,
    Link as PrimitiveLink,
    Section,
} from "../../primitives";

function HeaderLink({
    link,
    theme,
    onClick,
}: {
    link: HeaderNavLink;
    theme?: ThemeStyle;
    onClick?: () => void;
}) {
    if (link.isButton) {
        return (
            <NavLink href={link.href} onClick={onClick}>
                <Button size="sm" theme={theme}>
                    {link.label}
                </Button>
            </NavLink>
        );
    }

    return (
        <NavLink href={link.href} onClick={onClick} className="no-underline">
            <PrimitiveLink theme={theme} className="no-underline">
                {link.label}
            </PrimitiveLink>
        </NavLink>
    );
}

export function HeaderWidget({
    settings: {
        logoText,
        logoImage,
        links = [],
        ctaLabel,
        ctaHref,
        linkAlignment = "left",
        layout = "fixed",
        backdropBlur = false,
        showThemeSwitcher = true,
        cssId,
        maxWidth,
        verticalPadding,
        background,
    },
    state: { theme },
    pageData,
    nextTheme,
    toggleTheme,
}: WidgetProps<HeaderSettings>) {
    const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
    overriddenTheme.structure.page.width =
        maxWidth || theme.theme.structure.page.width;
    overriddenTheme.structure.section.padding.y =
        verticalPadding || theme.theme.structure.section.padding.y;

    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const isFloating = layout === "floating";
    const isCentered = layout === "centered";
    const isFixed = !isFloating;
    const primaryLinks = links.filter((link) => !link.isButton);
    const buttonLinks = links.filter((link) => link.isButton);
    // On a published tenant site, branding is owned by the site settings,
    // not the header instance. Retain the block-local image for standalone
    // renderer and builder previews where no tenant logo is supplied.
    const resolvedLogoImage = pageData.siteLogoUrl || logoImage;
    const resolvedLogoAlt = pageData.siteLogoAlt || logoText || "";

    const logo = (
        <NavLink href="/" className="no-underline">
            <div className="flex items-center gap-2">
                {resolvedLogoImage && (
                    <Image
                        src={resolvedLogoImage}
                        alt={resolvedLogoAlt}
                        width="w-8"
                        height="h-8"
                        borderRadius={2}
                    />
                )}
                {logoText && (
                    <Header4 theme={overriddenTheme}>{logoText}</Header4>
                )}
            </div>
        </NavLink>
    );

    const colorModeControl =
        showThemeSwitcher && toggleTheme ? (
            <ThemeModeSwitcher
                resolved={nextTheme ?? "light"}
                onToggle={toggleTheme}
                theme={overriddenTheme}
            />
        ) : null;

    const ctaAndMenu = (
        <div className="flex items-center gap-3">
            {colorModeControl}
            {buttonLinks.map((link) => (
                <div className="hidden lg:!block" key={link.id}>
                    <HeaderLink link={link} theme={overriddenTheme} />
                </div>
            ))}
            {ctaLabel && ctaHref && (
                <div className="hidden lg:!block">
                    <NavLink href={ctaHref}>
                        <Button theme={overriddenTheme} size="sm">
                            {ctaLabel}
                        </Button>
                    </NavLink>
                </div>
            )}
            <Drawer
                open={mobileNavOpen}
                setOpen={setMobileNavOpen}
                side="right"
                theme={overriddenTheme}
                trigger={
                    <Button
                        variant="ghost"
                        size="icon"
                        theme={overriddenTheme}
                        className="lg:!hidden"
                    >
                        <MenuIcon className="h-4 w-4" />
                        <span className="sr-only">Toggle menu</span>
                    </Button>
                }
            >
                <div className="mt-6 flex flex-col gap-4">
                    {links.map((link) => (
                        <HeaderLink
                            key={link.id}
                            link={link}
                            theme={overriddenTheme}
                            onClick={() => setMobileNavOpen(false)}
                        />
                    ))}
                    {ctaLabel && ctaHref && (
                        <NavLink
                            href={ctaHref}
                            onClick={() => setMobileNavOpen(false)}
                        >
                            <Button theme={overriddenTheme} className="w-full">
                                {ctaLabel}
                            </Button>
                        </NavLink>
                    )}
                </div>
            </Drawer>
        </div>
    );

    let mainContent: React.ReactNode;
    if (isCentered) {
        // Logo centered, nav links split evenly left and right of it — the
        // symmetric header pattern seen on many modern SaaS marketing sites.
        const half = Math.ceil(primaryLinks.length / 2);
        const leftLinks = primaryLinks.slice(0, half);
        const rightLinks = primaryLinks.slice(half);
        mainContent = (
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="hidden items-center justify-end gap-6 lg:!flex">
                    {leftLinks.map((link) => (
                        <HeaderLink
                            key={link.id}
                            link={link}
                            theme={overriddenTheme}
                        />
                    ))}
                </div>
                <div className="flex justify-center">{logo}</div>
                <div className="flex items-center justify-end gap-3">
                    <div className="hidden items-center gap-6 lg:!flex">
                        {rightLinks.map((link) => (
                            <HeaderLink
                                key={link.id}
                                link={link}
                                theme={overriddenTheme}
                            />
                        ))}
                    </div>
                    {ctaAndMenu}
                </div>
            </div>
        );
    } else {
        mainContent = (
            <div className="flex w-full items-center justify-between gap-4">
                {logo}
                <div
                    className={clsx(
                        "hidden items-center gap-6 lg:!flex lg:!grow",
                        linkAlignment === "right"
                            ? "justify-end"
                            : linkAlignment === "center"
                              ? "justify-center"
                              : "justify-start",
                    )}
                >
                    {primaryLinks.map((link) => (
                        <HeaderLink
                            key={link.id}
                            link={link}
                            theme={overriddenTheme}
                        />
                    ))}
                </div>
                {ctaAndMenu}
            </div>
        );
    }

    return (
        <Section
            theme={overriddenTheme}
            component="header"
            id={cssId}
            background={background}
            nextTheme={nextTheme}
            className={clsx(
                "sticky top-0 z-20",
                isFixed && "border-b",
                isFixed && backdropBlur && "bg-transparent backdrop-blur-2xl",
                isFixed && !backdropBlur && "bg-background",
                !isFixed && "bg-transparent",
            )}
        >
            {isFloating ? (
                <div
                    className={clsx(
                        "p-2",
                        overriddenTheme.interactives?.card?.border?.width ??
                            "border",
                        overriddenTheme.interactives?.card?.border?.radius ??
                            "rounded-xl",
                        overriddenTheme.interactives?.card?.border?.style,
                        overriddenTheme.interactives?.card?.shadow ??
                            "shadow-md",
                        backdropBlur
                            ? "bg-transparent backdrop-blur-2xl"
                            : "bg-card text-card-foreground",
                    )}
                >
                    {mainContent}
                </div>
            ) : (
                mainContent
            )}
        </Section>
    );
}
