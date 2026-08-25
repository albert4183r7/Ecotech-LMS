// ============================================
// Composition shots
//
// Renders the arrangements the canvas rules describe — a cover, a row of
// cards, a numbered flow, a two-column contrast, a statement — and
// screenshots each one, so a composed slide can be checked against the
// template by eye rather than by reading fractions.
//
// It also reports anything drawn outside the canvas or overlapping, which is
// the same measurement the composer is handed back between its two passes.
//
//   QA_OUT=/tmp/shots npx tsx scripts/composition-shots.mts
// ============================================

import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import { renderComposition } from "../src/lib/slides/composition-render";
import { resolveComposition } from "../src/lib/slides/composition-resolve";
import { sanitizeHtml, wrapSlideHtml } from "../src/lib/sanitize";
import type { SlideComposition } from "../src/lib/slides/composition";

const OUT = process.env.QA_OUT ?? ".";

const text = (
  x: number,
  y: number,
  w: number,
  h: number,
  body: string,
  role: "display" | "title" | "heading" | "body" | "small" | "eyebrow" | "metric",
  extra: { ink?: string; align?: string } = {},
) =>
  ({
    kind: "text",
    x,
    y,
    w,
    h,
    text: body,
    role,
    ...extra,
  }) as SlideComposition["elements"][number];

