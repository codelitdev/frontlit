import {
    createWidgetInstance,
    PATTERN_PRESETS,
    type Theme,
    type ThemeStyle,
    type WidgetInstance,
} from "@frontlit/page-builder";

const contourPattern = PATTERN_PRESETS.find((p) => p.id === "contour")!.apply;

/**
 * A warm, editorial theme in the style of Datacurve's careers page: cream
 * background, serif display headings, restrained accent color, soft card
 * shadows. Built to exercise the page-builder's theme system end to end —
 * every value below is an ordinary `ThemeStyle` field, nothing bespoke.
 */
const careersThemeStyle: ThemeStyle = {
    colors: {
        light: {
            background: "#F5F1E8",
            foreground: "#211E1A",
            card: "#FFFFFF",
            cardForeground: "#211E1A",
            popover: "#FFFFFF",
            popoverForeground: "#211E1A",
            primary: "#211E1A",
            primaryForeground: "#F5F1E8",
            secondary: "#B4693E",
            secondaryForeground: "#FFFFFF",
            muted: "#EAE4D5",
            mutedForeground: "#8C8172",
            accent: "#B4693E",
            accentForeground: "#FFFFFF",
            border: "#E3DCC9",
            destructive: "#B3261E",
            input: "#FFFFFF",
            ring: "#211E1A",
            chart1: "#211E1A",
            chart2: "#B4693E",
            chart3: "#5B7A8C",
            chart4: "#A13F30",
            chart5: "#8C8172",
            sidebar: "#FFFFFF",
            sidebarForeground: "#211E1A",
            sidebarPrimary: "#211E1A",
            sidebarPrimaryForeground: "#F5F1E8",
            sidebarAccent: "#B4693E",
            sidebarAccentForeground: "#FFFFFF",
            sidebarBorder: "#E3DCC9",
            sidebarRing: "#211E1A",
            shadow2xs: "0 1px 2px 0px rgb(33 30 26 / 0.04)",
            shadowXs: "0 1px 2px 0px rgb(33 30 26 / 0.05)",
            shadowSm: "0 2px 6px 0px rgb(33 30 26 / 0.06)",
            shadowMd: "0 4px 14px 0px rgb(33 30 26 / 0.07)",
            shadowLg: "0 10px 28px 0px rgb(33 30 26 / 0.08)",
            shadowXl: "0 16px 40px 0px rgb(33 30 26 / 0.09)",
            shadow2xl: "0 24px 56px 0px rgb(33 30 26 / 0.1)",
        },
        dark: {
            background: "#1A1815",
            foreground: "#F5F1E8",
            card: "#242220",
            cardForeground: "#F5F1E8",
            popover: "#242220",
            popoverForeground: "#F5F1E8",
            primary: "#F5F1E8",
            primaryForeground: "#1A1815",
            secondary: "#C98259",
            secondaryForeground: "#1A1815",
            muted: "#2E2B27",
            mutedForeground: "#A69C8C",
            accent: "#C98259",
            accentForeground: "#1A1815",
            border: "#37332D",
            destructive: "#D14B3D",
            input: "#242220",
            ring: "#F5F1E8",
            chart1: "#F5F1E8",
            chart2: "#C98259",
            chart3: "#7FA1B4",
            chart4: "#D14B3D",
            chart5: "#A69C8C",
            sidebar: "#242220",
            sidebarForeground: "#F5F1E8",
            sidebarPrimary: "#F5F1E8",
            sidebarPrimaryForeground: "#1A1815",
            sidebarAccent: "#C98259",
            sidebarAccentForeground: "#1A1815",
            sidebarBorder: "#37332D",
            sidebarRing: "#F5F1E8",
            shadow2xs: "0 1px 2px 0px rgb(0 0 0 / 0.2)",
            shadowXs: "0 1px 2px 0px rgb(0 0 0 / 0.25)",
            shadowSm: "0 2px 6px 0px rgb(0 0 0 / 0.3)",
            shadowMd: "0 4px 14px 0px rgb(0 0 0 / 0.35)",
            shadowLg: "0 10px 28px 0px rgb(0 0 0 / 0.4)",
            shadowXl: "0 16px 40px 0px rgb(0 0 0 / 0.45)",
            shadow2xl: "0 24px 56px 0px rgb(0 0 0 / 0.5)",
        },
    },
    typography: {
        preheader: {
            fontFamily: "font-work-sans",
            fontSize: "text-sm",
            fontWeight: "font-medium",
            lineHeight: "leading-normal",
            letterSpacing: "tracking-wide",
        },
        header1: {
            fontFamily: "font-playfair-display",
            fontSize: "text-6xl",
            fontWeight: "font-medium",
            lineHeight: "leading-tight",
            letterSpacing: "tracking-tight",
        },
        header2: {
            fontFamily: "font-playfair-display",
            fontSize: "text-4xl",
            fontWeight: "font-medium",
            lineHeight: "leading-tight",
            letterSpacing: "tracking-tight",
        },
        header3: {
            fontFamily: "font-playfair-display",
            fontSize: "text-3xl",
            fontWeight: "font-medium",
            lineHeight: "leading-snug",
            letterSpacing: "tracking-tight",
        },
        header4: {
            fontFamily: "font-playfair-display",
            fontSize: "text-xl",
            fontWeight: "font-medium",
            lineHeight: "leading-snug",
        },
        subheader1: {
            fontFamily: "font-work-sans",
            fontSize: "text-lg",
            fontWeight: "font-normal",
            lineHeight: "leading-relaxed",
        },
        subheader2: {
            fontFamily: "font-work-sans",
            fontSize: "text-base",
            fontWeight: "font-normal",
            lineHeight: "leading-relaxed",
        },
        text1: {
            fontFamily: "font-work-sans",
            fontSize: "text-base",
            fontWeight: "font-normal",
            lineHeight: "leading-relaxed",
        },
        text2: {
            fontFamily: "font-work-sans",
            fontSize: "text-sm",
            fontWeight: "font-normal",
            lineHeight: "leading-relaxed",
        },
        link: {
            fontFamily: "font-work-sans",
            fontSize: "text-sm",
            fontWeight: "font-medium",
        },
        button: {
            fontFamily: "font-work-sans",
            fontSize: "text-sm",
            fontWeight: "font-medium",
        },
        input: {
            fontFamily: "font-work-sans",
            fontSize: "text-sm",
            fontWeight: "font-normal",
        },
        caption: {
            fontFamily: "font-work-sans",
            fontSize: "text-xs",
            fontWeight: "font-normal",
            lineHeight: "leading-normal",
        },
    },
    interactives: {
        button: {
            padding: { x: "px-5", y: "py-3" },
            border: { width: "border-0", radius: "rounded-md" },
            shadow: "shadow-none",
            custom: "transition-colors duration-150 ease-in-out",
        },
        link: {
            padding: { x: "px-0", y: "py-0" },
            custom: "underline decoration-1 underline-offset-2 transition-colors duration-150 ease-in-out",
        },
        card: {
            padding: { x: "px-5", y: "py-5" },
            border: {
                width: "border",
                radius: "rounded-2xl",
                style: "border-solid",
            },
            shadow: "shadow-sm",
            custom: "transition-shadow duration-200 ease-in hover:shadow-md",
        },
        input: {
            borderRadius: "rounded-md",
            padding: { x: "px-3", y: "py-2" },
            border: {
                width: "border",
                radius: "rounded-md",
                style: "border-solid",
            },
            shadow: "shadow-none",
        },
    },
    structure: {
        page: { width: "max-w-6xl" },
        section: {
            padding: { x: "px-6", y: "py-20" },
        },
    },
};

