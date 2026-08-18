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
---
Task ID: 6
Agent: api-routes-updater
Task: Update all API routes and store for Section→Lesson migration
Work Log:
- Read worklog.md and src/types/lms.ts for migration context (LessonItem, SlideItem, ClassroomState already updated)
- Verified src/stores/lms-store.ts: no code changes needed (imports ClassroomState which is already updated, no 'section' string literals)
- Updated src/app/api/courses/route.ts: GET `_count.sections` → `_count.lessons`, `sectionsCount` → `lessonsCount`; POST `sections` create → `lessons` create with simplified schema (title + order only, no htmlBody/totalPages/content), include `lessons` ordered
- Updated src/app/api/courses/[id]/route.ts: include `lessons` instead of `sections`, mapping uses `course.lessons.map((lesson) => ...)` with `outlineJson` added, `content` and `totalPages` removed
- Created src/app/api/lessons/[id]/route.ts as new file (replacing sections/[id]/route.ts): GET fetches Lesson with ordered slides; PUT updates title/order/outlineJson only; no content/htmlBody/totalPages references
- Updated src/app/api/notes/route.ts: `sectionId` → `lessonId` in query params, request body, Prisma queries, and error messages; `db.section.findUnique` → `db.lesson.findUnique`
- Updated src/app/api/comments/route.ts: `sectionId` → `lessonId` in GET query params, POST body destructuring, and Prisma create query where clause
- Updated src/app/api/progress/route.ts: `sectionId` → `lessonId` in POST body, error messages, upsert unique key `enrollmentId_lessonId`; `db.section` → `db.lesson`; GET include changed from `section` to `lesson` without totalPages
- Rewrote src/app/api/progress-timeline/route.ts: `SectionTimelineData` → `LessonTimelineData` with `lessonId`/`lessonTitle`; response types `totalSections`/`completedSections`/`sections` → `totalLessons`/`completedLessons`/`lessons`; all Prisma queries use `lessons` and `lesson`; totalPages fallback set to 1 (TODO: derive from slides)
- Updated src/app/api/generate-pptx/route.ts: `db.section.findMany` → `db.lesson.findMany` with nested `slides` include (status=READY), flattened via `flatMap` to produce resolvedSections array

Stage Summary:
- 8 files modified/created, 1 file verified (no changes needed)
- All API routes now use `Lesson`/`lesson` instead of `Section`/`section` in Prisma queries, variable names, error messages, and response shapes
- New `/api/lessons/[id]` route created with slide-aware GET and PUT handlers
- Progress timeline response shape changed: `sections` → `lessons`, `totalSections` → `totalLessons`, `completedSections` → `completedLessons`
- PPTX generation now resolves lessons→slides from DB instead of sections directly
- Old `/api/sections/[id]/route.ts` deleted by ui-components-updater agent

---
Task ID: 7
Agent: ui-components-updater
Task: Update all UI components for Section→Lesson migration

Work Log:
- Read `/home/z/my-project/src/types/lms.ts` to understand new type definitions (LessonItem, SlideItem, ClassroomState with lessonId/lessonTitle/allLessonIds/currentLessonIndex)
- Updated `src/components/lms/pages/classroom-page.tsx`:
  - `goToSection` → `goToLesson`, fetch URL `/api/sections/` → `/api/lessons/`
  - HTML body extraction now reads from `json.data.slides[0].htmlBody` instead of `json.data.htmlBody`
  - `markSectionCompleted` → `markLessonCompleted`, POST body `sectionId` → `lessonId`
  - `allSectionIds` → `allLessonIds`, `currentSectionIndex` → `currentLessonIndex`, `totalSections` → `totalLessons`
  - `sectionId` → `lessonId`, `sectionTitle` → `lessonTitle` throughout
  - Notes API calls: `sectionId` → `lessonId` in query params and POST body
  - AI edit persist: PUT URL `/api/sections/` → `/api/lessons/`
  - NotesSidebarContent props: `currentSectionIndex` → `currentLessonIndex`
  - UI text: "Section" → "Lesson" in counter, badges, placeholders, confetti message
