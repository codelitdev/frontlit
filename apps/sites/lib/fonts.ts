/**
 * Self-hosted theme fonts, served from `public/fonts`.
 *
 * Declared by hand (rather than with `next/font`) so the font URLs are stable
 * and `<link rel="preload">` can target just the families the active theme
 * uses. `fallback` holds the size-adjusted local fallback face's metrics, which
 * keeps text from shifting when the web font swaps in; monospace faces have none.
 *
 * A family's `id` matches the page-builder theme class `font-<id>` and the CSS
 * variable `--font-<id>`.
 */
export interface FontFile {
  url: string;
  weight: string;
}

export interface FontFallback {
  /** Local font the fallback face is sized against. */
  local: string;
  ascent: string;
  descent: string;
  lineGap: string;
  sizeAdjust: string;
}

export interface FontFamily {
  id: string;
  files: FontFile[];
  fallback: FontFallback | null;
}

export const DEFAULT_FONT_ID = "inter";

export const fontFamilies: FontFamily[] = [
  {
    id: "open-sans",
    files: [
      {
        url: "/fonts/open-sans/open-sans-latin-variable.woff2",
        weight: "300 800",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "101.58",
      descent: "27.84",
      lineGap: "0.0",
      sizeAdjust: "105.22",
    },
  },
  {
    id: "montserrat",
    files: [
      {
        url: "/fonts/montserrat/montserrat-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "87.85",
      descent: "22.78",
      lineGap: "0.0",
      sizeAdjust: "110.19",
    },
  },
  {
    id: "lato",
    files: [
      {
        url: "/fonts/lato/lato-latin-100-normal.woff2",
        weight: "100",
      },
      {
        url: "/fonts/lato/lato-latin-300-normal.woff2",
        weight: "300",
      },
      {
        url: "/fonts/lato/lato-latin-400-normal.woff2",
        weight: "400",
      },
      {
        url: "/fonts/lato/lato-latin-700-normal.woff2",
        weight: "700",
      },
      {
        url: "/fonts/lato/lato-latin-900-normal.woff2",
        weight: "900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "100.88",
      descent: "21.77",
      lineGap: "0.0",
      sizeAdjust: "97.84",
    },
  },
  {
    id: "poppins",
    files: [
      {
        url: "/fonts/poppins/poppins-latin-100-normal.woff2",
        weight: "100",
      },
      {
        url: "/fonts/poppins/poppins-latin-200-normal.woff2",
        weight: "200",
      },
      {
        url: "/fonts/poppins/poppins-latin-300-normal.woff2",
        weight: "300",
      },
      {
        url: "/fonts/poppins/poppins-latin-400-normal.woff2",
        weight: "400",
      },
      {
        url: "/fonts/poppins/poppins-latin-500-normal.woff2",
        weight: "500",
      },
      {
        url: "/fonts/poppins/poppins-latin-600-normal.woff2",
        weight: "600",
      },
      {
        url: "/fonts/poppins/poppins-latin-700-normal.woff2",
        weight: "700",
      },
      {
        url: "/fonts/poppins/poppins-latin-800-normal.woff2",
        weight: "800",
      },
      {
        url: "/fonts/poppins/poppins-latin-900-normal.woff2",
        weight: "900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "92.83",
      descent: "30.94",
      lineGap: "8.84",
      sizeAdjust: "113.11",
    },
  },
  {
    id: "source-sans-3",
    files: [
      {
        url: "/fonts/source-sans-3/source-sans-3-latin-variable.woff2",
        weight: "200 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "114.52",
      descent: "44.74",
      lineGap: "0.0",
      sizeAdjust: "89.41",
    },
  },
  {
    id: "raleway",
    files: [
      {
        url: "/fonts/raleway/raleway-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "92.39",
      descent: "23.0",
      lineGap: "0.0",
      sizeAdjust: "101.74",
    },
  },
  {
    id: "noto-sans",
    files: [
      {
        url: "/fonts/noto-sans/noto-sans-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "100.41",
      descent: "27.52",
      lineGap: "0.0",
      sizeAdjust: "106.47",
    },
  },
  {
    id: "merriweather",
    files: [
      {
        url: "/fonts/merriweather/merriweather-latin-variable.woff2",
        weight: "300 900",
      },
    ],
    fallback: {
      local: "Times New Roman",
      ascent: "83.68",
      descent: "23.22",
      lineGap: "0.0",
      sizeAdjust: "117.59",
    },
  },
  {
    id: "inter",
    files: [
      {
        url: "/fonts/inter/inter-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "89.79",
      descent: "22.36",
      lineGap: "0.0",
      sizeAdjust: "107.89",
    },
  },
  {
    id: "alegreya",
    files: [
      {
        url: "/fonts/alegreya/alegreya-latin-variable.woff2",
        weight: "400 900",
      },
    ],
    fallback: {
      local: "Times New Roman",
      ascent: "101.05",
      descent: "34.31",
      lineGap: "0.0",
      sizeAdjust: "100.55",
    },
  },
  {
    id: "roboto",
    files: [
      {
        url: "/fonts/roboto/roboto-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "92.43",
      descent: "24.32",
      lineGap: "0.0",
      sizeAdjust: "100.37",
    },
  },
  {
    id: "mulish",
    files: [
      {
        url: "/fonts/mulish/mulish-latin-variable.woff2",
        weight: "200 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "98.81",
      descent: "24.58",
      lineGap: "0.0",
      sizeAdjust: "101.71",
    },
  },
  {
    id: "nunito",
    files: [
      {
        url: "/fonts/nunito/nunito-latin-variable.woff2",
        weight: "200 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "103.02",
      descent: "35.97",
      lineGap: "0.0",
      sizeAdjust: "98.13",
    },
  },
  {
    id: "rubik",
    files: [
      {
        url: "/fonts/rubik/rubik-latin-variable.woff2",
        weight: "300 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "91.09",
      descent: "24.36",
      lineGap: "0.0",
      sizeAdjust: "102.64",
    },
  },
  {
    id: "playfair-display",
    files: [
      {
        url: "/fonts/playfair-display/playfair-display-latin-variable.woff2",
        weight: "400 900",
      },
    ],
    fallback: {
      local: "Times New Roman",
      ascent: "97.38",
      descent: "22.59",
      lineGap: "0.0",
      sizeAdjust: "111.11",
    },
  },
  {
    id: "oswald",
    files: [
      {
        url: "/fonts/oswald/oswald-latin-variable.woff2",
        weight: "200 700",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "146.78",
      descent: "35.56",
      lineGap: "0.0",
      sizeAdjust: "81.28",
    },
  },
  {
    id: "pt-sans",
    files: [
      {
        url: "/fonts/pt-sans/pt-sans-latin-400-normal.woff2",
        weight: "400",
      },
      {
        url: "/fonts/pt-sans/pt-sans-latin-700-normal.woff2",
        weight: "700",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "104.75",
      descent: "28.4",
      lineGap: "0.0",
      sizeAdjust: "97.18",
    },
  },
  {
    id: "work-sans",
    files: [
      {
        url: "/fonts/work-sans/work-sans-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "82.98",
      descent: "21.68",
      lineGap: "0.0",
      sizeAdjust: "112.07",
    },
  },
  {
    id: "roboto-slab",
    files: [
      {
        url: "/fonts/roboto-slab/roboto-slab-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Times New Roman",
      ascent: "89.03",
      descent: "23.02",
      lineGap: "0.0",
      sizeAdjust: "117.7",
    },
  },
  {
    id: "source-serif-4",
    files: [
      {
        url: "/fonts/source-serif-4/source-serif-4-latin-variable.woff2",
        weight: "200 900",
      },
    ],
    fallback: {
      local: "Times New Roman",
      ascent: "87.45",
      descent: "28.28",
      lineGap: "0.0",
      sizeAdjust: "118.46",
    },
  },
  {
    id: "bebas-neue",
    files: [
      {
        url: "/fonts/bebas-neue/bebas-neue-latin-400-normal.woff2",
        weight: "400",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "116.72",
      descent: "38.91",
      lineGap: "0.0",
      sizeAdjust: "77.11",
    },
  },
  {
    id: "quicksand",
    files: [
      {
        url: "/fonts/quicksand/quicksand-latin-variable.woff2",
        weight: "300 700",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "96.26",
      descent: "24.07",
      lineGap: "0.0",
      sizeAdjust: "103.88",
    },
  },
  {
    id: "archivo",
    files: [
      {
        url: "/fonts/archivo/archivo-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "85.41",
      descent: "20.43",
      lineGap: "0.0",
      sizeAdjust: "102.8",
    },
  },
  {
    id: "jetbrains-mono",
    files: [
      {
        url: "/fonts/jetbrains-mono/jetbrains-mono-latin-variable.woff2",
        weight: "100 800",
      },
    ],
    fallback: null,
  },
  {
    id: "hanken-grotesk",
    files: [
      {
        url: "/fonts/hanken-grotesk/hanken-grotesk-latin-variable.woff2",
        weight: "100 900",
      },
    ],
    fallback: {
      local: "Arial",
      ascent: "98.46",
      descent: "29.83",
      lineGap: "0.0",
      sizeAdjust: "101.56",
    },
  },
  {
    id: "spline-sans-mono",
    files: [
      {
        url: "/fonts/spline-sans-mono/spline-sans-mono-latin-variable.woff2",
        weight: "300 700",
      },
    ],
    fallback: null,
  },
];
