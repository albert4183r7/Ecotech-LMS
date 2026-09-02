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
  UI template          what the user sees          src/app/**/*-page.tsx
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
(which panel is open, which tab is selected). A screen component holds no
`fetch` call and no workflow. Each one lives in its own route's folder, beside
the `page.tsx` that renders it; `src/components/lms/` is for what more than one
route uses.

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
│   ├── (app)/              routes behind the auth gate
│   │   └── <route>/        page.tsx (server) + <name>-page.tsx (the screen)
│   ├── learn/[lessonId]/   the classroom, deliberately outside (app):
│   │                       it is full-screen and has no site chrome
│   └── api/                endpoints, one directory per resource
│
├── components/
│   ├── lms/
│   │   ├── auth-page.tsx   the sign-in screen — two routes render it
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
    ├── agent/              the quality gate and its two critics
    ├── assistant/          the two assistants' prompts and boundaries
    ├── quiz/               generation, grounding validation, access, scoring
    ├── slides/             the two slide models, both renderers, the exporter
    │   └── import/         reading someone else's .pptx back into slides
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
| `use-pptx-download`   | exporting a lesson or a whole course to PowerPoint                                                     |
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
  provider.ts            the LangChain chat models and the error classification
  previous-providers.ts  earlier providers, commented, restorable
  structured.ts          JSON conforming to a Zod schema
  streaming.ts           text streamed as it arrives
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

Every model call is a **LangChain** chat model. The framework owns the message
types, the streaming protocol and the tool-call schema, so the files above
`provider.ts` describe what they want rather than how one vendor's HTTP API
spells it: `invoke()` for structured JSON and `stream()` for the two
assistants.

On this branch the integration is `@langchain/openai`, pointed at an
OpenAI-compatible gateway and authenticated with `ECOAPI_API_KEY`.
`provider.ts` builds a `ChatOpenAI` per task, cached by model and settings,
since each holds a connection.

Two things are deliberately _not_ delegated to the framework.
`withStructuredOutput()` is not used, because it reports a parse failure and
gives nothing to act on, and the hand-written retry in `structured.ts` is what
makes a rejected outline recoverable: it hands the model its own output and the
exact validation errors. And LangChain's own retry is switched off
(`maxRetries: 0`), because a blind repeat of a failed call is billed exactly
like the first one and is no more likely to succeed.

Error classification is per branch, because the failures differ: here they are
the ones a key and a bill bring — an exhausted quota, a key that is wrong or
expired, a model id the gateway does not sell.

### Model per task

Eight distinct kinds of model call, and they do not want the same model.
Planning an outline over a reference document and deciding whether a quiz
question is answerable from its lesson are different jobs.

| Task                     | Model             | Why this one                                                                                                 | Override                       |
| ------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `outline-planning`       | `claude-opus-5`   | Longest context and most reasoning here; output must satisfy per-field length limits a weaker model overruns | `MODEL_OUTLINE_PLANNING`       |
| `slide-authoring`        | `claude-opus-5`   | Writes to the character budget its chosen layout allows; overrunning costs a retry                           | `MODEL_SLIDE_AUTHORING`        |
| `video-script-authoring` | `claude-sonnet-5` | Grounded spoken rewriting with a strict per-scene limit; it runs beside quiz generation                      | `MODEL_VIDEO_SCRIPT_AUTHORING` |
| `quiz-authoring`         | `claude-opus-5`   | Nested schema, and must stay inside the source text — a weaker model invents distractors that are not in it  | `MODEL_QUIZ_AUTHORING`         |
| `content-evaluation`     | `claude-opus-5`   | Critique is only useful if specific, which is where model strength shows                                     | `MODEL_CONTENT_EVALUATION`     |
| `slide-field-edit`       | `claude-sonnet-5` | One short field; the stronger model buys nothing and bills more                                              | `MODEL_SLIDE_FIELD_EDIT`       |
| `quiz-grounding-judge`   | `claude-sonnet-5` | A verdict with a reason, not composition — and it runs once per question                                     | `MODEL_QUIZ_JUDGE`             |
| `lesson-tutor`           | `claude-sonnet-5` | The one task a person waits on directly; responsiveness beats the extra quality on a short grounded answer   | `MODEL_LESSON_TUTOR`           |
| `platform-help`          | `claude-sonnet-5` | Short factual answers about using the product, waited on directly like the tutor                             | `MODEL_PLATFORM_HELP`          |

