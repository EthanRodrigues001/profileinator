"use client";
import { EmptyState } from "@/components/kit/empty-state";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, GitCommitHorizontal, ArrowUpRight, CheckCircle2, ChevronRight, DownloadCloud, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { api, type Commit } from "@/lib/hq";
import type { TabKind } from "@/components/shell/nav";
import { useResumeCheck } from "./home-cards";
import { score } from "./score";
import type { Data } from "./use-hq";

type Go = (k: TabKind, a?: string) => void;

export function SectionHead({ title, count, right }: { title: string; count?: number | string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <h2 className="text-sm font-medium">{title}{count !== undefined && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{count}</span>}</h2>
      <div className="text-xs text-muted-foreground">{right}</div>
    </div>
  );
}

export const ViewAll = ({ onClick, label = "View all" }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1 transition hover:text-foreground">{label}<ArrowUpRight className="size-3" /></button>
);

const TODO_TAB: Record<string, TabKind> = { pinned: "repos" };

/** One list of everything worth doing: profile todos, broken links, and what the resume is missing. */
export function Attention({ d, go }: { d: Data; go: Go }) {
  const { files, current, tips } = useResumeCheck(d);
  const todos = score(d).todos;
  const items: { text: string; to: TabKind; cta: string }[] = [];
  if (files && !current) items.push({ text: "No resume stored. Upload your PDF so agents and the Resume page can use it.", to: "files", cta: "Upload" });
  if (tips) items.push({ text: `Your resume is missing ${tips} thing${tips === 1 ? "" : "s"} from your profile, or mentions claims without evidence.`, to: "resume", cta: "Review" });
  for (const t of todos) items.push({ text: t.text, to: TODO_TAB[t.tab] ?? (t.tab as TabKind), cta: "Open" });
  const shown = items.slice(0, 5);

  return (
    <section className="mt-6">
      <SectionHead title="Needs attention" count={items.length || undefined} />
      {shown.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {shown.map((i, n) => (
            <li key={n}>
              <button onClick={() => go(i.to)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] transition hover:bg-muted/30">
                <AlertCircle className="size-4 shrink-0 text-warn" />
                <span className="min-w-0 flex-1 truncate">{i.text}</span>
                <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">{i.cta}<ChevronRight className="size-3.5" /></span>
              </button>
            </li>
          ))}
          {items.length > shown.length && <li className="px-4 py-2 text-xs text-muted-foreground">+{items.length - shown.length} more in the Health panel</li>}
        </ul>
      ) : (
        <div className="flex items-center gap-2 border-y border-border px-4 py-3 text-[13px] text-muted-foreground"><CheckCircle2 className="size-4 text-ok" />All clear. Nothing needs your attention.</div>
      )}
    </section>
  );
}

