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

import {
  repairPlan,
  PresentationPlanSchema,
  balancePlan,
  buildSlideSlots,
} from "../src/lib/presentation-plan";
import { draftToContent } from "../src/lib/slides/draft";
import { SLIDE_CRAFT, SLIDE_EXEMPLARS, PLAN_EXEMPLAR } from "../src/lib/slides/craft";
import { writeField, editableFields } from "../src/lib/slides/content-path";
import { renderSlideContent } from "../src/lib/slides/render";
import { sanitizeHtml, wrapSlideHtml } from "../src/lib/sanitize";
import { checkMechanically } from "../src/lib/quiz/validator";
import {
  repairQuiz,
  DraftQuizSchema,
  questionCountFor,
  MIN_QUIZ_QUESTIONS,
  MAX_QUIZ_QUESTIONS,
} from "../src/lib/quiz/schema";
import * as templateModule from "../src/lib/slides/template";
import { SLIDE_TEMPLATE } from "../src/lib/slides/template";
import { GRADIENT_SENTINEL } from "../src/lib/slides/pptx-gradient";
import { LAYOUTS, capacityOf } from "../src/lib/slides/template-layouts";
import { resolveSlide } from "../src/lib/slides/resolve";
import {
  buildLessonContext,
  buildSystemPrompt,
  MAX_LESSON_CHARS,
} from "../src/lib/assistant/lesson-tutor";
import type { LessonSource } from "../src/lib/quiz/lesson-source";
import { TASK_MODELS, modelFor, isMultimodal, type AiTask } from "../src/lib/ai/models";
import { throwFriendlyError } from "../src/lib/ai/provider";
import { safeFileName } from "../src/lib/download";
import type { SlideContent } from "../src/lib/slides/content-schema";
import {
  FILL_ROLES,
  INK_ROLES,
  TEXT_ROLES,
  SlideCompositionSchema,
  compositionTitle,
  isComposition,
  type SlideComposition,
} from "../src/lib/slides/composition";
import { resolveComposition, pointSizeFor } from "../src/lib/slides/composition-resolve";
import { reviewComposition } from "../src/lib/slides/composition-generate";
import { renderComposition } from "../src/lib/slides/composition-render";
import { readCompositionField, writeCompositionField } from "../src/lib/slides/composition-path";
import { parseSlideDoc, slideDocText } from "../src/lib/slides/document";
import { readFileSync } from "node:fs";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { importPptx } from "../src/lib/slides/import/pptx";
import { parseXml, find, findAll, textOf } from "../src/lib/slides/import/xml";
import { buildClassroomState } from "../src/lib/classroom";
import { deterministicEdgeNarration, narrationSourceHash } from "../src/lib/video/narration";

const checks: [string, () => boolean | Promise<boolean>][] = [];
const add = (n: string, f: () => boolean | Promise<boolean>) => checks.push([n, f]);

add("classroom keeps a ready narrated lesson", () => {
  const video = {
    id: "video-1",
    status: "READY" as const,
    voice: "af_heart",
    language: "english",
    error: null,
    scenes: [
      {
        id: "scene-1",
        slideId: "slide-1",
        order: 0,
        narration: "A grounded explanation for the visible slide.",
        caption: "A grounded explanation for the visible slide.",
        audioUrl: "/uploads/audio/lesson-1/1.mp3",
        durationMs: null,
        status: "READY" as const,
        error: null,
      },
    ],
  };
  const state = buildClassroomState({
    courseId: "course-1",
    courseTitle: "Course",
    lessonId: "lesson-1",
    lessonTitle: "Lesson",
    video,
    slides: [{ id: "slide-1", title: "Slide", htmlBody: "<p>Text</p>", order: 0 }],
    allLessonIds: ["lesson-1"],
  });
  return state.video === video && state.video.scenes[0].audioUrl?.endsWith("1.mp3") === true;
});

add("narration source hash changes with slide content", () => {
  const base = { id: "slide-1", title: "Energy", text: "Solar output is variable." };
  return (
    narrationSourceHash(base) !==
    narrationSourceHash({ ...base, text: "Solar output varies with available light." })
  );
});

add("cover narration uses only its visible title", () => {
  const narration = deterministicEdgeNarration(
    { title: "AI Agents", text: "AI Agents A practical introduction" },
    0,
    3,
    "english",
  );
  return narration === "AI Agents.";
});

