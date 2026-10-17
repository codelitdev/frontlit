export const COLOR_MODE_STORAGE_KEY = "color-mode";

export type ColorMode = "light" | "dark" | "system";

export function isColorMode(value: unknown): value is ColorMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Inline script for the server root layout. Applies `dark` on <html> before paint. */
export const colorModeBootstrapScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)})||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
