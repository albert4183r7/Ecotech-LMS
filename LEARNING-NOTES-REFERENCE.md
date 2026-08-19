# AI SLIDE GENERATOR REFERENCE — LEARNING NOTES

> **Source**: Eraser.io architecture diagram exported as PNG (10,852 × 8,207 px)
> **Diagram Title**: "AI PPT Generator"
> **Date**: August 19, 2026
> **Diagram Content Location**: Top 40% of the image (rows 0-1 of 3). Bottom 60% is blank.

---

## 1. Executive Summary

The reference product is an AI-powered PPT/slide generator built with React, Firebase, and Gemini AI. Its core architecture follows a **two-phase generation pipeline**: (1) Generate an outline as JSON, let the user review/edit it, then (2) generate each slide's HTML **one by one** using the outline as metadata. Slides are rendered inside **iframes** using TailwindCSS + Flowbite UI + Lucide Icons. The system uses **ImageKit** for AI image generation and transformation. Export to PPTX is done client-side using `html-to-image` + `pptxgenjs`. Inline AI editing works by selecting DOM elements inside the iframe and replacing them via AI.

---

## 2. Reference Sources Used

| Source | Status | Notes |
|--------|--------|-------|
| **Eraser Diagram** | ✅ FULLY ANALYZED | Exported as PNG, analyzed tile-by-tile at 2713×2735px per tile |
| **Demo App** (dcmk.short.gy) | ❌ NOT YET EXPLORED | Tool outage prevented access |
| **YouTube** (lJbIs8_5aqU) | ❌ NOT YET ACCESSED | Tool outage prevented access |

---

## 3. Complete Feature Inventory

### 3.1 User-Facing Features [VISIBLE in diagram]

| Feature | Status | Evidence |
|---------|--------|----------|
| Landing page with hero section | [VISIBLE] | "From Idea to Presentation in One Click ✨" |
| Topic/description input | [VISIBLE] | Input field: "Describe your topic, we'll design the slides!" |
| Slide count input | [VISIBLE] | Field labeled "No of Slides" |
| Design style selection (6+ styles) | [VISIBLE] | Grid of 6 style thumbnails in Settings |
| Outline generation via AI | [VISIBLE] | "Generate PPT Outline" box in workflow |
| Outline editing (title + outline fields) | [VISIBLE] | "Edit Sliders Content" modal with Title + Outline fields, Cancel/Update buttons |
| Per-slide HTML generation | [VISIBLE] | "Generate Each Slide One by One" with "AI Model to Generate it" |
| Slide rendering in iframe | [VISIBLE] | SliderFrame component with sandbox iframe |
| Element selection inside iframe | [VISIBLE] | MouseOver/MouseOut/Click handlers with outline highlighting |
| "Edit with AI" button on slides | [VISIBLE] | Visible on rendered slide preview |
| AI image generation via ImageKit | [VISIBLE] | URL pattern `ik.imagekit.io/ikmedia/ik-genimg-prompt-{prompt}/{name}.jpg` |
| Image transformation via ImageKit | [VISIBLE] | `?tr=fo-auto,<other transformation>` in edit prompt |
| Export to PPTX | [VISIBLE] | `exportAllIframesToPPT` function using pptxgenjs |
| Project management (My Projects) | [VISIBLE] | "My Project" section, project listing |
| Free vs Paid user tiers | [VISIBLE] | User flow: "Free User" (2 projects) vs "paid/Subscribed User" (unlimited) |
| Reference/document upload | [VISIBLE] | Upload zone in creation flow (file input area) |
| Outline display with slide list | [VISIBLE] | Left sidebar with slide list in editor |
| Slide preview (rendered) | [VISIBLE] | Right panel showing slide with image and text |

### 3.2 Features NOT Visible in Diagram

| Feature | Status | Notes |
|---------|--------|-------|
| Vector database / RAG pipeline | [NOT SHOWN] | No embedding model, no vector store drawn |
| Chunking for documents | [NOT SHOWN] | No text splitting component visible |
| Redis / BullMQ queue | [NOT SHOWN] | No queue component drawn |
| WebSocket / SSE streaming | [NOT SHOWN] | No real-time connection component drawn |
| Versioning / history | [NOT SHOWN] | No version control or undo system drawn |
| Background removal | [NOT SHOWN] | Not depicted (but ImageKit transformations may cover it) |
| Image upscaling | [NOT SHOWN] | Not explicitly depicted |
| Slide reordering | [NOT SHOWN] | Not visible in editor wireframe |
| Presentation mode / fullscreen | [NOT SHOWN] | Not drawn |
| PDF export | [NOT SHOWN] | Only PPTX export shown |

---

## 4. Complete User Workflow [VISIBLE]

