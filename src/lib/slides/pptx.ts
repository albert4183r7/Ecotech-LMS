import type PptxGenJS from "pptxgenjs";
import type { SlideContent } from "./content-schema";
import type { SlideTemplate } from "./template";

// ============================================
// PowerPoint renderer
//
// The second consumer of the structured slide model, alongside the web
// renderer in ./render. Both read the same SlideContent and the same
// SlideTemplate, which is what keeps the exported deck, the instructor
// preview, the published lesson and the student view showing the same slide.
//
// The previous export rasterised the web slide with headless Chromium and
// recovered rectangles and text runs from the rendered pixels. That could only
// ever approximate the design, lost anything without a background fill, and
// made the two representations agree by coincidence rather than by
// construction. Nothing here renders a browser.
// ============================================

/** Layout geometry as fractions of the slide, so the deck size can change. */
const MARGIN_X = 0.075;
const MARGIN_TOP = 0.1;
const CONTENT_TOP = 0.3;
const CONTENT_BOTTOM = 0.9;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Convert a fractional frame to the inches pptxgenjs expects. */
function inches(t: SlideTemplate, frame: Frame): Frame {
  return {
    x: frame.x * t.deck.widthIn,
    y: frame.y * t.deck.heightIn,
    w: frame.w * t.deck.widthIn,
    h: frame.h * t.deck.heightIn,
  };
}

function contentArea(): Frame {
  return {
    x: MARGIN_X,
    y: CONTENT_TOP,
    w: 1 - MARGIN_X * 2,
    h: CONTENT_BOTTOM - CONTENT_TOP,
  };
}

/** Split a frame into `count` columns with a gutter between them. */
function columns(frame: Frame, count: number, gutter = 0.018): Frame[] {
  const width = (frame.w - gutter * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: frame.x + i * (width + gutter),
    y: frame.y,
    w: width,
    h: frame.h,
  }));
}

/** Split a frame into `count` rows with a gutter between them. */
function rows(frame: Frame, count: number, gutter = 0.03): Frame[] {
  const height = (frame.h - gutter * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: frame.x,
    y: frame.y + i * (height + gutter),
    w: frame.w,
    h: height,
  }));
}

/** A rounded panel matching the web renderer's cards. */
function panel(slide: PptxGenJS.Slide, t: SlideTemplate, frame: Frame, fill?: string): void {
  slide.addShape("roundRect", {
    ...inches(t, frame),
    fill: { color: fill ?? t.palette.panel },
    line: { color: t.palette.panelBorder, width: 1 },
    rectRadius: 0.08,
  });
}

/** Text inside a frame, insetting so it does not touch its panel's edge. */
function text(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  frame: Frame,
  body: string | PptxGenJS.TextProps[],
  options: {
    size: number;
    color: string;
    bold?: boolean;
    heading?: boolean;
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "bottom";
    inset?: number;
    lineSpacingMultiple?: number;
  },
): void {
  const inset = options.inset ?? 0;
  const box = inches(t, {
    x: frame.x + inset,
    y: frame.y + inset,
    w: Math.max(0.05, frame.w - inset * 2),
    h: Math.max(0.05, frame.h - inset * 2),
  });
  slide.addText(body as PptxGenJS.TextProps[], {
    ...box,
    fontFace: options.heading ? t.fonts.heading : t.fonts.body,
    fontSize: options.size,
    color: options.color,
    bold: options.bold ?? false,
    align: options.align ?? "left",
    valign: options.valign ?? "top",
    margin: 0,
    lineSpacingMultiple: options.lineSpacingMultiple ?? 1.15,
    shrinkText: true,
  });
}

