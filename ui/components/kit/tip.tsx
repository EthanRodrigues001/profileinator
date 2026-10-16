"use client";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Styled tooltip around any inline content. Replaces native title="" so hints look the same everywhere. */
export function Tip({ content, children, side = "top", className }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  if (!content) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger delay={150} render={<span className={className ?? "inline-flex"} />}>{children}</TooltipTrigger>
      <TooltipContent side={side}>{content}</TooltipContent>
    </Tooltip>
  );
}
