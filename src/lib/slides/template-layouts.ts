import type { SlideType } from "./content-schema";

// ============================================
// Template layouts
//
// The uploaded Ecotech deck is a set of pre-built layouts, not a colour
// scheme. Every position, size and type size below is measured from that file:
// the content column runs x=0.045..0.937, the eyebrow sits at y=0.067 in 12pt,
// the title at y=0.113 in 30pt, the lead at y=0.200 in 13pt, and the content
// band opens at y≈0.31. Three-card rows are 0.266 wide at x=0.045/0.338/0.630;
// four-column rows are 0.206 wide at x=0.045/0.272/0.499/0.727.
//
// The renderers consume this; neither invents geometry. The model's only
// layout decision is which layout a slide's content belongs in, and even that
// is constrained to the layouts that can hold it.
// ============================================

/** Every measurement is a fraction of the slide, so deck size can change. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PlaceholderRole =
  | "eyebrow"
  | "title"
  | "lead"
  | "heading"
  | "body"
  | "metric"
  | "label"
  | "badge"
  | "footer"
  | "display";

export interface Placeholder extends Box {
  /** Dotted path into the slide content this box renders. */
  path: string;
  role: PlaceholderRole;
  /** Point size at deck scale, as the template sets it. */
  fontPt: number;
  align: "left" | "center" | "right";
  bold: boolean;
  /** Colour role from the template palette. */
  ink: "heading" | "body" | "muted" | "accent" | "onAccent" | "featureHeading" | "featureBody";
}

/** A filled region the template draws behind content — cards, bands, rules. */
export interface Panel extends Box {
  kind: "card" | "band" | "rule" | "badge" | "divider";
  fill: "panel" | "accent" | "accentSoft" | "none";
  radius: number;
}

export interface RenderedLayout {
  id: string;
  panels: Panel[];
  placeholders: Placeholder[];
  /** Feature layouts paint the full-bleed gradient instead of the surface. */
  feature: boolean;
}

// ────────────────────────────────────────────────
// The template's measured grid
// ────────────────────────────────────────────────

/** Content column, from the template's own margins. */
const MARGIN_X = 0.045;
const CONTENT_W = 0.892;
/** Optical overhang the template applies to large type only. */
const TITLE_X = 0.041;
const COL_GAP = 0.021;

const HEADER = {
  eyebrowY: 0.067,
  eyebrowPt: 12,
  titleY: 0.113,
  titlePt: 30,
  titleH: 0.093,
  leadY: 0.2,
  leadPt: 13,
  leadH: 0.053,
  bandY: 0.313,
};

const FOOTER: Placeholder = {
  path: "__footer",
  role: "footer",
  x: 0.932,
  y: 0.933,
  w: 0.045,
  h: 0.04,
  fontPt: 10,
  align: "right",
  bold: false,
  ink: "muted",
};

/**
 * Column gutters, measured per count from the template itself.
 *
 * Its three-up card row leaves 0.0265 between cards; its four-up metric and
 * step rows leave 0.021. One averaged value put every column a percent or two
 * off where the template puts it.
 */
function gapFor(count: number): number {
  if (count <= 3) return 0.0265;
  return COL_GAP;
}

/** Evenly spaced columns across the content width, as the template lays them. */
function columns(count: number, y: number, h: number): Box[] {
  const gap = gapFor(count);
  const w = (CONTENT_W - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: MARGIN_X + i * (w + gap),
    y,
    w,
    h,
  }));
}

/** Stacked rows, as the agenda layout lays them. */
function rows(count: number, top: number, bottom: number, gap = 0.02): Box[] {
  const h = (bottom - top - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: MARGIN_X,
    y: top + i * (h + gap),
    w: CONTENT_W,
    h,
  }));
}

function header(hasLead: boolean): { panels: Panel[]; placeholders: Placeholder[] } {
  const placeholders: Placeholder[] = [
    {
      path: "eyebrow",
      role: "eyebrow",
      x: MARGIN_X,
      y: HEADER.eyebrowY,
      w: 0.6,
      h: 0.047,
      fontPt: HEADER.eyebrowPt,
      align: "left",
      bold: true,
      ink: "accent",
    },
    {
      path: "title",
      role: "title",
      x: TITLE_X,
      y: HEADER.titleY,
      w: 0.825,
      h: HEADER.titleH,
      fontPt: HEADER.titlePt,
      align: "left",
      bold: true,
      ink: "heading",
    },
  ];
  if (hasLead) {
    placeholders.push({
      path: "lead",
      role: "lead",
      x: MARGIN_X,
      y: HEADER.leadY,
      w: 0.787,
      h: HEADER.leadH,
      fontPt: HEADER.leadPt,
      align: "left",
      bold: false,
      ink: "body",
    });
  }
  return { panels: [], placeholders };
}

