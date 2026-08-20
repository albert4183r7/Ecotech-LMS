// ============================================
// Slide icon set
//
// Slides had no imagery of any kind: every block was a bordered box of text,
// so a deck read as a wall of rectangles. These are drawn inline as SVG rather
// than pulled from an icon font or a CDN, because a slide is rendered inside a
// sandboxed iframe and rasterised by headless Chromium, neither of which can
// be relied on to fetch an external asset.
//
// Stroke geometry only, on a 24x24 grid, inheriting `currentColor` so a single
// icon works on every theme.
// ============================================

/** The inner markup of each icon, on a 24x24 viewBox. */
const ICONS: Record<string, string> = {
  // ── Status and emphasis ──
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  star: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z"/>',
  heart: '<path d="M12 20.7 3.8 12.5a4.9 4.9 0 0 1 7-6.9l1.2 1.2 1.2-1.2a4.9 4.9 0 0 1 7 6.9z"/>',
  flag: '<path d="M5 22V3h9l-1.2 3.5L14 10H5"/>',

  // ── Thinking and learning ──
  lightbulb:
    '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  brain:
    '<path d="M12 4.5a2.5 2.5 0 0 0-4.9-.6A2.5 2.5 0 0 0 4 8a2.5 2.5 0 0 0 .5 4.5A2.5 2.5 0 0 0 7 17a2.5 2.5 0 0 0 5 .5z"/><path d="M12 4.5a2.5 2.5 0 0 1 4.9-.6A2.5 2.5 0 0 1 20 8a2.5 2.5 0 0 1-.5 4.5A2.5 2.5 0 0 1 17 17a2.5 2.5 0 0 1-5 .5z"/><path d="M12 4.5v13"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  book: '<path d="M12 6C10 4 7 3.5 3 4v14c4-.5 7 0 9 2 2-2 5-2.5 9-2V4c-4-.5-7 0-9 2z"/><path d="M12 6v14"/>',
  graduation:
    '<path d="m12 4 10 5-10 5L2 9z"/><path d="M6 11.5V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="m8.5 13.5-1.5 8 5-3 5 3-1.5-8"/>',
  flask:
    '<path d="M9 3h6"/><path d="M10 3v6.5L4.6 18A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-3L14 9.5V3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5z"/>',

  // ── Technology ──
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V5"/><circle cx="12" cy="3.5" r="1.2"/><path d="M9 13h.01"/><path d="M15 13h.01"/><path d="M9 17h6"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  database:
    '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 7 19z"/>',
  network:
    '<circle cx="12" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M12 7v4"/><path d="m12 11-6 6"/><path d="m12 11 6 6"/>',
  branch:
    '<circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 6v12"/><path d="M18 10a6 6 0 0 1-6 6H6"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  // Sliders rather than a cogwheel: a circle ringed by eight radial spokes is
  // indistinguishable from the sun icon at slide size.
  settings:
    '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="7" cy="18" r="2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  zap: '<path d="m13 2-9 12h7l-1 8 9-12h-7z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',

  // ── Measurement ──
  chart: '<path d="M3 20h18"/><path d="M7 20v-6"/><path d="M12 20V8"/><path d="M17 20v-9"/>',
  pie: '<circle cx="12" cy="12" r="9"/><path d="M12 12V3"/><path d="M12 12h9"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  scale:
    '<path d="M12 3v18"/><path d="M5 21h14"/><path d="M5 7h14"/><path d="m7 7-4 7h8z"/><path d="m17 7 4 7h-8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  currency:
    '<path d="M12 2v20"/><path d="M17 6.5c0-2-2.2-3-5-3s-5 1-5 3.2c0 4.6 10 2.4 10 7.1 0 2.2-2.2 3.2-5 3.2s-5-1-5-3"/>',

  // ── People and process ──
  users:
    '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a7 7 0 0 1 14 0v1"/><path d="M17 5.1a4 4 0 0 1 0 5.8"/><path d="M18 21v-1a7 7 0 0 0-3-5.7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  mail: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="m2 7 10 7 10-7"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clipboard:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="M9 11h6M9 15h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  rocket:
    '<path d="M12 2c3 2.5 5 6.2 5 10.2L15 16H9l-2-3.8C7 8.2 9 4.5 12 2z"/><path d="m9 16-3 5 4-1.2"/><path d="m15 16 3 5-4-1.2"/><circle cx="12" cy="10" r="2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  shield: '<path d="M12 2 4 6v6c0 5 3.4 8.9 8 10 4.6-1.1 8-5 8-10V6z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m10.9 12.1 9.1-9.1"/><path d="m16 4 4 4"/>',

  // ── Environment ──
  leaf: '<path d="M4 20C4 11 10 6 20 5c0 10-5 16-13 16H4z"/><path d="M4 20c3-6 7-9 12-11"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M18.4 5.6l1.4-1.4M4.2 19.8l1.4-1.4"/>',
  droplet: '<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z"/>',
  wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h14a3 3 0 1 1-3 3"/><path d="M3 16h7a2.5 2.5 0 1 1-2.5 2.5"/>',
  battery:
    '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2"/>',
  factory: '<path d="M2 20h20V9l-6 4V9l-6 4V4H2z"/><path d="M6 20v-3M10 20v-3M14 20v-3M18 20v-3"/>',
  truck:
    '<path d="M2 6h12v10H2z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
};

