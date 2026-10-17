"use client";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/hq";
import { CopyButton } from "./rail/shared";

type Req = { term: string; status: "backed" | "gap" | "avoid"; evidence: string; node?: string | null };
type Result = { score: number; backed: number; gaps: number; avoid: number; requirements: Req[]; note: string };

const GROUPS: { status: Req["status"]; title: string; hint: string; tone: string }[] = [
  { status: "backed", title: "You can back these", hint: "evidence found in your profile", tone: "text-ok" },
  { status: "gap", title: "Not backed", hint: "do not claim these without proof", tone: "text-warn" },
  { status: "avoid", title: "You said to avoid", hint: "from your positioning rules", tone: "text-bad" },
];

/** Paste a job description; see which technologies it asks for your profile can and cannot back. Runs locally (hq match_job). */
export function JobMatch() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const analyse = async () => {
    setBusy(true);
    try { setRes(await api<Result>("match_job", { text })); } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  };
  const prompt = res
    ? `Use the hq MCP server. I am applying for a role. The job description is below. My profile backs: ${res.requirements.filter((r) => r.status === "backed").map((r) => r.term).join(", ") || "none"}. It does not back: ${res.requirements.filter((r) => r.status === "gap").map((r) => r.term).join(", ") || "none"}. Write a tailored summary and 3 bullets using only facts from ask and graph_explain, never claim the gaps, and list what I should learn or leave out.\n\n${text}`
    : "";

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <p className="text-sm text-muted-foreground">Paste a job description. It is compared with your stored skills, stack and projects on this computer; nothing is sent anywhere.</p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the job description here…" className="mt-3 min-h-40 resize-y text-[13px]" />
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={analyse} disabled={busy || text.trim().length < 20}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}Check my match</Button>
        {res && <CopyButton text={prompt} label="Copy tailoring prompt" done="Prompt copied" />}
      </div>

      {res && (
        <div className="mt-8">
          <div className="flex items-end gap-6 border-y border-border py-4">
            <div><div className="text-[11px] text-muted-foreground">Match</div><div className="text-3xl font-semibold tracking-tight">{res.score}%</div></div>
            <div className="text-xs text-muted-foreground"><div>{res.backed} backed</div><div>{res.gaps} not backed</div>{res.avoid > 0 && <div>{res.avoid} to avoid</div>}</div>
            <div className="ml-auto h-1.5 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand" style={{ width: `${res.score}%` }} /></div>
          </div>
          {!res.requirements.length && <p className="mt-4 text-sm text-muted-foreground">No technologies recognised in that text. Paste the requirements section.</p>}
          {GROUPS.map((g) => {
            const rows = res.requirements.filter((r) => r.status === g.status);
            if (!rows.length) return null;
            return (
              <section key={g.status} className="mt-6">
                <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80"><span className={g.tone}>{g.title}</span><span className="normal-case tracking-normal">· {g.hint}</span></div>
                <ul className="divide-y divide-border border-y border-border">
                  {rows.map((r) => <li key={r.term} className="flex items-baseline justify-between gap-4 px-1 py-2 text-[13px]"><span className="font-medium">{r.term}</span><span className="text-right text-xs text-muted-foreground">{r.evidence}</span></li>)}
                </ul>
              </section>
            );
          })}
          <p className="mt-6 text-xs text-muted-foreground">{res.note}</p>
        </div>
      )}
    </div>
  );
}
