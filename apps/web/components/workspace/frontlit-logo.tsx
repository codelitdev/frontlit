/** The FrontLit petal mark from `@codelitdev/design-system/assets/logo-frontlit.svg`. */
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
                <path
                    d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z"
                    transform="translate(41.19,22.81) rotate(45)"
                />
                <path
                    d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z"
                    transform="translate(41.19,41.19) rotate(135)"
                />
                <path
                    d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z"
                    transform="translate(22.81,41.19) rotate(225)"
                />
                <path
                    d="M0,-11 C5.5,-5.5 5.5,5.5 0,11 C-5.5,5.5 -5.5,-5.5 0,-11 Z"
                    transform="translate(22.81,22.81) rotate(315)"
                />
            </g>
        </svg>
    );
}
