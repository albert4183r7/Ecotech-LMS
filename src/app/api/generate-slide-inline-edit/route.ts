import { NextRequest, NextResponse } from 'next/server';
import { generateText, INLINE_EDIT_SYSTEM_PROMPT } from '@/lib/ai';
import { sanitizeHtml, wrapSlideHtml } from '@/lib/sanitize';

interface InlineEditRequest {
  htmlBody: string;
  instruction: string;
  slideTitle?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as InlineEditRequest;
    const { htmlBody, instruction, slideTitle } = body;

    if (!htmlBody || !instruction) {
      return NextResponse.json(
        { success: false, error: 'htmlBody and instruction are required' },
        { status: 400 }
      );
    }

    // Extract just the body HTML from the wrapped document (strip the outer HTML shell)
    const bodyContent = extractBodyContent(htmlBody);

    const userPrompt = `Current slide HTML:
${bodyContent}

Edit instruction: ${instruction}`;

    const raw = await generateText(userPrompt, INLINE_EDIT_SYSTEM_PROMPT);

    if (!raw || raw.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response' },
        { status: 500 }
      );
    }

    // Clean potential markdown fences
    let cleaned = raw.trim();
    if (cleaned.startsWith('```html')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const sanitized = sanitizeHtml(cleaned);
    const wrapped = wrapSlideHtml(sanitized, { title: slideTitle });

    return NextResponse.json({ success: true, data: { htmlBody: wrapped } });
  } catch (error) {
    console.error('Error editing slide:', error);
    const message = error instanceof Error ? error.message : 'Failed to edit slide. Please try again.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

/** Extract <body> content from a full HTML document */
function extractBodyContent(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) return bodyMatch[1].trim();
  // If no body tags, return as-is
  return html;
}
