# Architecture

How this project is laid out, what each layer is responsible for, which model
runs which AI task, and how a request travels from a click to the database and
back.

This describes what is in the repository, including the parts that are untidy.
Where something is a known weakness it says so rather than describing the shape
it ought to have.

---

## Layers

Five layers, each with one job. The rule is that a layer may call the one below
it and never the one above.

```
  UI template          what the user sees          src/components/lms/**
        │
  frontend logic       what happens when they act  src/hooks/**, src/stores/**
        │
  endpoints            the HTTP contract           src/app/api/**/route.ts
        │
  domain + AI          the actual work             src/lib/**
        │
  data                 Prisma + SQLite             prisma/schema.prisma
```

**UI template** — React components. Markup, layout and presentational state
(which panel is open, which tab is selected). A page component holds no `fetch`
call and no workflow.

**Frontend logic** — hooks own the behaviour behind a screen: what to load, what
to send, what to do with the response. A screen with real workflow behind it has
a hook named after that workflow.

**Endpoints** — thin. Parse the request, authorize it, call the domain layer,
shape a response. Business rules do not live here; authorization does, because
that is the only place it can be enforced.

**Domain and AI** — everything that is not React and not HTTP. Slide layout,
quiz grounding, session verification, PPTX export, and every model call.

---

## Directory map

```
src/
├── app/
│   ├── (app)/              routes behind the auth gate — the pages
│   ├── learn/[lessonId]/   the classroom, deliberately outside (app):
│   │                       it is full-screen and has no site chrome
│   └── api/                endpoints, one directory per resource
│
├── components/
│   ├── lms/
│   │   ├── pages/          one component per screen — templates
│   │   ├── create-course/  outline card, and model.ts (limits + draft builder)
│   │   ├── classroom/      notes sidebar, lesson assistant, confetti
│   │   ├── quiz/           quiz runner (student), review panel (instructor)
│   │   ├── my-learning/    course cards, stats, placeholders
│   │   └── *.tsx           navbar, footer, dialogs, shared widgets
│   └── ui/                 shadcn/ui primitives — do not edit by hand
│
├── hooks/                  frontend logic (see below)
├── stores/lms-store.ts     Zustand: session identity, cross-screen handoffs
├── styles/                 globals.css, slide-runtime.css
├── types/lms.ts            shapes shared across screens
│
└── lib/
    ├── ai/                 every model call — see "The AI layer"
    ├── agent/              tool registry, runtime, evaluators, quality gate
    ├── assistant/          the lesson tutor's prompt and boundary
    ├── quiz/               generation, grounding validation, access, scoring
    ├── slides/             content schema, template layouts, both renderers
    ├── render/             Playwright rasterisation
    ├── session.ts          signed cookies and the authorization helpers
    ├── sanitize.ts         HTML allowlist and the slide canvas wrapper
    ├── extract-doc.ts      reference document text extraction
    └── api-response.ts     ok/fail/handleRoute, one error shape
```

### Hooks

| Hook                  | Owns                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| `use-course-draft`    | the course record: fields, URL-backed draft id, categories, reopening a saved course, save and publish |
| `use-lesson-workflow` | plan an outline, edit it, generate its slides and quiz, poll for progress                              |
| `use-course-uploads`  | cover image and reference document uploads                                                             |
| `use-classroom-state` | loads a lesson and its course, builds the classroom state                                              |
| `use-lesson-notes`    | the notes panel                                                                                        |
| `use-navigation`      | route helpers shared by every screen                                                                   |
| `use-mobile`          | the one breakpoint the layout branches on                                                              |

`create-course-page.tsx` is the worked example of the split: the page is the
template, `use-course-draft` and `use-lesson-workflow` are the behaviour, and
`create-course/model.ts` holds what both need. The page makes no `fetch` call.

The two hooks meet in one place. Reopening a saved course reads both the course
fields and its lessons, so `use-course-draft` exposes `loadedLessons` as state
and `use-lesson-workflow` adopts it in an effect — one direction, no callback
into a hook that does not exist yet.

---

## The AI layer

`src/lib/ai/` is the only place that talks to a model. Nothing above it knows
which provider is running or which model serves a given job.

```
  models.ts              which model runs which task, and why
  provider.ts            the transport and its error classification
  previous-providers.ts  earlier providers, commented, restorable
  structured.ts          JSON conforming to a Zod schema
  streaming.ts           text streamed as it arrives
  tools.ts               one turn with function calling
  vision.ts              structured JSON over images
  slide-html.ts          the agent's HTML-authoring prompts
  index.ts               the public surface
```

A caller names the **task**, not a model:

