import type { Metadata } from "next";
import "@frontlit/text-editor/styles.css";
import "./globals.css";
import * as fonts from "@/lib/fonts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/codelit/tooltip";

export const metadata: Metadata = {
    title: "FrontLit — the front office of your SaaS",
    description:
        "Build your SaaS website, publish content, support users, and grow your audience from one connected front office.",
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
            className={`${fonts.hankenGrotesk.variable} ${fonts.splineSansMono.variable} ${fonts.openSans.variable} ${fonts.montserrat.variable} ${fonts.lato.variable} ${fonts.poppins.variable} ${fonts.sourceSans3.variable} ${fonts.raleway.variable} ${fonts.notoSans.variable} ${fonts.merriweather.variable} ${fonts.inter.variable} ${fonts.alegreya.variable} ${fonts.roboto.variable} ${fonts.mulish.variable} ${fonts.nunito.variable} ${fonts.rubik.variable} ${fonts.playfairDisplay.variable} ${fonts.oswald.variable} ${fonts.ptSans.variable} ${fonts.workSans.variable} ${fonts.robotoSlab.variable} ${fonts.sourceSerif4.variable} ${fonts.bebasNeue.variable} ${fonts.quicksand.variable} font-sans`}
        >
            <body className="min-h-screen bg-background text-foreground antialiased">
                <TooltipProvider>
                    {children}
                    <Toaster />
                </TooltipProvider>
            </body>
        </html>
    );
}
