import { renderSlideContent } from "./src/lib/slides/render";
import type { SlideContent } from "./src/lib/slides/content-schema";
import { sanitizeHtml, wrapSlideHtml } from "./src/lib/sanitize";
import { renderSlide, closeRenderer } from "./src/lib/render/slide-renderer";
import { writeFileSync } from "node:fs";

const OUT = process.env.OUT!;
const samples: [string, SlideContent][] = [
  ["title", { type: "title", eyebrow: "Module 1", title: "AI Agents in Practice", subtitle: "How autonomous systems plan, act and check their own work." }],
  ["concept", { type: "concept", title: "What makes an agent", lead: "An agent decomposes a goal before acting on it.",
    points: [
      { heading: "Decompose", description: "The goal is split into steps that can each be checked.", icon: "layers" },
      { heading: "Act", description: "Each step calls a tool and records what came back.", icon: "bot" },
      { heading: "Evaluate", description: "The result is scored before the next step begins.", icon: "target" },
      { heading: "Revise", description: "A failed check sends the plan back for another pass.", icon: "refresh" },
    ] }],
  ["data", { type: "data", title: "Measured impact",
    stats: [{ value: "40%", label: "Less manual review", icon: "trendDown" }, { value: "3x", label: "Faster turnaround", icon: "zap" }, { value: "12", label: "Tools available", icon: "grid" }] }],
];

for (const [name, content] of samples) {
  const html = wrapSlideHtml(sanitizeHtml(renderSlideContent(content, { templateId: "ecotech" })), {
    title: name, templateId: "ecotech",
  });
  if (name === "title") {
    console.log("template vars present:", /--tpl-accent:\s*#43699F/i.test(html), "| font:", /--tpl-font-heading:\s*Cambria/i.test(html));
  }
  const { png, faults, fillRatio } = await renderSlide(html, { deviceScaleFactor: 1 });
  writeFileSync(`${OUT}/tpl-${name}.png`, png);
  console.log(`${name.padEnd(9)} fill=${(fillRatio * 100).toFixed(0)}%  faults=${faults.length ? JSON.stringify(faults) : "none"}`);
}
await closeRenderer();
