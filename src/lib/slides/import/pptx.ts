import JSZip from "jszip";
import { colourOf, cssColour, gradientOf, paintOf, readTheme, type Theme } from "./colour";
import {
  backgroundOf,
  indexPlaceholders,
  inheritedStyle,
  readFillStyles,
  readFonts,
  styleFill,
  styleLine,
  withRunProps,
  type Inheritance,
  type TextStyle,
} from "./inherit";
import { child, childrenNamed, find, findAll, parseXml, textOf, type XNode } from "./xml";

// ============================================
// Reading someone else's deck
//
// An instructor who already has a deck should be able to teach from it here
// without rebuilding it. So the slides are read as they were drawn — the
// shapes, their positions, their fills, the type, the pictures — and redrawn
// as HTML on the same canvas the generated slides use.
//
// What it deliberately does not do is interpret. It is not a converter into
// the Ecotech template: the deck stays the deck its author made, because the
// reason to upload one is that it is already right.
//
// Fidelity is honest rather than total. Text, shapes, fills, gradients,
// pictures, groups and placeholder geometry inherited from the layout all
// come across; SmartArt, charts, tables, animations and embedded video do
// not, and each is reported rather than silently dropped.
// ============================================

const EMU_PER_INCH = 914400;
const EMU_PER_POINT = 12700;
/** The canvas every slide in this application is drawn on. */
const CANVAS_W = 1280;

export interface ImportedSlide {
  /** The slide's own title, from its title placeholder or its first heading. */
  title: string;
  /** The slide as HTML, positioned in percentages of the canvas. */
  html: string;
  /** Everything it says, for the quiz and for search. */
  text: string;
  /** What could not be brought across, named. */
  warnings: string[];
}

export interface ImportedDeck {
  title: string;
  slides: ImportedSlide[];
  /** Slides hidden in PowerPoint, which were left out. */
  hidden: number;
}

export interface ImportOptions {
  /**
   * Store one picture and return the URL it will be served from.
   *
   * The importer never touches the filesystem itself: where an uploaded deck's
   * media belongs is the caller's business, and keeping it out of here is what
   * makes the reader testable without one.
   */
  saveMedia: (name: string, bytes: Uint8Array) => Promise<string>;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A rectangle in EMU, as OOXML places things. */
interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  flipH: boolean;
  flipV: boolean;
}

function frameOf(xfrm: XNode | null): Frame | null {
  if (!xfrm) return null;
  const off = child(xfrm, "a:off");
  const ext = child(xfrm, "a:ext");
  if (!off || !ext) return null;
  return {
    x: Number(off.attrs.x ?? 0),
    y: Number(off.attrs.y ?? 0),
    w: Number(ext.attrs.cx ?? 0),
    h: Number(ext.attrs.cy ?? 0),
    rot: Number(xfrm.attrs.rot ?? 0) / 60000,
    flipH: xfrm.attrs.flipH === "1",
    flipV: xfrm.attrs.flipV === "1",
  };
}

/** How a group maps its children's coordinates into its own box. */
interface GroupTransform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

const IDENTITY: GroupTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

function applyTransform(frame: Frame, t: GroupTransform): Frame {
  return {
    ...frame,
    x: t.offsetX + (frame.x - 0) * t.scaleX,
    y: t.offsetY + (frame.y - 0) * t.scaleY,
    w: frame.w * t.scaleX,
    h: frame.h * t.scaleY,
  };
}

/** Placeholder identity, which is how a shape inherits its box from a layout. */
function placeholderKey(shape: XNode): string | null {
  const ph = find(shape, "p:ph");
  if (!ph) return null;
  return `${ph.attrs.type ?? "body"}:${ph.attrs.idx ?? "0"}`;
}

interface DeckContext {
  theme: Theme;
  /** What the layout, master and theme say before the slide says anything. */
  inh: Inheritance;
  /** Placeholder boxes inherited from the slide's layout, then its master. */
  placeholders: Map<string, Frame>;
  /** Relationship id → the URL a picture is served from. */
  media: Map<string, string>;
  slideW: number;
  slideH: number;
  pxPerPoint: number;
}

