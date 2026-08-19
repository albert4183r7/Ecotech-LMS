// ============================================
// Slide Design Style Constants
// ============================================

/** Supported slide design styles */
export const SLIDE_STYLES = [
  { value: "professional", label: "Professional", description: "Clean, corporate" },
  { value: "minimal", label: "Minimal", description: "Lots of whitespace, sans-serif" },
  { value: "creative", label: "Creative", description: "Bold colors, dynamic layouts" },
  { value: "academic", label: "Academic", description: "Text-heavy, formal" },
  { value: "tech", label: "Tech", description: "Dark theme, code-friendly" },
] as const;

export type SlideStyle = (typeof SLIDE_STYLES)[number]["value"];

/** Validated list of style values */
export const VALID_STYLES: readonly string[] = SLIDE_STYLES.map((s) => s.value);

/** Default slide count range */
export const MIN_SLIDES = 3;
export const MAX_SLIDES = 20;
export const DEFAULT_SLIDE_COUNT = 8;
