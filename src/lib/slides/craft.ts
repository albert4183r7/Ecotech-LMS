// ============================================
// How to write a lesson slide
//
// The prompts elsewhere describe depth — "explain how it works, what it costs,
// what goes wrong without it". Describing it is not enough. A model asked for
// depth in the abstract writes a slightly longer definition; a model shown a
// shallow slide beside the deep version of the same slide writes the deep one.
//
// So this file is the craft guide, and the examples are the substance of it.
// They are deliberately drawn from three unrelated subjects — a database
// mechanism, a conversation between two people, and a company's cash position
// — because the point they make is about form, not field. The worry they are
// answering is that "soft" subjects become policy boilerplate and technical
// ones become glossaries. Neither is a property of the subject. Both are what
// happens when nobody decided what the slide was for.
//
// Kept as a module rather than a markdown file the server reads at runtime:
// this text is needed inside the standalone build, where a file read is one
// more thing that can fail in a container, and a constant cannot.
// ============================================

/**
 * The craft rules, for the model that writes one slide.
 *
 * These are the judgements a good writer makes that a schema cannot enforce.
 * Mechanical rules — lengths, block shapes, which type to pick — live in the
 * slide generator's own system prompt; what is here is how to be worth reading.
 */
export const SLIDE_CRAFT = `HOW TO WRITE A SLIDE THAT IS WORTH READING

Explain the mechanism, not the label.
Naming a thing and defining a thing are the same move, and both stop short of
teaching. Say how it works, what it costs, when it fails, or what decision it
changes. If a sentence would survive with the subject swapped out, it is not
about your subject.

Use the words a person would say out loud.
Plain language is not simplified language. Simplifying by removing the
mechanism leaves nothing worth knowing; simplifying by removing the jargon
around the mechanism leaves the mechanism. Say "the model keeps a running score
of how wrong it is" rather than "the objective function quantifies predictive
error" — but do say "loss", because that is what everyone else will call it,
and the audience needs the word to follow the next conversation.

Name the real thing, then hand over the everyday version.
The subject's own vocabulary is what the audience came for. Introduce the real
term, then explain it in one plain sentence, in the same breath. A term with no
explanation teaches nothing; an explanation with no term leaves the audience
unable to look anything up.

Be specific enough to be disagreed with.
"Communication is important" cannot be argued with, which is why it teaches
nothing. "A written brief beats a verbal one because the reader can re-read the
part they missed" can be argued with, and that is what makes it worth a slide.

Prefer the concrete instance.
One worked case, one number in a stated example, one recognisable situation,
one failure traced to its cause. A concrete instance carries the abstraction
with it; an abstraction rarely carries an instance.

Say the difficult part.
The parts a lesson skips are the ones the audience most needs: the trade-off,
the cost, the case where the advice does not hold. A slide that only lists
benefits has not been thought about hard enough.`;

/**
 * Worked pairs, shallow beside deep.
 *
 * Each is the same slide written twice. What separates them is never length or
 * vocabulary level — it is whether a mechanism, a cost or a consequence made it
 * onto the slide.
 */
export const SLIDE_EXEMPLARS = `EXAMPLES — THE SAME SLIDE, WRITTEN BADLY THEN WRITTEN WELL

These show the FORM to aim for. Never reuse their subject matter; they are
here because they are nothing to do with the lesson you are writing.

--- A technical subject ---

Too shallow:
  heading: "Database Indexes"
  body:    "An index is a data structure that improves the speed of data
            retrieval operations on a table."

Written properly:
  heading: "Why an index is a tree"
  body:    "Without one, finding a row means reading every row. An index keeps
            the column pre-sorted, so the database halves the search space at
            each step and reaches a row in a handful of reads instead of
            millions."
  and, on the same slide:
  heading: "What it costs you"
  body:    "Every insert now writes twice — once to the table, once to the
            index — so a table written more often than it is read can be slower
            with an index than without one."

The second version names the same term, and the audience finishes it able to
decide whether to add an index. The first leaves them able to repeat a sentence.

--- A subject about people, which is where lessons usually turn into policy ---

Too shallow:
  heading: "Effective Feedback"
  body:    "Feedback should be timely, specific and constructive, and delivered
            in a respectful manner."

Written properly:
  heading: "Describe, don't judge"
  body:    "\\"You were unprepared\\" is a verdict, and the only available reply is
            to defend yourself. \\"The deck arrived twenty minutes before the
            meeting, so we spent the first ten reading it\\" is an observation —
            same message, but now there is something to act on."
  and:
  heading: "Why the delay costs so much"
  body:    "By the following week neither of you remembers the specifics, so the
            conversation becomes about character rather than about one meeting.
            That is the conversation nobody can act on."

Nothing about the second version is softer or longer. It just contains the
mechanism — why one phrasing produces defence and the other produces action.

--- A subject with numbers in it ---

Too shallow:
  heading: "Cash Flow"
  body:    "Cash flow is the movement of money into and out of a business, and
            managing it is essential for financial health."

Written properly:
  heading: "Profitable and still insolvent"
  body:    "Book a sale in March, collect the money in June, and the year looks
            profitable while April's payroll cannot be met. Profit is an
            accounting event; cash is a calendar one, and only one of them pays
            salaries."

The figures there are a stated illustration, not a claim about any real
company — which is the only way to use numbers when no source document was
supplied.`;

/**
 * The same lesson, for the planner.
 *
 * A plan is where depth is decided: sections that are topics get filled with
 * definitions no matter how well the slides beneath them are written.
 */
export const PLAN_EXEMPLAR = `EXAMPLE — TWO PLANS FOR THE SAME REQUEST

Request: "a lesson on how HTTP caching works", 10 slides.

A plan that will produce a forgettable lesson:
  1. Introduction to HTTP Caching  — what caching is; why caching matters
  2. Types of Caching              — browser cache; proxy cache; CDN
  3. Cache Headers                 — Cache-Control; ETag; Expires
  4. Best Practices                — set appropriate headers; monitor hit rates
  5. Conclusion                    — summary of key points

Every line is true. Every line would survive in a lesson about something else
with two words changed. Nobody finishes it able to do anything.

The same request, planned properly:
  1. "The request that never leaves the browser"
     claim:   a cache hit is not a fast response, it is the absence of one, and
              that is why caching beats every other optimisation available
     vehicle: one page load traced twice, cold and warm, counting requests
  2. "Fresh, stale, and the third state nobody expects"
     claim:   a cached copy is not simply valid or expired — a stale one can
              still be served while it revalidates, which is where most of the
              real benefit lives
     vehicle: one resource followed through max-age, then past it
  3. "Asking without downloading"
     claim:   ETag turns a re-download into a question the server answers in
              one line
     vehicle: the same request with and without If-None-Match, byte counts shown
  4. "The cache you cannot clear"
     claim:   a header sent once is honoured until it expires, no matter what
              you deploy afterwards — which is why cache policy is a decision
              about the future
     vehicle: a bad max-age shipped to a million browsers, and the ways out

Same subject, same slide budget, conventional order. Each section asserts
something a reader could disagree with, and names the concrete thing that will
prove it.`;