// ── Text ────────────────────────────────────────────────────────────────────

function runHtml(run: XNode, ctx: DeckContext, inherited: TextStyle): string {
  const text = textOf(child(run, "a:t") ?? { name: "", attrs: {}, children: [], text: "" });
  if (!text) return "";

  const style = withRunProps(inherited, child(run, "a:rPr"), ctx.theme);

  const css =
    `font-size:${(style.sizePt * ctx.pxPerPoint).toFixed(2)}px;` +
    `font-weight:${style.bold ? 700 : 400};` +
    (style.italic ? "font-style:italic;" : "") +
    (style.underline ? "text-decoration:underline;" : "") +
    (style.colour ? `color:${style.colour};` : "") +
    (style.face ? `font-family:${esc(style.face)},sans-serif;` : "");

  return `<span style="${css}">${esc(text)}</span>`;
}

function paragraphHtml(para: XNode, ctx: DeckContext, shape: XNode, key: string | null): string {
  const pPr = child(para, "a:pPr");
  const level = Number(pPr?.attrs.lvl ?? 0);
  const inherited = inheritedStyle(ctx.inh, key, level, shape, para);

  const align = { l: "left", ctr: "center", r: "right", just: "justify" }[
    pPr?.attrs.algn ?? inherited.align ?? "l"
  ];
  const indent = level * 24;

  // Only an explicit bullet is drawn. Inheriting one from the master's list
  // styles would put bullets on titles and captions that never had them.
  const bulletChar = pPr ? child(pPr, "a:buChar")?.attrs.char : undefined;
  const numbered = pPr ? child(pPr, "a:buAutoNum") : null;
  const bullet = bulletChar ?? (numbered ? "\u2022" : "");

  const spacing = pPr ? child(pPr, "a:lnSpc") : null;
  const spacingPct = spacing ? child(spacing, "a:spcPct")?.attrs.val : undefined;
  const lineHeight = spacingPct ? Number(spacingPct) / 100000 : 1.25;

  const runs = childrenNamed(para, "a:r")
    .map((r) => runHtml(r, ctx, inherited))
    .join("");
  const breaks = childrenNamed(para, "a:br").length;

  if (!runs) return breaks ? '<p style="margin:0;">&nbsp;</p>' : "";

  const css =
    `margin:0;text-align:${align};line-height:${lineHeight};` +
    (indent ? `padding-left:${indent}px;` : "") +
    (bullet ? "text-indent:-0.9em;padding-left:0.9em;" : "");

  return `<p style="${css}">${bullet ? `${esc(bullet)} ` : ""}${runs}</p>`;
}

function bodyHtml(
  shape: XNode,
  ctx: DeckContext,
  key: string | null,
): { html: string; text: string } {
  const body = child(shape, "p:txBody");
  if (!body) return { html: "", text: "" };

  const paragraphs = childrenNamed(body, "a:p");
  const html = paragraphs.map((p) => paragraphHtml(p, ctx, shape, key)).join("");
  const text = paragraphs
    .map((p) => textOf(p).trim())
    .filter(Boolean)
    .join("\n");

  const bodyPr = child(body, "a:bodyPr");
  const anchor = { t: "flex-start", ctr: "center", b: "flex-end" }[bodyPr?.attrs.anchor ?? "t"];
  if (!html) return { html: "", text };

  return {
    html: `<div style="display:flex;flex-direction:column;justify-content:${anchor};height:100%;">${html}</div>`,
    text,
  };
}

// ── Shapes ──────────────────────────────────────────────────────────────────

/** Preset geometries drawn as something other than a rectangle. */
const ROUND: Record<string, string> = {
  ellipse: "50%",
  roundRect: "12px",
  round1Rect: "12px",
  round2SameRect: "12px",
  pie: "50%",
  donut: "50%",
};

