# Ecotech LMS

A learning-management app that turns a prompt into a presentation-style lesson. An
instructor describes a topic, chooses a slide count and a language, and optionally
uploads reference documents; the system plans the presentation as logical sections,
shows that plan for review, and then generates every slide.

Built with Next.js 16 (App Router), Prisma + SQLite, and open-source models
run locally through Ollama.

---

## Stack

| Layer     | Choice                                                  |
| --------- | ------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5         |
| Styling   | Tailwind CSS v4, shadcn/ui (Radix primitives)           |
| Data      | Prisma 6 + SQLite                                       |
| State     | Zustand (`src/stores/lms-store.ts`)                     |
| LLM       | Open-source models via Ollama — one per task, see below |
| Rendering | Playwright (headless Chromium) for slide rasterisation  |
| Export    | `pptxgenjs`                                             |
| Runtime   | Node.js 20+ / npm                                       |

## Features

- **Two-phase generation** — the model plans sections first; slides are only written after the plan is reviewed
- **Slide budget** — the requested slide count is honoured exactly, including the title slide
- **Reference grounding** — upload PDF, DOCX, PPTX, TXT, CSV, XLSX or MD to ground the content
- **Slide editing** — whole-slide AI edits, plus click-to-edit on a single element
- **Courses & enrolment** — categories, ratings, favourites, cover images
- **Learner tools** — per-lesson progress, notes, threaded comments
- **Gamification** — XP, achievements, daily challenges, streaks, leaderboard
- **PPTX export** — download a lesson as a PowerPoint file built from the same slide
  model and template as the web view; a course exports one file per lesson, zipped
- **Lesson preview** — instructors review the outline, every slide and the lesson's quiz
  before publishing, and edit any text on a slide by clicking it
- **Quizzes** — every generated lesson gets its own multiple-choice quiz, grounded in that
  lesson alone, scored automatically when a student submits

---

## How generation works

### Phase one — plan the presentation

`POST /api/lessons/generate-outline` takes the prompt, slide count, language and any
reference files. The model returns **sections**, not slides: each with a summary, the
specific subtopics it must teach, and a share of the slide budget.

Sections are deliberately independent of slide count. The model decides how many
sections a subject needs; `src/lib/presentation-plan.ts` then reconciles its budget
with the user's request — redistributing slides, and merging sections only when there
are fewer slides than sections. Nothing is ever dropped to make the numbers fit.

The plan is persisted as `Section` rows plus one empty `Slide` row per allocated slot,
and shown in the outline preview with its per-section slide counts.

### Phase two — write the slides

`POST /api/lessons/generate-slides` reads the approved sections from the database and
generates each slide. It does not re-plan.

Each slide is requested as **structured content**, never HTML. The model returns a flat
draft — a type, a title and a uniform `blocks` array — which `src/lib/slides/draft.ts`
narrows into typed content (`concept`, `comparison`, `process`, `architecture`,
`caseStudy`, `data`, `summary`, `title`, `closing`). Where the chosen type cannot be
satisfied by what came back, it degrades to a simpler layout rather than failing.

`src/lib/slides/render.ts` then lays that content out. Visual quality is owned by the
renderer, not by the model, so a thin answer cannot become a slide full of empty space.

Each layout draws icons, panels and connectors rather than plain text blocks: every
content block carries an icon name, resolved against the set in
`src/lib/slides/icons.ts` — an unknown or missing name falls back to one inferred from
the block's own text, so a slide never renders without one. Icons are inline SVG,
because a slide is rendered inside a sandboxed iframe and rasterised by headless
Chromium, neither of which can be relied on to fetch an external asset. Themes in
`src/lib/slides/theme.ts` supply the palette, the gradients and the colour of the
decorative shapes bled off each slide's corners.

### Templates

A template is data — hex colours, font stacks, a point scale — in
`src/lib/slides/template.ts`. The default is the Ecotech house deck, entered from the
supplied `.pptx`. One template drives every representation of a slide: the web renderer
resolves colour roles through CSS custom properties, and the PowerPoint renderer in
`src/lib/slides/pptx.ts` reads the same values directly. Both consume the same
`SlideContent`, so the exported deck, the instructor preview, the published lesson and
the student view cannot drift apart.

```
        SlideContent + SlideTemplate
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
   render.ts (web)      pptx.ts (PowerPoint)
```

### Quizzes

