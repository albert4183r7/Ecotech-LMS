import sharp from "sharp";
import { chromiumPage } from "./slide-renderer";
import { SLIDE_WIDTH, SLIDE_HEIGHT } from "@/lib/sanitize";

// ============================================
// Slide layout extraction
//
// Reads the geometry and computed styles of a rendered slide so a deck can be
// rebuilt with the design intact. The previous export stripped every tag and
// re-typed the text onto one fixed template, which discarded every layout
// decision the model made.
// ============================================

export interface LayoutBox {
  /** Fractions of the slide, 0-1, so the consumer picks its own units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutShape extends LayoutBox {
  fill: string;
  radius: number;
}

export interface LayoutText extends LayoutBox {
  text: string;
  /** Points at the deck's own scale. */
  fontSize: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
}

export interface SlideLayout {
  shapes: LayoutShape[];
  texts: LayoutText[];
  background: string;
}

/** Extract the visual structure of a wrapped slide document. */
export async function extractSlideLayout(wrappedHtml: string): Promise<SlideLayout> {
  return chromiumPage(wrappedHtml, async (page) => {
    const layout = await page.evaluate(
      ({ w, h }) => {
        const canvas = document.getElementById("slide-canvas");
        if (!canvas) return null;
        const base = canvas.getBoundingClientRect();

        const parseRgb = (value: string): { hex: string; alpha: number } | null => {
          const m = /rgba?\(([^)]+)\)/.exec(value);
          if (!m) return null;
          const parts = m[1]
            .split(/[\s,/]+/)
            .filter(Boolean)
            .map((p) => parseFloat(p));
          const [r, g, b, a = 1] = parts;
          if (![r, g, b].every((c) => Number.isFinite(c))) return null;
          return {
            hex: [r, g, b]
              .map((c) =>
                Math.max(0, Math.min(255, Math.round(c)))
                  .toString(16)
                  .padStart(2, "0"),
              )
              .join("")
              .toUpperCase(),
            alpha: Number.isFinite(a) ? a : 1,
          };
        };

        const toHex = (value: string): string | null => {
          const parsed = parseRgb(value);
          if (!parsed || parsed.alpha < 0.05) return null;
          return parsed.hex;
        };

        // Computed backgrounds may be gradients written in oklch(), color-mix()
        // or any other modern syntax. Rather than parse colour notation, mark
        // the element and read the pixel that was actually painted.
        const SAMPLE = "SAMPLE";

        const shapes: unknown[] = [];
        const texts: unknown[] = [];

        const rel = (r: DOMRect) => ({
          x: (r.left - base.left) / base.width,
          y: (r.top - base.top) / base.height,
          w: r.width / base.width,
          h: r.height / base.height,
        });

        for (const el of Array.from(canvas.querySelectorAll<HTMLElement>("*"))) {
          const rect = el.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) continue;
          // Ignore anything scrolled or positioned outside the slide.
          if (rect.right < base.left || rect.left > base.right) continue;
          if (rect.bottom < base.top || rect.top > base.bottom) continue;
          // Skip decoration. The renderer's blurred corner shapes bleed off the
          // canvas, so they would export at negative coordinates, and a blur has
          // no equivalent in PPTX — they would arrive as hard-edged blocks.
          if (el.closest('[aria-hidden="true"]')) continue;

          const cs = getComputedStyle(el);

          const bg = parseRgb(cs.backgroundColor);
          const painted = cs.backgroundImage && cs.backgroundImage !== "none";
          // A translucent fill cannot be exported as declared: bg-white/10
          // would become solid white and hide the light text sitting on it.
          // Sample the blended pixel instead. Gradients and images are sampled
          // for the same reason.
          const fill =
            bg && bg.alpha >= 0.95 ? bg.hex : (bg && bg.alpha > 0.05) || painted ? SAMPLE : null;
          if (fill) {
            const box = rel(rect);
            shapes.push({
              ...box,
              fill,
              radius: parseFloat(cs.borderTopLeftRadius) / Math.max(rect.width, 1),
              // Centre of the element, in device pixels, for sampling.
              sampleX: Math.round(rect.left - base.left + rect.width / 2),
              sampleY: Math.round(rect.top - base.top + rect.height / 2),
            });
          }

          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text && el.children.length === 0) {
            const px = parseFloat(cs.fontSize) || 16;
            const weight = parseInt(cs.fontWeight, 10) || 400;
            const align =
              cs.textAlign === "center" ? "center" : cs.textAlign === "right" ? "right" : "left";
            texts.push({
              ...rel(rect),
              text,
              // 1280px maps to a 10in / 720pt wide slide.
              fontSize: Math.max(8, Math.round(px * (720 / w))),
              bold: weight >= 600,
              italic: cs.fontStyle === "italic",
              color: toHex(cs.color) ?? "111111",
              align,
            });
          }
        }

        const canvasBg = toHex(getComputedStyle(canvas).backgroundColor);
        const bodyBg = toHex(getComputedStyle(document.body).backgroundColor);
        return { shapes, texts, background: canvasBg ?? bodyBg ?? "FFFFFF" };
      },
      { w: SLIDE_WIDTH, h: SLIDE_HEIGHT },
    );

    if (!layout) throw new Error("slide document has no canvas to read");

    const raw = layout as SlideLayout & {
      shapes: (LayoutShape & { sampleX: number; sampleY: number })[];
    };

    // Resolve any fill we could not read from computed styles by sampling the
    // pixel that was actually painted. This is syntax-proof: gradients, oklch,
    // colour-mix and blend modes all resolve to a real colour on screen.
    const needsSampling = raw.shapes.some((sh) => sh.fill === "SAMPLE");
    if (needsSampling) {
      const png = (await page.screenshot({ type: "png" })) as Buffer;
      const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });

      const pixelAt = (x: number, y: number): string => {
        const cx = Math.max(0, Math.min(info.width - 1, x));
        const cy = Math.max(0, Math.min(info.height - 1, y));
        const i = (cy * info.width + cx) * info.channels;
        return [data[i], data[i + 1], data[i + 2]]
          .map((c) => c.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase();
      };

      for (const shape of raw.shapes) {
        if (shape.fill === "SAMPLE") shape.fill = pixelAt(shape.sampleX, shape.sampleY);
      }
    }

    return {
      background: raw.background,
      shapes: raw.shapes.map(({ x, y, w, h, fill, radius }) => ({ x, y, w, h, fill, radius })),
      texts: raw.texts,
    };
  });
}
