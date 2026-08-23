import JSZip from "jszip";
import type { SlideTemplate } from "./template";

// ============================================
// Gradient fills in the exported deck
//
// The template fills its emphasis card and its takeaway band with a navy-to-
// mint linear gradient. pptxgenjs cannot express one: its shape API takes a
// solid colour or an image, and a rendered image would lose the vector
// crispness and the rounded corners.
//
// So the shape goes in with a sentinel colour that appears nowhere else in
// the palette, and the written file is reopened and the sentinel's
// <a:solidFill> swapped for a real <a:gradFill>. The result is a true
// PowerPoint gradient — editable, resolution-independent, and identical to
// what the web renderer paints.
// ============================================

/**
 * A colour no slide will ever legitimately contain.
 *
 * Chosen to be absent from the template palette so a straight string
 * replacement cannot touch a real fill. It is asserted in verify.mts.
 */
export const GRADIENT_SENTINEL = "FF00FE";

/** The exact XML pptxgenjs writes for a solid fill of the sentinel colour. */
const SENTINEL_FILL = `<a:solidFill><a:srgbClr val="${GRADIENT_SENTINEL}"/></a:solidFill>`;

/**
 * The template's gradient, as OOXML.
 *
 * Linear, left to right — `ang="0"` is 0°, measured clockwise from the
 * positive x-axis, which is the direction the template runs it. `scaled="0"`
 * keeps the angle true rather than skewing it to the shape's aspect ratio.
 */
function gradFill(from: string, to: string): string {
  return (
    `<a:gradFill flip="none" rotWithShape="1">` +
    `<a:gsLst>` +
    `<a:gs pos="0"><a:srgbClr val="${from}"/></a:gs>` +
    `<a:gs pos="100000"><a:srgbClr val="${to}"/></a:gs>` +
    `</a:gsLst>` +
    `<a:lin ang="0" scaled="0"/>` +
    `</a:gradFill>`
  );
}

/**
 * Replace every sentinel fill in a written deck with the real gradient.
 *
 * Operates on the package rather than on any one slide, so it covers however
 * many slides used a gradient panel. Returns the deck unchanged if none did.
 */
export async function applyGradients(
  deck: Buffer | Uint8Array,
  template: SlideTemplate,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(deck);
  const replacement = gradFill(template.palette.featureFrom, template.palette.featureTo);

  let replaced = 0;
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));

  for (const name of slides) {
    const xml = await zip.file(name)!.async("string");
    if (!xml.includes(GRADIENT_SENTINEL)) continue;
    const next = xml.split(SENTINEL_FILL).join(replacement);
    replaced += xml.split(SENTINEL_FILL).length - 1;
    zip.file(name, next);
  }

  if (replaced === 0) return Buffer.from(deck);

  // A sentinel that survived means the fill was written in a shape this does
  // not know about, and it would ship as magenta. Loud, because the whole
  // point of the sentinel is that it never reaches the reader.
  for (const name of slides) {
    const xml = await zip.file(name)!.async("string");
    if (xml.includes(GRADIENT_SENTINEL)) {
      throw new Error(
        `[pptx-gradient] ${name} still contains the sentinel colour after substitution. ` +
          `pptxgenjs likely changed how it writes solid fills.`,
      );
    }
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
