"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Link = { url: string; left: number; top: number; width: number; height: number };
type PageData = { w: number; h: number; links: Link[] };

/**
 * Draws a PDF with pdf.js instead of the webview's built-in viewer. Links inside the document are real anchors laid over the page,
 * so clicks go through the app's link warning and open in the default browser (the built-in viewer cannot open them from a desktop window).
 */
export function PdfView({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const canvases = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    let dead = false;
    setState("loading"); setPages([]);
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        const width = Math.min(box.current?.clientWidth ?? 900, 980) - 32;
        const dpr = window.devicePixelRatio || 1;
        const out: PageData[] = [];
        const rendered: { n: number; canvas: HTMLCanvasElement }[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const vp = page.getViewport({ scale });
          const links: Link[] = [];
          for (const a of await page.getAnnotations()) {
            if (a.subtype !== "Link" || !a.url) continue;
            const [x1, y1, x2, y2] = vp.convertToViewportRectangle(a.rect);
            links.push({ url: a.url, left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
          }
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = `${vp.width}px`; canvas.style.height = `${vp.height}px`;
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: page.getViewport({ scale: scale * dpr }) }).promise;
          rendered.push({ n, canvas });
          out.push({ w: vp.width, h: vp.height, links });
        }
        if (dead) return;
        setPages(out); setState("ready");
        // mount the drawn canvases once their slots exist
        requestAnimationFrame(() => rendered.forEach(({ n, canvas }) => { const slot = canvases.current[n - 1]; if (slot) { slot.replaceChildren(canvas); } }));
      } catch (e) {
        if (!dead) { setError((e as Error).message); setState("error"); }
      }
    })();
    return () => { dead = true; };
  }, [url]);

  return (
    <div ref={box} className="h-[calc(100vh-14.5rem)] overflow-auto bg-muted/20 py-4">
      {state === "loading" && <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline size-4 animate-spin" />Rendering…</div>}
      {state === "error" && <p className="p-8 text-center text-sm text-bad">Could not display this PDF: {error}. Use Open or Download.</p>}
      <div className="mx-auto flex w-fit flex-col gap-4">
        {pages.map((p, i) => (
          <div key={i} className="relative overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-black/10" style={{ width: p.w, height: p.h }}>
            <div ref={(el) => { canvases.current[i] = el; }} />
            {p.links.map((l, j) => (
              <a key={j} href={l.url} target="_blank" rel="noreferrer" title={l.url} className="absolute rounded-sm transition hover:bg-brand/20"
                style={{ left: l.left, top: l.top, width: l.width, height: l.height }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
