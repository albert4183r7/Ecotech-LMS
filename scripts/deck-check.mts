/**
 * Builds a deck from the template's own layouts and checks the written file
 * against the .pptx it is meant to reproduce: gradient fills, corner radii,
 * outlines, fonts and colours. Geometry parity is scripts/parity.mts; this is
 * about everything the OOXML carries that fractions do not.
 *
 *   npx tsx scripts/deck-check.mts [out.pptx]
 */
import { writeFileSync } from "node:fs";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { addContentSlide, applyTemplateLayout } from "../src/lib/slides/pptx";
import { applyGradients, GRADIENT_SENTINEL } from "../src/lib/slides/pptx-gradient";
import { SLIDE_TEMPLATE } from "../src/lib/slides/template";
import type { SlideContent } from "../src/lib/slides/content-schema";

const point = (h: string, d: string) => ({ heading: h, description: d });
const deck: SlideContent[] = [
  {
    type: "title",
    eyebrow: "Module 01",
    title: "Introduction to Logical Reasoning",
    subtitle: "What deductive and inductive arguments are, and how to tell them apart.",
  },
  {
    type: "concept",
    eyebrow: "02 · Foundations",
    title: "Three Ways to Frame an Argument",
    lead: "Each starts from different evidence.",
    points: [
      point("Deductive", "General premises to a conclusion that must follow."),
      point("Inductive", "Generalises from observations to a probable rule."),
      point("Abductive", "Selects the explanation that best fits."),
    ],
  },
  {
    type: "data",
    eyebrow: "05 · Impact",
    title: "Why Reasoning Matters",
    lead: "Structured reasoning shows up directly in how students perform.",
    stats: [
      { value: "3.5x", label: "Faster problem solving" },
      { value: "-40%", label: "Fewer errors" },
      { value: "92%", label: "Retention" },
      { value: "24/7", label: "Applies outside class" },
    ],
  },
  { type: "closing", title: "Thank You", subtitle: "Questions welcome." },
];

const pptx = new PptxGenJS();
applyTemplateLayout(pptx, SLIDE_TEMPLATE);
deck.forEach((c, i) => addContentSlide(pptx, c, SLIDE_TEMPLATE, { slideNumber: i + 1 }));
const written = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
const buffer = await applyGradients(written, SLIDE_TEMPLATE);

const out = process.argv[2];
if (out) writeFileSync(out, buffer);

const zip = await JSZip.loadAsync(buffer);
const xml = (
  await Promise.all(
    Object.keys(zip.files)
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .sort()
      .map((n) => zip.file(n)!.async("string")),
  )
).join("\n");

const p = SLIDE_TEMPLATE.palette;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fail++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
}

const grads = xml.match(/<a:gradFill/g)?.length ?? 0;
check("the takeaway band is a real gradient", grads > 0, `${grads} gradFill(s)`);
check(
  "its stops are the template's navy and mint",
  new RegExp(`<a:gs pos="0"><a:srgbClr val="${p.featureFrom}"/></a:gs>`).test(xml) &&
    new RegExp(`<a:gs pos="100000"><a:srgbClr val="${p.featureTo}"/></a:gs>`).test(xml),
  `${p.featureFrom} to ${p.featureTo}`,
);
check("no sentinel colour survives", !xml.includes(GRADIENT_SENTINEL));
check(
  "no shape carries an outline",
  !/<a:ln w="\d+">/.test(xml),
  "template uses <a:ln/> throughout",
);

// Corner radii, back-computed from the adj values pptxgenjs wrote.
const radii = [...xml.matchAll(/prst="roundRect"><a:avLst><a:gd name="adj" fmla="val (\d+)"/g)].map(
  (m) => Number(m[1]),
);
check(
  "every roundRect is rounded, none is a pill",
  radii.length > 0 && radii.every((r) => r > 0 && r < 20000),
  `adj ${Math.min(...radii)}..${Math.max(...radii)} (template: 2817..6452 on cards and bands)`,
);

check(
  "headings are the template's serif",
  xml.includes(`typeface="${SLIDE_TEMPLATE.fonts.heading}"`),
  SLIDE_TEMPLATE.fonts.heading,
);
check(
  "body is the template's sans",
  xml.includes(`typeface="${SLIDE_TEMPLATE.fonts.body}"`),
  SLIDE_TEMPLATE.fonts.body,
);
check("navy is used for headings", xml.includes(p.heading), p.heading);
check("mint is used for accents", xml.includes(p.accent), p.accent);
check("decorative circles keep their alpha", /<a:alpha val="\d+"\/>/.test(xml));

console.log(fail === 0 ? "\ndeck matches the template" : `\n${fail} mismatch(es)`);
process.exit(fail === 0 ? 0 : 1);
