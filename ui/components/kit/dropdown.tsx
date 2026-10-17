"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

/** shadcn Select with a plain options API, used everywhere a dropdown is needed. */
export function Dropdown({ value, onChange, options, placeholder, className, size = "default", disabled, contentClassName }: {
  value: string; onChange: (v: string) => void; options: Option[]; placeholder?: string; className?: string; size?: "sm" | "default"; disabled?: boolean; contentClassName?: string;
}) {
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")} items={items} disabled={disabled}>
      <SelectTrigger size={size} className={cn("w-full min-w-0", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start" className={cn("max-h-72", contentClassName)}>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