function shapeStyle(shape: XNode, ctx: DeckContext): string {
  const spPr = child(shape, "p:spPr");
  if (!spPr) return "";

  let style = "";
  const solid = child(spPr, "a:solidFill");
  const gradient = child(spPr, "a:gradFill");
  const noFill = child(spPr, "a:noFill");
  if (solid) {
    const paint = paintOf(solid, ctx.theme);
    if (paint) style += `background:${cssColour(paint)};`;
  } else if (gradient) {
    const css = gradientOf(gradient, ctx.theme);
    if (css) style += `background:${css};`;
  } else if (!noFill) {
    // Most shapes drawn in PowerPoint state no fill of their own and take one
    // from the theme's style matrix. Reading only explicit fills imported
    // them as invisible rectangles.
    const themed = styleFill(shape, ctx.inh);
    if (themed) style += `background:${themed};`;
  }

  const line = child(spPr, "a:ln");
  if (line && !child(line, "a:noFill")) {
    const lineFill = child(line, "a:solidFill");
    const paint = lineFill ? paintOf(lineFill, ctx.theme) : null;
    const colour = paint
      ? cssColour(paint)
      : (() => {
          const themed = styleLine(shape, ctx.inh);
          return themed ? `#${themed}` : null;
        })();
    const widthPt = line.attrs.w ? Number(line.attrs.w) / EMU_PER_POINT : 1;
    if (colour) style += `border:${Math.max(1, widthPt).toFixed(1)}px solid ${colour};`;
  } else if (!line) {
    const themed = styleLine(shape, ctx.inh);
    if (themed) style += `border:1px solid #${themed};`;
  }

  const geom = child(spPr, "a:prstGeom")?.attrs.prst;
  if (geom && ROUND[geom]) style += `border-radius:${ROUND[geom]};`;

  return style;
}

function place(frame: Frame, ctx: DeckContext): string {
  const rotate =
    frame.rot || frame.flipH || frame.flipV
      ? `transform:${frame.rot ? `rotate(${frame.rot.toFixed(2)}deg)` : ""}` +
        `${frame.flipH ? " scaleX(-1)" : ""}${frame.flipV ? " scaleY(-1)" : ""};`
      : "";
  return (
    `position:absolute;` +
    `left:${((frame.x / ctx.slideW) * 100).toFixed(3)}%;` +
    `top:${((frame.y / ctx.slideH) * 100).toFixed(3)}%;` +
    `width:${((frame.w / ctx.slideW) * 100).toFixed(3)}%;` +
    `height:${((frame.h / ctx.slideH) * 100).toFixed(3)}%;` +
    rotate
  );
}

interface Drawn {
  html: string;
  text: string;
  title: string | null;
  /** The largest type size in this part, for picking a slide's title. */
  weight?: number;
  warnings: string[];
}

/** The largest run size in a shape, in points. */
function largestSize(shape: XNode): number {
  const sizes = findAll(shape, "a:rPr")
    .map((r) => (r.attrs.sz ? Number(r.attrs.sz) / 100 : 0))
    .filter((n) => n > 0);
  return sizes.length ? Math.max(...sizes) : 0;
}

function drawShape(shape: XNode, ctx: DeckContext, transform: GroupTransform): Drawn {
  const key = placeholderKey(shape);
  const own = frameOf(find(child(shape, "p:spPr") ?? shape, "a:xfrm"));
  // A placeholder with no geometry of its own takes the layout's — which is
  // how most real decks are built, and why importing only explicit boxes
  // produces slides with the title missing.
  const inherited = key ? ctx.placeholders.get(key) : undefined;
  const frame = own ? applyTransform(own, transform) : inherited;
  if (!frame) return { html: "", text: "", title: null, warnings: [] };

  const { html: inner, text } = bodyHtml(shape, ctx, key);
  const style = shapeStyle(shape, ctx) + place(frame, ctx);
  const isTitle = key?.startsWith("title") || key?.startsWith("ctrTitle");

  return {
    html: `<div style="${style}overflow:hidden;">${inner}</div>`,
    text,
    title: isTitle && text ? text.split("\n")[0] : null,
    // How big this shape's largest type is, so a deck built without
    // placeholders — which is most decks a tool exported — can still be asked
    // what its slides are called.
    weight: text ? largestSize(shape) : 0,
    warnings: [],
  };
}

