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
import { addCompositionSlide } from "../src/lib/slides/composition-pptx";
import type { SlideComposition } from "../src/lib/slides/composition";
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

/** A composed slide, drawn shape by shape rather than poured into a layout. */
const composed: SlideComposition = {
  layoutNote: "three-step flow",
  elements: [
    { kind: "text", x: 0.045, y: 0.07, w: 0.4, h: 0.05, text: "03 · THE LOOP", role: "eyebrow" },
    {
      kind: "text",
      x: 0.045,
      y: 0.11,
      w: 0.7,
      h: 0.09,
      text: "How a step is taken",
      role: "title",
    },
    { kind: "card", x: 0.045, y: 0.32, w: 0.27, h: 0.36, fill: "panel" },
    { kind: "chip", x: 0.07, y: 0.36, w: 0.05, h: 0.09, fill: "accent", text: "1" },
    { kind: "text", x: 0.07, y: 0.48, w: 0.22, h: 0.07, text: "Observe", role: "heading" },
    {
      kind: "text",
      x: 0.07,
      y: 0.56,
      w: 0.22,
      h: 0.1,
      text: "Read what came back from the last step.",
      role: "body",
    },
    { kind: "arrow", x: 0.325, y: 0.47, w: 0.035, h: 0.06, direction: "right" },
    { kind: "card", x: 0.365, y: 0.32, w: 0.27, h: 0.36, fill: "panel" },
    { kind: "chip", x: 0.39, y: 0.36, w: 0.05, h: 0.09, fill: "accent", text: "2" },
    { kind: "text", x: 0.39, y: 0.48, w: 0.22, h: 0.07, text: "Decide", role: "heading" },
    { kind: "band", x: 0.045, y: 0.78, w: 0.91, h: 0.08, fill: "gradient" },
    {
      kind: "text",
      x: 0.07,
      y: 0.795,
      w: 0.86,
      h: 0.05,
      text: "The loop is the mechanism; one pass is not an agent.",
      role: "body",
      ink: "featureBody",
    },
  ],
};

const pptx = new PptxGenJS();
applyTemplateLayout(pptx, SLIDE_TEMPLATE);
deck.forEach((c, i) => addContentSlide(pptx, c, SLIDE_TEMPLATE, { slideNumber: i + 1 }));
// Both slide models go into one file: the export has to draw either.
addCompositionSlide(pptx, composed, SLIDE_TEMPLATE, { slideNumber: deck.length + 1 });
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

// The composed slide, which draws its own shapes rather than filling a layout.
check(
  "a composed slide's gradient band is a real gradient too",
  grads >= 2,
  `${grads} gradFill(s) across both slide models`,
);
check(
  "a composed connector is a PowerPoint arrow, not a picture of one",
  xml.includes('prst="rightArrow"'),
);
check("a composed chip is a circle", (xml.match(/prst="ellipse"/g)?.length ?? 0) > 0);

console.log(fail === 0 ? "\ndeck matches the template" : `\n${fail} mismatch(es)`);
process.exit(fail === 0 ? 0 : 1);
