import { renderSlideContent } from "./src/lib/slides/render";
import { sanitizeHtml } from "./src/lib/sanitize";
import { editableFields } from "./src/lib/slides/content-path";
import type { SlideContent } from "./src/lib/slides/content-schema";

const samples: SlideContent[] = [
  { type: "title", eyebrow: "Module 1", title: "AI Agents", subtitle: "How they plan and act reliably." },
  { type: "concept", title: "Planning", lead: "An agent decomposes a goal before acting on it here.",
    points: [{ heading: "Decompose", description: "The goal is split into checkable steps.", icon: "layers" },
             { heading: "Act", description: "Each step calls a tool and records the result.", icon: "bot" }] },
  { type: "comparison", title: "A vs B",
    columns: [{ heading: "Assistant", points: ["Answers one prompt.", "Holds no goal."] },
              { heading: "Agent", points: ["Pursues a goal.", "Chooses its tools."] }] },
  { type: "process", title: "Loop",
    steps: [{ label: "Observe", description: "Read the state." }, { label: "Act", description: "Call the tool." },
            { label: "Check", description: "Score the result." }] },
  { type: "architecture", title: "Runtime",
    nodes: [{ label: "Prompt", description: "The task." }, { label: "Planner", description: "Chooses." },
            { label: "Tools", description: "Act." }] },
  { type: "caseStudy", title: "Case", situation: "A regional operator balanced supply by hand.",
    problem: "Forecasts arrived far too late to act upon.", action: "An agent pulled forecasts hourly for them.",
    outcome: "Operators reviewed a plan instead of writing." },
  { type: "data", title: "Impact", stats: [{ value: "40%", label: "Less review", note: "Across the pilot" }, { value: "3x", label: "Faster" }] },
  { type: "summary", title: "Takeaways", takeaways: ["An agent pursues a goal, not one answer.", "Every step is checked before the next.", "Tools let it change anything at all."] },
  { type: "closing", title: "Questions?", subtitle: "Thanks for listening today." },
];

let allOk = true;
for (const content of samples) {
  const html = sanitizeHtml(renderSlideContent(content, { templateId: "ecotech" }));
  const rendered = new Set([...html.matchAll(/data-path="([^"]+)"/g)].map((m) => m[1]));
  const expected = editableFields(content).map((f) => f.path);
  const missing = expected.filter((p) => !rendered.has(p));
  const extra = [...rendered].filter((p) => !expected.includes(p));
  const ok = missing.length === 0 && extra.length === 0;
  if (!ok) allOk = false;
  console.log(
    `${content.type.padEnd(13)} fields=${String(expected.length).padStart(2)} rendered=${String(rendered.size).padStart(2)} ${ok ? "match" : `MISSING ${missing} EXTRA ${extra}`}`,
  );
}
console.log(allOk ? "\nevery editable field is addressable in the rendered slide" : "\nMISMATCH");
