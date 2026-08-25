import { SLIDE_TEMPLATE } from "./slides/template";

// ============================================
// Outline form constants
//
// There is one template — the Ecotech deck the .pptx defines — and no way to
// pick another, so nothing here offers a choice. DEFAULT_STYLE remains because
// a lesson still records which template it was drawn with, and lessons stored
// before the picker was removed carry an id in that field.
// ============================================

/** The template every lesson is drawn with. */
export const DEFAULT_STYLE = SLIDE_TEMPLATE.id;

/** Default slide count range */
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 20;
/**
 * The default a new lesson starts at.
 *
 * Eight was too few for a subject taught properly: a five-section syllabus
 * compressed into eight slides gives each part a slide and a half, which is
 * room for a definition and nothing else. The planner reports what the subject
 * actually needs, and the instructor can still set any figure in range.
 */
export const DEFAULT_SLIDE_COUNT = 12;
