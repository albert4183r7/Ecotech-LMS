import type { SlideContent } from "./content-schema";
import { iconSvg } from "./icons";
import { themeFor, type SlideTheme } from "./theme";

// ============================================
// Slide renderer
//
// Turns semantic content into a designed slide. Layout lives here, in code, so
// every slide fills the canvas and follows the same visual language. The model
// no longer decides how anything looks.
//
// Every block carries an icon, every layout has a decorative ground, and the
// process and architecture layouts draw real connectors rather than stacking
// bordered boxes — without those a deck was a wall of identical rectangles.
// ============================================

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Soft shapes bled off the corners.
 *
 * They sit behind the content at low opacity and give the slide a ground, so a
 * content slide is not a bare sheet with text on it. Purely decorative, hence
 * aria-hidden and pointer-events-none.
 */
function decor(t: SlideTheme, variant: "surface" | "feature"): string {
  const colour = variant === "feature" ? t.featureDecor : t.decor;
  const strength = variant === "feature" ? "opacity-20" : "opacity-5";
  return `
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="${colour} ${strength} absolute -top-24 -right-24 h-80 w-80 rounded-full blur-2xl"></div>
      <div class="${colour} ${strength} absolute -bottom-24 -left-20 h-72 w-72 rounded-full blur-2xl"></div>
      <div class="${colour} ${strength} absolute top-1/2 -right-10 h-40 w-40 rotate-45 rounded-3xl"></div>
    </div>`;
}

/** An icon in a tinted chip. The chip has a fill, so it survives PPTX export. */
function chip(
  t: SlideTheme,
  icon: string | undefined,
  context: string,
  size = "h-11 w-11",
): string {
  return `<span class="${t.accentSoft} ${t.iconInk} ${size} flex shrink-0 items-center justify-center rounded-xl">
      ${iconSvg(icon, context, "h-6 w-6")}
    </span>`;
}

/** Title block shared by every content layout. */
function header(t: SlideTheme, title: string, lead?: string, footer?: string): string {
  return `
    <header class="relative shrink-0">
      <div class="flex items-center gap-3">
        <span class="${t.accent} block h-8 w-1.5 rounded-full"></span>
        <h1 class="${t.heading} text-4xl font-bold tracking-tight">${esc(title)}</h1>
      </div>
      ${lead ? `<p class="${t.body} mt-4 max-w-4xl text-xl leading-relaxed">${esc(lead)}</p>` : ""}
      ${footer ? `<p class="${t.muted} mt-2 text-sm">${esc(footer)}</p>` : ""}
    </header>`;
}

/** Content slides share one frame so padding and rhythm never drift. */
function frame(t: SlideTheme, inner: string): string {
  return `<div class="${t.surface} relative flex h-full w-full flex-col justify-between overflow-hidden p-16">
    ${decor(t, "surface")}
    <div class="relative flex h-full w-full flex-col justify-between">${inner}</div>
  </div>`;
}

interface IconPoint {
  heading: string;
  description: string;
  icon?: string;
}

function conceptBody(t: SlideTheme, points: IconPoint[]): string {
  // Two columns once there are four or more points, so the slide fills width
  // instead of running as a narrow list down the left.
  const cols = points.length >= 4 ? "grid-cols-2" : "grid-cols-1";
  const cards = points
    .map(
      (p) => `
      <div class="${t.panel} ${t.panelBorder} flex items-center gap-4 rounded-2xl border p-6 shadow-sm">
        ${chip(t, p.icon, `${p.heading} ${p.description}`)}
        <div class="flex flex-col gap-1.5">
          <h3 class="${t.heading} text-2xl font-semibold">${esc(p.heading)}</h3>
          <p class="${t.body} text-lg leading-relaxed">${esc(p.description)}</p>
        </div>
      </div>`,
    )
    .join("");
  return `<div class="grid ${cols} mt-10 flex-1 content-stretch gap-6">${cards}</div>`;
}

