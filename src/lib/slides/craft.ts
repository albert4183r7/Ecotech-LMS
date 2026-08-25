// ============================================
// How to write a training slide
//
// What is being made here is training material: something an instructor stands
// in front of colleagues and teaches from, and that the audience will use at
// work afterwards. That is a specific kind of writing, and it is not the same
// as an essay with a point of view.
//
// A training deck covers the ground. It names every term the audience will
// meet in the wild — including the ones that look obvious — and it explains
// each one with an everyday comparison, then the real mechanism, then where
// they would actually run into it. It shows the thing working end to end on one
// concrete case. It says what changes at work, and what to watch out for.
//
// The prompts elsewhere can describe that. Describing it is the weaker half:
// a model asked in the abstract for a better slide returns a longer definition.
// So the examples below are the substance of this file — the same slide written
// as a definition list and then written as training, three times, in three
// unrelated fields.
//
// Kept as a module rather than a markdown file read at runtime: this text has
// to exist inside the standalone build, where a file read is one more thing
// that can fail in a container and a constant is not.
// ============================================

/**
 * The craft rules, for the model writing one slide.
 *
 * These are the judgements a schema cannot enforce. Mechanical rules — lengths,
 * block shapes, which type to pick — live in the slide generator's own system
 * prompt; what is here is how to teach rather than merely state.
 */
export const SLIDE_CRAFT = `HOW TO WRITE A TRAINING SLIDE

You are writing material an instructor will teach from, to colleagues who will
use the subject at work afterwards. Everything below follows from that.

Teach the vocabulary; do not skip it and do not merely define it.
Name every real term the audience will meet — the ones written in the tools
they will open, the ones colleagues will say in meetings. They need to
recognise those words. But a list of definitions is not training either. Each
term gets: the name, an everyday comparison, what it is actually for, and where
they will run into it.

Give an everyday comparison for anything abstract.
The reference this pipeline aims at explains an agent as a brain, hands and a
loop, and a connection standard as one shared plug instead of a custom cable per
device. Those comparisons are why non-specialists follow it. Find the equivalent
for whatever you are teaching, then put the real mechanism directly beside it —
the comparison opens the door, the mechanism is the thing they came for.

Teach related terms side by side, with what separates them.
When several terms belong to one family, one slide covering all of them with
the distinction made explicit teaches better than three slides of definitions.
Say what each is for, and when someone would reach for one rather than another.

Show it working on one concrete case.
A single realistic example carried end to end — a request arriving, a document
being processed, a payment being taken — teaches more than any amount of
description. Use the audience's own kind of work where you can.

Say what it is for, and where it goes wrong.
Every part of a subject exists because something needed doing. Say what that
was. And say the limit, the cost, or the failure — the parts a lesson skips are
the ones people hit first in real use.

Write it the way you would say it out loud.
Plain language is not simplified language. Removing the mechanism leaves
nothing worth knowing; removing the jargon *around* the mechanism leaves the
mechanism intact. Warm, direct, unhurried. You are explaining something to a
colleague, not making a case.`;

/**
 * Worked pairs: the same slide as a definition list, then as training.
 *
 * Deliberately drawn from three unrelated fields, and none of them close to
 * what is likely to be requested. They demonstrate the three shapes a training
 * deck leans on — the anatomy of a thing, a family of related terms, and one
 * case walked end to end — not any particular subject matter.
 */
