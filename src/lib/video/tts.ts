// OpenAI-compatible text-to-speech. Development defaults to the local
// Speaches CPU service; a hosted provider is used only when TTS_BASE_URL is
// configured explicitly.

const LOCAL_TTS_BASE_URL = "http://127.0.0.1:8000/v1";
const KOKORO_MODEL = "speaches-ai/Kokoro-82M-v1.0-ONNX";
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_INPUT_CHARACTERS = 4096;
const TTS_RETRIES = 2;

class NonRetryableTtsError extends Error {}

export const DEFAULT_TTS_MODEL = process.env.TTS_MODEL?.trim() || KOKORO_MODEL;
export const DEFAULT_TTS_VOICE = process.env.TTS_VOICE?.trim() || "af_heart";
export const TTS_BASE_URL = (process.env.TTS_BASE_URL?.trim() || LOCAL_TTS_BASE_URL).replace(
  /\/+$/,
  "",
);

function requestHeaders(): Record<string, string> {
  const apiKey = process.env.TTS_API_KEY?.trim();
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
}

function isLocalTts(): boolean {
  try {
    const hostname = new URL(TTS_BASE_URL).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

/** Fail once, with setup guidance, before a local job fans out into scenes. */
export async function assertTtsReady(): Promise<void> {
  if (!isLocalTts()) return;

  const origin = new URL(TTS_BASE_URL).origin;
  try {
    const healthResponse = await fetch(`${origin}/health`, {
      headers: requestHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!healthResponse.ok) throw new Error(`health check returned ${healthResponse.status}`);
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `Local TTS is not available at ${origin}. Run \`npm run tts:setup\` before generating video${detail}.`,
    );
  }

  const modelsResponse = await fetch(`${TTS_BASE_URL}/models`, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!modelsResponse.ok) {
    throw new Error(`Local TTS model check returned ${modelsResponse.status}.`);
  }

  const payload = (await modelsResponse.json()) as { data?: Array<{ id?: string }> };
  const installedModel = /^tts-1(?:-hd)?$/i.test(DEFAULT_TTS_MODEL)
    ? KOKORO_MODEL
    : DEFAULT_TTS_MODEL;
  const installed = payload.data?.some((model) => model.id === installedModel) ?? false;
  if (!installed) {
    throw new Error(
      `Local TTS model ${DEFAULT_TTS_MODEL} is not installed. Run \`npm run tts:setup\`.`,
    );
  }
}

export interface SpeechOptions {
  model?: string;
  voice?: string;
  language?: string;
}

/** Generate one MP3 narration scene. */
export async function generateSpeech(input: string, options: SpeechOptions = {}): Promise<Buffer> {
  const text = input.trim();
  if (!text) throw new Error("TTS input is empty.");
  if (text.length > MAX_INPUT_CHARACTERS) {
    throw new Error(`TTS input exceeds ${MAX_INPUT_CHARACTERS} characters.`);
  }

  const model = options.model?.trim() || DEFAULT_TTS_MODEL;
  const voice = options.voice?.trim() || DEFAULT_TTS_VOICE;
  const body: Record<string, unknown> = {
    model,
    voice,
    input: text,
    response_format: "mp3",
  };

  // Delivery instructions are an OpenAI gpt-4o-mini-tts extension. Kokoro and
  // other OpenAI-compatible speech models may reject this extra field.
  if (/^gpt-4o-mini-tts(?:-|$)/i.test(model)) {
    body.instructions = `Speak as a clear, warm teacher${
      options.language ? ` in ${options.language}` : ""
    }. Use a natural pace, short pauses between ideas, and no exaggerated performance.`;
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
    try {
      const response = await fetch(`${TTS_BASE_URL}/audio/speech`, {
        method: "POST",
        headers: requestHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.TTS_TIMEOUT_MS ?? 300_000)),
      });

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const message = `TTS provider returned ${response.status}${detail ? `: ${detail}` : ""}`;
        const error = new Error(message);
        if ((response.status === 429 || response.status >= 500) && attempt < TTS_RETRIES) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
          continue;
        }
        throw new NonRetryableTtsError(message);
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (audio.length === 0) {
        throw new NonRetryableTtsError("TTS provider returned an empty audio file.");
      }
      if (audio.length > MAX_AUDIO_BYTES) {
        throw new NonRetryableTtsError(`TTS audio exceeds ${MAX_AUDIO_BYTES / 1024 / 1024} MB.`);
      }
      return audio;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (error instanceof NonRetryableTtsError) break;
      if (attempt >= TTS_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, 1500 * 2 ** attempt));
    }
  }

  throw lastError ?? new Error("TTS generation failed.");
}
