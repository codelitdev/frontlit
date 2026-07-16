import type { Metadata } from "next";
import "./global.css";
import { DocsProvider } from "@/components/docs-provider";

export const metadata: Metadata = {
    title: {
        default: "FrontLit Docs",
        template: "%s | FrontLit Docs",
    },
    description: "Documentation for FrontLit's page builder, APIs, and page-builder components.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body>
                <DocsProvider>{children}</DocsProvider>
            </body>
        </html>
    );
}