export type IconName = keyof typeof ICONS;

/** Every name the model may use, for the generation prompt. */
export const ICON_NAMES: string[] = Object.keys(ICONS);

/**
 * Words that should land on an icon that is not named after them, so a
 * reasonable guess resolves instead of falling through to the generic set.
 */
const ALIASES: Record<string, IconName> = {
  ai: "bot",
  agent: "bot",
  robot: "bot",
  model: "cpu",
  llm: "brain",
  idea: "lightbulb",
  insight: "lightbulb",
  goal: "target",
  objective: "target",
  problem: "alert",
  risk: "alert",
  warning: "alert",
  challenge: "alert",
  benefit: "check",
  advantage: "check",
  solution: "check",
  result: "trendUp",
  outcome: "trendUp",
  growth: "trendUp",
  increase: "trendUp",
  decrease: "trendDown",
  reduction: "trendDown",
  cost: "currency",
  price: "currency",
  money: "currency",
  budget: "currency",
  data: "database",
  storage: "database",
  metric: "chart",
  statistics: "chart",
  analytics: "chart",
  measurement: "chart",
  team: "users",
  people: "users",
  student: "graduation",
  learning: "graduation",
  education: "graduation",
  teacher: "book",
  lesson: "book",
  research: "flask",
  experiment: "flask",
  test: "flask",
  time: "clock",
  speed: "zap",
  fast: "zap",
  energy: "zap",
  power: "battery",
  security: "shield",
  privacy: "lock",
  access: "key",
  process: "refresh",
  workflow: "refresh",
  cycle: "refresh",
  step: "arrowRight",
  next: "arrowRight",
  system: "layers",
  architecture: "layers",
  structure: "layers",
  component: "grid",
  module: "grid",
  connection: "network",
  integration: "link",
  api: "code",
  software: "code",
  infrastructure: "cloud",
  deployment: "rocket",
  launch: "rocket",
  start: "rocket",
  config: "settings",
  configuration: "settings",
  balance: "scale",
  comparison: "scale",
  tradeoff: "scale",
  environment: "leaf",
  sustainability: "leaf",
  green: "leaf",
  eco: "leaf",
  climate: "globe",
  world: "globe",
  solar: "sun",
  water: "droplet",
  wind: "wind",
  emission: "factory",
  industry: "factory",
  manufacturing: "factory",
  transport: "truck",
  logistics: "truck",
  summary: "clipboard",
  checklist: "clipboard",
  document: "file",
  report: "file",
  feedback: "message",
  communication: "message",
  quality: "star",
  award: "award",
  direction: "compass",
  strategy: "compass",
  monitoring: "eye",
  observation: "eye",
  search: "search",
  discovery: "search",
};

/** Icons used to give a block an icon when nothing better can be inferred. */
const GENERIC: IconName[] = ["check", "star", "zap", "layers", "target", "grid"];

function normalise(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

/** Stable small hash, so the same text always picks the same generic icon. */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Resolve a name to an icon.
 *
 * The model is asked for a name from the set but will sometimes invent one, so
 * a miss falls back through the alias table, then through any alias word found
 * inside the accompanying text, and finally to a generic icon chosen from the
 * text so that neighbouring blocks do not all get the same glyph.
 */
export function resolveIcon(name: string | undefined, context = ""): string {
  if (name) {
    const key = normalise(name);
    for (const candidate of Object.keys(ICONS)) {
      if (normalise(candidate) === key) return ICONS[candidate];
    }
    if (ALIASES[key]) return ICONS[ALIASES[key]];
  }

  const haystack = `${name ?? ""} ${context}`.toLowerCase();
  for (const [word, icon] of Object.entries(ALIASES)) {
    if (haystack.includes(word)) return ICONS[icon];
  }

  return ICONS[GENERIC[hash(haystack) % GENERIC.length]];
}

/** Render an icon as an inline SVG sized by its container's font size. */
export function iconSvg(name: string | undefined, context = "", className = "h-6 w-6"): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${resolveIcon(name, context)}</svg>`;
}
