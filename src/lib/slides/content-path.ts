import { SlideContentSchema, type SlideContent } from "./content-schema";

// ============================================
// Addressing one field of a slide
//
// Inline editing changes exactly one thing. Rewriting the slide's HTML and
// hoping only the title moved cannot promise that — the model controls the
// whole output, so layout, classes and neighbouring text are all at risk.
//
// Instead an edit names a path into the structured content, the model returns
// only that field's new text, and the slide is re-rendered from the template.
// Everything the edit did not name is therefore unchanged by construction, not
// by inspection.
// ============================================

/** A dotted path into slide content, e.g. "points.0.heading". */
export type ContentPath = string;

export interface EditableField {
  path: ContentPath;
  /** What this field is, for the edit prompt. */
  label: string;
  value: string;
  minLength: number;
  maxLength: number;
  /** True when the field may be removed rather than rewritten. */
  optional: boolean;
}

/** Field limits, mirroring content-schema. Kept together so an edit cannot
 *  produce a value the schema would then reject. */
const LIMITS: Record<string, { min: number; max: number; optional?: boolean }> = {
  title: { min: 3, max: 90 },
  subtitle: { min: 10, max: 180 },
  eyebrow: { min: 1, max: 60, optional: true },
  lead: { min: 20, max: 280, optional: true },
  "points.*.heading": { min: 2, max: 70 },
  "points.*.description": { min: 15, max: 260 },
  "columns.*.heading": { min: 2, max: 50 },
  "columns.*.points.*": { min: 8, max: 160 },
  "steps.*.label": { min: 2, max: 50 },
  "steps.*.description": { min: 10, max: 200 },
  "nodes.*.label": { min: 2, max: 46 },
  "nodes.*.description": { min: 8, max: 140, optional: true },
  "stats.*.value": { min: 1, max: 18 },
  "stats.*.label": { min: 3, max: 60 },
  "stats.*.note": { min: 1, max: 120, optional: true },
  "takeaways.*": { min: 15, max: 200 },
  situation: { min: 20, max: 300 },
  problem: { min: 20, max: 300 },
  action: { min: 20, max: 300 },
  outcome: { min: 20, max: 300 },
};

/** Titles and closings have looser limits than content slides. */
const FEATURE_LIMITS: Record<string, { min: number; max: number; optional?: boolean }> = {
  title: { min: 2, max: 90 },
  subtitle: { min: 5, max: 180, optional: true },
};

/** Replace every array index in a path with `*`, to look its limits up. */
function limitKey(path: ContentPath): string {
  return path.replace(/\.\d+(?=\.|$)/g, ".*").replace(/^(\w+)\.\*$/, "$1.*");
}

function limitsFor(content: SlideContent, path: ContentPath) {
  const key = limitKey(path);
  if (content.type === "title" || content.type === "closing") {
    return FEATURE_LIMITS[key] ?? LIMITS[key];
  }
  return LIMITS[key];
}

type Indexable = Record<string, unknown>;

/** Walk a path, returning the container holding the final key. */
function walk(root: unknown, path: ContentPath): { parent: Indexable; key: string } | null {
  const parts = path.split(".");
  let current: unknown = root;

  for (const part of parts.slice(0, -1)) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Indexable)[part];
  }
  if (current === null || typeof current !== "object") return null;

  return { parent: current as Indexable, key: parts[parts.length - 1] };
}

/** The current text at a path, or null if the path names nothing textual. */
export function readField(content: SlideContent, path: ContentPath): EditableField | null {
  const found = walk(content, path);
  if (!found) return null;

  const value = found.parent[found.key];
  if (typeof value !== "string") return null;

  const limits = limitsFor(content, path);
  if (!limits) return null;

  return {
    path,
    label: humanLabel(path),
    value,
    minLength: limits.min,
    maxLength: limits.max,
    optional: limits.optional ?? false,
  };
}

/** A readable name for a path, used in the edit prompt and the UI. */
export function humanLabel(path: ContentPath): string {
  const last =
    path
      .split(".")
      .filter((p) => !/^\d+$/.test(p))
      .pop() ?? path;
  const index = path.match(/\.(\d+)(?:\.|$)/)?.[1];
  const name = last.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return index === undefined ? name : `${name} ${Number(index) + 1}`;
}

export type WriteResult = { ok: true; content: SlideContent } | { ok: false; error: string };

/**
 * Write one field and re-validate the whole slide.
 *
 * Re-parsing rather than trusting the write is what makes this safe: an edit
 * that would leave the slide invalid is rejected before it can be stored, so a
 * slide is never persisted in a state the renderer cannot draw.
 */
export function writeField(content: SlideContent, path: ContentPath, value: string): WriteResult {
  const limits = limitsFor(content, path);
  if (!limits) return { ok: false, error: `"${path}" is not an editable field of this slide.` };

  const trimmed = value.trim();
  if (trimmed.length < limits.min) {
    return {
      ok: false,
      error: `The edited ${humanLabel(path)} is too short (needs at least ${limits.min} characters).`,
    };
  }
  if (trimmed.length > limits.max) {
    return {
      ok: false,
      error: `The edited ${humanLabel(path)} is too long (at most ${limits.max} characters).`,
    };
  }

  // Deep clone so a rejected edit cannot leave the caller's copy mutated.
  const draft = structuredClone(content) as SlideContent;
  const found = walk(draft, path);
  if (!found || typeof found.parent[found.key] !== "string") {
    return { ok: false, error: `"${path}" is not an editable field of this slide.` };
  }
  found.parent[found.key] = trimmed;

  const parsed = SlideContentSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      ok: false,
      error: `That edit would make the slide invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }
  return { ok: true, content: parsed.data };
}

/** Every field of a slide that inline editing can address. */
export function editableFields(content: SlideContent): EditableField[] {
  const fields: EditableField[] = [];
  const visit = (value: unknown, path: string) => {
    if (typeof value === "string") {
      const field = readField(content, path);
      if (field) fields.push(field);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => visit(item, `${path}${path ? "." : ""}${i}`));
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "type" || key === "icon") continue;
        visit(child, `${path}${path ? "." : ""}${key}`);
      }
    }
  };
  visit(content, "");
  return fields;
}
