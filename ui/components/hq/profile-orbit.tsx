"use client";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, type FileEntry } from "@/lib/hq";
import type { TabKind } from "@/components/shell/nav";
import { score } from "./score";
import type { Data } from "./use-hq";

/**
 * The profile orbit: you are the sun, and six areas of your profile circle you as little characters.
 * A planet's face says how that area is doing (happy, fine, asleep, worried) and hovering it freezes the orbit and
 * opens a status card with the real numbers and the next thing worth doing there. Click a planet to open its page.
 */

type Mood = "happy" | "ok" | "sleepy" | "worried";
type FaceKey = "neutral" | "attentive" | "surprised" | "happy" | "sleepy" | "sad" | "curious" | "dizzy";
type ShapeKey = "drop" | "triangle" | "cloud" | "circle" | "pill" | "blob";
type Planet = {
  key: string; name: string; go: TabKind; shape: ShapeKey; color: string; mood: Mood; face: FaceKey;
  status: string; rows: [string, string][]; next: string;
};

const MOOD_LABEL: Record<Mood, string> = { happy: "Healthy", ok: "Fine", sleepy: "Needs input", worried: "Needs a look" };
const MOOD_TONE: Record<Mood, string> = { happy: "text-ok", ok: "text-muted-foreground", sleepy: "text-warn", worried: "text-bad" };

const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
const ago = (ts: number) => {
  const h = (Date.now() / 1000 - ts) / 3600;
  return h < 1 ? "under an hour ago" : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
};

/** Every number below comes from the loaded data; nothing is typed in. */
function planetsOf(d: Data, files: FileEntry[] | null): Planet[] {
  const me = d.me;
  const id = me.identity ?? {};
  const s = score(d);
  const idFields = ["name", "email", "phone", "headline", "summary"];
  const idMissing = idFields.filter((k) => !id[k]);
  const answers = Object.entries(me.answers ?? {});
  const openAns = answers.filter(([, v]) => v === null).map(([k]) => k);
  const ls = me.links.map((l) => ({ ...l, st: d.links[l.url]?.status }));
  const live = ls.filter((l) => l.st === "ok").length;
  const gated = ls.filter((l) => l.st === "gated").length;
  const broken = ls.filter((l) => l.st === "dead" || l.st === "down");
  const unchecked = ls.filter((l) => !l.st).length;
  const agent = d.log.filter((e) => e.src === "agent");
  const lastAgent = agent.length ? Math.max(...agent.map((e) => e.ts)) : 0;
  const resumes = files?.filter((f) => f.kind === "resume").length ?? 0;
  const shots = files?.filter((f) => f.kind === "screenshot").length ?? 0;
  const gaps = (me.claim_gaps ?? []).length;
  const stack = (me.stack ?? []).length;

  return [
    {
      key: "profile", name: "Profile", go: "profile", shape: "drop", color: "#8a8a92",
      mood: idMissing.length ? "sleepy" : "happy", face: idMissing.length ? "curious" : "happy", status: `${s.pct}% complete`,
      rows: [["Identity", `${idFields.length - idMissing.length} of ${idFields.length} fields`], ["Roles", String(me.experience.length)], ["Education", String(me.education.length)], ["Achievements", String((me.achievements ?? []).length)]],
      next: idMissing.length ? `Add your ${idMissing.slice(0, 2).join(" and ")}.` : "Everything core is filled in.",
    },
    {
      key: "skills", name: "Skills", go: "graph", shape: "triangle", color: "#1a8cff",
      mood: !stack ? "sleepy" : gaps ? "ok" : "happy", face: !stack ? "sleepy" : gaps ? "attentive" : "neutral", status: `${stack} technologies`,
      rows: [["Technologies", String(stack)], ["Strong", String(me.skills.strong.length)], ["Working", String(me.skills.working.length)], ["No evidence", String(me.skills.no_evidence.length)]],
      next: gaps ? `${gaps} claim${gaps === 1 ? "" : "s"} need backing before they go on a resume.` : stack ? "Every listed skill has evidence." : "Run Sync GitHub to detect your stack.",
    },
    {
      key: "links", name: "Links", go: "links", shape: "pill", color: "#10c878",
      mood: broken.length ? "worried" : !ls.length || unchecked === ls.length ? "sleepy" : "happy", face: broken.length ? "surprised" : !ls.length || unchecked === ls.length ? "attentive" : "happy", status: ls.length ? `${live} of ${ls.length} responding` : "no links",
      rows: [["Responding", String(live)], ["Gated", String(gated)], ["Broken", String(broken.length)], ["Unchecked", String(unchecked)]],
      next: broken.length ? `${host(broken[0].url)} is not answering.` : unchecked ? "Run Check all to test the rest." : "All links answered on the last check.",
    },
    {
      key: "answers", name: "Answers", go: "context", shape: "blob", color: "#946238",
      mood: openAns.length ? "sleepy" : "happy", face: openAns.length ? "sleepy" : "happy", status: `${answers.length - openAns.length} of ${answers.length} filled`,
      rows: [["Filled", String(answers.length - openAns.length)], ["Open", String(openAns.length)]],
      next: openAns.length ? `Answer ${openAns.slice(0, 2).join(", ")}${openAns.length > 2 ? ` and ${openAns.length - 2} more` : ""}.` : "Autofill has what it needs.",
    },
    {
      key: "files", name: "Files", go: "files", shape: "cloud", color: "#ff6a10",
      mood: files && !resumes ? "sleepy" : "happy", face: files && !resumes ? "sad" : "happy", status: files ? `${resumes} resume${resumes === 1 ? "" : "s"}` : "loading",
      rows: [["Resumes", files ? String(resumes) : "–"], ["Screenshots", files ? String(shots) : "–"], ["Photo", id.avatar ? "set" : "not set"]],
      next: files && !resumes ? "Upload your resume so agents and exports can use it." : "Your resume is stored and versioned.",
    },
    {
      key: "agent", name: "Agent", go: "activity", shape: "circle", color: "#8b5cf6",
      mood: agent.length ? "happy" : "sleepy", face: agent.length ? "happy" : "sleepy", status: agent.length ? `${agent.length} recent edits` : "idle",
      rows: [["Recent edits", String(agent.length)], ["Last edit", agent.length ? ago(lastAgent) : "never"]],
      next: agent.length ? "Agents are keeping the profile up to date." : "Connect an agent under Integrations.",
    },
  ];
}

