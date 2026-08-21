import type { SlideContent } from "./content-schema";
import { resolveSlide, type ResolvedBox } from "./resolve";
import type { Panel } from "./template-layouts";

// ============================================
// Web slide renderer
//
// Draws the template's layout. Every box is positioned at the fraction the
// template puts it at, so the web slide and the exported deck are the same
// slide rather than two designs that resemble each other.
//
// This used to lay content out with its own Tailwind flex and grid rules,
// which is why the deck followed the template's colours but not its structure,
// and why dense slides clipped: the layout had no idea how much space it had.
// ============================================

/** The canvas the slide is authored on; sanitize.ts wraps at the same size. */
const CANVAS_W = 1280;
const CANVAS_H = 720;
/** Deck width in points, so a template point size maps to canvas pixels. */
const DECK_PT = 960;
const PX_PER_PT = CANVAS_W / DECK_PT;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Absolute placement, in percentages of the canvas. */
function place(box: { x: number; y: number; w: number; h: number }): string {
  return (
    `left:${(box.x * 100).toFixed(3)}%;` +
    `top:${(box.y * 100).toFixed(3)}%;` +
    `width:${(box.w * 100).toFixed(3)}%;` +
    `height:${(box.h * 100).toFixed(3)}%;`
  );
}

const INK_CLASS: Record<ResolvedBox["ink"], string> = {
  heading: "tpl-heading",
  body: "tpl-body",
  muted: "tpl-muted",
  accent: "tpl-ink-accent",
  onAccent: "tpl-on-accent",
  featureHeading: "tpl-feature-heading",
  featureBody: "tpl-feature-body",
};

const PANEL_FILL: Record<Panel["fill"], string> = {
  panel: "tpl-panel",
  surface: "tpl-panel-surface",
  accent: "tpl-accent",
  accentSoft: "tpl-accent-soft",
  heading: "tpl-fill-heading",
  gradient: "tpl-fill-gradient",
  none: "",
};

function renderPanel(panel: Panel): string {
  const radius =
    panel.radius >= 0.5
      ? "border-radius:9999px;"
      : `border-radius:${(panel.radius * CANVAS_W).toFixed(1)}px;`;
  const border = panel.kind === "card" ? "border:1px solid var(--tpl-panel-border);" : "";
  const alpha = panel.alpha !== undefined ? `opacity:${panel.alpha};` : "";
  return `<div class="tpl-panel-el ${PANEL_FILL[panel.fill]}" style="${place(panel)}${radius}${border}${alpha}"></div>`;
}

function renderBox(box: ResolvedBox): string {
  const fontPx = box.fontPt * PX_PER_PT;
  // Badges and metrics are centred in their box; body copy sits at the top of
  // its box, as the template sets it.
  const centred = box.role === "badge";
  const justify = centred
    ? "center"
    : box.role === "metric" || box.role === "label"
      ? "flex-end"
      : "flex-start";

  const style =
    place(box) +
    `font-size:${fontPx.toFixed(2)}px;` +
    `line-height:1.3;` +
    `font-weight:${box.bold ? 700 : 400};` +
    `text-align:${box.align};` +
    `display:flex;flex-direction:column;justify-content:${justify};` +
    (centred ? "align-items:center;" : "") +
    (box.role === "eyebrow" ? "letter-spacing:0.12em;text-transform:uppercase;" : "") +
    (box.role === "title" || box.role === "display" || box.role === "heading"
      ? "font-family:var(--tpl-font-heading);"
      : "font-family:var(--tpl-font-body);");

  return `<div class="tpl-box ${INK_CLASS[box.ink]}" style="${style}" data-path="${box.path}">${esc(box.text)}</div>`;
}

export interface RenderOptions {
  templateId?: string;
  /** Retained for callers that still pass the old name. */
  style?: string;
  slideNumber?: number;
}

/**
 * Render one slide to the HTML fragment the canvas wraps.
 *
 * The template supplies the geometry; the palette arrives as CSS custom
 * properties from wrapSlideHtml, so the same markup renders in any template.
 */
export function renderSlideContent(content: SlideContent, options: RenderOptions = {}): string {
  const resolved = resolveSlide(content, { slideNumber: options.slideNumber });

  // Decorative shapes first, so the template's screened-back circles sit
  // behind its cards and type rather than over them.
  const decor = resolved.panels
    .filter((p) => p.kind === "decor")
    .map(renderPanel)
    .join("");
  const panels = resolved.panels
    .filter((p) => p.kind !== "decor")
    .map(renderPanel)
    .join("");
  const boxes = resolved.boxes.map(renderBox).join("");

  return `<div class="tpl-slide tpl-surface" data-layout="${resolved.layoutId}">
    ${decor}
    ${panels}
    ${boxes}
  </div>`;
}

/** Anything the renderer had to compromise on, for callers that report it. */
export function renderWarnings(content: SlideContent, slideNumber?: number): string[] {
  return resolveSlide(content, { slideNumber }).warnings;
}

export { CANVAS_W, CANVAS_H, PX_PER_PT };
