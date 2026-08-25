import type { InkRole, FillRole, SlideComposition } from "./composition";
import {
  resolveComposition,
  CANVAS_W,
  CANVAS_H,
  type ResolvedElement,
} from "./composition-resolve";
import { RADIUS } from "./template-layouts";
import { resolveIcon } from "./icons";

// ============================================
// Drawing a composition on the web
//
// Absolute placement of whatever the composition asked for, in the template's
// own colours and type. Colour arrives as a class rather than as an inline
// declaration: the sanitiser drops `color` and `background` from style
// attributes by design, and the classes resolve to the custom properties
// wrapSlideHtml sets, so the same markup renders in whichever template is in
// force and nothing here can name a hex value.
//
// The PowerPoint renderer draws the same resolved elements at the same
// fractions, which is what keeps the exported deck and the lesson on screen
// the same slide rather than two designs that resemble each other.
// ============================================

const INK_CLASS: Record<InkRole, string> = {
  heading: "tpl-heading",
  body: "tpl-body",
  muted: "tpl-muted",
  accent: "tpl-ink-accent",
  onAccent: "tpl-on-accent",
  iconInk: "tpl-icon-ink",
  featureHeading: "tpl-feature-heading",
  featureBody: "tpl-feature-body",
};

const FILL_CLASS: Record<FillRole, string> = {
  surface: "tpl-panel-surface",
  surfaceAlt: "tpl-fill-surface-alt",
  panel: "tpl-panel",
  accent: "tpl-accent",
  accentSoft: "tpl-accent-soft",
  heading: "tpl-fill-heading",
  // The template's own emphasis gradient — its navy through to its mint.
  gradient: "tpl-fill-gradient",
  none: "",
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function place(el: ResolvedElement): string {
  return (
    `position:absolute;` +
    `left:${(el.x * 100).toFixed(3)}%;` +
    `top:${(el.y * 100).toFixed(3)}%;` +
    `width:${(el.w * 100).toFixed(3)}%;` +
    `height:${(el.h * 100).toFixed(3)}%;`
  );
}

/** Point size to canvas pixels — the deck is 960pt across a 1280px canvas. */
const PX_PER_PT = CANVAS_W / 960;

function renderOne(el: ResolvedElement, index: number): string {
  const e = el.element;

  switch (e.kind) {
    case "card":
    case "band": {
      // The template's own corner radius, as a fraction of the slide width,
      // so a composed card is rounded exactly as its cards are.
      const radius =
        e.corner === "pill"
          ? "border-radius:9999px;"
          : e.corner === "square"
            ? "border-radius:0;"
            : `border-radius:${((e.kind === "band" ? RADIUS.panel : RADIUS.card) * CANVAS_W).toFixed(1)}px;`;
      const alpha = e.alpha === undefined ? "" : `opacity:${e.alpha};`;
      // A panel-tinted card carries the template's hairline, as its own cards
      // do; a filled or gradient one does not need one.
      const border =
        e.fill === "panel" || e.fill === "surface" || e.fill === "surfaceAlt"
          ? "border:1px solid var(--tpl-panel-border);"
          : "";
      return `<div class="tpl-panel-el ${FILL_CLASS[e.fill]}" style="${place(el)}${radius}${alpha}${border}"></div>`;
    }

    case "chip": {
      const glyph = e.icon
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="60%" height="60%" aria-hidden="true">${resolveIcon(e.icon, e.text ?? "")}</svg>`
        : esc(el.text ?? "");
      return (
        `<div class="tpl-panel-el ${FILL_CLASS[e.fill]} ${INK_CLASS[el.ink ?? "onAccent"]}" ` +
        `style="${place(el)}border-radius:9999px;` +
        `display:flex;align-items:center;justify-content:center;` +
        `font-weight:700;font-family:var(--tpl-font-heading);` +
        `font-size:${((el.fontPt ?? 14) * PX_PER_PT).toFixed(1)}px;">${glyph}</div>`
      );
    }

    case "icon":
      return (
        `<div class="tpl-panel-el ${INK_CLASS[el.ink ?? "iconInk"]}" style="${place(el)}` +
        `display:flex;align-items:center;justify-content:center;">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
        `stroke-linecap="round" stroke-linejoin="round" width="100%" height="100%" ` +
        `aria-hidden="true">${resolveIcon(e.icon)}</svg></div>`
      );

    case "line":
    case "arrow": {
      const vertical = e.direction === "down" || e.direction === "up";
      // The viewBox is the box's own pixel size, so the shaft spans the gap it
      // was placed in and the head stays a triangle. A square viewBox scaled
      // to fit drew an 18px arrow in the middle of a 60px gutter, because the
      // sanitiser does not carry preserveAspectRatio.
      const vw = Math.max(2, Math.round(el.w * CANVAS_W));
      const vh = Math.max(2, Math.round(el.h * CANVAS_H));
      const head = vertical ? Math.min(vh * 0.35, 14) : Math.min(vw * 0.35, 14);
      const midX = vw / 2;
      const midY = vh / 2;
      const shaft = vertical
        ? `<line x1="${midX}" y1="0" x2="${midX}" y2="${vh - head}" />`
        : `<line x1="0" y1="${midY}" x2="${vw - head}" y2="${midY}" />`;
      const arrowhead =
        e.kind !== "arrow"
          ? ""
          : vertical
            ? `<path d="M${midX},${vh} L${midX - head * 0.6},${vh - head} L${midX + head * 0.6},${vh - head} Z" fill="currentColor" stroke="none"/>`
            : `<path d="M${vw},${midY} L${vw - head},${midY - head * 0.6} L${vw - head},${midY + head * 0.6} Z" fill="currentColor" stroke="none"/>`;
      const flip =
        e.direction === "left" || e.direction === "up" ? "transform:rotate(180deg);" : "";
      return (
        `<div class="tpl-panel-el ${INK_CLASS[el.ink ?? "accent"]}" style="${place(el)}${flip}">` +
        `<svg viewBox="0 0 ${vw} ${vh}" width="100%" height="100%" ` +
        `fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ` +
        `aria-hidden="true">${shaft}${arrowhead}</svg></div>`
      );
    }

    case "text": {
      const uppercase =
        e.role === "eyebrow" ? "text-transform:uppercase;letter-spacing:0.12em;" : "";
      const family =
        e.role === "body" || e.role === "small"
          ? "var(--tpl-font-body)"
          : "var(--tpl-font-heading)";
      const weight = (e.bold ?? (e.role !== "body" && e.role !== "small")) ? 700 : 400;
      const justify = e.role === "metric" || e.role === "display" ? "center" : "flex-start";
      return (
        `<div class="tpl-box ${INK_CLASS[el.ink ?? "body"]}" data-path="elements.${index}.text" ` +
        `style="${place(el)}` +
        `font-family:${family};font-weight:${weight};` +
        `font-size:${((el.fontPt ?? 13) * PX_PER_PT).toFixed(2)}px;line-height:1.3;` +
        `text-align:${e.align ?? "left"};${uppercase}` +
        `display:flex;flex-direction:column;justify-content:${justify};">` +
        `${esc(el.text ?? "")}</div>`
      );
    }
  }
}

