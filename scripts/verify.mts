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
import * as templateModule from "../src/lib/slides/template";
import { SLIDE_TEMPLATE } from "../src/lib/slides/template";
import { GRADIENT_SENTINEL } from "../src/lib/slides/pptx-gradient";
import { LAYOUTS } from "../src/lib/slides/template-layouts";
import {
  buildLessonContext,
  buildSystemPrompt,
  MAX_LESSON_CHARS,
} from "../src/lib/assistant/lesson-tutor";
import type { LessonSource } from "../src/lib/quiz/lesson-source";
import {
  TASK_MODELS,
  modelFor,
  isMultimodal,
  VISION_MODEL_PATTERN,
  type AiTask,
} from "../src/lib/ai/models";
import { safeFileName } from "../src/lib/download";
import type { SlideContent } from "../src/lib/slides/content-schema";

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
add(
  "the template resolves and is 16:9",
  () => Math.abs(SLIDE_TEMPLATE.deck.widthIn / SLIDE_TEMPLATE.deck.heightIn - 16 / 9) < 0.01,
);
add("there is exactly one template", () => SLIDE_TEMPLATE.id === "ecotech");
add("the gradient sentinel is not a real palette colour", () => {
  // The exported deck marks its gradient panels with this and swaps them
  // afterwards. If it ever matched a colour the template actually uses, that
  // colour's fills would silently become gradients.
  const used = Object.values(SLIDE_TEMPLATE.palette).map((c) => c.toUpperCase());
  return !used.includes(GRADIENT_SENTINEL.toUpperCase());
});
add("no template can be selected", () => {
  // The picker is gone and so is the lookup behind it: no registry, no
  // resolver, nothing that takes an id. This fails if that indirection comes
  // back, which is the only way a second design could reappear.
  const exported = Object.keys(templateModule);
  return (
    SLIDE_TEMPLATE.id === "ecotech" &&
    !exported.includes("templateFor") &&
    !exported.includes("SLIDE_TEMPLATES") &&
    !exported.includes("VALID_TEMPLATE_IDS")
  );
});

