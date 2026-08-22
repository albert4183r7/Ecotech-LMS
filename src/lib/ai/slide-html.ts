import { streamText, collectStream } from "./streaming";

// ============================================
// Slide HTML generation
//
// The prompts and calls for the agent's HTML-authoring tools, which predate
// the structured slide model and are still what those tools use. Streams
// through the shared client, so the provider and the model for this task are
// decided in one place — see ./models.ts, task "slide-html-legacy".
// ============================================

/** ImageKit URL endpoint (server-side only, never expose to client) */
const IMAGEKIT_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || "";

/** Whether ImageKit is configured for AI image generation */
const IMAGEKIT_CONFIGURED = !!IMAGEKIT_ENDPOINT;

/** Build image instruction based on whether ImageKit is configured */
function buildImageRule(): string {
  if (IMAGEKIT_CONFIGURED) {
    return `IMAGE RULES:
- For images, use ImageKit AI generation URLs in this exact format:
  <img src="${IMAGEKIT_ENDPOINT}/ik-genimg-prompt-{URL_ENCODED_DESCRIPTION}/slide-image.jpg" alt="description" class="..." />
  Replace {URL_ENCODED_DESCRIPTION} with a URL-encoded short English description of the desired image (e.g. "colorful+data+visualization+chart").
  The filename after the description can be any descriptive name ending in .jpg.
  Example: <img src="${IMAGEKIT_ENDPOINT}/ik-genimg-prompt-colorful+data+chart/data-viz.jpg" alt="Data visualization chart" class="w-full rounded-lg shadow-md" />
- Do NOT use any external image URLs other than ImageKit URLs.`;
  }
  return `IMAGE RULES:
- Do NOT include <img> tags with external URLs — image generation is not available.
- Instead, create visuals using: colored div backgrounds with Tailwind gradients, borders, and patterns; icon-like Unicode characters or emoji for visual indicators (e.g. 📊 🎯 ✅ ⚡); CSS grid/flexbox layouts for visual structure; colored boxes, badges, and decorative div elements.
- Every visual must be pure CSS/HTML.
- Do NOT use any external image URLs or <img> tags with external sources.`;
}

/** Build edit prompt image instruction */
function buildEditImageRule(): string {
  if (IMAGEKIT_CONFIGURED) {
    return `For NEW images, use ImageKit AI generation URLs:
  <img src="${IMAGEKIT_ENDPOINT}/ik-genimg-prompt-{URL_ENCODED_DESCRIPTION}/slide-image.jpg" alt="description" class="..." />
  Replace {URL_ENCODED_DESCRIPTION} with a URL-encoded short English description.
For EXISTING images that need AI transformation, append transformation params as ?tr= query params on the existing ImageKit URL:
  - Remove background: append ?tr=e-removedotbg
  - Replace background: append ?tr=e-changebg-prompt-{URL_ENCODED_NEW_BG_DESCRIPTION}
  - Upscale: append ?tr=e-upscale
  - Add drop shadow: append ?tr=e-dropshadow
  Example: if original src is ".../image.jpg", changing background becomes ".../image.jpg?tr=e-changebg-prompt-sunset+beach"
Do NOT use any external image URLs other than ImageKit URLs.`;
  }
  return `Do NOT add <img> tags with external URLs — image generation is not available.
For visual elements, use CSS-based approaches (gradients, colored divs, Unicode/emoji, Tailwind classes).
Do NOT use any external image URLs.`;
}

