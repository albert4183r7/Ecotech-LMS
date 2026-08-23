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

/**
 * A filled region the template draws behind content — cards, bands, rules.
 *
 * The fills are the ones the template file actually uses: tinted cards
 * (F3F8F6), white cards, mint and navy badges, hairline dividers in E7F2EE,
 * and one navy-to-mint gradient that it applies to its emphasis card and its
 * takeaway band. `decor` is the tinted circle composition its title, section
 * and closing slides carry.
 */
export interface Panel extends Box {
  kind: "card" | "band" | "rule" | "badge" | "divider" | "decor";
  fill: "panel" | "surface" | "accent" | "accentSoft" | "heading" | "gradient" | "none";
  radius: number;
  /** Opacity, for the decorative shapes the template screens back. */
  alpha?: number;
}

export interface RenderedLayout {
  id: string;
  panels: Panel[];
  placeholders: Placeholder[];
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

/**
 * The tinted circle composition the template's title, section and closing
 * slides carry. Positions and opacities are the file's own — these are real
 * shapes on those slides, not an effect invented to dress them up.
 */
function decorCircles(spec: Array<[number, number, number, number, number]>): Panel[] {
  return spec.map(([x, y, w, h, alpha]) => ({
    kind: "decor" as const,
    x,
    y,
    w,
    h,
    fill: "accent" as const,
    radius: 0.5,
    alpha,
  }));
}

/**
 * Corner radii, as fractions of the slide width.
 *
 * Read from the template's roundRect `adj` values: its cards are 0.120in and
 * everything else it rounds is 0.100in. These were 0.02 — 0.27in — which is
 * more than twice as round as the file, and visible on every card.
 */
const RADIUS = { card: 0.009, panel: 0.0075 };

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

/**
 * Template slide 1 — the opening title.
 *
 * White, with three screened-back mint circles bleeding off the edges, a mint
 * eyebrow, a 54pt navy Cambria title, a slate subtitle, a short mint rule and
 * a byline. It was being drawn as a dark gradient slide with white type; the
 * template has no dark slide anywhere in it.
 */
const TITLE_LAYOUT: LayoutDefinition = {
  id: "title",
  name: "Title",
  purpose: "Open the deck",
  supports: ["title"],
  capacity: { min: 0, max: 0 },
  build: () => ({
    id: "title",
    panels: [
      ...decorCircles([
        [0.72, -0.293, 0.488, 0.867, 0.15],
        [0.795, 0.48, 0.315, 0.56, 0.25],
        [-0.12, 0.72, 0.27, 0.48, 0.2],
      ]),
      { kind: "rule", x: MARGIN_X, y: 0.82, w: 0.105, h: 0.006, fill: "accent", radius: 1 },
    ],
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
        ink: "accent",
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
        ink: "heading",
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
        ink: "body",
      },
    ],
  }),
};

/** Template slide 12 — the close: white, two circles, 48pt navy Cambria. */
const CLOSING_LAYOUT: LayoutDefinition = {
  id: "closing",
  name: "Closing",
  purpose: "End the deck",
  supports: ["closing"],
  capacity: { min: 0, max: 0 },
  build: () => ({
    id: "closing",
    panels: [
      ...decorCircles([
        [-0.15, 0.533, 0.488, 0.867, 0.2],
        [0.735, -0.333, 0.413, 0.733, 0.15],
      ]),
      { kind: "rule", x: 0.068, y: 0.627, w: 0.105, h: 0.006, fill: "accent", radius: 1 },
    ],
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
        ink: "heading",
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
        ink: "body",
      },
    ],
  }),
};

/**
 * Template slide 3 — the section divider.
 *
 * The same furniture as the title slide at a smaller scale, with its own
 * indent: the template sets this one at x=0.0675 rather than the 0.045 its
 * content slides use.
 */