export interface CompositionRenderOptions {
  slideNumber?: number;
}

/** Render a composition to the HTML fragment wrapSlideHtml wraps. */
export function renderComposition(
  composition: SlideComposition,
  options: CompositionRenderOptions = {},
): string {
  const { elements } = resolveComposition(composition);

  // Filled shapes first, so text and glyphs sit on top of their cards however
  // the composition ordered them — the same order the PowerPoint renderer
  // draws in, so one slide cannot come out two ways.
  const depth = (el: ResolvedElement) =>
    el.element.kind === "card" || el.element.kind === "band" ? 0 : 1;
  const ordered = elements
    .map((el, index) => ({ el, index }))
    .sort((a, b) => depth(a.el) - depth(b.el) || a.index - b.index);

  const footer =
    options.slideNumber === undefined
      ? ""
      : `<div class="tpl-box tpl-muted" style="position:absolute;left:88%;top:92.5%;width:8%;` +
        `height:5%;text-align:right;font-family:var(--tpl-font-body);` +
        `font-size:${(10 * PX_PER_PT).toFixed(1)}px;">` +
        `${String(options.slideNumber).padStart(2, "0")}</div>`;

  return (
    `<div class="tpl-slide tpl-surface">` + elements.map(renderOne).join("") + footer + `</div>`
  );
}

/** Anything the resolver had to correct, for callers that report it. */
export function compositionWarnings(composition: SlideComposition): string[] {
  return resolveComposition(composition).warnings;
}