Generating a lesson generates its quiz — one per lesson, written from that lesson's
finished slides and nothing else. Each question must quote the sentence supporting its
correct answer, and that quote is stored so grounding stays auditable. Every question is
checked mechanically (one correct option, distinct choices, a quote that appears in the
lesson) and then judged against the lesson by the model; failures are regenerated with
the reason quoted back, and anything still ungrounded after two passes is dropped rather
than shipped. Correct answers are stripped server-side for anyone who is not the course's
instructor, and students reach a quiz only when the course is published _and_ they are
enrolled.

### The slide canvas

Every slide is authored and rendered at a fixed **1280×720** canvas and scaled to fit
its container (`wrapSlideHtml` in `src/lib/sanitize.ts`). Without a fixed canvas the
same slide lays out differently in the classroom and in a preview, because the model's
type and spacing values are measured against the viewport.

Slide styling comes from `public/slide-runtime.css`, compiled from
`src/styles/slide-runtime.css`. It is generated by `npm run build:slide-css`, which
runs automatically before `dev` and `build`, and is not committed.

### Agent layer

`src/lib/agent/` contains a tool-calling runtime: a registry of Zod-typed tools, a loop
with step, token and time limits, content and pedagogy critics, a visual critic that
judges rendered slides, and run persistence (`AgentRun`, `AgentStep`, `Evaluation`).
`POST /api/agent/runs` starts a run; `GET /api/agent/runs?lessonId=…` reports progress.

This layer is functional but is **not** on the default generation path — the two phases
above are. Start it on a throwaway lesson first.

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- [Ollama](https://ollama.com), for the models. No API key is needed.

### 1. Install

```bash
npm install
npx playwright install chromium

ollama pull qwen2.5:14b-instruct     # planning, authoring, evaluation
ollama pull qwen2.5:7b-instruct      # short edits and judgements
ollama pull llama3.1:8b              # the lesson assistant
ollama pull llama3.2-vision:11b      # visual evaluation
```

Chromium is required for slide rendering, the visual critic and the PPTX export. If it
cannot be downloaded, set `CHROMIUM_EXECUTABLE_PATH` to a Chrome already on the machine.

### 2. Configure

```bash
cp .env.example .env
```

```
DATABASE_URL=file:../db/custom.db
SESSION_SECRET=a-32-character-or-longer-random-string
```

Nothing else is required: Ollama needs no key, and every model has a default.

> **The `..` is deliberate.** Prisma resolves a relative SQLite path from
> `prisma/schema.prisma`, not the project root, so `file:./db/custom.db` would create
> `prisma/db/custom.db` and leave the intended database untouched. See `db/README.md`.

| Variable                   | Default                     | Purpose                                                 |
| -------------------------- | --------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`             | —                           | SQLite path, relative to `prisma/`                      |
| `SESSION_SECRET`           | —                           | Signs session cookies; 32+ chars, required in prod      |
| `OLLAMA_BASE_URL`          | `http://127.0.0.1:11434/v1` | Where Ollama is; must have `/chat/completions` under it |
| `OLLAMA_MAX_TOKENS`        | `4096`                      | Ceiling for one generation                              |
| `OLLAMA_TIMEOUT_MS`        | `300000`                    | Local generation on CPU is slow                         |
| `OLLAMA_API_KEY`           | unset                       | Only if Ollama sits behind an authenticating proxy      |
| `MODEL_*` (ten of them)    | see below                   | Move one AI task to a different model                   |
| `CHROMIUM_EXECUTABLE_PATH` | unset                       | System Chromium for the renderer                        |
| `IMAGEKIT_URL_ENDPOINT`    | unset                       | Enables AI-generated images in slides                   |

**One model per task.** The project makes ten distinct kinds of model call and
they do not want the same model — planning an outline and judging whether a quiz
question is grounded are different jobs. Each names its own:

| Task                   | Model                  | Override                   |
| ---------------------- | ---------------------- | -------------------------- |
| `outline-planning`     | `qwen2.5:14b-instruct` | `MODEL_OUTLINE_PLANNING`   |
| `slide-authoring`      | `qwen2.5:14b-instruct` | `MODEL_SLIDE_AUTHORING`    |
| `slide-html-legacy`    | `qwen2.5:14b-instruct` | `MODEL_SLIDE_HTML`         |
| `quiz-authoring`       | `qwen2.5:14b-instruct` | `MODEL_QUIZ_AUTHORING`     |
| `content-evaluation`   | `qwen2.5:14b-instruct` | `MODEL_CONTENT_EVALUATION` |
| `agent-tool-loop`      | `qwen2.5:14b-instruct` | `MODEL_AGENT_TOOL_LOOP`    |
| `slide-field-edit`     | `qwen2.5:7b-instruct`  | `MODEL_SLIDE_FIELD_EDIT`   |
| `quiz-grounding-judge` | `qwen2.5:7b-instruct`  | `MODEL_QUIZ_JUDGE`         |
| `lesson-tutor`         | `llama3.1:8b`          | `MODEL_LESSON_TUTOR`       |
| `visual-evaluation`    | `llama3.2-vision:11b`  | `MODEL_VISUAL_EVALUATION`  |

Why each model was chosen is in `src/lib/ai/models.ts`, next to the choice.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) has the full table.

