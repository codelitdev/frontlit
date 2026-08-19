import type { Metadata } from "next";
import "./global.css";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";
import { DocsProvider } from "@/components/docs-provider";

const hankenGrotesk = Hanken_Grotesk({
    subsets: ["latin"],
    variable: "--font-sans",
});
const splineSansMono = Spline_Sans_Mono({
    subsets: ["latin"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: {
        default: "FrontLit Docs",
        template: "%s | FrontLit Docs",
    },
    description:
        "Documentation for FrontLit's components, APIs, and self-hosting.",
    icons: {
        icon: "/icon.svg",
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html
            lang="en"
            data-product="frontlit"
            className={`font-sans ${hankenGrotesk.variable} ${splineSansMono.variable}`}
            suppressHydrationWarning
        >
            <body className="antialiased">
                <DocsProvider>{children}</DocsProvider>
            </body>
        </html>
    );
}