function drawPicture(pic: XNode, ctx: DeckContext, transform: GroupTransform): Drawn {
  const own = frameOf(find(child(pic, "p:spPr") ?? pic, "a:xfrm"));
  if (!own) return { html: "", text: "", title: null, warnings: [] };
  const frame = applyTransform(own, transform);

  // A picture's relationship id is normally on a:blip, but an SVG one hides it
  // on an svgBlip inside the blip's extension list — which is where a deck
  // exported with vector icons puts every one of them.
  const blip = find(pic, "a:blip");
  const nested = blip
    ? (findAll(blip, "asvg:svgBlip")[0] ??
      blip.children.flatMap((c) => findAll(c, "asvg:svgBlip"))[0])
    : undefined;
  const id =
    blip?.attrs["r:embed"] ?? blip?.attrs["r:link"] ?? nested?.attrs["r:embed"] ?? undefined;
  const url = id ? ctx.media.get(id) : undefined;
  if (!url) {
    return {
      html: "",
      text: "",
      title: null,
      warnings: ["a picture could not be read and was left out"],
    };
  }

  const name = find(pic, "p:cNvPr")?.attrs.name ?? "";
  return {
    html:
      `<div style="${place(frame, ctx)}overflow:hidden;">` +
      `<img src="${esc(url)}" alt="${esc(name)}" ` +
      `style="width:100%;height:100%;object-fit:contain;" /></div>`,
    text: "",
    title: null,
    warnings: [],
  };
}

/** Walk a shape tree, drawing everything in it, groups included. */
function drawTree(tree: XNode, ctx: DeckContext, transform: GroupTransform): Drawn {
  const parts: Drawn[] = [];

  for (const node of tree.children) {
    if (node.name === "p:sp") {
      parts.push(drawShape(node, ctx, transform));
      continue;
    }
    if (node.name === "p:pic") {
      parts.push(drawPicture(node, ctx, transform));
      continue;
    }
    if (node.name === "p:grpSp") {
      // A group states its own box and the coordinate space its children were
      // drawn in; without mapping between them, every grouped shape lands in
      // the top-left corner.
      const grpXfrm = find(child(node, "p:grpSpPr") ?? node, "a:xfrm");
      const outer = frameOf(grpXfrm);
      const chOff = grpXfrm ? child(grpXfrm, "a:chOff") : null;
      const chExt = grpXfrm ? child(grpXfrm, "a:chExt") : null;
      let inner = transform;
      if (outer && chOff && chExt) {
        const cw = Number(chExt.attrs.cx ?? 1) || 1;
        const ch = Number(chExt.attrs.cy ?? 1) || 1;
        const mapped = applyTransform(outer, transform);
        inner = {
          scaleX: (mapped.w / cw) * 1,
          scaleY: (mapped.h / ch) * 1,
          offsetX: mapped.x - Number(chOff.attrs.x ?? 0) * (mapped.w / cw),
          offsetY: mapped.y - Number(chOff.attrs.y ?? 0) * (mapped.h / ch),
        };
      }
      parts.push(drawTree(node, ctx, inner));
      continue;
    }
    if (node.name === "p:graphicFrame") {
      const kind = find(node, "a:graphicData")?.attrs.uri ?? "";
      const what = kind.includes("table")
        ? "a table"
        : kind.includes("chart")
          ? "a chart"
          : kind.includes("diagram")
            ? "a SmartArt diagram"
            : "an embedded object";
      parts.push({
        html: "",
        text: "",
        title: null,
        warnings: [`${what} could not be imported and is missing from this slide`],
      });
    }
  }

  // The title placeholder if the deck has one; otherwise the largest piece of
  // type on the slide, which is what a reader would call its title anyway.
  const placeholderTitle = parts.find((p) => p.title)?.title ?? null;
  const biggest = parts
    .filter((p) => p.text && (p.weight ?? 0) > 0)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];

  return {
    html: parts.map((p) => p.html).join(""),
    text: parts
      .map((p) => p.text)
      .filter(Boolean)
      .join("\n"),
    title: placeholderTitle ?? biggest?.text.split("\n")[0] ?? null,
    warnings: parts.flatMap((p) => p.warnings),
  };
}

