import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { importPptx } from "../import/pptx";
import { SLIDE_TEMPLATE, type SlideTemplate } from "../template";
import {
  BENCHMARK_PROFILE_VERSION,
  type BenchmarkFrame,
  type BenchmarkLayout,
  type SlideBenchmarkProfile,
} from "./profile";

interface RawFrame extends BenchmarkFrame {
  rawFill?: string;
}

interface StyleEvidence {
  colours: string[];
  textColours: Array<{ colour: string; sizePt: number }>;
  fonts: Array<{ family: string; sizePt: number }>;
  surface?: string;
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function fraction(value: string): number | null {
  if (!value.endsWith("%")) return null;
  const parsed = Number(value.slice(0, -1));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed / 100)) : null;
}

function normalHex(value: string): string | null {
  const clean = value.replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(clean)) return clean;
  if (/^[0-9A-F]{3}$/.test(clean))
    return clean
      .split("")
      .map((char) => char + char)
      .join("");
  return null;
}

function coloursOf(value: string): string[] {
  return [...value.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)]
    .map((match) => normalHex(match[1]))
    .filter((colour): colour is string => Boolean(colour));
}

function alphaOf(value: string): number | undefined {
  const match = value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/i);
  if (!match) return undefined;
  const alpha = Number(match[1]);
  return Number.isFinite(alpha) && alpha >= 0.05 && alpha <= 1 ? alpha : undefined;
}

function points(value: string): number | null {
  const match = value.match(/^([\d.]+)px$/);
  if (!match) return null;
  const px = Number(match[1]);
  return Number.isFinite(px) ? Math.round(px * 0.75 * 10) / 10 : null;
}

