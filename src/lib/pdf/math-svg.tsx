import "server-only";
import { createElement, type ReactElement } from "react";
import { G, Path, Rect, Svg } from "@react-pdf/renderer";
import { DOMParser } from "@xmldom/xmldom";
// MathJax (CommonJS) — LaTeX → SVG vektor, lalu diterjemahkan ke elemen SVG react-pdf
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import "mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js";

type MjDoc = { convert: (tex: string, opts: { display: boolean }) => unknown };
let adaptor: ReturnType<typeof liteAdaptor> | null = null;
let doc: MjDoc | null = null;
function mj() {
  if (!doc) {
    adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    doc = mathjax.document("", {
      InputJax: new TeX({ packages: ["base", "ams", "newcommand", "noundefined"] }),
      OutputJax: new SVG({ fontCache: "none" }),
    }) as unknown as MjDoc;
  }
  return { doc, adaptor: adaptor! };
}

type Node = { tag: string; attrs: Record<string, string>; children: Node[] };
export type MathSvg = { tree: Node; widthEx: number; heightEx: number; valignEx: number };

const cache = new Map<string, MathSvg | null>();

function toTree(el: Element): Node {
  const attrs: Record<string, string> = {};
  for (let i = 0; i < el.attributes.length; i++) attrs[el.attributes[i].name] = el.attributes[i].value;
  return {
    tag: el.localName ?? "",
    attrs,
    children: Array.from(el.childNodes)
      .filter((c) => c.nodeType === 1)
      .map((c) => toTree(c as Element)),
  };
}

/** LaTeX → pohon SVG MathJax (null bila gagal) */
export function texToSvg(tex: string, display: boolean): MathSvg | null {
  const key = `${display ? "D" : "I"}:${tex}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: MathSvg | null = null;
  try {
    const { doc, adaptor } = mj();
    const node = doc.convert(tex, { display });
    const html = adaptor.innerHTML(node as never);
    if (!/data-mjx-error|merror/.test(html)) {
      const svg = new DOMParser().parseFromString(html.replace(/xmlns:xlink="[^"]*"/g, ""), "image/svg+xml").documentElement as unknown as Element;
      const ex = (v: string | null) => parseFloat((v ?? "0").replace("ex", "")) || 0;
      out = {
        tree: toTree(svg),
        widthEx: ex(svg.getAttribute("width")),
        heightEx: ex(svg.getAttribute("height")),
        valignEx: ex((svg.getAttribute("style") ?? "").match(/vertical-align:\s*(-?[\d.]+)ex/)?.[1] ?? "0"),
      };
    }
  } catch {
    out = null;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}

function el(n: Node, color: string, key: number): ReactElement | null {
  const fill = (v?: string) => (!v || v === "currentColor" ? color : v);
  const kids = n.children.map((c, i) => el(c, color, i)).filter(Boolean) as ReactElement[];
  switch (n.tag) {
    case "g":
      return createElement(
        G,
        { key, transform: n.attrs.transform, fill: fill(n.attrs.fill), stroke: n.attrs.stroke === "currentColor" ? color : n.attrs.stroke },
        ...kids,
      );
    case "svg": {
      // svg bersarang (jarang) → geser saja
      const x = parseFloat(n.attrs.x ?? "0") || 0;
      const y = parseFloat(n.attrs.y ?? "0") || 0;
      return createElement(G, { key, transform: `translate(${x},${y})` }, ...kids);
    }
    case "path":
      return createElement(Path, {
        key,
        d: n.attrs.d ?? "",
        transform: n.attrs.transform,
        fill: fill(n.attrs.fill),
        stroke: n.attrs.stroke && n.attrs.stroke !== "none" ? fill(n.attrs.stroke) : undefined,
        strokeWidth: n.attrs["stroke-width"] ? Number(n.attrs["stroke-width"]) : undefined,
      });
    case "rect":
      return createElement(Rect, {
        key,
        x: Number(n.attrs.x ?? 0),
        y: Number(n.attrs.y ?? 0),
        width: Number(n.attrs.width ?? 0),
        height: Number(n.attrs.height ?? 0),
        fill: fill(n.attrs.fill),
      });
    default:
      return kids.length ? createElement(G, { key }, ...kids) : null;
  }
}

/** Komponen rumus untuk react-pdf. `fontSize` dalam pt; 1ex ≈ 0,44 × ukuran huruf. */
export function MathPdf({ svg, fontSize, color = "#0f2436" }: { svg: MathSvg; fontSize: number; color?: string }) {
  const exPt = fontSize * 0.44;
  const kids = svg.tree.children.map((c, i) => el(c, color, i)).filter(Boolean) as ReactElement[];
  return (
    <Svg viewBox={svg.tree.attrs.viewBox} width={svg.widthEx * exPt} height={svg.heightEx * exPt} style={{ marginHorizontal: 1 }}>
      {kids}
    </Svg>
  );
}
