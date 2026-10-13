import type { SectionBackground } from "../../models";

function svgToDataUri(svg: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export type PatternPresetCategory = "tile" | "glow";

export interface PatternPreset {
  id: string;
  label: string;
  /** Grouping for the preset filter chips in the background panel. */
  category: PatternPresetCategory;
  /** Short blurb for tooltips / a11y. */
  description?: string;
  /**
   * Fields merged into the background's "gradient" (pattern) settings.
   * Light-mode pattern first; dark variants use lower-opacity white
   * strokes so the same tile reads on dark section colors.
   */
  apply: Pick<
    SectionBackground,
    | "backgroundImage"
    | "backgroundImageDark"
    | "gradientBackgroundSize"
    | "gradientBackgroundPosition"
    | "gradientBackgroundRepeat"
    | "gradientMaskImage"
  >;
}

// ─── SVG tile helpers ───────────────────────────────────────────────────────
// Stroke / fill colors are low-contrast so patterns sit behind content
// without fighting it. Dark-mode twins use white at similar opacity.

const light = {
  soft: "rgba(0,0,0,0.06)",
  mid: "rgba(0,0,0,0.09)",
  firm: "rgba(0,0,0,0.12)",
  strong: "rgba(0,0,0,0.16)",
} as const;

const dark = {
  soft: "rgba(255,255,255,0.06)",
  mid: "rgba(255,255,255,0.09)",
  firm: "rgba(255,255,255,0.12)",
  strong: "rgba(255,255,255,0.16)",
} as const;

function dotsSvg(fill: string, size = 16, r = 1.35) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 4}" cy="${size / 4}" r="${r}" fill="${fill}"/></svg>`;
}

function gridSvg(stroke: string, size = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${size} 0H0V${size}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function diagonalSvg(stroke: string, size = 24) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 ${size} ${size} 0M-${size / 4} ${size / 4} ${size / 4}-${size / 4}M${size * 0.75} ${size * 1.25} ${size * 1.25} ${size * 0.75}" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function contourSvg(stroke: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><g fill="none" stroke="${stroke}" stroke-width="1">
<path d="M0,15 Q37.5,-5 75,15 T150,15 T225,15 T300,15"/>
<path d="M0,45 Q37.5,25 75,45 T150,45 T225,45 T300,45"/>
<path d="M0,75 Q37.5,55 75,75 T150,75 T225,75 T300,75"/>
<path d="M0,105 Q37.5,85 75,105 T150,105 T225,105 T300,105"/>
<path d="M0,135 Q37.5,115 75,135 T150,135 T225,135 T300,135"/>
</g></svg>`;
}

function plusSvg(stroke: string, size = 24) {
  const mid = size / 2;
  const arm = size * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${mid} ${mid - arm}v${arm * 2}M${mid - arm} ${mid}h${arm * 2}" fill="none" stroke="${stroke}" stroke-width="1.25" stroke-linecap="round"/></svg>`;
}

