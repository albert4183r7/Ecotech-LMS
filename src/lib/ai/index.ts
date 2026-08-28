// ============================================
// AI layer
//
// Everything that talks to a language model. Nothing above this layer knows
// which provider is active or which model runs a given job; callers name the
// task and this decides the rest.
//
//   models.ts      which model runs which task, and why
//   provider.ts    the LangChain chat models, and the previous providers
//   structured.ts  JSON conforming to a Zod schema
//   streaming.ts   text streamed as it arrives
// ============================================

export { TASK_MODELS, modelFor, isMultimodal, type AiTask } from "./models";
export { getChatModel, BASE_URL, type ChatModelOptions } from "./provider";
export { generateStructuredJSON, type StructuredOptions } from "./structured";
export { streamText, collectStream, type StreamOptions } from "./streaming";
