export const COLOR_MODE_STORAGE_KEY = "color-mode";

export type ColorMode = "light" | "dark" | "system";

export function isColorMode(value: unknown): value is ColorMode {
  return value === "light" || value === "dark" || value === "system";
}

/** Set to "light" on <html> by pages that must not follow dark mode: the
 * embedded chat, whose launcher and frame are drawn in light colors by the
 * embed loader on the host page (docs/embedded-support.md §6.3). */
export const COLOR_MODE_LOCK_ATTRIBUTE = "data-color-mode-lock";

/** Inline script for the embed layout: locks the page to light mode. */
export const lightModeLockScript = `document.documentElement.setAttribute(${JSON.stringify("data-color-mode-lock")},"light");document.documentElement.classList.remove("dark");`;

/** Inline script for the server root layout. Applies `dark` on <html> before paint. */
export const colorModeBootstrapScript = `(function(){try{var m=localStorage.getItem(${JSON.stringify(COLOR_MODE_STORAGE_KEY)})||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