const deck: SlideComposition[] = [
  {
    layoutNote: "cover: gradient band under a display title",
    elements: [
      { kind: "band", x: 0.045, y: 0.055, w: 0.91, h: 0.14, fill: "gradient" },
      text(0.075, 0.09, 0.6, 0.07, "ECOTECH TRAINING", "eyebrow", { ink: "featureBody" }),
      text(0.045, 0.34, 0.72, 0.22, "AI Agents at Work", "display"),
      text(
        0.045,
        0.6,
        0.62,
        0.12,
        "What an agent is, what it can reach, and where it goes wrong — for the people who will use one.",
        "body",
      ),
      { kind: "card", x: 0.79, y: 0.34, w: 0.165, h: 0.29, fill: "accentSoft" },
      { kind: "icon", x: 0.835, y: 0.41, w: 0.075, h: 0.13, icon: "bot" },
    ],
  },
  {
    layoutNote: "three cards, each with an icon chip",
    elements: [
      text(0.045, 0.07, 0.5, 0.05, "01 · ANATOMY", "eyebrow"),
      text(0.045, 0.115, 0.75, 0.09, "The three parts of an agent", "title"),
      text(
        0.045,
        0.215,
        0.72,
        0.06,
        "A model to decide, tools to act with, and a loop that runs until the job is done.",
        "body",
      ),
      { kind: "card", x: 0.045, y: 0.32, w: 0.27, h: 0.44, fill: "panel" },
      { kind: "chip", x: 0.075, y: 0.36, w: 0.06, h: 0.107, fill: "accentSoft", icon: "brain" },
      text(0.075, 0.5, 0.21, 0.06, "The model", "heading"),
      text(
        0.075,
        0.575,
        0.21,
        0.155,
        "Reads the situation and picks the next move. It decides; it does not act.",
        "body",
      ),
      { kind: "card", x: 0.365, y: 0.32, w: 0.27, h: 0.44, fill: "panel" },
      { kind: "chip", x: 0.395, y: 0.36, w: 0.06, h: 0.107, fill: "accentSoft", icon: "settings" },
      text(0.395, 0.5, 0.21, 0.06, "The tools", "heading"),
      text(
        0.395,
        0.575,
        0.21,
        0.155,
        "Search, a database, an email client. Each is a function the model may call by name.",
        "body",
      ),
      { kind: "card", x: 0.685, y: 0.32, w: 0.27, h: 0.44, fill: "panel" },
      { kind: "chip", x: 0.715, y: 0.36, w: 0.06, h: 0.107, fill: "accentSoft", icon: "refresh" },
      text(0.715, 0.5, 0.21, 0.06, "The loop", "heading"),
      text(
        0.715,
        0.575,
        0.21,
        0.155,
        "Act, read the result, decide again — until the goal is met or a limit stops it.",
        "body",
      ),
    ],
  },
  {
    layoutNote: "four-step flow, chips and arrows",
    elements: [
      text(0.045, 0.07, 0.5, 0.05, "02 · THE LOOP", "eyebrow"),
      text(0.045, 0.115, 0.75, 0.09, "One turn, step by step", "title"),
      { kind: "card", x: 0.045, y: 0.34, w: 0.2125, h: 0.34, fill: "panel" },
      { kind: "chip", x: 0.1215, y: 0.375, w: 0.06, h: 0.107, fill: "accent", text: "1" },
      text(0.06, 0.51, 0.1825, 0.06, "Goal", "heading", { align: "center" }),
      text(0.06, 0.575, 0.1825, 0.09, "A request arrives in plain words.", "body", {
        align: "center",
      }),
      { kind: "arrow", x: 0.2605, y: 0.47, w: 0.014, h: 0.06, direction: "right" },
      { kind: "card", x: 0.2775, y: 0.34, w: 0.2125, h: 0.34, fill: "panel" },
      { kind: "chip", x: 0.354, y: 0.375, w: 0.06, h: 0.107, fill: "accent", text: "2" },
      text(0.2925, 0.51, 0.1825, 0.06, "Plan", "heading", { align: "center" }),
      text(0.2925, 0.575, 0.1825, 0.09, "The model picks the next tool to call.", "body", {
        align: "center",
      }),
      { kind: "arrow", x: 0.493, y: 0.47, w: 0.014, h: 0.06, direction: "right" },
      { kind: "card", x: 0.51, y: 0.34, w: 0.2125, h: 0.34, fill: "panel" },
      { kind: "chip", x: 0.5865, y: 0.375, w: 0.06, h: 0.107, fill: "accent", text: "3" },
      text(0.525, 0.51, 0.1825, 0.06, "Act", "heading", { align: "center" }),
      text(0.525, 0.575, 0.1825, 0.09, "The tool runs and returns a result.", "body", {
        align: "center",
      }),
      { kind: "arrow", x: 0.7255, y: 0.47, w: 0.014, h: 0.06, direction: "right" },
      { kind: "card", x: 0.7425, y: 0.34, w: 0.2125, h: 0.34, fill: "panel" },
      { kind: "chip", x: 0.819, y: 0.375, w: 0.06, h: 0.107, fill: "accent", text: "4" },
      text(0.7575, 0.51, 0.1825, 0.06, "Check", "heading", { align: "center" }),
      text(0.7575, 0.575, 0.1825, 0.09, "Done, or round the loop again.", "body", {
        align: "center",
      }),
      { kind: "band", x: 0.045, y: 0.79, w: 0.91, h: 0.08, fill: "gradient" },
      text(
        0.075,
        0.807,
        0.85,
        0.05,
        "The loop is the mechanism: one pass is a chatbot, many passes is an agent.",
        "body",
        { ink: "featureBody" },
      ),
    ],
  },
  {
    layoutNote: "two-column contrast",
    elements: [
      text(0.045, 0.07, 0.5, 0.05, "03 · TELLING THEM APART", "eyebrow"),
      text(0.045, 0.115, 0.75, 0.09, "Assistant or agent?", "title"),
      { kind: "card", x: 0.045, y: 0.28, w: 0.44, h: 0.46, fill: "panel" },
      { kind: "chip", x: 0.075, y: 0.32, w: 0.06, h: 0.107, fill: "accentSoft", icon: "info" },
      text(0.075, 0.46, 0.38, 0.06, "An assistant answers", "heading"),
      text(
        0.075,
        0.53,
        0.38,
        0.18,
        "You ask, it replies, the turn ends. Nothing happens in any other system, and nothing is checked.",
        "body",
      ),
      { kind: "card", x: 0.515, y: 0.28, w: 0.44, h: 0.46, fill: "accentSoft" },
      { kind: "chip", x: 0.545, y: 0.32, w: 0.06, h: 0.107, fill: "accent", icon: "zap" },
      text(0.545, 0.46, 0.38, 0.06, "An agent finishes the job", "heading"),
      text(
        0.545,
        0.53,
        0.38,
        0.18,
        "It calls tools, reads what came back, and keeps going until the outcome exists — a booked seat, a filed ticket.",
        "body",
      ),
    ],
  },
  {
    layoutNote: "statement with a metric",
    elements: [
      text(0.045, 0.07, 0.5, 0.05, "04 · WHERE IT GOES WRONG", "eyebrow"),
      text(0.045, 0.115, 0.8, 0.09, "A tool it cannot reach is a tool it will invent", "title"),
      { kind: "card", x: 0.045, y: 0.33, w: 0.42, h: 0.38, fill: "panel" },
      text(0.075, 0.38, 0.36, 0.12, "1 in 3", "metric"),
      text(
        0.075,
        0.51,
        0.36,
        0.16,
        "Failures in early pilots come from a tool description the model read differently than its author meant.",
        "body",
      ),
      { kind: "card", x: 0.495, y: 0.33, w: 0.46, h: 0.38, fill: "surfaceAlt" },
      text(0.525, 0.38, 0.4, 0.06, "What to do about it", "heading"),
      text(
        0.525,
        0.45,
        0.4,
        0.22,
        "Write each tool's description as if for a new colleague: what it does, what it needs, and when not to use it. Then watch the first hundred calls.",
        "body",
      ),
    ],
  },
];

const css = await readFile("public/slide-runtime.css", "utf8");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const [i, composition] of deck.entries()) {
  const n = i + 1;
  const { warnings } = resolveComposition(composition);
  const html = wrapSlideHtml(sanitizeHtml(renderComposition(composition, { slideNumber: n })), {
    title: `Slide ${n}`,
  });
  await page.setContent(
    html.replace('<link rel="stylesheet" href="/slide-runtime.css" />', `<style>${css}</style>`),
    { waitUntil: "load" },
  );
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/composed-${String(n).padStart(2, "0")}.png` });

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
    `  slide ${n}  ${(composition.layoutNote ?? "").padEnd(38)} ` +
      `${clipped.length ? "CLIPPED " + clipped.join("; ") : "clean"}` +
      `${warnings.length ? `  ${warnings.length} warning(s): ${warnings[0]}` : ""}`,
  );
}

await browser.close();
