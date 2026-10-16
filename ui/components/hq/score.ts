import type { Data } from "./use-hq";

export type Todo = { text: string; tab: string };

/** Profile completeness: five equally weighted checks, plus the concrete next actions behind them. */
export function score(d: Data) {
  const id = d.me.identity ?? {};
  const pinned = d.repos.filter((r) => r.pinned);
  const answers = Object.values(d.me.answers ?? {});
  const links = Object.values(d.links);
  const ratio = (n: number, of: number) => (of ? n / of : 0);
  const parts = {
    identity: ratio(["name", "email", "phone", "headline", "summary"].filter((k) => id[k]).length, 5),
    answers: ratio(answers.filter((a) => a !== null).length, answers.length),
    links: ratio(links.filter((l) => l.status === "ok" || l.status === "gated").length, Math.max(links.length, 1)),
    taglines: ratio(pinned.filter((r) => r.tagline).length, pinned.length),
    pinned: Math.min(pinned.length / 6, 1),
  };
  const pct = Math.round((Object.values(parts).reduce((a, b) => a + b, 0) / 5) * 100);
  const todos: Todo[] = [];
  const open = Object.entries(d.me.answers ?? {}).filter(([, v]) => v === null).map(([k]) => k);
  if (open.length) todos.push({ text: `Answer ${open.length} autofill fields: ${open.join(", ")}`, tab: "context" });
  if (!links.length) todos.push({ text: "Run a link check", tab: "links" });
  Object.entries(d.links)
    .filter(([, l]) => l.status === "dead" || l.status === "down")
    .forEach(([u, l]) => todos.push({ text: `Broken link (${l.code || "no response"}): ${u}`, tab: "links" }));
  const bare = pinned.filter((r) => !r.tagline).length;
  if (bare) todos.push({ text: `${bare} pinned projects have no tagline`, tab: "pinned" });
  if (pinned.length < 6) todos.push({ text: `Pin ${6 - pinned.length} more projects (aim for 6)`, tab: "repos" });
  return { pct, parts, todos };
}
