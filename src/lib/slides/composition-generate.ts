import { generateStructuredJSON } from "@/lib/ai";
import { SLIDE_CRAFT, SLIDE_EXEMPLARS } from "./craft";
import { SlideCompositionSchema, type SlideComposition } from "./composition";
import { resolveComposition } from "./composition-resolve";
import { ICON_NAMES } from "./icons";
import { SLIDE_TEMPLATE } from "./template";
import type { SlideBrief } from "./generate";

// ============================================
// Composing a slide
//
// The model designs the slide: it decides what shapes the slide needs, where
// they go, and what each one says. It cannot name a colour, a font or a point
// size — those are roles that resolve to the template's own values — so the
// freedom is over arrangement, never over the brand.
//
// Then it is measured, and if the measurement finds something wrong — text cut
// off, boxes overlapping, an element off the slide — it is handed back with
// exactly what was wrong and composed again. That second pass is the part a
// designer does by looking at the slide, and its absence is why slides shipped
// with sentences ending mid-word.
// ============================================

const CANVAS_RULES = `THE CANVAS

The slide is 16:9. Every position and size is a fraction of it: x and y from
the top-left corner, w and h as widths and heights. So { x: 0.045, y: 0.30,
w: 0.28, h: 0.42 } is a card starting at the left margin, a third of the way
down, a bit over a quarter of the width.

Keep everything between x 0.045 and 0.955, and between y 0.055 and 0.925. The
page number lives below that.

WHAT YOU CAN DRAW

- card: a filled rounded rectangle. The thing you put content on.
- band: the same, for a full-width strip — a header rule, a takeaway bar.
- chip: a circle. A step number, a letter, or an icon holder. Give it text
  (one or two characters) or an icon name, not both.
- icon: a glyph on its own.
- text: a run of text. Its "role" fixes its size — see below.
- arrow / line: a straight connector, with "direction" for which way it points.
  Use these when one thing leads to another. They are what makes a process
  read as a process rather than as three boxes near each other.

COLOUR AND TYPE — ROLES, NEVER VALUES

You never choose a colour or a size. You choose what a thing is, and the
template decides how it looks. That is what keeps every deck on brand.

  fill:  surface | surfaceAlt | panel | accent | accentSoft | heading |
         gradient | none
         - panel: the tinted card fill. The workhorse.
         - accentSoft: a paler tint, for chips and icon holders.
         - accent / heading: solid, for a chip or a filled band. Text on top of
           either must use the onAccent or featureHeading ink.
         - gradient: the house navy-to-mint. Reserve it — one band per slide at
           most, for the line that matters.

  ink:   heading | body | muted | accent | onAccent | iconInk |
         featureHeading | featureBody
         - on a gradient or heading fill, use featureHeading and featureBody.

  role (text size, from the template's own scale):
         display  — the deck's opening title, once
         title    — the slide's title
         heading  — a card's heading
         body     — explanatory copy
         small    — captions, labels under a diagram
         eyebrow  — the small uppercase label above a title
         metric   — a large figure

HOW TO COMPOSE ONE SLIDE

1. Decide the arrangement before you place anything. What shape is this
   slide's content? Three parallel ideas is a row of three cards. A sequence is
   chips numbered 1..n with arrows between them. A contrast is two columns.
   One idea with a consequence is a large statement with a gradient band under
   it. Write that decision into layoutNote.

2. Place the header. An eyebrow at y≈0.07, the title at y≈0.11, and a single
   line of lead copy at y≈0.20 if the slide needs framing. Not every slide does.

3. Lay the content out on a grid you can state. Three cards across: x at
   0.045, 0.365 and 0.685, each w 0.27. Four across: x at 0.045, 0.2775, 0.51
   and 0.7425, each w 0.2125. Two across: x at 0.045 and 0.515, each w 0.44.
   Every one of those ends at 0.955, which is the right margin. Aligned edges
   are most of what makes a slide look composed.

4. Inside a card, stack its parts with room between them: a chip or icon at the
   top, a heading under it, body copy under that. Give text boxes generous
   height — text that does not fit is cut, and a cut sentence is the most
   visible defect a slide can have.

5. Fill the height. The header occupies down to about y 0.26; content runs from
   there to about 0.78; a full-width band from 0.79 to 0.87 is where the
   template puts the one line worth carrying away. A slide whose content stops
   at 0.6 has a hole in the bottom third of it — make the cards taller, or add
   the band. Do not run past 0.90: the page number lives below that.

6. Vary it across the deck. If the last slide was three cards, this one should
   not be. Consecutive identical arrangements are what make a deck look
   generated.

WHAT MAKES A SLIDE BAD

- Too much text. A slide carries one idea and its parts: about 40 to 60 words
  in total, not 130. If there is more to say, say less.
- Boxes that touch or overlap.
- A card with a heading and nothing else, or body copy with no heading.
- Every slide the same shape.
- Text placed without a card or a margin to sit against.`;

