"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { COLOR_MODE_STORAGE_KEY, isColorMode, type ColorMode } from "@/lib/color-mode";

type ColorModeContextValue = {
  mode: ColorMode;
  resolved: "light" | "dark";
  setMode: (mode: ColorMode) => void;
};

const ColorModeContext = createContext<ColorModeContextValue | null>(null);

function resolve(mode: ColorMode, prefersDark: boolean): "light" | "dark" {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (isColorMode(stored)) setModeState(stored);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolve(mode, media.matches);
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      localStorage.setItem(COLOR_MODE_STORAGE_KEY, mode);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, ready]);

  return (
    <ColorModeContext.Provider value={{ mode, resolved, setMode: setModeState }}>
      {children}
    </ColorModeContext.Provider>
  );
}

export function useColorMode(): ColorModeContextValue {
  const context = useContext(ColorModeContext);
  if (!context) {
    throw new Error("useColorMode must be used under ColorModeProvider");
  }
  return context;
}
