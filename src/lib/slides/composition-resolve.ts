import type { SlideComposition, SlideElement, FillRole, InkRole, TextRole } from "./composition";
import { SLIDE_TEMPLATE, type SlideTemplate } from "./template";

// ============================================
// Resolving a composition
//
// Between the model's arrangement and the two renderers. It does the part of
// the designer's job that is measurement rather than judgement: keep every
// element on the slide, keep it out of the margins, give text a size that
// actually fits its box, and report what it could not reconcile.
//
// The report matters as much as the fixes. A composition that had to be
// clamped in six places is a composition the model should be shown again,
// which is what the review pass reads.
// ============================================

/** The canvas both renderers draw on. */
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
/** Deck width in points, so a template point size maps to canvas pixels. */
const DECK_PT = 960;
const PX_PER_PT = CANVAS_W / DECK_PT;

/** The template's own margin, as a fraction. Nothing is drawn outside it. */
const MARGIN_X = 0.045;
const MARGIN_Y = 0.055;
/** The page number sits here; content stops above it. */
const FOOTER_Y = 0.925;

/** Average glyph width as a fraction of the point size, and line spacing. */
const GLYPH_RATIO = 0.5;
const LINE_HEIGHT = 1.3;
/** Ragged wrapping never fills a line completely. */
const FILL_FACTOR = 0.92;

/** Type sizes a role resolves to, from the template's measured scale. */
export function pointSizeFor(role: TextRole, t: SlideTemplate = SLIDE_TEMPLATE): number {
  switch (role) {
    case "display":
      return t.type.display;
    case "title":
      return t.type.title;
    case "heading":
      return t.type.heading;
    case "body":
      return t.type.body;
    case "small":
      return t.type.small;
    case "eyebrow":
      return t.type.eyebrow;
    case "metric":
      // Between title and display: the template sets its metric tiles at 34pt.
      return Math.round((t.type.title + t.type.display) / 2 - 8);
  }
}

/**
 * The default ink for a chip, from what it is filled with.
 *
 * White on the solid fills, the template's navy on the pale ones. Defaulting
 * everything to white put a white glyph on a mint tint, where it was all but
 * invisible — the kind of fault a designer catches by looking at the slide.
 */
function chipInk(fill: FillRole, hasIcon: boolean): InkRole {
  switch (fill) {
    case "accent":
    case "heading":
    case "gradient":
      return "onAccent";
    default:
      return hasIcon ? "iconInk" : "heading";
  }
}

/** The default ink for a role, when the composition does not name one. */
function defaultInk(role: TextRole): InkRole {
  switch (role) {
    case "display":
    case "title":
    case "heading":
      return "heading";
    case "eyebrow":
    case "metric":
      return "accent";
    case "small":
      return "muted";
    case "body":
      return "body";
  }
}

export interface ResolvedElement {
  element: SlideElement;
  /** Pixel geometry on the canvas, after clamping. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Text elements only: the size to draw at, and the text as it will fit. */
  fontPt?: number;
  text?: string;
  ink?: InkRole;
  truncated?: boolean;
}

export interface ResolvedComposition {
  elements: ResolvedElement[];
  /** What had to be corrected, in the words a reviewer needs. */
  warnings: string[];
}

/** How many characters a box holds at a size, by the same measure both
 *  renderers and the PowerPoint exporter use. */
function capacity(wFrac: number, hFrac: number, fontPt: number): number {
  const fontPx = fontPt * PX_PER_PT;
  const perLine = Math.max(1, Math.floor((wFrac * CANVAS_W) / (fontPx * GLYPH_RATIO)));
  const lines = Math.max(1, Math.floor((hFrac * CANVAS_H) / (fontPx * LINE_HEIGHT)));
  return Math.floor(perLine * lines * FILL_FACTOR);
}

/** Never below this, whatever the box wants: smaller stops being legible. */
const MIN_FONT_PT = 10.5;
/** Nor below this share of the role's own size, or the deck loses its scale. */
const MIN_SCALE = 0.8;
const SCALE_STEP = 0.05;

/**
 * Fit text to its box: shrink, then trim at a word boundary.
 *
 * The loop compares the unrounded size against the floor and is bounded
 * besides. Both matter — the same shape of loop, comparing a rounded size,
 * spun forever and took the server with it.
 */
