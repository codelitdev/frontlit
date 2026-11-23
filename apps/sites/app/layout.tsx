// Rich-text reading styles only. The package's styles.css is a whole
// Tailwind build for the editor (toolbar, menus, block settings); the site
// compiles its own utilities (globals.css).
import "@frontlit/text-editor/prose.css";
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