function fontFamily(value: string): string | null {
  const first = value.split(",")[0]?.replace(/["']/g, "").trim();
  return first || null;
}

function count(values: string[]): Array<[string, number]> {
  const totals = new Map<string, number>();
  values.forEach((value) => totals.set(value, (totals.get(value) ?? 0) + 1));
  return [...totals].sort((a, b) => b[1] - a[1]);
}

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((channel) => channel / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function distance(a: string, b: string): number {
  const aa = rgb(a);
  const bb = rgb(b);
  return Math.sqrt(aa.reduce((sum, value, index) => sum + (value - bb[index]) ** 2, 0));
}

function mix(a: string, b: string, amount: number): string {
  const aa = rgb(a);
  const bb = rgb(b);
  return aa
    .map((value, index) => Math.round(value * (1 - amount) + bb[index] * amount))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function dominant(values: string[], fallback: string, rejected = new Set<string>()): string {
  return count(values).find(([value]) => !rejected.has(value))?.[0] ?? fallback;
}

function inferTextRole(
  text: string,
  sizePt: number,
  largest: number,
  slideRole: BenchmarkLayout["role"],
): BenchmarkFrame["role"] {
  if (sizePt >= largest - 0.5) return slideRole === "cover" ? "display" : "title";
  if (text.length <= 40 && text === text.toUpperCase() && /[A-Z]/.test(text)) return "eyebrow";
  if (sizePt >= 24) return "heading";
  if (sizePt <= 12) return "small";
  return "body";
}

function familyOf(frames: RawFrame[]): string {
  const text = frames.filter((frame) => frame.kind === "text");
  const columns = new Set(text.map((frame) => Math.round(frame.x * 4))).size;
  const rows = new Set(text.map((frame) => Math.round(frame.y * 6))).size;
  if (columns >= 3 && rows <= 4) return "multi-column";
  if (columns === 2) return "two-column";
  if (rows >= 5) return "vertical-sequence";
  if (text.length <= 3) return "statement";
  return "editorial-stack";
}

function slideRole(
  index: number,
  total: number,
  text: string,
  paragraphCount: number,
): BenchmarkLayout["role"] {
  if (index === 0) return "cover";
  if (index === total - 1) return "closing";
  if (index <= 2 && paragraphCount >= 4 && text.split(/\s+/).length < 80) return "contents";
  return "content";
}

function nearestFillRole(
  colour: string | undefined,
  template: SlideTemplate,
): BenchmarkFrame["fillRole"] {
  if (!colour) return undefined;
  const candidates = ["surface", "surfaceAlt", "panel", "accent", "accentSoft", "heading"] as const;
  return [...candidates].sort(
    (a, b) => distance(colour, template.palette[a]) - distance(colour, template.palette[b]),
  )[0];
}

async function deckSize(data: Buffer): Promise<{ widthIn: number; heightIn: number }> {
  const zip = await JSZip.loadAsync(data);
  const xml = await zip.file("ppt/presentation.xml")?.async("string");
  const match = xml?.match(/<p:sldSz\b[^>]*\bcx="(\d+)"[^>]*\bcy="(\d+)"/);
  if (!match) return { ...SLIDE_TEMPLATE.deck };
  return { widthIn: Number(match[1]) / 914400, heightIn: Number(match[2]) / 914400 };
}

function extractSlide(
  html: string,
  title: string,
  index: number,
  total: number,
): { layout: Omit<BenchmarkLayout, "frames"> & { frames: RawFrame[] }; evidence: StyleEvidence } {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const root = document.body.firstElementChild as HTMLElement | null;
  const fullText = cleanText(root?.textContent ?? "");
  const role = slideRole(index, total, fullText, root?.querySelectorAll("p").length ?? 0);
  const evidence: StyleEvidence = { colours: [], textColours: [], fonts: [] };
  if (root) {
    evidence.surface = coloursOf(root.getAttribute("style") ?? "")[0];
    evidence.colours.push(...coloursOf(root.getAttribute("style") ?? ""));
  }

  const positioned = [...document.querySelectorAll<HTMLElement>("[style]")].filter(
    (element) => element.style.position === "absolute",
  );
  const sizes = positioned.flatMap((element) =>
    [...element.querySelectorAll<HTMLElement>("span[style]")]
      .map((span) => points(span.style.fontSize))
      .filter((size): size is number => size !== null),
  );
  const largest = Math.max(1, ...sizes);
  const frames: RawFrame[] = [];

  for (const element of positioned) {
    const x = fraction(element.style.left);
    const y = fraction(element.style.top);
    const w = fraction(element.style.width);
    const h = fraction(element.style.height);
    if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) continue;

    const style = element.getAttribute("style") ?? "";
    const colours = coloursOf(style);
    evidence.colours.push(...colours);
    const spans = [...element.querySelectorAll<HTMLElement>("span[style]")];
    const fontSizes = spans
      .map((span) => points(span.style.fontSize))
      .filter((size): size is number => size !== null);
    const fontPt = fontSizes.length ? Math.max(...fontSizes) : undefined;
    spans.forEach((span) => {
      const sizePt = points(span.style.fontSize) ?? 0;
      const family = fontFamily(span.style.fontFamily);
      if (family) evidence.fonts.push({ family, sizePt });
      coloursOf(span.style.color).forEach((colour) => {
        evidence.colours.push(colour);
        evidence.textColours.push({ colour, sizePt });
      });
    });

    const text = cleanText(element.textContent ?? "");
    const rawFill = colours[0];
    const hasFill = Boolean(element.style.background || element.style.backgroundColor);
    if (hasFill) {
      frames.push({ kind: "shape", x, y, w, h, rawFill, alpha: alphaOf(style) });
    }
    if (element.querySelector("img")) frames.push({ kind: "image", x, y, w, h });
    if (text) {
      const statedAlign =
        element.style.textAlign || element.querySelector<HTMLElement>("p")?.style.textAlign || "";
      const align = ["left", "center", "right"].includes(statedAlign)
        ? (statedAlign as "left" | "center" | "right")
        : undefined;
      frames.push({
        kind: "text",
        x,
        y,
        w,
        h,
        fontPt,
        align,
        role: inferTextRole(text, fontPt ?? 14, largest, role),
      });
    }
  }
  if (frames.length === 0) {
    frames.push({ kind: "text", x: 0.06, y: 0.1, w: 0.88, h: 0.8, role: "body" });
  }
  dom.window.close();

  const words = fullText ? fullText.split(/\s+/).length : 0;
  return {
    layout: {
      id: `reference-${String(index + 1).padStart(2, "0")}`,
      sourceSlide: index + 1,
      role,
      family: familyOf(frames),
      sampleTitle: title.slice(0, 160),
      sampleText: fullText.slice(0, 2_000),
      wordCount: words,
      frames,
    },
    evidence,
  };
}

/** Deterministically preprocess a benchmark PowerPoint. No model call occurs. */
export async function extractSlideBenchmark(
  data: Buffer,
  sourceFile: string,
  sourceSha256: string,
): Promise<SlideBenchmarkProfile> {
  const imported = await importPptx(data, {
    async saveMedia(name, bytes) {
      const mime = name.toLowerCase().endsWith(".svg") ? "image/svg+xml" : "image/png";
      return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    },
  });

  const extracted = imported.slides.map((slide, index) =>
    extractSlide(slide.html, slide.title, index, imported.slides.length),
  );
  const colours = extracted.flatMap((item) => item.evidence.colours);
  const textEvidence = extracted.flatMap((item) => item.evidence.textColours);
  const fontEvidence = extracted.flatMap((item) => item.evidence.fonts);
  const fallback = SLIDE_TEMPLATE;
  const surface = dominant(
    extracted
      .map((item) => item.evidence.surface)
      .filter((value): value is string => Boolean(value)),
    fallback.palette.surface,
  );
  const heading =
    [...textEvidence].sort((a, b) => b.sizePt - a.sizePt)[0]?.colour ?? fallback.palette.heading;
  const body = dominant(
    textEvidence.filter((item) => item.sizePt < 24).map((item) => item.colour),
    fallback.palette.body,
    new Set([heading]),
  );
  const accent = dominant(colours, fallback.palette.accent, new Set([surface, heading, body]));
  const panel =
    count(colours)
      .map(([colour]) => colour)
      .find((colour) => colour !== surface && luminance(colour) > 0.78) ??
    mix(accent, "FFFFFF", 0.84);
  const sizes = fontEvidence
    .map((item) => item.sizePt)
    .filter((size) => size > 0)
    .sort((a, b) => b - a);
  const uniqueSizes = [...new Set(sizes.map((size) => Math.round(size * 2) / 2))];
  const headingFont =
    [...fontEvidence].sort((a, b) => b.sizePt - a.sizePt)[0]?.family ?? fallback.fonts.heading;
  const bodyFont = dominant(
    fontEvidence.filter((item) => item.sizePt <= 20).map((item) => item.family),
    fallback.fonts.body,
  );
  const bodySize =
    Number(
      dominant(
        fontEvidence.filter((item) => item.sizePt <= 20).map((item) => String(item.sizePt)),
        String(fallback.type.body),
      ),
    ) || fallback.type.body;
  const template: SlideTemplate = {
    id: `benchmark-${sourceSha256.slice(0, 12)}`,
    label: `Benchmark: ${sourceFile}`,
    description: `Typography, colour and spacing extracted from ${sourceFile}`,
    deck: await deckSize(data),
    fonts: {
      heading: headingFont,
      body: bodyFont,
      headingStack: `${headingFont}, Arial, sans-serif`,
      bodyStack: `${bodyFont}, Arial, sans-serif`,
    },
    palette: {
      surface,
      surfaceAlt: mix(surface, accent, 0.05),
      featureFrom: heading,
      featureVia: heading,
      featureTo: accent,
      heading,
      body,
      muted: mix(body, surface, 0.25),
      panel,
      panelBorder: mix(panel, body, 0.12),
      accent,
      accentSoft: mix(accent, surface, 0.78),
      onAccent: luminance(accent) < 0.55 ? "FFFFFF" : heading,
      iconInk: heading,
      decor: accent,
      featureDecor: accent,
      connector: mix(body, surface, 0.65),
      featureHeading: "FFFFFF",
      featureBody: mix("FFFFFF", accent, 0.18),
    },
    type: {
      display: uniqueSizes[0] ?? fallback.type.display,
      title: uniqueSizes.find((size) => size < (uniqueSizes[0] ?? Infinity)) ?? fallback.type.title,
      heading: uniqueSizes.find((size) => size <= 24) ?? fallback.type.heading,
      body: bodySize,
      small: uniqueSizes.at(-1) ?? fallback.type.small,
      eyebrow: uniqueSizes.find((size) => size <= 14) ?? fallback.type.eyebrow,
    },
  };

  const layouts: BenchmarkLayout[] = extracted.map((item) => ({
    ...item.layout,
    frames: item.layout.frames.map(({ rawFill, ...frame }) => ({
      ...frame,
      fillRole: frame.kind === "shape" ? nearestFillRole(rawFill, template) : undefined,
    })),
  }));
  const words = layouts.map((layout) => layout.wordCount);
  const textFrameCounts = layouts.map(
    (layout) => layout.frames.filter((frame) => frame.kind === "text").length,
  );
  const average = (values: number[]) =>
    values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

  return {
    version: BENCHMARK_PROFILE_VERSION,
    sourceFile,
    sourceSha256,
    generatedAt: new Date().toISOString(),
    template,
    editorial: {
      averageWords: Math.round(average(words)),
      maximumWords: Math.max(0, ...words),
      averageTextFrames: Math.round(average(textFrameCounts) * 10) / 10,
      guidance: [
        `Match the reference's concise density: about ${Math.round(average(words))} visible words per slide.`,
        `Use roughly ${Math.round(average(textFrameCounts) * 10) / 10} text frames per slide, chosen by content shape rather than repetition.`,
        "Write takeaway titles that state the slide's point; do not use generic topic labels.",
        "Treat the sample subject as disposable and preserve only its teaching depth and rhetorical structure.",
      ],
    },
    layouts,
  };
}
