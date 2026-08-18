import { NextRequest, NextResponse } from 'next/server';
import { generateText, ELEMENT_EDIT_SYSTEM_PROMPT } from '@/lib/ai';
import { sanitizeHtml } from '@/lib/sanitize';

// ============================================
// POST /api/slides/element-edit
// Single-element AI edit for click-to-edit feature
// ============================================

interface ElementEditRequest {
  elementHtml: string;
  instruction: string;
  slideContext: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ElementEditRequest;
    const { elementHtml, instruction, slideContext } = body;

    if (!elementHtml || !instruction) {
      return NextResponse.json(
        { success: false, error: 'elementHtml and instruction are required' },
        { status: 400 },
      );
    }

    const userPrompt = `Element to edit:
${elementHtml}

Edit instruction: ${instruction}

Slide context: ${slideContext || 'No additional context provided.'}`;

    const raw = await generateText(userPrompt, ELEMENT_EDIT_SYSTEM_PROMPT);

    if (!raw || raw.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response' },
        { status: 500 },
      );
    }

    // Clean potential markdown fences
    let cleaned = raw.trim();
    if (cleaned.startsWith('```html')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    // Sanitize the replacement HTML with the same strict allowlist
    const sanitized = sanitizeHtml(cleaned);

    return NextResponse.json({
      success: true,
      data: { replacementHtml: sanitized },
    });
  } catch (error) {
    console.error('Error in element edit:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to edit element. Please try again.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
