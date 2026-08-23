// ============================================
// Slide templates
//
// One template definition drives every representation of a slide: the web
// renderer (preview, published lesson, student learn view) and the PowerPoint
// renderer. Previously the deck was exported by rasterising the web slide and
// recovering its geometry, so the two agreed only by accident and the export
// could never be better than what pixel-scraping recovered.
//
// A template is data, not code. It carries raw values — hex colours, font
// stacks, point sizes — because PowerPoint needs real values and CSS can be
// given them as custom properties. The web renderer therefore refers to stable
// class names (tpl-surface, tpl-accent, ...) whose meaning comes from whichever
// template is in force.
// ============================================

/** Colour roles. Every value is a 6-digit hex string without the leading #. */
export interface TemplatePalette {
  /** Background of an ordinary content slide. */
  surface: string;
  /** Second stop, so a content slide can carry a subtle wash. */
  surfaceAlt: string;
  /** Three stops of the title/closing slide background. */
  featureFrom: string;
  featureVia: string;
  featureTo: string;
  heading: string;
  body: string;
  muted: string;
  /** Card fill sitting on the surface. */
  panel: string;
  panelBorder: string;
  accent: string;
  accentSoft: string;
  /** Text placed on top of `accent`. */
  onAccent: string;
  /** Icon glyph colour inside an accentSoft chip. */
  iconInk: string;
  /** Decorative corner shapes. */
  decor: string;
  featureDecor: string;
  /** Diagram connectors and arrows. */
  connector: string;
  featureHeading: string;
  featureBody: string;
}

/** Point sizes at deck scale, shared by both renderers. */
export interface TemplateTypeScale {
  display: number;
  title: number;
  heading: number;
  body: number;
  small: number;
  eyebrow: number;
}

export interface SlideTemplate {
  id: string;
  label: string;
  description: string;
  /** Deck dimensions in inches. PowerPoint uses these directly; the web
   *  canvas keeps its own pixel size and matches only the aspect ratio. */
  deck: { widthIn: number; heightIn: number };
  fonts: {
    /** Family name PowerPoint asks for. */
    heading: string;
    body: string;
    /** CSS stack, with the same family first and real fallbacks after it. */
    headingStack: string;
    bodyStack: string;
  };
  palette: TemplatePalette;
  type: TemplateTypeScale;
}

const SYSTEM_FALLBACK = `system-ui, -apple-system, "Segoe UI", sans-serif`;

/**
 * The uploaded EcotechPPTTemplate.pptx, as data.
 *
 * Colours, fonts and the type scale are the values measured from that file:
 * #43699F and #7BBBA6 are its two dominant colours across all twelve slides,
 * #56687A its body text, #E7F2EE and #F3F8F6 its panel and surface tints, and
 * it sets Cambria for headings against Calibri for body copy on a 13.333x7.5in
 * stage.
 */
export const ECOTECH_TEMPLATE: SlideTemplate = {
  id: "ecotech",
  label: "Ecotech",
  description: "The Ecotech house deck — navy and mint on white, as the template file sets it",
  deck: { widthIn: 13.333, heightIn: 7.5 },
  fonts: {
    heading: "Cambria",
    body: "Calibri",
    headingStack: `Cambria, Georgia, "Times New Roman", serif`,
    bodyStack: `Calibri, Candara, ${SYSTEM_FALLBACK}`,
  },
  // Every value is read from the template file itself. Three were wrong
  // before and the deck showed it: the slides are white, not off-white; the
  // navy 43699F is the *heading* colour and the mint 7BBBA6 the accent, which
  // were the other way round; and there are no dark gradient slides at all —
  // all twelve template slides are white. The gradient below is the one the
  // template really uses, on its emphasis card and its takeaway band, not as
  // a slide background.
  palette: {
    surface: "FFFFFF",
    surfaceAlt: "F3F8F6",
    featureFrom: "43699F",
    featureVia: "43699F",
    featureTo: "7BBBA6",
    heading: "43699F",
    body: "56687A",
    muted: "56687A",
    panel: "F3F8F6",
    panelBorder: "E7F2EE",
    accent: "7BBBA6",
    accentSoft: "E7F2EE",
    onAccent: "FFFFFF",
    iconInk: "43699F",
    decor: "7BBBA6",
    featureDecor: "7BBBA6",
    connector: "E7F2EE",
    featureHeading: "FFFFFF",
    featureBody: "E7F2EE",
  },
  // Measured from the template: 54pt title slide, 30pt slide titles, 18pt
  // row headings, 13.5pt lead copy, 12pt captions, 12pt eyebrows.
  type: { display: 54, title: 30, heading: 18, body: 13.5, small: 12, eyebrow: 12 },
};

/** Build a template from a palette, keeping the shared defaults in one place. */
function template(
  id: string,
  label: string,
  description: string,
  fonts: SlideTemplate["fonts"],
  palette: TemplatePalette,
  type: TemplateTypeScale = ECOTECH_TEMPLATE.type,
): SlideTemplate {
  return { id, label, description, deck: { ...ECOTECH_TEMPLATE.deck }, fonts, palette, type };
}

const SANS: SlideTemplate["fonts"] = {
  heading: "Calibri",
  body: "Calibri",
  headingStack: `Calibri, ${SYSTEM_FALLBACK}`,
  bodyStack: `Calibri, ${SYSTEM_FALLBACK}`,
};

/**
 * The template.
 *
 * There is one, and there is no way to pick another: the Ecotech deck is the
 * design, measured from the supplied .pptx. This used to be a registry with a
 * lookup, which existed only so the instructor could choose — now that the
 * choice is gone, so is the indirection.
 */
export const SLIDE_TEMPLATE: SlideTemplate = ECOTECH_TEMPLATE;

/**
 * The template as CSS custom properties.
 *
 * This is what lets the web renderer name colour roles rather than literal
 * values, so switching template changes every slide without touching markup.
 */
export function templateCssVariables(t: SlideTemplate = SLIDE_TEMPLATE): string {
  const p = t.palette;
  const vars: [string, string][] = [
    ["--tpl-surface", `#${p.surface}`],
    ["--tpl-surface-alt", `#${p.surfaceAlt}`],
    ["--tpl-feature-from", `#${p.featureFrom}`],
    ["--tpl-feature-via", `#${p.featureVia}`],
    ["--tpl-feature-to", `#${p.featureTo}`],
    ["--tpl-heading", `#${p.heading}`],
    ["--tpl-body", `#${p.body}`],
    ["--tpl-muted", `#${p.muted}`],
    ["--tpl-panel", `#${p.panel}`],
    ["--tpl-panel-border", `#${p.panelBorder}`],
    ["--tpl-accent", `#${p.accent}`],
    ["--tpl-accent-soft", `#${p.accentSoft}`],
    ["--tpl-on-accent", `#${p.onAccent}`],
    ["--tpl-icon-ink", `#${p.iconInk}`],
    ["--tpl-decor", `#${p.decor}`],
    ["--tpl-feature-decor", `#${p.featureDecor}`],
    ["--tpl-connector", `#${p.connector}`],
    ["--tpl-feature-heading", `#${p.featureHeading}`],
    ["--tpl-feature-body", `#${p.featureBody}`],
    ["--tpl-font-heading", t.fonts.headingStack],
    ["--tpl-font-body", t.fonts.bodyStack],
  ];
  return vars.map(([name, value]) => `${name}: ${value};`).join(" ");
}