```
1. Landing Page
   └── "From Idea to Presentation in One Click ✨"
       └── User clicks "Get Started" or "Create New PPT"

2. Input Screen
   └── "Describe your topic, we'll design the slides!"
       ├── Topic/description input field
       ├── "No of Slides" input
       ├── File upload zone (reference documents)
       └── Submits to create project

3. Settings Screen (/workspace/project/<project-id>/outline)
   └── "PPT Sliders Settings"
       ├── "Select Style" — 6 design style options
       ├── "Outline" — 3 input fields with edit icons (AI-generated)
       └── "Generate" button

4. Outline Review/Edit
   └── "Edit Sliders Content" modal
       ├── Title input field
       ├── Outline textarea
       ├── "Cancel" button
       └── "Update" button

5. Editor Workspace (/workspace/project/<projectId>/editor)
   └── Split-pane interface:
       ├── LEFT: Slide list/thumbnails with sidebar (5 input fields)
       └── RIGHT: Live slide preview in iframe showing slide content

6. Slide Interaction
   └── Inside iframe:
       ├── Hover: blue dotted outline on elements
       ├── Click: red solid outline, element becomes contentEditable
       ├── "Edit with AI" button: triggers AI rewrite of selected element
       └── "Generate Image Instantly" via ImageKit

7. Export
   └── "Export PPT" → Converts all iframes to PNG → Assembles PPTX → Downloads
```

---

## 5. AI Generation Workflow [VISIBLE]

### 5.1 Two-Phase Pipeline ("Workflow Part 1")

```
USER REQUIREMENT
    ↓
Option to Select Sliders Style
    ↓
Option To Edit Outline
    ↓
Generate PPT Outline  ←── AI Model + Prompt
    ↓
┌─────────────────────────────────┐
│ Generate Each Slide One by One  │
│ AI Model to Generate it         │
│ (HTML Tailwindcss)               │
│                                  │
│ How to Generate Slider With     │
│ Formatting/Layout etc           │
└─────────────────────────────────┘
    ↓
<body></body>  ←── Generated HTML for each slide
    ↓
<html>  ←── DEFAULT_HTML (full HTML document with CDN libs)
    ↓
Save to DB
    ↓
Finish? Option to Edit Slides (Inline Editing)
```

### 5.2 Phase 1: Outline Generation

**Input to AI:**
- User's topic (`{userInput}`)
- Slide count (e.g., "4 to 6 slides")
- Structural requirements (Welcome → Agenda → Content → Thank You)

**Prompt (verbatim from diagram):**
```
Generate a PowerPoint slide outline for the topic {userInput}. AI Agents and Agentic AI". Create 4 to 6 slides in it total. Each slide should include a topic title and 3-4 bullet points outlining that clearly explains what content the slide will cover.
Include the following structure:
The first slide should be a Welcome Slide.
The second slide should be an Agenda.
The final slide should be a Thank You screen.
Return the response only in JSON format, following this schema:
[
  {
    "slideNo": "",
    "slidePoint": "",
    "outline": ""
  }
]
```

**Output:** JSON array of `{ slideNo, slidePoint, outline }` objects.

**User Interaction:** User can edit outline in "Edit Sliders Content" modal before proceeding.

### 5.3 Phase 2: Slide HTML Generation (One by One)

**Critical Design Decision:** Each slide is generated **individually** ("Generate Each Slide One by One"), not as a batch.

**Prompt inputs per slide (3 variables):**
1. `{DESIGN_STYLE}` — The full style object with designGuide, colors, gradients
2. `{COLOR_CODE}` — Hex color values for primary, accent, background, etc.
3. `{METADATA}` — The current slide's outline data (title, bullet points, slide number)

**SLIDER_PROMPT (verbatim from diagram):**
```javascript
const SLIDER_PROMPT = `Generate HTML (TailwindCSS + Flowbite UI + Lucide Icons) code for a 16:9 ppt slider in Modern Dark style.
{DESIGN_STYLE}
- [Fixed 16:9] Layout: No responsive design; use a fixed layout component-like structure. Use different layouts depending on content and style.
- Use TailwindCSS colors like primary, accent, gradients, background etc., and include color for: {COLOR_CODE}
- Metadata for Slider: {METADATA}

- Ensure images are optimized to fit within their container div and do not overflow
- Use proper width/height constraints on image tags and scale down if needed to remain inside the slide
- Maintain 16:9 aspect ratio for all slides and all media
- Use CSS classes like 'object-cover' or 'object-contain' for images to prevent stretching or overflow
- Use grid or flex layouts to properly divide the slide so elements do not overlap

Generate Image if needed using:
https://ik.imagekit.io/ikmedia/ik-gening-prompt/{imagePrompt}/{altImageName}.jpg?width=1024&height=576&nologo=true
Replace {imagePrompt} with relevant image prompt and altImageName with a random image name.

