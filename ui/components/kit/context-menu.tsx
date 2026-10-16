"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = { label: string; onSelect: () => void; disabled?: boolean; hint?: string } | "separator";

/**
 * Right-click menu rendered at the pointer. Closes on outside click, Escape, scroll, resize or after a choice,
 * and flips/clamps so it never leaves the viewport.
 */
export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: MenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) });
  }, [x, y]);

  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu" style={pos} onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-52 rounded-lg border border-border bg-popover p-1 text-[13px] shadow-2xl animate-in fade-in-0 zoom-in-95">
      {items.map((it, i) =>
        it === "separator" ? (
          <div key={i} className="-mx-1 my-1 h-px bg-border" />
        ) : (
          <button key={it.label} role="menuitem" disabled={it.disabled}
            onClick={() => { it.onSelect(); onClose(); }}
            className={cn("flex w-full items-center justify-between gap-6 rounded-md px-2.5 py-1.5 text-left transition", it.disabled ? "cursor-default opacity-40" : "hover:bg-accent")}>
            {it.label}
            {it.hint && <span className="font-mono text-[11px] text-muted-foreground">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  );
}