const titleSlide: SlideContent = {
  type: "title",
  eyebrow: "Module one",
  title: "Introduction to Logical Reasoning",
  subtitle: "What deductive and inductive arguments are, and how to tell them apart.",
};

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
  const html = sanitizeHtml(renderSlideContent(concept));
  return editableFields(concept).every((f) => html.includes(`data-path="${f.path}"`));
});
add("template geometry survives sanitising", () => {
  // The renderer positions boxes with inline style; the sanitiser must filter
  // those declarations rather than delete them, or every slide renders stacked
  // at the top-left corner.
  const html = sanitizeHtml(renderSlideContent(concept, { slideNumber: 2 }));
  return /style="[^"]*left:/.test(html) && /style="[^"]*font-size:/.test(html);
});
add("dangerous css declarations are still stripped", () => {
  const out = sanitizeHtml(
    '<div style="left:5%;background:url(javascript:alert(1));width:expression(x)">x</div>',
  );
  return /left:5%/.test(out) && !/javascript:|expression\(|url\(/i.test(out);
});
add("slides carry the template layout they were drawn with", () => {
  const html = renderSlideContent(concept);
  return /data-layout="options"/.test(html);
});
add("every layout is a slide that exists in the template file", () => {
  // The registry drew three layouts the .pptx does not contain. Every id here
  // names a real slide in it, so a regression that reintroduces an invented
  // layout fails rather than shipping.
  const fromTemplate = new Set([
    "title",
    "section",
    "agenda",
    "rows",
    "options",
    "comparison",
    "metrics",
    "process",
    "closing",
  ]);
  return LAYOUTS.every((l) => fromTemplate.has(l.id));
});
add("a mid-deck title becomes the template's section divider", () => {
  const first = renderSlideContent(titleSlide, { slideNumber: 1 });
  const later = renderSlideContent(titleSlide, { slideNumber: 6 });
  return /data-layout="title"/.test(first) && /data-layout="section"/.test(later);
});
add(
  "script inside svg is stripped",
  () => !/script/i.test(sanitizeHtml("<svg><script>alert(1)</script></svg>")),
);
add("template vars written into the slide document", () =>
  // The mint the template uses for eyebrows, stat values and decoration. It
  // used to be set to the navy, which is the heading colour.
  wrapSlideHtml("<div></div>", {}).includes("--tpl-accent: #7BBBA6"),
);

// ── AI task registry ────────────────────────────────────────────────────────
add("every AI task names a model and an override", () => {
  const tasks = Object.keys(TASK_MODELS) as AiTask[];
  return (
    tasks.length > 0 &&
    tasks.every((t) => {
      const e = TASK_MODELS[t];
      return Boolean(e.model && e.envVar && e.rationale.length > 40);
    })
  );
});
add("the tasks do not all share one model", () => {
  // The point of the registry: a judge and a planner should not be the same
  // model just because they are both model calls.
  const tasks = Object.keys(TASK_MODELS) as AiTask[];
  return new Set(tasks.map(modelFor)).size > 1;
});
add("the task that sends images is on a multimodal model", () => {
  // visual-evaluation posts screenshots. A text-only model here fails at
  // request time, with an error that does not say why.
  const vision = (Object.keys(TASK_MODELS) as AiTask[]).filter(isMultimodal);
  return (
    vision.length === 1 &&
    vision[0] === "visual-evaluation" &&
    VISION_MODEL_PATTERN.test(modelFor("visual-evaluation"))
  );
});
add("an environment variable overrides a task's model", () => {
  const before = modelFor("lesson-tutor");
  process.env.MODEL_LESSON_TUTOR = "mistral:7b-instruct";
  const after = modelFor("lesson-tutor");
  delete process.env.MODEL_LESSON_TUTOR;
  return before !== after && after === "mistral:7b-instruct" && modelFor("lesson-tutor") === before;
});

// ── Lesson assistant scope ──────────────────────────────────────────────────
const tutorSource: LessonSource = {
  lessonId: "lesson_1",
  lessonTitle: "Introduction to Computer Systems",
  courseId: "course_1",
  courseTitle: "Computing Foundations",
  slideCount: 3,
  slides: [
    { number: 1, title: "What a computer is", text: "A computer stores and processes data." },
    { number: 2, title: "Memory", text: "RAM holds the data a program is working on right now." },
    { number: 3, title: "Storage", text: "A disk keeps data when the power is off." },
  ],
  text: "",
};

add("the assistant sees only the lesson it was given", () => {
  const context = buildLessonContext(tutorSource, 2);
  return (
    context.includes("RAM holds the data") &&
    context.includes("A disk keeps data") &&
    !context.includes("lesson_2")
  );
});
add("the context marks the slide the learner is on", () => {
  const context = buildLessonContext(tutorSource, 2);
  const marked = context.split("\n").find((l) => l.includes("looking at this one"));
  return Boolean(marked?.includes("Slide 2"));
});
add("a long lesson keeps a window around the current slide", () => {
  // Far more material than the budget allows, with the learner in the middle:
  // what survives must surround them, not be the first N slides.
  const big: LessonSource = {
    ...tutorSource,
    slides: Array.from({ length: 60 }, (_, i) => ({
      number: i + 1,
      title: `Slide ${i + 1}`,
      text: `Body ${i + 1}. ` + "x".repeat(600),
    })),
  };
  const context = buildLessonContext(big, 30);
  return (
    context.length <= MAX_LESSON_CHARS + 400 &&
    context.includes("Body 30.") &&
    !context.includes("Body 1.") &&
    context.includes("slide(s) of this lesson are not included")
  );
});
add("the system prompt states the lesson boundary", () => {
  const prompt = buildSystemPrompt(tutorSource, buildLessonContext(tutorSource, 1));
  return (
    prompt.includes("Introduction to Computer Systems") &&
    prompt.includes("Computing Foundations") &&
    /ONLY answer using the lesson content/i.test(prompt) &&
    /do not use general world knowledge/i.test(prompt) &&
    /a different lesson/i.test(prompt) &&
    /Never invent lesson content/i.test(prompt) &&
    prompt.includes("Nothing beyond this content is available to you.")
  );
});

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
add("all nine slide types render", () => {
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
  return all.every((c) => renderSlideContent(c).length > 100);
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
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
