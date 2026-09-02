import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";
import type { SlideTemplate } from "../template";

export const BENCHMARK_PROFILE_VERSION = 1;
export const ACTIVE_BENCHMARK_PROFILE = path.join(
  process.cwd(),
  "slide-benchmarks",
  "cache",
  "active-profile.json",
);

const Hex = z.string().regex(/^[0-9A-F]{6}$/);

const TemplateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  deck: z.object({ widthIn: z.number().positive(), heightIn: z.number().positive() }),
  fonts: z.object({
    heading: z.string().min(1),
    body: z.string().min(1),
    headingStack: z.string().min(1),
    bodyStack: z.string().min(1),
  }),
  palette: z.object({
    surface: Hex,
    surfaceAlt: Hex,
    featureFrom: Hex,
    featureVia: Hex,
    featureTo: Hex,
    heading: Hex,
    body: Hex,
    muted: Hex,
    panel: Hex,
    panelBorder: Hex,
    accent: Hex,
    accentSoft: Hex,
    onAccent: Hex,
    iconInk: Hex,
    decor: Hex,
    featureDecor: Hex,
    connector: Hex,
    featureHeading: Hex,
    featureBody: Hex,
  }),
  type: z.object({
    display: z.number().positive(),
    title: z.number().positive(),
    heading: z.number().positive(),
    body: z.number().positive(),
    small: z.number().positive(),
    eyebrow: z.number().positive(),
  }),
});

export const BenchmarkFrameSchema = z.object({
  kind: z.enum(["text", "shape", "image"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
  role: z.enum(["display", "title", "heading", "body", "small", "eyebrow", "metric"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  fillRole: z
    .enum(["surface", "surfaceAlt", "panel", "accent", "accentSoft", "heading", "gradient", "none"])
    .optional(),
  alpha: z.number().min(0.05).max(1).optional(),
  fontPt: z.number().positive().optional(),
});

export const BenchmarkLayoutSchema = z.object({
  id: z.string().min(1),
  sourceSlide: z.number().int().positive(),
  role: z.enum(["cover", "contents", "content", "closing"]),
  family: z.string().min(1),
  sampleTitle: z.string().max(160),
  sampleText: z.string().max(2_000),
  wordCount: z.number().int().nonnegative(),
  frames: z.array(BenchmarkFrameSchema).min(1).max(80),
});

export const SlideBenchmarkProfileSchema = z.object({
  version: z.literal(BENCHMARK_PROFILE_VERSION),
  sourceFile: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  generatedAt: z.string().datetime(),
  template: TemplateSchema,
  editorial: z.object({
    averageWords: z.number().nonnegative(),
    maximumWords: z.number().nonnegative(),
    averageTextFrames: z.number().nonnegative(),
    guidance: z.array(z.string().min(1).max(240)).min(1).max(12),
  }),
  layouts: z.array(BenchmarkLayoutSchema).min(1),
});

export type BenchmarkFrame = z.infer<typeof BenchmarkFrameSchema>;
export type BenchmarkLayout = z.infer<typeof BenchmarkLayoutSchema>;
export type SlideBenchmarkProfile = z.infer<typeof SlideBenchmarkProfileSchema> & {
  template: SlideTemplate;
};

let cached: { mtimeMs: number; profile: SlideBenchmarkProfile | null } | null = null;

/** Runtime reads only the compact cache, never the source PowerPoint. */
export async function loadActiveBenchmarkProfile(): Promise<SlideBenchmarkProfile | null> {
  let mtimeMs: number;
  try {
    mtimeMs = (await stat(ACTIVE_BENCHMARK_PROFILE)).mtimeMs;
  } catch {
    cached = { mtimeMs: 0, profile: null };
    return null;
  }
  if (cached?.mtimeMs === mtimeMs) return cached.profile;

  try {
    const parsed = SlideBenchmarkProfileSchema.parse(
      JSON.parse(await readFile(ACTIVE_BENCHMARK_PROFILE, "utf8")),
    ) as SlideBenchmarkProfile;
    cached = { mtimeMs, profile: parsed };
    return parsed;
  } catch (error) {
    console.warn(
      `[slide-benchmark] ignored invalid active profile — ${error instanceof Error ? error.message : "unknown error"}`,
    );
    cached = { mtimeMs, profile: null };
    return null;
  }
}

/**
 * Compact few-shot context for writing quality only.
 *
 * The benchmark may come from any subject and any visual identity. Its cached
 * geometry, fonts, palette and transparency remain useful for offline analysis
 * but are deliberately excluded from generation. Ecotech is the sole visual
 * authority; these examples teach only specificity, argument structure and
 * information density.
 */
export function benchmarkPrompt(profile: SlideBenchmarkProfile): string {
  const selected: BenchmarkLayout[] = [];
  for (const role of ["cover", "contents", "content", "closing"] as const) {
    const match = profile.layouts.find(
      (layout) => layout.role === role && layout.sampleText.trim(),
    );
    if (match) selected.push(match);
  }
  for (const layout of profile.layouts) {
    if (selected.length >= 4) break;
    if (layout.sampleText.trim() && !selected.some((candidate) => candidate.id === layout.id)) {
      selected.push(layout);
    }
  }
  return [
    `BENCHMARK PROFILE ${profile.sourceSha256.slice(0, 12)}`,
    `Editorial benchmark: ${profile.editorial.guidance.join(" ")}`,
    `Typical visible density: about ${Math.round(profile.editorial.averageWords)} words; ` +
      `the benchmark maximum is ${Math.round(profile.editorial.maximumWords)} words.`,
    "Use the samples only as rhetorical patterns: claim quality, specificity, explanation structure and title strength. Never copy their subject, nouns, figures, claims or examples.",
    "Do not infer any visual decision from this benchmark. Do not copy its layout, frames, palette, fonts, sizes, shapes or spacing; the Ecotech template owns all of those.",
    ...selected.map((layout) => {
      return (
        `CONTENT EXAMPLE (${layout.role}, ${layout.wordCount} words)\n` +
        `Sample title: ${layout.sampleTitle}\nSample copy: ${layout.sampleText}`
      );
    }),
  ].join("\n\n");
}