/** What agents and you changed in the profile lately. */
export function AgentLog({ d, go }: { d: Data; go: Go }) {
  const rows = [...d.log].reverse().slice(0, 6);
  return (
    <div className="min-w-0">
      <SectionHead title="Recent changes" right={<ViewAll onClick={() => go("activity")} />} />
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((l, i) => (
          <li key={i} className="flex gap-4 px-4 py-2 text-[13px]">
            <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{l.date.slice(5)}</span>
            <span className={`min-w-0 flex-1 truncate ${l.kind === "change" ? "text-muted-foreground" : ""}`}>{l.text}</span>
          </li>
        ))}
        {!rows.length && <li className="px-4 py-4 text-sm text-muted-foreground">Nothing yet. Changes your agents make show up here.</li>}
      </ul>
    </div>
  );
}

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Commit momentum from the local cache: this week against last, a 14-day bar chart, streaks, and a nudge when today's streak is at risk. */
export function Momentum({ go, run }: { go: Go; run: (op: string, label: string, args?: object) => Promise<void> }) {
  const [feed, setFeed] = useState<Commit[] | null>(null);
  const load = () => api<Commit[]>("feed", { limit: 5000 }).then(setFeed).catch(() => setFeed([]));
  useEffect(() => { load(); }, []);

  const m = useMemo(() => {
    const days: Record<string, number> = {};
    const byRepo: Record<string, number> = {};
    for (const c of feed ?? []) {
      if (/\[bot\]|github-actions/i.test(c.author)) continue;
      const k = dayKey(c.date);
      days[k] = (days[k] ?? 0) + 1;
      if (Date.now() - Date.parse(c.date) < 7 * 864e5 && c.repo) byRepo[c.repo] = (byRepo[c.repo] ?? 0) + 1;
    }
    const sum = (from: number, to: number) => { let n = 0; for (let i = from; i < to; i++) n += days[keyOf(shift(i))] ?? 0; return n; };
    const week = sum(0, 7), prev = sum(7, 14);
    const top = Object.entries(byRepo).sort((a, b) => b[1] - a[1])[0];
    const today = days[keyOf(shift(0))] ?? 0;
    // streak: consecutive days with a commit, counting back from today (or yesterday if today has none yet)
    let streak = 0, i = today ? 0 : 1;
    while (days[keyOf(shift(i))]) { streak++; i++; }
    let best = 0, run_ = 0;
    for (let d = 365; d >= 0; d--) { if (days[keyOf(shift(d))]) { run_++; best = Math.max(best, run_); } else run_ = 0; }
    const chart = Array.from({ length: 14 }, (_, k) => {
      const d = shift(13 - k);
      const n = days[keyOf(d)] ?? 0;
      return { label: String(d.getDate()), full: d.toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" }), thisWeek: k >= 7 ? n : 0, lastWeek: k < 7 ? n : 0 };
    });
    return { week, prev, top, streak, best, today, chart };
  }, [feed]);

  const diff = m.week - m.prev;
  const evening = new Date().getHours() >= 17;
  const atRisk = !!feed && evening && m.today === 0 && m.streak > 0;
  const config = {
    lastWeek: { label: "Last week", colors: { dark: ["#78716c"], light: ["#78716c"] } },
    thisWeek: { label: "This week", colors: { dark: ["#fbbf24"], light: ["#fbbf24"] } },
  } satisfies ChartConfig;

  return (
    <div className="min-w-0 py-4">
      <SectionHead title="Momentum" right={<ViewAll onClick={() => go("commits")} />} />
      <div className="px-4">
        {feed && !feed.length ? (
          <div className="flex h-60"><EmptyState icon={GitCommitHorizontal} title="No commits cached yet" hint="Fetch your repos' history to see momentum." compact>
            <Button size="sm" variant="outline" onClick={async () => { await run("commits_all", "Fetching commits"); await load(); }}><DownloadCloud className="size-3.5" />Fetch commits</Button>
          </EmptyState></div>
        ) : (
          <div className="flex h-60 flex-col">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] text-muted-foreground">This week</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-3xl font-semibold tracking-tight">{m.week}</span>
                  <span className={`inline-flex items-center gap-0.5 text-xs ${diff >= 0 ? "text-ok" : "text-bad"}`}>
                    {diff >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {diff === 0 ? "same as last week" : `${Math.abs(diff)} ${diff > 0 ? "more" : "fewer"} than last week`}
                  </span>
                </div>
              </div>
              <div className="flex gap-6 text-right">
                <div><div className="text-[11px] text-muted-foreground">Streak</div><div className="mt-0.5 inline-flex items-center gap-1 text-xl font-semibold">{m.streak}<Flame className={`size-4 ${m.streak ? "text-brand" : "text-muted-foreground"}`} /></div></div>
                <div><div className="text-[11px] text-muted-foreground">Longest</div><div className="mt-0.5 text-xl font-semibold">{m.best}</div></div>
              </div>
            </div>

            <div className="mt-3 min-h-0 flex-1">
              <EvilBarChart data={m.chart} config={config} isLoading={!feed} stackType="stacked" barRadius={4} barCategoryGap={4} chartProps={{ margin: { top: 4, right: 0, bottom: 0, left: 0 } }} className="h-full w-full">
                <EvilBarChart.Grid vertical={false} />
                <EvilBarChart.XAxis dataKey="label" />
                <EvilBarChart.Bar dataKey="lastWeek" variant="hatched" />
                <EvilBarChart.Bar dataKey="thisWeek" variant="hatched" />
                <EvilBarChart.Tooltip hideZero labelFormatter={(_, payload) => ((payload[0] as { payload?: { full?: string } })?.payload?.full ?? "")} valueFormat={(v) => `${v} ${v === 1 ? "commit" : "commits"}`} />
                <EvilBarChart.Legend align="left" verticalAlign="bottom" />
              </EvilBarChart>
            </div>

            {atRisk ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-xs">
                <Flame className="size-4 shrink-0 text-brand" />
                <span>Your {m.streak}-day streak is at risk. A small commit today keeps it going.</span>
              </div>
            ) : m.top ? (
              <p className="mt-3 truncate text-xs text-muted-foreground">Busiest this week: <span className="text-foreground">{m.top[0]}</span> · {m.top[1]} commits</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