function comparisonBody(
  t: SlideTheme,
  columns: { heading: string; points: string[]; icon?: string }[],
): string {
  const cols = columns.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const blocks = columns
    .map(
      (c) => `
      <div class="${t.panel} ${t.panelBorder} flex flex-col overflow-hidden rounded-2xl border shadow-sm">
        <div class="${t.accentSoft} flex items-center gap-3 px-6 py-4">
          ${chip(t, c.icon, `${c.heading} ${c.points.join(" ")}`, "h-9 w-9")}
          <h3 class="${t.heading} text-2xl font-semibold">${esc(c.heading)}</h3>
        </div>
        <ul class="flex flex-1 flex-col justify-evenly gap-3 px-6 py-5">
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

function processBody(
  t: SlideTheme,
  steps: { label: string; description: string; icon?: string }[],
): string {
  // A numbered rail with a connecting line, rather than free-standing columns:
  // the line is what makes it read as a sequence.
  const items = steps
    .map(
      (s, i) => `
      <div class="relative flex flex-1 flex-col gap-3">
        <div class="flex items-center gap-3">
          <span class="${t.accent} ${t.onAccent} flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold shadow-sm">${i + 1}</span>
          ${
            i < steps.length - 1
              ? `<span class="${t.connector} block h-0.5 flex-1 rounded-full bg-current opacity-40"></span>`
              : ""
          }
        </div>
        <div class="${t.panel} ${t.panelBorder} flex flex-1 flex-col justify-center gap-2 rounded-2xl border p-5">
          <div class="${t.iconInk}">${iconSvg(s.icon, `${s.label} ${s.description}`, "h-5 w-5")}</div>
          <h3 class="${t.heading} text-xl font-semibold">${esc(s.label)}</h3>
          <p class="${t.body} text-base leading-relaxed">${esc(s.description)}</p>
        </div>
      </div>`,
    )
    .join("");
  const wrap = steps.length > 4 ? "grid grid-cols-3 gap-6" : "flex gap-6";
  return `<div class="${wrap} mt-10 flex-1 content-stretch">${items}</div>`;
}

function architectureBody(
  t: SlideTheme,
  nodes: { label: string; description?: string; icon?: string }[],
): string {
  const node = (
    n: { label: string; description?: string; icon?: string },
    layout: "row" | "stack",
  ) => `
    <div class="${t.panel} ${t.panelBorder} flex flex-1 justify-center ${
      layout === "row" ? "flex-col items-center text-center" : "items-center gap-4 text-left"
    } gap-2 rounded-2xl border-2 px-4 py-6 shadow-sm">
      ${chip(t, n.icon, `${n.label} ${n.description ?? ""}`, layout === "row" ? "h-10 w-10" : "h-11 w-11")}
      <div>
        <div class="${t.heading} text-lg leading-tight font-semibold">${esc(n.label)}</div>
        ${n.description ? `<div class="${t.muted} mt-1 text-sm leading-snug">${esc(n.description)}</div>` : ""}
      </div>
    </div>`;

  // An arrow drawn as a shape rather than typed as a character, so it keeps its
  // weight at any size and matches the connector colour.
  const arrow = (direction: "right" | "down") => `
    <span class="${t.connector} flex shrink-0 items-center justify-center ${
      direction === "right" ? "w-8" : "h-8 w-full"
    }" aria-hidden="true">
      <svg viewBox="0 0 24 24" class="${direction === "right" ? "h-6 w-6" : "h-6 w-6 rotate-90"}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>
      </svg>
    </span>`;

  // A stacked chain runs out of canvas at five nodes. Past four, lay the flow
  // out left to right so it scales to six without shrinking the type.
  if (nodes.length > 4) {
    const row = nodes
      .map((n, i) => node(n, "row") + (i < nodes.length - 1 ? arrow("right") : ""))
      .join("");
    return `<div class="mt-10 flex flex-1 items-center">
      <div class="flex h-full max-h-64 w-full items-stretch gap-2">${row}</div>
    </div>`;
  }

  const chain = nodes
    .map((n, i) => node(n, "stack") + (i < nodes.length - 1 ? arrow("down") : ""))
    .join("");
  return `<div class="mt-8 flex flex-1 flex-col items-center justify-center">
    <div class="flex h-full w-full max-w-3xl flex-col justify-center gap-1">${chain}</div>
  </div>`;
}

function caseStudyBody(
  t: SlideTheme,
  c: { situation: string; problem: string; action: string; outcome: string },
): string {
  const cell = (label: string, icon: string, text: string, emphasise = false) => `
    <div class="${emphasise ? t.accentSoft : t.panel} ${t.panelBorder} flex flex-col gap-2 rounded-2xl border p-6 shadow-sm">
      <div class="flex items-center gap-2">
        <span class="${t.iconInk}">${iconSvg(icon, label, "h-5 w-5")}</span>
        <span class="${t.muted} text-sm font-bold tracking-widest uppercase">${label}</span>
      </div>
      <p class="${t.body} text-lg leading-relaxed">${esc(text)}</p>
    </div>`;
  return `<div class="mt-10 grid flex-1 grid-cols-2 content-stretch gap-6">
    ${cell("Situation", "compass", c.situation)}
    ${cell("Problem", "alert", c.problem)}
    ${cell("What the agent did", "settings", c.action)}
    ${cell("Outcome", "trendUp", c.outcome, true)}
  </div>`;
}

function dataBody(
  t: SlideTheme,
  stats: { value: string; label: string; note?: string; icon?: string }[],
): string {
  const cols =
    stats.length >= 4 ? "grid-cols-4" : stats.length === 3 ? "grid-cols-3" : "grid-cols-2";
  const cards = stats
    .map(
      (s) => `
      <div class="${t.panel} ${t.panelBorder} relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border p-8 text-center shadow-sm">
        <span class="${t.accent} absolute inset-x-0 top-0 h-1.5"></span>
        ${chip(t, s.icon, `${s.label} ${s.note ?? ""}`, "h-10 w-10")}
        <div class="${t.heading} text-6xl font-bold tracking-tight">${esc(s.value)}</div>
        <div class="${t.body} text-lg font-medium">${esc(s.label)}</div>
        ${s.note ? `<div class="${t.muted} text-sm">${esc(s.note)}</div>` : ""}
      </div>`,
    )
    .join("");
  return `<div class="mt-12 flex flex-1 items-center">
    <div class="grid ${cols} h-full max-h-72 w-full items-stretch gap-6">${cards}</div>
  </div>`;
}

function summaryBody(t: SlideTheme, takeaways: string[]): string {
  const items = takeaways
    .map(
      (x, i) => `
      <li class="${t.panel} ${t.panelBorder} flex items-start gap-4 rounded-2xl border px-5 py-4">
        <span class="${t.accent} ${t.onAccent} flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold">${i + 1}</span>
        <span class="${t.body} text-xl leading-relaxed">${esc(x)}</span>
      </li>`,
    )
    .join("");
  return `<ul class="mt-10 flex flex-1 flex-col justify-center gap-4">${items}</ul>`;
}

/**
 * Render one slide to the HTML fragment the canvas wraps.
 *
 * `templateId` selects the palette and type; the markup is identical across
 * templates because colour roles are class names resolved by custom
 * properties. `style` is the old name for the same thing and still works.
 */
export function renderSlideContent(
  content: SlideContent,
  options: { templateId?: string; style?: string; footer?: string } = {},
): string {
  const t = themeFor(options.templateId ?? options.style);
  const foot = options.footer;

  switch (content.type) {
    case "title":
      return `
        <div class="${t.feature} relative flex h-full w-full flex-col justify-center gap-6 overflow-hidden p-20">
          ${decor(t, "feature")}
          <div class="relative flex flex-col gap-6">
            ${content.eyebrow ? `<span class="${t.featureBody} text-sm font-bold tracking-widest uppercase">${esc(content.eyebrow)}</span>` : ""}
            <h1 class="${t.featureHeading} max-w-5xl text-7xl leading-none font-bold tracking-tight">${esc(content.title)}</h1>
            <span class="${t.accent} block h-1.5 w-32 rounded-full"></span>
            <p class="${t.featureBody} max-w-3xl text-2xl leading-relaxed">${esc(content.subtitle)}</p>
          </div>
        </div>`;

    case "closing":
      return `
        <div class="${t.feature} relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden p-20 text-center">
          ${decor(t, "feature")}
          <div class="relative flex flex-col items-center gap-6">
            <h1 class="${t.featureHeading} text-7xl font-bold tracking-tight">${esc(content.title)}</h1>
            <span class="${t.accent} block h-1.5 w-24 rounded-full"></span>
            ${content.subtitle ? `<p class="${t.featureBody} max-w-3xl text-2xl leading-relaxed">${esc(content.subtitle)}</p>` : ""}
          </div>
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
