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
  type PresentationPlan,
} from "@/lib/presentation-plan";
import { DEFAULT_STYLE } from "@/lib/slide-styles";
import { extractTextFromFiles, selectRelevantSections } from "@/lib/extract-doc";

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
  language?: string;
  existingLessonId?: string;
  referenceFileUrls?: string[];
}

const MAX_REFERENCE_CHARS = 12_000;

/** Read any uploaded reference documents, keeping the parts about the topic. */
async function loadReference(
  fileUrls: string[] | undefined,
  topic: string,
): Promise<{
  text: string;
  sources: { file: string; charCount: number }[];
  failures: { file: string; reason: string }[];
}> {
  if (!fileUrls?.length) return { text: "", sources: [], failures: [] };

  const root = path.join(process.cwd(), "public");
  const paths = fileUrls
    .map((u) => path.join(root, u.replace(/^\//, "")))
    .filter((p) => path.normalize(p).startsWith(root));

  if (paths.length === 0) return { text: "", sources: [], failures: [] };

  try {
    const { text, sources, failures } = await extractTextFromFiles(paths);
    if (failures.length) {
      console.warn(
        `[generate-outline] ${failures.length} reference file(s) unreadable:`,
        failures.map((f) => `${f.file} (${f.reason})`).join("; "),
      );
    }
    if (!text.trim()) return { text: "", sources, failures };
    return { text: selectRelevantSections(text, topic, MAX_REFERENCE_CHARS), sources, failures };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[generate-outline] reference extraction failed:", reason);
    return { text: "", sources: [], failures: [{ file: "reference", reason }] };
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
}): string {
  const { topic, slideCount, language, reference } = params;

  return `WHAT THE USER ASKED FOR: ${topic}

SLIDE BUDGET: ${slideCount} slides in total.
LANGUAGE: write everything in ${language}.
${
  reference
    ? `\nSOURCE MATERIAL — this is the substance of the presentation, not background reading:\n<reference>\n${reference}\n</reference>\n\nThe sections must come out of this document. Name the specific concepts, terms,\nfigures and examples it actually uses. A plan that would read the same without\nthis document has failed. Where the document and general knowledge disagree,\nthe document wins. Do not introduce major topics it never mentions.\n`
    : "\nNo source material was supplied. Plan from established knowledge of the subject, and do not promise figures you cannot support.\n"
}
Plan this presentation as a set of logical SECTIONS.

A section is a part of the subject, not a slide. Decide how many sections the
subject genuinely needs — usually between three and seven. Do not create one
section per slide, and do not pad the count to match the slide budget.

For each section give:
- title: what this part of the presentation covers, at most 90 characters
- summary: what the audience should understand once this section is done, at
  most 400 characters
- subtopics: 2 to 8 specific points this section must teach. Be concrete enough
  that the user can tell from reading them what the presentation will say.
  Write the actual points, not instructions like "explain the basics".
  HARD LIMIT: each subtopic must be at most 160 characters. One point per
  entry. If a point needs more room than that, it is really two points — split
  it into two entries rather than writing a long one.
- slideBudget: how many of the ${slideCount} slides this section needs,
  proportional to how much there is to teach. A dense section deserves more.

Rules:
- The slideBudget values should add up to roughly ${slideCount}. They will be
  adjusted to fit exactly, so approximate is fine.
- One slide is reserved for the opening title and one for the close; account
  for that when spreading the budget.
- Infer the audience and depth from the request itself. Do not ask for them.
- Generic scaffolding such as "Introduction", "Overview", "Conclusion" as
  section titles is not acceptable. Name what is actually being taught.

Also give the presentation a title and a one-line subtitle.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateOutlineRequest;
    const { courseId, topic, slideCount, language = "english", existingLessonId } = body;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    // Only the course's own instructor may add lessons to it. Without this
    // any caller could create lessons in anyone's course and spend the
    // account's generation budget doing it. Checked before the rest of the
    // request's shape, so a caller with no business here learns nothing
    // about what this endpoint expects.
    try {
      await requireCourseOwner(courseId);
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

    if (!topic || !slideCount) {
      return NextResponse.json(
        { success: false, error: "courseId, topic and slideCount are required" },
        { status: 400 },
      );
    }

    const requestedSlides = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(slideCount)));

    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    const {
      text: reference,
      sources,
      failures: referenceFailures,
    } = await loadReference(body.referenceFileUrls, topic);
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
        }),
        PresentationPlanSchema,
        {
          task: "outline-planning",
          // Grounding the plan in a document makes the model write longer,
          // more specific subtopics. Reshaping those to fit is cheaper and
          // less destructive than spending a retry on them.
          repair: repairPlan,
          systemInstruction:
            "You plan presentations. You decide the logical structure of a subject; the user decides how many slides they get. Never equate sections with slides.",
          temperature: 0.4,
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
    const balanced = balancePlan(plan, requestedSlides);
    const slots = buildSlideSlots(balanced);

    const outlineData = {
      topic,
      style: DEFAULT_STYLE,
      slideCount: requestedSlides,
      language,
      title: balanced.title,
      subtitle: balanced.subtitle,
      sections: balanced.sections,
      adjustments: balanced.adjustments,
      referenceContext: reference || undefined,
      referenceSources: sources.length ? sources : undefined,
      referenceGrounding: grounding ?? undefined,
      referenceFailures: referenceFailures.length ? referenceFailures : undefined,
    };

    // ---- Persist: lesson, sections, and one empty slide per planned slot ----
    const lesson = existingLessonId
      ? await db.lesson.update({
          where: { id: existingLessonId },
          data: { title: balanced.title, outlineJson: JSON.stringify(outlineData) },
        })
      : await db.lesson.create({
          data: {
            courseId,
            title: balanced.title,
            order: await db.lesson.count({ where: { courseId } }),
            outlineJson: JSON.stringify(outlineData),
          },
        });

    if (existingLessonId) {
      await db.slide.deleteMany({ where: { lessonId: lesson.id } });
      await db.section.deleteMany({ where: { lessonId: lesson.id } });
    }

    await db.section.createMany({
      data: balanced.sections.map((section, i) => ({
        lessonId: lesson.id,
        title: section.title,
        summary: section.summary,
        subtopics: JSON.stringify(section.subtopics),
        slideBudget: section.slideBudget,
        order: i,
      })),
    });

    const sectionRows = await db.section.findMany({
      where: { lessonId: lesson.id },
      orderBy: { order: "asc" },
    });

    await db.slide.createMany({
      data: slots.map((slot) => ({
        lessonId: lesson.id,
        sectionId: sectionRows[slot.sectionIndex].id,
        title:
          slot.role === "cover"
            ? balanced.title
            : slot.slidesInSection > 1
              ? `${slot.sectionTitle} (${slot.positionInSection}/${slot.slidesInSection})`
              : slot.sectionTitle,
        htmlBody: "",
        status: "DRAFT_OUTLINE",
        order: slot.index,
      })),
    });

    const createdSlides = await db.slide.findMany({
      where: { lessonId: lesson.id },
      orderBy: { order: "asc" },
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