export const careersTheme: Theme = {
    id: "datacurve-careers-demo",
    name: "Careers (editorial)",
    theme: careersThemeStyle,
};

const roleImage = (seed: string) =>
    `https://picsum.photos/seed/${seed}/800/1000`;

/**
 * A page mirroring Datacurve's careers page — same block set as any other
 * FrontLit page, seeded as the builder demo's starting point instead of
 * the generic default layout.
 */
export const careersLayout: WidgetInstance[] = [
    createWidgetInstance("rich-text", {
        alignment: "center",
        verticalPadding: "py-0",
        background: { type: "color", backgroundColor: "#CFE8F3" },
        text: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "Introducing DeepSWE, our long-horizon coding benchmark →",
                        },
                    ],
                },
            ],
        },
    }),
    createWidgetInstance("header", {
        logoText: "Datacurve",
        links: [
            { id: "nav-products", label: "Products", href: "#products" },
            { id: "nav-research", label: "Research", href: "#research" },
            { id: "nav-careers", label: "Careers", href: "#careers" },
            { id: "nav-contact", label: "Contact", href: "#contact" },
        ],
        ctaLabel: undefined,
        ctaHref: undefined,
        linkAlignment: "right",
        layout: "fixed",
    }),
    createWidgetInstance("hero", {
        preTitle: "Careers",
        title: "Come build the machinery that makes models more capable.",
        description: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "We're a small group of intense, driven, relentlessly-curious technologists pouring our energy into the most important problems in AI. We're looking for people that allow us to stay that way.",
                        },
                    ],
                },
            ],
        },
        layout: "centered",
        background: {
            type: "gradient",
            ...contourPattern,
        },
    }),
    createWidgetInstance("grid", {
        columns: 3,
        headerAlignment: "center",
        verticalPadding: "py-8",
        items: [
            {
                title: "Software Engineer",
                media: { mediaId: "role-swe", file: roleImage("sutro-tower") },
                mediaAlignment: "overlay",
                buttonAction: "#apply-swe",
            },
            {
                title: "Research Engineer",
                media: {
                    mediaId: "role-research",
                    file: roleImage("coit-tower"),
                },
                mediaAlignment: "overlay",
                buttonAction: "#apply-research",
            },
            {
                title: "Growth / Operations",
                media: {
                    mediaId: "role-growth",
                    file: roleImage("golden-gate"),
                },
                mediaAlignment: "overlay",
                buttonAction: "#apply-growth",
            },
        ],
    }),
    createWidgetInstance("rich-text", {
        alignment: "center",
        verticalPadding: "py-4",
        text: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        { type: "text", text: "Don't see your shape? " },
                        {
                            type: "text",
                            text: "careers@datacurve.ai",
                            marks: [
                                {
                                    type: "link",
                                    attrs: {
                                        href: "mailto:careers@datacurve.ai",
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    }),
    createWidgetInstance("content", {
        title: "Our work",
        headerAlignment: "left",
        layout: "stacked",
        maxWidth: "max-w-3xl",
        body: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "Working at Datacurve is fast, focused, and quietly ambitious — shipping work that matters at world scale, with the autonomy and intention to do it best. We're a small team working long days on systems and solutions that compound. The people here are curious, opinionated, and the kind you'd want to spend ten hours a day with.",
                        },
                    ],
                },
            ],
        },
    }),
    createWidgetInstance("content", {
        title: "Benefits",
        headerAlignment: "left",
        layout: "stacked",
        maxWidth: "max-w-3xl",
        verticalPadding: "py-4",
        body: {
            type: "doc",
            content: [
                {
                    type: "paragraph",
                    content: [
                        {
                            type: "text",
                            text: "Our best work happens when we feel healthy, moving, and focused. The benefits below come with every full-time role.",
                        },
                    ],
                },
            ],
        },
    }),
    createWidgetInstance("grid", {
        columns: 2,
        headerAlignment: "left",
        maxWidth: "max-w-3xl",
        verticalPadding: "py-4",
        items: [
            {
                title: "Health & wellness",
                description:
                    "Medical insurance · Dental & vision insurance · Health & fitness stipend",
            },
            {
                title: "Everyday & beyond",
                description:
                    "Meals covered in-office · Commuter benefits · 401(k) contributions",
            },
        ],
    }),
    createWidgetInstance("footer", {
        logoText: "Datacurve",
        tagline: "Building the machinery that makes models more capable.",
    }),
];