/** The prompt for one slide, in the terms a designer works in. */
function buildCompositionPrompt(brief: SlideBrief, revision?: string[]): string {
  const lines = [
    `PRESENTATION: ${brief.presentationTitle} — ${brief.presentationSubtitle}`,
    brief.audience ? `WRITTEN FOR: ${brief.audience}` : "",
    brief.thesis ? `THE LESSON ARGUES: ${brief.thesis}` : "",
    "",
    `SLIDE ${brief.position} of ${brief.totalSlides}.`,
    brief.role === "cover"
      ? "This is the opening title slide: the deck's title, a subtitle, and nothing else. Use the display role, and give it a gradient band or a decorative shape rather than cards."
      : brief.role === "closing"
        ? "This is the closing slide: what to remember, briefly."
        : `Section: ${brief.sectionTitle}.`,
    brief.plannedTitle && brief.role !== "cover"
      ? `THIS SLIDE'S TITLE: "${brief.plannedTitle}" — keep it, or improve the wording without changing what it promises.`
      : "",
    brief.sectionClaim ? `WHAT THIS SECTION TEACHES: ${brief.sectionClaim}` : "",
    brief.sectionVehicle ? `HOW IT TEACHES IT: ${brief.sectionVehicle}` : "",
    "",
    brief.subtopics.length
      ? `THIS SLIDE COVERS:\n${brief.subtopics.map((t) => `- ${t}`).join("\n")}\n\nOne part of the composition per point above — ${brief.subtopics.length} in total, no more.`
      : "This slide frames the presentation rather than carrying detailed points.",
    brief.keyTerms?.length ? `\nTERMS THIS LESSON TEACHES: ${brief.keyTerms.join(", ")}` : "",
    brief.alreadyCovered ? `\nALREADY COVERED — do not restate:\n${brief.alreadyCovered}` : "",
    brief.referenceText
      ? `\nSOURCE MATERIAL — every figure must come from here:\n<reference>\n${brief.referenceText.slice(0, 4000)}\n</reference>`
      : "\nNo source material was supplied, so use no statistics.",
    "",
    `LANGUAGE: write all text in ${brief.language}.`,
    `ICON NAMES you may use: ${ICON_NAMES.slice(0, 60).join(", ")}`,
  ];

  if (brief.revisionNotes?.length) {
    lines.push(
      "",
      "A REVIEWER REJECTED YOUR PREVIOUS VERSION OF THIS SLIDE:",
      ...brief.revisionNotes.map((note) => `- ${note}`),
      "",
      "Compose it again, fixing exactly these. Keep what was not criticised.",
    );
  }

  if (revision?.length) {
    lines.push(
      "",
      "YOUR PREVIOUS COMPOSITION OF THIS SLIDE WAS MEASURED, AND THESE ARE ITS FAULTS:",
      ...revision.map((r) => `- ${r}`),
      "",
      "Compose it again, fixing exactly these. Text that was cut off needs to be",
      "shorter or to have a taller box; boxes that overlap need to be moved apart.",
    );
  }

  return lines.filter(Boolean).join("\n");
}

/**
 * Compose one slide, measure it, and compose it again if the measurement
 * found something a reader would notice.
 *
 * The second pass is the whole point. A model that never sees its own slide
 * cannot know that a sentence was cut off at the box edge; it only knows what
 * it wrote. Handing back the measured faults is the nearest thing to looking
 * at the slide, and it is what the pipeline never did.
 */
export async function generateSlideComposition(brief: SlideBrief): Promise<SlideComposition> {
  // What the slide says matters as much as how it is arranged, so the craft
  // guide travels with the canvas rules rather than only with the older
  // content generator.
  const system =
    `You are composing one slide of a training deck, in the Ecotech house style: ` +
    `${SLIDE_TEMPLATE.description}.\n\n${SLIDE_CRAFT}\n\n${SLIDE_EXEMPLARS}\n\n${CANVAS_RULES}`;

  let best: { composition: SlideComposition; warnings: string[] } | null = null;
  let faults: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const composition = await generateStructuredJSON(
      buildCompositionPrompt(brief, attempt === 1 ? undefined : faults),
      SlideCompositionSchema,
      {
        task: "slide-authoring",
        systemInstruction: system,
        temperature: attempt === 1 ? 0.7 : 0.5,
      },
    );

    const { warnings } = resolveComposition(composition);
    if (warnings.length === 0) return composition;

    // Keep whichever attempt the measurement liked better, so a second pass
    // that made things worse cannot be the one that ships.
    if (!best || warnings.length < best.warnings.length) best = { composition, warnings };

    faults = warnings;
    console.warn(
      `[compose-slide] slide ${brief.position} attempt ${attempt}: ${warnings.length} fault(s)` +
        (attempt === 1 ? ", composing again" : ", shipping the better of the two"),
    );
  }

  if (!best) throw new Error(`slide ${brief.position}: no composition produced`);
  return best.composition;
}

/** A short digest of a composed slide, to stop the next one repeating it. */
export function summariseComposition(composition: SlideComposition): string {
  const headings = composition.elements
    .filter((e) => e.kind === "text" && (e.role === "title" || e.role === "heading"))
    .map((e) => (e.kind === "text" ? e.text : ""))
    .filter(Boolean);
  return headings.join(" · ").slice(0, 200);
}
