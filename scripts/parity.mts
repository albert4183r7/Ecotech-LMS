// The deck and the web slide must be the same slide. Both renderers consume
// resolveSlide, so parity is checked at that seam: same layout, same boxes,
// same fitted type sizes, same fractional positions.
import { resolveSlide } from "../src/lib/slides/resolve";
import { renderSlideContent } from "../src/lib/slides/render";
import { sanitizeHtml } from "../src/lib/sanitize";
import type { SlideContent } from "../src/lib/slides/content-schema";

const samples: SlideContent[] = [
  {
    type: "title",
    eyebrow: "Module 1",
    title: "AI Agents in Practice",
    subtitle: "How autonomous systems plan and act.",
  },
  {
    type: "concept",
    title: "What makes an agent",
    lead: "An agent decomposes a goal before acting.",
    points: [
      { heading: "Decompose", description: "Split the goal into checkable steps." },
      { heading: "Act", description: "Call a tool and record the result." },
      { heading: "Check", description: "Score before continuing." },
    ],
  },
  {
    type: "process",
    title: "The loop",
    steps: [
      { label: "Observe", description: "Read the state." },
      { label: "Plan", description: "Pick the action." },
      { label: "Act", description: "Call the tool." },
      { label: "Check", description: "Score it." },
    ],
  },
  {
    type: "data",
    title: "Impact",
    lead: "Reviewed across the pilot.",
    stats: [
      { value: "40%", label: "Less review" },
      { value: "3x", label: "Faster" },
    ],
  },
  {
    type: "comparison",
    title: "A vs B",
    columns: [
      { heading: "Assistant", points: ["Answers one prompt.", "Holds no goal."] },
      { heading: "Agent", points: ["Pursues a goal.", "Chooses tools."] },
    ],
  },
  {
    type: "summary",
    title: "Takeaways",
    takeaways: ["Agents pursue goals.", "Every step is checked.", "Tools change things."],
  },
  {
    type: "caseStudy",
    title: "Grid operator",
    situation: "Balanced supply by hand each morning.",
    problem: "Forecasts arrived too late to act on.",
    action: "An agent proposed a dispatch plan hourly.",
    outcome: "Operators reviewed instead of authoring.",
  },
  { type: "closing", title: "Questions?", subtitle: "Thanks for listening." },
];

let fail = 0;
for (const [i, content] of samples.entries()) {
  const r = resolveSlide(content, { slideNumber: i + 1 });
  const html = sanitizeHtml(renderSlideContent(content, { slideNumber: i + 1 }));

  // Every resolved box must appear in the HTML at its own position.
  const missing = r.boxes.filter((b) => {
    const left = `left:${(b.x * 100).toFixed(3)}%`;
    return !html.includes(left);
  });
  // And the layout the PPT renderer would use is the same object.
  const layoutInHtml = html.match(/data-layout="([^"]+)"/)?.[1];
  const ok = missing.length === 0 && layoutInHtml === r.layoutId && r.warnings.length === 0;
  if (!ok) fail++;
  console.log(
    `${ok ? "  ok  " : "FAIL  "} ${content.type.padEnd(12)} layout=${String(r.layoutId).padEnd(13)} boxes=${String(r.boxes.length).padStart(2)} ` +
      `fonts=${[...new Set(r.boxes.map((b) => b.fontPt))].sort((a, b) => b - a).join("/")}` +
      (ok
        ? ""
        : ` missing=${missing.map((m) => m.path).join(",")} htmlLayout=${layoutInHtml} warnings=${JSON.stringify(r.warnings)}`),
  );
}
console.log(
  fail === 0 ? "\nweb and PPT resolve to identical geometry" : `\n${fail} parity failures`,
);
process.exit(fail === 0 ? 0 : 1);
