"use client";
import { useEffect } from "react";

/**
 * A desktop app should not show the browser's Back / Refresh / Print menu. Right-click is left alone only where the native menu is
 * useful (text fields, selected text, links); our own context menus (tabs, rows) still open because they handle the event themselves.
 */
export function NativeMenuGuard() {
  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      if (el.closest("input, textarea, [contenteditable=true], [data-native-menu]")) return;
      if (window.getSelection()?.toString().trim()) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);
  return null;
}
