"use client";
import { Initials, StageChip } from "@/components/kit/cells";
import { DataTable } from "@/components/kit/data-table";
import { ago, isLocal } from "@/lib/hq";
import type { TabKind } from "@/components/shell/nav";
import { AsciiBackdrop, MONO } from "./banner";
import { ProfileOrbit } from "./profile-orbit";
import { HomeCards } from "./home-cards";
import { AgentLog, Attention, Momentum, SectionHead, ViewAll } from "./home-sections";
import { Languages, type ViewProps } from "./views";

/** Home: hero with the profile coil, at-a-glance cards, attention list, charts, pinned table, activity. Search lives in the top bar. */
export function Home({ d, run, go }: ViewProps) {
  const pinned = d.repos.filter((r) => r.pinned);
  const open = (k: TabKind, a?: string) => go(k, a);

  return (
    <div className="pb-10">
      <div className="relative h-[29rem] overflow-hidden border-b border-border max-sm:h-[24rem]">
        <AsciiBackdrop shape="eclipse" cellSize={16} colors={MONO} className="opacity-50" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_40%_45%_at_50%_50%,color-mix(in_srgb,var(--background)_35%,transparent),transparent_80%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-0"><ProfileOrbit d={d} go={open} /></div>
      </div>

      <HomeCards d={d} go={go} />

      <Attention d={d} go={go} />

      <section className="mt-8 grid border-y border-border max-lg:divide-y lg:grid-cols-2 lg:divide-x divide-border">
        <div className="min-w-0 py-4">
          <SectionHead title="Languages" />
          <div className="h-60 px-4"><Languages repos={d.repos} className="h-full w-full" /></div>
        </div>
        <Momentum go={go} run={run} />
      </section>

      <section className="mt-8">
        <SectionHead title="Pinned projects" count={pinned.length} right={<ViewAll onClick={() => open("repos")} />} />
        <DataTable toolbar={false} noun="projects" rows={pinned} rowKey={(r) => r.name} onRowClick={(r) => open("project", r.name)}
          empty="Nothing pinned. Open Projects and star some."
          columns={[
            { key: "n", header: "Project", className: "w-64", cell: (r) => <div className="flex items-center gap-2.5"><Initials text={r.name} /><span className="font-medium">{r.name}</span></div> },
            { key: "s", header: "Stack", cell: (r) => {
              const techs = [...new Set([...(r.stack ?? []), ...(r.detected ?? []).map((x) => x.name)])];
              return <span className="text-muted-foreground">{(techs.length ? techs : Object.keys(r.langs ?? {})).slice(0, 3).join(" · ")}</span>;
            } },
            { key: "l", header: "Site", cell: (r) => <StageChip live={r.live} local={isLocal(r)} /> },
            { key: "u", header: "Updated", align: "right", cell: (r) => <span className="text-muted-foreground">{ago(r.pushed)}</span> },
          ]} />
      </section>

      <div className="mt-8"><AgentLog d={d} go={go} /></div>
    </div>
  );
}