<!-- Slide Content Wrapper (Fixed 16:9 Aspect Ratio) -->
<div class="w-[800px] h-[450px] relative overflow-hidden">
  <!-- Slide content here -->
</div>
Also do not add any overlay : Avoid this :
<div class="absolute inset-0 bg-gradient-to-br from-primary to-secondary opacity-20"></div>

Just provide body content for 1 slider. Make sure all content including images stays within the main slide div and preserves the 16:9 ratio.`;
```

**Output:** Raw HTML string (body content only, not a full HTML document).

---

## 6. Document / Reference Workflow

### What's Visible [VISIBLE]
- A file upload zone exists in the creation/input flow
- It allows uploading documents (PDF implied by label)

### What's NOT Visible [NOT SHOWN]
- **No document parsing pipeline** is drawn
- **No text extraction** component shown
- **No chunking** component shown
- **No embedding model** or **vector database** shown
- **No RAG retrieval** component shown
- **No context injection** into prompts shown

### Inference
The diagram shows the upload UI but **does not show any backend processing** for uploaded documents. The reference product may:
1. Simply extract text and inject it into the prompt (simple approach)
2. Use RAG (not drawn but common)
3. The upload may be for other purposes (e.g., reference images, not text documents)

**Confidence: LOW** — The document handling pipeline cannot be determined from this diagram alone.

---

## 7. Outline Generation

### What We Know [VISIBLE]
1. **Trigger**: After user inputs topic and slide count
2. **AI Call**: Single LLM call with the outline prompt
3. **Output Format**: JSON array with `{ slideNo, slidePoint, outline }`
4. **Structure Enforced**: Welcome → Agenda → Content slides → Thank You
5. **Editable**: User can modify the outline via modal before slide generation
6. **Outline Retained**: The outline data (`{METADATA}`) is passed to each slide generation call

### Design Insight
The outline serves as the **source of truth** for the entire generation. Each slide generation call receives its corresponding outline entry as `{METADATA}`. This ensures the slides follow the planned structure.

---

## 8. Slide Generation

### Architecture [VISIBLE]
1. **Sequential**: Each slide generated one-by-one (not in parallel)
2. **Independent per slide**: Each LLM call generates HTML for ONE slide only
3. **Layout Variety**: The prompt explicitly says "Use different layouts depending on content and style"
4. **Fixed Dimensions**: 800×450px wrapper (16:9)
5. **CDN Libraries**: TailwindCSS, Flowbite UI, Lucide Icons loaded in iframe
6. **Additional Libraries Available**: Font Awesome, Chart.js, AOS, GSAP, Lottie, Swiper.js, Tippy.js

### Slide HTML Structure (example from DUMMY_SLIDER) [VISIBLE]
```html
<div class="w-[800px] min-h-[500px] relative bg-[#000000] text-white overflow-hidden">
  <div class="absolute inset-0 bg-gradient-to-br from-[#000000] to-[#1F1F1F] opacity-70"></div>
  <div class="grid grid-cols-2 grid-rows-2 h-full relative z-10">
    <!-- Left Top - Title & Outline -->
    <div class="col-span-1 row-span-1 p-8 flex flex-col justify-start items-start">
      <h1>...</h1><p>...</p>
    </div>
    <!-- Right Top - Image/Visual -->
    <div class="col-span-1 row-span-1 p-4 flex justify-end items-start">
      <img src="..." class="rounded-lg shadow-lg w-full h-auto object-cover max-h-[200px]">
    </div>
    <!-- Left Bottom - Call to Action -->
    <div class="...">...</div>
    <!-- Right Bottom - Slide Number -->
    <div class="...">Slide 1 | Introduction</div>
  </div>
</div>
```

### Rendering [VISIBLE]
- Each slide's HTML is injected into an **iframe** via `doc.write(htmlContent)`
- The iframe loads a full DEFAULT_HTML document with TailwindCSS config, Flowbite, Font Awesome, etc.
- The slide HTML replaces `<div id="root"></div>` in the default template
- Color variables are injected: `window.colors = JSON.stringify(colors)`
- Iframe uses `sandbox="allow-scripts allow-same-origin"`

---

## 9. Slide-to-Slide Coherence

### What's Visible [VISIBLE]
- **Design style is constant**: The same `{DESIGN_STYLE}` and `{COLOR_CODE}` is passed to every slide
- **Outline provides structure**: Each slide receives its specific `{METADATA}` from the outline
- **Sequential generation**: Slides are generated one-by-one, so the system could theoretically pass previous slide context (but this is not explicitly shown)

### What's NOT Visible [NOT SHOWN]
- Whether previous slide content is sent as context to the next slide's generation
- Whether slide number/position awareness is used in the prompt

### Key Observation
The reference system relies on **style consistency + outline structure** for coherence, NOT on sending previous slide content. The outline acts as a global plan, and each slide independently follows its part of the plan with consistent styling.

