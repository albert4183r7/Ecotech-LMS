// ============================================
// Layout shots
//
// Renders one slide per template layout and screenshots it, so the layouts
// can be checked against the .pptx by eye rather than by reading fractions.
// Also reports any box drawn outside the canvas, which is the failure that
// geometry review misses.
//
//   QA_OUT=/tmp/shots npx tsx scripts/layout-shots.mts
// ============================================

import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { renderSlideContent } from "../src/lib/slides/render";
import { wrapSlideHtml } from "../src/lib/sanitize";
import type { SlideContent } from "../src/lib/slides/content-schema";

const OUT = process.env.QA_OUT ?? ".";
const point = (h: string, d: string) => ({ heading: h, description: d });

const deck: SlideContent[] = [
  {
    type: "title",
    eyebrow: "Module 01",
    title: "Introduction to Logical Reasoning",
    subtitle: "What deductive and inductive arguments are, and how to tell them apart.",
  },
  {
    type: "title",
    eyebrow: "Section 02",
    title: "Common Fallacies",
    subtitle: "The mistakes that look like reasoning but are not.",
  },
  {
    type: "concept",
    eyebrow: "02 · Foundations",
    title: "Three Ways to Frame an Argument",
    lead: "Each starts from different evidence and licenses a different kind of conclusion.",
    points: [
      point(
        "Deductive",
        "Moves from general premises to a conclusion that must follow if they hold.",
      ),
      point("Inductive", "Generalises from specific observations to a probable rule."),
      point("Abductive", "Selects the explanation that best accounts for what was observed."),
    ],
  },
  {
    type: "concept",
    eyebrow: "03 · Method",
    title: "Five Tests for a Sound Argument",
    lead: "Run every claim past these before accepting it.",
    points: [
      point("Premises true", "Each starting claim survives checking on its own."),
      point("Form valid", "The conclusion genuinely follows from the premises."),
      point("Terms stable", "No word shifts meaning between premises."),
      point("Evidence sufficient", "The sample supports the size of the claim."),
      point("Counterexamples", "No obvious case defeats the rule."),
    ],
  },
  {
    type: "comparison",
    title: "Deductive vs. Inductive",
    lead: "Two ways of reasoning, two kinds of certainty.",
    columns: [
      {
        label: "Deductive",
        points: ["Conclusion is guaranteed", "Fails if a premise is false", "Used in mathematics"],
      },
      {
        label: "Inductive",
        points: ["Conclusion is probable", "Strengthens with evidence", "Used in the sciences"],
      },
    ],
  },
  {
    type: "data",
    eyebrow: "05 · Impact",
    title: "Why Reasoning Skills Matter",
    lead: "Structured reasoning shows up directly in how well students perform.",
    stats: [
      { value: "3.5x", label: "Faster problem solving" },
      { value: "-40%", label: "Fewer errors in proofs" },
      { value: "92%", label: "Retention after a term" },
      { value: "24/7", label: "Applies outside class" },
    ],
  },
  {
    type: "process",
    eyebrow: "06 · How it works",
    title: "Four Steps to Evaluate a Claim",
    lead: "A repeatable check anyone can run.",
    steps: [
      { label: "Identify", description: "Find the conclusion the argument is driving at." },
      { label: "Separate", description: "List the premises offered in support of it." },
      { label: "Test", description: "Ask whether the conclusion follows from those premises." },
      { label: "Judge", description: "Decide whether the premises themselves hold up." },
    ],
  },
  {
    type: "summary",
    title: "What to Take Away",
    takeaways: [
      "Deduction guarantees its conclusion when the premises hold.",
      "Induction generalises and is judged by strength, not validity.",
      "A valid argument can still be unsound if a premise is false.",
      "Naming a fallacy is not the same as refuting the claim.",
    ],
  },
  {
    type: "closing",
    title: "Thank You",
    subtitle: "Questions about anything in this lesson — ask the assistant.",
  },
];

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const [i, content] of deck.entries()) {
  const n = i + 1;
  const html = wrapSlideHtml(
    renderSlideContent(content, { templateId: "ecotech", slideNumber: n }),
    {
      title: `Slide ${n}`,
      templateId: "ecotech",
    },
  );
  const css = await readFile("public/slide-runtime.css", "utf8");
  // Inlined in place of the <link>, so the document's own template block still
  // overrides the stylesheet's defaults exactly as it does in the browser.
  await page.setContent(
    html.replace('<link rel="stylesheet" href="/slide-runtime.css" />', `<style>${css}</style>`),
    { waitUntil: "load" },
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/layout-${String(n).padStart(2, "0")}.png` });
  const layout = await page.getAttribute(".tpl-slide", "data-layout");
  // Anything drawn outside the canvas is a defect, not a stylistic choice.
  const clipped = await page.evaluate(() => {
    const canvas = document.getElementById("slide-canvas")!;
    const cb = canvas.getBoundingClientRect();
    return Array.from(canvas.querySelectorAll<HTMLElement>(".tpl-box"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > cb.bottom + 1 || r.right > cb.right + 1 || r.top < cb.top - 1;
      })
      .map((el) => `${el.dataset.path}: "${(el.textContent ?? "").slice(0, 28)}"`);
  });
  console.log(
    `  slide ${n}  ${String(content.type).padEnd(11)} -> ${String(layout).padEnd(11)} ${clipped.length ? "CLIPPED " + clipped.join("; ") : "clean"}`,
  );
}
await browser.close();