/** The accent rule and title every content slide opens with. */
function header(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  title: string,
  lead?: string,
  footer?: string,
): void {
  slide.addShape("roundRect", {
    ...inches(t, { x: MARGIN_X, y: MARGIN_TOP, w: 0.006, h: 0.075 }),
    fill: { color: t.palette.accent },
    line: { color: t.palette.accent, width: 0 },
    rectRadius: 0.03,
  });

  text(
    slide,
    t,
    { x: MARGIN_X + 0.018, y: MARGIN_TOP - 0.012, w: 1 - MARGIN_X * 2 - 0.018, h: 0.1 },
    title,
    { size: t.type.title, color: t.palette.heading, bold: true, heading: true, valign: "middle" },
  );

  if (lead) {
    text(slide, t, { x: MARGIN_X, y: MARGIN_TOP + 0.1, w: 0.78, h: 0.09 }, lead, {
      size: t.type.body + 2,
      color: t.palette.body,
    });
  }
  if (footer) {
    text(slide, t, { x: MARGIN_X, y: 0.93, w: 0.6, h: 0.05 }, footer, {
      size: t.type.eyebrow,
      color: t.palette.muted,
    });
  }
}

/** The decorative corner shape, echoing the web renderer's blurred blobs. */
function decor(slide: PptxGenJS.Slide, t: SlideTemplate, feature: boolean): void {
  const colour = feature ? t.palette.featureDecor : t.palette.decor;
  slide.addShape("ellipse", {
    ...inches(t, { x: 0.82, y: -0.16, w: 0.34, h: 0.6 }),
    fill: { color: colour, transparency: feature ? 82 : 94 },
    line: { color: colour, width: 0 },
  });
  slide.addShape("ellipse", {
    ...inches(t, { x: -0.1, y: 0.72, w: 0.28, h: 0.5 }),
    fill: { color: colour, transparency: feature ? 86 : 95 },
    line: { color: colour, width: 0 },
  });
}

// ────────────────────────────────────────────────
// Per-type layouts
// ────────────────────────────────────────────────

function renderFeature(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  opts: { eyebrow?: string; title: string; subtitle?: string; centred: boolean },
): void {
  // pptxgenjs cannot fill a slide background with a gradient, so the gradient's
  // dominant stop becomes the background and a band of the second stop keeps
  // some of the movement the web slide has.
  slide.background = { color: t.palette.featureFrom };
  slide.addShape("rect", {
    ...inches(t, { x: 0, y: 0.55, w: 1, h: 0.45 }),
    fill: { color: t.palette.featureVia, transparency: 55 },
    line: { color: t.palette.featureVia, width: 0 },
  });
  decor(slide, t, true);

  const align = opts.centred ? "center" : "left";
  const x = opts.centred ? 0.1 : MARGIN_X;
  const w = opts.centred ? 0.8 : 0.72;
  let y = opts.centred ? 0.3 : 0.3;

  if (opts.eyebrow) {
    text(slide, t, { x, y: y - 0.09, w, h: 0.06 }, opts.eyebrow.toUpperCase(), {
      size: t.type.eyebrow,
      color: t.palette.featureBody,
      bold: true,
      align,
    });
  }

  text(slide, t, { x, y, w, h: 0.2 }, opts.title, {
    size: t.type.display,
    color: t.palette.featureHeading,
    bold: true,
    heading: true,
    align,
    valign: "middle",
  });
  y += 0.21;

  slide.addShape("roundRect", {
    ...inches(t, { x: opts.centred ? 0.47 : x, y, w: 0.06, h: 0.008 }),
    fill: { color: t.palette.accent },
    line: { color: t.palette.accent, width: 0 },
    rectRadius: 0.04,
  });

  if (opts.subtitle) {
    text(slide, t, { x, y: y + 0.04, w, h: 0.14 }, opts.subtitle, {
      size: t.type.heading,
      color: t.palette.featureBody,
      align,
    });
  }
}