type Eye = [number, number, number, number, number]; // cx, cy, width, height, rotation in degrees (100 unit canvas)
const FACES: Record<FaceKey, Eye[]> = {
  neutral: [[37, 48, 11, 26, -8], [63, 48, 11, 26, 8]],
  attentive: [[38, 50, 9, 18, 0], [62, 50, 9, 18, 0]],
  surprised: [[37, 48, 16, 16, 0], [63, 48, 16, 16, 0]],
  happy: [[35, 50, 18, 9, -16], [65, 50, 18, 9, 16]],
  sleepy: [[35, 52, 18, 8, 0], [65, 52, 18, 8, 0]],
  sad: [[37, 50, 10, 22, -22], [63, 50, 10, 22, 22]],
  curious: [[44, 46, 10, 24, -18], [66, 44, 10, 24, -18]],
  // two crossed capsules per eye (used by the sun after a click spree)
  dizzy: [[37, 48, 22, 7, 45], [37, 48, 22, 7, -45], [63, 48, 22, 7, 45], [63, 48, 22, 7, -45]],
};

const SHAPES: Record<ShapeKey, React.ReactNode> = {
  drop: <path d="M50 6C62 24 90 40 90 64A40 40 0 0 1 10 64C10 40 38 24 50 6Z" />,
  triangle: <path d="M50 10Q57 10 61 17L91 72Q97 85 84 87H16Q3 85 9 72L39 17Q43 10 50 10Z" />,
  cloud: <><circle cx="34" cy="46" r="25" /><circle cx="62" cy="36" r="23" /><circle cx="70" cy="64" r="25" /><circle cx="38" cy="68" r="24" /><circle cx="52" cy="54" r="28" /></>,
  circle: <circle cx="50" cy="50" r="43" />,
  pill: <rect x="6" y="24" width="88" height="52" rx="26" />,
  blob: <><circle cx="40" cy="38" r="23" /><circle cx="66" cy="46" r="24" /><circle cx="44" cy="66" r="26" /><circle cx="68" cy="70" r="19" /><circle cx="32" cy="56" r="21" /></>,
};
// where the eyes sit on each shape
const EYE_SHIFT: Record<ShapeKey, [number, number]> = { drop: [0, 8], triangle: [0, 14], cloud: [6, -4], circle: [0, -2], pill: [0, 0], blob: [4, 2] };

