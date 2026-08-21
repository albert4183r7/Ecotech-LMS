// ============================================
// Verification sweep
//
// Runs the invariants this codebase actually depends on, against the real
// modules — no mocks, no network. Kept as a script rather than a test suite
// because the project has no test runner configured; `npm run verify` is the
// entry point and it exits non-zero on any failure.
//
// Paths are relative to the project root, so run it from there.
// ============================================

import { repairPlan, PresentationPlanSchema } from "../src/lib/presentation-plan";
import { writeField, editableFields } from "../src/lib/slides/content-path";
import { renderSlideContent } from "../src/lib/slides/render";
import { sanitizeHtml, wrapSlideHtml } from "../src/lib/sanitize";
import { checkMechanically } from "../src/lib/quiz/validator";
import { repairQuiz, DraftQuizSchema } from "../src/lib/quiz/schema";
import { templateFor, SLIDE_TEMPLATES } from "../src/lib/slides/template";
import { readLessonTemplateId } from "../src/lib/slides/lesson-template";
import { safeFileName } from "../src/lib/download";
import type { SlideContent } from "../src/lib/slides/content-schema";
import type { LessonSource } from "../src/lib/quiz/lesson-source";

const checks: [string, () => boolean][] = [];
const add = (n: string, f: () => boolean) => checks.push([n, f]);

add("outline repair fixes an over-long subtopic", () => {
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    sections: [
      {
        title: "Section",
        summary: "x".repeat(30),
        subtopics: ["ok point here", "A. ".padEnd(200, "long clause text ")],
        slideBudget: 2,
      },
    ],
  };
  const out = repairPlan(structuredClone(plan)) as typeof plan;
  return (
    PresentationPlanSchema.safeParse(out).success &&
    out.sections[0].subtopics.every((t) => t.length <= 160)
  );
});
add("outline repair leaves valid plans alone", () => {
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    sections: [
      {
        title: "Section",
        summary: "y".repeat(40),
        subtopics: ["point one here", "point two here"],
        slideBudget: 2,
      },
    ],
  };
  return (repairPlan(structuredClone(plan)) as typeof plan).sections[0].subtopics.length === 2;
});
add("every template resolves and is 16:9", () =>
  SLIDE_TEMPLATES.every((t) => Math.abs(t.deck.widthIn / t.deck.heightIn - 16 / 9) < 0.01),
);
add("unknown template id falls back to Ecotech", () => templateFor("nope").id === "ecotech");
add(
  "lesson template read from stored outline",
  () =>
    readLessonTemplateId(JSON.stringify({ style: "tech" })) === "tech" &&
    readLessonTemplateId(null) === "ecotech",
);

const concept: SlideContent = {
  type: "concept",
  title: "A title that is long enough",
  lead: "A lead sentence that is definitely long enough to pass.",
  points: [
    { heading: "One", description: "A description long enough to pass." },
    { heading: "Two", description: "Another description long enough here." },
  ],
};