**Restoring a hosted provider.** Claude via the EcoAPI gateway, and Gemini
before it, are kept commented in `src/lib/ai/previous-providers.ts`. Both speak
the same shapes to the rest of the AI layer, so restoring one means moving its
client construction and error classification into `src/lib/ai/provider.ts` and
setting `models.ts` back to model ids that provider serves. `.env.example` keeps
their variables.

### 3. Database

```bash
npm run db:generate
npm run db:push
npm run db:seed   # optional demo content
```

### 4. Run

```bash
npm run dev
```

---

## Scripts

| Script                            | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Dev server on port 3000 (builds the slide stylesheet first) |
| `npm run build`                   | Production build, standalone output                         |
| `npm run start`                   | Serve the production build                                  |
| `npm run lint`                    | ESLint                                                      |
| `npm run format` / `format:check` | Prettier                                                    |
| `npm run build:slide-css`         | Compile the slide stylesheet                                |
| `npm run db:push`                 | Push schema to the database                                 |
| `npm run db:generate`             | Regenerate the Prisma client                                |
| `npm run db:migrate`              | Create and apply a migration                                |
| `npm run db:reset`                | Drop and recreate the database                              |
| `npm run db:seed`                 | Load demo courses                                           |

## Project structure

```
src/
├── app/
│   ├── (app)/          pages behind the auth gate
│   ├── learn/          the classroom, full-screen and outside the gate's chrome
│   └── api/            endpoints, one directory per resource
├── components/lms/     screens (pages/) and feature components
├── hooks/              frontend logic behind the screens
├── lib/
│   ├── ai/             every model call, and which model runs which task
│   ├── agent/          tool registry, runtime, evaluators, quality gate
│   ├── assistant/      the lesson tutor's prompt and boundary
│   ├── quiz/           generation, grounding, access, scoring
│   ├── slides/         content schema, template layouts, both renderers
│   ├── render/         Playwright rasterisation
│   ├── session.ts      signed cookies and the authorization helpers
│   └── sanitize.ts     HTML allowlist and the slide canvas
├── stores/             Zustand
└── types/
```

The layer boundaries, the hook-per-workflow table, the model-per-task table and
the main workflows end to end are in
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Data model

`User`, `Category`, `Course`, `Lesson`, `Section`, `Slide`, `Enrollment`, `Progress`,
`Note`, `Comment`, `Rating`, `Favorite`, `Notification`, `AgentRun`, `AgentStep`,
`Evaluation` — see `prisma/schema.prisma`.

A `Lesson` owns `Section`s; a `Section` owns several `Slide`s. Sections are the unit of
planning, slides are the unit of display.

---

## Known limitations

- **Passwords are stored and compared in plaintext.** `api/auth/login` does
  `user.password !== password`. Sessions themselves are signed cookies verified
  server-side, and every endpoint authorizes against them.
- **Generation is fire-and-forget** within a route handler, with client polling.
  A pass picks up slides left in `ERROR` or stale in `GENERATING`, so failures
  are recoverable, but there is no queue and a restart mid-run leaves slides
  pending until the next attempt.
- **`/api/agent/runs` has no UI.** The autonomous agent runtime works and is
  authorized, but nothing in the app calls it.
- **AI image generation is config-gated.** Without `IMAGEKIT_URL_ENDPOINT` the
  sanitizer blocks external images and slides are built from CSS and type alone.
- **Type errors are ignored at build time** (`typescript.ignoreBuildErrors` in
  `next.config.ts`). The backlog is currently zero; `npx tsc --noEmit` keeps it
  honest.
- **No automated test suite** beyond `npm run verify`.