export const SLIDE_EXEMPLARS = `EXAMPLES — DEFINITION LIST, THEN TRAINING

These show the FORM. Never reuse their subject matter; they are here precisely
because they have nothing to do with the lesson you are writing.

--- Shape 1: the parts of a thing ---

As a definition list, which teaches nobody:
  title: "Insurance Policy Components"
  points:
    "Premium — the amount paid for coverage."
    "Deductible — the amount paid before coverage applies."
    "Coverage limit — the maximum the insurer will pay."

As training:
  title: "The three numbers that decide what a policy is worth"
  lead:  "Every policy is a deal about who pays for what. Three numbers set it."
  points:
    heading: "Premium — the rent"
    body:    "What you pay each month to keep the policy alive, like rent on a
              flat. Stop paying and the cover stops, even if you never claimed."
    heading: "Deductible — your share first"
    body:    "The part you cover before the insurer pays anything. A $1,000
              deductible on a $1,200 repair means you pay $1,000 and they pay
              $200 — which is why a low premium with a high deductible is not
              the bargain it looks like."
    heading: "Limit — where cover stops"
    body:    "The most they will ever pay. Above it the bill comes back to you,
              so the limit is the number to check against your worst realistic
              case, not your typical one."
  takeaway: "A cheap premium usually means a high deductible or a low limit."

Same three terms. The second version tells them what each is for, gives a
comparison for the abstract one, uses one small worked case, and ends with the
thing they will actually use when comparing two policies.

--- Shape 2: a family of related terms ---

As a definition list:
  title: "Backup Types"
  points:
    "Full backup — copies all data."
    "Incremental backup — copies data changed since the last backup."
    "Differential backup — copies data changed since the last full backup."

As training:
  title: "Three kinds of backup, and when to use which"
  lead:  "They differ in one thing: how much they copy, and how much work
          restoring costs you later."
  columns:
    heading: "Full"
    points:  "Copies everything, every time."
             "Slowest to take, largest to store."
             "Restoring needs one file. Simplest possible recovery."
    heading: "Incremental"
    points:  "Copies only what changed since the last backup of any kind."
             "Fastest to take, smallest to store."
             "Restoring needs the full one plus every increment since — miss
              one and the chain breaks."
    heading: "Differential"
    points:  "Copies everything changed since the last full backup."
             "Grows a little each day until the next full."
             "Restoring needs exactly two files: the full and the latest one."
  takeaway: "Choose by how bad a slow restore would be, not by backup speed."

Three terms taught together, with the distinction made explicit and the
trade-off named. Nobody leaves able only to repeat a definition.

--- Shape 3: one case, walked end to end ---

As a definition list:
  title: "Card Payment Processing"
  points:
    "Authorization — verifying the card has sufficient funds."
    "Capture — requesting the funds be transferred."
    "Settlement — the transfer of funds to the merchant."

As training:
  title: "What happens in the four seconds after a card is tapped"
  lead:  "One £40 coffee-shop payment, from tap to money in the bank."
  steps:
    label: "Authorisation"
    body:  "The terminal asks the bank to set £40 aside. The bank freezes it
            and returns a code. Nothing has moved yet — the customer's balance
            already looks £40 lower, which is why a cancelled order still shows
            on their app."
    label: "Capture"
    body:  "At close of day the shop confirms which authorisations were real
            sales. Anything not captured is released within days, without a
            refund ever being issued."
    label: "Settlement"
    body:  "The card networks move the money in a batch overnight, minus fees,
            so takings appear in the shop's account a day or two later — the
            gap that makes card sales feel slower than cash."
    label: "Chargeback"
    body:  "Up to 120 days later the customer can dispute the sale, and the
            money is pulled back pending evidence. This is why receipts and
            delivery proof are kept long after the sale looks finished."
  takeaway: "Money moves at settlement, not at tap — that gap is the whole
             difference between card and cash."

The same four terms appear in both. Only the second one leaves the audience
able to answer a customer asking why their balance already changed.`;

/**
 * The arc a training lesson follows, and one worked plan.
 *
 * A plan decides the depth: sections that are topics get filled with
 * definitions no matter how well the slides beneath them are written.
 */
export const PLAN_EXEMPLAR = `THE SHAPE OF A TRAINING LESSON

Most subjects taught to colleagues follow the same arc, and there is nothing
wrong with it being familiar — it is familiar because it works. Adapt it to the
subject rather than following it mechanically, and drop any part the subject
does not have:

  1. What it is — and what it is not. Set it against the thing the audience
     already uses, so the difference is concrete from the first minute.
  2. What it is made of. The parts, named properly, with an everyday
     comparison for each.
  3. How it works. The mechanism, the sequence, the loop — whatever actually
     happens, step by step.
  4. The landscape. The terms, tools and standards they will hear other people
     say. Cover them; these are the words that make someone able to follow a
     conversation about the subject.
  5. Seeing it work. One realistic case walked end to end, and where it is done
     well against where it is done badly.
  6. What it changes for us. The practical impact on how the work gets done.
  7. Using it responsibly. Limits, failure modes, and what to check.

EXAMPLE — TWO PLANS FOR THE SAME REQUEST

Request: "train our support team on how card payments work", 12 slides.

A plan that produces a forgettable lesson:
  1. Introduction to Payments   — what card payments are; why they matter
  2. Key Components             — cards; terminals; banks; processors
  3. The Payment Process        — authorization; capture; settlement
  4. Common Issues              — declines; chargebacks; fraud
  5. Conclusion                 — summary of key points

Every line is true. Every line would survive in a lesson about something else
with two words changed. Nobody finishes it able to answer a customer.

The same request, planned as training:
  1. "Card, cash, and the two days in between"
     claim:   a card sale is a promise that settles later, not an exchange —
              and every oddity the team fields comes from that gap
     vehicle: one £40 sale, tracked as cash and then as card, side by side
  2. "Who is actually in the room"
     claim:   five parties touch every sale, and knowing which one said no is
              most of what resolving a decline requires
     vehicle: the acquirer, issuer, network, processor and merchant, each with
              the one thing it decides
  3. "Tap to bank account, step by step"
     claim:   authorisation, capture and settlement happen at different times,
              which is why a customer's balance changes before the shop is paid
     vehicle: the same £40 sale walked through all three, with what the
              customer sees at each point
  4. "The words on the terminal and the statement"
     claim:   the team will hear MID, AVS, 3-D Secure, interchange and
              chargeback from customers and from finance, and each is simple
              once named
     vehicle: each term with what it is for and the situation it shows up in
  5. "Why it was declined"
     claim:   a decline code says which party refused and why, and most are
              nothing to do with insufficient funds
     vehicle: four real decline codes, what each means, what to tell the customer
  6. "Disputes, and what protects us"
     claim:   evidence gathered at the time of sale decides a chargeback months
              later, so the work happens before there is a dispute
     vehicle: one disputed sale, and the receipt trail that settled it

Same subject, same budget, conventional order. Each section names what the
audience will actually meet, and the concrete thing that will teach it.`;