add("editing a field changes only that field", () => {
  const r = writeField(concept, "points.0.heading", "Renamed");
  return (
    r.ok &&
    r.content.type === "concept" &&
    r.content.points[0].heading === "Renamed" &&
    r.content.points[1].heading === "Two" &&
    r.content.lead === concept.lead &&
    r.content.title === concept.title
  );
});
add(
  "an invalid edit is refused before storage",
  () => writeField(concept, "points.0.heading", "x").ok === false,
);
add("every editable field is addressable in the render", () => {
  const html = sanitizeHtml(renderSlideContent(concept, { templateId: "ecotech" }));
  return editableFields(concept).every((f) => html.includes(`data-path="${f.path}"`));
});
add("template geometry survives sanitising", () => {
  // The renderer positions boxes with inline style; the sanitiser must filter
  // those declarations rather than delete them, or every slide renders stacked
  // at the top-left corner.
  const html = sanitizeHtml(renderSlideContent(concept, { templateId: "ecotech", slideNumber: 2 }));
  return /style="[^"]*left:/.test(html) && /style="[^"]*font-size:/.test(html);
});
add("dangerous css declarations are still stripped", () => {
  const out = sanitizeHtml(
    '<div style="left:5%;background:url(javascript:alert(1));width:expression(x)">x</div>',
  );
  return /left:5%/.test(out) && !/javascript:|expression\(|url\(/i.test(out);
});
add("slides carry the template layout they were drawn with", () => {
  const html = renderSlideContent(concept, { templateId: "ecotech" });
  return /data-layout="cards"/.test(html);
});
add(
  "script inside svg is stripped",
  () => !/script/i.test(sanitizeHtml("<svg><script>alert(1)</script></svg>")),
);
add("template vars written into the slide document", () =>
  wrapSlideHtml("<div></div>", { templateId: "ecotech" }).includes("--tpl-accent: #43699F"),
);

const source: LessonSource = {
  lessonId: "l",
  lessonTitle: "L",
  slideCount: 4,
  text: "The check stage scores the result against the goal before the next iteration begins.",
};
const opt = (t: string, c = false) => ({ text: t, isCorrect: c });
add(
  "a grounded question is accepted",
  () =>
    checkMechanically(
      {
        prompt: "Which stage scores the result?",
        options: [opt("Observe"), opt("Plan"), opt("Check", true), opt("Act")],
        sourceQuote: "The check stage scores the result against the goal",
      },
      source,
    ) === null,
);
add(
  "a question quoting another lesson is rejected",
  () =>
    checkMechanically(
      {
        prompt: "What does RAG add?",
        options: [opt("A vector index", true), opt("A planner"), opt("A cache"), opt("A queue")],
        sourceQuote:
          "Retrieval-augmented generation grounds answers in an external corpus entirely.",
      },
      source,
    ) !== null,
);
add(
  "two correct options are rejected",
  () =>
    checkMechanically(
      {
        prompt: "Which stage scores?",
        options: [opt("Observe"), opt("Check", true), opt("Act", true), opt("Plan")],
        sourceQuote: "The check stage scores the result against the goal",
      },
      source,
    ) !== null,
);
add("quiz repair yields exactly one correct option", () => {
  const q = {
    title: "A quiz title",
    questions: [0, 1, 2].map((i) => ({
      prompt: `A prompt long enough ${i}`,
      sourceQuote: "A quote long enough",
      options: [opt("a"), opt("b"), opt("c"), opt("d")],
    })),
  };
  const r = DraftQuizSchema.safeParse(repairQuiz(structuredClone(q)));
  return (
    r.success && r.data.questions.every((x) => x.options.filter((o) => o.isCorrect).length === 1)
  );
});
add(
  "filenames are slugged safely",
  () => safeFileName("Lesson 1: Agents & Tools!") === "lesson-1-agents-tools",
);
add("all nine slide types render in all templates", () => {
  const all: SlideContent[] = [
    { type: "title", title: "T", subtitle: "A subtitle here" },
    concept,
    {
      type: "comparison",
      title: "C",
      columns: [
        { heading: "A", points: ["one point here", "two points here"] },
        { heading: "B", points: ["three points here", "four points here"] },
      ],
    },
    {
      type: "process",
      title: "P",
      steps: [
        { label: "A", description: "does a thing" },
        { label: "B", description: "does another" },
        { label: "C", description: "does a third" },
      ],
    },
    { type: "architecture", title: "A", nodes: [{ label: "A" }, { label: "B" }, { label: "C" }] },
    {
      type: "caseStudy",
      title: "CS",
      situation: "x".repeat(25),
      problem: "y".repeat(25),
      action: "z".repeat(25),
      outcome: "w".repeat(25),
    },
    {
      type: "data",
      title: "D",
      stats: [
        { value: "1", label: "one" },
        { value: "2", label: "two" },
      ],
    },
    { type: "summary", title: "S", takeaways: ["a".repeat(20), "b".repeat(20), "c".repeat(20)] },
    { type: "closing", title: "End" },
  ];
  return all.every((c) =>
    SLIDE_TEMPLATES.every((t) => renderSlideContent(c, { templateId: t.id }).length > 100),
  );
});

let pass = 0,
  fail = 0;
for (const [name, fn] of checks) {
  let ok = false;
  try {
    ok = fn();
  } catch (e) {
    console.log("   threw:", e instanceof Error ? e.message : e);
  }
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