The ids are passed to the gateway verbatim, so they have to be ids it lists;
the defaults assume it sells Anthropic's models. Running all eleven on one
model is a supported choice — set the eleven variables and the registry defers
to them.
The split is here because most of these calls do not need the strongest model
and every one of them is billed.

`src/lib/ai/models.ts` is the source of truth for this table.

### The other mode

This branch holds the `ChatOpenAI` implementation. `claude/llm-open-source`
holds a `ChatOllama` against a local Ollama server, exporting the same
`getChatModel` and `throwFriendlyError`, so nothing above `provider.ts` differs
between the two — and no package is installed either way, since both LangChain
integrations are dependencies on every branch. The README's
[This branch runs hosted models](../README.md#this-branch-runs-hosted-models-behind-an-api-key)
says which five files carry the difference.

`src/lib/ai/previous-providers.ts` keeps the Gemini implementation, through
`@google/genai`, commented rather than deleted. It predates LangChain, so
restoring it is a rewrite rather than a swap; it is there for reference.

---

## Workflows

A lesson is made in one of two ways, and everything after it is shared.

### Creating a lesson from a prompt

```
  instructor fills the form                create/create-course-page.tsx
        │
  useCourseDraft.ensureCourseSaved()       POST /api/courses        → draft row
        │
  useLessonWorkflow.handleGenerateOutline  POST /api/lessons/generate-outline
        │                                    └── AI: outline-planning
        │                                        one section per teaching slide
        │
  instructor reviews and edits the plan    (no model call)
        │
  useLessonWorkflow.handleGenerateSlides   POST /api/lessons/generate-slides
        │                                    ├── AI: slide-authoring, per slide
        │                                    │     compose → measure → recompose
        │                                    ├── runQualityGate
        │                                    │     ├── AI: content-evaluation
        │                                    │     └── revise and re-render
        │                                    └── Promise.allSettled
        │                                          ├── generateAndSaveQuiz
        │                                          │     ├── AI: quiz-authoring
        │                                          │     └── AI: quiz-grounding-judge
        │                                          └── generateAndSaveNarratedLesson
        │                                                ├── AI: video-script-authoring
        │                                                └── POST /audio/speech per scene
        │
  the hook polls GET /api/lessons/[id]/progress until slides, quiz and video settle
        │
  instructor previews                      /preview/[lessonId]
  instructor publishes                     PUT /api/courses/[id] status=published
```

Generation runs inside the route handler and the client polls. There is no
queue: a restart mid-run leaves slides pending until the next attempt, which a
later pass picks up.

**One section is one slide.** A deck of _n_ slides is a cover, a contents
slide, _n − 3_ teaching sections and a closing — so the planner is asked for
exactly that many sections, each teaching something the others do not. Two
slides written from one section came out saying the same thing twice, which is
what this arithmetic exists to prevent. A plan with too few sections is split
at its own slide titles; one with too many is merged. Decks shorter than six
slides drop the contents slide, since there is little to list.
`sectionsFor()` and `buildSlideSlots()` in `src/lib/presentation-plan.ts` are
the source of truth.

### Importing a deck the instructor already has

```
  Upload a Deck → upload-deck-dialog.tsx
        │
  POST /api/lessons/import-pptx           multipart: courseId, file, quiz choice
        ├── requireCourseOwner(courseId)
        ├── importPptx()                  src/lib/slides/import/
        │     ├── xml.ts        a small OOXML reader
        │     ├── colour.ts     theme colours, modifiers, opacity
        │     ├── inherit.ts    what the layout, master and theme supply
        │     └── pptx.ts       shapes, text, pictures, groups → slide HTML
        ├── slides saved READY, sanitised, with the deck kept for download
        └── generateAndSaveQuiz()         only if the instructor asked for one
        │
  straight to /preview/[lessonId]         nothing to plan, so nothing to review
```

The deck is read as it was drawn rather than reinterpreted: shapes keep their
boxes, fills, gradients and opacity; text keeps the size, weight, colour and
font it inherits from the slide, its layout, the master and the theme, in that
order. **Almost nothing in a real .pptx states its own formatting**, which is
why the inheritance chain is walked rather than skipped — reading only what a
slide carries imports every deck as black 18pt Calibri on white.

What is deliberately left out: slides hidden in PowerPoint (`show="0"`), which
are not shown in the lesson and not quizzed on; and SmartArt, charts, tables
and embedded objects, each of which leaves a warning on its slide rather than
disappearing quietly. Vector pictures are rasterised on the way in — SVG is the
one image format that can carry script.

An imported lesson has no plan behind it, so its card in the course offers
Preview and nothing else, and its slides are not editable here: they are
changed in PowerPoint and uploaded again.

### Rendering a slide

Two slide models render through one path. A **composition** is what the model
lays out itself — cards, chips, icons, text and connectors, placed as fractions
of the canvas — and it names roles rather than values, so it cannot choose a
colour, a font or a point size. **Typed content** is the older model: one of
nine template layouts filled from a `SlideContent` object. Both still render,
export and are edited field by field; new slides are compositions.

```
  SlideComposition                          SlideContent
  (composition.ts)                          (content-schema.ts)
        │                                         │
  resolveComposition()                      selectLayout() → resolveSlide()
    clamp to the margins                      layout by type and item count
    fit text to its box                       text into placeholders
    correct unreadable ink                    shrink type until it fits
    report what it could not honour
        │                                         │
    ┌───┴────┐                                ┌───┴────┐
    ▼        ▼                                ▼        ▼
  composition-render.ts                     render.ts  pptx.ts
  composition-pptx.ts                        web       PowerPoint
```

The measurement is the part a designer does by looking at the slide. Anything
it has to correct — text that would be cut off, boxes that overlap, ink that
has effectively disappeared against what it sits on — is handed back and the
slide is composed again. A model that never sees its own slide cannot know a
sentence was cut at the box edge; it only knows what it wrote.

`parseSlideDoc()` in `src/lib/slides/document.ts` is the one place that decides
which of the two a stored `contentJson` is. Nothing downstream parses it.

`scripts/parity.mts` asserts the layout path resolves to identical geometry in
both renderers. `scripts/layout-coverage.mts` asserts every content type
renders at every permitted item count. `scripts/composition-shots.mts` and
`scripts/layout-shots.mts` screenshot slides and flag any box drawn outside the
canvas.

#### The slide canvas

Every slide is authored and rendered at a fixed **1280×720** canvas and scaled
to fit its container (`wrapSlideHtml` in `src/lib/sanitize.ts`). Without a fixed
canvas the same slide lays out differently in the classroom and in a preview,
because the layout's type and spacing are absolute values, not viewport-relative
ones.

Slide styling comes from `public/slide-runtime.css`, compiled from
`src/styles/slide-runtime.css` by `npm run build:slide-css`. That runs
automatically before `dev` and `build`, and the output is not committed.
Generated slides carry colour as classes defined there; an imported slide's
colours are its own and travel as filtered inline style, which is why the
sanitiser's allowlist admits `color` and `background`.

### Generating a quiz

One quiz per lesson, written from that lesson's finished slides and nothing
else. Generating a lesson generates its quiz; an uploaded deck gets one only if
the instructor asked for one.

```
  the lesson's READY slides       loadLessonSource()
        │
  AI: quiz-authoring              N questions, each quoting the sentence
        │                          that supports its correct answer
  mechanical check                one correct option, distinct choices,
        │                          and the quote really appears in the lesson
  AI: quiz-grounding-judge        is this answerable from the lesson alone?
        │
  short of N?  ask for the difference, quoting what was rejected — 3 rounds
        │
  still short? ship what is grounded and say how many, and why
```

**How many is the instructor's choice**, beside the slide count when planning a
lesson and beside the quiz switch when uploading a deck (2–15, defaulting to
five). It was derived from the slide count, which is a guess: a short deck
taught for an hour may deserve a dozen questions and a long reference deck two.

**Each round tops up as well as repairs.** Asking once and keeping whatever
survived meant a request for ten could return three with nothing said about it.
Duplicates are caught as questions are accepted rather than at the end, since a
round that repeats itself is the same shortfall by another route.

**Grounding reads whichever script the lesson is written in.** Splitting terms
on `[^a-z0-9]` treated every Chinese character as a separator, so a Chinese
lesson produced no terms at all and its quotes could not be compared to it —
and normalising a quote to nothing made it the empty string, which every lesson
contains. CJK runs are indexed as overlapping character pairs; letters and
digits of every script survive normalisation.

A quiz that comes up short is still a quiz: what was grounded is saved and the
review panel says how many of the number asked for the lesson could support.
Only a quiz with nothing in it fails.

**Instructors write questions too.** `POST /api/quizzes/[id]/questions` adds one
by hand, and the matching `DELETE` removes one. A hand-written question carries
no source quote, because its source is the person who wrote it — inventing one
would make it look audited when it is not.

The supporting quote is stored, so grounding stays auditable rather than merely
asserted. Correct answers are stripped server-side for anyone who is not the
course's instructor, and a student reaches a quiz only when the course is
published _and_ they are enrolled.

### Generating a narrated lesson

The narrated artifact is an interactive scene player, not an encoded MP4. Each
final READY slide becomes one scene. `video-script-authoring` turns only that
slide's grounded content into concise spoken narration; the same text is the
accessible caption. Scene audio is synthesized as MP3 through an
OpenAI-compatible `POST /audio/speech` endpoint and stored under
`public/uploads/audio/<lessonId>/`.

In development that endpoint is the CPU-only Speaches service in
`compose.tts.yaml`. It defaults to the open-source
`speaches-ai/Kokoro-82M-v1.0-ONNX` model and `af_heart` voice, with a concurrency
of two scenes. `npm run tts:setup` starts the service and installs the model into
a persistent Docker volume. Before narration fans out, the backend checks
`/health` and `/v1/models`; a missing service or model produces one actionable
video error instead of one failure per scene. There is deliberately no implicit
fallback to a paid chat or speech provider.

After the quality gate, quiz and video start together with `Promise.allSettled`.
Their `READY`/`ERROR` states remain independent, which makes a TTS outage
retryable from instructor preview without regenerating slides or quiz. Editing,
renaming, reordering or deleting a source slide marks its existing narration
`STALE`. The learner player provides previous/play/next, seek, volume/mute,
speed and captions, and discloses that its voice is AI-generated.

### The quality gate

`src/lib/agent/` is now just the gate and the two critics it runs:
`generate-slides` calls `runQualityGate` between writing the slides and writing
the quiz, and it revises only the slides a critic faulted.

This directory used to hold an autonomous tool-calling runtime as well — a Zod
tool registry, a bounded loop, a visual critic, and run persistence, behind
`POST /api/agent/runs`. It worked and nothing in the application ever called
it, so it was removed rather than left as a second way to generate a lesson
that no one maintained. Its three model tasks (`agent-tool-loop`,
`visual-evaluation`, `slide-html-legacy`) and the AI-layer helpers only it used
(`tools.ts`, `vision.ts`, `slide-html.ts`) went with it.

The `AgentRun`, `AgentStep` and `Evaluation` tables are still in the schema.
Dropping them is a data decision rather than a code one, so they were left
alone; nothing writes to them now.

### The two assistants

There are two, and the split is deliberate: each answers what the other must
not.

```
  Study assistant                        Platform help
  beside the lesson                      corner of every signed-in page
  classroom/lesson-assistant.tsx         platform-chatbot.tsx
        │                                      │
  POST /api/lessons/[id]/assistant       POST /api/support/chat
    requireLessonReader(id)                requireUser()
    loadLessonSource(id)                   a written description of the product
    buildLessonContext()                   no lesson content at all
    AI: lesson-tutor                       AI: platform-help
        │                                      │
  answers from that lesson only          answers about using Ecotech only
  refuses everything else                refuses subject matter, and points
                                          at the study assistant
```

The lesson is read from the database by the id in the URL. The request has no
field that could carry material, so a client cannot widen the scope. The panel
is keyed by lesson id, so moving to the next lesson starts a new conversation
rather than carrying the last one's answers into it, and it opens with the
lesson on a desktop screen — behind an unlabelled icon it was a feature most
learners never found.

Platform help knows how the product works and nothing about what any lesson
teaches. An assistant that answered subject questions from its own knowledge
would be teaching material the course never checked, next to a lesson that says
something else.

### Taking a lesson

```
  classroom             learn/[lessonId]/classroom-page.tsx
        │
  last slide reached    POST /api/progress   completed: true
        │                 └── recomputes the enrolment: percentage from the
        │                     progress rows, status and completedAt with it
  "Take the quiz"       /quizzes/[quizId]    when the lesson has one
        │
  otherwise             the next lesson
```

Progress belongs to an enrolment, and an enrolment to a person; both are
checked on every read and write. A lesson is marked complete when its last
slide is reached, and the course is marked complete when its last lesson is.

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
npm run verify        # 61 checks + layout coverage + parity + deck check
npm run build         # production build
```

`npm run verify` runs four scripts in order and stops at the first failure.
None of them need an API key or a database:

| Script                | Asks                                                                     |
| --------------------- | ------------------------------------------------------------------------ |
| `verify.mts`          | 61 checks — the invariants below                                         |
| `layout-coverage.mts` | every layout the model may choose actually renders                       |
| `parity.mts`          | the web view and the PPTX export say the same thing                      |
| `deck-check.mts`      | an exported `.pptx` really contains the shapes, text and icons it should |

`verify.mts` covers, in order: outline repair and the shape of a deck; text
fitting and the template's own values; field addressing and the sanitiser; the
layout registry; the AI task registry (every task names a model and an
override, they are not all the same model, the vision task is on a multimodal
model); the assistants' lesson boundary; quiz grounding in Latin and CJK text,
repair, and the instructor's question count; and the import path — the XML
reader, a real `.pptx` with its geometry and colour, a screened-back shape, a
hidden slide staying out, and a file that is not a presentation being refused
rather than half-read.

`deck-check.mts` exists because the web view and the exporter are two separate
renderers over one slide model, and a slide can look right in the browser while
the exporter quietly skips something. It builds a deck, unzips it and reads the
XML: the shapes are there, the text is there, and the icon images are in
`ppt/media/`. Icons were missing from exports for a while precisely because
nothing checked this.

---

## Known limitations

- **Role mode is session-scoped.** Every account has Student and Instructor
  capabilities. The selected mode is signed into the session, and every
  authorization decision checks that active mode.
- **`AgentRun.lessonId` is `onDelete: SetNull`.** Both API delete paths clear
  agent runs in the same transaction, but the database does not enforce it.
- **Generation is fire-and-forget** inside a route handler, with client polling
  and no queue.
- **Type errors are ignored at build time** (`typescript.ignoreBuildErrors`).
  The backlog is currently zero; run `npx tsc --noEmit` to keep it there.
- **SmartArt, charts and tables do not import.** A deck that uses them loses
  those objects; each leaves a warning on its slide rather than disappearing
  silently.
- **Uploaded slides cannot be edited in the app.** They are shown as uploaded;
  changing them means editing the .pptx and uploading it again.
- **No automated test suite** beyond `scripts/verify.mts`.
