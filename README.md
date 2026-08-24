# Ecotech LMS

A learning-management app that turns a prompt into a presentation-style lesson. An
instructor describes a topic, chooses a slide count and a language, and optionally
uploads reference documents; the system plans the presentation as logical sections,
shows that plan for review, and then generates every slide.

Built with Next.js 16 (App Router), Prisma + SQLite, and LangChain over
open-source models run locally through Ollama — with a hosted, API-key provider
one branch away.

---

## Stack

| Layer     | Choice                                                  |
| --------- | ------------------------------------------------------- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5         |
| Styling   | Tailwind CSS v4, shadcn/ui (Radix primitives)           |
| Data      | Prisma 6 + SQLite                                       |
| State     | Zustand (`src/stores/lms-store.ts`)                     |
| AI        | LangChain — `@langchain/core`, `@langchain/ollama`      |
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

## How it works

An instructor describes a topic; the model plans the lesson as **sections**, not
slides, each with the subtopics it must teach and a share of the slide budget.
That plan is shown for review before anything is written.

Once approved, each slide is generated as **structured content** — never HTML —
and laid out by picking a layout from the supplied `.pptx` template and filling
its placeholders. Visual quality is owned by the renderer, so a thin answer
cannot become a slide full of empty space, and the same content object drives
both the web view and the PowerPoint export.

Every generated lesson also gets a quiz, written from that lesson's slides and
nothing else, with each question quoting the sentence that supports its answer.

```
  prompt → sections (reviewed) → slides → quality gate → quiz → preview → publish
```

The full picture — the layers, every workflow drawn end to end, and which model
runs which AI task — is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

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

| Variable                   | Default                  | Purpose                                                    |
| -------------------------- | ------------------------ | ---------------------------------------------------------- |
| `DATABASE_URL`             | —                        | SQLite path, relative to `prisma/`                         |
| `SESSION_SECRET`           | —                        | Signs session cookies; 32+ chars, required in prod         |
| `OLLAMA_BASE_URL`          | `http://127.0.0.1:11434` | Where Ollama is; a trailing `/v1` is accepted and stripped |
| `OLLAMA_MAX_TOKENS`        | `4096`                   | Ceiling for one generation                                 |
| `OLLAMA_API_KEY`           | unset                    | Only if Ollama sits behind an authenticating proxy         |
| `MODEL_*` (ten of them)    | see below                | Move one AI task to a different model                      |
| `CHROMIUM_EXECUTABLE_PATH` | unset                    | System Chromium for the renderer                           |

**One model per task.** The project makes ten distinct kinds of model call and
they do not want the same model — planning an outline and judging whether a quiz
question is grounded are different jobs. Each names its own, and each has a
`MODEL_*` override. The table, with the reasoning for every choice, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#model-per-task); the source of truth
is `src/lib/ai/models.ts`.

**Running on an API key instead.** That is a branch, not a setting — see
[Two ways to run the models](#two-ways-to-run-the-models) below.

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

## This branch runs local, open-source models

Every model call goes through LangChain, and `src/lib/ai/provider.ts` on this
branch builds a **`ChatOllama`** per task. No API key is involved and nothing
leaves the machine.

The same application on a hosted provider is **`claude/llm-api-key`**, which
swaps that one file for a `ChatOpenAI` against a gateway. Both are cut from
`claude/ai-agent-architecture-mo8v7d`, the base branch, which is where every
change that is not about the provider belongs.

```bash
git checkout claude/llm-api-key   # the other mode
```

Five files differ between the two — `provider.ts`, `models.ts`, `.env.example`,
this README and `docs/ARCHITECTURE.md`. Everything else is shared, so a change
to anything else goes on the base branch and is merged outward:

```bash
git merge claude/ai-agent-architecture-mo8v7d
```

### What this mode needs

Ollama, and the four models pulled — both are in
[Getting started](#getting-started) above. The RAM to hold a 14B model is the
real requirement; on a machine that cannot, move the heavier tasks to the 7B
with the `MODEL_*` overrides, or use the API-key branch.

### Using a different local server

Anything that speaks Ollama's API works by pointing `OLLAMA_BASE_URL` at it.
For a runtime that speaks the OpenAI surface instead (vLLM, LM Studio,
llama.cpp's server), the API-key branch is the closer starting point: set
`ECOAPI_BASE_URL` to that server and leave the key empty if it does not check
one.

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
│   ├── (app)/          routes behind the auth gate
│   │   ├── page.tsx        the route
│   │   ├── home-page.tsx   its UI, colocated
│   │   └── courses/, create/, dashboard/, profile/, quizzes/, preview/
│   ├── learn/          the classroom, full-screen and outside the gate's chrome
│   └── api/            endpoints, one directory per resource
├── components/lms/     components shared across routes; ui/ is shadcn
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

**Route UI lives with its route.** A route folder holds `page.tsx` and the
component it renders — `create/page.tsx` and `create/create-course-page.tsx`
sit together. This is the App Router's colocation rule: anything in `app/` that
is not `page`, `layout`, `route` or another reserved filename is not routable,
so a route's own files are safe to keep there. Only components used by more
than one route go up to `src/components/lms/`.

**`page.tsx` is a Server Component; the screen below it is a Client
Component.** The page declares the route, composes the guards
(`RoleGuard`, `Suspense`) and stays on the server; the `"use client"` directive
sits on the screen itself, which is where the state and effects are. The
exception is `learn/[lessonId]/page.tsx`, which reads the session store to
decide between the classroom and the sign-in screen and is therefore a client
component itself.

This is a client-first application — the screens fetch through hooks against
`app/api/**`, rather than the pages fetching on the server and streaming.
That is a deliberate trade, not an accident: the UI was built against those
endpoints, and moving the fetching into server components would change how
every screen loads. What the boundary above buys today is that the route
modules themselves stay out of the client bundle and can take `metadata` or
server-side data loading later, one route at a time, without a rewrite.

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

Passwords are plaintext, generation is fire-and-forget with client polling, and
there is no test suite beyond `npm run verify`. The full list, with what each
one actually means, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-limitations).
