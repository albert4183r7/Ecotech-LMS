import { z } from "zod/v4";
import { modelFor, type AiTask } from "./models";
import { getClient, throwFriendlyError, MAX_OUTPUT_TOKENS } from "./provider";
import { toJsonSchema, stripFences } from "./structured";
import type { ImageInput } from "./tools";

// ============================================
// Vision
//
// Structured JSON with images in the prompt, for the visual evaluator: it has
// to look at a rendered slide rather than reason about its markup. The task
// this serves is the only one that needs a multimodal model — see
// isMultimodal() in ./models.ts.
// ============================================

/**
 * Structured JSON with images in the prompt.
 *
 * Used by the visual evaluator, which has to look at a rendered slide rather
 * than reason about its markup.
 */
export async function generateStructuredFromImages<T>(
  prompt: string,
  images: ImageInput[],
  schema: z.ZodType<T>,
  options: { task: AiTask; systemInstruction?: string; temperature?: number },
): Promise<T> {
  const jsonSchema = toJsonSchema(schema);
  const system = [
    options.systemInstruction ?? "",
    "Reply with a single JSON object and nothing else — no prose, no code fences.",
    "It must satisfy this JSON Schema exactly:",
    JSON.stringify(jsonSchema),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: string;
  try {
    const response = await getClient().chat.completions.create({
      model: modelFor(options.task),
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: options.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ],
        },
      ],
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throwFriendlyError(err, "generateStructuredFromImages", options.task);
  }

  const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
  if (!parsed.success) {
    throw new Error(
      `[LLM Schema Error] generateStructuredFromImages — ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data as T;
}
