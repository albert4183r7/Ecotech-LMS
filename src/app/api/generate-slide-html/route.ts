import { NextRequest } from 'next/server';
import { streamSlideHtml, parseSSEStream } from '@/lib/ai';
import { sanitizeHtml, wrapSlideHtml } from '@/lib/sanitize';

interface GenerateSlideHtmlRequest {
  slideTitle: string;
  prompt: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let body: GenerateSlideHtmlRequest;

      try {
        body = (await request.json()) as GenerateSlideHtmlRequest;
      } catch {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'Invalid request body' })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
        return;
      }

      const { slideTitle, prompt, language = 'english' } = body;

      if (!slideTitle || !prompt) {
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: 'slideTitle and prompt are required' })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
        return;
      }

      try {
        // Emit slide_start
        const startEvent = `event: slide_start\ndata: ${JSON.stringify({ slideTitle })}\n\n`;
        controller.enqueue(encoder.encode(startEvent));

        // Build user prompt
        const isChinese = language === 'chinese';
        const languageInstruction = isChinese
          ? '请使用中文生成所有幻灯片内容。'
          : 'Generate all slide content in English.';

        const userPrompt = `${isChinese ? '幻灯片标题' : 'Slide title'}: ${slideTitle}
${isChinese ? '要求' : 'Instructions'}: ${prompt}

${languageInstruction}`;

        // Stream from AI
        const rawSSEStream = await streamSlideHtml(userPrompt);
        const textStream = parseSSEStream(rawSSEStream);

        const reader = textStream.getReader();
        let fullHtml = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          fullHtml += value;

          // Emit chunk
          const chunkEvent = `event: chunk\ndata: ${JSON.stringify({ html: value })}\n\n`;
          controller.enqueue(encoder.encode(chunkEvent));
        }

        // Sanitize and wrap the complete HTML
        const sanitized = sanitizeHtml(fullHtml);
        const wrapped = wrapSlideHtml(sanitized, { title: slideTitle });

        // Emit slide_complete
        const completeEvent = `event: slide_complete\ndata: ${JSON.stringify({ htmlBody: wrapped })}\n\n`;
        controller.enqueue(encoder.encode(completeEvent));

        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate slide HTML';
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
