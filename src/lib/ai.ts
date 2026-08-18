import ZAI from 'z-ai-web-dev-sdk';
import type { CreateChatCompletionBody } from 'z-ai-web-dev-sdk';

// ============================================
// AI Client — z-ai-web-dev-sdk streaming wrapper
// Used for slide HTML generation via SSE
// ============================================

/** ImageKit URL endpoint (server-side only, never expose to client) */
const IMAGEKIT_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || '';

/** System prompt for HTML slide generation */
export const SLIDE_HTML_SYSTEM_PROMPT = `You are an expert instructional designer who creates beautiful, professional slide content as HTML with Tailwind CSS utility classes.

CRITICAL RULES:
1. Output ONLY raw HTML — no markdown, no code fences, no \`\`\`html markers.
2. Use ONLY Tailwind CSS utility classes for styling. Never use inline style="" attributes.
3. Design for a 16:9 aspect ratio slide layout.
4. Use a clean, modern design with good spacing, typography hierarchy, and visual structure.
5. For images, use ImageKit AI generation URLs in this exact format:
   <img src="{IMAGEKIT_URL_ENDPOINT}/ik-genimg-prompt-{URL_ENCODED_DESCRIPTION}/slide-image.jpg" alt="description" class="..." />
   ${IMAGEKIT_ENDPOINT ? `Replace {IMAGEKIT_URL_ENDPOINT} with: ${IMAGEKIT_ENDPOINT}` : 'IMPORTANT: If no IMAGEKIT_URL_ENDPOINT is specified, use placeholder https://ik.imagekit.io/YOUR_ID'}
   Replace {URL_ENCODED_DESCRIPTION} with a URL-encoded short English description of the desired image (e.g. "colorful+data+visualization+chart").
   The filename after the description can be any descriptive name ending in .jpg.
   Example: <img src="${IMAGEKIT_ENDPOINT || 'https://ik.imagekit.io/YOUR_ID'}/ik-genimg-prompt-colorful+data+chart/data-viz.jpg" alt="Data visualization chart" class="w-full rounded-lg shadow-md" />
6. Structure each slide as a self-contained HTML fragment wrapped in a root <div>.
7. Use semantic HTML: h1 for titles, h2 for section headers, p for body text, ul/ol for lists, etc.
8. Use appropriate Tailwind classes for colors, spacing, typography, and layout.
9. Keep text concise — slides are visual aids, not documents.
10. For quiz slides, create a clean question + 4 options layout using a grid or flexbox.
11. Do NOT use any external image URLs other than ImageKit URLs.`;

/** System prompt for course outline generation */
export const OUTLINE_SYSTEM_PROMPT = `You are an expert instructional designer. Generate a structured course outline.

Output a valid JSON object with this exact shape:
{
  "title": "Course Title",
  "sections": [
    { "title": "Section Title", "summary": "Brief description of what this section covers (1-2 sentences)" }
  ]
}

Rules:
- Generate 3-8 sections appropriate for the topic.
- Each section should be a logical, progressive unit of learning.
- Return ONLY the JSON object — no markdown, no code fences, no extra text.
- Section titles should be descriptive and specific.`;

/** System prompt for inline HTML editing (whole-slide edit) */
export const INLINE_EDIT_SYSTEM_PROMPT = `You are an expert HTML editor specializing in Tailwind CSS slide content. You receive existing HTML slide content and a natural-language edit instruction.

CRITICAL RULES:
1. Output ONLY the modified HTML — no markdown, no code fences, no explanations.
2. Preserve the overall structure and Tailwind class patterns.
3. Apply the requested changes precisely.
4. Use ONLY Tailwind CSS utility classes — never inline style="".
5. For NEW images, use ImageKit AI generation URLs:
   <img src="${IMAGEKIT_ENDPOINT || 'https://ik.imagekit.io/YOUR_ID'}/ik-genimg-prompt-{URL_ENCODED_DESCRIPTION}/slide-image.jpg" alt="description" class="..." />
   Replace {URL_ENCODED_DESCRIPTION} with a URL-encoded short English description.
6. For EXISTING images that need AI transformation, append transformation params as ?tr= query params on the existing ImageKit URL:
   - Remove background: append ?tr=e-removedotbg
   - Replace background: append ?tr=e-changebg-prompt-{URL_ENCODED_NEW_BG_DESCRIPTION}
   - Upscale: append ?tr=e-upscale
   - Add drop shadow: append ?tr=e-dropshadow
   Example: if original src is ".../image.jpg", changing background becomes ".../image.jpg?tr=e-changebg-prompt-sunset+beach"
7. Do NOT use any external image URLs other than ImageKit URLs.`;

