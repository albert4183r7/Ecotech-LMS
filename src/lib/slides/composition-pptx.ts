import type PptxGenJS from "pptxgenjs";
import type { FillRole, InkRole, SlideComposition } from "./composition";
import { resolveComposition, type ResolvedElement } from "./composition-resolve";
import type { SlideTemplate } from "./template";
import { GRADIENT_SENTINEL } from "./pptx-gradient";
import { RADIUS } from "./template-layouts";
import { iconPng } from "./icon-raster";

// ============================================
// Drawing a composition in PowerPoint
//
// The second consumer of the resolved composition. Same fractions, same type
// sizes, same colours — the only difference is the drawing API, which is what
// makes the exported deck and the lesson on screen the same slide.
// ============================================

function ink(t: SlideTemplate, role: InkRole): string {
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

function fill(t: SlideTemplate, role: FillRole): string | null {
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
    // pptxgenjs cannot express a gradient, so this goes in as a sentinel
    // colour and applyGradients() swaps it for a real <a:gradFill>.
    case "gradient":
      return GRADIENT_SENTINEL;
    case "none":
      return null;
  }
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

function inches(t: SlideTemplate, el: ResolvedElement): Frame {
  return {
    x: el.x * t.deck.widthIn,
    y: el.y * t.deck.heightIn,
    w: el.w * t.deck.widthIn,
    h: el.h * t.deck.heightIn,
  };
}

/** Rasterise a composition's icons before slides are added in deck order. */
export async function prepareCompositionAssets(
  composition: SlideComposition,
  template: SlideTemplate,
): Promise<void> {
  const { elements } = resolveComposition(composition, template);
  await Promise.all(
    elements.map(async (el) => {
      const e = el.element;
      const frame = inches(template, el);
      if (e.kind === "chip" && e.icon) {
        await iconPng(e.icon, ink(template, el.ink ?? "iconInk"), frame.w * 0.55, el.text ?? "");
      } else if (e.kind === "icon") {
        await iconPng(e.icon, ink(template, el.ink ?? "iconInk"), Math.min(frame.w, frame.h));
      }
    }),
  );
}

/**
 * Draw one composition onto a new PowerPoint slide.
 *
 * Returns whatever the resolver had to compromise on, so a caller can report a
 * trimmed slide rather than shipping it silently.
 */
export async function addCompositionSlide(
  pptx: PptxGenJS,
  composition: SlideComposition,
  template: SlideTemplate,
  options: { slideNumber?: number } = {},
): Promise<{ warnings: string[] }> {
  const { elements, warnings } = resolveComposition(composition, template);
  const slide = pptx.addSlide();
  slide.background = { color: template.palette.surface };

  // Filled shapes first, so text and glyphs sit on top of their cards.
  const order = (el: ResolvedElement) =>
    el.element.kind === "card" || el.element.kind === "band" ? 0 : 1;

  for (const el of [...elements].sort((a, b) => order(a) - order(b))) {
    const e = el.element;
    const frame = inches(template, el);

    if (e.kind === "card" || e.kind === "band") {
      const colour = fill(template, e.fill);
      if (!colour) continue;
      const pill = e.corner === "pill";
      slide.addShape(pill ? "ellipse" : "roundRect", {
        ...frame,
        fill:
          e.alpha === undefined
            ? { color: colour }
            : { color: colour, transparency: Math.round((1 - e.alpha) * 100) },
        line: { type: "none" },
        // The same fraction of the slide width the web renderer uses, which
        // is the radius measured from the template file.
        ...(pill
          ? {}
          : {
              rectRadius:
                e.corner === "square"
                  ? 0
                  : Math.max(
                      0.01,
                      (e.kind === "band" ? RADIUS.panel : RADIUS.card) * template.deck.widthIn,
                    ),
            }),
      });
      continue;
    }

    if (e.kind === "chip") {
      const colour = fill(template, e.fill) ?? template.palette.accent;
      slide.addShape("ellipse", { ...frame, fill: { color: colour }, line: { type: "none" } });
      if (e.icon) {
        // The glyph itself, at 55% of the chip, centred — the same proportion
        // the web renderer draws it at.
        const inner = frame.w * 0.55;
        const data = await iconPng(
          e.icon,
          ink(template, el.ink ?? "iconInk"),
          inner,
          el.text ?? "",
        );
        if (data) {
          slide.addImage({
            data,
            x: frame.x + (frame.w - inner) / 2,
            y: frame.y + (frame.h - inner) / 2,
            w: inner,
            h: inner,
          });
        }
      }
      if (el.text) {
        slide.addText(el.text, {
          ...frame,
          fontFace: template.fonts.heading,
          fontSize: el.fontPt ?? 14,
          color: ink(template, el.ink ?? "onAccent"),
          bold: true,
          align: "center",
          valign: "middle",
          margin: 0,
          shrinkText: false,
          isTextBox: true,
        });
      }
      continue;
    }

    if (e.kind === "line" || e.kind === "arrow") {
      // PowerPoint has a real arrow shape, so the export keeps a connector as
      // a connector rather than as a picture of one.
      const vertical = e.direction === "down" || e.direction === "up";
      const shape = e.kind === "arrow" ? (vertical ? "downArrow" : "rightArrow") : "line";
      const colour = ink(template, el.ink ?? "accent");
      if (shape === "line") {
        slide.addShape("line", {
          ...frame,
          line: { color: colour, width: 2 },
          flipH: e.direction === "left",
          flipV: e.direction === "up",
        });
      } else {
        slide.addShape(shape, {
          ...frame,
          fill: { color: colour },
          line: { type: "none" },
          flipH: e.direction === "left",
          flipV: e.direction === "up",
        });
      }
      continue;
    }

    if (e.kind === "icon") {
      // Rasterised, because pptxgenjs places pictures rather than SVG. The
      // square of the box keeps the glyph's aspect: an icon stretched to a
      // wide box is worse than a smaller one drawn true.
      const size = Math.min(frame.w, frame.h);
      const data = await iconPng(e.icon, ink(template, el.ink ?? "iconInk"), size);
      if (data) {
        slide.addImage({
          data,
          x: frame.x + (frame.w - size) / 2,
          y: frame.y + (frame.h - size) / 2,
          w: size,
          h: size,
        });
      }
      continue;
    }

    if (e.kind !== "text") continue;

    const heading = e.role !== "body" && e.role !== "small";
    slide.addText(el.text ?? "", {
      ...frame,
      fontFace: heading ? template.fonts.heading : template.fonts.body,
      fontSize: el.fontPt ?? 13,
      color: ink(template, el.ink ?? "body"),
      bold: e.bold ?? heading,
      align: e.align ?? "left",
      valign: e.role === "metric" || e.role === "display" ? "middle" : "top",
      margin: 0,
      lineSpacingMultiple: 1.3,
      charSpacing: e.role === "eyebrow" ? 1.5 : 0,
      shrinkText: false,
      isTextBox: true,
    });
  }

  if (options.slideNumber !== undefined) {
    slide.addText(String(options.slideNumber).padStart(2, "0"), {
      x: template.deck.widthIn * 0.9,
      y: template.deck.heightIn * 0.925,
      w: template.deck.widthIn * 0.06,
      h: template.deck.heightIn * 0.05,
      fontFace: template.fonts.body,
      fontSize: 10,
      color: template.palette.muted,
      align: "right",
      margin: 0,
      isTextBox: true,
    });
  }

  return { warnings };
}