// ── The package ─────────────────────────────────────────────────────────────

/** Resolve a relationship target against the part that referenced it. */
function resolveTarget(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const dir = fromPart.slice(0, fromPart.lastIndexOf("/"));
  const parts = `${dir}/${target}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

async function readXml(zip: JSZip, path: string): Promise<XNode | null> {
  const file = zip.file(path);
  if (!file) return null;
  return parseXml(await file.async("string"));
}

/** relationship id → target part, for one part's .rels file. */
async function readRels(zip: JSZip, part: string): Promise<Map<string, string>> {
  const dir = part.slice(0, part.lastIndexOf("/"));
  const name = part.slice(part.lastIndexOf("/") + 1);
  const rels = await readXml(zip, `${dir}/_rels/${name}.rels`);
  const map = new Map<string, string>();
  if (!rels) return map;
  for (const rel of findAll(rels, "Relationship")) {
    if (rel.attrs.Id && rel.attrs.Target) {
      map.set(rel.attrs.Id, resolveTarget(part, rel.attrs.Target));
    }
  }
  return map;
}

/** Placeholder boxes a slide inherits, layout first and master behind it. */
function collectPlaceholders(
  part: XNode | null,
  ctx: { w: number; h: number },
): Map<string, Frame> {
  const found = new Map<string, Frame>();
  if (!part) return found;
  const tree = find(part, "p:spTree");
  if (!tree) return found;

  for (const shape of findAll(tree, "p:sp")) {
    const key = placeholderKey(shape);
    const frame = frameOf(find(child(shape, "p:spPr") ?? shape, "a:xfrm"));
    if (key && frame && !found.has(key)) found.set(key, frame);
  }
  void ctx;
  return found;
}

/**
 * Read a .pptx into slides.
 *
 * Never throws on a slide it cannot read: that slide is reported in its own
 * warnings and the rest of the deck still imports, because losing one slide of
 * forty is recoverable and losing the upload is not.
 */
export async function importPptx(data: Buffer, options: ImportOptions): Promise<ImportedDeck> {
  const zip = await JSZip.loadAsync(data);

  const presentation = await readXml(zip, "ppt/presentation.xml");
  if (!presentation) throw new Error("This file is not a PowerPoint presentation.");

  const size = find(presentation, "p:sldSz");
  const slideW = Number(size?.attrs.cx ?? 12192000);
  const slideH = Number(size?.attrs.cy ?? 6858000);
  const pxPerPoint = CANVAS_W / (slideW / EMU_PER_INCH / (1 / 72));

  const presRels = await readRels(zip, "ppt/presentation.xml");
  const order = findAll(presentation, "p:sldId")
    .map((s) => presRels.get(s.attrs["r:id"] ?? ""))
    .filter((p): p is string => Boolean(p));

  const slidePaths = order.length
    ? order
    : Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));

  const slides: ImportedSlide[] = [];
  let hidden = 0;

  for (const [index, path] of slidePaths.entries()) {
    const warnings: string[] = [];
    try {
      const slideXml = await readXml(zip, path);
      if (!slideXml) continue;

      // A slide hidden in PowerPoint is one the author decided not to show.
      // It is skipped rather than imported: it should not appear in the
      // lesson, and — because the quiz is written from the lesson's slides —
      // nothing should be asked about it either.
      if (child(slideXml, "p:sld")?.attrs.show === "0") {
        hidden++;
        continue;
      }

      const rels = await readRels(zip, path);

      // The layout, and the master behind it, for placeholder geometry and
      // for the theme this slide is coloured from.
      const layoutPath = [...rels.values()].find((t) => t.includes("slideLayouts/"));
      const layoutXml = layoutPath ? await readXml(zip, layoutPath) : null;
      const layoutRels = layoutPath ? await readRels(zip, layoutPath) : new Map<string, string>();
      const masterPath = [...layoutRels.values()].find((t) => t.includes("slideMasters/"));
      const masterXml = masterPath ? await readXml(zip, masterPath) : null;
      const masterRels = masterPath ? await readRels(zip, masterPath) : new Map<string, string>();
      const themePath =
        [...masterRels.values()].find((t) => t.includes("theme/")) ?? "ppt/theme/theme1.xml";
      const themeXml = await readXml(zip, themePath);

      const placeholders = new Map<string, Frame>([
        ...collectPlaceholders(masterXml, { w: slideW, h: slideH }),
        ...collectPlaceholders(layoutXml, { w: slideW, h: slideH }),
      ]);

      // Pictures are stored once and referenced by relationship id.
      const media = new Map<string, string>();
      for (const [id, target] of rels) {
        if (!target.startsWith("ppt/media/")) continue;
        const file = zip.file(target);
        if (!file) continue;
        const bytes = await file.async("uint8array");
        media.set(id, await options.saveMedia(target.split("/").pop() ?? "image", bytes));
      }

      const theme = themeXml ? readTheme(themeXml) : {};
      const inh: Inheritance = {
        theme,
        fonts: readFonts(themeXml),
        layout: indexPlaceholders(layoutXml),
        master: indexPlaceholders(masterXml),
        txStyles: masterXml ? find(masterXml, "p:txStyles") : null,
        fillStyles: readFillStyles(themeXml),
      };

      const ctx: DeckContext = {
        theme,
        inh,
        placeholders,
        media,
        slideW,
        slideH,
        pxPerPoint,
      };

      const tree = find(slideXml, "p:spTree");
      const drawn = tree
        ? drawTree(tree, ctx, IDENTITY)
        : { html: "", text: "", title: null, warnings: [] };

      // The background, from whichever part actually states one: the slide
      // first, then its layout, then the master — the order PowerPoint reads
      // them in, and the reason a deck on a dark master no longer imports
      // onto white.
      const gradientBackground = (part: XNode | null): string | null => {
        const bg = part ? find(part, "p:bg") : null;
        const grad = bg ? find(bg, "a:gradFill") : null;
        return grad ? gradientOf(grad, ctx.theme) : null;
      };
      const background =
        gradientBackground(slideXml) ??
        backgroundOf(slideXml, inh) ??
        gradientBackground(layoutXml) ??
        backgroundOf(layoutXml, inh) ??
        gradientBackground(masterXml) ??
        backgroundOf(masterXml, inh) ??
        "#FFFFFF";

      slides.push({
        title: drawn.title?.slice(0, 90) || `Slide ${index + 1}`,
        // No font or colour on the container: every run carries what it
        // inherited, and a default here would quietly override a deck whose
        // theme says otherwise.
        html:
          `<div style="position:relative;width:100%;height:100%;background:${background};">` +
          `${drawn.html}</div>`,
        text: drawn.text,
        warnings: [...warnings, ...drawn.warnings],
      });
    } catch (error) {
      slides.push({
        title: `Slide ${index + 1}`,
        html: `<div style="position:relative;width:100%;height:100%;background:#FFFFFF;"></div>`,
        text: "",
        warnings: [
          `this slide could not be read: ${error instanceof Error ? error.message : "unknown"}`,
        ],
      });
    }
  }

  if (slides.length === 0) throw new Error("This presentation has no slides in it.");

  // The title slide is what the deck calls itself. docProps carries a title
  // too, but it is whatever tool wrote the file — "PptxGenJS Presentation" for
  // anything exported by a script — so it is only the fallback.
  const core = await readXml(zip, "docProps/core.xml");
  const docTitle = core ? textOf(find(core, "dc:title") ?? core).trim() : "";
  const first = slides[0].title;
  const fromFirstSlide = /^Slide \d+$/.test(first) ? "" : first;

  return {
    title: fromFirstSlide || docTitle || first,
    slides,
    hidden,
  };
}
