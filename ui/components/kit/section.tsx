"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Small count shown next to the title. */
  count?: number;
  /** Fold the section behind its header. Off by default: only long lists (experience, education) need it. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * Whole-section dropdown: a full-width hairline header (mono label, count, chevron) that folds its content.
 * Hairline-ruled so stacked sections read as one sheet next to SpecGrid and DataTable.
 */
export function Section({ title, icon: Icon, count, collapsible = false, defaultOpen = true, children, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={cn("border-t border-border", className)}>
      <button onClick={() => collapsible && setOpen((o) => !o)} aria-expanded={open} className={cn("flex w-full items-center gap-2.5 px-8 py-4 text-left transition", collapsible ? "cursor-pointer hover:bg-card/40" : "cursor-default")}>
        {Icon && <Icon className="size-3.5 text-muted-foreground" />}
        <h2 className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{title}</h2>
        {count !== undefined && <span className="font-mono text-[11px] text-muted-foreground/60">{count}</span>}
        {collapsible && <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />}
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200", open || !collapsible ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="px-8 pb-8 pt-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
