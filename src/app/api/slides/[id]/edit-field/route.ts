import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { generateStructuredJSON } from "@/lib/ai";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";
import { readField, writeField, type EditableField } from "@/lib/slides/content-path";
import { readCompositionField, writeCompositionField } from "@/lib/slides/composition-path";
import { parseSlideDoc, renderSlideDoc, slideDocTitle, type SlideDoc } from "@/lib/slides/document";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";

// ============================================
// POST /api/slides/[id]/edit-field
//
// Edit one field of one slide.
//
// The model is given the field's current text and the instruction, and returns
// replacement text for that field alone. It never sees or writes the slide's
// markup, so layout, template, typography, spacing, images, the other fields
// and the slide's dimensions cannot change — not because the model was asked
// to leave them alone, but because it is not what it is editing. The slide is
// then re-rendered from the template, exactly as generation would.
// ============================================

interface EditRequest {
  /** Dotted path into the slide's structured content, e.g. "points.0.heading". */
  path: string;
  instruction: string;
}

const ReplacementSchema = z.object({
  text: z.string().min(1).describe("The replacement text for this field, and nothing else"),
});

const SYSTEM = `You rewrite one field of one presentation slide.

You are given the field's current text and an instruction. Return the new text
for that field only.

- Return the text itself. No quotes around it, no explanation, no markup, no
  label, no commentary.
- Change what the instruction asks and nothing else. If it asks for a shorter
  title, keep the meaning and shorten it; do not change the subject.
- Stay within the stated character limit. It is enforced.
- Write in the same language as the current text.
- The field is one part of a slide. Do not write the whole slide, and do not
  refer to the slide, the deck or the audience.`;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("slides.edit-field", async () => {
    const { id } = await params;

    const slide = await db.slide.findUnique({
      where: { id },
      select: { id: true, lessonId: true, contentJson: true, title: true, order: true },
    });
    if (!slide) return fail("Slide not found.", 404);

    // Only the course's instructor may edit its slides.
    await requireLessonOwner(slide.lessonId);

    const body = (await request.json()) as EditRequest;
    if (!body?.path || !body?.instruction?.trim()) {
      return fail("path and instruction are required.", 400);
    }

    if (!slide.contentJson) {
      return fail(
        "This slide was generated before the current slide format and cannot be edited field by field. Regenerate the lesson to edit it.",
        409,
      );
    }

    const doc = parseSlideDoc(slide.contentJson);
    if (!doc) return fail("This slide's stored content is not readable.", 409);

    // Either slide model is editable, and the path means the same thing in
    // both: the one run of text the instructor clicked.
    const field: EditableField | null =
      doc.kind === "composition"
        ? readCompositionField(doc.composition, body.path)
        : readField(doc.content, body.path);
    if (!field) return fail(`"${body.path}" is not an editable field of this slide.`, 400);

    const slideKind =
      doc.kind === "composition" ? (doc.composition.layoutNote ?? "composed") : doc.content.type;

    const prompt = [
      `FIELD: the ${field.label} of a ${slideKind} slide.`,
      `CHARACTER LIMIT: between ${field.minLength} and ${field.maxLength}.`,
      "",
      "CURRENT TEXT:",
      field.value,
      "",
      `INSTRUCTION: ${body.instruction.trim()}`,
    ].join("\n");

    let replacement: string;
    try {
      const result = await generateStructuredJSON(prompt, ReplacementSchema, {
        task: "slide-field-edit",
        systemInstruction: SYSTEM,
        temperature: 0.4,
      });
      replacement = result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : "The edit could not be generated.";
      return fail(message, 502);
    }

    // Validated against the field's own limits and then against the whole
    // slide, so an edit can never store content the renderer cannot draw.
    let edited: SlideDoc;
    if (doc.kind === "composition") {
      const written = writeCompositionField(doc.composition, body.path, replacement);
      if (!written.ok) return fail(written.error, 422);
      edited = { kind: "composition", composition: written.composition };
    } else {
      const written = writeField(doc.content, body.path, replacement);
      if (!written.ok) return fail(written.error, 422);
      edited = { kind: "content", content: written.content };
    }

    const html = sanitizeHtml(renderSlideDoc(edited, { slideNumber: slide.order + 1 }));
    const title = slideDocTitle(edited, slide.title);

    await db.slide.update({
      where: { id: slide.id },
      data: {
        contentJson: JSON.stringify(
          edited.kind === "composition" ? edited.composition : edited.content,
        ),
        htmlBody: wrapSlideHtml(html, { title }),
        title,
      },
    });

    return ok({
      slideId: slide.id,
      path: body.path,
      label: field.label,
      previousText: field.value,
      newText: replacement.trim(),
      htmlBody: wrapSlideHtml(html, { title }),
      title,
    });
  });
}