---

## 10. Image Generation and Transformation

### Image Generation [VISIBLE]
- **Service**: ImageKit (ik.imagekit.io)
- **URL Pattern**: `https://ik.imagekit.io/ikmedia/ik-genimg-prompt/{imagePrompt}/{altImageName}.jpg`
- **Additional Params**: `?width=1024&height=576&nologo=true`
- **Integration**: The AI includes these URLs directly in the generated HTML `<img>` tags
- **Prompt Construction**: The LLM is instructed to replace `{imagePrompt}` with a relevant prompt and `{altImageName}` with a random name

### Alternative Image URL (from r0c2 tile) [VISIBLE]
- `https://image.pollinations.ai/prompt/{imagePrompt}/{imageName}.jpg?width=1024&height=576&nologo=true`
- This appears to be an alternative/fallback image generation service

### Image Transformation [VISIBLE]
- **Service**: ImageKit transformations via URL query params
- **Pattern**: `?tr=fo-auto,<other transformation>`
- **Examples mentioned in edit prompt**:
  - `fo-auto` — Auto face/object focus cropping
  - Background removal
  - Image scaling
  - Image optimization
- **How it works**: When the user asks to modify an image, the AI regenerates the HTML with updated ImageKit URL transformation params

### ImageKit.io Box [VISIBLE]
- A dedicated box labeled "ImageKitio" with an upward arrow is shown in the flow
- Below it: "Generate Image Instantly"

---

## 11. Inline AI Editing

### Element Selection Mechanism [VISIBLE - VERBATIM CODE]
```javascript
// Hover: show blue dotted outline
const handleMouseOver = (e: MouseEvent) => {
  if (selectedEl) return;
  const target = e.target as HTMLElement;
  if (hoverEl && hoverEl !== target) {
    hoverEl.style.outline = "";
  }
  hoverEl = target;
  hoverEl.style.outline = "2px dotted blue";
};

// Click: select element, make it editable
const handleClick = (e: MouseEvent) => {
  e.stopPropagation();
  const target = e.target as HTMLElement;
  if (selectedEl && selectedEl !== target) {
    selectedEl.style.outline = "";
    selectedEl.removeAttribute('contenteditable');
  }
  selectedEl = target;
  selectedEl.style.outline = "2px solid red";
  selectedEl.contentEditable = "true";
  selectedEl.focus();
};
```

### AI Edit Function [VISIBLE - VERBATIM CODE]
```javascript
const editWithAI = async (input: string) => {
  setLoading(true);
  const selectedEl = selectedElement.current;
  if (!selectedEl || !iframe) return;
  const oldHTML = selectedEl.outerHTML;

  const prompt = `
    Regenerate or rewrite the following HTML code based on this user instruction:
    ${input}
    ${oldHTML}
  `;

  try {
    const result = await model.generateContent(prompt);
    const newHTML = (await result.response.text()).trim();
    const tempDiv = iframe.contentDocument.createElement("div");
    tempDiv.innerHTML = newHTML;
    const newNode = tempDiv.firstElementChild;
    if (newNode && selectedEl.parentNode) {
      selectedEl.parentNode.replaceChild(newNode, selectedEl);
    }
  } catch (err) {
    console.error("AI generation failed:", err);
  } finally {
    setLoading(false);
  }
};
```

### Image-Aware Edit Prompt [VISIBLE - VERBATIM]
```
Regenerate or rewrite the following HTML code based on this user instruction.
If user asked to change the image/regenerate the image then make sure to use
ImageKit:
'https://ik.imagekit.io/ikmedia/ik-gening-prompt/{imagePrompt}/{altImageName}.jpg'
Replace {imagePrompt} with relevant image prompt and altImageName with a random image name.
If user want to crop image, or remove background or scale image or optimize image 
then add image kit.ai transformation by providing ?tr=fo-auto,<other transformation> etc.
"User Instruction is ${userAIPrompt}"
HTML code:
${oldHTML}
```

### Key Design Decisions
1. **Scope**: Only the selected element's `outerHTML` is sent to AI, not the whole slide
2. **Replacement**: The AI returns new HTML, which replaces ONLY the selected DOM node via `replaceChild`
3. **Preservation**: All other elements on the slide remain untouched
4. **Image handling**: The edit prompt explicitly instructs the AI to use ImageKit URLs for image changes
5. **Transformation**: ImageKit URL params (`?tr=...`) handle cropping, background removal, scaling, optimization
6. **AI Model**: Uses `model.generateContent()` (Gemini API pattern)

---

## 12. Save / Update / Versioning

### What's Visible [VISIBLE]
- **"Save to DB"** box in the workflow (after slide generation)
- **Firebase Firestore** used as database (from imports: `firebase/firestore`, `doc`, `getDoc`, `setDoc`)
- **Project CRUD**: `setDoc` for saving, `getDoc` for loading