- Updated `src/components/lms/pages/course-detail-page.tsx`:
  - Import `LessonItem` instead of `SectionItem`
  - `SectionProgress` → `LessonProgress` with `lessonId` field
  - `fetchSectionProgress` → `fetchLessonProgress`, mapping `p.lesson?.id ?? p.lessonId`
  - PPTX download: fetches from `/api/lessons/` and reads `json.data.slides[0].htmlBody`
  - `handleSectionClick` → `handleLessonClick` with updated ClassroomState construction
  - `totalLessons` computed from `course.lessons.length` instead of `course.sections.reduce(...totalPages)`
  - `getSectionProgress` → `getLessonProgress`, `getSectionStatus` → `getLessonStatus`
  - Accordion: `course.sections.map((section, ...))` → `course.lessons.map((lesson, ...))`
  - `totalP` (pages) hardcoded to `1` since Lesson no longer has totalPages
  - ProgressTimeline props: `sections={course.lessons}` → `lessons={course.lessons}`
- Updated `src/components/lms/pages/create-course-page.tsx`:
  - `SectionDraft` → `LessonDraft`, `SectionCard` → `LessonCard`, `SectionCardProps` → `LessonCardProps`
  - `MAX_SECTIONS` → `MAX_LESSONS`, `sections` state → `lessons`, `setSections` → `setLessons`
  - All modal state: `sectionName` → `lessonName`, `sectionPrompt` → `lessonPrompt`, `sectionLanguage` → `lessonLanguage`, `sectionPdfName` → `lessonPdfName`
  - All handlers: `handleGenerateSection` → `handleGenerateLesson`, `handleDeleteSection` → `handleDeleteLesson`, `handleMoveSection` → `handleMoveLesson`, `handleSectionPdfUpload` → `handleLessonPdfUpload`, `handleSectionFileChange` → `handleLessonFileChange`
  - `expandedSectionId` → `expandedLessonId`, `sectionFileInputRef` → `lessonFileInputRef`
  - Save payload: kept `sections:` key in API body (contract with courses POST handler), but local variable is `lessons`
  - Outline drafts: `SectionDraft` → `LessonDraft`, error messages updated
  - UI text: "Sections" → "Lessons" header, "Generate Section" → "Generate Lesson", "Section Name" → "Lesson Name", aria-labels updated
- Updated `src/components/lms/progress-timeline.tsx`:
  - Import `LessonItem` instead of `SectionItem`
  - `SectionTimelineData` → `LessonTimelineData` with `lessonId`/`lessonTitle`
  - `TimelineData`: `totalSections` → `totalLessons`, `completedSections` → `completedLessons`, `sections` → `lessons`
  - Props: `sections` → `lessons`
  - `handleSectionClick` → `handleLessonClick`, fetches from `/api/lessons/`, reads slides for htmlBody
  - CTA variables: `continueSection` → `continueLesson`, `nextSection` → `nextLesson`, `ctaSection` → `ctaLesson`, `ctaSectionItem` → `ctaLessonItem`
  - Timeline items: all `section.*` references → `lesson.*`
  - Summary footer: "X sections" → "X lessons"
- Updated `src/components/lms/discussion-panel.tsx`:
  - Two remaining `sectionId` references in POST bodies → `lessonId` (props already had `lessonId`)
- Deleted `src/app/api/sections/[id]/route.ts` (old route file)
- Ran `bun run lint` — zero errors

Stage Summary:
- 5 UI component files updated, 1 file deleted
- All `section`/`Section` model references in UI components replaced with `lesson`/`Lesson`
- HTML `<section>` semantic tags preserved (not renamed)
- API body key `sections` preserved in create-course POST (contract with courses route)
- ESLint passes with zero errors