```ts
const plan = await generateStructuredJSON(prompt, PresentationPlanSchema, {
  task: "outline-planning",
  systemInstruction: PLANNER_SYSTEM,
});
```

TypeScript requires `task`, so a new call site cannot silently inherit whatever
model happens to be the default.

### Provider

Open-source models run locally through **Ollama**, which serves an
OpenAI-compatible `/v1/chat/completions`. The transport, streaming and
tool-calling code are the same ones the previous hosted gateway used; what
changed is the base URL and the model each task names. No API key is involved.

```bash
ollama serve
ollama pull qwen2.5:14b-instruct
ollama pull qwen2.5:7b-instruct
ollama pull llama3.1:8b
ollama pull llama3.2-vision:11b
```

Error classification is _not_ shared with the hosted implementation, because the
failures differ: there is no quota and no key to get wrong, but the server may
not be running and the model may not have been pulled. Those are what it reports.

### Model per task

Ten distinct kinds of model call, and they do not want the same model. Planning
an outline over a reference document and deciding whether a quiz question is
answerable from its lesson are different jobs.

| Task                   | Model                  | Why this one                                                                                                          | Override                   |
| ---------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `outline-planning`     | `qwen2.5:14b-instruct` | Longest context and most reasoning here; output must satisfy per-field length limits a weaker model overruns          | `MODEL_OUTLINE_PLANNING`   |
| `slide-authoring`      | `qwen2.5:14b-instruct` | Writes to the character budget its chosen layout allows; overrunning costs a retry                                    | `MODEL_SLIDE_AUTHORING`    |
| `slide-html-legacy`    | `qwen2.5:14b-instruct` | Long output that has to stay inside a tag and class allowlist                                                         | `MODEL_SLIDE_HTML`         |
| `quiz-authoring`       | `qwen2.5:14b-instruct` | Nested schema, and must stay inside the source text — the 7B invents plausible distractors that are not in the lesson | `MODEL_QUIZ_AUTHORING`     |
| `content-evaluation`   | `qwen2.5:14b-instruct` | Critique is only useful if specific, which is where model size shows                                                  | `MODEL_CONTENT_EVALUATION` |
| `agent-tool-loop`      | `qwen2.5:14b-instruct` | Needs function calling and enough judgement to stop                                                                   | `MODEL_AGENT_TOOL_LOOP`    |
| `slide-field-edit`     | `qwen2.5:7b-instruct`  | One short field; the larger model adds latency and nothing else                                                       | `MODEL_SLIDE_FIELD_EDIT`   |
| `quiz-grounding-judge` | `qwen2.5:7b-instruct`  | A verdict with a reason, not composition — and it runs once per question                                              | `MODEL_QUIZ_JUDGE`         |
| `lesson-tutor`         | `llama3.1:8b`          | The one task a person waits on directly; responsiveness beats the extra quality on a short grounded answer            | `MODEL_LESSON_TUTOR`       |
| `visual-evaluation`    | `llama3.2-vision:11b`  | Sends screenshots. The only task that needs to see                                                                    | `MODEL_VISUAL_EVALUATION`  |

Qwen2.5-Instruct does the structured work because of the freely available models
it is the most reliable at holding to a JSON schema, which is what most of this
project asks for. The 14B carries the tasks whose output is long or tightly
constrained; the 7B carries the short, decidable ones.

`src/lib/ai/models.ts` is the source of truth for this table.

### Restoring a hosted provider

`src/lib/ai/previous-providers.ts` keeps both earlier implementations —
Claude via the EcoAPI gateway, and Gemini before it — commented rather than
deleted. Both speak the same shapes to the rest of the AI layer, so restoring
one means moving its client construction and error classification into
`provider.ts` and setting `models.ts` back to model ids that provider serves.
`.env.example` keeps their variables for the same reason.

---

## Workflows

### Creating a lesson

```
  instructor fills the form                create-course-page.tsx  (template)
        │
  useCourseDraft.ensureCourseSaved()       POST /api/courses        → draft row
        │
  useLessonWorkflow.handleGenerateOutline  POST /api/lessons/generate-outline
        │                                    └── AI: outline-planning
        │                                        sections + slide budget
        │
  instructor reviews and edits the plan    (no model call)
        │
  useLessonWorkflow.handleGenerateSlides   POST /api/lessons/generate-slides
        │                                    ├── AI: slide-authoring, per slide
        │                                    ├── runQualityGate
        │                                    │     ├── AI: content-evaluation
        │                                    │     └── revise and re-render
        │                                    └── generateAndSaveQuiz
        │                                          ├── AI: quiz-authoring
        │                                          └── AI: quiz-grounding-judge
        │
  the hook polls GET /api/lessons/[id]     until every slide is READY and the
                                            quiz has settled
        │
  instructor previews                      /preview/[lessonId]
  instructor publishes                     PUT /api/courses/[id] status=published
```

