"use client";
import { useEffect, useState } from "react";
import GradientASCII from "@/components/GradientASCII";
import { fileUrl } from "@/lib/hq";
import { cn } from "@/lib/utils";

const hasWebgl2 = () => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } };

/** The animated ASCII gradient in the app's amber palette, or nothing where WebGL2 is unavailable. */
export const AMBER = ["#c2410c", "#f97316", "#fbbf24", "#fff7ed"];
export const MONO = ["#3a3a40", "#6b6b74", "#a3a3ad", "#f4f4f5"];

export function AsciiBackdrop({ className, cellSize = 16, interactive = true, shape = "horizon", colors = AMBER }: { className?: string; cellSize?: number; interactive?: boolean; shape?: "horizon" | "pinch" | "rise" | "eclipse"; colors?: string[] }) {
  const [gl, setGl] = useState(false);
  useEffect(() => { setGl(hasWebgl2()); }, []);
  if (!gl) return null;
  return (
    <div className={cn("absolute inset-0", className)}>
      <GradientASCII
        colors={colors}
        shape={shape}
        characters=" =+xX0S8#@"
        cellSize={cellSize}
        density={shape === "pinch" ? 1 : 0.8}
        glyphOpacity={shape === "pinch" ? 1 : 0.8}
        gradientOpacity={shape === "pinch" ? 0.22 : 0}
        depthOfField={0.15}
        flicker={0.34}
        softness={1}
        scale={shape === "pinch" ? 1 : 1.25}
        flow={0}
        speed={0.25}
        grain={0.14}
        scrambleRadius={0.02}
        mouseInteraction={interactive}
        dpr={undefined}
        style={undefined}
      />
    </div>
  );
}

/** Profile banner: your own image if you set one, otherwise the ASCII gradient. */
export function ProfileBanner({ src }: { src?: string }) {
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => { setGl(hasWebgl2()); }, []);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fileUrl(src)} alt="" className="h-52 w-full object-cover" />;
  }
  if (!gl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/banner.svg" alt="" className="h-52 w-full object-cover" />;
  }
  return (
    <div className="relative h-52 w-full overflow-hidden bg-background">
      <AsciiBackdrop />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
