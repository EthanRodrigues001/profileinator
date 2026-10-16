import * as si from "simple-icons";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tip } from "./tip";

type Brand = { title: string; hex: string; path: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const INDEX = new Map<string, Brand>(
  (Object.values(si) as unknown[])
    .filter((v): v is Brand => typeof v === "object" && v !== null && "path" in v && "hex" in v && "title" in v)
    .map((i) => [norm(i.title), i]),
);

/** Names people write that simple-icons spells differently. */
const ALIAS: Record<string, string> = {
  nextjs: "nextdotjs", nodejs: "nodedotjs", postgres: "postgresql", tailwind: "tailwindcss", gemini: "googlegemini",
  vercelaisdk: "vercel", aisdk: "vercel", sklearn: "scikitlearn", reactnative: "react", expo: "expo",
};

/** "Python (scikit-learn, XGBoost)" -> "Python"; "Expo / React Native" -> "Expo". */
export const shortName = (s: string) => s.split(/ \(| \/ | \+ /)[0].trim();

export function brandFor(name: string): Brand | undefined {
  const n = norm(shortName(name));
  return INDEX.get(n) ?? INDEX.get(ALIAS[n] ?? "");
}

/** Black text on light brand colours, white on dark ones. */
const ink = (hex: string) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#111" : "#fff";
};

const Glyph = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" className="size-3 shrink-0" fill="currentColor" aria-hidden><path d={path} /></svg>
);

/**
 * shieldcn "branded" badge, rebuilt natively on the shadcn Badge: brand-coloured fill, brand glyph, short label.
 * Unknown technologies fall back to the neutral secondary badge so nothing is mislabelled.
 */
export function TechBadge({ name, className }: { name: string; className?: string }) {
  const b = brandFor(name);
  const label = shortName(name);
  const full = name !== label ? name : "";
  if (!b) return <Tip content={full}><Badge variant="secondary" className={cn("h-6 rounded-md px-2 text-xs font-medium", className)}>{label}</Badge></Tip>;
  return (
    <Tip content={full}>
      <Badge className={cn("h-6 gap-1.5 rounded-md border border-white/15 px-2 text-xs font-medium", className)} style={{ background: `#${b.hex}`, color: ink(b.hex) }}>
        <Glyph path={b.path} />{label}
      </Badge>
    </Tip>
  );
}

/** Same badge as a link, with an explicit brand colour and glyph (Portfolio, LinkedIn, X, Email, Cal.com). */
export function BrandLink({ label, href, hex, icon, children }: { label: string; href: string; hex: string; icon?: string; children?: React.ReactNode }) {
  const g = icon ? INDEX.get(norm(icon)) : undefined;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="transition hover:opacity-85">
      <Badge className="h-7 gap-1.5 rounded-md border border-white/15 px-2.5 text-[13px] font-medium" style={{ background: `#${hex}`, color: ink(hex) }}>
        {g && <Glyph path={g.path} />}{label}{children}
      </Badge>
    </a>
  );
}
