import React from "react";

/** The FrontLit petal mark. Header and footer fall back to it, with the
 * "FrontLit" name, until a site sets its own branding. */
export function FrontLitLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      aria-hidden
    >
      <g
        fill="oklch(0.62 0.16 230 / 0.15)"
        stroke="oklch(0.62 0.16 230)"
        strokeWidth="2.4"
        strokeLinejoin="round"
      >
        {[
          [41.19, 22.81, 45],
          [41.19, 41.19, 135],
          [22.81, 41.19, 225],
          [22.81, 22.81, 315],
        ].map(([x, y, angle]) => (
          <path
            key={angle}
            d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z"
            transform={`translate(${x},${y}) rotate(${angle})`}
          />
        ))}
      </g>
    </svg>
  );
}

export const FRONTLIT_NAME = "FrontLit";
