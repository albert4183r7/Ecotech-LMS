// ============================================
// AI tasks and the model each one runs on
//
// The project makes eight distinct kinds of model call, and they do not want the
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
  | "quiz-authoring"
  | "quiz-grounding-judge"
  | "content-evaluation"
  | "lesson-tutor"
  | "platform-help";

interface TaskModel {
  /** Model tag, as the provider names it. */
  model: string;
  /** Environment variable that overrides it. */
  envVar: string;
  /** What this task asks of a model, and why this one was picked for it. */
  rationale: string;
  /** Whether the task sends images; a text-only model cannot serve it. */
  multimodal?: boolean;
}

/**
 * Hosted models, reached through the gateway in ./provider.ts.
 *
 * Every id here has to be one the gateway actually lists — it is passed
 * through verbatim — and every one has a MODEL_* override, so a deployment on
 * a different gateway can move a task without editing this file.
 *
 * The split is the same idea as on the open-source branch: the strongest model
 * carries the tasks whose output is long, tightly constrained, or a critique
 * worth reading, and a cheaper, faster one carries the short decidable jobs
 * and the conversation a student waits on. Running everything on one model is
 * a supported choice — set the eight variables and it works — but most of these
 * calls do not need the largest model, and here they are billed.
 */
export const TASK_MODELS: Record<AiTask, TaskModel> = {
  "outline-planning": {
    model: "claude-opus-5",
    envVar: "MODEL_OUTLINE_PLANNING",
    rationale:
      "Reads a reference document and plans the lesson's sections and slide budget. " +
      "The longest context and the most reasoning of any task here, and its output " +
      "has to satisfy per-field length limits that a weaker model overruns.",
  },
  "slide-authoring": {
    model: "claude-opus-5",
    envVar: "MODEL_SLIDE_AUTHORING",
    rationale:
      "Writes each slide's content to the character budget its chosen template " +
      "layout allows. Constrained writing where overrunning a limit costs a retry.",
  },
  "slide-field-edit": {
    model: "claude-sonnet-5",
    envVar: "MODEL_SLIDE_FIELD_EDIT",
    rationale:
      "Rewrites one field of one slide on an instruction. A small, local edit " +
      "returning a short object; the stronger model buys nothing and bills more.",
  },
  "quiz-authoring": {
    model: "claude-opus-5",
    envVar: "MODEL_QUIZ_AUTHORING",
    rationale:
      "Writes multiple-choice questions grounded in one lesson, each quoting the " +
      "sentence it came from. Needs to hold a nested schema and stay inside the " +
      "source text; a weaker model invents plausible distractors that are not in " +
      "the lesson.",
  },
  "quiz-grounding-judge": {
    model: "claude-sonnet-5",
    envVar: "MODEL_QUIZ_JUDGE",
    rationale:
      "Decides whether a question is answerable from the lesson. A verdict with a " +
      "reason, not composition — well inside what the cheaper model does reliably, " +
      "and it runs once per question, so cost matters.",
  },
  "content-evaluation": {
    model: "claude-opus-5",
    envVar: "MODEL_CONTENT_EVALUATION",
    rationale:
      "Reviews a generated lesson for accuracy and teaching quality and writes the " +
      "revision notes the quality gate acts on. Critique is only useful if it is " +
      "specific, which is where model size shows.",
  },
  "platform-help": {
    model: "claude-sonnet-5",
    envVar: "MODEL_PLATFORM_HELP",
    rationale:
      "Answers questions about using Ecotech itself — where things are, what a " +
      "control does, what a role may do. Short, factual, and waited on directly, " +
      "so it is sized like the tutor rather than like the authoring tasks.",
  },
  "lesson-tutor": {
    model: "claude-sonnet-5",
    envVar: "MODEL_LESSON_TUTOR",
    rationale:
      "Answers the student's questions about the lesson they have open, streaming. " +
      "The one task a person waits on directly, so responsiveness outweighs the " +
      "extra quality of the stronger model on what is a short, grounded answer.",
  },
};

/** The model to use for a task, honouring its environment override. */
export function modelFor(task: AiTask): string {
  const entry = TASK_MODELS[task];
  return process.env[entry.envVar]?.trim() || entry.model;
}

/** Tasks needing a multimodal model, for start-up checks and documentation. */
export function isMultimodal(task: AiTask): boolean {
  return TASK_MODELS[task].multimodal === true;
}
