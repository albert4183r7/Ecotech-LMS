import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { db } from "@/lib/db";
import { requireCourseOwner, requireLessonOwner, AuthorizationError } from "@/lib/session";
import { generateStructuredJSON } from "@/lib/ai";
import {
  PresentationPlanSchema,
  balancePlan,
  buildSlideSlots,
  repairPlan,
  MIN_SLIDES,
  MAX_SLIDES,
  CONTENTS_FROM,
  sectionsFor,
  type PresentationPlan,
} from "@/lib/presentation-plan";
import { DEFAULT_STYLE } from "@/lib/slide-styles";
import { MAX_QUIZ_QUESTIONS, MIN_QUIZ_QUESTIONS } from "@/lib/quiz/schema";
import { PLAN_EXEMPLAR } from "@/lib/slides/craft";
import { extractTextFromFiles, selectRelevantSections } from "@/lib/extract-doc";
import {
  AI_GENERATION_RULE,
  consumeAuthenticatedRequest,
} from "@/lib/rate-limit";

// ============================================
// POST /api/lessons/generate-outline   — phase one
//
// Plans the presentation as logical sections, not as slides. The model decides
// how many sections the subject needs; the user decides how many slides they
// want. The two are reconciled without deleting anything, and the result is
// shown to the user for review before any slide content is written.
// ============================================

interface GenerateOutlineRequest {
  courseId: string;
  topic: string;
  slideCount: number;
  /** How many quiz questions to write, when the instructor named a number. */
  quizQuestionCount?: number;
  language?: string;
  existingLessonId?: string;
  referenceFileUrls?: string[];
}

const MAX_REFERENCE_CHARS = 12_000;

/** Read any uploaded reference documents, keeping the parts about the topic. */
async function loadReference(
  fileUrls: string[] | undefined,
  topic: string,
  ownerId: string,
): Promise<{
  text: string;
  sources: { file: string; charCount: number }[];
  failures: { file: string; reason: string }[];
  files: string[];
}> {
  if (!fileUrls?.length) return { text: "", sources: [], failures: [], files: [] };

  const root = path.resolve(process.cwd(), "public");
  const ownedRoot = path.resolve(root, "uploads", "docs", ownerId);
  const ownedPrefix = `${ownedRoot}${path.sep}`;
  const accepted: { url: string; filePath: string }[] = [];
  const rejected: { file: string; reason: string }[] = [];

  for (const url of [...new Set(fileUrls)]) {
    const expectedPrefix = `/uploads/docs/${ownerId}/`;
    const filePath = path.resolve(root, url.replace(/^\//, ""));
    if (!url.startsWith(expectedPrefix) || !filePath.startsWith(ownedPrefix)) {
      rejected.push({ file: url, reason: "reference file does not belong to this instructor" });
      continue;
    }
    accepted.push({ url, filePath });
  }

  const paths = accepted.map((item) => item.filePath);

  if (paths.length === 0) return { text: "", sources: [], failures: rejected, files: [] };

  try {
    const { text, sources, failures } = await extractTextFromFiles(paths);
    if (failures.length) {
      console.warn(
        `[generate-outline] ${failures.length} reference file(s) unreadable:`,
        failures.map((f) => `${f.file} (${f.reason})`).join("; "),
      );
    }
    const allFailures = [...rejected, ...failures];
    if (!text.trim()) {
      return { text: "", sources, failures: allFailures, files: accepted.map((item) => item.url) };
    }
    return {
      text: selectRelevantSections(text, topic, MAX_REFERENCE_CHARS),
      sources,
      failures: allFailures,
      files: accepted.map((item) => item.url),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[generate-outline] reference extraction failed:", reason);
    return {
      text: "",
      sources: [],
      failures: [...rejected, { file: "reference", reason }],
      files: accepted.map((item) => item.url),
    };
  }
}

/** Below this, the plan reads as though the reference had not been supplied. */
const GROUNDING_FLOOR = 0.12;

const STOPWORDS = new Set(
  (
    "the a an and or but of to in on at by for from with as is are was were be been that which than " +
    "into onto over under about this these those it its their his her you your we our they them not " +
    "can will would should could may might must have has had do does did what when where who how why"
  ).split(" "),
);

/** Distinctive words in a text: long-ish, not stopwords, lowercased. */
function distinctiveTerms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 4 && !STOPWORDS.has(w)),
  );
}

