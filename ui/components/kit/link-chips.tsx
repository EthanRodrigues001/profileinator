import type { Link, LinkState } from "@/lib/hq";
import { StatusIcon, linkState } from "./status-icon";
import { Tip } from "./tip";
import { BrandLink } from "./tech-badge";

/** Brand fill and glyph per link id, matching the badges on the GitHub profile. Unknown ids get a neutral badge. */
const BRAND: Record<string, { hex: string; icon?: string }> = {
  portfolio: { hex: "000000", icon: "vercel" },
  github: { hex: "181717", icon: "github" },
  linkedin: { hex: "0A66C2" },
  x: { hex: "000000", icon: "x" },
  email: { hex: "EA4335", icon: "gmail" },
  cal: { hex: "292929", icon: "caldotcom" },
  resume_url: { hex: "34A853", icon: "googledrive" },
};

/** Where to find the person: branded badge links, each with a small health dot from the last link check. */
export function LinkChips({ links, state }: { links: Link[]; state: Record<string, LinkState> }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {links.map((l) => {
        const st = state[l.url]?.status;
        const b = BRAND[l.id] ?? { hex: "3f3f46" };
        return (
          <BrandLink key={l.id} label={l.label} href={l.url} hex={b.hex} icon={b.icon}>
            <Tip content={`Last check: ${st ?? "not checked yet"}`}><StatusIcon state={linkState(st)} size={13} className="ml-0.5" /></Tip>
          </BrandLink>
        );
      })}
    </div>
  );
}
