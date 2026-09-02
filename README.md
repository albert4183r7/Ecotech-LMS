# Ecotech LMS

A learning-management app whose lessons are presentations. An instructor either
**describes a topic** — the system plans the lesson, shows the plan for review and
then composes every slide — or **uploads a deck they already have**, which is
imported as they made it. A generated lesson gets a quiz and a narrated,
captioned scene player written from its final slides; learners watch the
explanation and then take the quiz with an assistant beside them.

Built with Next.js 16 (App Router), Prisma + SQLite, and LangChain over hosted
models reached with an API key — with a local, open-source provider one branch
away.

---

## Stack

| Layer     | Choice                                                                   |
| --------- | ------------------------------------------------------------------------ |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5                          |
| Styling   | Tailwind CSS v4, shadcn/ui (Radix primitives)                            |
| Data      | Prisma 6 + SQLite                                                        |
| State     | Zustand (`src/stores/lms-store.ts`)                                      |
| AI        | LangChain — `@langchain/core`, `@langchain/openai`                       |
| LLM       | Hosted models via an OpenAI-compatible gateway — one per task, see below |
| Rendering | Playwright (headless Chromium) for slide rasterisation                   |
| Export    | `pptxgenjs`                                                              |
| Runtime   | Node.js 20+ / npm                                                        |

## Features

**Making a lesson**

- **Two ways in** — describe a topic and have it written, or upload a `.pptx` and
  keep it exactly as you made it
- **Plan first** — the model plans the lesson as sections and shows them for review;
  no slide is written until the plan is approved
- **One section, one slide** — a deck of _n_ slides is a cover, a contents slide,
  _n − 3_ sections and a closing, so no two slides are written from the same brief
- **Composed slides** — the model lays each slide out itself: cards, numbered chips,
  icons and connectors. It names roles, never values, so every slide is in the
  template's own colours, fonts and type scale
- **Measured, then fixed** — every slide is checked for text that would be cut off,
  boxes that overlap and ink that cannot be read on what it sits on, and composed
  again with the faults quoted back
- **Reference grounding** — upload PDF, DOCX, PPTX, TXT, CSV, XLSX or MD to ground
  the content

**Importing a deck**

- **As it was drawn** — shapes, fills, gradients, opacity, pictures, and text in the
  size, weight, colour and font it inherits from the slide, its layout, the master
  and the theme
- **Hidden slides stay hidden** — a slide hidden in PowerPoint is not shown and not
  quizzed on
- **Honest about the rest** — SmartArt, charts, tables and embedded objects leave a
  warning on their slide rather than vanishing quietly

**Quizzes**

- **Grounded in the lesson alone** — every question quotes the sentence that supports
  its answer, and anything the lesson cannot support is dropped
- **You choose the length** — 2 to 15 questions, on both paths
- **Editable before publishing** — change any question, option, correct answer or
  explanation, add your own questions, remove ones you do not want

**Taking a lesson**

- **Narrated slide video** — TTS audio, captions, previous/play/next, volume and
  speed controls, with light scene transitions
- **Video, then the quiz, then the next lesson** — the same order for the learner
  and for the instructor reviewing it; legacy lessons fall back to slides
- **A study assistant beside the lesson** — answers from that lesson only, and says
  so when a question is outside it
- **Platform help in the corner** — answers about using Ecotech, and sends subject
  questions to the study assistant
- **Progress** — per-lesson completion rolls up into the course

**Everywhere**

- **PPTX export** — download a lesson as PowerPoint, built from the same slide model
  and template as the web view; a course exports one file per lesson, zipped
- **Courses & enrolment** — categories, ratings, favourites, cover images
- **Learner tools** — notes and threaded comments
- **Ownership** — an instructor can edit only the courses they created

---

## How it works

### From a prompt

An instructor describes a topic; the model plans the lesson as **sections**,
each with the points it must teach and a real title for the slide it becomes.
That plan is shown for review before anything is written.

Once approved, each slide is **composed**: the model decides what shapes the
slide needs, where they go and what each one says. What keeps the deck on brand
is that it cannot name a colour, a font or a point size — it names roles, and
the roles resolve to the values measured from the `.pptx` template. The result
is then measured, and anything a reader would notice — a cut sentence,
overlapping boxes, invisible ink — is handed back and composed again.

### From a deck you already have

Upload a `.pptx` and it becomes a lesson as it was drawn: the shapes, their
fills and opacity, the pictures, and text in the size, weight, colour and font
it inherits from the slide, its layout, the master and the theme. It is not
converted into the house template — the reason to upload a deck is that it is
already right.

### Either way

After the slides pass review, quiz and narrated-video generation start together.
The two jobs settle independently, so one can be retried without discarding the
other. Narration is synthesized through an OpenAI-compatible `/audio/speech`
endpoint and is disclosed to learners as an AI-generated voice.

