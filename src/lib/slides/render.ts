import type { SlideContent } from "./content-schema";
import { themeFor, type SlideTheme } from "./theme";

// ============================================
// Slide renderer
//
// Turns semantic content into a designed slide. Layout lives here, in code, so
// every slide fills the canvas and follows the same visual language. The model
// no longer decides how anything looks.
// ============================================

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Title block shared by every content layout. */
function header(t: SlideTheme, title: string, lead?: string, footer?: string): string {
  return `
    <header class="shrink-0">
      <div class="flex items-center gap-3">
        <span class="${t.accent} block h-8 w-1 rounded-full"></span>
        <h1 class="${t.heading} text-4xl font-bold tracking-tight">${esc(title)}</h1>
      </div>
      ${lead ? `<p class="${t.body} mt-4 max-w-4xl text-xl leading-relaxed">${esc(lead)}</p>` : ""}
      ${footer ? `<p class="${t.muted} mt-2 text-sm">${esc(footer)}</p>` : ""}
    </header>`;
}

/** Content slides share one frame so padding and rhythm never drift. */
function frame(t: SlideTheme, inner: string): string {
  return `<div class="${t.surface} flex h-full w-full flex-col justify-between p-16">${inner}</div>`;
}

function conceptBody(t: SlideTheme, points: { heading: string; description: string }[]): string {
  // Two columns once there are four or more points, so the slide fills width
  // instead of running as a narrow list down the left.
  const cols = points.length >= 4 ? "grid-cols-2" : "grid-cols-1";
  const cards = points
    .map(
      (p) => `
      <div class="${t.panel} ${t.panelBorder} flex flex-col gap-2 rounded-xl border p-6">
        <h3 class="${t.heading} text-2xl font-semibold">${esc(p.heading)}</h3>
        <p class="${t.body} text-lg leading-relaxed">${esc(p.description)}</p>
      </div>`,
    )
    .join("");
  return `<div class="grid ${cols} mt-10 flex-1 content-stretch gap-6">${cards}</div>`;
}

function comparisonBody(t: SlideTheme, columns: { heading: string; points: string[] }[]): string {
  const cols = columns.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const blocks = columns
    .map(
      (c) => `
      <div class="${t.panel} ${t.panelBorder} flex flex-col rounded-xl border p-6">
        <h3 class="${t.heading} border-b ${t.panelBorder} pb-3 text-2xl font-semibold">${esc(c.heading)}</h3>
        <ul class="mt-4 flex flex-col gap-3">
          ${c.points
            .map(
              (p) => `<li class="${t.body} flex gap-3 text-lg leading-snug">
              <span class="${t.accent} mt-2 block h-2 w-2 shrink-0 rounded-full"></span>
              <span>${esc(p)}</span></li>`,
            )
            .join("")}
        </ul>
      </div>`,
    )
    .join("");
  return `<div class="grid ${cols} mt-10 flex-1 gap-6">${blocks}</div>`;
}

function processBody(t: SlideTheme, steps: { label: string; description: string }[]): string {
  const items = steps
    .map(
      (s, i) => `
      <div class="flex flex-1 flex-col gap-3">
        <div class="flex items-center gap-3">
          <span class="${t.accent} ${t.onAccent} flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold">${i + 1}</span>
          ${i < steps.length - 1 ? `<span class="${t.panelBorder} block h-px flex-1 border-t-2 border-dashed"></span>` : ""}
        </div>
        <h3 class="${t.heading} text-xl font-semibold">${esc(s.label)}</h3>
        <p class="${t.body} text-base leading-relaxed">${esc(s.description)}</p>
      </div>`,
    )
    .join("");
  const wrap = steps.length > 4 ? "grid grid-cols-3 gap-8" : "flex gap-8";
  return `<div class="${wrap} mt-12 flex-1 content-stretch">${items}</div>`;
}