function renderConcept(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  points: { heading: string; description: string }[],
): void {
  const area = contentArea();
  // Two columns from four points, matching the web layout's break point.
  const cells =
    points.length >= 4
      ? rows(area, Math.ceil(points.length / 2)).flatMap((r) => columns(r, 2))
      : rows(area, points.length);

  points.forEach((point, i) => {
    const cell = cells[i];
    if (!cell) return;
    panel(slide, t, cell);
    text(slide, t, { ...cell, h: cell.h * 0.4 }, point.heading, {
      size: t.type.heading,
      color: t.palette.heading,
      bold: true,
      heading: true,
      inset: 0.016,
      valign: "bottom",
    });
    text(
      slide,
      t,
      { x: cell.x, y: cell.y + cell.h * 0.4, w: cell.w, h: cell.h * 0.6 },
      point.description,
      { size: t.type.body, color: t.palette.body, inset: 0.016 },
    );
  });
}

function renderComparison(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  cols: { heading: string; points: string[] }[],
): void {
  const area = contentArea();
  columns(area, cols.length).forEach((cell, i) => {
    const column = cols[i];
    panel(slide, t, cell);
    // Tinted header band, as in the web renderer.
    slide.addShape("roundRect", {
      ...inches(t, { ...cell, h: cell.h * 0.16 }),
      fill: { color: t.palette.accentSoft },
      line: { color: t.palette.accentSoft, width: 0 },
      rectRadius: 0.08,
    });
    text(slide, t, { ...cell, h: cell.h * 0.16 }, column.heading, {
      size: t.type.heading,
      color: t.palette.heading,
      bold: true,
      heading: true,
      inset: 0.016,
      valign: "middle",
    });
    text(
      slide,
      t,
      { x: cell.x, y: cell.y + cell.h * 0.18, w: cell.w, h: cell.h * 0.8 },
      column.points.map((p) => ({ text: p, options: { bullet: true, breakLine: true } })),
      { size: t.type.body, color: t.palette.body, inset: 0.02, lineSpacingMultiple: 1.3 },
    );
  });
}

function renderProcess(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  steps: { label: string; description: string }[],
): void {
  const area = contentArea();
  const cells =
    steps.length > 4 ? rows(area, 2).flatMap((r) => columns(r, 3)) : columns(area, steps.length);

  steps.forEach((step, i) => {
    const cell = cells[i];
    if (!cell) return;
    const badge = 0.038;
    slide.addShape("ellipse", {
      ...inches(t, {
        x: cell.x,
        y: cell.y,
        w: badge,
        h: badge * (t.deck.widthIn / t.deck.heightIn),
      }),
      fill: { color: t.palette.accent },
      line: { color: t.palette.accent, width: 0 },
    });
    text(
      slide,
      t,
      { x: cell.x, y: cell.y, w: badge, h: badge * (t.deck.widthIn / t.deck.heightIn) },
      String(i + 1),
      {
        size: t.type.body,
        color: t.palette.onAccent,
        bold: true,
        align: "center",
        valign: "middle",
      },
    );

    // The connector that makes the row read as a sequence.
    if (i < steps.length - 1 && cells[i + 1] && cells[i + 1].y === cell.y) {
      slide.addShape("rect", {
        ...inches(t, {
          x: cell.x + badge + 0.012,
          y: cell.y + (badge * (t.deck.widthIn / t.deck.heightIn)) / 2,
          w: cell.w - badge - 0.024,
          h: 0.003,
        }),
        fill: { color: t.palette.connector },
        line: { color: t.palette.connector, width: 0 },
      });
    }

    const body = { x: cell.x, y: cell.y + 0.1, w: cell.w, h: cell.h - 0.1 };
    panel(slide, t, body);
    text(slide, t, { ...body, h: body.h * 0.35 }, step.label, {
      size: t.type.heading - 2,
      color: t.palette.heading,
      bold: true,
      heading: true,
      inset: 0.014,
      valign: "bottom",
    });
    text(
      slide,
      t,
      { x: body.x, y: body.y + body.h * 0.35, w: body.w, h: body.h * 0.65 },
      step.description,
      { size: t.type.small, color: t.palette.body, inset: 0.014 },
    );
  });
}

