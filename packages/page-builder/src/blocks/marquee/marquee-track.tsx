"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../primitives/lib/utils";

/**
 * Infinite horizontal scroller. Measures the width of one copy of the
 * content, then renders enough duplicate copies to always cover at least
 * twice the container's width, and animates a translateX loop across
 * exactly one content-width — because the duplicates repeat the same
 * sequence, the loop point is visually seamless regardless of how the
 * content width compares to the container width.
 */
export function MarqueeTrack({
    children,
    speed,
    direction,
    pauseOnHover,
}: {
    children: React.ReactNode;
    speed: number;
    direction: "left" | "right";
    pauseOnHover?: boolean;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [contentWidth, setContentWidth] = useState(0);
    const animationName = `pb-marquee-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

    useEffect(() => {
        const measure = () => {
            setContainerWidth(containerRef.current?.offsetWidth ?? 0);
            setContentWidth(contentRef.current?.offsetWidth ?? 0);
        };
        measure();
        window.addEventListener("resize", measure);
        return () => window.removeEventListener("resize", measure);
    }, [children, speed]);

    const duration = contentWidth > 0 ? contentWidth / speed : 0;
    const duplicatesNeeded =
        contentWidth > 0
            ? Math.max(2, Math.ceil((containerWidth * 2) / contentWidth))
            : 2;

    return (
        <div ref={containerRef} className="w-full overflow-hidden">
            {contentWidth > 0 && (
                <style>{`
                    @keyframes ${animationName} {
                        from { transform: translateX(0); }
                        to { transform: translateX(-${contentWidth}px); }
                    }
                `}</style>
            )}
            <div
                className={cn(
                    "inline-flex w-max",
                    pauseOnHover && "hover:[animation-play-state:paused]",
                )}
                style={
                    contentWidth > 0
                        ? {
                              animation: `${animationName} ${duration}s linear infinite`,
                              animationDirection:
                                  direction === "left" ? "reverse" : "normal",
                          }
                        : undefined
                }
            >
                <div ref={contentRef} className="inline-flex shrink-0">
                    {children}
                </div>
                {Array.from({ length: duplicatesNeeded }).map((_, i) => (
                    <div key={i} className="inline-flex shrink-0" aria-hidden>
                        {children}
                    </div>
                ))}
            </div>
        </div>
    );
}