function graphPaperSvg(minor: string, major: string, size = 80) {
  const step = size / 4;
  const lines: string[] = [];
  for (let i = 1; i < 4; i++) {
    lines.push(`M${i * step} 0V${size}`, `M0 ${i * step}H${size}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<path d="${lines.join("")}" fill="none" stroke="${minor}" stroke-width="1"/>
<path d="M${size} 0H0V${size}" fill="none" stroke="${major}" stroke-width="1"/>
</svg>`;
}

function hexSvg(stroke: string, size = 56) {
  // Pointy-top hex that tiles on a rectangular grid with slight overlap feel
  const w = size;
  const h = Math.round(size * 0.866);
  // Simplified repeating hex outline
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><path d="M${w * 0.25} 0 L${w * 0.75} 0 L${w} ${h / 2} L${w * 0.75} ${h} L${w * 0.25} ${h} L0 ${h / 2} Z" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function chevronSvg(stroke: string, size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 ${size * 0.35} L${size / 2} ${size * 0.65} L${size} ${size * 0.35}" fill="none" stroke="${stroke}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function verticalLinesSvg(stroke: string, size = 12) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M1 0V${size}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function horizontalLinesSvg(stroke: string, size = 14) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 1H${size}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function crosshatchSvg(stroke: string, size = 20) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 ${size} ${size} 0M-${size / 4} ${size / 4} ${size / 4}-${size / 4}M${size * 0.75} ${size * 1.25} ${size * 1.25} ${size * 0.75}M0 0 ${size} ${size}M-${size / 4} ${size * 0.75} ${size / 4} ${size * 1.25}M${size * 0.75} ${-size / 4} ${size * 1.25} ${size / 4}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function diamondSvg(stroke: string, size = 28) {
  const m = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${m} 1 L${size - 1} ${m} L${m} ${size - 1} L1 ${m} Z" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function wavesSvg(stroke: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><path d="M0 20 Q15 0 30 20 T60 20 T90 20 T120 20" fill="none" stroke="${stroke}" stroke-width="1.25"/></svg>`;
}

function concentricSvg(stroke: string, size = 64) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<circle cx="${c}" cy="${c}" r="${size * 0.18}" fill="none" stroke="${stroke}" stroke-width="1"/>
<circle cx="${c}" cy="${c}" r="${size * 0.32}" fill="none" stroke="${stroke}" stroke-width="1"/>
<circle cx="${c}" cy="${c}" r="${size * 0.46}" fill="none" stroke="${stroke}" stroke-width="1"/>
</svg>`;
}

function isometricSvg(stroke: string, size = 48) {
  // Classic isometric cube outline tile
  const s = size;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s * 0.866}">
<path d="M${s / 2} 0 L${s} ${s * 0.2165} L${s / 2} ${s * 0.433} L0 ${s * 0.2165} Z M${s / 2} ${s * 0.433} V${s * 0.866} M0 ${s * 0.2165} V${s * 0.65} L${s / 2} ${s * 0.866} L${s} ${s * 0.65} V${s * 0.2165}" fill="none" stroke="${stroke}" stroke-width="1"/>
</svg>`;
}

function trianglesSvg(stroke: string, size = 36) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${Math.round(size * 0.866)}"><path d="M${size / 2} 1 L${size - 1} ${size * 0.866 - 1} L1 ${size * 0.866 - 1} Z" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function scatterDotsSvg(fill: string, size = 48) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
<circle cx="8" cy="10" r="1.2" fill="${fill}"/>
<circle cx="22" cy="6" r="0.9" fill="${fill}"/>
<circle cx="38" cy="14" r="1.5" fill="${fill}"/>
<circle cx="14" cy="28" r="1" fill="${fill}"/>
<circle cx="30" cy="24" r="0.8" fill="${fill}"/>
<circle cx="42" cy="36" r="1.1" fill="${fill}"/>
<circle cx="6" cy="40" r="0.95" fill="${fill}"/>
<circle cx="24" cy="42" r="1.3" fill="${fill}"/>
</svg>`;
}

function brickSvg(stroke: string, w = 40, h = 20) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h * 2}">
<path d="M0 0H${w}V${h}H0Z M0 ${h}H${w / 2}V${h * 2}H0Z M${w / 2} ${h}H${w}V${h * 2}H${w / 2}Z" fill="none" stroke="${stroke}" stroke-width="1"/>
</svg>`;
}

function scalesSvg(stroke: string, size = 32) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size * 0.6}"><path d="M0 ${size * 0.6} A${size / 2} ${size * 0.55} 0 0 1 ${size} ${size * 0.6}" fill="none" stroke="${stroke}" stroke-width="1"/></svg>`;
}

function dashedGridSvg(stroke: string, size = 28) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M${size} 0H0V${size}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="3 4"/></svg>`;
}

function circuitSvg(stroke: string, size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="none" stroke="${stroke}" stroke-width="1" stroke-linecap="round">
<path d="M8 8H28V28H8Z"/>
<path d="M36 12H52V20H36Z"/>
<path d="M12 36H20V52H12Z"/>
<path d="M28 8V4M8 16H4M28 20H36M20 28V36M44 20V36H36"/>
<circle cx="36" cy="36" r="3"/>
<circle cx="52" cy="44" r="2.5"/>
<path d="M39 36H49M52 41.5V36"/>
</svg>`;
}