---
Task ID: 8
Agent: seed-rewriter
Task: Rewrite prisma/seed.ts with Lesson/Slide models
Work Log:
- Read Prisma schema to understand Lesson (id, title, order, outlineJson, courseId, timestamps) and Slide (id, title, htmlBody, status, order, lessonId, timestamps) models
- Read existing seed.ts (1575 lines) to extract all users, categories, courses, sections (25 total), enrollments, progress, comments, favorites, and notifications
- Rewrote seed.ts completely: replaced `PrismaClient` import with `import { db } from '../src/lib/db'`
- Converted all 25 sections (sec_001–sec_025) to lessons (lesson_001–lesson_025) with same titles and order
- Added `outlineJson` field to each lesson with JSON structure: `{ topic, style: "professional", slides: [{ title, outline }] }`
- Removed `content`, `htmlBody`, and `totalPages` from lesson data
- Created one Slide per lesson using the provided dark-slate/teal-cyan gradient template with 3-4 real educational paragraphs each
- Set all slides to status `READY` and order `0`
- Updated all `sectionId` references to `lessonId` in comments (comment_001, 002, 003, 005, 006) and progress records
- Updated delete order to respect FK constraints (added slide, note, rating before lesson)
- Ran `prisma db push --force-reset` and `npx tsx prisma/seed.ts` — seed completed successfully
Stage Summary:
- Seed file rewritten from ~1575 lines to ~380 lines (much cleaner without inline HTML)
- 5 users, 6 categories, 5 courses, 25 lessons, 25 slides, 2 enrollments, 2 favorites, 8 comments, 8 notifications created
- All data verified: seed runs with zero errors

---
Task ID: schema-migration-section-to-lesson-slide
Agent: main
Task: Full Prisma schema migration — Section→Lesson rename + new Slide model

Work Log:
- Edited prisma/schema.prisma: renamed Section→Lesson (removed content/htmlBody/totalPages, added outlineJson), created Slide model (id, title, htmlBody, status, order, lessonId, @@unique([lessonId, order])), updated all FK relations (Comment, Note, Progress)
- Generated SQL diff via prisma migrate diff, showed to user
- Applied with `prisma db push --force-reset` (required due to NOT NULL lessonId on existing rows)
- Regenerated Prisma client
- Updated src/types/lms.ts: removed SlideContent/SlideItem (deprecated), renamed SectionItem→LessonItem, added SlideItem, updated ClassroomState (sectionId→lessonId, allSectionIds→allLessonIds, currentSectionIndex→currentLessonIndex), CourseItem.sections→CourseItem.lessons
- Updated all API routes (15 files): courses, courses/[id], lessons/[id] (new), notes, comments, progress, progress-timeline, enrollments, enrollments/[id], analytics, achievements, leaderboard, favorites, user/[id], generate-pptx, generate-outline, challenges, social-feed
- Updated all UI components (6 files): classroom-page, course-detail-page, create-course-page, progress-timeline, discussion-panel, social-feed
- Deleted old /api/sections/[id]/route.ts, created /api/lessons/[id]/route.ts
- Rewrote prisma/seed.ts: 25 lessons with 25 slides (each with real HTML+Tailwind content), outlineJson on each lesson
- Updated all social-feed action types: completed_section→completed_lesson
- Final lint: zero errors, zero warnings
- Seed: 5 courses, 25 lessons, 25 slides, runs successfully

Stage Summary:
- Complete schema migration from Section to Lesson+Slide model
- 30+ files updated across API routes, UI components, types, and seed data
- All Prisma references to `section`/`sections` eliminated from src/
- Dev server starts cleanly on port 3000
- No SlideVersion model added (per plan: not needed yet)

---
Task ID: section-to-lesson-rename-cleanup
Agent: main
Task: Complete Section→Lesson rename in all remaining source code (variable names, display text, API params)