Generation runs inside the route handler and the client polls. There is no
queue: a restart mid-run leaves slides pending until the next attempt, which a
later pass picks up.

### Rendering a slide

One structured content object drives both outputs, which is why the deck and the
lesson view are the same slide rather than two designs that resemble each other.

```
  SlideContent (content-schema.ts)
        │
  selectLayout()      picks a layout from the .pptx template by type and count
        │
  resolveSlide()      text into placeholders, shrinking type until it fits
        │
    ┌───┴────┐
    ▼        ▼
  render.ts  pptx.ts        web HTML          PowerPoint
```

`scripts/parity.mts` asserts the two resolve to identical geometry.
`scripts/layout-coverage.mts` asserts every content type renders at every
permitted item count. `scripts/layout-shots.mts` screenshots one slide per
layout and flags any box drawn outside the canvas.

### A student asking the assistant

```
  classroom side panel        lesson-assistant.tsx
        │
  POST /api/lessons/[id]/assistant
        ├── requireLessonReader(id)   instructor, or enrolled + published
        ├── loadLessonSource(id)      the same function the quiz grounds on
        ├── buildLessonContext()      a window around the current slide
        └── AI: lesson-tutor          streamed back as plain text
```

The lesson is read from the database by the id in the URL. The request has no
field that could carry material, so the scope cannot be widened by the client.
The panel is keyed by lesson id, so moving to the next lesson starts a new
conversation rather than carrying the last one's answers into it.

---

## Authorization

Every rule is enforced server-side. The frontend hides what the user cannot do;
that is a convenience, never the control.

| Helper                  | Rule                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| `requireUser()`         | a valid signed session, else 401                                               |
| `requireCourseOwner()`  | the session user created the course, else 404                                  |
| `requireLessonOwner()`  | the session user created the lesson's course, else 404                         |
| `requireLessonReader()` | the course's instructor, or a student enrolled in it while published, else 404 |
| `mayReadLesson()`       | the same rule as a boolean, for endpoints that check several lessons           |
| `resolveQuizAccess()`   | the quiz rule: owner sees answers, enrolled student does not                   |

Content the caller may not see is reported as **not found**, not forbidden, so
ids cannot be enumerated. The single exception is a quiz on a _published_ course
the caller has not enrolled in: its lessons are already listed publicly, so 403
with "you are not enrolled" is more useful and conceals nothing.

Writes never take the acting user from the request body. `POST /api/courses`
takes `creatorId` from the session; so do favourites, ratings, notes, comments,
enrolments and progress.

---

## Conventions

- **Comments say why, not what.** A comment that restates the line below it is
  noise; one that records why a value is what it is, or what broke without it,
  is why the file is readable a month later.
- **Endpoints answer in one shape.** `ok(data)` / `fail(message, status)` from
  `api-response.ts`. `handleRoute` maps an `AuthorizationError` to its status;
  handlers with their own try/catch use `authFailure(error)` for the same.
- **A refusal is not a failure.** An expired session is 401, not 500.
- **Deterministic where it can be.** Authorization, scoring, layout selection,
  geometry, persistence and navigation are code. The model writes content,
  evaluates it, and answers questions.

---

## Checks

```bash
npm run lint          # eslint, zero warnings
npx tsc --noEmit      # zero errors
npm run verify        # 29 checks + layout coverage + web/PPT parity
npm run build         # production build
```

`scripts/verify.mts` covers outline repair, template resolution, field
addressing, sanitiser behaviour, quiz grounding and repair, the layout registry,
the assistant's lesson boundary, and the AI task registry.

---

## Known limitations

- **Passwords are stored and compared in plaintext.** `api/auth/login` does
  `user.password !== password`. Fixing it needs hashing and a re-hash of the
  seeded accounts.
- **`AgentRun.lessonId` is `onDelete: SetNull`.** Both API delete paths clear
  agent runs in the same transaction, but the database does not enforce it.
- **`/api/agent/runs` has no UI.** The autonomous agent runtime works and is
  authorized, but nothing in the app calls it.
- **Generation is fire-and-forget** inside a route handler, with client polling
  and no queue.
- **Type errors are ignored at build time** (`typescript.ignoreBuildErrors`).
  The backlog is currently zero; run `npx tsc --noEmit` to keep it there.
- **`src/lib/slides/icons.ts` is unreferenced.** The template layouts use their
  own numbered badges, and the slide content schema still asks the model for an
  `icon` that the renderer discards.
- **No automated test suite** beyond `scripts/verify.mts`.
