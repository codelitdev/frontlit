export type ColorMode = "light" | "dark" | "system";
export type ResolvedColorMode = "light" | "dark";

export function resolveColorMode(
    mode: ColorMode,
    systemPrefersDark: boolean,
): ResolvedColorMode {
    if (mode === "system") return systemPrefersDark ? "dark" : "light";
    return mode;
}

/** Flip the painted palette. First click leaves "system" for an explicit side. */
export function toggleColorMode(
    resolved: ResolvedColorMode,
): ResolvedColorMode {
    return resolved === "dark" ? "light" : "dark";
}