/**
 * How much of the plan's vocabulary comes from the reference.
 *
 * A crude overlap, deliberately: it only has to separate "the model read the
 * document" from "the model wrote about the topic generically", and any term
 * the plan shares with the source is evidence of the former.
 */
function measureGrounding(plan: PresentationPlan, reference: string): number {
  const sourceTerms = distinctiveTerms(reference);
  if (sourceTerms.size === 0) return 0;

  const planText = plan.sections
    .flatMap((s) => [s.title, s.summary, ...s.subtopics])
    .concat(plan.title, plan.subtitle)
    .join(" ");
  const planTerms = [...distinctiveTerms(planText)];
  if (planTerms.length === 0) return 0;

  const shared = planTerms.filter((t) => sourceTerms.has(t)).length;
  return shared / planTerms.length;
}

function buildPlannerPrompt(params: {
  topic: string;
  slideCount: number;
  language: string;
  reference: string;
  /** The course this lesson belongs to, which says who is being taught. */
  course: { title: string; description: string | null; category: string | null };
  /** The lessons already in the course, so a new one does not repeat them. */
  siblingLessons: string[];
}): string {
  const { topic, slideCount, language, reference, course, siblingLessons } = params;
  // One section per teaching slide; the cover, contents and closing are the
  // other three.
  const sectionCount = sectionsFor(slideCount);
  const hasContents = slideCount >= CONTENTS_FROM;

  return `WHAT THE USER ASKED FOR: ${topic}

THE COURSE THIS BELONGS TO: ${course.title}${
    course.description ? `\n${course.description}` : ""
  }${course.category ? `\nCategory: ${course.category}` : ""}${
    siblingLessons.length
      ? `\nOther lessons already in this course — do not repeat them:\n${siblingLessons
          .map((t) => `- ${t}`)
          .join("\n")}`
      : ""
  }

  SLIDE BUDGET: ${slideCount} slides in total — a title slide, ${
    hasContents ? "a contents slide, " : ""
  }${sectionCount} teaching slide${sectionCount === 1 ? "" : "s"}, and a closing slide.
LANGUAGE: write everything in ${language}.
${
  reference
    ? `\nSOURCE MATERIAL — this is the substance of the presentation, not background reading:\n<reference>\n${reference}\n</reference>\n\nThe sections must come out of this document. Name the specific concepts, terms,\nfigures and examples it actually uses. A plan that would read the same without\nthis document has failed. Where the document and general knowledge disagree,\nthe document wins. Do not introduce major topics it never mentions.\n`
    : "\nNo source material was supplied. Plan from established knowledge of the subject. You may name the subject's real tools, methods and terms; do not promise figures or study findings you cannot support.\n"
}
You are planning TRAINING MATERIAL: something an instructor will stand in front
of colleagues and teach from, and that the audience will use at work
afterwards. Plan it as a curriculum, not as an argument.

FIRST, DECIDE WHO THIS IS FOR AND WHAT THEY MUST COME AWAY WITH

- audience: who will sit through this, and what they already know. Infer it
  from the request and the course above. Never write "general business
  audience" or "anyone interested in the topic" — that is not an answer, and a
  lesson written for nobody in particular teaches nobody in particular.
- thesis: the one idea the whole lesson is built to leave them with, a week
  later, when the detail has faded.
- keyTerms: the real vocabulary this audience will hear other people use, and
  must be able to recognise. Be generous and be specific. For a lesson on AI
  agents that means the actual landscape — LLM, tools, function calling, the
  agent loop, RAG, vector and graph retrieval, MCP, skills and connectors,
  memory, multi-agent, guardrails, human-in-the-loop — and the equivalent list
  for whatever subject you have been given. Do not leave a standard term out
  because it seems obvious; the audience has not met it. Do not include a term
  the lesson will not actually teach.
- misconception: what this audience probably believes now that the lesson
  corrects. Leave it out if the subject genuinely has none; do not invent one.
- outcomes: two to four things they can do afterwards that they could not
  before. Actions, not feelings — "read a learning curve and say which failure
  it shows", not "understand machine learning".

THEN PLAN THE SECTIONS

Follow the arc of a training lesson, set out below. It is a conventional order
and that is a virtue: it is what a good instructor does. Depth and coverage are
what separate a good lesson from a bad one, not novelty of structure.

Cover the ground. Every term you listed in keyTerms must be taught by some
section — that is what makes this training rather than an overview. Related
terms belong together on one slide with the distinction between them made
explicit, not scattered across three.

PLAN EXACTLY ${sectionCount} SECTIONS. One section is one slide. The other ${
    slideCount - sectionCount
  } slides are ${
    hasContents
      ? "the title slide, a contents slide and a closing slide"
      : "the title slide and a closing slide"
  }, and they are written for you.

Each section must teach something the others do not. If two sections would say
the same thing in different words, they are one section — replace the other
with something the lesson is currently missing.

For each section give:
- title: what this part covers, at most 90 characters
- claim: what this section teaches, in one sentence that says something.
  "Authorisation, capture and settlement happen at different times, which is
  why the customer's balance changes before the shop is paid" is a claim.
  "Overview of the payment process" is not — it is a heading, and a heading
  gets filled with definitions. Every section must say something specific.
- vehicle: the concrete thing this section teaches through — a worked example
  carried end to end, an everyday comparison, a side-by-side of related terms,
  a before-and-after, a failure traced to its cause. Naming it here is what
  stops the slides beneath it turning into a definition list.
- summary: what the audience should understand once this section is done, at
  most 400 characters
- subtopics: the specific points this section must teach, in the order they
  should be taught. Be concrete enough that the user can tell from reading them
  what the presentation will actually say. Write the actual points, not
  instructions like "explain the basics". Name the subject's real terms and
  methods — the vocabulary is the lesson, not decoration on it.
  HARD LIMIT: each subtopic at most 160 characters. One point per entry. If a
  point needs more room, it is two points; split it.
  THREE POINTS, FOUR AT MOST. This section is one slide, and a slide teaches
  three ideas well and eight not at all — points past that are not taught, they
  are crammed in and cut off. If there is more to say, it belongs to a
  different section.
- slideTitles: one entry, the real title this slide will carry — "Overfitting,
  read from a learning curve", not "Section 2 (1/2)".
- slideBudget: 1. Every section is one slide.

Also give: a title and one-line subtitle for the whole presentation, and
recommendedSlides — how many slides this subject really needs to be taught
properly, which may be more than the ${slideCount} budgeted. Say what the
subject needs; the budget is reconciled afterwards.

WHAT MAKES A PLAN FAIL

- Section titles that are scaffolding: "Introduction", "Overview", "Key
  Concepts", "Conclusion". Name what is being taught.
- Subtopics that would be true of any subject. Test each one: could this line
  appear unchanged in a lesson about something else? Then it is filler.
- Definitions where teaching belongs. "X is a technique for Y" leaves the
  audience able to repeat a sentence and nothing else. Plan the part that gives
  the everyday comparison, says what X is for, and shows where they will meet
  it.
- Leaving out the words the audience will hear elsewhere. A lesson that avoids
  the subject's real vocabulary has not prepared anyone for a conversation
  about it.
- Compliance boilerplate, HR-policy language or generic corporate safety
  guidance, unless the request is specifically about those.
- A plan shaped Definition → Components → Benefits → Challenges → Conclusion.
  That is the shape of a deck nobody remembers. If yours resembles it, the
  sections are topics rather than claims — plan it again.

${PLAN_EXEMPLAR}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateOutlineRequest;
    const {
      courseId,
      topic,
      slideCount,
      quizQuestionCount,
      language = "english",
      existingLessonId,
    } = body;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    // Only the course's own instructor may add lessons to it. Without this
    // any caller could create lessons in anyone's course and spend the
    // account's generation budget doing it. Checked before the rest of the
    // request's shape, so a caller with no business here learns nothing
    // about what this endpoint expects.
    let ownerId: string;
    try {
      ownerId = (await requireCourseOwner(courseId)).id;
      if (existingLessonId) await requireLessonOwner(existingLessonId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const limited = consumeAuthenticatedRequest(
      request.headers,
      ownerId,
      "ai:outline",
      AI_GENERATION_RULE,
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many outline generations. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    if (!topic || !slideCount) {
      return NextResponse.json(
        { success: false, error: "courseId, topic and slideCount are required" },
        { status: 400 },
      );
    }

    const requestedSlides = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(slideCount)));

    // The course says who is being taught, which is the planner's best source
    // for an audience. It used to be read only to check the course existed,
    // so a lesson inside "AI Adoption for Sales Teams" was planned as though
    // the topic line were the only thing known about it.
    const course = await db.course.findUnique({
      where: { id: courseId },
      include: {
        category: { select: { name: true } },
        lessons: { select: { id: true, title: true }, orderBy: { order: "asc" } },
      },
    });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    const {
      text: reference,
      sources,
      failures: referenceFailures,
      files: referenceFileUrls,
    } = await loadReference(body.referenceFileUrls, topic, ownerId);
    // Record what the plan is actually grounded in. Silence here previously
    // hid a reference that had failed to parse.
    if (body.referenceFileUrls?.length) {
      console.log(
        `[generate-outline] reference: ${sources.length} file(s) read, ${reference.length} chars used` +
          (referenceFailures.length ? `, ${referenceFailures.length} unreadable` : ""),
      );
    }

    let plan: PresentationPlan;
    try {
      plan = await generateStructuredJSON(
        buildPlannerPrompt({
          topic,
          slideCount: requestedSlides,
          language,
          reference,
          course: {
            title: course.title,
            description: course.description,
            category: course.category?.name ?? null,
          },
          siblingLessons: course.lessons
            .filter((l) => l.id !== existingLessonId)
            .map((l) => l.title),
        }),
        PresentationPlanSchema,
        {
          task: "outline-planning",
          // Grounding the plan in a document makes the model write longer,
          // more specific subtopics. Reshaping those to fit is cheaper and
          // less destructive than spending a retry on them.
          repair: repairPlan,
          systemInstruction:
            "You plan lessons. You decide what a subject's parts are and what each one has to teach; the user decides how many slides they get, and each teaching slide gets one part. A plan that could have been written without knowing the subject is a failed plan.",
          // Planning is an open task, and a low temperature returns the modal
          // plan for a topic — which for any business subject is the generic
          // one. The rules above are what make a warmer setting safe.
          temperature: 0.75,
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI service unavailable";
      console.error("[generate-outline] planning failed:", message);
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    // A reference that was read but ignored looks identical to no reference at
    // all in the finished outline, so measure it rather than assume it.
    const grounding = reference ? measureGrounding(plan, reference) : null;
    if (grounding !== null) {
      console.log(`[generate-outline] reference grounding: ${(grounding * 100).toFixed(0)}%`);
      if (grounding < GROUNDING_FLOOR) {
        console.warn(
          `[generate-outline] the plan barely reflects the supplied reference ` +
            `(${(grounding * 100).toFixed(0)}% of its distinctive terms appear). ` +
            `The document may be off-topic for "${topic}", or mostly images.`,
        );
      }
    }

    // Reconcile the model's structure with the user's budget. Nothing is
    // dropped here — budgets shift, and sections merge only if they must.
    let balanced;
    try {
      balanced = balancePlan(plan, requestedSlides);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The outline could not fit the slide count";
      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }

    // A syllabus squeezed into too few slides is the quietest way a lesson
    // becomes shallow: every section still appears, each one reduced to a
    // definition. The planner says what the subject needs, and the shortfall
    // is reported rather than silently absorbed.
    if (balanced.recommendedSlides && balanced.recommendedSlides > requestedSlides + 1) {
      balanced.adjustments.push(
        `This subject needs about ${balanced.recommendedSlides} slides to be taught properly; ` +
          `${requestedSlides} were requested, so each section is covered more briefly. ` +
          `Raise the slide count to give it room.`,
      );
    }

    const slots = buildSlideSlots(balanced);

    const outlineData = {
      topic,
      style: DEFAULT_STYLE,
      slideCount: requestedSlides,
      // Carried on the plan so the quiz, which is written after the slides,
      // gets the number the instructor chose when they planned the lesson.
      quizQuestionCount:
        quizQuestionCount && Number.isFinite(quizQuestionCount)
          ? Math.max(
              MIN_QUIZ_QUESTIONS,
              Math.min(MAX_QUIZ_QUESTIONS, Math.round(quizQuestionCount)),
            )
          : undefined,
      language,
      title: balanced.title,
      subtitle: balanced.subtitle,
      // What the plan decided about its own audience and argument. Stored so
      // every slide generated from it is written to the same brief, and so the
      // instructor can see and correct it before any slide is written.
      audience: balanced.audience,
      thesis: balanced.thesis,
      misconception: balanced.misconception,
      keyTerms: balanced.keyTerms,
      outcomes: balanced.outcomes,
      recommendedSlides: balanced.recommendedSlides,
      hasContents: balanced.hasContents,
      sections: balanced.sections,
      adjustments: balanced.adjustments,
      referenceContext: reference || undefined,
      referenceSources: sources.length ? sources : undefined,
      referenceFileUrls: referenceFileUrls.length ? referenceFileUrls : undefined,
      referenceGrounding: grounding ?? undefined,
      referenceFailures: referenceFailures.length ? referenceFailures : undefined,
    };

    // ---- Persist: lesson, sections, and one empty slide per planned slot ----
    const { lesson, sectionRows, createdSlides } = await db.$transaction(async (tx) => {
      const lesson = existingLessonId
        ? await tx.lesson.update({
            where: { id: existingLessonId },
            data: { title: balanced.title, outlineJson: JSON.stringify(outlineData) },
          })
        : await tx.lesson.create({
            data: {
              courseId,
              title: balanced.title,
              order: await tx.lesson.count({ where: { courseId } }),
              outlineJson: JSON.stringify(outlineData),
            },
          });

      if (existingLessonId) {
        // The old quiz describes slides that are about to disappear. Retire
        // its questions and mark it pending, but keep the Quiz row so attempts
        // and their recorded scores survive regeneration.
        const quiz = await tx.quiz.findUnique({ where: { lessonId: lesson.id }, select: { id: true } });
        if (quiz) {
          await tx.question.deleteMany({ where: { quizId: quiz.id } });
          await tx.quiz.update({
            where: { id: quiz.id },
            data: { status: "DRAFT", error: null },
          });
        }
        await tx.slide.deleteMany({ where: { lessonId: lesson.id } });
        await tx.section.deleteMany({ where: { lessonId: lesson.id } });
      }

      await tx.section.createMany({
        data: balanced.sections.map((section, i) => ({
          lessonId: lesson.id,
          title: section.title,
          summary: section.summary,
          subtopics: JSON.stringify(section.subtopics),
          slideBudget: section.slideBudget,
          order: i,
        })),
      });

      const sectionRows = await tx.section.findMany({
        where: { lessonId: lesson.id },
        orderBy: { order: "asc" },
      });

      await tx.slide.createMany({
        data: slots.map((slot) => ({
          lessonId: lesson.id,
          sectionId: sectionRows[slot.sectionIndex].id,
          title:
            slot.role === "cover"
              ? balanced.title
              : (slot.title ??
                (slot.slidesInSection > 1
                  ? `${slot.sectionTitle} (${slot.positionInSection}/${slot.slidesInSection})`
                  : slot.sectionTitle)),
          htmlBody: "",
          status: "DRAFT_OUTLINE",
          order: slot.index,
        })),
      });

      const createdSlides = await tx.slide.findMany({
        where: { lessonId: lesson.id },
        orderBy: { order: "asc" },
      });
      return { lesson, sectionRows, createdSlides };
    });

    return NextResponse.json({
      success: true,
      data: {
        id: lesson.id,
        title: lesson.title,
        subtitle: balanced.subtitle,
        order: lesson.order,
        courseId: lesson.courseId,
        outlineJson: lesson.outlineJson,
        requestedSlideCount: requestedSlides,
        totalSlides: slots.length,
        adjustments: balanced.adjustments,
        // The brief the plan wrote for itself. Shown in the outline so the
        // instructor can correct a wrong audience or a flat argument before
        // any slide is generated from it.
        audience: balanced.audience,
        thesis: balanced.thesis,
        misconception: balanced.misconception,
        keyTerms: balanced.keyTerms,
        outcomes: balanced.outcomes,
        // Surfaced so a reference that could not be read is visible rather
        // than silently ignored.
        referenceUsed: sources.map((s) => s.file),
        referenceFailures,
        // How much of the plan's vocabulary came from the reference, so a
        // document that was read but not used is visible rather than assumed.
        referenceGrounding: grounding ?? undefined,
        sections: sectionRows.map((row, i) => ({
          id: row.id,
          title: row.title,
          summary: row.summary,
          subtopics: balanced.sections[i].subtopics,
          claim: balanced.sections[i].claim,
          vehicle: balanced.sections[i].vehicle,
          slideBudget: row.slideBudget,
          order: row.order,
        })),
        slides: createdSlides.map((s) => ({
          id: s.id,
          title: s.title,
          htmlBody: s.htmlBody,
          status: s.status,
          order: s.order,
          lessonId: s.lessonId,
          sectionId: s.sectionId,
        })),
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      },
    });
  } catch (error) {
    console.error("[generate-outline] unexpected error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate outline";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
