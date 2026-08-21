import type PptxGenJS from "pptxgenjs";
import type { SlideContent } from "./content-schema";
import { resolveSlide, type ResolvedBox } from "./resolve";
import type { Panel } from "./template-layouts";
import type { SlideTemplate, TemplatePalette } from "./template";

// ============================================
// PowerPoint renderer
//
// The second consumer of the resolved template layout. It draws the same
// boxes, at the same fractions, at the same type sizes as the web renderer —
// the only difference is the drawing API. That is what makes the exported deck
// and the on-screen lesson the same slide.
//
// It previously invented its own arrangement of the content and merely used
// the template's colours, which is why the deck followed the palette but not
// the layout.
// ============================================

/** Colour role to a real hex value from the active template. */
function ink(palette: TemplatePalette, role: ResolvedBox["ink"]): string {
  switch (role) {
    case "heading":
      return palette.heading;
    case "body":
      return palette.body;
    case "muted":
      return palette.muted;
    case "accent":
      return palette.accent;
    case "onAccent":
      return palette.onAccent;
    case "featureHeading":
      return palette.featureHeading;
    case "featureBody":
      return palette.featureBody;
  }
}

function panelFill(palette: TemplatePalette, fill: Panel["fill"]): string | null {
  switch (fill) {
    case "panel":
      return palette.panel;
    case "accent":
      return palette.accent;
    case "accentSoft":
      return palette.accentSoft;
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

/** Fractions of the slide to the inches pptxgenjs expects. */
function inches(t: SlideTemplate, box: Frame): Frame {
  return {
    x: box.x * t.deck.widthIn,
    y: box.y * t.deck.heightIn,
    w: box.w * t.deck.widthIn,
    h: box.h * t.deck.heightIn,
  };
}

function drawPanel(slide: PptxGenJS.Slide, t: SlideTemplate, panel: Panel): void {
  const colour = panelFill(t.palette, panel.fill);
  if (!colour) return;

  const frame = inches(t, panel);
  // A pill in the template is a pill here; a card keeps its measured radius.
  const shape = panel.radius >= 0.5 ? "ellipse" : "roundRect";
  slide.addShape(shape, {
    ...frame,
    fill: { color: colour },
    line:
      panel.kind === "card"
        ? { color: t.palette.panelBorder, width: 1 }
        : { color: colour, width: 0 },
    ...(shape === "roundRect" ? { rectRadius: Math.min(0.2, panel.radius * t.deck.widthIn) } : {}),
  });
}

function drawBox(slide: PptxGenJS.Slide, t: SlideTemplate, box: ResolvedBox): void {
  const frame = inches(t, box);
  const heading = box.role === "title" || box.role === "display" || box.role === "heading";

  slide.addText(box.text, {
    ...frame,
    fontFace: heading ? t.fonts.heading : t.fonts.body,
    fontSize: box.fontPt,
    color: ink(t.palette, box.ink),
    bold: box.bold,
    align: box.align,
    valign:
      box.role === "badge"
        ? "middle"
        : box.role === "metric" || box.role === "label"
          ? "bottom"
          : "top",
    margin: 0,
    lineSpacingMultiple: 1.3,
    charSpacing: box.role === "eyebrow" ? 1.5 : 0,
    // The text was already fitted to this box, so PowerPoint should not
    // second-guess the size; shrinking again would desynchronise the two
    // renderings.
    shrinkText: false,
    isTextBox: true,
  });
}

/** Soft corner shapes, echoing the web renderer's decorative layer. */
function drawDecor(slide: PptxGenJS.Slide, t: SlideTemplate, feature: boolean): void {
  const colour = feature ? t.palette.featureDecor : t.palette.decor;
  const transparency = feature ? 80 : 94;
  for (const frame of [
    { x: 0.78, y: -0.18, w: 0.34, h: 0.6 },
    { x: -0.08, y: 0.7, w: 0.26, h: 0.48 },
  ]) {
    slide.addShape("ellipse", {
      ...inches(t, frame),
      fill: { color: colour, transparency },
      line: { color: colour, width: 0 },
    });
  }
}

/**
 * Render one slide's content onto a new PowerPoint slide.
 *
 * Returns whatever the resolver had to compromise on, so a caller can report
 * a trimmed slide rather than shipping it silently.
 */
export function addContentSlide(
  pptx: PptxGenJS,
  content: SlideContent,
  template: SlideTemplate,
  options: { slideNumber?: number } = {},
): { warnings: string[] } {
  const resolved = resolveSlide(content, { slideNumber: options.slideNumber });
  const slide = pptx.addSlide();

  // pptxgenjs cannot fill a background with a gradient, so a feature slide
  // takes the gradient's dominant stop and a band of the second, which is the
  // closest PowerPoint equivalent of what the web slide paints.
  if (resolved.feature) {
    slide.background = { color: template.palette.featureFrom };
    slide.addShape("rect", {
      ...inches(template, { x: 0, y: 0.55, w: 1, h: 0.45 }),
      fill: { color: template.palette.featureVia, transparency: 55 },
      line: { color: template.palette.featureVia, width: 0 },
    });
  } else {
    slide.background = { color: template.palette.surface };
  }

  drawDecor(slide, template, resolved.feature);
  for (const panel of resolved.panels) drawPanel(slide, template, panel);
  for (const box of resolved.boxes) drawBox(slide, template, box);

  return { warnings: resolved.warnings };
}

/** Configure a deck to the template's page size before any slide is added. */
export function applyTemplateLayout(pptx: PptxGenJS, template: SlideTemplate): void {
  const name = `TPL_${template.id.toUpperCase()}`;
  pptx.defineLayout({
    name,
    width: template.deck.widthIn,
    height: template.deck.heightIn,
  });
  pptx.layout = name;
  pptx.theme = { headFontFace: template.fonts.heading, bodyFontFace: template.fonts.body };
}