function zigZagSvg(stroke: string, size = 24) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><path d="M0 ${size / 2} L${size / 4} ${size * 0.2} L${size / 2} ${size / 2} L${size * 0.75} ${size * 0.8} L${size} ${size / 2}" fill="none" stroke="${stroke}" stroke-width="1.25" stroke-linejoin="round"/></svg>`;
}

/** Build a light + dark SVG pattern preset. */
function svgPattern(
  id: string,
  label: string,
  lightSvg: string,
  darkSvg: string,
  size: string,
  description?: string,
  extras?: Partial<PatternPreset["apply"]>,
): PatternPreset {
  return {
    id,
    label,
    category: "tile",
    description,
    apply: {
      backgroundImage: svgToDataUri(lightSvg),
      backgroundImageDark: svgToDataUri(darkSvg),
      gradientBackgroundSize: size,
      gradientBackgroundRepeat: "repeat",
      gradientBackgroundPosition: "0 0",
      gradientMaskImage: undefined,
      ...extras,
    },
  };
}

/** Full-bleed CSS gradient / mesh presets (no tiling). */
function cssPattern(
  id: string,
  label: string,
  lightCss: string,
  darkCss: string,
  description?: string,
  extras?: Partial<PatternPreset["apply"]>,
): PatternPreset {
  return {
    id,
    label,
    category: "glow",
    description,
    apply: {
      backgroundImage: lightCss,
      backgroundImageDark: darkCss,
      gradientBackgroundSize: "100% 100%",
      gradientBackgroundRepeat: "no-repeat",
      gradientBackgroundPosition: "center",
      gradientMaskImage: undefined,
      ...extras,
    },
  };
}

/**
 * Ready-made background patterns for the "Pattern" tab of the section
 * background panel — a preset picker over the same free-CSS
 * `backgroundImage` / size / repeat fields, so choosing one is a single
 * click instead of hand-writing an SVG data URI. Tiled patterns include
 * dark-mode twins; mesh/glow presets use full-bleed CSS gradients.
 *
 * Tune any field afterwards under Advanced, or bring your own CSS.
 */
export const PATTERN_PRESETS: PatternPreset[] = [
  // ── Classic tiles ────────────────────────────────────────────────────
  svgPattern(
    "dots",
    "Dots",
    dotsSvg(light.firm),
    dotsSvg(dark.firm),
    "16px 16px",
    "Subtle dot grid — the default SaaS texture",
  ),
  svgPattern(
    "dots-fine",
    "Fine dots",
    dotsSvg(light.mid, 10, 0.9),
    dotsSvg(dark.mid, 10, 0.9),
    "10px 10px",
    "Tighter, quieter polka texture",
  ),
  svgPattern(
    "scatter",
    "Scatter",
    scatterDotsSvg(light.firm),
    scatterDotsSvg(dark.firm),
    "48px 48px",
    "Organic, uneven speckles",
  ),
  svgPattern(
    "grid",
    "Grid",
    gridSvg(light.mid),
    gridSvg(dark.mid),
    "32px 32px",
    "Clean square lattice",
  ),
  svgPattern(
    "graph-paper",
    "Graph paper",
    graphPaperSvg(light.soft, light.firm),
    graphPaperSvg(dark.soft, dark.firm),
    "80px 80px",
    "Notebook-style minor + major grid",
  ),
  svgPattern(
    "dashed-grid",
    "Dashed grid",
    dashedGridSvg(light.mid),
    dashedGridSvg(dark.mid),
    "28px 28px",
    "Soft technical grid with dashed strokes",
  ),
  svgPattern(
    "diagonal",
    "Diagonal lines",
    diagonalSvg(light.mid),
    diagonalSvg(dark.mid),
    "24px 24px",
    "Classic hatch at 45°",
  ),
  svgPattern(
    "crosshatch",
    "Crosshatch",
    crosshatchSvg(light.soft),
    crosshatchSvg(dark.soft),
    "20px 20px",
    "Crossed diagonals for richer grain",
  ),
  svgPattern(
    "plus",
    "Plus marks",
    plusSvg(light.firm),
    plusSvg(dark.firm),
    "24px 24px",
    "Cross / plus marks — popular on product pages",
  ),
  svgPattern(
    "vertical",
    "Pinstripe",
    verticalLinesSvg(light.mid),
    verticalLinesSvg(dark.mid),
    "12px 12px",
    "Editorial vertical lines",
  ),
  svgPattern(
    "horizontal",
    "Ruled lines",
    horizontalLinesSvg(light.mid),
    horizontalLinesSvg(dark.mid),
    "14px 14px",
    "Horizontal notebook rules",
  ),
  svgPattern(
    "zigzag",
    "Zigzag",
    zigZagSvg(light.mid),
    zigZagSvg(dark.mid),
    "24px 24px",
    "Continuous zigzag band",
  ),
  svgPattern(
    "chevron",
    "Chevron",
    chevronSvg(light.mid),
    chevronSvg(dark.mid),
    "28px 28px",
    "Stacked chevrons for motion",
  ),
  svgPattern(
    "diamond",
    "Diamonds",
    diamondSvg(light.mid),
    diamondSvg(dark.mid),
    "28px 28px",
    "Geometric diamond lattice",
  ),
  svgPattern(
    "triangles",
    "Triangles",
    trianglesSvg(light.mid),
    trianglesSvg(dark.mid),
    "36px 31px",
    "Tessellated triangle outlines",
  ),
  svgPattern(
    "hexagon",
    "Hexagons",
    hexSvg(light.mid),
    hexSvg(dark.mid),
    "56px 48px",
    "Honeycomb / tech hex grid",
  ),
  svgPattern(
    "isometric",
    "Isometric",
    isometricSvg(light.mid),
    isometricSvg(dark.mid),
    "48px 42px",
    "3D cube lattice",
  ),
  svgPattern(
    "waves",
    "Waves",
    wavesSvg(light.mid),
    wavesSvg(dark.mid),
    "120px 40px",
    "Gentle repeating sine waves",
  ),
  svgPattern(
    "contour",
    "Contour",
    contourSvg(light.soft),
    contourSvg(dark.soft),
    "300px 150px",
    "Topographic contour strokes",
  ),
  svgPattern(
    "concentric",
    "Ripples",
    concentricSvg(light.soft),
    concentricSvg(dark.soft),
    "64px 64px",
    "Concentric circle tiles",
  ),
  svgPattern(
    "scales",
    "Scales",
    scalesSvg(light.mid),
    scalesSvg(dark.mid),
    "32px 19px",
    "Fish-scale / arc tile",
  ),
  svgPattern(
    "brick",
    "Brick",
    brickSvg(light.mid),
    brickSvg(dark.mid),
    "40px 40px",
    "Offset brick running bond",
  ),
  svgPattern(
    "circuit",
    "Circuit",
    circuitSvg(light.mid),
    circuitSvg(dark.mid),
    "64px 64px",
    "Tech / PCB-inspired traces",
  ),

  // ── Full-bleed CSS (modern hero / marketing) ─────────────────────────
  cssPattern(
    "soft-mesh",
    "Soft mesh",
    `radial-gradient(at 20% 20%, rgba(99,102,241,0.18) 0px, transparent 50%), radial-gradient(at 80% 10%, rgba(236,72,153,0.14) 0px, transparent 45%), radial-gradient(at 50% 80%, rgba(34,211,238,0.12) 0px, transparent 50%), radial-gradient(at 90% 70%, rgba(250,204,21,0.1) 0px, transparent 40%)`,
    `radial-gradient(at 20% 20%, rgba(99,102,241,0.28) 0px, transparent 50%), radial-gradient(at 80% 10%, rgba(236,72,153,0.22) 0px, transparent 45%), radial-gradient(at 50% 80%, rgba(34,211,238,0.18) 0px, transparent 50%), radial-gradient(at 90% 70%, rgba(250,204,21,0.12) 0px, transparent 40%)`,
    "Colorful soft blobs — modern marketing hero",
  ),
  cssPattern(
    "aurora",
    "Aurora",
    `linear-gradient(135deg, rgba(56,189,248,0.2), transparent 50%), linear-gradient(225deg, rgba(167,139,250,0.22), transparent 50%), linear-gradient(45deg, rgba(52,211,153,0.15), transparent 40%)`,
    `linear-gradient(135deg, rgba(56,189,248,0.28), transparent 50%), linear-gradient(225deg, rgba(167,139,250,0.3), transparent 50%), linear-gradient(45deg, rgba(52,211,153,0.2), transparent 40%)`,
    "Layered aurora bands",
  ),
  cssPattern(
    "spotlight",
    "Spotlight",
    `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.22), transparent 55%)`,
    `radial-gradient(ellipse 80% 60% at 50% -10%, rgba(129,140,248,0.35), transparent 55%)`,
    "Top-centered spotlight glow",
  ),
  cssPattern(
    "bottom-glow",
    "Bottom glow",
    `radial-gradient(ellipse 70% 50% at 50% 110%, rgba(14,165,233,0.2), transparent 55%)`,
    `radial-gradient(ellipse 70% 50% at 50% 110%, rgba(56,189,248,0.28), transparent 55%)`,
    "Soft light rising from the bottom edge",
  ),
  cssPattern(
    "corner-glow",
    "Corner glow",
    `radial-gradient(ellipse 60% 50% at 0% 0%, rgba(244,63,94,0.16), transparent 50%), radial-gradient(ellipse 50% 45% at 100% 100%, rgba(59,130,246,0.16), transparent 50%)`,
    `radial-gradient(ellipse 60% 50% at 0% 0%, rgba(251,113,133,0.25), transparent 50%), radial-gradient(ellipse 50% 45% at 100% 100%, rgba(96,165,250,0.25), transparent 50%)`,
    "Opposite-corner color accents",
  ),
  cssPattern(
    "horizon",
    "Horizon fade",
    `linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.04) 55%, rgba(15,23,42,0.08) 100%)`,
    `linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.04) 55%, rgba(255,255,255,0.1) 100%)`,
    "Gentle vertical vignette toward the base",
  ),
  cssPattern(
    "diagonal-fade",
    "Diagonal fade",
    `linear-gradient(135deg, rgba(99,102,241,0.12) 0%, transparent 45%, rgba(236,72,153,0.1) 100%)`,
    `linear-gradient(135deg, rgba(129,140,248,0.2) 0%, transparent 45%, rgba(244,114,182,0.16) 100%)`,
    "Two-tone diagonal wash",
  ),
  svgPattern(
    "grid-fade",
    "Fading grid",
    gridSvg(light.firm, 40),
    gridSvg(dark.firm, 40),
    "40px 40px",
    "Grid that softens toward the edges",
    {
      gradientMaskImage:
        "radial-gradient(ellipse at center, black 25%, transparent 75%)",
    },
  ),
];