add("a thank-you closing cannot inherit earlier lesson points", () => {
  const narration = deterministicEdgeNarration(
    {
      title: "谢谢 Thank You",
      text: "谢谢 Thank You Happy learning, Enjoy learning! Global Ecotech Systems Pte. Ltd.",
    },
    2,
    3,
    "english",
  );
  return (
    narration === "Thank you. Happy learning! Enjoy learning!" &&
    !narration.includes("stopping rule")
  );
});

add(
  "an ordinary final teaching slide keeps its generated narration",
  () =>
    deterministicEdgeNarration(
      { title: "Key findings", text: "Solar output changes with available light." },
      2,
      3,
      "english",
    ) === null,
);

add("outline repair fixes an over-long subtopic", () => {
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    audience: "People who have met the subject once and now have to use it",
    thesis: "The subject is one mechanism, and its failures all come from that mechanism",
    outcomes: ["Name the parts of it", "Say which part a failure came from"],
    sections: [
      {
        title: "Section",
        claim: "This part asserts something specific about the subject",
        vehicle: "One worked example carried through the section",
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
    audience: "People who have met the subject once and now have to use it",
    thesis: "The subject is one mechanism, and its failures all come from that mechanism",
    outcomes: ["Name the parts of it", "Say which part a failure came from"],
    sections: [
      {
        title: "Section",
        claim: "This part asserts something specific about the subject",
        vehicle: "One worked example carried through the section",
        summary: "y".repeat(40),
        subtopics: ["point one here", "point two here"],
        slideBudget: 2,
      },
    ],
  };
  return (repairPlan(structuredClone(plan)) as typeof plan).sections[0].subtopics.length === 2;
});
// ── The plan has to carry an argument, not just a table of contents ──

add("a section without a claim is rejected", () => {
  // The whole point of the field: a plan that only lists topics cannot
  // validate, so genericness fails at the schema rather than at review.
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    audience: "People who have met the subject once and now have to use it",
    thesis: "The subject is one mechanism, and its failures come from that mechanism",
    outcomes: ["Name the parts of it", "Say which part a failure came from"],
    sections: [
      {
        title: "Section",
        vehicle: "One worked example carried through the section",
        summary: "y".repeat(40),
        subtopics: ["point one here", "point two here"],
        slideBudget: 2,
      },
    ],
  };
  return !PresentationPlanSchema.safeParse(plan).success;
});

add("a deck is a cover, a contents slide, one slide per section, and a closing", () => {
  // Two slides of one section were written from the same summary and the same
  // claim, so they came out saying the same thing twice. One section is one
  // slide now, and the deck's furniture carries no section's points.
  const section = (title: string, subtopics: string[]) => ({
    title,
    claim: "This part asserts something specific about the subject",
    vehicle: "One worked example carried through the section",
    summary: "y".repeat(40),
    subtopics,
    slideTitles: [`A real title for ${title}`],
    slideBudget: 1,
  });
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    audience: "People who have met the subject once and now have to use it",
    thesis: "The subject is one mechanism, and its failures come from that mechanism",
    outcomes: ["Name the parts of it", "Say which part a failure came from"],
    sections: [
      section("One", ["first", "second", "third"]),
      section("Two", ["fourth", "fifth"]),
      section("Three", ["sixth", "seventh"]),
      section("Four", ["eighth", "ninth"]),
    ],
  };
  const balanced = balancePlan(PresentationPlanSchema.parse(plan), 7);
  const slots = buildSlideSlots(balanced);

  return (
    balanced.sections.length === 4 &&
    balanced.totalSlides === 7 &&
    slots.length === 7 &&
    slots.map((s) => s.role).join() === "cover,contents,content,content,content,content,closing" &&
    // The contents slide lists the sections; the cover and closing carry none.
    slots[1].subtopics.join() === "One,Two,Three,Four" &&
    slots[0].subtopics.length === 0 &&
    slots[6].subtopics.length === 0 &&
    // Every section's points land on exactly one slide, whole.
    slots[2].subtopics.join() === "first,second,third" &&
    slots[3].subtopics.join() === "fourth,fifth" &&
    // and the planner's own title reaches the slot, rather than "Section (1/2)"
    slots[2].title === "A real title for One"
  );
});

