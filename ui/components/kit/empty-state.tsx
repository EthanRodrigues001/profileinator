"use client";
import type { LucideIcon } from "lucide-react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** The one empty state of the app: shadcn Empty with an icon, a title, a hint and an optional action. */
export function EmptyState({ icon: Icon, title, hint, children, compact, className }: {
  icon?: LucideIcon; title: string; hint?: React.ReactNode; children?: React.ReactNode; compact?: boolean; className?: string;
}) {
  return (
    <Empty className={cn("border", compact ? "gap-3 p-5" : "p-10", className)}>
      <EmptyHeader>
        {Icon && <EmptyMedia variant="icon"><Icon /></EmptyMedia>}
        <EmptyTitle className={compact ? "text-[13px]" : "text-sm"}>{title}</EmptyTitle>
        {hint && <EmptyDescription className="text-xs">{hint}</EmptyDescription>}
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}