Work Log:
- Verified schema and DB already migrated (Lesson + Slide tables, no Section table)
- Verified seed.ts already rewritten with LessonSeed + makeSlideHtml + Slide creates
- Ran subagent to rename remaining references across 12 files:
  - `src/app/api/courses/route.ts`: POST body `sections` → `lessons`, `sec` → `lesson`
  - `src/app/api/generate-pptx/route.ts`: `SectionHtmlBody` → `SlideHtmlBody`, `sections` → `slides`, `sectionTitle` → `lessonTitle`, `resolvedSections` → `resolvedSlides`
  - `src/app/api/generate-slide-html/route.ts`: `sectionTitle` → `slideTitle` (6 occurrences)
  - `src/app/api/generate-outline/route.ts`: output key `sections` → `lessons` (kept `parsed.sections` for AI compat)
  - `src/app/api/challenges/route.ts`: "1/1 sections" → "1/1 lessons"
  - `src/components/lms/pages/create-course-page.tsx`: `sectionTitle` → `slideTitle`, "Add N Sections" → "Add N Lessons"
  - `src/components/lms/pages/my-learning-page.tsx`: `sectionsCount` → `lessonsCount`, "X sections" → "X lessons"
  - `src/components/lms/pages/courses-page.tsx`: `sections: []` → `lessons: []`
  - `src/components/lms/pages/home-page.tsx`: `sectionsCount` → `lessonsCount`, `sections: []` → `lessons: []`
  - `src/components/lms/pages/course-detail-page.tsx`: PPTX API body `{ sections: ... }` → `{ slides: ... }`
  - `src/components/lms/pages/settings-page.tsx`: "Auto-play Next Section" → "Auto-play Next Lesson"
  - `src/components/lms/pages/profile-page.tsx`: `sectionsCount` → `lessonsCount`, `completedSections` → `completedLessons`
- Left intact: `src/lib/ai.ts` (AI prompt uses "sections" key internally, parsed in generate-outline)
- Left intact: Comments using "section" as generic English (e.g. "User Info Section")
- Added `allowedDevOrigins` to next.config.ts for cross-origin preview support
- Lint: zero errors
- Seed: 5 users, 6 categories, 5 courses, 25 lessons, 25 slides — runs successfully
- API verified: `/api/courses?tab=hot` returns courses with `lessonsCount` correctly

Stage Summary:
- Complete Section→Lesson rename across all source code
- All data model references to `section`/`Section`/`sections` renamed to `lesson`/`Lesson`/`lessons`
- API parameter `sectionTitle` → `slideTitle` (generate-slide-html) or `lessonTitle` (generate-pptx)
- Display text updated: "sections" → "lessons" in UI
- Step 1 (Schema Migration) of the 15-step implementation plan is COMPLETE

---
Task ID: fix-three-ux-issues
Agent: main
Task: Fix 3 user-reported UX issues: redundant outline button, missing hero section, instructor dashboard showing learning progress

Work Log:
- **Outline button removed** from create-course-page.tsx: removed OutlineSection interface, 4 state variables, 3 handler functions, the "Outline" toolbar button, hint text, and the entire AI Outline Generation Modal (~190 lines removed). Kept "+ Add" and per-lesson "Generate Lesson with AI" buttons.
- **Hero section added** to home-page.tsx: gradient background with floating orbs, typing animation ("Learn. Grow. Excel. Achieve. Thrive. Innovate."), subtitle text, AI prompt input for instructors, Browse Courses + My Learning buttons for students.
- **Instructor dashboard rewritten**: removed all student learning content (learning progress bars, hours studied, courses enrolled, streak, heatmap, donut chart). Replaced with: Total Courses Created, Total Students, Average Rating, Total Lessons stats; My Courses table; Recent Student Activity feed; Quick Actions; Course Overview section. Added `creatorId` query param to `/api/courses` and `/api/enrollments` routes.
- Lint: zero errors
- Dev server compiles and runs
- APIs verified: courses?creatorId= and enrollments?creatorId= return correct data

Stage Summary:
- Three UX issues resolved in single pass
- Instructor dashboard now shows only course management data
- Home page hero section restored with typing animation
- AI course creation flow simplified (outline removed, per-lesson generation kept)

---
Task ID: generate-outline-step
Agent: main
Task: Implement "generate outline" step — API endpoint + frontend for AI slide outline generation with editable outline list