/** System prompt for single-element HTML editing (click-to-edit) */
export const ELEMENT_EDIT_SYSTEM_PROMPT = `You are an expert HTML editor. You receive a SINGLE HTML element extracted from a slide and a natural-language edit instruction. Your job is to return ONLY the replacement HTML for that one element.

CRITICAL RULES:
1. Output ONLY the replacement HTML fragment for this one element — no markdown, no code fences, no explanations, no wrapper tags beyond the element itself.
2. Return the SAME tag type (e.g. if input is a <p>, output must be a <p>). If the instruction requires a different structure, use the most semantically appropriate tag.
3. Preserve the same general structure and layout unless the instruction explicitly requires changing it.
4. Preserve ALL existing Tailwind CSS classes unless the instruction explicitly asks to change the styling/color/layout. This is critical — do not drop or modify classes that weren't asked to change.
5. Use ONLY Tailwind CSS utility classes — never inline style="".
6. Apply the requested content or structural changes precisely and completely.
7. For images within the element, use ImageKit AI generation URLs:
   <img src="${IMAGEKIT_ENDPOINT || 'https://ik.imagekit.io/YOUR_ID'}/ik-genimg-prompt-{URL_ENCODED_DESCRIPTION}/slide-image.jpg" alt="description" class="..." />
8. For existing images needing transformation, append ?tr= params: e-removedotbg, e-changebg-prompt-{desc}, e-upscale, e-dropshadow.
9. Do NOT add any wrapper divs or container elements that weren't in the original — replace only the element itself.`;

/** Stream slide HTML from z-ai-web-dev-sdk */
export async function streamSlideHtml(
  userPrompt: string,
  systemPrompt?: string,
): Promise<ReadableStream<Uint8Array>> {
  const zai = await ZAI.create();
  const body: CreateChatCompletionBody = {
    messages: [
      { role: 'assistant', content: systemPrompt || SLIDE_HTML_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
    thinking: { type: 'disabled' },
  };

  const result = await zai.chat.completions.create(body);

  if (!(result instanceof ReadableStream)) {
    throw new Error('Expected ReadableStream from streaming API call');
  }

  return result;
}

/** Non-streaming text generation */
export async function generateText(
  userPrompt: string,
  systemPrompt: string,
): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    thinking: { type: 'disabled' },
  });

  return completion.choices?.[0]?.message?.content ?? '';
}

/** Parse SSE chunks from the z-ai-web-dev-sdk ReadableStream */
export function parseSSEStream(stream: ReadableStream<Uint8Array>): ReadableStream<string> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<string>({
    async start(controller) {
      const reader = stream.getReader();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush remaining buffer
            if (buffer.trim()) {
              const text = extractTextFromSSE(buffer);
              if (text) controller.enqueue(text);
            }
            controller.close();
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (const line of lines) {
            const text = extractTextFromSSE(line);
            if (text) {
              controller.enqueue(text);
            }
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

/** Extract text content from a single SSE line */
function extractTextFromSSE(line: string): string {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith(':')) return ''; // Skip empty lines and comments

  if (trimmed.startsWith('data: ')) {
    const data = trimmed.slice(6);
    if (data === '[DONE]') return '';

    try {
      const parsed = JSON.parse(data);
      // OpenAI-compatible SSE: choices[0].delta.content
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) return content;
    } catch {
      // Not valid JSON — might be plain text
      return data;
    }
  }

  return '';
}