function fitText(
  text: string,
  wFrac: number,
  hFrac: number,
  basePt: number,
): { fontPt: number; text: string; truncated: boolean } {
  const floor = Math.max(MIN_FONT_PT, basePt * MIN_SCALE);
  const steps = Math.ceil((1 - MIN_SCALE) / SCALE_STEP) + 2;

  for (let step = 0; step <= steps; step++) {
    const exact = Math.max(basePt * (1 - step * SCALE_STEP), floor);
    const fontPt = Math.round(exact * 10) / 10;
    if (text.length <= capacity(wFrac, hFrac, fontPt)) {
      return { fontPt, text, truncated: false };
    }
    if (exact <= floor + 1e-9) break;
  }

  const fontPt = Math.round(floor * 10) / 10;
  const room = capacity(wFrac, hFrac, fontPt);
  const cut = text.slice(0, Math.max(1, room - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const kept = (lastSpace > room * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return { fontPt, text: `${kept}…`, truncated: true };
}

/** Keep a box inside the drawable area, preserving its size where it can. */
function clamp(
  el: SlideElement,
  warnings: string[],
  index: number,
): { x: number; y: number; w: number; h: number } {
  const maxW = 1 - MARGIN_X * 2;
  const maxH = FOOTER_Y - MARGIN_Y;

  const w = Math.min(Math.max(el.w, 0.01), maxW);
  const h = Math.min(Math.max(el.h, 0.01), maxH);
  const x = Math.min(Math.max(el.x, MARGIN_X), 1 - MARGIN_X - w);
  const y = Math.min(Math.max(el.y, MARGIN_Y), FOOTER_Y - h);

  if (Math.abs(x - el.x) > 0.002 || Math.abs(y - el.y) > 0.002) {
    warnings.push(`element ${index} (${el.kind}) sat outside the slide and was moved inside it`);
  }
  if (w < el.w - 0.002 || h < el.h - 0.002) {
    warnings.push(`element ${index} (${el.kind}) was wider or taller than the slide`);
  }
  return { x, y, w, h };
}

/** Do two text boxes overlap enough that one is printing over the other? */
function overlaps(a: ResolvedElement, b: ResolvedElement): boolean {
  const overlapW = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (overlapW <= 0 || overlapH <= 0) return false;
  const area = overlapW * overlapH;
  return area > 0.35 * Math.min(a.w * a.h, b.w * b.h);
}

/**
 * Resolve a composition for drawing, and report what it could not honour.
 *
 * Nothing is dropped: an element that will not fit is corrected and named, so
 * the reviewer sees a slide that renders and a list of what is wrong with it,
 * rather than a slide with something silently missing.
 */
export function resolveComposition(
  composition: SlideComposition,
  template: SlideTemplate = SLIDE_TEMPLATE,
): ResolvedComposition {
  const warnings: string[] = [];
  const resolved: ResolvedElement[] = [];

  composition.elements.forEach((el, index) => {
    const box = clamp(el, warnings, index + 1);
    const entry: ResolvedElement = { element: el, ...box };

    if (el.kind === "text") {
      const basePt = pointSizeFor(el.role, template);
      const fitted = fitText(el.text, box.w, box.h, basePt);
      entry.fontPt = fitted.fontPt;
      entry.text = fitted.text;
      entry.ink = el.ink ?? defaultInk(el.role);
      entry.truncated = fitted.truncated;
      if (fitted.truncated) {
        warnings.push(
          `"${el.text.slice(0, 40)}…" did not fit its box and was cut — shorten it, or give it more room`,
        );
      }
    } else if (el.kind === "chip") {
      // A chip's label is one or two characters, so it is sized to the chip
      // rather than fitted: a step number never wraps.
      entry.fontPt = Math.max(MIN_FONT_PT, Math.round(box.h * CANVAS_H * 0.42) / PX_PER_PT / 2);
      entry.text = el.text;
      entry.ink = el.ink ?? chipInk(el.fill, Boolean(el.icon));
    } else if (el.kind === "icon") {
      entry.ink = el.ink ?? "iconInk";
    }

    resolved.push(entry);
  });

  // Text printing over text is the defect a reader notices first, and the one
  // a model cannot see for itself without being shown the rendered slide.
  const texts = resolved.filter((r) => r.element.kind === "text");
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlaps(texts[i], texts[j])) {
        warnings.push(
          `two text boxes overlap: "${(texts[i].text ?? "").slice(0, 24)}…" and ` +
            `"${(texts[j].text ?? "").slice(0, 24)}…"`,
        );
      }
    }
  }

  return { elements: resolved, warnings };
}
