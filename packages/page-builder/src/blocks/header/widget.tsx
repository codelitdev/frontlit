import React from "react";
import clsx from "clsx";
import { Github } from "lucide-react";
import type { WidgetProps, ThemeStyle } from "../../models";
import type { HeaderSettings } from "./settings";
import { Image } from "../../components/image";
import { NavLink } from "../../components/nav-link";
import { Button, Header4, Section } from "../../primitives";
import { HeaderLink } from "./header-link";
import { HeaderMobileMenu } from "./mobile-menu";
import { GithubStars } from "./github-stars";
import { parseGithubRepo } from "./github";

export function HeaderWidget({
  settings: {
    logoCorners,
    links = [],
    ctaLabel,
    ctaHref,
    linkAlignment = "left",
    layout = "fixed",
    backdropBlur = false,
    githubRepo,
    showGithubStars,
    cssId,
    maxWidth,
    verticalPadding,
    background,
  },
  state: { theme },
  pageData,
}: WidgetProps<HeaderSettings>) {
  const overriddenTheme: ThemeStyle = JSON.parse(JSON.stringify(theme.theme));
  overriddenTheme.structure.page.width = maxWidth || theme.theme.structure.page.width;
  overriddenTheme.structure.section.padding.y =
    verticalPadding || theme.theme.structure.section.padding.y;

  const isFloating = layout === "floating";
  const isCentered = layout === "centered";
  const isFixed = !isFloating;
  const primaryLinks = links.filter((link) => !link.isButton);
  const buttonLinks = links.filter((link) => link.isButton);
  // The logo and title always come from Branding; an unset one renders nothing.
  const resolvedLogoImage = pageData.siteLogoUrl;
  const resolvedLogoText = pageData.siteTitle;
  const resolvedLogoAlt = pageData.siteLogoAlt || resolvedLogoText || "";
  const effectiveLogoCorners = logoCorners ?? 2;
  const hasCta = Boolean(ctaLabel && ctaHref);
  const repo = parseGithubRepo(githubRepo);

  const logo = (
    <NavLink href="/" className="no-underline">
      <div className="flex items-center gap-2">
        {resolvedLogoImage && (
          <Image
            src={resolvedLogoImage}
            alt={resolvedLogoAlt}
            width="w-8"
            height="h-8"
            sizes="32px"
            className="aspect-square shrink-0"
            borderRadius={effectiveLogoCorners}
          />
        )}
        {resolvedLogoText && (
          <Header4 theme={overriddenTheme} as="span">
            {resolvedLogoText}
          </Header4>
        )}
      </div>
    </NavLink>
  );

  const ctaAndMenu = (
    <div className="flex items-center gap-3">
      {repo && (
        <a
          href={`https://github.com/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button theme={overriddenTheme} variant="ghost" size="sm" className="gap-1.5">
            <Github className="h-4 w-4" aria-hidden />
            <span className="sr-only">GitHub repository</span>
            {showGithubStars && <GithubStars repo={repo} />}
          </Button>
        </a>
      )}
      {buttonLinks.map((link) => (
        <div className="hidden lg:!block" key={link.id}>
          <HeaderLink link={link} theme={overriddenTheme} />
        </div>
      ))}
      {hasCta && (
        <div className="hidden lg:!block">
          <NavLink href={ctaHref}>
            <Button theme={overriddenTheme} size="sm">
              {ctaLabel}
            </Button>
          </NavLink>
        </div>
      )}
      {(links.length > 0 || hasCta) && (
        <div className="lg:hidden">
          <HeaderMobileMenu
            links={links}
            ctaLabel={ctaLabel}
            ctaHref={ctaHref}
            theme={overriddenTheme}
          />
        </div>
      )}
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
            <HeaderLink key={link.id} link={link} theme={overriddenTheme} />
          ))}
        </div>
        <div className="flex justify-center">{logo}</div>
        <div className="flex items-center justify-end gap-3">
          <div className="hidden items-center gap-6 lg:!flex">
            {rightLinks.map((link) => (
              <HeaderLink key={link.id} link={link} theme={overriddenTheme} />
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
            <HeaderLink key={link.id} link={link} theme={overriddenTheme} />
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
            overriddenTheme.interactives?.card?.border?.width ?? "border",
            overriddenTheme.interactives?.card?.border?.radius ?? "rounded-xl",
            overriddenTheme.interactives?.card?.border?.style,
            overriddenTheme.interactives?.card?.shadow ?? "shadow-md",
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
