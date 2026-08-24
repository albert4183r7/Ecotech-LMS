// ============================================
// AI tasks and the model each one runs on
//
// The project makes ten distinct kinds of model call, and they do not want the
// same model. Planning a lesson outline and judging whether a quiz question is
// grounded are different jobs: one needs reasoning over a long reference
// document, the other is close to classification and wants to be cheap. Naming
// the task at the call site lets each pick what suits it, and puts every one of
// those choices on one page instead of scattering model ids through the code.
//
// Every entry can be overridden by environment variable, so a deployment with
// different hardware can move a task to a smaller or larger model without
// touching the code.
// ============================================

/** Every distinct kind of model call the project makes. */
export type AiTask =
  | "outline-planning"
  | "slide-authoring"
  | "slide-field-edit"
  | "slide-html-legacy"
  | "quiz-authoring"
  | "quiz-grounding-judge"
  | "content-evaluation"
  | "visual-evaluation"
  | "agent-tool-loop"
  | "lesson-tutor";

interface TaskModel {
  /** Model tag, as the provider names it. */
  model: string;
  /** Environment variable that overrides it. */
  envVar: string;
  /** What this task asks of a model, and why this one was picked for it. */
  rationale: string;
  /** Whether the task sends images; a text-only model cannot serve it. */
  multimodal?: boolean;
  /** Whether the task needs function calling. */
  tools?: boolean;
}

/**
 * Open-weight models, run locally through Ollama.
 *
 * Qwen2.5-Instruct does the structured work: of the freely available models it
 * is the most reliable at holding to a JSON schema, which is what most of this
 * project asks for. The 14B carries the tasks whose output is long or has to
 * satisfy tight length limits; the 7B carries the short, decidable ones, where
 * the larger model buys nothing.
 *
 * Llama 3.1 8B answers the learner, because that is a conversation and latency
 * is what the student feels. Llama 3.2 Vision is here because the visual
 * evaluator sends screenshots, and it is the only one of these that can see.
 */
export const TASK_MODELS: Record<AiTask, TaskModel> = {
  "outline-planning": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_OUTLINE_PLANNING",
    rationale:
      "Reads a reference document and plans the lesson's sections and slide budget. " +
      "The longest context and the most reasoning of any task here, and its output " +
      "has to satisfy per-field length limits that a weaker model overruns.",
  },
  "slide-authoring": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_SLIDE_AUTHORING",
    rationale:
      "Writes each slide's content to the character budget its chosen template " +
      "layout allows. Constrained writing where overrunning a limit costs a retry.",
  },
  "slide-field-edit": {
    model: "qwen2.5:7b-instruct",
    envVar: "MODEL_SLIDE_FIELD_EDIT",
    rationale:
      "Rewrites one field of one slide on an instruction. A small, local edit " +
      "returning a short object; the larger model adds latency and nothing else.",
  },
  "slide-html-legacy": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_SLIDE_HTML",
    rationale:
      "Writes raw slide HTML for the agent's authoring tools. Long output that has " +
      "to stay inside a tag and class allowlist.",
  },
  "quiz-authoring": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_QUIZ_AUTHORING",
    rationale:
      "Writes multiple-choice questions grounded in one lesson, each quoting the " +
      "sentence it came from. Needs to hold a nested schema and stay inside the " +
      "source text; the smaller model invents plausible distractors that are not " +
      "in the lesson.",
  },
  "quiz-grounding-judge": {
    model: "qwen2.5:7b-instruct",
    envVar: "MODEL_QUIZ_JUDGE",
    rationale:
      "Decides whether a question is answerable from the lesson. A verdict with a " +
      "reason, not composition — well inside what the 7B does reliably, and it runs " +
      "once per question so cost matters.",
  },
  "content-evaluation": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_CONTENT_EVALUATION",
    rationale:
      "Reviews a generated lesson for accuracy and teaching quality and writes the " +
      "revision notes the quality gate acts on. Critique is only useful if it is " +
      "specific, which is where model size shows.",
  },
  "visual-evaluation": {
    model: "llama3.2-vision:11b",
    envVar: "MODEL_VISUAL_EVALUATION",
    rationale:
      "Looks at screenshots of rendered slides for clipping and overlap. Must be " +
      "multimodal, which rules out every Qwen2.5 text model above.",
    multimodal: true,
  },
  "agent-tool-loop": {
    model: "qwen2.5:14b-instruct",
    envVar: "MODEL_AGENT_TOOL_LOOP",
    rationale:
      "Drives the agent runtime, choosing which tool to call next. Needs function " +
      "calling and enough judgement to stop when the work is done.",
    tools: true,
  },
  "lesson-tutor": {
    model: "llama3.1:8b",
    envVar: "MODEL_LESSON_TUTOR",
    rationale:
      "Answers the student's questions about the lesson they have open, streaming. " +
      "The one task a person waits on directly, so responsiveness outweighs the " +
      "extra quality of a larger model on what is a short, grounded answer.",
  },
};

/** The model to use for a task, honouring its environment override. */
export function modelFor(task: AiTask): string {
  const entry = TASK_MODELS[task];
  return process.env[entry.envVar]?.trim() || entry.model;
}

/**
 * Model ids that accept images.
 *
 * The multimodal flag above says which task *needs* to see; this says which
 * models here can. It lives next to the models rather than in the check that
 * uses it, because the answer is a property of this branch's provider: an
 * Ollama tag advertises vision in its name, and a hosted model's id does not.
 */
export const VISION_MODEL_PATTERN = /vision|llava/i;

/** Tasks needing a multimodal model, for start-up checks and documentation. */
export function isMultimodal(task: AiTask): boolean {
  return TASK_MODELS[task].multimodal === true;
}