add("a plan with too few sections is split rather than padded", () => {
  const plan = {
    title: "A plan title",
    subtitle: "A plan subtitle",
    audience: "People who have met the subject once and now have to use it",
    thesis: "The subject is one mechanism, and its failures come from that mechanism",
    outcomes: ["Name the parts of it", "Say which part a failure came from"],
    sections: [
      {
        title: "The only section",
        claim: "This part asserts something specific about the subject",
        vehicle: "One worked example carried through the section",
        summary: "y".repeat(40),
        subtopics: ["first", "second", "third", "fourth"],
        slideTitles: ["A real first title", "A real second title"],
        slideBudget: 1,
      },
    ],
  };
  const balanced = balancePlan(PresentationPlanSchema.parse(plan), 4);
  const slots = buildSlideSlots(balanced);
  return (
    balanced.sections.length === 2 &&
    balanced.totalSlides === 4 &&
    // Split at the halfway point, taking the planner's own slide titles.
    balanced.sections[0].title === "A real first title" &&
    balanced.sections[0].subtopics.join() === "first,second" &&
    balanced.sections[1].subtopics.join() === "third,fourth" &&
    // Short deck: no contents slide, because there is nothing to list.
    slots.map((s) => s.role).join() === "cover,content,content,closing"
  );
});

add("the craft guide reaches the writer, and the plan exemplar the planner", () => {
  // Describing depth produces a longer definition; showing a shallow slide
  // beside the deep version of it produces the deep one. If the exemplars
  // stop being wired in, the prompts still read fine and the output quietly
  // regresses — which is exactly the failure worth a check.
  const craft = [SLIDE_CRAFT, SLIDE_EXEMPLARS, PLAN_EXEMPLAR];
  return (
    craft.every((text) => text.length > 400) &&
    // each carries a worked pair, not just advice about writing one
    SLIDE_EXEMPLARS.includes("As a definition list") &&
    SLIDE_EXEMPLARS.includes("As training:") &&
    // and the plan exemplar carries the arc a training lesson follows
    PLAN_EXEMPLAR.includes("THE SHAPE OF A TRAINING LESSON") &&
    PLAN_EXEMPLAR.includes("claim:") &&
    PLAN_EXEMPLAR.includes("vehicle:")
  );
});

add("overflowing text never spins the fitter", () => {
  // The fitter shrinks type until the text fits. Its exit test used to compare
  // a rounded size against an unrounded floor, and at 15pt and 17pt — a card
  // heading, a process step label — the rounding goes up and the comparison
  // can never be true. Any slide whose text overflowed one of those boxes hung
  // the Node process in a spin: no response, no log, no interrupt.
  //
  // Every box in every layout, with text far past what it can hold. A
  // regression here does not fail this check, it hangs it — which is the
  // honest signal, since that is exactly what it does in production.
  const overflowing = "extremely long ".repeat(60);

  for (const definition of LAYOUTS) {
    for (const count of [definition.capacity.min, definition.capacity.max]) {
      for (const hasTakeaway of [false, true]) {
        const layout = definition.build(count, { hasLead: true, hasTakeaway });
        for (const placeholder of layout.placeholders) {
          // capacityOf is the same measurement the fitter shrinks against, so
          // a box that cannot hold the string is one the fitter must resolve.
          if (capacityOf(placeholder).maxChars >= overflowing.length) continue;
          const drawn = resolveSlide(
            {
              type: "concept",
              title: overflowing,
              lead: overflowing,
              takeaway: overflowing.slice(0, 110),
              points: [
                { heading: overflowing, description: overflowing },
                { heading: overflowing, description: overflowing },
              ],
            } as SlideContent,
            { slideNumber: 2 },
          );
          if (drawn.boxes.length === 0) return false;
          break;
        }
      }
    }
  }
  return true;
});

add("a takeaway reaches the slide's band", () => {
  const html = renderSlideContent({
    type: "concept",
    title: "A slide with a point",
    points: [
      { heading: "First", description: "Something substantial said about the first part." },
      { heading: "Second", description: "Something substantial said about the second part." },
    ],
    takeaway: "This is the line the band at the foot of the slide carries.",
  } as SlideContent);
  return html.includes('data-path="takeaway"') && html.includes("the band at the foot");
});

