"use client";
import { useMemo } from "react";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import { EvilPieChart } from "@/components/evilcharts/charts/recharts-pie-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { LANG_COLOR, bytes, type Repo } from "@/lib/hq";

/** Every chart in the app goes through Evil Charts. These wrappers shape our data into its composable parts. */

const AMBER = ["#fbbf24"];

/** Repos pushed per month for the last 12 months. */
export function Activity({ repos, className }: { repos: Repo[]; className?: string }) {
  const data = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, k) => {
      const m = new Date(now.getFullYear(), now.getMonth() - (11 - k), 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      return { label: m.toLocaleString("en", { month: "short" }), pushes: repos.filter((r) => !r.fork && r.pushed?.startsWith(key)).length };
    });
  }, [repos]);
  const config = { pushes: { label: "Repos pushed", colors: { dark: AMBER, light: AMBER } } } satisfies ChartConfig;
  return (
    <EvilBarChart data={data} config={config} barRadius={5} chartProps={{ margin: { top: 4, right: 0, bottom: 0, left: 0 } }} className={className ?? "h-36 w-full"}>
      <EvilBarChart.Grid vertical={false} />
      <EvilBarChart.XAxis dataKey="label" />
      <EvilBarChart.Bar dataKey="pushes" variant="hatched" />
      <EvilBarChart.Tooltip />
    </EvilBarChart>
  );
}

/** Language mix by bytes (non-fork repos) as a donut with a legend. */
export function Languages({ repos, className }: { repos: Repo[]; className?: string }) {
  const { data, config } = useMemo(() => {
    const t: Record<string, number> = {};
    repos.filter((r) => !r.fork).forEach((r) => Object.entries(r.langs ?? {}).forEach(([k, v]) => (t[k] = (t[k] ?? 0) + v)));
    const e = Object.entries(t).sort((a, b) => b[1] - a[1]);
    const top = e.slice(0, 6);
    const rest = e.slice(6).reduce((a, b) => a + b[1], 0);
    if (rest) top.push(["Other", rest]);
    const cfg: ChartConfig = {};
    const sum = top.reduce((a, [, v]) => a + v, 0);
    top.forEach(([k, v]) => { const c = LANG_COLOR[k] ?? "#71717a"; const pct = (v / sum) * 100; cfg[k] = { label: `${k} ${pct < 1 ? "<1" : Math.round(pct)}%`, colors: { dark: [c], light: [c] } }; });
    return { data: top.map(([name, value]) => ({ name, value })), config: cfg };
  }, [repos]);
  if (!data.length) return <p className="text-sm text-muted-foreground">No language data.</p>;
  return (
    <EvilPieChart data={data} config={config} dataKey="value" nameKey="name" className={className ?? "h-52 w-full"}>
      <EvilPieChart.Pie innerRadius="58%" paddingAngle={2} cornerRadius={4} />
      <EvilPieChart.Tooltip valueFormat={(v) => `${bytes(v)} of code`} />
      <EvilPieChart.Legend align="center" verticalAlign="bottom" />
    </EvilPieChart>
  );
}

/** Horizontal bars: which repos got the most commits recently. */
export function TopRepos({ items, loading }: { items: [string, number][]; loading?: boolean }) {
  const data = items.map(([name, commits]) => ({ name, commits }));
  const config = { commits: { label: "Commits", colors: { dark: AMBER, light: AMBER } } } satisfies ChartConfig;
  if (!data.length && !loading) return <p className="text-[13px] text-muted-foreground">No commits in the last 30 days.</p>;
  return (
    <EvilBarChart data={data} config={config} isLoading={loading} loadingBars={5} layout="horizontal" barRadius={4} barCategoryGap={5} chartProps={{ margin: { top: 0, right: 4, bottom: 0, left: 0 } }} className="h-[8.5rem] w-full">
      <EvilBarChart.XAxis type="number" hide />
      <EvilBarChart.YAxis dataKey="name" type="category" width={140} tickMargin={4} />
      <EvilBarChart.Bar dataKey="commits" variant="hatched" />
      <EvilBarChart.Tooltip />
    </EvilBarChart>
  );
}
