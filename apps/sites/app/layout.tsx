import "@frontlit/text-editor/styles.css";
import "./globals.css";
import { fontCss } from "@/lib/font-css";
import { ColorModeProvider } from "@/components/color-mode-provider";
import { ColorModeScript } from "@/components/color-mode-script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className="fl-fonts font-sans">
      <head>
        <style dangerouslySetInnerHTML={{ __html: fontCss }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ColorModeScript />
        <ColorModeProvider>{children}</ColorModeProvider>
      </body>
    </html>
  );
}