const SECTION_LAYOUT: LayoutDefinition = {
  id: "section",
  name: "Section divider",
  purpose: "Open a new part of the lesson",
  supports: ["title"],
  capacity: { min: 0, max: 0 },
  build: () => ({
    id: "section",
    panels: decorCircles([
      [-0.18, -0.267, 0.45, 0.8, 0.15],
      [0.788, 0.533, 0.413, 0.733, 0.2],
    ]),
    placeholders: [
      {
        path: "eyebrow",
        role: "eyebrow",
        x: 0.0675,
        y: 0.413,
        w: 0.45,
        h: 0.053,
        fontPt: 13,
        align: "left",
        bold: true,
        ink: "accent",
      },
      {
        path: "title",
        role: "display",
        x: 0.0638,
        y: 0.467,
        w: 0.787,
        h: 0.16,
        fontPt: 44,
        align: "left",
        bold: true,
        ink: "heading",
      },
      {
        path: "subtitle",
        role: "lead",
        x: 0.0675,
        y: 0.607,
        w: 0.6,
        h: 0.067,
        fontPt: 15,
        align: "left",
        bold: false,
        ink: "body",
      },
      FOOTER,
    ],
  }),
};

/**
 * Template slide 4 — three numbered cards side by side.
 *
 * The template's own composition: tinted round cards on the content band, a
 * white circular badge carrying the number in navy Cambria, a 17pt heading
 * and 12pt body. Its sample marks the third card "Recommended" with a navy
 * gradient fill; lesson points have no such ranking, so the row is drawn
 * evenly rather than inventing an emphasis the content does not carry.
 */
