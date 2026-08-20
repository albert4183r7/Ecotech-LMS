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
  description: "The Ecotech house deck — deep blue and mint on a soft off-white",
  deck: { widthIn: 13.333, heightIn: 7.5 },
  fonts: {
    heading: "Cambria",
    body: "Calibri",
    headingStack: `Cambria, Georgia, "Times New Roman", serif`,
    bodyStack: `Calibri, Candara, ${SYSTEM_FALLBACK}`,
  },
  palette: {
    surface: "FAFCFB",
    surfaceAlt: "F3F8F6",
    featureFrom: "0E1E33",
    featureVia: "43699F",
    featureTo: "1E3A5F",
    heading: "1A1A1A",
    body: "56687A",
    muted: "7C8C9C",
    panel: "E7F2EE",
    panelBorder: "C3E1D6",
    accent: "43699F",
    accentSoft: "D6EBE3",
    onAccent: "FFFFFF",
    iconInk: "43699F",
    decor: "7BBBA6",
    featureDecor: "7BBBA6",
    connector: "7BBBA6",
    featureHeading: "FFFFFF",
    featureBody: "D6EBE3",
  },
  type: { display: 44, title: 30, heading: 18, body: 14, small: 11, eyebrow: 10 },
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

export const SLIDE_TEMPLATES: SlideTemplate[] = [
  ECOTECH_TEMPLATE,
  template("professional", "Professional", "Corporate blue on white", SANS, {
    surface: "FFFFFF",
    surfaceAlt: "F1F5F9",
    featureFrom: "0F172A",
    featureVia: "1E293B",
    featureTo: "1E3A8A",
    heading: "0F172A",
    body: "334155",
    muted: "64748B",
    panel: "F8FAFC",
    panelBorder: "E2E8F0",
    accent: "2563EB",
    accentSoft: "DBEAFE",
    onAccent: "FFFFFF",
    iconInk: "2563EB",
    decor: "3B82F6",
    featureDecor: "60A5FA",
    connector: "93C5FD",
    featureHeading: "FFFFFF",
    featureBody: "CBD5E1",
  }),
  template("minimal", "Minimal", "Monochrome, nothing decorative", SANS, {
    surface: "FFFFFF",
    surfaceAlt: "FFFFFF",
    featureFrom: "171717",
    featureVia: "262626",
    featureTo: "404040",
    heading: "171717",
    body: "525252",
    muted: "A3A3A3",
    panel: "FAFAFA",
    panelBorder: "E5E5E5",
    accent: "171717",
    accentSoft: "F5F5F5",
    onAccent: "FFFFFF",
    iconInk: "171717",
    decor: "A3A3A3",
    featureDecor: "D4D4D4",
    connector: "D4D4D4",
    featureHeading: "FFFFFF",
    featureBody: "D4D4D4",
  }),
  template("creative", "Creative", "Violet and fuchsia, high contrast", SANS, {
    surface: "FFFFFF",
    surfaceAlt: "F5F3FF",
    featureFrom: "6D28D9",
    featureVia: "7E22CE",
    featureTo: "A21CAF",
    heading: "2E1065",
    body: "334155",
    muted: "A78BFA",
    panel: "F5F3FF",
    panelBorder: "DDD6FE",
    accent: "7C3AED",
    accentSoft: "EDE9FE",
    onAccent: "FFFFFF",
    iconInk: "7C3AED",
    decor: "8B5CF6",
    featureDecor: "E879F9",
    connector: "C4B5FD",
    featureHeading: "FFFFFF",
    featureBody: "DDD6FE",
  }),
  template(
    "academic",
    "Academic",
    "Warm stone and emerald, serif headings",
    {
      heading: "Cambria",
      body: "Calibri",
      headingStack: `Cambria, Georgia, serif`,
      bodyStack: `Calibri, ${SYSTEM_FALLBACK}`,
    },
    {
      surface: "FAFAF9",
      surfaceAlt: "F5F5F4",
      featureFrom: "292524",
      featureVia: "1C1917",
      featureTo: "022C22",
      heading: "1C1917",
      body: "44403C",
      muted: "78716C",
      panel: "FFFFFF",
      panelBorder: "D6D3D1",
      accent: "047857",
      accentSoft: "ECFDF5",
      onAccent: "FFFFFF",
      iconInk: "047857",
      decor: "059669",
      featureDecor: "34D399",
      connector: "6EE7B7",
      featureHeading: "FFFFFF",
      featureBody: "D6D3D1",
    },
  ),
  template("tech", "Tech", "Dark slate with cyan, for technical decks", SANS, {
    surface: "0F172A",
    surfaceAlt: "1E293B",
    featureFrom: "020617",
    featureVia: "0F172A",
    featureTo: "083344",
    heading: "FFFFFF",
    body: "CBD5E1",
    muted: "64748B",
    panel: "1E293B",
    panelBorder: "334155",
    accent: "06B6D4",
    accentSoft: "164E63",
    onAccent: "020617",
    iconInk: "22D3EE",
    decor: "06B6D4",
    featureDecor: "22D3EE",
    connector: "0E7490",
    featureHeading: "FFFFFF",
    featureBody: "A5F3FC",
  }),
];

export const DEFAULT_TEMPLATE_ID = ECOTECH_TEMPLATE.id;

export const VALID_TEMPLATE_IDS: string[] = SLIDE_TEMPLATES.map((t) => t.id);

/** Resolve a template id, falling back to the default rather than failing. */
export function templateFor(id: string | undefined | null): SlideTemplate {
  return SLIDE_TEMPLATES.find((t) => t.id === id) ?? ECOTECH_TEMPLATE;
}

/**
 * The template as CSS custom properties.
 *
 * This is what lets the web renderer name colour roles rather than literal
 * values, so switching template changes every slide without touching markup.
 */
export function templateCssVariables(t: SlideTemplate): string {
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