Work Log:
- Created `src/lib/slide-styles.ts` with 5 design style constants (professional, minimal, creative, academic, tech) and slide count range (3-20)
- Created `POST /api/lessons/generate-outline` endpoint: accepts courseId, topic, slideCount, style, language; calls `generateStructuredJSON` from `src/lib/llm.ts` to get slide outline; creates Lesson + Slide records in DB; returns lesson with slides
- Created `PUT /api/slides/[id]` endpoint for editing individual slide titles
- Created `DELETE /api/slides/[id]` endpoint for removing slides from outline
- Added `DELETE` method to `PUT /api/lessons/[id]` for deleting lessons (cascade deletes slides)
- Modified `create-course-page.tsx`:
  - Added new types: `OutlineSlideDraft`, `OutlineLessonDraft`
  - Added state: `courseId`, `generateMode`, outline state variables (`outlineTopic`, `outlineSlideCount`, `outlineStyle`, `outlineGenerating`, `outlineLessons`, `editingOutlineLesson`, `outlineEditingSlides`)
  - Added `ensureCourseSaved()` — auto-saves course as draft when outline mode requires a courseId
  - Added outline handlers: `handleOpenOutlineModal`, `handleGenerateOutline`, `handleUpdateSlideTitle`, `handleDeleteOutlineSlide`, `handleAddOutlineSlide`, `handleRegenerateOutline`, `handleGenerateSlides`, `handleDeleteOutlineLesson`
  - Added "AI Outline" button in lessons panel (primary-colored, with Wand2 icon)
  - Modified modal to support two tabs: "Quick Generate" (existing flow) and "Outline Mode" (new)
  - Outline mode: topic input, slide count with +/- buttons, style dropdown (5 styles), loading state, editable slide list with inline title editing, outline text display, delete slide, add slide, regenerate buttons
  - Added `OutlineLessonCard` component for displaying outline lessons in the lesson list (shows slide count, style badge, expandable slide list, edit/preview/delete actions, "Generate Slides" button)
  - Modified `handleSave` to support updating existing draft courses (when courseId exists from auto-save)
  - Added `onInteractOutside` prevention on DialogContent to fix Select dropdown closing issue
- Verified: lint clean, TypeScript compiles, agent-browser confirmed UI renders correctly (modal tabs, topic input, slide count, style dropdown, generate button enable/disable)

Stage Summary:
- Step 2 (Generate Outline) of the 15-step AI Lesson Generation plan is COMPLETE
- Files created: `src/lib/slide-styles.ts`, `src/app/api/lessons/generate-outline/route.ts`, `src/app/api/slides/[id]/route.ts`
- Files modified: `src/app/api/lessons/[id]/route.ts`, `src/components/lms/pages/create-course-page.tsx`
- Design styles: professional (clean, corporate), minimal (whitespace, sans-serif), creative (bold colors, dynamic), academic (text-heavy, formal), tech (dark theme, code-friendly)
- Next step: Step 3 — Generate slide HTML for each slide in the outline (streaming SSE)

---
Task ID: 3-api
Agent: api-slides-generator
Task: Create POST /api/lessons/generate-slides streaming SSE endpoint