### What's NOT Visible [NOT SHOWN]
- Versioning/history system
- Undo/redo
- Auto-save
- Slide-level save (only project-level shown)

---

## 13. Export

### Export to PPTX [VISIBLE - VERBATIM CODE]
```javascript
const exportAllIframesToPPT = async () => {
  if (!containerRef.current) return;
  setDownloadLoading(true);
  const pptx = new PptxGenJS();
  const iframes = containerRef.current.querySelectorAll("iframe");

  for (let i = 0; i < iframes.length; i++) {
    const iframe = iframes[i] as HTMLIFrameElement;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) continue;
    const slideNode = iframeDoc.querySelector("body > div") || iframeDoc.body;
    if (!slideNode) continue;

    // Convert each slide to PNG
    const dataUrl = await htmlToImage.toPng(slideNode, { quality: 1 });
    const slide = pptx.addSlide();
    slide.addImage({
      data: dataUrl,
      x: 0, y: 0,
      w: 10, h: 5.625,  // Standard PPTX 16:9 dimensions
    });
  }

  setDownloadLoading(false);
  pptx.writeFile({ fileName: "MyProjectSlides.pptx" });
};
```

### Key Design Decisions
1. **Client-side export**: Runs entirely in the browser, no server needed
2. **Library**: `html-to-image` (converts DOM to PNG) + `pptxgenjs` (creates PPTX)
3. **Method**: Each iframe's body content is screenshotted as PNG, then embedded as image in PPTX slide
4. **Dimensions**: 10 × 5.625 inches (standard 16:9 PPTX)
5. **Install**: `npm install html-to-image pptxgenjs`
6. **Limitation**: Slides are exported as **images**, not editable PPTX objects. Text and shapes in the exported PPTX cannot be edited in PowerPoint.

---

## 14. Loading / Streaming / Error Behavior

### What's Visible [VISIBLE]
- **Loading state**: `setLoading(true)` / `setDownloadLoading(true)` in code
- **Loader component**: `<LoaderIcon>` from lucide-react imported and used
- **Error handling**: try/catch with `console.error("AI generation failed:", err)`

### What's NOT Visible [NOT SHOWN]
- Streaming/SSE for progressive rendering
- Progress indicators (e.g., "Generating slide 3 of 8")
- Retry logic
- Partial generation handling

---

## 15. Architecture Learned from Diagram

### Tech Stack [VISIBLE / INFERRED]

| Component | Technology | Evidence |
|-----------|-----------|----------|
| Frontend Framework | React + TypeScript | JSX, hooks, type annotations |
| Routing | React Router | Explicit box: "React Router", routes: `/workspace`, `/workspace/project/<id>/outline`, `/workspace/project/<id>/editor` |
| Styling | TailwindCSS | Used in all generated HTML |
| UI Library | Flowbite UI | Loaded in DEFAULT_HTML |
| Icons | Lucide Icons, Font Awesome | Both loaded in DEFAULT_HTML |
| Animations | AOS, GSAP, Lottie, Swiper.js, Tippy.js | All loaded in DEFAULT_HTML |
| AI Model | Gemini | `model.generateContent()`, `GeminiAIModel` import |
| Database | Firebase Firestore | `firebase/firestore`, `doc`, `getDoc`, `setDoc` |
| Image Generation | ImageKit | URL pattern `ik.imagekit.io/ik-genimg-prompt-...` |
| Alternative Images | Pollinations.ai | `image.pollinations.ai/prompt/...` |
| Export (image) | html-to-image | `htmlToImage.toPng()` |
| Export (PPTX) | pptxgenjs | `new PptxGenJS()` |
| ID Generation | uuid (v4) | `import { v4 as uuidv4 } from 'uuid'` |

### Routing Structure [VISIBLE]
```
/workspace                          → Landing / Project listing
/workspace/project/<projectId>/outline  → Settings + Outline
/workspace/project/<projectId>/editor   → Slide editor
```

### User Tiers [VISIBLE]
- **Free User**: Limited to 2 projects, limited access
- **Paid/Subscribed User**: Unlimited projects, all access

---

## 16. Data Flow Learned from Diagram

### Complete Generation Data Flow