// ────────────────────────────────────────────────
// Layout definitions
// ────────────────────────────────────────────────

export interface LayoutDefinition {
  id: string;
  name: string;
  purpose: string;
  /** Content types this layout can present. */
  supports: SlideType[];
  /** How many repeated items it holds. Content outside this cannot use it. */
  capacity: { min: number; max: number };
  build: (itemCount: number, options: { hasLead: boolean }) => RenderedLayout;
}

/** Template slide 1 — the opening title. */
const TITLE_LAYOUT: LayoutDefinition = {
  id: "title",
  name: "Title",
  purpose: "Open the deck",
  supports: ["title"],
  capacity: { min: 0, max: 0 },
  build: () => ({
    id: "title",
    feature: true,
    panels: [{ kind: "rule", x: MARGIN_X, y: 0.82, w: 0.105, h: 0.006, fill: "accent", radius: 1 }],
    placeholders: [
      {
        path: "eyebrow",
        role: "eyebrow",
        x: MARGIN_X,
        y: 0.34,
        w: 0.6,
        h: 0.047,
        fontPt: 12,
        align: "left",
        bold: true,
        ink: "featureBody",
      },
      {
        path: "title",
        role: "display",
        x: TITLE_X,
        y: 0.387,
        w: 0.787,
        h: 0.28,
        fontPt: 54,
        align: "left",
        bold: true,
        ink: "featureHeading",
      },
      {
        path: "subtitle",
        role: "lead",
        x: MARGIN_X,
        y: 0.673,
        w: 0.6,
        h: 0.08,
        fontPt: 16,
        align: "left",
        bold: false,
        ink: "featureBody",
      },
    ],
  }),
};

/** Template slide 12 — the close. */
const CLOSING_LAYOUT: LayoutDefinition = {
  id: "closing",
  name: "Closing",
  purpose: "End the deck",
  supports: ["closing"],
  capacity: { min: 0, max: 0 },
  build: () => ({
    id: "closing",
    feature: true,
    panels: [{ kind: "rule", x: 0.068, y: 0.627, w: 0.105, h: 0.006, fill: "accent", radius: 1 }],
    placeholders: [
      {
        path: "title",
        role: "display",
        x: 0.064,
        y: 0.387,
        w: 0.675,
        h: 0.16,
        fontPt: 48,
        align: "left",
        bold: true,
        ink: "featureHeading",
      },
      {
        path: "subtitle",
        role: "lead",
        x: 0.068,
        y: 0.527,
        w: 0.6,
        h: 0.067,
        fontPt: 15,
        align: "left",
        bold: false,
        ink: "featureBody",
      },
    ],
  }),
};