const mix = (hex: string, to: string, k: number) => {
  const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [n(hex), n(to)];
  return `#${a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
};

/** Big white capsule eyes on a blob shaded like the sun; the eyes follow the cursor. */
function Character({ id, shape, color, face }: { id: string; shape: ShapeKey; color: string; face: FaceKey }) {
  const [dx, dy] = EYE_SHIFT[shape];
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden>
      <defs>
        <radialGradient id={`pg-${id}`} gradientUnits="userSpaceOnUse" cx="34" cy="24" r="86">
          <stop offset="0" stopColor={mix(color, "#ffffff", 0.62)} />
          <stop offset="0.45" stopColor={color} />
          <stop offset="1" stopColor={mix(color, "#000000", 0.42)} />
        </radialGradient>
      </defs>
      <g fill={`url(#pg-${id})`}>{SHAPES[shape]}</g>
      <g transform={`translate(${dx} ${dy})`}>
        <g style={{ transform: "translate(calc(var(--ex, 0) * 4px), calc(var(--ey, 0) * 3px))", transition: "transform 140ms ease-out" }} fill="#fff">
          {FACES[face].map(([cx, cy, w, h, r], i) => (
            <rect key={i} x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={Math.min(w, h) / 2} transform={`rotate(${r} ${cx} ${cy})`} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/** The sun is you: dark capsule eyes that follow the cursor and blink now and then. */
function SunFace({ face }: { face: FaceKey }) {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
      <g style={{ transform: "translate(calc(var(--ex, 0) * 9px), calc(var(--ey, 0) * 7px))", transition: "transform 160ms ease-out" }}>
        <g style={{ transformBox: "fill-box", transformOrigin: "center", animation: "orbit-blink 6s infinite" }} fill="#15151a">
          {FACES[face].map(([cx, cy, w, h, r], i) => (
            <rect key={i} x={cx - w / 2 + 6} y={cy - h / 2 - 2} width={w} height={h} rx={Math.min(w, h) / 2} transform={`rotate(${r} ${cx + 6} ${cy - 2})`} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/** One ellipse for the orbit, shared by the dotted ring, the sun and the planets. */
const geom = (w: number, h: number) => {
  const rx = Math.min(w * 0.4, 620);
  return { rx, ry: Math.min(h * 0.27, rx * 0.4), cx: w / 2, cy: h * 0.5 };
};

/**
 * The click splash: rings of ASCII travel out from the sun on the same 16px grid, glyphs and light weight as the
 * background, so it reads as the background lighting up. Drawn on one canvas, only while a wave is alive.
 */
const GLYPHS = " =+xX0S8#@";
const CELL_H = 16;
const CELL_W = CELL_H * 0.6;
type Splash = { fire: (big: boolean) => void };
function AsciiSplash({ cx, cy, w, h, ref }: { cx: number; cy: number; w: number; h: number; ref: React.Ref<Splash> }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const start = useRef<(big: boolean) => void>(() => {});
  useImperativeHandle(ref, () => ({ fire: (big) => start.current(big) }), []);
  useEffect(() => {
    const el = cv.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(w * dpr);
    el.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    type Wave = { t0: number; speed: number; width: number; life: number };
    let waves: Wave[] = [];
    let raf = 0;
    const hash = (a: number, b: number, c: number) => { let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; x = (x ^ (x >>> 13)) * 1274126177; return ((x ^ (x >>> 16)) >>> 0) / 4294967295; };
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      waves = waves.filter((v) => now - v.t0 < v.life);
      if (!waves.length) return;
      ctx.font = `300 ${(CELL_H * 0.78).toFixed(1)}px "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const reach = Math.max(...waves.map((v) => ((now - v.t0) / 1000) * v.speed + v.width * 2.5));
      // the same grid as the background: cells are CELL_W x CELL_H and the grid is centred on the canvas
      const ox = (w - Math.ceil(w / CELL_W) * CELL_W) / 2;
      const oy = (h - Math.ceil(h / CELL_H) * CELL_H) / 2;
      const x0 = Math.floor((cx - reach - ox) / CELL_W);
      const x1 = Math.ceil((cx + reach - ox) / CELL_W);
      const y0 = Math.floor((cy - reach - oy) / CELL_H);
      const y1 = Math.ceil((cy + reach - oy) / CELL_H);
      const tick = Math.floor(now / 90);
      for (let gy = y0; gy < y1; gy++) {
        for (let gx = x0; gx < x1; gx++) {
          const px = ox + (gx + 0.5) * CELL_W;
          const py = oy + (gy + 0.5) * CELL_H;
          if (px < -CELL_W || px > w + CELL_W || py < -CELL_H || py > h + CELL_H) continue;
          const dist = Math.hypot(px - cx, (py - cy) * 1.15);
          if (dist < 66) continue; // the sun covers its own disc
          let it = 0;
          for (const v of waves) {
            const age = now - v.t0;
            if (age < 0) continue;
            const r = (age / 1000) * v.speed;
            const k = (dist - r) / v.width;
            const life = age / v.life;
            const envelope = Math.min(1, age / 160) * (1 - life) * (1 - life); // eases in, then a long soft fade
            const spread = Math.max(0, 1 - dist / (v.speed * 1.9)); // thins out as it travels
            it = Math.max(it, Math.exp(-k * k) * envelope * spread);
          }
          if (it < 0.03) continue;
          // like the background: a cell shows a glyph with a chance that follows the field, the glyph is picked per cell
          const pick = hash(gx, gy, 7);
          if (pick > Math.min(1, it * 2.6 + 0.08) * 0.9) continue;
          const level = hash(gx, gy, tick);
          const gi = 1 + Math.floor(Math.min(0.999, level * 0.55 + it * 0.7) * (GLYPHS.length - 1));
          const a = Math.min(0.42, 0.1 + it * 0.45);
          ctx.fillStyle = it > 0.5 ? `rgba(176,176,186,${a.toFixed(3)})` : `rgba(120,120,130,${a.toFixed(3)})`;
          ctx.fillText(GLYPHS[Math.min(GLYPHS.length - 1, gi)], px, py + 1);
        }
      }
    };
    const loop = (now: number) => { draw(now); if (waves.length) raf = requestAnimationFrame(loop); };
    start.current = (big) => {
      const now = performance.now();
      const set = big
        ? [{ d: 0, s: 640, w: 120, l: 2600 }, { d: 240, s: 560, w: 105, l: 2400 }]
        : [{ d: 0, s: 470, w: 110, l: 2100 }];
      waves.push(...set.map((x) => ({ t0: now + x.d, speed: x.s, width: x.w, life: x.l })));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    return () => { cancelAnimationFrame(raf); start.current = () => {}; };
  }, [cx, cy, w, h]);
  return <canvas ref={cv} aria-hidden className="pointer-events-none absolute left-0 top-0 z-[15]" style={{ width: w, height: h }} />;
}

const CARD_W = 272;
const CARD_H = 250; // estimate used only to keep the card inside the scene

export function ProfileOrbit({ d, go }: { d: Data; go: (k: TabKind) => void }) {
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  useEffect(() => { api<FileEntry[]>("files").then(setFiles).catch(() => setFiles([])); }, []);
  const planets = useMemo(() => planetsOf(d, files), [d, files]);

  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState(-1);
  const [last, setLast] = useState(-1); // the card keeps its content while it fades out
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const els = useRef<(HTMLButtonElement | null)[]>([]);
  const spots = useRef<{ x: number; y: number }[]>([]);
  const st = useRef({ angle: 0, speed: 0.07, target: 0.07, last: 0, raf: 0, running: false, visible: true });
  const hideTimer = useRef(0);
  const reduced = useRef(false);

  const place = useCallback(() => {
    const { w, h } = size;
    if (!w) return;
    const { rx, ry, cx, cy } = geom(w, h);
    const n = planets.length;
    planets.forEach((_, k) => {
      const th = st.current.angle + (k / n) * Math.PI * 2;
      const x = cx + rx * Math.cos(th);
      const y = cy + ry * Math.sin(th);
      const depth = (Math.sin(th) + 1) / 2; // 1 in front, 0 behind
      const sc = 0.78 + 0.34 * depth;
      spots.current[k] = { x, y };
      const el = els.current[k];
      if (el) {
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
        el.style.zIndex = depth > 0.5 ? "30" : "10";
        el.style.opacity = (0.62 + 0.38 * depth).toFixed(2);
      }
    });
  }, [size, planets]);

  const placeRef = useRef(place);
  useEffect(() => { placeRef.current = place; }, [place]);

  const kick = useCallback(() => {
    const s = st.current;
    if (reduced.current || s.running || !s.visible) return;
    s.running = true;
    s.last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(1 / 30, (t - s.last) / 1000);
      s.last = t;
      s.speed += (s.target - s.speed) * Math.min(1, dt * 5);
      if (s.target === 0 && s.speed < 0.0008) s.speed = 0;
      s.angle += s.speed * dt;
      placeRef.current();
      if (s.visible && (s.speed > 0 || s.target > 0)) s.raf = requestAnimationFrame(frame);
      else s.running = false;
    };
    s.raf = requestAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const io = new IntersectionObserver((e) => { st.current.visible = e[e.length - 1].isIntersecting; if (st.current.visible) kick(); }, { rootMargin: "120px" });
    io.observe(el);
    return () => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(st.current.raf); st.current.running = false; };
  }, [kick]);

  useEffect(() => { place(); kick(); }, [place, kick]);

  const show = (k: number) => {
    clearTimeout(hideTimer.current);
    const sp = spots.current[k];
    if (sp) {
      // open on the outer side of the planet so the card does not cover the sun; fall back to the inner side
      const outerLeft = sp.x < size.w / 2;
      const fits = outerLeft ? sp.x - 46 - CARD_W >= 8 : sp.x + 46 + CARD_W <= size.w - 8;
      const left = fits ? outerLeft : !outerLeft;
      const x = left ? sp.x - 46 - CARD_W : sp.x + 46;
      setPos({ x: Math.max(8, Math.min(size.w - CARD_W - 8, x)), y: Math.max(8, Math.min(size.h - CARD_H - 8, sp.y - CARD_H / 2)) });
    }
    st.current.target = 0;
    st.current.speed = 0; // stop at once so the planet cannot drift out from under the pointer
    setHover(k);
    setLast(k);
  };
  const hide = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { setHover(-1); st.current.target = 0.07; kick(); }, 320);
  };

  // the characters look toward the cursor anywhere on the page: two CSS variables in -1..1, no re-render
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = (ex: number, ey: number) => { el.style.setProperty("--ex", ex.toFixed(3)); el.style.setProperty("--ey", ey.toFixed(3)); };
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const g = geom(r.width, r.height);
      const ex = Math.max(-1, Math.min(1, (e.clientX - r.left - g.cx) / (r.width * 0.3)));
      const ey = Math.max(-1, Math.min(1, (e.clientY - r.top - g.cy) / (r.height * 0.35)));
      set(ex, ey);
    };
    const leave = () => set(0, 0);
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => { window.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave); window.removeEventListener("blur", leave); };
  }, []);
  // easter egg: click the sun. It squishes, grins, throws ASCII sparks and spins the orbit; a spree of five makes it dizzy.
  const [bump, setBump] = useState(0);
  const [feel, setFeel] = useState<FaceKey | null>(null);
  const splash = useRef<Splash>(null);
  const clicks = useRef<number[]>([]);
  const feelTimer = useRef(0);
  const poke = () => {
    const now = Date.now();
    clicks.current = [...clicks.current.filter((c) => now - c < 3000), now];
    const dizzy = clicks.current.length >= 5;
    if (dizzy) clicks.current = [];
    setBump((b) => b + 1);
    setFeel(dizzy ? "dizzy" : "happy");
    clearTimeout(feelTimer.current);
    feelTimer.current = window.setTimeout(() => setFeel(null), dizzy ? 2200 : 1300);
    if (!reduced.current) {
      st.current.speed = dizzy ? 3.4 : 1.5; // a burst that the orbit then eases out of
      kick();
      splash.current?.fire(dizzy);
    }
  };
  const sunFace: FaceKey = feel ?? (score(d).pct >= 70 ? "happy" : "neutral");
  const hour = new Date().getHours();
  const hello = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = d.me.identity?.name?.split(" ")[0] ?? "You";
  const cur = last >= 0 ? planets[last] : null;
  const open = hover >= 0;

  return (
    <div ref={box} className="relative h-full w-full select-none">
      {/* dotted orbit */}
      {size.w > 0 && (() => {
        const g = geom(size.w, size.h);
        return <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden><ellipse cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth={1.2} strokeDasharray="1.5 7" strokeLinecap="round" className="text-foreground" /></svg>;
      })()}

      <AsciiSplash cx={size.w / 2} cy={size.h * 0.5} w={size.w} h={size.h} ref={splash} />

      {/* greeting: top left, clear of the orbit */}
      <div className="pointer-events-none absolute left-5 top-4 z-20 max-sm:left-4">
        <div className="text-xs text-muted-foreground">{hello}</div>
        <div className="text-3xl font-semibold leading-tight tracking-tight text-foreground">{name}</div>
      </div>

      {/* the sun */}
      <div className="absolute z-20 -translate-x-1/2 -translate-y-1/2" style={{ left: size.w / 2, top: size.h * 0.5 }}>
        <button onClick={poke} aria-label={`${name}: say hi`} className="block cursor-pointer rounded-full outline-none transition-transform duration-200 ease-out" style={{ transform: "translate(calc(var(--ex, 0) * 5px), calc(var(--ey, 0) * 4px))" }}>
          <div key={bump} className="relative mx-auto size-[8.5rem] rounded-full" style={{ animation: bump ? `${feel === "dizzy" ? "orbit-wobble 2s" : "orbit-squish 520ms"} ease-out` : undefined, background: "radial-gradient(circle at 36% 28%, #ffffff 0%, #e4e4e7 45%, #8d8d96 100%)", boxShadow: "0 0 60px 10px rgba(255,255,255,.10), 0 0 140px 40px rgba(255,255,255,.05)" }}>
            <SunFace face={sunFace} />
          </div>
        </button>
      </div>

      {/* the planets */}
      {planets.map((p, k) => (
        <button
          key={p.key}
          ref={(el) => { els.current[k] = el; }}
          onPointerEnter={(e) => { if (e.pointerType !== "touch") show(k); }}
          onPointerLeave={hide}
          onFocus={() => show(k)}
          onBlur={hide}
          onClick={(e) => { if ((e.nativeEvent as PointerEvent).pointerType === "touch" && hover !== k) { show(k); return; } go(p.go); }}
          aria-label={`${p.name}: ${p.status}. ${p.next}`}
          className="absolute left-0 top-0 flex flex-col items-center gap-1.5 outline-none will-change-transform"
          style={{ transform: "translate(-9999px, 0)" }}
        >
          <span
            className={`relative block size-[4.2rem] transition-transform duration-200 ease-out ${hover === k ? "scale-110" : ""}`}
            style={{ filter: hover === k ? `drop-shadow(0 0 14px ${p.color}aa)` : "drop-shadow(0 6px 10px rgba(0,0,0,.4))" }}
          >
            <Character id={p.key} shape={p.shape} color={p.color} face={p.face} />
          </span>
          <span className={`text-[13px] transition-colors ${hover === k ? "rounded bg-foreground/15 px-1.5 text-foreground" : "text-muted-foreground"}`}>{p.name}</span>
        </button>
      ))}

      {/* the status card */}
      {cur && (
        <div
          onPointerEnter={() => clearTimeout(hideTimer.current)}
          onPointerLeave={hide}
          className={`absolute z-40 rounded-xl border border-border bg-card/90 shadow-xl backdrop-blur-md transition duration-200 ease-out ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1 opacity-0"}`}
          style={{ left: pos.x, top: pos.y, width: CARD_W }}
          role="status"
        >
          <div className="flex items-center gap-2.5 border-b border-dashed border-border px-3.5 py-2.5">
            <i className="size-3 rounded-full" style={{ background: cur.color }} />
            <span className="text-sm font-medium">{cur.name}</span>
            <span className={`ml-auto text-xs ${MOOD_TONE[cur.mood]}`}>{MOOD_LABEL[cur.mood]}</span>
          </div>
          <div className="px-3.5 py-2">
            <div className="mb-1 text-xs text-muted-foreground">{cur.status}</div>
            {cur.rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-dashed border-border/70 py-1.5 text-[13px] last:border-b-0">
                <span className="text-muted-foreground">{k}</span><span className="tabular-nums">{v}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-border px-3.5 py-2.5">
            <p className="text-xs leading-relaxed text-foreground/85">{cur.next}</p>
            <button onClick={() => go(cur.go)} className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background/60 px-2.5 text-xs transition hover:border-brand/40 hover:bg-card">
              Open {cur.name.toLowerCase()} <ArrowUpRight className="size-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
