const DEFAULT_BASE_URL = "http://127.0.0.1:8000/v1";
const DEFAULT_MODEL = "speaches-ai/Kokoro-82M-v1.0-ONNX";
const DEFAULT_VOICE = "af_heart";

const baseUrl = (process.env.TTS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
const model = process.env.TTS_MODEL?.trim() || DEFAULT_MODEL;
const installedModel = /^tts-1(?:-hd)?$/i.test(model) ? DEFAULT_MODEL : model;
const voice = process.env.TTS_VOICE?.trim() || DEFAULT_VOICE;
const apiKey = process.env.TTS_API_KEY?.trim();
const command = process.argv[2] || "check";

function headers(json = false) {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function request(url, options = {}, timeoutMs = 15_000) {
  return fetch(url, {
    ...options,
    headers: { ...headers(Boolean(options.body)), ...options.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function health() {
  const url = new URL(baseUrl);
  const response = await request(`${url.origin}/health`);
  if (!response.ok) throw new Error(`Speaches health check returned ${response.status}.`);
}

async function installedModels() {
  const response = await request(`${baseUrl}/models`);
  if (!response.ok) throw new Error(`Speaches model list returned ${response.status}.`);
  const payload = await response.json();
  return Array.isArray(payload?.data)
    ? payload.data.map((item) => item?.id).filter((id) => typeof id === "string")
    : [];
}

async function waitForHealth() {
  const deadline = Date.now() + 5 * 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await health();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(
    `Speaches did not become healthy at ${new URL(baseUrl).origin}. ${lastError?.message || ""}`.trim(),
  );
}

async function ensureModel() {
  if ((await installedModels()).includes(installedModel)) return false;

  console.log(`Downloading ${model}. The first download can take several minutes...`);
  const response = await request(`${baseUrl}/models/${model}`, { method: "POST" }, 15 * 60_000);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Model download returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  return true;
}

async function check() {
  try {
    await health();
  } catch (error) {
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `Speaches is not available at ${new URL(baseUrl).origin}. Run \`npm run tts:setup\`${detail}.`,
    );
  }
  const models = await installedModels();
  if (!models.includes(installedModel)) {
    throw new Error(`${installedModel} is not installed. Run \`npm run tts:setup\`.`);
  }
  console.log(`Local TTS is ready at ${baseUrl} (${model}, ${voice}).`);
}

async function smoke() {
  await check();
  const response = await request(
    `${baseUrl}/audio/speech`,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        voice,
        input: "Ecotech local narration is ready.",
        response_format: "mp3",
      }),
    },
    5 * 60_000,
  );
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Speech smoke test returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const audio = await response.arrayBuffer();
  if (audio.byteLength < 128) throw new Error("Speech smoke test returned an empty audio file.");
  console.log(`Speech smoke test passed (${audio.byteLength} bytes).`);
}

try {
  if (command === "setup") {
    await waitForHealth();
    const downloaded = await ensureModel();
    await check();
    console.log(downloaded ? "Kokoro download completed." : "Kokoro was already installed.");
  } else if (command === "smoke") {
    await smoke();
  } else if (command === "check") {
    await check();
  } else {
    throw new Error(`Unknown command: ${command}. Use setup, check, or smoke.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
