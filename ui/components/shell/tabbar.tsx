"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { ContextMenu, type MenuItem } from "@/components/kit/context-menu";
import { tabIcon, type Tab } from "./nav";

export type CloseMode = "self" | "others" | "left" | "right" | "all";

type Props = {
  tabs: Tab[];
  active: string;
  onSelect: (id: string) => void;
  onClose: (mode: CloseMode, id: string) => void;
};

/**
 * Editor-style tab strip: icon, title, optional dot, close button, amber top rule on the active tab.
 * Right-click a tab for Close, Close others, Close to the left/right and Close all. Middle-click closes.
 */
export function TabBar({ tabs, active, onSelect, onClose }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  const items = (id: string): MenuItem[] => {
    const i = tabs.findIndex((t) => t.id === id);
    return [
      { label: "Close", hint: "Middle click", disabled: tabs.length < 2, onSelect: () => onClose("self", id) },
      { label: "Close others", disabled: tabs.length < 2, onSelect: () => onClose("others", id) },
      "separator",
      { label: "Close to the left", disabled: i <= 0, onSelect: () => onClose("left", id) },
      { label: "Close to the right", disabled: i === tabs.length - 1, onSelect: () => onClose("right", id) },
      "separator",
      { label: "Close all", disabled: tabs.length < 2 && tabs[0]?.kind === "home", onSelect: () => onClose("all", id) },
    ];
  };

  return (
    <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const Icon = tabIcon(t.kind);
        const on = t.id === active;
        return (
          <div
            key={t.id}
            onClick={() => onSelect(t.id)}
            onAuxClick={(e) => e.button === 1 && tabs.length > 1 && onClose("self", t.id)}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }); }}
            className={`group relative flex min-w-32 max-w-56 cursor-pointer select-none items-center gap-2 border-r border-border px-3.5 text-sm transition ${
              on ? "bg-background text-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
            }`}
          >
            {on && <span className="absolute inset-x-0 top-0 h-px bg-brand" />}
            <Icon className="size-3.5 shrink-0" />
            <span className="truncate">{t.title}</span>
            {t.dot && <i className="size-1.5 shrink-0 rounded-full bg-brand" />}
            {tabs.length > 1 && (
              <button
                aria-label={`Close ${t.title}`}
                onClick={(e) => { e.stopPropagation(); onClose("self", t.id); }}
                className="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={items(menu.id)} onClose={() => setMenu(null)} />}
    </div>
  );
}
