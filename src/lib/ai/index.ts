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
//   tools.ts       one turn with function calling
//   vision.ts      structured JSON over images
//   slide-html.ts  the agent's HTML-authoring prompts
// ============================================

export { TASK_MODELS, modelFor, isMultimodal, VISION_MODEL_PATTERN, type AiTask } from "./models";
export { getChatModel, BASE_URL, type ChatModelOptions } from "./provider";
export { generateStructuredJSON, type StructuredOptions } from "./structured";
export { streamText, collectStream, type StreamOptions } from "./streaming";
export {
  generateWithTools,
  type ToolCallRequest,
  type ModelTurn,
  type AgentMessage,
  type ImageInput,
  type ToolDeclaration,
} from "./tools";
export { generateStructuredFromImages } from "./vision";
export {
  streamSlideHtml,
  generateText,
  SLIDE_HTML_SYSTEM_PROMPT,
  INLINE_EDIT_SYSTEM_PROMPT,
  ELEMENT_EDIT_SYSTEM_PROMPT,
} from "./slide-html";