const OPTIONS_LAYOUT: LayoutDefinition = {
  id: "options",
  name: "Numbered cards",
  purpose: "Two or three parallel ideas, each with a short explanation",
  supports: ["concept"],
  capacity: { min: 2, max: 3 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const cells = columns(count, 0.333, 0.48);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    cells.forEach((cell, i) => {
      panels.push({ kind: "card", ...cell, fill: "panel", radius: RADIUS.card });
      panels.push({
        kind: "badge",
        x: cell.x + 0.026,
        y: cell.y + 0.054,
        w: 0.052,
        h: 0.093,
        fill: "surface",
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
          ink: "heading",
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

    return { id: "options", panels, placeholders };
  },
};

/**
 * The row block from template slide 2.
 *
 * The template stacks four of them at a pitch of 0.1533 starting at y=0.3133:
 * a tinted circular badge in the margin, an 18pt Cambria heading, a 12.5pt
 * line under it, and a hairline rule closing the row. Past four rows the pitch
 * compresses to keep the last row on the slide; at three or fewer it stays at
 * the template's own spacing rather than stretching to fill the band.
 */
const ROW = {
  top: 0.3133,
  pitch: 0.1533,
  headingH: 0.0533,
  gap: 0.052,
  textX: 0.1125,
  bottom: 0.9,
};

function rowPitch(count: number): number {
  if (count <= 1) return ROW.pitch;
  const blockH = ROW.headingH + ROW.gap;
  return Math.min(ROW.pitch, (ROW.bottom - ROW.top - blockH) / (count - 1));
}

/** Badge, divider and their placement for one row of the slide-2 structure. */
function rowFurniture(index: number, count: number, y: number, pitch: number) {
  const panels: Panel[] = [
    { kind: "badge", x: MARGIN_X, y, w: 0.0465, h: 0.0827, fill: "panel", radius: 0.5 },
  ];
  if (index < count - 1) {
    panels.push({
      kind: "divider",
      x: ROW.textX,
      y: y + pitch - 0.038,
      w: 0.6225,
      h: 0.0015,
      fill: "accentSoft",
      radius: 0,
    });
  }
  const badge: Placeholder = {
    path: `__index.${index}`,
    role: "badge",
    x: MARGIN_X,
    y,
    w: 0.0465,
    h: 0.0827,
    fontPt: 16,
    align: "center",
    bold: true,
    ink: "heading",
  };
  return { panels, badge };
}

/** Template slide 2 — the numbered row list, one line per item. */
const AGENDA_LAYOUT: LayoutDefinition = {
  id: "agenda",
  name: "Numbered list",
  purpose: "An ordered set of points, each a line or two",
  supports: ["summary"],
  capacity: { min: 3, max: 6 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const pitch = rowPitch(count);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    for (let i = 0; i < count; i++) {
      const y = ROW.top + i * pitch;
      const { panels: furniture, badge } = rowFurniture(i, count, y, pitch);
      panels.push(...furniture);
      placeholders.push(badge, {
        path: `takeaways.${i}`,
        role: "body",
        x: ROW.textX,
        y: y - 0.004,
        w: 0.82,
        h: Math.min(pitch - 0.02, ROW.headingH + ROW.gap),
        fontPt: 15,
        align: "left",
        bold: false,
        ink: "body",
      });
    }

    return { id: "agenda", panels, placeholders };
  },
};

/**
 * Template slide 2 again, carrying the heading-and-description pair its own
 * sample rows use. Four or five concepts do not fit the card row of slide 4,
 * and this is the structure the template provides for them.
 */
const ROWS_LAYOUT: LayoutDefinition = {
  id: "rows",
  name: "Numbered rows",
  purpose: "Four or five ideas, each a heading with a line of explanation",
  supports: ["concept"],
  capacity: { min: 4, max: 5 },
  build: (count, { hasLead }) => {
    const base = header(hasLead);
    const pitch = rowPitch(count);
    const panels: Panel[] = [...base.panels];
    const placeholders: Placeholder[] = [...base.placeholders, FOOTER];

    for (let i = 0; i < count; i++) {
      const y = ROW.top + i * pitch;
      const { panels: furniture, badge } = rowFurniture(i, count, y, pitch);
      panels.push(...furniture);
      placeholders.push(
        badge,
        {
          path: `points.${i}.heading`,
          role: "heading",
          x: ROW.textX,
          y: y - 0.004,
          w: 0.6,
          h: ROW.headingH,
          fontPt: 18,
          align: "left",
          bold: true,
          ink: "heading",
        },
        {
          path: `points.${i}.description`,
          role: "body",
          x: ROW.textX,
          y: y + ROW.headingH - 0.006,
          w: 0.72,
          h: Math.max(0.04, pitch - ROW.headingH - 0.03),
          fontPt: 12.5,
          align: "left",
          bold: false,
          ink: "body",
        },
      );
    }

    return { id: "rows", panels, placeholders };
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
      panels.push({ kind: "band", ...cell, fill: "accentSoft", radius: RADIUS.panel });
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
        radius: RADIUS.panel,
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

    return { id: "comparison", panels, placeholders };
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
      // White card, hairline border, no accent rule — the rule was an
      // addition, and the template does not draw one.
      panels.push({ kind: "card", ...cell, fill: "surface", radius: RADIUS.panel });
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
          ink: "accent",
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
      w: 0.9075,
      h: 0.2067,
      // Navy-to-mint, as the template fills it, with white type over it.
      fill: "gradient",
      radius: RADIUS.panel,
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
        ink: "featureBody",
      },
      {
        path: "lead",
        role: "lead",
        x: 0.075,
        y: 0.66,
        w: 0.8175,
        h: 0.107,
        fontPt: 15,
        align: "left",
        bold: false,
        ink: "featureHeading",
      },
    );

    return { id: "metrics", panels, placeholders };
  },
};

/**
 * Template slide 7 — a numbered process across the slide.
 *
 * Navy circular badges with white numerals, a mint hairline reaching to the
 * next step, a 15pt Cambria label and 11.5pt body beneath. Also carries a
 * case study, whose situation, problem, action and outcome are four ordered
 * steps and which the template has no separate layout for.
 */
const PROCESS_LAYOUT: LayoutDefinition = {
  id: "process",
  name: "Process",
  purpose: "An ordered sequence of three to five stages",
  supports: ["process", "architecture", "caseStudy"],
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
        fill: "heading",
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

    return { id: "process", panels, placeholders };
  },
};

export const LAYOUTS: LayoutDefinition[] = [
  TITLE_LAYOUT,
  CLOSING_LAYOUT,
  SECTION_LAYOUT,
  OPTIONS_LAYOUT,
  ROWS_LAYOUT,
  AGENDA_LAYOUT,
  COMPARISON_LAYOUT,
  METRICS_LAYOUT,
  PROCESS_LAYOUT,
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
