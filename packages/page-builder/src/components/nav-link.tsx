"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";

interface NavLinkProps {
    href: string;
    children?: React.ReactNode;
    openInSameTab?: boolean;
    style?: Record<string, string>;
    className?: string;
    onClick?: () => void;
}

/**
 * A navigation-aware link used inside block widgets. Internal paths use
 * Next.js client-side routing, in-page anchors scroll to the target, and
 * everything else falls back to a plain anchor tag.
 */
export function NavLink({
    href,
    children,
    openInSameTab = true,
    style,
    className = "",
    onClick,
}: NavLinkProps) {
    const isInternal = href && href.startsWith("/");
    const isInPageNavigation = href && href.startsWith("#");
    const router = useRouter();

    if (isInPageNavigation) {
        return (
            <a
                href={href}
                style={{ ...style }}
                className={className}
                onClick={onClick}
            >
                {children}
            </a>
        );
    }

    return isInternal ? (
        <NextLink
            href={href}
            style={{ ...style }}
            onClick={() => {
                router.push(href.toString());
                onClick?.();
            }}
            className={className}
        >
            {children}
        </NextLink>
    ) : (
        <a
            href={href}
            style={{ ...style }}
            className={className}
            onClick={(e) => {
                e.preventDefault();

                if (openInSameTab) {
                    window.location.href = href;
                } else {
                    window.open(href, "_blank");
                }
                onClick?.();
            }}
        >
            {children}
        </a>
    );
}