```
USER INPUT (topic, slide count, style selection)
    ↓
[CREATE PROJECT] → Firebase Firestore (setDoc)
    ↓
[GENERATE OUTLINE]
    → AI Model (Gemini)
    → Prompt: Outline generation prompt
    → Input: {userInput}, slide count
    → Output: JSON array [{slideNo, slidePoint, outline}]
    ↓
[USER REVIEWS/EDITS OUTLINE]
    → "Edit Sliders Content" modal
    → User modifies title/outline per slide
    → "Update" saves changes
    ↓
[GENERATE SLIDES - ONE BY ONE]
    For each slide in outline:
      → AI Model (Gemini)
      → Prompt: SLIDER_PROMPT
      → Input: {DESIGN_STYLE}, {COLOR_CODE}, {METADATA}
      → Output: HTML body content
      → Wrap in DEFAULT_HTML (full document with CDN libs)
      → Render in iframe
      → Save to DB
    ↓
[OPTIONAL: INLINE EDITING]
    → User selects element in iframe (click)
    → User types AI instruction
    → AI regenerates only that element's HTML
    → DOM replacement (replaceChild)
    ↓
[OPTIONAL: EXPORT]
    → For each iframe: html-to-image.toPng() → PPTX slide
    → pptxgenjs.writeFile() → Download .pptx
```

---

## 17. AI Pipeline Learned from References

### Pipeline Summary

```
Stage 1: OUTLINE GENERATION
  Input: Topic + Slide Count
  AI Model: Gemini
  Prompt: Structured JSON generation with mandatory structure
  Output: [{slideNo, slidePoint, outline}]
  User Action: Review and edit outline

Stage 2: SLIDE HTML GENERATION (per slide, sequential)
  Input: DESIGN_STYLE + COLOR_CODE + METADATA (current slide's outline)
  AI Model: Gemini
  Prompt: TailwindCSS + Flowbite + Lucide HTML generation
  Output: HTML body content string
  Additional: ImageKit URLs for images embedded in HTML

Stage 3: RENDERING
  Method: iframe with doc.write()
  Template: DEFAULT_HTML (TailwindCSS config + CDN libs)
  Color injection: window.colors = JSON.stringify(colors)

Stage 4: INLINE AI EDITING (optional, per element)
  Input: Selected element's outerHTML + User instruction
  AI Model: Gemini
  Prompt: "Rewrite this HTML based on instruction"
  Output: New HTML for that element only
  Method: DOM replaceChild (surgical replacement)

Stage 5: EXPORT (optional)
  Method: html-to-image (DOM→PNG) + pptxgenjs (PNG→PPTX)
  Scope: Client-side, all iframes
```

### Design Style System [VISIBLE - VERBATIM]

Each style is a JSON object with:
```json
{
  "styleName": "Modern Dark",
  "designGuide": "Use a dark background (#0f172a)...",
  "colors": {
    "background": "#0f172a",
    "textPrimary": "#ffffff",
    "textSecondary": "#94a3b8",
    "accent": "#3b82f6",
    "cardBg": "#1e293b",
    "border": "#334155"
  },
  "gradients": {
    "primary": "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
    "subtle": "linear-gradient(to bottom right, #1e293b, #0f172a)"
  }
}
```

**Styles identified in diagram:**
1. Professional Blue 📘
2. Minimal White ⚪
3. Modern Gradient 🌈
4. Elegant Dark ♥
5. Creative Pastel 🩷
6. Startup Pitch 💚
7. Futuristic Neon ✴
8. Modern Dark (detailed in code)
9. Clean Minimal (detailed in code)
10. Vibrant Gradient (detailed in code)
11. Infographic Style (partial — cyberpunk colors, charts, vector icons)

Each style has: `styleName`, `designGuide`, `colors` (6 properties), `gradients` (2 properties).

The `designGuide` is a **natural language description** injected into the SLIDER_PROMPT to guide the AI's design choices.

---

## 18. What Makes the Reference Product Good

### Observable Strengths

1. **Two-Phase Pipeline with User Control**: Outline is generated FIRST, user reviews/edits it, THEN slides are generated. This gives the user control over the overall structure before committing to full generation.

2. **Design Style System**: Rich, detailed style definitions with `designGuide` (natural language), `colors` (hex values), and `gradients` (CSS). This ensures visual consistency across all slides.

3. **Per-Element AI Editing**: Rather than regenerating an entire slide, the system targets the specific DOM element the user selected. This is precise and non-destructive.

4. **ImageKit Integration**: Uses URL-based image generation and transformation. The AI includes ImageKit URLs directly in HTML output. Transformations (crop, bg-remove, upscale) are applied via URL params — no separate processing pipeline needed.

5. **Iframe Rendering with Full CDN Stack**: Slides render in iframes with TailwindCSS, Flowbite, Font Awesome, Chart.js, AOS, GSAP, Lottie, Swiper.js. This gives the AI access to a rich component library without building custom components.

6. **Fixed 16:9 Layout**: Explicit width/height constraints prevent overflow issues. The prompt repeatedly enforces this.

7. **Layout Variety Instruction**: The prompt explicitly tells the AI to "Use different layouts depending on content and style" — encouraging visual variety.