function architectureBody(t: SlideTheme, nodes: { label: string; description?: string }[]): string {
  // A stacked chain runs out of canvas at five nodes. Past four, lay the flow
  // out left to right so it scales to six without shrinking the type.
  if (nodes.length > 4) {
    const row = nodes
      .map(
        (n, i) => `
        <div class="flex flex-1 items-center gap-2">
          <div class="${t.panel} ${t.panelBorder} flex-1 rounded-xl border-2 px-3 py-4 text-center">
            <div class="${t.heading} text-lg leading-tight font-semibold">${esc(n.label)}</div>
            ${n.description ? `<div class="${t.muted} mt-1 text-sm leading-snug">${esc(n.description)}</div>` : ""}
          </div>
          ${i < nodes.length - 1 ? `<span class="${t.muted} shrink-0 text-2xl leading-none">&#8594;</span>` : ""}
        </div>`,
      )
      .join("");
    return `<div class="mt-10 flex flex-1 items-center">
      <div class="flex w-full items-stretch gap-2">${row}</div>
    </div>`;
  }

  const chain = nodes
    .map(
      (n, i) => `
      <div class="flex flex-col items-center gap-2">
        <div class="${t.panel} ${t.panelBorder} w-full rounded-xl border-2 px-6 py-4 text-center">
          <div class="${t.heading} text-xl font-semibold">${esc(n.label)}</div>
          ${n.description ? `<div class="${t.muted} mt-1 text-sm leading-snug">${esc(n.description)}</div>` : ""}
        </div>
        ${i < nodes.length - 1 ? `<span class="${t.muted} text-xl leading-none">&#8595;</span>` : ""}
      </div>`,
    )
    .join("");
  return `<div class="mt-8 flex flex-1 flex-col items-center justify-center">
    <div class="flex w-full max-w-2xl flex-col gap-2">${chain}</div>
  </div>`;
}

function caseStudyBody(
  t: SlideTheme,
  c: { situation: string; problem: string; action: string; outcome: string },
): string {
  const cell = (label: string, text: string, emphasise = false) => `
    <div class="${emphasise ? t.accentSoft : t.panel} ${t.panelBorder} flex flex-col gap-2 rounded-xl border p-6">
      <span class="${t.muted} text-sm font-bold tracking-widest uppercase">${label}</span>
      <p class="${t.body} text-lg leading-relaxed">${esc(text)}</p>
    </div>`;
  return `<div class="mt-10 grid flex-1 grid-cols-2 content-stretch gap-6">
    ${cell("Situation", c.situation)}
    ${cell("Problem", c.problem)}
    ${cell("What the agent did", c.action)}
    ${cell("Outcome", c.outcome, true)}
  </div>`;
}

function dataBody(t: SlideTheme, stats: { value: string; label: string; note?: string }[]): string {
  const cols =
    stats.length >= 4 ? "grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const cards = stats
    .map(
      (s) => `
      <div class="${t.panel} ${t.panelBorder} flex flex-col items-center justify-center gap-2 rounded-xl border p-8 text-center">
        <div class="${t.heading} text-6xl font-bold tracking-tight">${esc(s.value)}</div>
        <div class="${t.body} text-lg font-medium">${esc(s.label)}</div>
        ${s.note ? `<div class="${t.muted} text-sm">${esc(s.note)}</div>` : ""}
      </div>`,
    )
    .join("");
  return `<div class="grid ${cols} mt-12 flex-1 items-center gap-6">${cards}</div>`;
}

function summaryBody(t: SlideTheme, takeaways: string[]): string {
  const items = takeaways
    .map(
      (x, i) => `
      <li class="flex items-start gap-4">
        <span class="${t.accent} ${t.onAccent} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold">${i + 1}</span>
        <span class="${t.body} text-xl leading-relaxed">${esc(x)}</span>
      </li>`,
    )
    .join("");
  return `<ul class="mt-10 flex flex-1 flex-col justify-center gap-5">${items}</ul>`;
}

/** Render one slide to the HTML fragment the canvas wraps. */
export function renderSlideContent(
  content: SlideContent,
  options: { style?: string; footer?: string } = {},
): string {
  const t = themeFor(options.style);
  const foot = options.footer;

  switch (content.type) {
    case "title":
      return `
        <div class="${t.feature} flex h-full w-full flex-col justify-center gap-6 p-20">
          ${content.eyebrow ? `<span class="${t.featureBody} text-sm font-bold tracking-widest uppercase">${esc(content.eyebrow)}</span>` : ""}
          <h1 class="${t.featureHeading} max-w-5xl text-7xl leading-none font-bold tracking-tight">${esc(content.title)}</h1>
          <span class="${t.accent} block h-1.5 w-32 rounded-full"></span>
          <p class="${t.featureBody} max-w-3xl text-2xl leading-relaxed">${esc(content.subtitle)}</p>
        </div>`;

    case "closing":
      return `
        <div class="${t.feature} flex h-full w-full flex-col items-center justify-center gap-6 p-20 text-center">
          <h1 class="${t.featureHeading} text-7xl font-bold tracking-tight">${esc(content.title)}</h1>
          <span class="${t.accent} block h-1.5 w-24 rounded-full"></span>
          ${content.subtitle ? `<p class="${t.featureBody} max-w-3xl text-2xl leading-relaxed">${esc(content.subtitle)}</p>` : ""}
        </div>`;

    case "concept":
      return frame(
        t,
        header(t, content.title, content.lead, foot) + conceptBody(t, content.points),
      );
    case "comparison":
      return frame(
        t,
        header(t, content.title, content.lead, foot) + comparisonBody(t, content.columns),
      );
    case "process":
      return frame(t, header(t, content.title, content.lead, foot) + processBody(t, content.steps));
    case "architecture":
      return frame(
        t,
        header(t, content.title, content.lead, foot) + architectureBody(t, content.nodes),
      );
    case "caseStudy":
      return frame(t, header(t, content.title, undefined, foot) + caseStudyBody(t, content));
    case "data":
      return frame(t, header(t, content.title, content.lead, foot) + dataBody(t, content.stats));
    case "summary":
      return frame(
        t,
        header(t, content.title, undefined, foot) + summaryBody(t, content.takeaways),
      );
  }
}