function renderArchitecture(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  nodes: { label: string; description?: string }[],
): void {
  const area = contentArea();
  const band: Frame = { ...area, y: area.y + area.h * 0.2, h: area.h * 0.6 };
  const cells = columns(band, nodes.length, 0.03);

  nodes.forEach((node, i) => {
    const cell = cells[i];
    panel(slide, t, cell);
    text(slide, t, { ...cell, h: cell.h * 0.45 }, node.label, {
      size: t.type.heading - 2,
      color: t.palette.heading,
      bold: true,
      heading: true,
      align: "center",
      inset: 0.012,
      valign: "bottom",
    });
    if (node.description) {
      text(
        slide,
        t,
        { x: cell.x, y: cell.y + cell.h * 0.47, w: cell.w, h: cell.h * 0.5 },
        node.description,
        { size: t.type.small, color: t.palette.muted, align: "center", inset: 0.012 },
      );
    }
    // A real arrow shape between nodes, not a typed character.
    if (i < nodes.length - 1) {
      slide.addShape("rightArrow", {
        ...inches(t, {
          x: cell.x + cell.w + 0.004,
          y: cell.y + cell.h / 2 - 0.02,
          w: 0.022,
          h: 0.04,
        }),
        fill: { color: t.palette.connector },
        line: { color: t.palette.connector, width: 0 },
      });
    }
  });
}

function renderCaseStudy(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  c: { situation: string; problem: string; action: string; outcome: string },
): void {
  const area = contentArea();
  const cells = rows(area, 2).flatMap((r) => columns(r, 2));
  const parts: [string, string, boolean][] = [
    ["SITUATION", c.situation, false],
    ["PROBLEM", c.problem, false],
    ["WHAT THE AGENT DID", c.action, false],
    ["OUTCOME", c.outcome, true],
  ];

  parts.forEach(([label, value, emphasise], i) => {
    const cell = cells[i];
    panel(slide, t, cell, emphasise ? t.palette.accentSoft : undefined);
    text(slide, t, { ...cell, h: cell.h * 0.28 }, label, {
      size: t.type.eyebrow,
      color: t.palette.muted,
      bold: true,
      inset: 0.016,
      valign: "middle",
    });
    text(slide, t, { x: cell.x, y: cell.y + cell.h * 0.28, w: cell.w, h: cell.h * 0.7 }, value, {
      size: t.type.body,
      color: t.palette.body,
      inset: 0.016,
    });
  });
}

function renderData(
  slide: PptxGenJS.Slide,
  t: SlideTemplate,
  stats: { value: string; label: string; note?: string }[],
): void {
  const area = contentArea();
  const band: Frame = { ...area, y: area.y + area.h * 0.12, h: area.h * 0.72 };

  columns(band, stats.length).forEach((cell, i) => {
    const stat = stats[i];
    panel(slide, t, cell);
    // The accent rule across the top of each card.
    slide.addShape("rect", {
      ...inches(t, { ...cell, h: 0.008 }),
      fill: { color: t.palette.accent },
      line: { color: t.palette.accent, width: 0 },
    });
    text(slide, t, { ...cell, h: cell.h * 0.55 }, stat.value, {
      size: t.type.display,
      color: t.palette.heading,
      bold: true,
      heading: true,
      align: "center",
      valign: "middle",
    });
    text(
      slide,
      t,
      { x: cell.x, y: cell.y + cell.h * 0.55, w: cell.w, h: cell.h * 0.2 },
      stat.label,
      { size: t.type.body, color: t.palette.body, align: "center", bold: true },
    );
    if (stat.note) {
      text(
        slide,
        t,
        { x: cell.x, y: cell.y + cell.h * 0.75, w: cell.w, h: cell.h * 0.22 },
        stat.note,
        { size: t.type.small, color: t.palette.muted, align: "center", inset: 0.012 },
      );
    }
  });
}