### Not Observable from Diagram Alone
- Actual generation quality (need to test demo app)
- Slide-to-slide coherence in practice (need to test demo app)
- Document/reference grounding effectiveness (pipeline not drawn)
- Streaming behavior (not drawn)

---

## 19. Important Functional Behaviors to Reproduce in My LMS

### HIGH PRIORITY (Visible + Clear Implementation Path)

1. **Design Style Object Structure**: Each style should have `designGuide` (natural language for prompt), `colors` (hex values), `gradients` (CSS). The `designGuide` text is injected directly into the slide generation prompt.

2. **Two-Phase Pipeline**: Generate outline as structured JSON → User reviews/edits → Generate each slide's HTML one-by-one using outline as metadata.

3. **Per-Element Inline AI Editing**: Capture selected element's `outerHTML`, send to AI with user instruction, replace ONLY that DOM node. Include ImageKit instructions for image modifications.

4. **ImageKit URL-Based Generation**: Use `ik.imagekit.io/ik-genimg-prompt/{prompt}/{name}.jpg` pattern. Let the AI construct these URLs directly in generated HTML. Use `?tr=` params for transformations.

5. **Edit-with-AI Prompt for Images**: When the user asks to modify an image, the AI should use ImageKit URL transformations (`?tr=fo-auto,...`) rather than generating a completely new image.

6. **Client-Side PPTX Export**: Use `html-to-image` + `pptxgenjs` to convert each iframe's content to a PNG, then embed in a PPTX file. This avoids needing a server-side export pipeline.

7. **DEFAULT_HTML Template**: A full HTML document loaded into each iframe with TailwindCSS config, CDN libraries, and color variable injection. The AI only generates body content.

8. **Outline as Metadata**: Each slide generation call receives the full design style + colors + the specific slide's outline entry. The outline is the source of truth for content planning.

### MEDIUM PRIORITY (Visible but Implementation Needs Thought)

9. **Slide Generation One-by-One**: Sequential generation allows for potential progress feedback and reduces the risk of one bad slide ruining the batch.

10. **Anti-Overlay Instruction**: The prompt explicitly forbids gradient overlays that can obscure content. This is a practical quality tip.

11. **Image Optimization Constraints**: The prompt enforces `object-cover`/`object-contain`, width/height constraints, and no-overflow rules to prevent image layout issues.

### LOW PRIORITY / UNCLEAR (Not Visible or Partially Visible)

12. **Document/Reference Pipeline**: Upload UI exists but backend processing is not drawn. Implementation approach is unclear.

13. **Streaming**: Not shown in diagram. Current LMS already has SSE streaming which may be sufficient.

14. **Versioning/History**: Not shown. Would need separate design.

---

## 20. Reference App vs My LMS — Conceptual Gap Analysis

| Feature | Reference Diagram | My LMS Current State | Gap |
|---------|-------------------|---------------------|------|
| Outline Generation | JSON: `{slideNo, slidePoint, outline}` | JSON outline via `/api/lessons/generate-outline` | Similar, need to compare schema |
| Outline Editing | Modal with Title + Outline fields, Cancel/Update | Editable outline in UI | Similar |
| Design Style System | `designGuide` + `colors` + `gradients` per style | `SLIDE_STYLES` with CSS vars + prompt descriptions | Need to add `designGuide` natural language text |
| Slide HTML Generation | Per-slide, one-by-one, TailwindCSS+Flowbite+Lucide | Per-slide streaming via SSE, TailwindCSS | Similar architecture |
| Image Generation | ImageKit URL-based (`ik-genimg-prompt-...`) | ImageKit sign endpoint exists but unused | **CRITICAL GAP**: Need ImageKit URL pattern |
| Image Transformation | ImageKit `?tr=` params in AI edit prompt | Not implemented | **CRITICAL GAP** |
| Inline AI Editing | Per-element DOM replacement via `replaceChild` | `/api/generate-slide-inline-edit` exists | Need to verify scope (full slide vs element) |
| Element Selection | iframe hover/click handlers with outline + contentEditable | Need to verify | **POTENTIAL GAP** |
| DEFAULT_HTML Template | Full doc with TailwindCSS config + 7 CDN libs | `src/lib/sanitize.ts` + basic HTML wrapper | Need CDN library enrichment |
| Export | Client-side html-to-image + pptxgenjs | `/api/generate-pptx` route exists | Need to verify implementation approach |
| Color Injection | `window.colors = JSON.stringify(colors)` in iframe | CSS variables in style tag | Different approach, both valid |
| Document/Reference | Upload UI visible, backend NOT drawn | Upload route created, text extraction attempted | Both unclear on effectiveness |
| Streaming/SSE | Not shown in diagram | Implemented (SSE streaming) | LMS may be ahead here |
| Database | Firebase Firestore | Prisma + SQLite | Different, both valid |
| AI Model | Gemini | GLM-4-plus via z-ai-web-dev-sdk | Different, both valid |

