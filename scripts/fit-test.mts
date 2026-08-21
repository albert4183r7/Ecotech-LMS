import { renderSlideContent } from "/home/user/Ecotech-LMS/src/lib/slides/render";
import type { SlideContent } from "/home/user/Ecotech-LMS/src/lib/slides/content-schema";
import { sanitizeHtml, wrapSlideHtml } from "/home/user/Ecotech-LMS/src/lib/sanitize";
import { renderSlide, closeRenderer } from "/home/user/Ecotech-LMS/src/lib/render/slide-renderer";
import { writeFileSync } from "node:fs";

const OUT = process.env.OUT!;
// Realistic prose padded to an exact length, so the test measures layout
// rather than the browser's inability to break an unbroken string.
const WORDS = "agent lesson slide model template content evaluate revise ground tool context prompt outline section quiz question option render layout deck export learner instructor course".split(" ");
function prose(n: number): string {
  let out = "";
  let i = 0;
  while (out.length < n) { out += (out ? " " : "") + WORDS[i++ % WORDS.length]; }
  return out.slice(0, n).replace(/\s\S*$/, "");
}

// Content at the maximum every schema field allows — the worst case the
// generator can legitimately produce.
const MAXP = prose(260);
const cases: [string, SlideContent][] = [
  ["max-concept-5", { type: "concept",
    title: prose(90),
    lead: prose(280),
    points: Array.from({ length: 5 }, (_, i) => ({
      heading: `Heading number ${i + 1} that is quite long indeed`.slice(0, 70),
      description: `Point ${i + 1}. ` + prose(250),
    })) }],
  ["max-comparison-3", { type: "comparison",
    title: prose(90), lead: prose(280),
    columns: Array.from({ length: 3 }, (_, c) => ({
      heading: `Column heading ${c + 1} long`.slice(0, 50),
      points: Array.from({ length: 5 }, (_, i) => prose(140)),
    })) }],
  ["max-process-6", { type: "process",
    title: prose(90), lead: prose(280),
    steps: Array.from({ length: 6 }, (_, i) => ({
      label: `Step label ${i + 1} which is long`.slice(0, 50),
      description: prose(200),
    })) }],
  ["max-summary-6", { type: "summary",
    title: prose(90),
    takeaways: Array.from({ length: 6 }, (_, i) => `Takeaway ${i + 1}: ` + prose(180)) }],
  ["max-architecture-6", { type: "architecture",
    title: prose(90), lead: prose(280),
    nodes: Array.from({ length: 6 }, (_, i) => ({
      label: `Node ${i + 1} label here`.slice(0, 46), description: prose(140) })) }],
  ["max-casestudy", { type: "caseStudy", title: prose(90),
    situation: prose(300), problem: prose(300), action: prose(300), outcome: prose(300) }],
  ["max-data-4", { type: "data", title: prose(90), lead: prose(280),
    stats: Array.from({ length: 4 }, (_, i) => ({ value: "3.5x", label: prose(60), note: prose(120) })) }],
  ["max-title", { type: "title", eyebrow: prose(60), title: prose(90), subtitle: prose(180) }],
];

let bad = 0;
for (const [name, content] of cases) {
  const html = wrapSlideHtml(sanitizeHtml(renderSlideContent(content, { templateId: "ecotech" })), { templateId: "ecotech" });
  const { png, faults, fillRatio } = await renderSlide(html, { deviceScaleFactor: 1 });
  writeFileSync(`${OUT}/real-${name}.png`, png);
  if (faults.length) bad++;
  console.log(`${name.padEnd(20)} fill=${String(Math.round(fillRatio*100)).padStart(3)}%  ${faults.length ? faults.map(f=>f.kind+": "+f.detail).join(" | ") : "clean"}`);
}
await closeRenderer();
console.log(bad ? `\n${bad}/${cases.length} slides FAIL at maximum content` : "\nall clean at maximum content");