Work Log:
- Read project worklog and all context files: existing `generate-slide-html/route.ts` (single-slide SSE), `src/lib/ai.ts` (streamSlideHtml, parseSSEStream, SLIDE_HTML_SYSTEM_PROMPT), `src/lib/sanitize.ts` (sanitizeHtml, wrapSlideHtml), `src/lib/slide-styles.ts` (SLIDE_STYLES), Prisma schema (Lesson, Slide, Course models), `src/lib/db.ts`
- Created `src/app/api/lessons/generate-slides/route.ts` with the following implementation:
  - **Request validation**: Accepts `{ lessonId: string, language?: string }`, validates lessonId presence
  - **DB fetch**: Fetches lesson with `include: { course, slides: { where: { status: 'DRAFT_OUTLINE' }, orderBy: { order: 'asc' } } }`
  - **Language resolution**: Uses provided language, falls back to `course.language`, then defaults to `'english'`
  - **OutlineJson parsing**: Parses `lesson.outlineJson` to extract topic, style, and per-slide outline text; gracefully handles missing/malformed JSON
  - **Style-specific system prompt**: Defines `STYLE_INSTRUCTIONS` map with 5 style additions (professional, minimal, creative, academic, tech); appends style instruction to `SLIDE_HTML_SYSTEM_PROMPT` via `buildSystemPrompt()`
  - **Per-slide user prompt**: `buildUserPrompt()` includes lesson topic, current slide title, slide outline from outlineJson, slide position (N of total), and Chinese/English language instruction
  - **Continuous SSE stream**: Single `ReadableStream` with manual `controller.enqueue()` — stream does NOT close between slides
  - **Per-slide flow**:
    1. Updates slide status to `GENERATING` in DB
    2. Emits `slide_start` event with `{ slideId, slideTitle, slideIndex, totalSlides }`
    3. Calls `streamSlideHtml(userPrompt, systemPrompt)` → `parseSSEStream()` → reads all chunks
    4. Emits `chunk` event with `{ slideId, html: chunkText }` for each text delta
    5. On completion: `sanitizeHtml()` → `wrapSlideHtml()` → saves `htmlBody` + status `READY` to DB
    6. Emits `slide_complete` with `{ slideId, slideTitle, htmlBody }`
  - **Error handling per slide**: On failure, updates slide status to `ERROR`, emits `slide_error` with `{ slideId, error }`, continues to next slide
  - **Final event**: Emits `all_complete` with `{ lessonId, slidesGenerated: N }`
  - **Outline matching**: Matches slide to outline entry by title; falls back to empty outline if no match found
- Lint: zero errors
- Dev server compiles cleanly

Stage Summary:
- Created `/api/lessons/generate-slides` — batch SSE streaming endpoint that generates HTML for all DRAFT_OUTLINE slides in a lesson
- One continuous SSE stream for all slides with 5 event types: `slide_start`, `chunk`, `slide_complete`, `slide_error`, `all_complete`
- Style-aware system prompt built from SLIDE_HTML_SYSTEM_PROMPT + style-specific instructions
- Per-slide error isolation: individual slide failures don't abort the batch
- Step 3 (Batch Slide HTML Generation) of the AI Lesson Generation plan is COMPLETE

---
Task ID: 3-frontend-unify
Agent: main
Task: Unify create-course-page into single AI flow + implement slide HTML generation frontend

Work Log:
- Removed Quick Generate tab and LessonDraft/LessonCard components
- Single unified outline-based AI generation flow
- One button: "Generate Lesson with AI" (Wand2 icon)
- Modal: Topic + Slide Count + Style → Generate Outline → Edit → Generate Slides
- Implemented handleGenerateSlides with SSE streaming
- Per-slide progress indicators (pending/generating/complete/error)
- Live streaming iframe preview during generation
- Progress bar with cancel button
- Fixed JSX parser error in srcDoc attribute
- Lint: zero errors

Stage Summary:
- Step 2 (Generate Outline) and Step 3 (Generate Slide HTML) of AI Lesson Generation plan are COMPLETE
- Files modified: src/components/lms/pages/create-course-page.tsx
- Files created: src/app/api/lessons/generate-slides/route.ts
- UI is now unified: single "Generate Lesson with AI" button, no more two-tab modal

---
Task ID: 3-verify
Agent: main
Task: Verify unified UI with agent-browser