### Critical Gaps to Address
1. **ImageKit URL Pattern**: The reference uses a specific ImageKit URL pattern for AI image generation. My LMS has a sign endpoint but doesn't use this URL pattern.
2. **Image Transformation in Edit**: The reference instructs AI to use ImageKit `?tr=` params for image modifications during inline editing.
3. **Design Guide Natural Language**: Each style in the reference has a `designGuide` text field that's injected into the slide prompt. My LMS styles may need this enrichment.
4. **Element-Level Inline Editing**: The reference does surgical DOM replacement of individual elements. Need to verify if my LMS does the same or regenerates the full slide.

---

## 21. Recommended Implementation Requirements for My LMS

### Phase 1: Image System (Critical)
- Implement ImageKit URL-based image generation: `ik.imagekit.io/ik-genimg-prompt-{prompt}/{name}.jpg`
- Add ImageKit transformation support in inline AI edit prompts
- Ensure slide generation prompt instructs AI to use ImageKit URLs for images

### Phase 2: Design Style Enrichment
- Add `designGuide` natural language text to each style definition
- Ensure `designGuide` is injected into the slide generation prompt
- Add `gradients` to style definitions

### Phase 3: Inline AI Editing Verification
- Verify element selection works (hover outline, click to select)
- Verify AI edit targets only the selected element, not the full slide
- Add ImageKit-aware instructions to the edit prompt

### Phase 4: Export Verification
- Verify current PPTX export works
- Consider client-side approach (html-to-image + pptxgenjs) if server-side has issues

### Phase 5: Document Reference Pipeline
- Design and implement document text extraction
- Implement context injection into outline and slide generation prompts
- Test with actual documents to verify grounding effectiveness

---

## 22. Observed vs Inferred vs Unknown

| Item | Status | Confidence |
|------|--------|------------|
| Two-phase pipeline (outline → slides) | OBSERVED | HIGH |
| Per-slide sequential generation | OBSERVED | HIGH |
| Design style structure (designGuide + colors + gradients) | OBSERVED | HIGH |
| ImageKit URL pattern for image gen | OBSERVED | HIGH |
| ImageKit `?tr=` for transformations | OBSERVED | HIGH |
| Element-level inline AI editing | OBSERVED | HIGH |
| DOM replaceChild for surgical replacement | OBSERVED (code) | HIGH |
| Client-side PPTX export via html-to-image + pptxgenjs | OBSERVED (code) | HIGH |
| Iframe sandbox rendering | OBSERVED (code) | HIGH |
| DEFAULT_HTML template with CDN libs | OBSERVED (code) | HIGH |
| Color injection via window.colors | OBSERVED (code) | HIGH |
| Outline JSON schema ({slideNo, slidePoint, outline}) | OBSERVED | HIGH |
| User flow: Free vs Paid tiers | OBSERVED | HIGH |
| React Router routing structure | OBSERVED | HIGH |
| Firebase Firestore database | OBSERVED (imports) | HIGH |
| Gemini AI model | OBSERVED (imports) | HIGH |
| Slide-to-slide context passing | UNKNOWN | LOW |
| Document/reference processing pipeline | UNKNOWN | LOW |
| Streaming/real-time generation | UNKNOWN | LOW |
| Versioning/history system | UNKNOWN | LOW |
| Undo/redo | UNKNOWN | LOW |
| Queue/job processing | UNKNOWN | LOW |
| Error retry logic | UNKNOWN | LOW |
| Slide reordering | UNKNOWN | LOW |
| Presentation mode | UNKNOWN | LOW |

---

## 23. Limitations / Unverified Items

1. **Demo app not tested**: The actual running application at dcmk.short.gy was not explored. Observable behaviors (generation quality, streaming, error handling, loading states) could not be verified.
2. **YouTube video not watched**: Additional behavioral insights from the video are unavailable.
3. **Document pipeline unclear**: The upload UI is drawn but no backend processing is shown. We cannot determine how (or if) uploaded documents influence AI generation.
4. **VLM analysis limitations**: Some text in the diagram (especially in code snippets) may have been partially illegible or reconstructed by the VLM. The verbatim code extractions should be treated as ~95% accurate.
5. **Diagram may not match deployed demo**: The Eraser diagram represents the intended/design architecture. The actual deployed demo at dcmk.short.gy may differ.
6. **No RAG/Vector DB visible**: The absence of these components in the diagram doesn't mean they don't exist — they may have been omitted for simplicity.
7. **No backend API routes drawn**: The diagram focuses on frontend code and AI prompts. Backend API structure (Express routes, middleware, validation) is not detailed.
8. **Image dimensions discrepancy**: The prompt says 800×450px but the DUMMY_SLIDER example uses 800×500px. The intended dimensions are unclear.
