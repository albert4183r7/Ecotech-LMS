import { SLIDE_TEMPLATES, DEFAULT_TEMPLATE_ID, VALID_TEMPLATE_IDS } from "./slides/template";

// ============================================
// Slide template choices for the UI
//
// Derived from the template registry rather than listed again here. The two
// used to be separate lists that happened to share ids, so adding a template
// meant editing both and a mismatch was silently possible.
//
// The stored field is still called `style` on existing lessons; a style id and
// a template id are the same namespace, so old lessons keep resolving.
// ============================================

export const SLIDE_STYLES = SLIDE_TEMPLATES.map((t) => ({
  value: t.id,
  label: t.label,
  description: t.description,
}));

export type SlideStyle = string;

/** Ids the outline endpoint will accept. */
export const VALID_STYLES: readonly string[] = VALID_TEMPLATE_IDS;

/** The template a new lesson gets unless the instructor picks another. */
export const DEFAULT_STYLE = DEFAULT_TEMPLATE_ID;

/** Default slide count range */
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 20;
export const DEFAULT_SLIDE_COUNT = 8;
