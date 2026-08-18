# LMS Project Worklog

## Project Overview
**Ecotech** - Learning Management System (LMS) built with Next.js 16, TypeScript, Tailwind CSS 4, shadcn/ui, and Prisma (SQLite).

---

## Current Project Status Assessment
✅ **Phase 1** — Full MVP with all core pages, API routes, and database
✅ **Phase 2 (WebDevReview #1)** — 14 bug fixes, accessibility, dark mode, styling polish
✅ **Phase 3 (WebDevReview #2)** — Major UI enhancements, new features, keyboard shortcuts
✅ **Phase 4 (WebDevReview #3)** — Interactive quizzes, confetti celebration, leaderboard, search autocomplete, continue learning widget, dark mode fixes
✅ **Phase 5 (Cron Review #4)** — CSS styling overhaul, enhanced footer, notification system, AI generation, achievement badges, certificate modal
✅ **Phase 6 (Cron Review #5)** — Course discussion/comments system, weekly activity chart, streak tracker, enhanced course cards
✅ **Phase 7 (Cron Review #6)** — Major styling overhaul (15+ new CSS animations), notes system, XP/level system, streak calendar, keyboard shortcuts overlay, leaderboard widget, enhanced all 7 pages
✅ **Phase 8 (WebDevReview #7)** — Onboarding tour, announcement banner, course ratings, Pomodoro study timer, extensive CSS enhancements (glassmorphism, mobile touch targets, gradient text, content reveal animations, scrollbar styling)
✅ **Phase 9 (WebDevReview #8)** — Analytics dashboard, course recommendations engine, notification center with persistent DB storage, 3-way dark mode toggle (light/dark/system), home page hero overhaul (floating orbs, typing animation, CSS parallax, animated counters, category pills), empty states polish, button ripple/glow effects, card hover micro-interactions
✅ **Phase 10 (WebDevReview #9)** — Enhanced home page (animated stats bar, featured courses carousel, challenge cards with streak data, study tips, social feed), enhanced course detail (tabbed content, section reordering, enrollment flow), classroom enhancements (slide transition animations, study timer redesign, keyboard hints, progress dots)
✅ **Phase 11 (WebDevReview #10)** — Deep visual polish (button glow/ripple, card hover lifts, gradient text, animated underlines, frosted glass, mobile touch targets 44px), bottom nav, daily challenge gamification, certificate redesign, empty state illustrations, profile page redesign, course cards hover effects, expanded accessibility (ARIA, focus rings, semantic HTML, sr-only labels)
✅ **Phase 13 (AI Lesson Generation)** — Complete implementation of AI-powered slide generation feature: HTML sanitizer, z-ai-web-dev-sdk streaming wrapper, ImageKit URL builder, 3 new API routes (streaming HTML, outline, inline edit), classroom iframe renderer, create-course live streaming preview, AI outline generation, section mini-preview, inline AI edit toolbar, PUT sections endpoint, PPTX courseId support, seed data rewrite, deprecated SlideContent cleanup

---

## AI Lesson Generation Feature — Investigation Report

### 1. z-ai-web-dev-sdk Streaming: ✅ SUPPORTED

**Evidence** (from `node_modules/z-ai-web-dev-sdk/dist/index.js`, lines 106-109):
```javascript
if (requestBody.stream && (contentType.includes('text/event-stream') || contentType.includes('text/plain'))) {
    return response.body; // ReadableStream<Uint8Array>
}
```

- `CreateChatCompletionBody.stream?: boolean` — pass `stream: true`
- Returns raw `ReadableStream<Uint8Array>` in SSE format when streaming
- SDK wraps an OpenAI-compatible chat completions API (`/chat/completions`)
- Config loaded from `.z-ai-config` file (not env vars) — no API key needed
- **Decision: Use z-ai-web-dev-sdk for streaming HTML generation** (no need for @google/genai)

### 2. Prisma Schema — Relevant Models

**Current** (`prisma/schema.prisma`):
- **Course**: id, title, description, coverImage, status(draft|published|archived), language, creatorId, categoryId
- **Section**: id, title, **content (String — JSON blob)**, order, totalPages, courseId, createdAt, updatedAt
- **User**: id, email, password, name, avatar, role(student|instructor)
- Section.content currently stores `JSON.stringify(SlideContent[])` — the old React-renderer format
- **No Lesson, Slide, or SlideVersion models exist yet**
- Section has NO status field

### 3. API Route Conventions

- **Framework**: Next.js 16 App Router, `route.ts` files under `src/app/api/`
- **Response shape**: `{ success: true, data: ... }` or `{ success: false, error: '...' }`
- **Auth**: No middleware — inline `userId` from body/query params
- **Error handling**: `try/catch` with `console.error`, returns 400/500 with `{ success: false, error }`
- **No Edge runtime** — all routes use default Node.js runtime (no `export const runtime`)
- **No env validation layer** — just raw `process.env.DATABASE_URL`

### 4. Frontend Data-Fetching & Rendering Patterns

- **SPA pattern**: Single `page.tsx` with Zustand stores for navigation/state
- **Data fetching**: Direct `fetch('/api/...')` in `useEffect` or event handlers, no SWR/React Query
- **Classroom state**: `useNavigationStore.openClassroom(state)` with:
  ```ts
  ClassroomState = { courseId, courseTitle, sectionId, sectionTitle, slides: SlideContent[], currentSlide, totalPages }
  ```
- **Current slide renderer** (`classroom-page.tsx`, lines 929-1211):
  - `SlideRenderer` — switch on `slide.type` dispatching to 6 React components:
    - `TitleSlide`, `ContentSlide`, `TableSlide`, `ListSlide`, `CodeSlide`, `QuizSlide`, `FallbackSlide`
  - All are direct React JSX renderers using shadcn/ui components and Tailwind
  - Slide content area container (line 468): `<div className="p-8 sm:p-12 max-w-2xl mx-auto"><SlideRenderer slide={currentSlide} /></div>`
- **If slides empty on classroom open**: Fetches from `/api/sections/{id}`, parses JSON `content` field
- **Create course flow**: Dialog → calls `/api/generate-content` → gets `SlideContent[]` → stores as `JSON.stringify(slides)` in section.content

### 5. Environment Variables

- Only `.env` exists with: `DATABASE_URL=file:/home/z/my-project/db/custom.db`
- No `.env.example`, no validation layer (`src/lib/` only has `db.ts` and `utils.ts`)
- z-ai-web-dev-sdk reads config from `.z-ai-config` (not env)
- **Need to add**: `IMAGEKIT_URL_ENDPOINT`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`

### 6. Framework Confirmation

- **Next.js 16.1.1** with App Router (no Pages Router)
- **No Edge runtime** used anywhere
- **Standalone output** in `next.config.ts`
- **Prisma 6** with SQLite (`db/custom.db`)
- **Bun** runtime, Turbopack dev server

---

## AI Lesson Generation — Implementation Plan

### Standing Rules (Locked)
1. Slides render as raw HTML+Tailwind in **sandboxed iframe**
2. Slide generation **streams in real time** (SSE)
3. Images go through **ImageKit's URL-based generation/transform API**
4. All AI-generated HTML **sanitized through strict allowlist** before reaching client

### A. Schema Migration

**Remove**: `SlideContent` type and all 6 React slide renderer components from `classroom-page.tsx`

**Modify Section model** — add `htmlBody` field:
```prisma
model Section {
  id          String   @id @default(cuid())
  title       String
  content     String?  // DEPRECATED: legacy JSON blob, kept for backward compat during migration
  htmlBody    String?  // NEW: sanitized HTML+Tailwind for iframe renderer
  order       Int      @default(0)
  totalPages  Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  courseId    String
  course      Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  progresses  Progress[]
  comments    Comment[]
  notes       Note[]
}
```

**No new Slide/SlideVersion models needed** — user explicitly said single rendering path, no discriminator. The `htmlBody` field on Section is sufficient. Each section = one lesson rendered as one HTML document inside an iframe.

**Update seed data**: Replace all `content: JSON.stringify([...])` with `htmlBody: '<div class="...">...</div>'` containing proper Tailwind-styled HTML. Drop old `content` field values.

### B. HTML Sanitizer (`src/lib/sanitize.ts`)

Use **DOMPurify** (isomorphic-dompurify for SSR compatibility) with strict config:

**ALLOWED_TAGS**: `div, section, article, header, footer, main, h1-h6, p, span, ul, ol, li, a, img, strong, em, b, i, u, br, hr, table, thead, tbody, tr, td, th, blockquote, code, pre`

**ALLOWED_ATTR**:
- Global: `class, id`
- `<a>` only: `href` (validated: must start with `https://`)
- `<img>` only: `src, alt, width, height` (src validated: must match ImageKit domain)

**EXPLICITLY FORBIDDEN**: `script, style, iframe, object, embed, form, input, button, link, meta, base, noscript, svg`

**No inline `style=""`** — Tailwind classes only. Strip all `on*` event handler attributes globally.

**URL restrictions**:
- `href`: `https://` only, no `javascript:` or `data:` schemes
- `img src`: Must match `IMAGEKIT_URL_ENDPOINT` domain — reject any other domain

### C. AI Client — z-ai-web-dev-sdk Streaming

**File**: `src/lib/ai.ts`

```typescript
// Wrapper that uses z-ai-web-dev-sdk with streaming
import ZAI from 'z-ai-web-dev-sdk';

export async function streamSlideHtml(
  systemPrompt: string,
  userPrompt: string,
): Promise<ReadableStream<Uint8Array>> {
  const zai = await ZAI.create();
  const stream = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    stream: true,
    thinking: { type: 'disabled' },
  });
  // stream is ReadableStream<Uint8Array> (SSE format)
  return stream;
}

// Non-streaming variant for outline generation
export async function generateOutline(topic: string, prompt: string): Promise<string> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    thinking: { type: 'disabled' },
  });
  return completion.choices[0]?.message?.content ?? '';
}
```

### D. API Endpoints

#### 1. `POST /api/generate-outline` — Outline Generation (non-streaming)

**Request**: `{ topic: string, prompt: string, language?: string }`
**Response**: `{ success: true, data: { title: string, sections: { title: string, summary: string }[] } }`

Uses z-ai-web-dev-sdk non-streaming to generate a course outline. The instructor can review/edit before proceeding.

#### 2. `POST /api/generate-slide-html` — Slide HTML Streaming

**Request**: `{ sectionTitle: string, prompt: string, language?: string }`
**Response**: SSE stream with events:
```
event: slide_start
data: {"sectionTitle": "..."}

event: chunk
data: {"html": "<div class=\"...\">..."}

event: chunk
data: {"html": "...more html..."}

event: slide_complete
data: {"htmlBody": "<full sanitized html>"}

event: error
data: {"error": "..."}
```

**Flow**:
1. Build system prompt instructing AI to generate a single HTML document using only Tailwind CSS classes
2. Call `streamSlideHtml()` → get `ReadableStream`
3. Parse SSE chunks, extract text deltas
4. Accumulate HTML string
5. On stream end: sanitize the full HTML via DOMPurify
6. Emit `slide_complete` with sanitized `htmlBody`

#### 3. `POST /api/generate-slide-inline-edit` — Inline AI Edit

**Request**: `{ htmlBody: string, instruction: string, slideTitle?: string }`
**Response**: `{ success: true, data: { htmlBody: string } }`

Non-streaming. Takes existing HTML + natural language edit instruction, returns modified sanitized HTML.

### E. ImageKit Integration (`src/lib/imagekit.ts`)

**AI Image Generation URL pattern**:
```
{IMAGEKIT_URL_ENDPOINT}/ik-genimg-prompt-{encodedText}/slide-image.jpg
```

**Transformation params for edits**:
- Background replace: `tr=e-changebg-prompt-{encodedText}`
- Remove background: `tr=e-removedotbg` or `tr=e-bgremove`
- Upscale: `tr=e-upscale`
- Add shadow: `tr=e-dropshadow`

**Signed URL enforcement**: All ImageKit URLs must be signed with private key. The AI prompt will include ImageKit URL patterns so the LLM generates `img` tags pointing to ImageKit URLs. The sanitizer validates `src` domains against `IMAGEKIT_URL_ENDPOINT`.

**Environment variables** (to be provided by user):
```
IMAGEKIT_URL_ENDPOINT=
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_PRIVATE_KEY=
```

### F. Frontend Migration

#### Classroom Page (`classroom-page.tsx`):

**Remove**: All 6 React slide renderer components (~280 lines: `SlideRenderer`, `TitleSlide`, `ContentSlide`, `TableSlide`, `ListSlide`, `CodeSlide`, `QuizSlide`, `FallbackSlide`)

**Replace with**: Single iframe renderer:
```tsx
function SlideIframe({ htmlBody }: { htmlBody: string }) {
  return (
    <iframe
      srcDoc={htmlBody}
      sandbox="allow-same-origin"
      className="w-full min-h-[400px] border-0 rounded-lg"
      title="Slide content"
    />
  );
}
```

**Update `ClassroomState` type**:
```typescript
export interface ClassroomState {
  courseId: string;
  courseTitle: string;
  sectionId: string;
  sectionTitle: string;
  htmlBody: string;  // NEW: replaces slides[]
  // Remove: slides, currentSlide, totalPages (no longer page-by-page)
}
```

Since each section is now a single HTML document (not paginated slides), the classroom becomes a scrollable document viewer instead of a slide deck. Navigation dots and slide-by-slide navigation will be replaced with section navigation (prev/next section).

**Update `SectionItem` type**:
```typescript
export interface SectionItem {
  id: string;
  title: string;
  htmlBody: string | null;  // NEW
  content: string | null;   // DEPRECATED
  order: number;
  totalPages: number;       // Keep for now, can repurpose later
  courseId: string;
}
```

#### Create Course Page (`create-course-page.tsx`):

**Modify `handleGenerateSection`**: Instead of calling `/api/generate-content` (returns `SlideContent[]`), call the new streaming endpoint `/api/generate-slide-html` and display a live preview as HTML streams in. On completion, store `htmlBody` in the section draft.

**Section preview**: Show a mini iframe preview of the generated HTML in the section list.

### G. Seed Data Rewrite

Replace all 14+ sections in `seed.ts` with proper `htmlBody` fields containing Tailwind-styled HTML. Remove all `content: JSON.stringify([...])` values. The HTML should be professional-looking slide content using Tailwind utility classes.

### H. Implementation Order

1. **Schema + DB migration**: Add `htmlBody` to Section, `bun run db:push`
2. **Sanitizer**: `src/lib/sanitize.ts` with DOMPurify
3. **AI wrapper**: `src/lib/ai.ts` using z-ai-web-dev-sdk streaming
4. **ImageKit helper**: `src/lib/imagekit.ts` (awaiting env values)
5. **API: generate-slide-html**: Streaming endpoint
6. **API: generate-outline**: Non-streaming outline gen
7. **API: generate-slide-inline-edit**: Inline AI edit
8. **Frontend: Classroom page**: Replace React renderers with iframe
9. **Frontend: Create course page**: Streaming generation UI
10. **Seed data**: Rewrite with htmlBody content
11. **Cleanup**: Remove old `SlideContent` type, old `generate-content` route, React renderers

### I. Files to Create/Modify

**Create**:
- `src/lib/sanitize.ts` — DOMPurify wrapper
- `src/lib/ai.ts` — z-ai-web-dev-sdk streaming wrapper
- `src/lib/imagekit.ts` — ImageKit URL builder (signed URLs)
- `src/app/api/generate-slide-html/route.ts` — Streaming SSE endpoint
- `src/app/api/generate-outline/route.ts` — Outline generation
- `src/app/api/generate-slide-inline-edit/route.ts` — Inline AI edit

**Modify**:
- `prisma/schema.prisma` — Add `htmlBody` to Section
- `src/types/lms.ts` — Update `SectionItem`, `ClassroomState`, remove `SlideContent`
- `src/components/lms/pages/classroom-page.tsx` — Replace renderers with iframe
- `src/components/lms/pages/create-course-page.tsx` — Streaming gen UI
- `prisma/seed.ts` — Rewrite with htmlBody content
- `.env` — Add ImageKit vars (awaiting user's values)

**Delete**:
- `src/app/api/generate-content/route.ts` — Old non-streaming stub
- All 6 React slide renderer functions from classroom-page.tsx

### J. Risk / Open Questions

1. **iframe height**: Need to decide on dynamic height calculation — either fixed aspect ratio, or use `postMessage` from inside iframe to communicate height
2. **Quiz interactivity**: The old quiz slide had client-side interactivity (click answer, get feedback). In the iframe model, quizzes become static HTML. If interactive quizzes are needed, they'd need to be implemented as React components outside the iframe (hybrid approach) — but user said single rendering path. Confirm: are quizzes okay as static HTML in iframe?
3. **ImageKit env values**: User said they'll paste real values later. Implementation should work with placeholder values and fail gracefully if ImageKit is not configured.
4. **PPTX download**: Current `generate-pptx` endpoint reads `SlideContent[]` format. Will need to be updated or removed since the data model changes.

---
Task ID: pptx-fix-and-ai-edit
Agent: Main

Work Log:
- Fixed `src/app/api/generate-pptx/route.ts` to support `courseId` in addition to `sections[]`
  - Added `import { db } from '@/lib/db'`
  - Added `courseId?: string` to `GeneratePptxRequest` interface
  - When `sections` is not provided but `courseId` is, fetches all sections for that course from the database using Prisma (`db.section.findMany`), ordered by `order` field, selecting only `title` and `htmlBody`
  - Filters out sections without `htmlBody`, maps to `{ title, htmlBody }[]`
  - Falls through to existing PPTX generation logic with `resolvedSections`
  - Updated error message to be more descriptive
- Added inline AI edit feature to classroom page (`src/components/lms/pages/classroom-page.tsx`)
  - Added `Wand2` icon import from lucide-react
  - Added `Textarea` import from `@/components/ui/textarea`
  - Added 3 new state variables: `showAiEdit`, `aiEditInstruction`, `aiEditLoading`
  - Added `handleAiEdit` callback that:
    - Calls `POST /api/generate-slide-inline-edit` with `{ htmlBody, instruction, slideTitle }`
    - On success, updates `localState.htmlBody` with the new HTML
    - Shows toast on success/error
    - Persists updated `htmlBody` to DB via `PUT /api/sections/${sectionId}`
    - Closes the edit panel and resets instruction
  - Added floating toggle button (`fixed bottom-4 right-4 z-50`, round, Wand2 icon)
  - Added floating AI edit panel (`fixed bottom-20 right-4 z-50`, card with border, shadow, bg-card)
    - Contains title "AI Edit" with Wand2 icon, Textarea for instruction, Apply/Cancel buttons
    - Apply button shows Loader2 spinner when loading
    - Cancel button clears instruction and closes panel

Stage Summary:
- PPTX endpoint now accepts `{ courseId, courseName }` or `{ sections, courseName }` — resolves sections from DB when only courseId is provided
- Classroom page now has a floating AI edit wand button (bottom-right) that opens a panel for natural language slide editing via the existing `/api/generate-slide-inline-edit` endpoint
- All changes pass ESLint with zero errors
- Dev server compiles successfully
