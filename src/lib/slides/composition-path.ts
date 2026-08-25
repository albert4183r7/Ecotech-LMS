import { SlideCompositionSchema, type SlideComposition, type TextRole } from "./composition";
import type { EditableField } from "./content-path";

// ============================================
// Addressing one text run of a composed slide
//
// Inline editing names a path and gets back replacement text for that path
// alone; everything the edit did not name is unchanged by construction. A
// composition has no named fields, so the path is the element's index — which
// is exactly what the renderer stamps on each text box as data-path, so a
// click in the preview and an edit here address the same run.
// ============================================

/** What each role's text is allowed to be, so an edit cannot break its box. */
const ROLE_LIMITS: Record<TextRole, { min: number; max: number }> = {
  display: { min: 2, max: 90 },
  title: { min: 3, max: 90 },
  heading: { min: 2, max: 70 },
  body: { min: 10, max: 320 },
  small: { min: 3, max: 180 },
  eyebrow: { min: 1, max: 60 },
  metric: { min: 1, max: 18 },
};

const ROLE_LABEL: Record<TextRole, string> = {
  display: "title",
  title: "slide title",
  heading: "heading",
  body: "body text",
  small: "caption",
  eyebrow: "label",
  metric: "figure",
};

/** The element index a path names, or null when it names nothing editable. */
function indexOf(path: string): number | null {
  const match = /^elements\.(\d+)\.text$/.exec(path);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/** The current text at a path, or null when the path names no text run. */
export function readCompositionField(
  composition: SlideComposition,
  path: string,
): EditableField | null {
  const index = indexOf(path);
  if (index === null) return null;

  const element = composition.elements[index];
  if (!element || element.kind !== "text") return null;

  const limits = ROLE_LIMITS[element.role];
  return {
    path,
    label: ROLE_LABEL[element.role],
    value: element.text,
    minLength: limits.min,
    maxLength: limits.max,
    optional: false,
  };
}

/**
 * Write one text run and re-validate the whole composition.
 *
 * Re-parsing rather than trusting the write is what makes this safe: an edit
 * that would leave the slide invalid is rejected before it can be stored.
 */
export type CompositionWriteResult =
  { ok: true; composition: SlideComposition } | { ok: false; error: string };

export function writeCompositionField(
  composition: SlideComposition,
  path: string,
  value: string,
): CompositionWriteResult {
  const index = indexOf(path);
  const element = index === null ? undefined : composition.elements[index];
  if (index === null || !element || element.kind !== "text") {
    return { ok: false, error: `"${path}" is not an editable field of this slide.` };
  }

  const limits = ROLE_LIMITS[element.role];
  const trimmed = value.trim();
  if (trimmed.length < limits.min) {
    return {
      ok: false,
      error: `The edited ${ROLE_LABEL[element.role]} is too short (needs at least ${limits.min} characters).`,
    };
  }
  if (trimmed.length > limits.max) {
    return {
      ok: false,
      error: `The edited ${ROLE_LABEL[element.role]} is too long (at most ${limits.max} characters).`,
    };
  }

  // Deep clone so a rejected edit cannot leave the caller's copy mutated.
  const draft = structuredClone(composition);
  const target = draft.elements[index];
  if (target.kind !== "text") {
    return { ok: false, error: `"${path}" is not an editable field of this slide.` };
  }
  target.text = trimmed;

  const parsed = SlideCompositionSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      error: `That edit would make the slide invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  return { ok: true, composition: parsed.data };
}
