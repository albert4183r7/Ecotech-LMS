import { templateFor, type SlideTemplate } from "./template";

// ============================================
// Slide theme
//
// Maps the renderer's colour roles onto stable class names. The classes get
// their values from CSS custom properties that wrapSlideHtml writes from the
// active template, so one set of markup renders in every template and the
// PowerPoint renderer reads the same template for its raw values.
//
// This used to hold five hard-coded Tailwind palettes, which meant a template
// could only ever use colours that exist as Tailwind utilities — no use at all
// for reproducing a supplied .pptx.
// ============================================

export interface SlideTheme {
  /** Canvas background for ordinary content slides. */
  surface: string;
  /** Background for title, section and closing slides. */
  feature: string;
  heading: string;
  body: string;
  muted: string;
  /** Card / panel background on the surface. */
  panel: string;
  panelBorder: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  /** Foreground for an icon sitting in an accentSoft chip. */
  iconInk: string;
  /** Colour of the decorative shapes bled off the slide corners. */
  decor: string;
  /** Same, on a feature background. */
  featureDecor: string;
  /** Connector lines and arrows in a diagram. */
  connector: string;
  /** Text colours for use on the feature background. */
  featureHeading: string;
  featureBody: string;
}

/** The role-to-class mapping. Identical for every template by design. */
const THEME: SlideTheme = {
  surface: "tpl-surface",
  feature: "tpl-feature",
  heading: "tpl-heading",
  body: "tpl-body",
  muted: "tpl-muted",
  panel: "tpl-panel",
  panelBorder: "tpl-panel-border",
  accent: "tpl-accent",
  accentSoft: "tpl-accent-soft",
  onAccent: "tpl-on-accent",
  iconInk: "tpl-icon-ink",
  decor: "tpl-decor",
  featureDecor: "tpl-feature-decor",
  connector: "tpl-connector",
  featureHeading: "tpl-feature-heading",
  featureBody: "tpl-feature-body",
};

/** Class names for the renderer. Values arrive as custom properties. */
export function themeFor(_templateId?: string): SlideTheme {
  return THEME;
}

/** The template behind a slide, for anything that needs real values. */
export function templateOf(templateId: string | undefined | null): SlideTemplate {
  return templateFor(templateId);
}