Work Log:
- Ran bun run lint: PASSED (no errors or warnings)
- Checked dev server: RUNNING (port 3000, serving requests, recent 200 responses confirmed)
- Agent-browser verification:
  1. Navigated to / route → Home page loaded successfully with login UI
  2. Logged in as instructor via quick login button
  3. Navigated to Create Course page via nav button
  4. Verified Create Course page loads with form fields (Title, Description, Category, Language)
  5. Verified exactly ONE button for lesson creation: "Generate Lesson with AI" (ref=e17)
  6. Verified button has lucide-wand-sparkles (Wand2) icon via innerHTML inspection
  7. Clicked "Generate Lesson with AI" button → modal opened
  8. Verified modal contains:
     - Topic field (textbox, placeholder: "e.g., Introduction to Data Science")
     - Slide Count field (spinbutton, default value: 8, with +/- buttons)
     - Design Style field (combobox, default: "Professional Clean, corporate")
     - Cancel and Generate Outline buttons
  9. Verified NO "+ Add" button exists on page (DOM query returned 0 results)
  10. Verified NO tab switcher in modal (DOM query for role="tab" returned 0 results)
  11. Screenshots saved: screenshot-home.png, screenshot-create-course.png, screenshot-modal.png

Stage Summary:
- All 4 verification checks PASSED:
  ✅ Only ONE button for AI generation ("Generate Lesson with AI" with Wand2/wand-sparkles icon)
  ✅ NO "+ Add" button present anywhere on the page
  ✅ NO tab switcher in the modal
  ✅ Modal shows Topic, Slide Count, and Design Style fields
- No issues found. The unified UI is working correctly.

---
Task ID: 3-unified-implementation
Agent: main
Task: Unify AI generation flow + implement Step 3 (Generate Slide HTML)

Work Log:
- Removed Quick Generate tab and LessonDraft/LessonCard/buildLivePreviewDoc components entirely
- Unified to single AI generation flow: one "Generate Lesson with AI" button (Wand2 icon)
- Modal now has no tabs: always shows Topic → Slide Count → Style → Generate Outline → Edit → Generate Slides
- Removed "+ Add" button from lessons panel header
- Created POST /api/lessons/generate-slides endpoint (streaming SSE for batch slide HTML generation)
- Implemented handleGenerateSlides in frontend with full SSE streaming
- Per-slide progress indicators: pending → generating (spinner) → complete (checkmark) → error (alert)
- Live streaming iframe preview during generation with cursor animation
- Progress bar with cancel button during generation
- OutlineLessonCard shows: green checkmark when all complete, pulse animation during generation, Draft badge for ungenerated
- First completed slide preview iframe shown when lesson has generated slides
- Fixed JSX parser error: complex srcDoc expression extracted to IIFE variable
- Fixed malformed JSX comment (missing closing brace)
- Lint: zero errors, zero warnings
- Agent-browser verified: single AI button, no +Add button, no tabs in modal, correct form fields

Stage Summary:
- Step 2 (Generate Outline) COMPLETE
- Step 3 (Generate Slide HTML) COMPLETE  
- Files created: src/app/api/lessons/generate-slides/route.ts
- Files modified: src/components/lms/pages/create-course-page.tsx (full rewrite, ~530 lines → clean unified flow)
- Next step: Step 4 — remaining steps in the 15-step plan

---
Task ID: click-to-edit-and-imagekit
Agent: main

Work Log:
- **Implemented click-to-edit on rendered slides** in classroom-page.tsx:
  - Added `iframeRef` for direct DOM access to the iframe's contentDocument
  - Added `currentSlideIdRef` to track slide ID for persistence (extracted from lesson API response)
  - Added `slideContextRef` to store style context parsed from lesson's outlineJson
  - Added `elementEdit` state: { show, targetElement, outerHTML, position, instruction, loading }
  - Added `handleIframeClick` callback: captures clicked element, computes toolbar position accounting for zoom transform
  - Added `attachIframeClickListener` callback: attaches/removes click listener on iframe body
  - Added `handleElementEdit` callback: calls API, replaces element in iframe DOM via `replaceWith()`, rebuilds full HTML from iframe body, updates localState, persists to DB via PUT /api/slides/[id]
  - Added Escape key handler to close toolbar
  - Added useEffect to re-attach click listener when htmlBody changes (lesson navigation)
  - Added floating toolbar JSX: small card with Pencil icon, instruction input, Apply button, positioned at click coordinates via `style={{ left, top }}`
  - Added `ref={iframeRef}` to the iframe element
  - Added `Pencil` icon import from lucide-react
  - **Sandbox analysis**: `sandbox="allow-same-origin"` allows parent-frame direct DOM access (contentDocument). No sandbox change needed for click-to-edit. Note: `allow-scripts` is not present, so Tailwind CDN `<script>` in srcDoc may not execute (pre-existing concern, not modified).

