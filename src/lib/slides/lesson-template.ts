import { DEFAULT_TEMPLATE_ID, VALID_TEMPLATE_IDS } from "./template";

// ============================================
// Which template a lesson was generated with
//
// The choice lives in the lesson's stored outline, which is already the record
// of how the lesson was planned. Keeping it there means every representation
// of the lesson — preview, published view, learn view, export — resolves the
// same template from the same place, and re-rendering a stored slide keeps the
// look it was generated with.
// ============================================

interface OutlineWithTemplate {
  templateId?: unknown;
  /** The pre-template field. A style id and a template id share a namespace. */
  style?: unknown;
}

/** The template id recorded on a lesson, or the default. */
export function readLessonTemplateId(outlineJson: string | null | undefined): string {
  if (!outlineJson) return DEFAULT_TEMPLATE_ID;
  try {
    const outline = JSON.parse(outlineJson) as OutlineWithTemplate;
    for (const candidate of [outline.templateId, outline.style]) {
      if (typeof candidate === "string" && VALID_TEMPLATE_IDS.includes(candidate)) {
        return candidate;
      }
    }
  } catch {
    // A malformed outline is not a reason to fail a render.
  }
  return DEFAULT_TEMPLATE_ID;
}
