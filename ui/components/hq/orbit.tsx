"use client";
import { useEffect, useRef } from "react";

type Item = { name: string; color: string };

/** Pinned projects drifting on an elliptical orbit around a glowing core. Pure DOM transforms, no canvas. */
export function Orbit({ items, onOpen }: { items: Item[]; onOpen: (name: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const nodes = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const w = box.current?.clientWidth ?? 600;
      const rx = Math.min(w * 0.4, 320), ry = 74;
      const el = (t - t0) / 1000;
      nodes.current.forEach((n, i) => {
        if (!n) return;
        const a = el * 0.1 + (i / items.length) * Math.PI * 2;
        const depth = (Math.sin(a) + 1) / 2; // 0 = far side, 1 = near side
        n.style.transform = `translate(calc(-50% + ${Math.cos(a) * rx}px), calc(-50% + ${Math.sin(a) * ry}px)) scale(${0.72 + depth * 0.4})`;
        n.style.opacity = String(0.55 + depth * 0.45);
        n.style.zIndex = String(Math.round(depth * 10));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [items.length]);

  return (
    <div ref={box} className="relative mx-auto h-64 w-full max-w-3xl select-none">
      <div className="absolute left-1/2 top-1/2 h-44 w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border border-dashed border-border/70" />
      <div className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle at 35% 28%, #fff1bd, #f0a24b 55%, #8f4a14)", boxShadow: "0 0 110px 20px oklch(0.8 0.15 75 / 30%), inset 0 -12px 24px #0006" }}>
        <i className="absolute left-[31%] top-[44%] h-[5px] w-[15px] rounded-full bg-[#2a1708]" />
        <i className="absolute right-[31%] top-[44%] h-[5px] w-[15px] rounded-full bg-[#2a1708]" />
        <i className="absolute left-1/2 top-[62%] h-[4px] w-[9px] -translate-x-1/2 rounded-full bg-[#2a1708]" />
      </div>
      {items.map((it, i) => (
        <button
          key={it.name}
          ref={(el) => { nodes.current[i] = el; }}
          onClick={() => onOpen(it.name)}
          className="absolute left-1/2 top-1/2 flex flex-col items-center gap-1.5 will-change-transform"
        >
          <i className="size-9 rounded-full ring-1 ring-white/10" style={{ background: `radial-gradient(circle at 35% 28%, #fffb, ${it.color} 60%, #0008)` }} />
          <span className="max-w-24 truncate text-[11px] text-muted-foreground">{it.name}</span>
        </button>
      ))}
    </div>
  );
}