function renderSummary(slide: PptxGenJS.Slide, t: SlideTemplate, takeaways: string[]): void {
  const area = contentArea();
  rows(area, takeaways.length, 0.018).forEach((cell, i) => {
    panel(slide, t, cell);
    const badge = 0.03;
    slide.addShape("ellipse", {
      ...inches(t, {
        x: cell.x + 0.014,
        y: cell.y + cell.h / 2 - (badge * (t.deck.widthIn / t.deck.heightIn)) / 2,
        w: badge,
        h: badge * (t.deck.widthIn / t.deck.heightIn),
      }),
      fill: { color: t.palette.accent },
      line: { color: t.palette.accent, width: 0 },
    });
    text(
      slide,
      t,
      {
        x: cell.x + 0.014,
        y: cell.y + cell.h / 2 - (badge * (t.deck.widthIn / t.deck.heightIn)) / 2,
        w: badge,
        h: badge * (t.deck.widthIn / t.deck.heightIn),
      },
      String(i + 1),
      {
        size: t.type.small,
        color: t.palette.onAccent,
        bold: true,
        align: "center",
        valign: "middle",
      },
    );
    text(slide, t, { x: cell.x + 0.055, y: cell.y, w: cell.w - 0.07, h: cell.h }, takeaways[i], {
      size: t.type.body + 1,
      color: t.palette.body,
      valign: "middle",
    });
  });
}

/**
 * Render one slide's structured content onto a new PowerPoint slide.
 *
 * Every branch of SlideContent is handled; the compiler enforces that, so a new
 * slide type cannot be added to the web renderer while silently exporting as a
 * blank page.
 */
export function addContentSlide(
  pptx: PptxGenJS,
  content: SlideContent,
  template: SlideTemplate,
  options: { footer?: string } = {},
): PptxGenJS.Slide {
  const slide = pptx.addSlide();
  const t = template;

  if (content.type === "title") {
    renderFeature(slide, t, {
      eyebrow: content.eyebrow,
      title: content.title,
      subtitle: content.subtitle,
      centred: false,
    });
    return slide;
  }

  if (content.type === "closing") {
    renderFeature(slide, t, {
      title: content.title,
      subtitle: content.subtitle,
      centred: true,
    });
    return slide;
  }

  slide.background = { color: t.palette.surface };
  decor(slide, t, false);

  switch (content.type) {
    case "concept":
      header(slide, t, content.title, content.lead, options.footer);
      renderConcept(slide, t, content.points);
      break;
    case "comparison":
      header(slide, t, content.title, content.lead, options.footer);
      renderComparison(slide, t, content.columns);
      break;
    case "process":
      header(slide, t, content.title, content.lead, options.footer);
      renderProcess(slide, t, content.steps);
      break;
    case "architecture":
      header(slide, t, content.title, content.lead, options.footer);
      renderArchitecture(slide, t, content.nodes);
      break;
    case "caseStudy":
      header(slide, t, content.title, undefined, options.footer);
      renderCaseStudy(slide, t, content);
      break;
    case "data":
      header(slide, t, content.title, content.lead, options.footer);
      renderData(slide, t, content.stats);
      break;
    case "summary":
      header(slide, t, content.title, undefined, options.footer);
      renderSummary(slide, t, content.takeaways);
      break;
  }

  return slide;
}

/** Configure a deck to the template's page size before any slide is added. */
export function applyTemplateLayout(pptx: PptxGenJS, template: SlideTemplate): void {
  pptx.defineLayout({
    name: `TPL_${template.id.toUpperCase()}`,
    width: template.deck.widthIn,
    height: template.deck.heightIn,
  });
  pptx.layout = `TPL_${template.id.toUpperCase()}`;
  pptx.theme = { headFontFace: template.fonts.heading, bodyFontFace: template.fonts.body };
}
