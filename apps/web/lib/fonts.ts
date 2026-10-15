import localFont from "next/font/local";
import { Hanken_Grotesk, Spline_Sans_Mono } from "next/font/google";

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const splineSansMono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const openSans = localFont({
  src: [
    {
      path: "../public/fonts/open-sans/open-sans-latin-variable.woff2",
      weight: "300 800",
      style: "normal",
    },
  ],
  variable: "--font-open-sans",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const montserrat = localFont({
  src: [
    {
      path: "../public/fonts/montserrat/montserrat-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-montserrat",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const lato = localFont({
  src: [
    {
      path: "../public/fonts/lato/lato-latin-100-normal.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/lato/lato-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/lato/lato-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/lato/lato-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/lato/lato-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-lato",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const poppins = localFont({
  src: [
    {
      path: "../public/fonts/poppins/poppins-latin-100-normal.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-200-normal.woff2",
      weight: "200",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-300-normal.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-800-normal.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../public/fonts/poppins/poppins-latin-900-normal.woff2",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-poppins",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const sourceSans3 = localFont({
  src: [
    {
      path: "../public/fonts/source-sans-3/source-sans-3-latin-variable.woff2",
      weight: "200 900",
      style: "normal",
    },
  ],
  variable: "--font-source-sans-3",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const raleway = localFont({
  src: [
    {
      path: "../public/fonts/raleway/raleway-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-raleway",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const notoSans = localFont({
  src: [
    {
      path: "../public/fonts/noto-sans/noto-sans-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-noto-sans",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const merriweather = localFont({
  src: [
    {
      path: "../public/fonts/merriweather/merriweather-latin-variable.woff2",
      weight: "300 900",
      style: "normal",
    },
  ],
  variable: "--font-merriweather",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const inter = localFont({
  src: [
    {
      path: "../public/fonts/inter/inter-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const alegreya = localFont({
  src: [
    {
      path: "../public/fonts/alegreya/alegreya-latin-variable.woff2",
      weight: "400 900",
      style: "normal",
    },
  ],
  variable: "--font-alegreya",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const roboto = localFont({
  src: [
    {
      path: "../public/fonts/roboto/roboto-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-roboto",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const mulish = localFont({
  src: [
    {
      path: "../public/fonts/mulish/mulish-latin-variable.woff2",
      weight: "200 900",
      style: "normal",
    },
  ],
  variable: "--font-mulish",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const nunito = localFont({
  src: [
    {
      path: "../public/fonts/nunito/nunito-latin-variable.woff2",
      weight: "200 900",
      style: "normal",
    },
  ],
  variable: "--font-nunito",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const rubik = localFont({
  src: [
    {
      path: "../public/fonts/rubik/rubik-latin-variable.woff2",
      weight: "300 900",
      style: "normal",
    },
  ],
  variable: "--font-rubik",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const playfairDisplay = localFont({
  src: [
    {
      path: "../public/fonts/playfair-display/playfair-display-latin-variable.woff2",
      weight: "400 900",
      style: "normal",
    },
  ],
  variable: "--font-playfair-display",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const oswald = localFont({
  src: [
    {
      path: "../public/fonts/oswald/oswald-latin-variable.woff2",
      weight: "200 700",
      style: "normal",
    },
  ],
  variable: "--font-oswald",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const ptSans = localFont({
  src: [
    {
      path: "../public/fonts/pt-sans/pt-sans-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/pt-sans/pt-sans-latin-700-normal.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pt-sans",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const workSans = localFont({
  src: [
    {
      path: "../public/fonts/work-sans/work-sans-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-work-sans",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const robotoSlab = localFont({
  src: [
    {
      path: "../public/fonts/roboto-slab/roboto-slab-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-roboto-slab",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const sourceSerif4 = localFont({
  src: [
    {
      path: "../public/fonts/source-serif-4/source-serif-4-latin-variable.woff2",
      weight: "200 900",
      style: "normal",
    },
  ],
  variable: "--font-source-serif-4",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  adjustFontFallback: "Times New Roman",
});

export const bebasNeue = localFont({
  src: [
    {
      path: "../public/fonts/bebas-neue/bebas-neue-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-bebas-neue",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const quicksand = localFont({
  src: [
    {
      path: "../public/fonts/quicksand/quicksand-latin-variable.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-quicksand",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const archivo = localFont({
  src: [
    {
      path: "../public/fonts/archivo/archivo-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-archivo",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const jetbrainsMono = localFont({
  src: [
    {
      path: "../public/fonts/jetbrains-mono/jetbrains-mono-latin-variable.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  // Arial metrics don't fit a monospace face; fall back to the mono stack.
  adjustFontFallback: false,
});

export const hankenGroteskLocal = localFont({
  src: [
    {
      path: "../public/fonts/hanken-grotesk/hanken-grotesk-latin-variable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-hanken-grotesk",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
});

export const splineSansMonoLocal = localFont({
  src: [
    {
      path: "../public/fonts/spline-sans-mono/spline-sans-mono-latin-variable.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-spline-sans-mono",
  display: "swap",
  // Theme fonts load only when a page uses them; preloading every
  // family would download all of them on every page.
  preload: false,
  // Arial metrics don't fit a monospace face; fall back to the mono stack.
  adjustFontFallback: false,
});
