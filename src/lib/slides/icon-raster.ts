import sharp from "sharp";
import { resolveIcon } from "./icons";

// ============================================
// Icons in the exported deck
//
// On screen an icon is inline SVG. PowerPoint will not take that: pptxgenjs
// places pictures, and a stroke-only SVG has to be a raster before it can be
// placed. Without this the exporter drew a tinted disc where each icon sat,
// which is why a deck full of icon chips arrived in PowerPoint as a deck full
// of empty circles.
//
// Rasterised at four times the drawn size so the glyph stays crisp when the
// deck is projected, and cached, because a twelve-slide deck asks for the same
// handful of glyphs over and over.
// ============================================

const cache = new Map<string, Promise<string | null>>();

/** The drawn size in inches → pixels, at the density a projector deserves. */
function pixelsFor(widthIn: number): number {
  return Math.min(512, Math.max(96, Math.round(widthIn * 96 * 4)));
}

/**
 * One icon as a base64 PNG, in the colour it is drawn in.
 *
 * Returns null if rasterising fails — a missing glyph is better than a failed
 * export, and the caller draws its holder either way.
 */
export async function iconPng(
  name: string | undefined,
  colourHex: string,
  widthIn: number,
  context = "",
): Promise<string | null> {
  const px = pixelsFor(widthIn);
  const key = `${name ?? "-"}|${context.slice(0, 24)}|${colourHex}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}" ` +
    `fill="none" stroke="#${colourHex}" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round">${resolveIcon(name, context)}</svg>`;

  const raster = sharp(Buffer.from(svg))
    .png()
    .toBuffer()
    .then((png) => `image/png;base64,${png.toString("base64")}`)
    .catch((error) => {
      cache.delete(key);
      console.warn(
        `[icon-raster] could not rasterise "${name}":`,
        error instanceof Error ? error.message : error,
      );
      return null;
    });
  // Cache the in-flight work, not only its result, so parallel deck preparation
  // rasterises a repeated glyph once.
  cache.set(key, raster);
  return raster;
}