/** System prompt for HTML slide generation — PPT-style presentation slides */
export const SLIDE_HTML_SYSTEM_PROMPT = `You are an expert presentation slide designer. You create beautiful, visually impactful slides like those in a professional PowerPoint or Keynote presentation.

WHAT THIS IS: These are PRESENTATION SLIDES — like what a student makes for a class presentation, or a professional makes for a business pitch. Think Google Slides, PowerPoint, Keynote.

EVERY SLIDE IS ABOUT THE SUBJECT ITSELF. A slide states facts, examples, and claims about the topic — never the structure of a course, never what a learner is going to do, never a summary of the deck's own agenda.

CRITICAL DESIGN RULES:
1. Output ONLY raw HTML — no markdown, no code fences, no backtick-html markers.
2. Use ONLY Tailwind CSS utility classes for styling. Never use inline style="" attributes.
3. Design for a 16:9 aspect ratio slide layout (widescreen).
4. Each slide must look like a REAL PRESENTATION SLIDE:
   - Big, bold title at the top
   - Key points as short, punchy bullet items (3-5 max per slide)
   - Strong visual hierarchy — title >> subtitles >> body text
   - Use visual elements: colored accent bars, icon indicators, number badges, colored cards
   - Leave breathing room — do NOT fill every pixel with text
5. ${buildImageRule()}
6. Structure each slide as a self-contained HTML fragment wrapped in a single root <div>.
7. SLIDE TYPES AND HOW TO DESIGN THEM:
   - TITLE SLIDE: Large centered title, subtitle below, maybe a decorative accent. NO bullet points.
   - CONTENT SLIDE: Title at top, 3-5 key points as short bullets or visual cards. NOT paragraphs.
   - COMPARISON SLIDE: Two or more columns side by side. Each column has a heading and short bullets.
   - LIST/PROCESS SLIDE: Numbered steps or a flow. Each step is short (1 line max).
   - STATISTICS SLIDE: Big numbers with labels, or a simple visual chart layout.
   - CLOSING SLIDE: "Thank You" or "Questions?" with a clean, minimal design.
8. TEXT RULES:
   - Keep text SHORT. Each bullet point = 1 line, max 10-15 words.
   - Write concrete statements about the subject, using action words.
   - If something needs explaining, use 2-3 short bullets rather than a paragraph.
9. FACTUAL INTEGRITY:
   - Use only the content supplied in the prompt. Tighten and rephrase it; do not add facts of your own.
   - Never invent statistics, percentages, currency amounts, dates, study findings, or company metrics. If the prompt supplies no number, make the point qualitatively.
   - Never attribute a claim to a named company, product, or study unless the prompt named it.
10. STATIC OUTPUT:
   - The slide renders as static HTML with no scripting.
   - Do not add links, buttons, or calls to action such as "View Demo" or "Watch video" — they cannot work and read as broken.
11. VARY YOUR LAYOUTS — do not use the same layout for every slide. Mix:
   - Left-aligned title with right-aligned visual area
   - Centered title with cards grid below
   - Full-width colored header bar with content below
   - Two-column split layouts
   - Numbered step layouts
12. Use appropriate Tailwind classes for colors, spacing, typography, and layout.`;

/** System prompt for inline HTML editing (whole-slide edit) */
export const INLINE_EDIT_SYSTEM_PROMPT = `You are an expert presentation slide editor specializing in Tailwind CSS. You receive existing HTML slide content and a natural-language edit instruction.

CRITICAL RULES:
1. Output ONLY the modified HTML — no markdown, no code fences, no explanations.
2. Preserve the overall structure and Tailwind class patterns.
3. Apply the requested changes precisely.
4. Use ONLY Tailwind CSS utility classes — never inline style="".
5. ${buildEditImageRule()}
6. Preserve ALL existing Tailwind CSS classes unless the instruction explicitly asks to change them.
7. Keep the slide looking like a real PPT/Keynote presentation slide — visual, not text-heavy.`;

/** System prompt for single-element HTML editing (click-to-edit) */
export const ELEMENT_EDIT_SYSTEM_PROMPT = `You are an expert HTML editor. You receive a SINGLE HTML element extracted from a presentation slide and a natural-language edit instruction. Your job is to return ONLY the replacement HTML for that one element.

CRITICAL RULES:
1. Output ONLY the replacement HTML fragment for this one element — no markdown, no code fences, no explanations, no wrapper tags beyond the element itself.
2. Return the SAME tag type (e.g. if input is a <p>, output must be a <p>). If the instruction requires a different structure, use the most semantically appropriate tag.
3. Preserve the same general structure and layout unless the instruction explicitly requires changing it.
4. Preserve ALL existing Tailwind CSS classes unless the instruction explicitly asks to change the styling/color/layout. This is critical — do not drop or modify classes that weren't asked to change.
5. Use ONLY Tailwind CSS utility classes — never inline style="".
6. Apply the requested content or structural changes precisely and completely.
7. ${buildEditImageRule()}
8. Do NOT add any wrapper divs or container elements that weren't in the original — replace only the element itself.`;

/** Ceiling for a single slide's HTML. */
const SLIDE_MAX_OUTPUT_TOKENS = 16384;

/** Stream slide HTML, yielding text chunks as they arrive. */
export async function* streamSlideHtml(
  userPrompt: string,
  systemPrompt?: string,
): AsyncGenerator<string, void, undefined> {
  yield* streamText(userPrompt, {
    task: "slide-html-legacy",
    systemPrompt: systemPrompt || SLIDE_HTML_SYSTEM_PROMPT,
    temperature: 0.8,
    maxTokens: SLIDE_MAX_OUTPUT_TOKENS,
  });
}

export { collectStream };

/** One-shot text generation: the whole response as a single string. */
export async function generateText(userPrompt: string, systemPrompt: string): Promise<string> {
  // Streamed and collected rather than requested whole: a full slide's HTML is
  // long enough that a non-streaming request can hit the gateway's timeout.
  return collectStream(
    streamText(userPrompt, {
      task: "slide-html-legacy",
      systemPrompt,
      temperature: 0.7,
      maxTokens: SLIDE_MAX_OUTPUT_TOKENS,
    }),
  );
}
