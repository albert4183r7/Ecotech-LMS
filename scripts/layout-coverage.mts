// Every content type, at every size its schema permits, must resolve into a
// layout that shows all of its items. A layout claiming to support a type
// whose field names it does not address renders blank, which is how the
// architecture slides were empty.
import { resolveSlide } from "/home/user/Ecotech-LMS/src/lib/slides/resolve";
import { itemCountOf } from "/home/user/Ecotech-LMS/src/lib/slides/layout-select";
import type { SlideContent } from "/home/user/Ecotech-LMS/src/lib/slides/content-schema";

const P = (n: number, f: (i: number) => unknown) => Array.from({ length: n }, (_, i) => f(i));
const build = (type: SlideContent["type"], n: number): SlideContent => {
  switch (type) {
    case "title": return { type, title: "Title here", subtitle: "A subtitle that is long enough" };
    case "closing": return { type, title: "The end", subtitle: "Thanks for listening" };
    case "concept": return { type, title: "T", lead: "A lead sentence of sufficient length ok",
      points: P(n, (i) => ({ heading: `Heading ${i}`, description: `Description number ${i} here.` })) as never };
    case "comparison": return { type, title: "T",
      columns: P(n, (i) => ({ heading: `Col ${i}`, points: ["first point here", "second point here"] })) as never };
    case "process": return { type, title: "T",
      steps: P(n, (i) => ({ label: `Step ${i}`, description: `What happens at stage ${i}.` })) as never };
    case "architecture": return { type, title: "T",
      nodes: P(n, (i) => ({ label: `Node ${i}`, description: `What node ${i} does here.` })) as never };
    case "data": return { type, title: "T",
      stats: P(n, (i) => ({ value: `${i}0%`, label: `Metric ${i}` })) as never };
    case "summary": return { type, title: "T", takeaways: P(n, (i) => `Takeaway number ${i} stated fully.`) as never };
    case "caseStudy": return { type, title: "T", situation: "s".repeat(30), problem: "p".repeat(30), action: "a".repeat(30), outcome: "o".repeat(30) };
  }
};

const RANGES: [SlideContent["type"], number, number][] = [
  ["title",1,1],["closing",1,1],["concept",2,5],["comparison",2,3],
  ["process",3,6],["architecture",3,6],["data",2,4],["summary",3,6],["caseStudy",4,4],
];

let fail = 0;
for (const [type, lo, hi] of RANGES) {
  for (let n = lo; n <= hi; n++) {
    const content = build(type, n);
    const r = resolveSlide(content, { slideNumber: 1 });
    const items = itemCountOf(content);
    // How many of the slide's items produced at least one visible box.
    const shown = new Set(
      r.boxes.map((b) => b.path.match(/^(?:points|columns|steps|nodes|stats|takeaways)\.(\d+)/)?.[1])
        .filter((v): v is string => v !== undefined),
    ).size;
    const expected = ["title","closing","caseStudy"].includes(type) ? 0 : items;
    const ok = shown === expected && r.warnings.length === 0;
    if (!ok) { fail++; console.log(`FAIL ${type} x${n} -> layout=${r.layoutId} boxes=${r.boxes.length} itemsShown=${shown}/${expected} warnings=${JSON.stringify(r.warnings)}`); }
    else console.log(`  ok ${type.padEnd(13)} x${n} -> ${r.layoutId.padEnd(13)} ${r.boxes.length} boxes`);
  }
}
console.log(fail === 0 ? "\nevery type renders every item at every permitted size" : `\n${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
