import "@frontlit/text-editor/styles.css";
import "./globals.css";
import * as fonts from "@/lib/fonts";
import { ColorModeProvider } from "@/components/color-mode-provider";
import { colorModeBootstrapScript } from "@/lib/color-mode";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fonts.openSans.variable} ${fonts.montserrat.variable} ${fonts.lato.variable} ${fonts.poppins.variable} ${fonts.sourceSans3.variable} ${fonts.raleway.variable} ${fonts.notoSans.variable} ${fonts.merriweather.variable} ${fonts.inter.variable} ${fonts.alegreya.variable} ${fonts.roboto.variable} ${fonts.mulish.variable} ${fonts.nunito.variable} ${fonts.rubik.variable} ${fonts.playfairDisplay.variable} ${fonts.oswald.variable} ${fonts.ptSans.variable} ${fonts.workSans.variable} ${fonts.robotoSlab.variable} ${fonts.sourceSerif4.variable} ${fonts.bebasNeue.variable} ${fonts.quicksand.variable} ${fonts.archivo.variable} ${fonts.jetbrainsMono.variable} ${fonts.hankenGroteskLocal.variable} ${fonts.splineSansMonoLocal.variable} font-sans ${fonts.inter.className}`}
    >
      <body className="min-h-screen bg-background text-foreground antialiased">
        <script
          // Runs before paint so the first frame matches the stored
          // light / dark / system preference (same job as next-themes).

          dangerouslySetInnerHTML={{
            __html: colorModeBootstrapScript,
          }}
        />
        <ColorModeProvider>{children}</ColorModeProvider>
      </body>
    </html>
  );
}