```
  prompt → sections → slides → quality gate ─┬→ quiz ──┐
                                              └→ video ─┴→ preview → publish
  .pptx  → imported as-is → generate video / quiz on demand → preview → publish
```

The full picture — the layers, every workflow drawn end to end, and which model
runs which AI task — is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- Docker Desktop (for the free local narration service)
- An API key for an OpenAI-compatible gateway. The default is
  [EcoAPI](https://www.ecoapi.ai/api); any endpoint that speaks that surface
  works.

### 1. Install

```bash
npm install
npx playwright install chromium
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
ECOAPI_API_KEY=sk-...
```

The key is required on this branch — every model call goes through the gateway,
so a missing key is a startup error on the first generation rather than a
silent fallback.

> **The `..` is deliberate.** Prisma resolves a relative SQLite path from
> `prisma/schema.prisma`, not the project root, so `file:./db/custom.db` would create
> `prisma/db/custom.db` and leave the intended database untouched. See `db/README.md`.

| Variable                   | Default                            | Purpose                                            |
| -------------------------- | ---------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`             | —                                  | SQLite path, relative to `prisma/`                 |
| `SESSION_SECRET`           | —                                  | Signs session cookies; 32+ chars, required in prod |
| `ECOAPI_API_KEY`           | —                                  | The gateway's key. Required                        |
| `ECOAPI_BASE_URL`          | `https://www.ecoapi.ai/api/v1`     | The gateway's OpenAI-compatible endpoint           |
| `CLAUDE_MAX_TOKENS`        | `16000`                            | Ceiling for one generation                         |
| `MODEL_*` (eleven of them) | see below                          | Move one AI task to a different model              |
| `TTS_BASE_URL`             | `http://127.0.0.1:8000/v1`         | OpenAI-compatible speech endpoint root             |
| `TTS_API_KEY`              | unset                              | Optional key for an explicitly configured provider |
| `TTS_MODEL`                | `speaches-ai/Kokoro-82M-v1.0-ONNX` | Local speech model                                 |
| `TTS_VOICE`                | `af_heart`                         | Default Kokoro narration voice                     |
| `TTS_TIMEOUT_MS`           | `300000`                           | Per-scene speech request timeout                   |
| `TTS_CONCURRENCY`          | `2`                                | CPU audio scenes synthesized at once               |
| `CHROMIUM_EXECUTABLE_PATH` | unset                              | System Chromium for the renderer                   |

**One model per task.** The project makes eleven distinct kinds of model call and
they do not want the same model — planning an outline and judging whether a quiz
question is grounded are different jobs. Each names its own, and each has a
`MODEL_*` override. The table, with the reasoning for every choice, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#model-per-task); the source of truth
is `src/lib/ai/models.ts`.

**Running without a key, on local models, instead.** That is a branch, not a
setting — see [This branch runs hosted models](#this-branch-runs-hosted-models-behind-an-api-key)
below.

### 3. Start local narration

```bash
npm run tts:setup
```

This starts the CPU image from [Speaches](https://github.com/speaches-ai/speaches),
persists its Hugging Face cache in a Docker volume, and downloads
`speaches-ai/Kokoro-82M-v1.0-ONNX` on the first run. The first download and first
speech request are slower; later runs reuse the cache. No TTS API key or paid
speech call is involved.

Useful commands:

```bash
npm run tts:check   # health + installed-model check
npm run tts:smoke   # synthesize one short sentence in memory
npm run tts:logs
npm run tts:down
```

The default concurrency is `2`, which is intentionally conservative for CPU
development on a 32 GB laptop. Increase it only after measuring generation time
and memory use. A hosted OpenAI-compatible TTS service remains possible by
setting `TTS_BASE_URL` and, when required, `TTS_API_KEY`; there is no automatic
fallback to EcoAPI or OpenAI.

### 4. Database

```bash
npm run db:generate
npm run db:push
npm run db:seed   # optional demo content
```

### 5. Run

```bash
npm run dev
```

---

## This branch runs hosted models, behind an API key

Every chat-model call goes through LangChain, and `src/lib/ai/provider.ts` on this
branch builds a **`ChatOpenAI`** per task, pointed at the gateway in
`ECOAPI_BASE_URL` and authenticated with `ECOAPI_API_KEY`. Every generation is
billed by that gateway. Narration speech is separate and defaults to the free,
local Speaches/Kokoro service described above.

The same application on local, open-source models is
**`claude/llm-open-source`**, which swaps that one file for a `ChatOllama`
against an Ollama server and needs no key. Both are cut from
`claude/ai-agent-architecture-mo8v7d`, the base branch, which is where every
change that is not about the provider belongs.

```bash
git checkout claude/llm-open-source   # the other mode
```

Five files differ between the two — `provider.ts`, `models.ts`, `.env.example`,
this README and `docs/ARCHITECTURE.md`. Everything else is shared, so a change
to anything else goes on the base branch and is merged outward:

```bash
git merge claude/ai-agent-architecture-mo8v7d
```

### Which models

`src/lib/ai/models.ts` names one per task — the ids are passed to the gateway
verbatim, so they have to be ids it lists. The defaults assume it serves
Anthropic's models:

|                   | Tasks                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `claude-opus-5`   | outline planning, slide authoring, slide HTML, quiz authoring, content evaluation, visual evaluation, the agent tool loop |
| `claude-sonnet-5` | single-field edits, the quiz grounding judge, the study assistant, platform help                                          |

Running everything on one model is a supported choice: set the eleven `MODEL_*`
variables and the registry defers to them. The split is there because most of
these calls do not need the largest model and all of them are billed — the
grounding judge alone runs once per question.

For a gateway that sells something else, change the ids and nothing more. The
per-task reasoning is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#model-per-task).

### Using a different gateway

Anything with an OpenAI-compatible endpoint — OpenRouter, Together, an Azure
deployment, or a vLLM / LM Studio server you host — works by changing
`ECOAPI_BASE_URL` and the model ids. A server that does not check a key still
needs `ECOAPI_API_KEY` set to something; the client requires the field.

For a provider with its own LangChain package (Anthropic's own API, Google,
Mistral), install that package and swap the class in `getChatModel`. Nothing
above `provider.ts` changes, because it speaks LangChain rather than a vendor's
wire format.

If the gateway rejects `response_format`, drop the `modelKwargs` line from
`getChatModel`. The prompts already demand a bare JSON object, and
`generateStructuredJSON` validates the reply and retries with the schema
errors, so nothing depends on the gateway enforcing it.

---

## Scripts

| Script                            | Purpose                                                     |
| --------------------------------- | ----------------------------------------------------------- |
| `npm run dev`                     | Dev server on port 3000 (builds the slide stylesheet first) |
| `npm run build`                   | Production build, standalone output                         |
| `npm run start`                   | Serve the production build                                  |
| `npm run lint`                    | ESLint                                                      |
| `npm run format` / `format:check` | Prettier                                                    |
| `npm run verify`                  | The whole check suite — see below                           |
| `npm run build:slide-css`         | Compile the slide stylesheet                                |
| `npm run db:push`                 | Push schema to the database                                 |
| `npm run db:generate`             | Regenerate the Prisma client                                |
| `npm run db:migrate`              | Create and apply a migration                                |
| `npm run db:reset`                | Drop and recreate the database                              |
| `npm run db:seed`                 | Load demo courses                                           |

`npm run verify` runs four checks in order and fails on the first one that
breaks: `verify.mts` (the invariants the app depends on — template values,
schema shapes, prompt contracts), `layout-coverage.mts` (every layout the
model may ask for actually renders), `parity.mts` (the web view and the PPTX
export agree) and `deck-check.mts` (an exported `.pptx` really contains the
shapes, text and icon images it should). It needs no API key and no database.

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
│   ├── assistant/      the study assistant and platform help, and their limits
│   ├── quiz/           generation, grounding, access, scoring
│   ├── slides/         the two slide models, both renderers, the exporter
│   │   └── import/     reading a .pptx: XML, theme colours, style inheritance
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

`User`, `Category`, `Course`, `Lesson`, `Section`, `Slide`, `Quiz`, `Question`,
`Option`, `QuizAttempt`, `StudentAnswer`, `Enrollment`, `Progress`, `Note`,
`Comment`, `Rating`, `Favorite`, `Notification`, `AgentRun`, `AgentStep`,
`Evaluation` — see `prisma/schema.prisma`.

Three groupings carry most of the meaning:

- **The lesson.** A `Lesson` owns `Section`s; a `Section` owns several `Slide`s.
  Sections are the unit of planning, slides the unit of display. An imported
  deck has slides but no sections — there was no plan behind it.
- **The quiz.** A `Lesson` has one `Quiz`, which owns `Question`s, each owning
  four `Option`s. A learner's sitting is a `QuizAttempt` with one
  `StudentAnswer` per question.
- **Progress.** An `Enrollment` joins a learner to a course; a `Progress` row
  records one lesson finished, and the enrolment's percentage is recomputed
  from them.

---

## Known limitations

Generation is fire-and-forget with client polling, and there is no test suite
beyond `npm run verify`. Accounts are created at `/register`; every account has
Student and Instructor modes, with one active at a time. The full list, with
what each limitation means, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#known-limitations).