- **Created `POST /api/slides/element-edit/route.ts`**:
  - Accepts `{ elementHtml, instruction, slideContext }`
  - Uses `ELEMENT_EDIT_SYSTEM_PROMPT` from ai.ts (same tag, preserve Tailwind classes, ImageKit URL patterns)
  - Calls `generateText()` non-streaming
  - Sanitizes returned HTML with `sanitizeHtml()`
  - Returns `{ success: true, data: { replacementHtml } }`

- **Created `POST /api/imagekit/sign/route.ts`**:
  - Accepts `{ urlPath, expirySeconds? }`
  - Signs ImageKit URLs server-side using HMAC-SHA1 with IMAGEKIT_PRIVATE_KEY
  - URL-safe Base64 signature encoding
  - Returns `{ success: true, data: { signedUrl, expiresAt } }`
  - Graceful error when IMAGEKIT_URL_ENDPOINT or IMAGEKIT_PRIVATE_KEY not configured
  - Default expiry: 1 hour

- **Updated `src/lib/ai.ts`**:
  - Added `IMAGEKIT_ENDPOINT` constant from env (server-side only)
  - Updated `SLIDE_HTML_SYSTEM_PROMPT`: added concrete ImageKit URL example, added rule 11 (no non-ImageKit external images)
  - Updated `INLINE_EDIT_SYSTEM_PROMPT`: added ImageKit generation URL pattern, added transformation param patterns (e-removedotbg, e-changebg-prompt, e-upscale, e-dropshadow) with `?tr=` query param syntax
  - Added `ELEMENT_EDIT_SYSTEM_PROMPT`: 9 rules for single-element editing (same tag, preserve classes, no extra wrappers, ImageKit URLs)

- **Updated `.env`** with ImageKit placeholder env vars (commented out)

- **Sanitizer verification**: `src/lib/sanitize.ts` already correctly handles ImageKit domain restriction for img src. When IMAGEKIT_URL_ENDPOINT is set, only that domain is allowed. When not set, falls back to allowing any https images for development.

- Lint: zero errors
- Dev server: no runtime errors
- Agent-browser verified: click inside iframe → toolbar appears with "Edit Element" heading, close button, instruction input, and disabled Apply button
- API tested: element-edit returns correct sanitized replacement HTML; imagekit/sign returns graceful error when not configured

Stage Summary:
- Click-to-edit feature COMPLETE: floating toolbar appears on iframe element click, captures outerHTML, sends to API, replaces element in DOM, persists to DB
- ImageKit integration infrastructure COMPLETE: signing endpoint, system prompt updates, sanitizer verified
- SlideVersion history NOT implemented (no model in schema, per earlier plan decision)
- Files created: src/app/api/slides/element-edit/route.ts, src/app/api/imagekit/sign/route.ts
- Files modified: src/components/lms/pages/classroom-page.tsx, src/lib/ai.ts, .env
- Files NOT modified: hero section, any other pages, sandbox attribute, prisma schema, types

**NOTE for user**: ImageKit credentials needed. Please provide:
- `IMAGEKIT_URL_ENDPOINT` (e.g., https://ik.imagekit.io/your_id)
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`

**NOTE on sandbox**: The iframe has `sandbox="allow-same-origin"` which allows direct DOM access from the parent frame (used for click-to-edit). However, `allow-scripts` is NOT present, which means the Tailwind CDN `<script>` in srcDoc does not execute. This is a pre-existing issue that affects slide styling rendering. Adding `allow-scripts` would fix Tailwind rendering but would also allow any scripts in the HTML to execute. Recommend deciding on this separately.
