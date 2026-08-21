import type { SlideContent } from "./content-schema";
import { capacityOf, type Placeholder, type Panel, type RenderedLayout } from "./template-layouts";
import { selectLayout } from "./layout-select";

// ============================================
// Resolving content into a template layout
//
// The single step both renderers share. It reads each placeholder's value out
// of the structured content, fits the text to the box the template gives it,
// and returns boxes that are ready to draw. The web renderer and the
// PowerPoint renderer then differ only in how they draw a positioned box —
// which is what keeps the deck, the preview, the published lesson and the
// student view showing the same slide.
//
// Fitting is why content stops being clipped. A box has a known size at a
// known type size, so the text either fits or the type steps down until it
// does; truncation is the last resort, not the first behaviour.
// ============================================

export interface ResolvedBox extends Placeholder {
  text: string;
  /** Possibly below the template's nominal size, to make the text fit. */
  fontPt: number;
  /** True when the text had to be cut even at the smallest permitted size. */
  truncated: boolean;
}

export interface ResolvedSlide {
  layoutId: string;
  panels: Panel[];
  boxes: ResolvedBox[];
  /** Problems worth surfacing rather than hiding. */
  warnings: string[];
}

/** How far type may shrink before the slide is simply carrying too much. */
const MIN_SCALE = 0.85;
const SCALE_STEP = 0.05;
/** Below this, projected text stops being legible whatever the box wants. */
const MIN_FONT_PT = 10.5;

/** Read a dotted path out of the content object. */
function read(content: SlideContent, path: string): string | undefined {
  let current: unknown = content;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

const CASE_LABELS = ["Situation", "Problem", "Action", "Outcome"] as const;

/**
 * The repeated items of a slide, as a common shape.
 *
 * One layout serves several content types — the template's stage row presents
 * a process step and an architecture node identically — but those types name
 * their fields differently. Layouts therefore address `item.N.primary`, and
 * the mapping to the real field lives here. Without it a layout's paths only
 * matched one of the types it claimed to support, and the others rendered
 * empty.
 */
function itemField(
  content: SlideContent,
  index: number,
  slot: "primary" | "secondary",
): { text: string | undefined; path: string } | undefined {
  switch (content.type) {
    case "process": {
      const step = content.steps[index];
      if (!step) return undefined;
      return slot === "primary"
        ? { text: step.label, path: `steps.${index}.label` }
        : { text: step.description, path: `steps.${index}.description` };
    }
    case "architecture": {
      const node = content.nodes[index];
      if (!node) return undefined;
      return slot === "primary"
        ? { text: node.label, path: `nodes.${index}.label` }
        : { text: node.description, path: `nodes.${index}.description` };
    }
    case "concept": {
      const point = content.points[index];
      if (!point) return undefined;
      return slot === "primary"
        ? { text: point.heading, path: `points.${index}.heading` }
        : { text: point.description, path: `points.${index}.description` };
    }
    case "data": {
      const stat = content.stats[index];
      if (!stat) return undefined;
      return slot === "primary"
        ? { text: stat.value, path: `stats.${index}.value` }
        : { text: stat.label, path: `stats.${index}.label` };
    }
    // A case study is four ordered stages, which is what the template's
    // process layout draws. The stage names are the layout's, the passages
    // are the content's.
    case "caseStudy": {
      const field = (["situation", "problem", "action", "outcome"] as const)[index];
      if (!field) return undefined;
      return slot === "primary"
        ? { text: CASE_LABELS[index], path: `__caseLabel.${index}` }
        : { text: content[field], path: field };
    }
    default:
      return undefined;
  }
}

/** Values the layout supplies itself rather than reading from content. */
function synthetic(content: SlideContent, path: string): string | undefined {
  const [key, indexPart] = path.split(".");
  const index = Number(indexPart);

  switch (key) {
    case "__index":
      return String(index + 1);
    case "__takeawayLabel":
      return "Key takeaway";
    case "__caseLabel":
      return CASE_LABELS[index] ?? "";
    case "__caseValue": {
      if (content.type !== "caseStudy") return undefined;
      return [content.situation, content.problem, content.action, content.outcome][index];
    }
    case "__footer":
      return undefined; // filled by the caller, which knows the deck position
    default:
      return undefined;
  }
}

/**
 * Shrink type until the text fits, then trim if it still does not.
 *
 * Returns the size to draw at. A box that would need to go below MIN_SCALE is
 * reported so the caller can say the slide is overloaded rather than quietly
 * dropping half a sentence.
 */
function fit(
  text: string,
  placeholder: Placeholder,
): { fontPt: number; text: string; truncated: boolean } {
  // Never below the readability floor, and never below a fixed point size:
  // a box that fits only by becoming illegible has not been solved.
  const floor = Math.max(placeholder.fontPt * MIN_SCALE, Math.min(placeholder.fontPt, MIN_FONT_PT));

  for (let scale = 1; ; scale -= SCALE_STEP) {
    const fontPt = Math.round(Math.max(placeholder.fontPt * scale, floor) * 10) / 10;
    const capacity = capacityOf({ ...placeholder, fontPt });
    if (text.length <= capacity.maxChars) return { fontPt, text, truncated: false };
    if (fontPt <= floor + 1e-9) break;
  }

  const fontPt = Math.round(floor * 10) / 10;
  const capacity = capacityOf({ ...placeholder, fontPt });
  // Cut at a word boundary so the visible remainder reads as a phrase.
  const cut = text.slice(0, Math.max(1, capacity.maxChars - 1));
  const lastSpace = cut.lastIndexOf(" ");
  const kept = (lastSpace > capacity.maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return { fontPt, text: `${kept}…`, truncated: true };
}

export interface ResolveOptions {
  /**
   * Shown in the template's page-number position, and used to tell the
   * deck's opening title slide from a mid-deck section divider — the
   * template has a layout for each.
   */
  slideNumber?: number;
}

/** Resolve a slide's content into positioned, fitted boxes. */
export function resolveSlide(content: SlideContent, options: ResolveOptions = {}): ResolvedSlide {
  const choice = selectLayout(content, options.slideNumber);
  const warnings: string[] = [];
  if (choice.overflowWarning) warnings.push(choice.overflowWarning);

  const boxes: ResolvedBox[] = [];

  for (const placeholder of choice.layout.placeholders) {
    let text: string | undefined;
    let resolvedPath = placeholder.path;

    if (placeholder.path === "__footer") {
      text = options.slideNumber ? String(options.slideNumber).padStart(2, "0") : undefined;
    } else if (placeholder.path.startsWith("__")) {
      text = synthetic(content, placeholder.path);
    } else if (placeholder.path.startsWith("item.")) {
      const [, indexPart, slot] = placeholder.path.split(".");
      const field = itemField(content, Number(indexPart), slot as "primary" | "secondary");
      if (!field) continue;
      text = field.text;
      // Report the real content path, so inline editing addresses the field
      // the learner clicked rather than the layout's internal slot name.
      resolvedPath = field.path;
    } else {
      text = read(content, placeholder.path);
    }

    // A placeholder with nothing to show is dropped, not drawn empty. This is
    // how a layout built for five points renders three without leaving holes.
    if (!text || !text.trim()) continue;

    const fitted = fit(text.trim(), placeholder);
    if (fitted.truncated) {
      warnings.push(`${resolvedPath} was trimmed to fit its box`);
    }
    boxes.push({ ...placeholder, path: resolvedPath, ...fitted });
  }

  return {
    layoutId: choice.layout.id,
    panels: choice.layout.panels,
    boxes,
    warnings,
  };
}

export { type RenderedLayout };
