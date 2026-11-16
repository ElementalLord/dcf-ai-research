"use client";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme";

// Light is the default. The choice lives on <html data-theme> and is remembered per browser.
export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    if (next === "dark") root.dataset.theme = "dark";
    else delete root.dataset.theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch {}
  };
  // Both icons render; CSS shows the right one, so server and client markup always match.
  return <button type="button" className="theme-toggle" onClick={toggle} aria-label="Switch between light and dark mode" title="Light / dark mode">
    <Moon className="theme-icon-moon" aria-hidden="true" />
    <Sun className="theme-icon-sun" aria-hidden="true" />
  </button>;
}
