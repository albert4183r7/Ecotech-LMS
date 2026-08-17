import { NextRequest, NextResponse } from 'next/server';
import { generateText, OUTLINE_SYSTEM_PROMPT } from '@/lib/ai';

interface GenerateOutlineRequest {
  topic: string;
  prompt: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateOutlineRequest;
    const { topic, prompt, language = 'english' } = body;

    if (!topic || !prompt) {
      return NextResponse.json(
        { success: false, error: 'Topic and prompt are required' },
        { status: 400 }
      );
    }

    const isChinese = language === 'chinese';
    const userPrompt = `${isChinese ? '课程主题' : 'Course topic'}: ${topic}
${isChinese ? '详细要求' : 'Detailed instructions'}: ${prompt}

${isChinese ? '请用中文生成课程大纲。' : 'Generate the course outline in English.'}
${isChinese ? '每个部分用中文命名。' : 'Name each section in English.'}`;

    const raw = await generateText(userPrompt, OUTLINE_SYSTEM_PROMPT);

    if (!raw || raw.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response' },
        { status: 500 }
      );
    }

    // Parse JSON from response (handle markdown code fences)
    let cleaned = raw.trim();
    if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
    else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
    if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
    cleaned = cleaned.trim();

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      return NextResponse.json(
        { success: false, error: 'AI response is not valid JSON' },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));

    const data = {
      title: parsed.title || topic,
      sections: Array.isArray(parsed.sections)
        ? parsed.sections.map((s: Record<string, unknown>) => ({
            title: String(s.title || 'Untitled Section'),
            summary: String(s.summary || ''),
          }))
        : [],
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error generating outline:', error);
    const message =
      error instanceof SyntaxError
        ? 'Failed to parse AI-generated outline. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Failed to generate outline. Please try again.';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
