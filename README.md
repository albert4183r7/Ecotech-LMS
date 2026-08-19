# Ecotech LMS

A learning-management app where instructors describe a topic and the system generates a
presentation-style lesson from it — an outline first, then a full HTML slide per outline
entry. Learners enrol in courses, work through the slides, take notes, and earn XP.

Built with Next.js 16 (App Router), Prisma + SQLite, and Google Gemini for content
generation.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, shadcn/ui (Radix primitives) |
| Data | Prisma 6 + SQLite |
| State | Zustand (`src/stores/lms-store.ts`), TanStack Query |
| LLM | `@google/genai` → Gemini |
| Runtime | Node.js 20+ / npm |

## Features

- **AI lesson generation** — topic in, outline out, then one generated slide per entry
- **Slide editing** — whole-slide AI edits, plus click-to-edit on a single element
- **Reference documents** — upload PDFs/DOCX to ground generated content
- **Courses & enrolment** — categories, ratings, favourites, cover images
- **Learner tools** — per-lesson progress, notes, threaded comments
- **Gamification** — XP, achievements, daily challenges, streaks, leaderboard
- **PPTX export** — download a generated lesson as a PowerPoint file

---

## How lesson generation works

Two stages, both under `src/app/api/lessons/`:

**1. Outline** (`generate-outline`) — takes a topic, slide count, visual style and any
reference documents. Returns a validated structure where each slide carries the *content*
that will appear on it:

```jsonc
{
  "slideNumber": 1,
  "title": "...",           // max 80 chars
  "keyPoints": ["..."],     // 2-5 statements shown on the slide verbatim
  "terms": ["..."],         // specific names that must be mentioned
  "layout": "..."           // how to arrange it visually
}
```

The schema, repair logic and slide-count enforcement live in `src/lib/lesson-outline.ts`.
It is deliberately strict: titles are capped, the requested slide count is enforced, and
predictable model mistakes (swapped fields, legacy shapes) are repaired before validation
rather than costing a retry.

**2. Slides** (`generate-slides`) — walks the outline and streams one HTML document per
slide. Each prompt carries that slide's key points, its position in the deck, and a digest
of what earlier slides already said, so content is neither invented nor repeated. Output is
sanitised (`src/lib/sanitize.ts`) against a strict tag/attribute allowlist and stored as a
full HTML document rendered in a sandboxed iframe.

Generation runs in the background; slides move through
`DRAFT_OUTLINE → GENERATING → READY` (or `ERROR`), and the UI polls for status.

---

## Getting started

### Prerequisites

- Node.js 20 or newer
- A [Google Gemini API key](https://aistudio.google.com/apikey)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy the example file and fill it in:

```bash
cp .env.example .env
```

```
DATABASE_URL=file:./db/custom.db
GEMINI_API_KEY=your-key-here
```

> Keep `DATABASE_URL` **relative**. An absolute path from another machine will not resolve.

Optional overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-flash-latest` | Model id. `gemini-pro-latest` gives better outlines at higher cost. |
| `IMAGEKIT_URL_ENDPOINT` | unset | Enables AI-generated images in slides |

`gemini-flash-latest` is a rolling alias, so it tracks the current Flash model rather than
pinning a version that goes stale.

### 3. Set up the schema

```bash
npm run db:generate
npm run db:push
```

Optionally seed demo courses:

```bash
npm run db:seed
```

### 4. Run

```bash
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

### Optional: image generation

To let slides include AI-generated images, add ImageKit credentials to `.env`:

```
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
IMAGEKIT_PUBLIC_KEY=...
IMAGEKIT_PRIVATE_KEY=...
```

Without these, the generator is instructed to build visuals from CSS and Unicode only, and
the sanitiser blocks all external image URLs.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build (standalone output) |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:push` | Push schema to the database |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:reset` | Drop and recreate the database |
| `npm run db:seed` | Load demo courses |

## Project structure

```
src/
├── app/
│   ├── api/                 # Route handlers
│   │   └── lessons/         # Outline + slide generation
│   ├── layout.tsx
│   └── page.tsx             # SPA shell; pages swap via Zustand
├── components/lms/pages/    # Screen components (classroom, create-course, …)
├── lib/
│   ├── ai.ts                # System prompts + streaming helpers
│   ├── llm.ts               # Structured JSON + text generation
│   ├── lesson-outline.ts    # Outline schema, repair, prior-slide context
│   ├── sanitize.ts          # HTML allowlist + iframe wrapper
│   ├── extract-doc.ts       # PDF/DOCX text extraction
│   └── db.ts                # Prisma client singleton
├── stores/                  # Zustand state
└── types/
```

The frontend is a single-page shell: `app/page.tsx` renders one screen at a time based on
Zustand navigation state, rather than using file-based routes.

## Data model

`User`, `Category`, `Course`, `Lesson`, `Slide`, `Enrollment`, `Progress`, `Note`,
`Comment`, `Rating`, `Favorite`, `Notification` — see `prisma/schema.prisma`.

---

## Known limitations

Worth knowing before building on this:

- **Authentication is not production-ready.** `api/auth/login` compares passwords in
  plaintext and there is no session middleware; user IDs are passed from the client.
- **Type errors are ignored at build time** (`typescript.ignoreBuildErrors` in
  `next.config.ts`). The repo does not currently typecheck clean — run `npx tsc --noEmit`
  to see the backlog.
- **Slides do not scale to their container.** The generated document has no fixed canvas,
  so the same slide renders differently in the classroom and in a small preview.
- **Failed slides cannot be retried.** Only `DRAFT_OUTLINE` slides are picked up, so a
  slide left in `ERROR` stays there.
- **Background generation is not durable.** It is fire-and-forget within a route handler;
  if the process restarts mid-run, remaining slides stay pending.
- **Generated content is ungrounded unless you supply reference documents.** The prompts
  forbid inventing statistics, but without a source the model still writes from memory.
