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

/** The colour a fill role resolves to, for measuring contrast against it. */
function fillHex(role: FillRole, t: SlideTemplate): string | null {
  const p = t.palette;
  switch (role) {
    case "surface":
      return p.surface;
    case "surfaceAlt":
      return p.surfaceAlt;
    case "panel":
      return p.panel;
    case "accent":
      return p.accent;
    case "accentSoft":
      return p.accentSoft;
    case "heading":
      return p.heading;
    // Measured against its darker stop, which is where the template puts the
    // text on its own gradient band.
    case "gradient":
      return p.featureFrom;
    case "none":
      return null;
  }
}

/** The colour an ink role resolves to. */
function inkHex(role: InkRole, t: SlideTemplate): string {
  const p = t.palette;
  switch (role) {
    case "heading":
      return p.heading;
    case "body":
      return p.body;
    case "muted":
      return p.muted;
    case "accent":
      return p.accent;
    case "onAccent":
      return p.onAccent;
    case "iconInk":
      return p.iconInk;
    case "featureHeading":
      return p.featureHeading;
    case "featureBody":
      return p.featureBody;
  }
}

function luminance(hex: string): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = parseInt(hex, 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

/** WCAG contrast ratio between two hex colours. */
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The floor below which text has effectively disappeared.
 *
 * Deliberately not the WCAG 4.5: the template's own pairings — its mint
 * eyebrow on white, the white number in a mint chip — sit near 2.2, and a
 * stricter floor would "correct" the brand into something else. What this
 * catches is the pairing nobody chose on purpose: navy type on the navy
 * gradient band at 1.0, mint on the pale mint chip at 1.6, white on a white
 * card. Those are invisible, not quiet.
 */
const MIN_CONTRAST = 2;

/**
 * Pick a readable ink for text sitting on a given fill.
 *
 * The model chooses ink and fill separately and sometimes puts the navy
 * heading colour on the navy gradient band, or the mint accent on the pale
 * mint chip. Both are invisible, and neither is something the model can see
 * for itself. Rather than trusting it, the ink it asked for is measured
 * against what is actually underneath and replaced when it fails.
 */
function readableInk(
  wanted: InkRole,
  background: string | null,
  emphasis: boolean,
  t: SlideTemplate,
): InkRole {
  if (!background) return wanted;
  if (contrast(inkHex(wanted, t), background) >= MIN_CONTRAST) return wanted;

  // In preference order: the role that means the same thing on the other side
  // of the light/dark divide, then anything legible.
  const candidates: InkRole[] = emphasis
    ? ["featureHeading", "heading", "onAccent", "body", "featureBody", "muted"]
    : ["featureBody", "body", "onAccent", "featureHeading", "heading", "muted"];

  let best: { role: InkRole; ratio: number } | null = null;
  for (const role of candidates) {
    const ratio = contrast(inkHex(role, t), background);
    if (ratio >= MIN_CONTRAST) return role;
    if (!best || ratio > best.ratio) best = { role, ratio };
  }
  return best?.role ?? wanted;
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
  /**
   * The same faults counted by kind, because they are not equally bad. A
   * sentence cut off mid-word is a defect anyone sees; a card nudged a
   * fraction back inside the margin is not.
   */
  faults: { truncated: number; overlapping: number; recoloured: number; moved: number };
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
/**
 * Nor below this share of the role's own size, or the deck loses its scale.
 *
 * Shrinking to seven tenths before cutting is deliberate: a sentence set two
 * points smaller still reads, and a sentence cut off does not.
 */
const MIN_SCALE = 0.7;
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
  const faults = { truncated: 0, overlapping: 0, recoloured: 0, moved: 0 };
  const resolved: ResolvedElement[] = [];

  composition.elements.forEach((el, index) => {
    const before = warnings.length;
    const box = clamp(el, warnings, index + 1);
    faults.moved += warnings.length - before;
    const entry: ResolvedElement = { element: el, ...box };

    if (el.kind === "text") {
      const basePt = pointSizeFor(el.role, template);
      const fitted = fitText(el.text, box.w, box.h, basePt);
      entry.fontPt = fitted.fontPt;
      entry.text = fitted.text;
      entry.ink = el.ink ?? defaultInk(el.role);
      entry.truncated = fitted.truncated;
      if (fitted.truncated) {
        faults.truncated++;
        warnings.push(
          `"${el.text.slice(0, 40)}…" did not fit its box and was cut — shorten it, or give it more room`,
        );
      }
    } else if (el.kind === "chip") {
      // A chip's label is one or two characters, so it is sized to the chip
      // rather than fitted: a step number never wraps.
      // Sized to the chip: a step number fills a bit over a third of the
      // circle's height, as the template's own numbered chips do. It used to
      // come out at the 10.5pt floor whatever the chip's size, so a step
      // number sat like a footnote in the middle of a large disc.
      entry.fontPt =
        Math.round(Math.max(MIN_FONT_PT, (box.h * CANVAS_H * 0.38) / PX_PER_PT) * 10) / 10;
      entry.text = el.text;
      entry.ink = el.ink ?? chipInk(el.fill, Boolean(el.icon));
    } else if (el.kind === "icon") {
      entry.ink = el.ink ?? "iconInk";
    }

    resolved.push(entry);
  });

  // ---- What each thing is sitting on ----
  //
  // Both renderers draw filled shapes first, so a card is always underneath
  // the text placed over it. The topmost shape containing an element's centre
  // is therefore its background, and the ink is measured against that.
  const shapes = resolved.filter((r) => r.element.kind === "card" || r.element.kind === "band");
  const backgroundOf = (r: ResolvedElement): string => {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h) {
        const el = s.element;
        if (el.kind !== "card" && el.kind !== "band") continue;
        const hex = fillHex(el.fill, template);
        if (hex) return hex;
      }
    }
    return template.palette.surface;
  };

  for (const entry of resolved) {
    const kind = entry.element.kind;
    if (kind !== "text" && kind !== "chip" && kind !== "icon") continue;
    // A chip's own fill is what its label sits on, not the card behind it.
    const own =
      kind === "chip" && entry.element.kind === "chip"
        ? fillHex(entry.element.fill, template)
        : null;
    const background = own ?? backgroundOf(entry);
    const wanted = entry.ink ?? "body";
    const emphasis =
      entry.element.kind === "text"
        ? entry.element.role !== "body" && entry.element.role !== "small"
        : true;
    const readable = readableInk(wanted, background, emphasis, template);
    if (readable !== wanted) {
      entry.ink = readable;
      faults.recoloured++;
      warnings.push(
        `${kind === "text" ? `"${(entry.text ?? "").slice(0, 30)}"` : `a ${kind}`} was ` +
          `unreadable on what it sits on, and its colour was corrected — ` +
          `put light ink on a filled or gradient shape and dark ink on a pale one`,
      );
    }
  }

  // Text printing over text is the defect a reader notices first, and the one
  // a model cannot see for itself without being shown the rendered slide.
  const texts = resolved.filter((r) => r.element.kind === "text");
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      if (overlaps(texts[i], texts[j])) {
        faults.overlapping++;
        warnings.push(
          `two text boxes overlap: "${(texts[i].text ?? "").slice(0, 24)}…" and ` +
            `"${(texts[j].text ?? "").slice(0, 24)}…"`,
        );
      }
    }
  }

  return { elements: resolved, warnings, faults };
}
