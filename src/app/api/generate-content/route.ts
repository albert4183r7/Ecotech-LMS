import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

interface GenerateContentRequest {
  topic: string;
  prompt: string;
  language?: string;
}

const SLIDE_TYPE_SCHEMA = `
The slide "type" field MUST be one of: "title", "content", "list", "table", "code", "quiz".

For each type, the required fields are:
- title (string, always required)

Optional fields depending on type:
- subtitle (string): only for "title" type
- items (array): for "content", "list", and "quiz" types
  - Each item has: { heading?: string, text: string, icon?: string }
- tableData (object): only for "table" type
  - { headers: string[], rows: string[][] }
- codeBlock (object): only for "code" type
  - { language: string, code: string }

For "quiz" type:
- items must have exactly 4 entries (4 answer options A/B/C/D)
- Each item should have heading as the answer text
- The correct answer must have icon: "check"
- Example: items: [
    { heading: "Option A text", text: "optional explanation" },
    { heading: "Option B text", text: "", icon: "check" },
    { heading: "Option C text" },
    { heading: "Option D text" }
  ]
`;

function buildSystemPrompt(language: string): string {
  const isChinese = language === 'chinese';
  return `You are an expert instructional designer and course content generator for an employee learning management system. Your task is to generate high-quality, educational slide content.

${isChinese ? '请使用中文生成所有内容。' : 'Generate all content in English.'}

You must respond with a valid JSON array of slide objects. No other text, no markdown, just the JSON array.

Required slide structure (total 5-7 slides):
1. First slide: type "title" - Introduces the topic with a title and subtitle
2. Next 3-5 slides: Mix of types "content", "list", "table", and/or "code" - covering key concepts
3. Last slide: type "quiz" - A multiple-choice question with 4 options, one marked correct with icon "check"

${SLIDE_TYPE_SCHEMA}

Content guidelines:
- ${isChinese ? '内容应该准确、专业且易于理解' : 'Content should be accurate, professional, and easy to understand'}
- ${isChinese ? '每个幻灯片应聚焦于一个主要概念' : 'Each slide should focus on one main concept'}
- ${isChinese ? '使用清晰、简洁的语言' : 'Use clear, concise language'}
- ${isChinese ? '代码示例应实用且具有教育意义' : 'Code examples should be practical and educational'}
- ${isChinese ? '测验问题应测试对核心概念的理解' : 'Quiz questions should test understanding of core concepts'}
- ${isChinese ? '确保4个选项中的3个是合理的但错误的答案' : 'Make sure 3 of the 4 options are plausible but incorrect answers'}

CRITICAL: Return ONLY a valid JSON array. Do not wrap it in markdown code blocks. Do not add any text before or after the JSON.`;
}

function buildUserPrompt(topic: string, prompt: string, language: string): string {
  const isChinese = language === 'chinese';
  return `${isChinese ? '课程主题' : 'Course topic'}: ${topic}
${isChinese ? '具体要求' : 'Specific instructions'}: ${prompt}

${isChinese
  ? '请根据以上主题和要求，生成一个包含5-7张幻灯片的JSON数组。第一张是标题幻灯片，中间是内容幻灯片（混合使用content、list、table、code类型），最后一张是测验幻灯片（4个选项，正确答案标记icon为"check"）。'
  : 'Generate a JSON array of 5-7 slides. First is a title slide, middle slides should be a mix of content, list, table, and code types, and the last slide is a quiz with 4 options (correct answer marked with icon "check").'}`;
}

function parseAndValidateSlides(raw: string, topic: string): unknown[] {
  let cleaned = raw.trim();

  // Remove markdown code block wrappers if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Find the JSON array in the response
  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');

  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error('No valid JSON array found in AI response');
  }

  const jsonStr = cleaned.slice(arrayStart, arrayEnd + 1);
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('AI response is not a valid array of slides');
  }

  // Validate and fix each slide
  const validTypes = ['title', 'content', 'list', 'table', 'code', 'quiz'];

  return parsed.map((slide: Record<string, unknown>, index: number) => {
    // Ensure every slide has a title
    if (!slide.title || typeof slide.title !== 'string') {
      slide.title = index === 0
        ? topic
        : `${topic} - Slide ${index + 1}`;
    }

    // Ensure type is valid
    if (!slide.type || !validTypes.includes(slide.type as string)) {
      slide.type = 'content';
    }

    // Ensure quiz has items and a correct answer
    if (slide.type === 'quiz') {
      if (!Array.isArray(slide.items) || slide.items.length < 2) {
        slide.items = [
          { heading: 'Option A', text: '' },
          { heading: 'Option B', text: '', icon: 'check' },
          { heading: 'Option C', text: '' },
          { heading: 'Option D', text: '' },
        ];
      }
      // Ensure at least one item has icon "check"
      const hasCorrect = (slide.items as Array<Record<string, unknown>>).some(
        (item) => item.icon === 'check'
      );
      if (!hasCorrect && slide.items.length > 0) {
        (slide.items as Array<Record<string, unknown>>)[0].icon = 'check';
      }
      // Ensure exactly 4 items
      if (slide.items.length < 4) {
        while (slide.items.length < 4) {
          slide.items.push({ heading: `Option ${String.fromCharCode(65 + slide.items.length)}`, text: '' });
        }
      }
    }

    return slide;
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateContentRequest;
    const { topic, prompt, language = 'english' } = body;

    if (!topic || !prompt) {
      return NextResponse.json(
        { success: false, error: 'Topic and prompt are required' },
        { status: 400 }
      );
    }

    const zai = await ZAI.create();

    const systemPrompt = buildSystemPrompt(language);
    const userPrompt = buildUserPrompt(topic, prompt, language);

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      thinking: { type: 'disabled' },
    });

    const rawContent = completion.choices[0]?.message?.content;

    if (!rawContent || rawContent.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response' },
        { status: 500 }
      );
    }

    const slides = parseAndValidateSlides(rawContent, topic);

    return NextResponse.json({
      success: true,
      data: slides,
    });
  } catch (error) {
    console.error('Error generating content:', error);

    const message =
      error instanceof SyntaxError
        ? 'Failed to parse AI-generated content. Please try again.'
        : error instanceof Error
          ? error.message
          : 'Failed to generate content. Please try again.';

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
