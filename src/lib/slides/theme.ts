// ============================================
// Slide design system
//
// One palette per style, applied by the renderer. Because layouts are code
// rather than model output, spacing, hierarchy and colour stay consistent
// across a deck no matter what the model writes.
// ============================================

export interface SlideTheme {
  /** Canvas background for ordinary content slides. */
  surface: string;
  /** Background for title, section and closing slides. */
  feature: string;
  heading: string;
  body: string;
  muted: string;
  /** Card / panel background on the surface. */
  panel: string;
  panelBorder: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  /** Text colours for use on the feature background. */
  featureHeading: string;
  featureBody: string;
}

export const SLIDE_THEMES: Record<string, SlideTheme> = {
  professional: {
    surface: "bg-white",
    feature: "bg-slate-900",
    heading: "text-slate-900",
    body: "text-slate-700",
    muted: "text-slate-500",
    panel: "bg-slate-50",
    panelBorder: "border-slate-200",
    accent: "bg-blue-600",
    accentSoft: "bg-blue-50",
    onAccent: "text-white",
    featureHeading: "text-white",
    featureBody: "text-slate-300",
  },
  minimal: {
    surface: "bg-white",
    feature: "bg-neutral-900",
    heading: "text-neutral-900",
    body: "text-neutral-600",
    muted: "text-neutral-400",
    panel: "bg-neutral-50",
    panelBorder: "border-neutral-200",
    accent: "bg-neutral-900",
    accentSoft: "bg-neutral-100",
    onAccent: "text-white",
    featureHeading: "text-white",
    featureBody: "text-neutral-300",
  },
  creative: {
    surface: "bg-white",
    feature: "bg-violet-700",
    heading: "text-violet-950",
    body: "text-slate-700",
    muted: "text-violet-400",
    panel: "bg-violet-50",
    panelBorder: "border-violet-200",
    accent: "bg-violet-600",
    accentSoft: "bg-violet-100",
    onAccent: "text-white",
    featureHeading: "text-white",
    featureBody: "text-violet-200",
  },
  academic: {
    surface: "bg-stone-50",
    feature: "bg-stone-800",
    heading: "text-stone-900",
    body: "text-stone-700",
    muted: "text-stone-500",
    panel: "bg-white",
    panelBorder: "border-stone-300",
    accent: "bg-emerald-700",
    accentSoft: "bg-emerald-50",
    onAccent: "text-white",
    featureHeading: "text-white",
    featureBody: "text-stone-300",
  },
  tech: {
    surface: "bg-slate-900",
    feature: "bg-slate-950",
    heading: "text-white",
    body: "text-slate-300",
    muted: "text-slate-500",
    panel: "bg-slate-800",
    panelBorder: "border-slate-700",
    accent: "bg-cyan-500",
    accentSoft: "bg-slate-800",
    onAccent: "text-slate-950",
    featureHeading: "text-white",
    featureBody: "text-cyan-200",
  },
};

export function themeFor(style: string | undefined): SlideTheme {
  return SLIDE_THEMES[style ?? "professional"] ?? SLIDE_THEMES.professional;
}