/** Template slide 4 — numbered cards side by side. */
const CARDS_LAYOUT: LayoutDefinition = {
  id: "cards",
  name: "Option cards",
  purpose: "Two to four parallel ideas, each with a short explanation",
  supports: ["concept"],
  capacity: { min: 2, max: 3 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const cells = columns(count, 0.333, 0.48);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    cells.forEach((cell, i) => {
      panels.push({ kind: "card", ...cell, fill: "panel", radius: 0.02 });
      panels.push({
        kind: "badge",
        x: cell.x + 0.026,
        y: cell.y + 0.054,
        w: 0.052,
        h: 0.093,
        fill: "accent",
        radius: 0.5,
      });
      placeholders.push(
        {
          path: `__index.${i}`,
          role: "badge",
          x: cell.x + 0.026,
          y: cell.y + 0.054,
          w: 0.052,
          h: 0.093,
          fontPt: 20,
          align: "center",
          bold: true,
          ink: "onAccent",
        },
        {
          path: `points.${i}.heading`,
          role: "heading",
          x: cell.x + 0.026,
          y: cell.y + 0.18,
          w: cell.w - 0.052,
          h: 0.06,
          fontPt: 17,
          align: "left",
          bold: true,
          ink: "heading",
        },
        {
          path: `points.${i}.description`,
          role: "body",
          x: cell.x + 0.026,
          y: cell.y + 0.247,
          w: cell.w - 0.052,
          h: 0.2,
          fontPt: 12,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    return { id: "cards", feature: false, panels, placeholders };
  },
};

/** Template slide 2 — a numbered list with dividers. */
const AGENDA_LAYOUT: LayoutDefinition = {
  id: "agenda",
  name: "Numbered list",
  purpose: "An ordered set of points, each a line or two",
  supports: ["summary"],
  capacity: { min: 3, max: 6 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const band = rows(count, hasLead ? 0.313 : 0.27, 0.9, 0.012);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    band.forEach((row, i) => {
      panels.push({
        kind: "badge",
        x: MARGIN_X,
        y: row.y,
        w: 0.046,
        h: Math.min(0.083, row.h),
        fill: "accent",
        radius: 0.5,
      });
      if (i < count - 1) {
        panels.push({
          kind: "divider",
          x: 0.113,
          y: row.y + row.h,
          w: 0.623,
          h: 0.002,
          fill: "panel",
          radius: 0,
        });
      }
      placeholders.push(
        {
          path: `__index.${i}`,
          role: "badge",
          x: MARGIN_X,
          y: row.y,
          w: 0.046,
          h: Math.min(0.083, row.h),
          fontPt: 16,
          align: "center",
          bold: true,
          ink: "onAccent",
        },
        {
          path: `takeaways.${i}`,
          role: "body",
          x: 0.113,
          y: row.y,
          w: 0.82,
          h: row.h,
          fontPt: 15,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    return { id: "agenda", feature: false, panels, placeholders };
  },
};

/**
 * Template slide 5 — the comparison table.
 *
 * The template's own structure is a header band per column with values
 * stacked beneath. Its sample also carries a row-label column, which this
 * content model has no field for, so the label column is left out rather than
 * invented: the columns and their bands are the template's, the rows are the
 * column's own points.
 */
const COMPARISON_LAYOUT: LayoutDefinition = {
  id: "comparison",
  name: "Comparison table",
  purpose: "Set two or three things against each other",
  supports: ["comparison"],
  capacity: { min: 2, max: 3 },
  build: (columnCount, { hasLead }) => {
    const base = header(hasLead);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    const HEAD_Y = 0.3;
    const HEAD_H = 0.087;
    const BODY_TOP = HEAD_Y + HEAD_H + 0.02;
    const BODY_BOTTOM = 0.9;

    columns(columnCount, HEAD_Y, HEAD_H).forEach((cell, c) => {
      panels.push({ kind: "band", ...cell, fill: "accentSoft", radius: 0.015 });
      placeholders.push({
        path: `columns.${c}.heading`,
        role: "heading",
        x: cell.x + 0.016,
        y: cell.y,
        w: cell.w - 0.032,
        h: cell.h,
        fontPt: 16,
        align: "left",
        bold: true,
        ink: "heading",
      });
      panels.push({
        kind: "card",
        x: cell.x,
        y: BODY_TOP,
        w: cell.w,
        h: BODY_BOTTOM - BODY_TOP,
        fill: "panel",
        radius: 0.015,
      });
      // Five is the schema's own maximum for a column's points; boxes past the
      // supplied count simply go unused.
      const POINTS = 5;
      const pointH = (BODY_BOTTOM - BODY_TOP - 0.03) / POINTS;
      for (let p = 0; p < POINTS; p++) {
        placeholders.push({
          path: `columns.${c}.points.${p}`,
          role: "body",
          x: cell.x + 0.016,
          y: BODY_TOP + 0.015 + p * pointH,
          w: cell.w - 0.032,
          h: pointH,
          fontPt: 12,
          align: "left",
          bold: false,
          ink: "body",
        });
      }
    });

    return { id: "comparison", feature: false, panels, placeholders };
  },
};

/** Template slide 6 — metric tiles with a takeaway band. */
const METRICS_LAYOUT: LayoutDefinition = {
  id: "metrics",
  name: "Metrics",
  purpose: "Emphasise two to four figures",
  supports: ["data"],
  capacity: { min: 2, max: 4 },
  build: (count) => {
    // The lead becomes this layout's "Key takeaway" band, so the header omits
    // it; printing both put the same sentence on the slide twice.
    const base = header(false);
    const cells = columns(count, 0.267, 0.253);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    cells.forEach((cell, i) => {
      panels.push({ kind: "card", ...cell, fill: "panel", radius: 0.02 });
      panels.push({
        kind: "rule",
        x: cell.x,
        y: cell.y,
        w: cell.w,
        h: 0.008,
        fill: "accent",
        radius: 0.01,
      });
      placeholders.push(
        {
          path: `stats.${i}.value`,
          role: "metric",
          x: cell.x + 0.019,
          y: cell.y + 0.04,
          w: cell.w - 0.038,
          h: 0.12,
          fontPt: 34,
          align: "left",
          bold: true,
          ink: "heading",
        },
        {
          path: `stats.${i}.label`,
          role: "label",
          x: cell.x + 0.019,
          y: cell.y + 0.166,
          w: cell.w - 0.038,
          h: 0.073,
          fontPt: 12,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    // The takeaway band, as the template draws it.
    panels.push({
      kind: "band",
      x: MARGIN_X,
      y: 0.58,
      w: 0.907,
      h: 0.207,
      fill: "accentSoft",
      radius: 0.02,
    });
    placeholders.push(
      {
        path: "__takeawayLabel",
        role: "eyebrow",
        x: 0.075,
        y: 0.613,
        w: 0.3,
        h: 0.047,
        fontPt: 11,
        align: "left",
        bold: true,
        ink: "accent",
      },
      {
        path: "lead",
        role: "lead",
        x: 0.075,
        y: 0.66,
        w: 0.818,
        h: 0.107,
        fontPt: 15,
        align: "left",
        bold: false,
        ink: "heading",
      },
    );

    return { id: "metrics", feature: false, panels, placeholders };
  },
};

/** Template slide 7 — a numbered process across the slide. */
const PROCESS_LAYOUT: LayoutDefinition = {
  id: "process",
  name: "Process",
  purpose: "An ordered sequence of three to five stages",
  supports: ["process", "architecture"],
  capacity: { min: 3, max: 6 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    // Past four, one row would leave each stage too narrow to read, so the
    // stages wrap into two rows of the template's own column width.
    const twoRows = count > 4;
    const perRow = twoRows ? Math.ceil(count / 2) : count;
    const rowH = twoRows ? 0.26 : 0.5;
    const top = hasLead ? 0.333 : 0.29;
    const cells = twoRows
      ? Array.from({ length: count }, (_, i) => {
          const row = Math.floor(i / perRow);
          const inRow = columns(perRow, top + row * (rowH + 0.04), rowH);
          return inRow[i % perRow];
        })
      : columns(count, top, rowH);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    cells.forEach((cell, i) => {
      panels.push({
        kind: "badge",
        x: cell.x,
        y: cell.y,
        w: 0.041,
        h: 0.073,
        fill: "accent",
        radius: 0.5,
      });
      if (i < count - 1) {
        panels.push({
          kind: "rule",
          x: cell.x + 0.049,
          y: cell.y + 0.037,
          w: cell.w - 0.049,
          h: 0.003,
          fill: "accentSoft",
          radius: 0,
        });
      }
      placeholders.push(
        {
          path: `__index.${i}`,
          role: "badge",
          x: cell.x,
          y: cell.y,
          w: 0.041,
          h: 0.073,
          fontPt: 15,
          align: "center",
          bold: true,
          ink: "onAccent",
        },
        {
          path: `item.${i}.primary`,
          role: "heading",
          x: cell.x,
          y: cell.y + 0.1,
          w: cell.w,
          h: 0.053,
          fontPt: 15,
          align: "left",
          bold: true,
          ink: "heading",
        },
        {
          path: `item.${i}.secondary`,
          role: "body",
          x: cell.x,
          y: cell.y + 0.154,
          w: cell.w,
          h: Math.max(0.08, cell.h - 0.154),
          fontPt: 11,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    return { id: "process", feature: false, panels, placeholders };
  },
};

/** Template slide 5's row structure, reused for a case study's four parts. */
const CASE_LAYOUT: LayoutDefinition = {
  id: "case",
  name: "Labelled rows",
  purpose: "A few labelled passages, such as a case study",
  supports: ["caseStudy"],
  capacity: { min: 4, max: 4 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const band = rows(count, 0.3, 0.9, 0.014);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    band.forEach((row, i) => {
      if (i % 2 === 0) {
        panels.push({ kind: "band", ...row, fill: "panel", radius: 0.012 });
      }
      placeholders.push(
        {
          path: `__caseLabel.${i}`,
          role: "label",
          x: row.x + 0.014,
          y: row.y,
          w: 0.14,
          h: row.h,
          fontPt: 12,
          align: "left",
          bold: true,
          ink: "accent",
        },
        {
          path: `__caseValue.${i}`,
          role: "body",
          x: row.x + 0.17,
          y: row.y,
          w: row.w - 0.19,
          h: row.h,
          fontPt: 12,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    return { id: "case", feature: false, panels, placeholders };
  },
};

/**
 * The agenda row structure, carrying a heading and a description per row.
 *
 * A concept slide with four or five points does not fit the template's
 * three-up card row, and squeezing it in is what clipped content. The same
 * template geometry laid out as rows holds them at full size instead.
 */
const CONCEPT_ROWS_LAYOUT: LayoutDefinition = {
  id: "concept-rows",
  name: "Point rows",
  purpose: "Four or five ideas, each with a short explanation",
  supports: ["concept"],
  capacity: { min: 4, max: 5 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const band = rows(count, hasLead ? 0.3 : 0.26, 0.9, 0.014);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    band.forEach((row, i) => {
      panels.push({ kind: "card", ...row, fill: "panel", radius: 0.014 });
      panels.push({
        kind: "badge",
        x: row.x + 0.016,
        y: row.y + row.h / 2 - 0.037,
        w: 0.041,
        h: 0.073,
        fill: "accent",
        radius: 0.5,
      });
      placeholders.push(
        {
          path: `__index.${i}`,
          role: "badge",
          x: row.x + 0.016,
          y: row.y + row.h / 2 - 0.037,
          w: 0.041,
          h: 0.073,
          fontPt: 14,
          align: "center",
          bold: true,
          ink: "onAccent",
        },
        {
          path: `points.${i}.heading`,
          role: "heading",
          x: row.x + 0.075,
          y: row.y + 0.012,
          w: 0.28,
          h: row.h - 0.024,
          fontPt: 15,
          align: "left",
          bold: true,
          ink: "heading",
        },
        {
          path: `points.${i}.description`,
          role: "body",
          x: row.x + 0.365,
          y: row.y + 0.012,
          w: row.w - 0.385,
          h: row.h - 0.024,
          fontPt: 12,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    });

    return { id: "concept-rows", feature: false, panels, placeholders };
  },
};

export const LAYOUTS: LayoutDefinition[] = [
  TITLE_LAYOUT,
  CLOSING_LAYOUT,
  CARDS_LAYOUT,
  CONCEPT_ROWS_LAYOUT,
  AGENDA_LAYOUT,
  COMPARISON_LAYOUT,
  METRICS_LAYOUT,
  PROCESS_LAYOUT,
  CASE_LAYOUT,
];

export function layoutById(id: string): LayoutDefinition | undefined {
  return LAYOUTS.find((l) => l.id === id);
}

/** Layouts that can present a given content type at a given item count. */
export function layoutsFor(type: SlideType, itemCount: number): LayoutDefinition[] {
  return LAYOUTS.filter(
    (l) => l.supports.includes(type) && itemCount >= l.capacity.min && itemCount <= l.capacity.max,
  );
}

export { MARGIN_X, CONTENT_W, COL_GAP, HEADER, FOOTER, columns, rows };

// ────────────────────────────────────────────────
// Capacity
//
// A placeholder is a box of a known size at a known type size, so how much
// text fits in it is arithmetic, not guesswork. This is what stops content
// being clipped: the generator is told the real limits, and the renderer
// checks them.
// ────────────────────────────────────────────────

/** The web canvas. The deck is the same shape, so ratios carry across. */
const CANVAS_W = 1280;
const CANVAS_H = 720;
/** Deck width in points, from the template's 13.333in stage. */
const DECK_PT = 960;
const PX_PER_PT = CANVAS_W / DECK_PT;
/** Mean glyph advance as a fraction of the type size, for Calibri-like faces. */
const GLYPH_RATIO = 0.5;
const LINE_HEIGHT = 1.3;

export interface Capacity {
  path: string;
  role: PlaceholderRole;
  charsPerLine: number;
  maxLines: number;
  /** Characters that fit before the box overflows. */
  maxChars: number;
}

export function capacityOf(placeholder: Placeholder): Capacity {
  const widthPx = placeholder.w * CANVAS_W;
  const heightPx = placeholder.h * CANVAS_H;
  const fontPx = placeholder.fontPt * PX_PER_PT;

  const charsPerLine = Math.max(1, Math.floor(widthPx / (fontPx * GLYPH_RATIO)));
  const maxLines = Math.max(1, Math.floor(heightPx / (fontPx * LINE_HEIGHT)));

  return {
    path: placeholder.path,
    role: placeholder.role,
    charsPerLine,
    maxLines,
    // A word-wrapped line rarely fills completely; 92% avoids promising space
    // that ragged wrapping will not deliver.
    maxChars: Math.floor(charsPerLine * maxLines * 0.92),
  };
}

/** Capacity for every text box in a built layout, keyed by content path. */
export function capacitiesOf(layout: RenderedLayout): Map<string, Capacity> {
  return new Map(
    layout.placeholders
      .filter((p) => !p.path.startsWith("__"))
      .map((p) => [p.path, capacityOf(p)] as const),
  );
}
