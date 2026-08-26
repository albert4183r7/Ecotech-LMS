import { child, childrenNamed, type XNode } from "./xml";

// ============================================
// Colours, as PowerPoint means them
//
// A fill in OOXML is rarely a hex value. It is usually a slot in the theme —
// "accent1" — with modifiers applied on top: 40% lighter, shaded toward black,
// tinted toward white. Reading only the literal values would import a deck in
// the wrong colours, which for a deck someone made themselves is the whole
// point of importing it.
// ============================================

/** The theme's colour slots, as read from ppt/theme/themeN.xml. */
export type Theme = Record<string, string>;

/** dk1/lt1 are mapped onto tx1/bg1 by the slide master's colour map. */
const SLOT_ALIASES: Record<string, string> = {
  tx1: "dk1",
  bg1: "lt1",
  tx2: "dk2",
  bg2: "lt2",
};

function clamp(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return rgb
    .map((v) => clamp(v).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

function pct(node: XNode | null): number | null {
  const raw = node?.attrs.val;
  return raw === undefined ? null : Number(raw) / 100000;
}

/** Apply the modifiers hanging off a colour element, in OOXML's own order. */
function modify(hex: string, node: XNode): string {
  let rgb = toRgb(hex);

  const shade = pct(child(node, "a:shade"));
  if (shade !== null) rgb = rgb.map((v) => v * shade) as [number, number, number];

  const tint = pct(child(node, "a:tint"));
  if (tint !== null) {
    rgb = rgb.map((v) => v * tint + 255 * (1 - tint)) as [number, number, number];
  }

  const lumMod = pct(child(node, "a:lumMod"));
  const lumOff = pct(child(node, "a:lumOff"));
  if (lumMod !== null || lumOff !== null) {
    const hsl = rgbToHsl(rgb);
    let l = hsl[2];
    if (lumMod !== null) l *= lumMod;
    if (lumOff !== null) l += lumOff;
    rgb = hslToRgb([hsl[0], hsl[1], Math.max(0, Math.min(1, l))]);
  }

  const satMod = pct(child(node, "a:satMod"));
  if (satMod !== null) {
    const hsl = rgbToHsl(rgb);
    rgb = hslToRgb([hsl[0], Math.max(0, Math.min(1, hsl[1] * satMod)), hsl[2]]);
  }

  return toHex(rgb);
}

/** How opaque a colour element asks to be, or 1. */
export function alphaOf(node: XNode): number {
  return pct(child(node, "a:alpha")) ?? 1;
}

/**
 * Resolve one colour element — srgbClr, schemeClr, sysClr or prstClr — to hex.
 *
 * Returns null for an element that names no colour, so a caller can tell
 * "no fill" from "black".
 */
export function colourOf(node: XNode, theme: Theme): string | null {
  const srgb = child(node, "a:srgbClr");
  if (srgb?.attrs.val) return modify(srgb.attrs.val.toUpperCase(), srgb);

  const scheme = child(node, "a:schemeClr");
  if (scheme?.attrs.val) {
    const slot = SLOT_ALIASES[scheme.attrs.val] ?? scheme.attrs.val;
    const base = theme[slot] ?? theme[scheme.attrs.val] ?? "000000";
    return modify(base.toUpperCase(), scheme);
  }

  const sys = child(node, "a:sysClr");
  if (sys?.attrs.lastClr) return modify(sys.attrs.lastClr.toUpperCase(), sys);

  return null;
}

/** Read ppt/theme/themeN.xml into its colour slots. */
export function readTheme(themeXml: XNode): Theme {
  const scheme = child(child(themeXml, "a:theme") ?? themeXml, "a:themeElements");
  const colours = scheme ? child(scheme, "a:clrScheme") : null;
  const theme: Theme = {};
  if (!colours) return theme;

  for (const slot of colours.children) {
    const name = slot.name.replace(/^a:/, "");
    const value = colourOf(slot, {});
    if (value) theme[name] = value;
  }
  return theme;
}

/** A gradient fill as a CSS gradient, or null when it is not one. */
export function gradientOf(fill: XNode, theme: Theme): string | null {
  const stops = child(fill, "a:gsLst");
  if (!stops) return null;

  const parts = childrenNamed(stops, "a:gs")
    .map((gs) => {
      const colour = colourOf(gs, theme);
      const at = Number(gs.attrs.pos ?? 0) / 1000;
      return colour ? `#${colour} ${at.toFixed(1)}%` : null;
    })
    .filter((s): s is string => s !== null);
  if (parts.length < 2) return null;

  // OOXML measures the angle clockwise from east in 60000ths of a degree; CSS
  // measures clockwise from north.
  const lin = child(fill, "a:lin");
  const angle = lin ? (Number(lin.attrs.ang ?? 0) / 60000 + 90) % 360 : 90;
  return `linear-gradient(${angle.toFixed(0)}deg, ${parts.join(", ")})`;
}