add("thin blocks are dropped rather than padded with filler", () => {
  // "— explained on this slide." used to be appended to short blocks to reach
  // the schema's minimum, and reached real decks.
  const content = draftToContent({
    type: "concept",
    title: "A slide title",
    blocks: [{ heading: "One", body: "ok" }, { heading: "Two" }],
  });
  return !JSON.stringify(content).includes("explained on this slide");
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

const contentsSlide: SlideContent = {
  type: "contents",
  eyebrow: "Course map",
  title: "What we will build",
  sections: ["Foundations", "Applied workflow", "Review and next steps"],
};

const customSlide: SlideContent = {
  type: "custom",
  eyebrow: "Core idea",
  title: "One mechanism deserves the full canvas",
  heading: "Feedback changes the next decision",
  description:
    "A useful feedback loop does more than report an outcome: it changes the next action, then measures whether that change improved the result.",
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
add("contents reuses the Ecotech numbered-list layout directly", () => {
  const resolved = resolveSlide(contentsSlide, { slideNumber: 2 });
  return (
    resolved.layoutId === "agenda" &&
    contentsSlide.sections.every((section) => resolved.boxes.some((box) => box.text === section))
  );
});
add("every layout is either an exact template slide or the guarded Ecotech fallback", () => {
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
  return LAYOUTS.every((layout) => fromTemplate.has(layout.id) || layout.id === "editorial");
});
add("the derived editorial layout stays inside the Ecotech design grammar", () => {
  const resolved = resolveSlide(customSlide, { slideNumber: 4 });
  const paletteRoles = new Set(["panel", "surface", "accent", "accentSoft", "heading", "gradient", "none"]);
  const measuredType = new Set([10, 12, 12.5, 13, 13.5, 15, 18, 30, 44, 48, 54]);
  return (
    resolved.layoutId === "editorial" &&
    resolved.panels.every((panel) => paletteRoles.has(panel.fill)) &&
    resolved.boxes.every(
      (box) =>
        box.x >= 0.041 &&
        box.y >= 0.055 &&
        box.x + box.w <= 0.96 &&
        box.y + box.h <= 0.98 &&
        measuredType.has(box.fontPt),
    )
  );
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
add("no task claims to need a capability the registry cannot describe", () => {
  // Nothing sends images or calls tools since the agent runtime was removed.
  // If a task starts doing either, it has to say so here first.
  return (Object.keys(TASK_MODELS) as AiTask[]).every((t) => !isMultimodal(t));
});
add("an environment variable overrides a task's model", () => {
  const before = modelFor("lesson-tutor");
  process.env.MODEL_LESSON_TUTOR = "mistral:7b-instruct";
  const after = modelFor("lesson-tutor");
  delete process.env.MODEL_LESSON_TUTOR;
  return before !== after && after === "mistral:7b-instruct" && modelFor("lesson-tutor") === before;
});

// ── Provider error classification ───────────────────────────────────────────
//
// The classifier decides what an operator is told to go and fix, and getting it
// wrong sends them somewhere the problem is not. A proxy refusing to open a
// tunnel answers 403 exactly as a rejected key does; that used to be reported
// as "check that ECOAPI_API_KEY is set and valid", which is the wrong place to
// look and an expensive place to spend an afternoon.

/** The bracketed label throwFriendlyError puts at the front of its message. */
function classify(err: unknown): string {
  try {
    throwFriendlyError(err, "verify", "outline-planning");
  } catch (thrown) {
    return /^\[([^\]]+)\]/.exec((thrown as Error).message)?.[1] ?? "(no label)";
  }
  return "(did not throw)";
}

const withStatus = (status: number, message: string) =>
  Object.assign(new Error(message), { status });

add("a blocked proxy tunnel is a network failure, not a bad key", () => {
  return (
    classify(withStatus(403, "Connection error: 403 response to CONNECT host:443")) ===
      "LLM Network Error" &&
    classify(new Error("tunneling socket could not be established")) === "LLM Network Error"
  );
});

add("an unreachable gateway is still a network failure", () => {
  return (
    classify(new Error("getaddrinfo ENOTFOUND gateway.example")) === "LLM Network Error" &&
    classify(new Error("connect ECONNREFUSED 127.0.0.1:443")) === "LLM Network Error" &&
    classify(new Error("unable to verify the first certificate")) === "LLM Network Error"
  );
});

add("a rejected key is still an auth failure", () => {
  return (
    classify(withStatus(401, "Unauthorized")) === "LLM Auth Error" &&
    classify(withStatus(403, "Invalid API key provided")) === "LLM Auth Error" &&
    classify(withStatus(403, "You do not have permission for this model")) === "LLM Auth Error"
  );
});

add("a 403 that says nothing admits it could be either", () => {
  const message = (() => {
    try {
      throwFriendlyError(withStatus(403, "Forbidden"), "verify", "outline-planning");
    } catch (thrown) {
      return (thrown as Error).message;
    }
    return "";
  })();
  // Naming one cause would be a guess; the message has to name both and give
  // the reader a way to separate them.
  return (
    message.startsWith("[LLM Blocked]") &&
    /key is not accepted/.test(message) &&
    /refused the request/.test(message) &&
    /curl/.test(message)
  );
});

add("counting tokens is not a credential problem", () => {
  // "maximum context length is 8192 tokens" contains the word token, which an
  // over-eager credentials pattern matched.
  return (
    classify(new Error("This model's maximum context length is 8192 tokens")) ===
    "LLM Context Error"
  );
});

add("quota and unknown-model failures keep their own labels", () => {
  return (
    classify(withStatus(429, "Too Many Requests")) === "LLM Rate Limited" &&
    classify(new Error("insufficient balance")) === "LLM Rate Limited" &&
    classify(withStatus(404, "model not found")) === "LLM Model Error"
  );
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
// A lesson written in Chinese, which is where the old term extraction gave up:
// it split on anything outside a-z0-9, so a Chinese lesson produced no terms at
// all and its quotes could not be compared to it.
const cjkSource: LessonSource = {
  lessonId: "l2",
  lessonTitle: "AI 智能体",
  slideCount: 4,
  text: "智能体由三部分组成：大脑是语言模型，双手是工具，编排是循环。没有循环就不会自我纠正。",
};

add("a question grounded in a Chinese lesson is accepted", () => {
  return (
    checkMechanically(
      {
        prompt: "智能体的“双手”指的是什么？",
        options: [opt("工具", true), opt("语言模型"), opt("循环"), opt("数据库")],
        sourceQuote: "智能体由三部分组成：大脑是语言模型，双手是工具",
      },
      cjkSource,
    ) === null
  );
});

add("a question quoting something the Chinese lesson never says is rejected", () => {
  return (
    checkMechanically(
      {
        prompt: "本课如何描述向量数据库的分片策略？",
        options: [opt("按租户分片", true), opt("按时间"), opt("按地区"), opt("不分片")],
        sourceQuote: "向量数据库的分片策略应当按照租户来划分，以便隔离不同客户的数据。",
      },
      cjkSource,
    ) !== null
  );
});

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
add("the instructor's question count is honoured, and clamped", () => {
  return (
    questionCountFor(12, 9) === 9 &&
    questionCountFor(12, 99) === MAX_QUIZ_QUESTIONS &&
    questionCountFor(12, 1) === MIN_QUIZ_QUESTIONS &&
    // No number given: scaled to the lesson, as before.
    questionCountFor(10) === 6
  );
});

add("a quiz of more than eight questions still validates", () => {
  // The draft schema capped questions at eight, so asking for nine failed
  // validation rather than producing nine.
  const question = (n: number) => ({
    prompt: `A question about the lesson, number ${n} of the set`,
    options: [
      { text: "The right answer", isCorrect: true },
      { text: "A wrong answer", isCorrect: false },
      { text: "Another wrong answer", isCorrect: false },
      { text: "A fourth choice", isCorrect: false },
    ],
    sourceQuote: "A sentence from the lesson that supports it.",
  });
  const many = {
    title: "A quiz title",
    questions: Array.from({ length: 12 }, (_, i) => question(i)),
  };
  const one = { title: "A quiz title", questions: [question(1)] };
  return DraftQuizSchema.safeParse(many).success && DraftQuizSchema.safeParse(one).success;
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

// ── Composed slides ─────────────────────────────────────────────────────────
//
// The model lays a slide out and names roles; the template supplies every
// value. These are the invariants that keeps honest: the roles all resolve,
// the measurement corrects what it must and says so, and the markup survives
// the sanitiser with its colours intact — the failure that would otherwise
// ship a slide of black text on white.

/** A three-card slide, composed the way the canvas rules describe. */
const composition: SlideComposition = {
  layoutNote: "three cards",
  elements: [
    { kind: "text", x: 0.045, y: 0.07, w: 0.4, h: 0.05, text: "SECTION ONE", role: "eyebrow" },
    { kind: "text", x: 0.045, y: 0.11, w: 0.7, h: 0.09, text: "What an agent is", role: "title" },
    { kind: "card", x: 0.045, y: 0.3, w: 0.27, h: 0.42, fill: "panel" },
    { kind: "chip", x: 0.07, y: 0.34, w: 0.05, h: 0.09, fill: "accent", text: "1" },
    {
      kind: "text",
      x: 0.07,
      y: 0.46,
      w: 0.22,
      h: 0.07,
      text: "The model",
      role: "heading",
    },
    {
      kind: "text",
      x: 0.07,
      y: 0.54,
      w: 0.22,
      h: 0.14,
      text: "Decides what to do next, one step at a time.",
      role: "body",
    },
    { kind: "arrow", x: 0.325, y: 0.48, w: 0.035, h: 0.06, direction: "right" },
    { kind: "card", x: 0.365, y: 0.3, w: 0.27, h: 0.42, fill: "panel" },
    { kind: "icon", x: 0.39, y: 0.34, w: 0.05, h: 0.09, icon: "settings" },
    {
      kind: "text",
      x: 0.39,
      y: 0.46,
      w: 0.22,
      h: 0.07,
      text: "The tools",
      role: "heading",
    },
    { kind: "band", x: 0.045, y: 0.79, w: 0.91, h: 0.08, fill: "gradient" },
    {
      kind: "text",
      x: 0.07,
      y: 0.805,
      w: 0.86,
      h: 0.05,
      text: "An agent is a loop, not a single answer.",
      role: "body",
      ink: "featureBody",
    },
  ],
};

add("a composition validates against its own schema", () => {
  return SlideCompositionSchema.safeParse(composition).success && isComposition(composition);
});

add("every fill and ink role has a class in the slide stylesheet", () => {
  // The source sheet, not the compiled one: public/slide-runtime.css is a
  // build product and is not in the repository.
  const css = readFileSync("src/styles/slide-runtime.css", "utf8");
  const html = renderComposition(
    {
      elements: [
        ...FILL_ROLES.filter((f) => f !== "none").map((fill, i) => ({
          kind: "card" as const,
          x: 0.05,
          y: 0.06 + i * 0.02,
          w: 0.1,
          h: 0.02,
          fill,
        })),
        ...INK_ROLES.map((ink, i) => ({
          kind: "text" as const,
          x: 0.5,
          y: 0.06 + i * 0.02,
          w: 0.2,
          h: 0.02,
          text: `ink ${ink}`,
          role: "small" as const,
          ink,
        })),
      ],
    },
    {},
  );
  // Every class the renderer emitted must be one the stylesheet defines,
  // or the slide draws in the browser's own colours.
  const classes = [...html.matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter((c) => c.startsWith("tpl-"));
  return classes.length > 0 && classes.every((c) => css.includes(`.${c}`));
});

add("every text role resolves to a point size from the template's scale", () => {
  return TEXT_ROLES.every((role) => {
    const size = pointSizeFor(role);
    return Number.isFinite(size) && size >= 10 && size <= 60;
  });
});

add("a composed slide survives the sanitiser with its geometry and colour", () => {
  const html = sanitizeHtml(renderComposition(composition, { slideNumber: 3 }));
  return (
    html.includes("tpl-fill-gradient") &&
    html.includes("tpl-panel") &&
    html.includes("tpl-feature-body") &&
    /left:4\.500%/.test(html) &&
    html.includes('data-path="elements.1.text"') &&
    html.includes("<svg")
  );
});

add("the resolver moves an off-slide element back on and says so", () => {
  const { elements, warnings } = resolveComposition({
    elements: [
      { kind: "card", x: 0.92, y: 0.5, w: 0.3, h: 0.2, fill: "panel" },
      ...composition.elements.slice(0, 2),
    ],
  });
  return (
    warnings.length > 0 &&
    elements[0].x + elements[0].w <= 0.9551 &&
    elements[0].y + elements[0].h <= 0.9251
  );
});

add("text too long for its box is cut at a word and reported", () => {
  const { elements, warnings } = resolveComposition({
    elements: [
      {
        kind: "text",
        x: 0.05,
        y: 0.3,
        w: 0.2,
        h: 0.05,
        text: "This sentence is far longer than the box it was given and has to be cut somewhere sensible rather than run past the edge of the card it sits on.",
        role: "body",
      },
    ],
  });
  const drawn = elements[0].text ?? "";
  return (
    elements[0].truncated === true &&
    drawn.endsWith("\u2026") &&
    !drawn.includes("edge of the card") &&
    warnings.some((w) => w.includes("did not fit"))
  );
});

add("two text boxes printing over each other are reported", () => {
  const { warnings } = resolveComposition({
    elements: [
      { kind: "text", x: 0.1, y: 0.3, w: 0.3, h: 0.1, text: "First run of text", role: "body" },
      { kind: "text", x: 0.12, y: 0.31, w: 0.3, h: 0.1, text: "Second run of text", role: "body" },
    ],
  });
  return warnings.some((w) => w.includes("overlap"));
});

add("ink that cannot be read on what it sits on is corrected", () => {
  const { elements, warnings, faults } = resolveComposition({
    elements: [
      { kind: "band", x: 0.045, y: 0.79, w: 0.91, h: 0.08, fill: "gradient" },
      {
        kind: "text",
        x: 0.07,
        y: 0.805,
        w: 0.86,
        h: 0.05,
        text: "Navy type on the navy band is invisible",
        role: "heading",
        ink: "heading",
      },
      // Mint on pale mint: the number in the chip disappears.
      {
        kind: "chip",
        x: 0.5,
        y: 0.4,
        w: 0.05,
        h: 0.09,
        fill: "accentSoft",
        text: "1",
        ink: "accent",
      },
    ],
  });
  const band = elements[1];
  const chip = elements[2];
  return (
    faults.recoloured === 2 &&
    (band.ink === "featureHeading" || band.ink === "onAccent") &&
    (chip.ink === "heading" || chip.ink === "iconInk") &&
    warnings.some((w) => w.includes("unreadable"))
  );
});

add("a slide carrying a document's worth of text is sent back", () => {
  const wordy = {
    elements: Array.from({ length: 6 }, (_, i) => ({
      kind: "text" as const,
      x: 0.05,
      y: 0.1 + i * 0.12,
      w: 0.4,
      h: 0.1,
      role: "body" as const,
      text: `Point ${i + 1}. ${"word ".repeat(24)}`.trim(),
    })),
  };
  const faults = reviewComposition(wordy, []);
  return faults.some((f) => /carries \d+ words/.test(f));
});

add("a composition's title and text are readable without its markup", () => {
  const doc = parseSlideDoc(JSON.stringify(composition));
  return (
    doc?.kind === "composition" &&
    compositionTitle(composition) === "What an agent is" &&
    slideDocText(doc).includes("An agent is a loop")
  );
});

add("typed content still parses as typed content", () => {
  const doc = parseSlideDoc(JSON.stringify({ type: "closing", title: "End" }));
  return doc?.kind === "content" && doc.content.type === "closing";
});

add("editing one text run of a composition leaves the rest alone", () => {
  const field = readCompositionField(composition, "elements.4.text");
  const written = writeCompositionField(composition, "elements.4.text", "The reasoning model");
  if (!written.ok || field?.value !== "The model") return false;
  const before = composition.elements.map((e) => (e.kind === "text" ? e.text : e.kind));
  const after = written.composition.elements.map((e) => (e.kind === "text" ? e.text : e.kind));
  return (
    after[4] === "The reasoning model" &&
    before.filter((_, i) => i !== 4).join("|") === after.filter((_, i) => i !== 4).join("|")
  );
});

add("an edit past the role's limit is refused", () => {
  const written = writeCompositionField(composition, "elements.1.text", "x".repeat(200));
  const missing = writeCompositionField(composition, "elements.2.text", "a card is not text");
  return !written.ok && !missing.ok;
});

// ── Uploaded decks ──────────────────────────────────────────────────────────
//
// A deck someone already has should become a lesson without being rewritten.
// The round trip below is the real one: a deck is written with pptxgenjs, read
// back through the importer, and checked for the things a reader would notice
// if they were lost — the words, where they sit, and the colours.

add("the XML reader keeps elements, attributes and text", () => {
  const doc = parseXml(
    `<?xml version="1.0"?><p:sp><p:nvSpPr><p:ph type="title" idx="1"/></p:nvSpPr>` +
      `<a:p><a:r><a:t>Hello &amp; welcome</a:t></a:r><a:r><a:t> again</a:t></a:r></a:p>` +
      `<a:empty/></p:sp>`,
  );
  const sp = find(doc, "p:sp");
  const ph = find(doc, "p:ph");
  return (
    sp !== null &&
    ph?.attrs.type === "title" &&
    ph?.attrs.idx === "1" &&
    findAll(doc, "a:t").length === 2 &&
    textOf(find(doc, "a:p")!) === "Hello & welcome again"
  );
});

let importedDeck: Awaited<ReturnType<typeof importPptx>> | null = null;

add("a real .pptx imports with its text, geometry and colour intact", async () => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "TEST", width: 13.333, height: 7.5 });
  pptx.layout = "TEST";

  const one = pptx.addSlide();
  one.addText("Quarterly Safety Briefing", {
    x: 0.6,
    y: 0.8,
    w: 8,
    h: 1,
    fontSize: 36,
    bold: true,
    color: "43699F",
  });
  one.addText("What changed this quarter", { x: 0.6, y: 2, w: 8, h: 0.6, fontSize: 18 });

  const two = pptx.addSlide();
  two.addShape("roundRect", { x: 0.6, y: 2, w: 3.5, h: 2.5, fill: { color: "F3F8F6" } });
  two.addText("Report it the same day", { x: 0.8, y: 2.4, w: 3, h: 0.8, fontSize: 16 });
  // A screened-back decorative circle, as every deck puts in its corners.
  two.addShape("ellipse", {
    x: 9,
    y: -1,
    w: 5,
    h: 5,
    fill: { color: "7BBBA6", transparency: 85 },
  });

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  importedDeck = await importPptx(buffer, {
    saveMedia: async (name) => `/uploads/test/${name}`,
  });

  const [first, second] = importedDeck.slides;
  return (
    importedDeck.slides.length === 2 &&
    first.text.includes("Quarterly Safety Briefing") &&
    first.title === "Quarterly Safety Briefing" &&
    // 0.6in into a 13.333in slide is 4.5% across, and the navy survives.
    /left:4\.500%/.test(first.html) &&
    first.html.includes("#43699F") &&
    second.text.includes("Report it the same day") &&
    second.html.includes("#F3F8F6") &&
    second.html.includes("border-radius")
  );
});

add("a screened-back shape imports screened back", () => {
  if (!importedDeck) return false;
  // The alpha lives on the colour element, not on the fill around it. Reading
  // the fill for one finds nothing, and every faint corner circle in a deck
  // imports as a solid slab.
  const html = importedDeck.slides[1].html;
  const match = /rgba\(123,\s*187,\s*166,\s*([\d.]+)\)/.exec(html);
  if (!match) return false;
  const alpha = Number(match[1]);
  return alpha > 0.1 && alpha < 0.2;
});

add("a slide hidden in PowerPoint is not imported", async () => {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "TEST2", width: 13.333, height: 7.5 });
  pptx.layout = "TEST2";
  for (const title of ["Shown one", "Hidden one", "Shown two"]) {
    pptx.addSlide().addText(title, { x: 1, y: 1, w: 6, h: 1, fontSize: 28 });
  }

  // pptxgenjs writes no hidden flag, so the second slide is marked hidden the
  // way PowerPoint does it — show="0" on the slide element itself.
  const written = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  const zip = await JSZip.loadAsync(written);
  const target = "ppt/slides/slide2.xml";
  const xml = await zip.file(target)!.async("string");
  zip.file(target, xml.replace("<p:sld ", '<p:sld show="0" '));
  const withHidden = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  const deck = await importPptx(withHidden, { saveMedia: async (n) => `/uploads/test/${n}` });
  return (
    deck.hidden === 1 &&
    deck.slides.length === 2 &&
    deck.slides.every((slide) => !slide.text.includes("Hidden one")) &&
    deck.slides[1].text.includes("Shown two")
  );
});

add("an imported slide survives the sanitiser with its colours", () => {
  if (!importedDeck) return false;
  const clean = sanitizeHtml(importedDeck.slides[0].html);
  return clean.includes("#43699F") && /left:4\.500%/.test(clean) && clean.includes("font-size");
});

add("a file that is not a presentation is refused, not half-imported", async () => {
  try {
    await importPptx(Buffer.from("this is not a zip at all"), {
      saveMedia: async () => "/nowhere",
    });
    return false;
  } catch {
    return true;
  }
});

add("the toaster that is mounted is the one every screen writes to", () => {
  // Screens report through sonner's `toast()`. The root layout used to mount
  // the shadcn/Radix Toaster instead, which reads a store nothing writes to,
  // so every message in the app — including the reason an action was refused
  // — went nowhere and the button looked broken.
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const mountsSonner = /import \{ Toaster \} from "@\/components\/ui\/sonner"/.test(layout);
  const rendered = /<Toaster[\s/>]/.test(layout);
  return mountsSonner && rendered;
});

let pass = 0,
  fail = 0;
for (const [name, fn] of checks) {
  let ok = false;
  try {
    ok = await fn();
  } catch (e) {
    console.log("   threw:", e instanceof Error ? e.message : e);
  }
  console.log(`${ok ? "  ok  " : "FAIL  "} ${name}`);
  if (ok) pass++;
  else fail++;
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
