import { colourOf, cssColour, paintOf, type Theme } from "./colour";
import { child, childrenNamed, find, findAll, type XNode } from "./xml";

// ============================================
// What a slide inherits
//
// Almost nothing in a real deck states its own formatting. A title is 40pt
// because the master says title text is 40pt; it is navy because the theme's
// first text colour is navy; it is set in Georgia because the theme's major
// font is Georgia. The slide itself usually carries only the words.
//
// So an importer that reads only what the slide states imports a deck of
// black 18pt Calibri — the right words in none of the right clothes. This
// walks the chain PowerPoint walks: the run, its paragraph, the shape, the
// layout's placeholder, the master's placeholder, the master's text styles,
// and the theme behind all of them.
// ============================================

export interface TextStyle {
  sizePt: number;
  /** A CSS colour — a hex when opaque, rgba() when the deck screened it back. */
  colour: string | null;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** A real font name, never a theme reference. */
  face: string | null;
  align: string | null;
}

export interface ThemeFonts {
  major: string | null;
  minor: string | null;
}

export interface Inheritance {
  theme: Theme;
  fonts: ThemeFonts;
  /** Placeholder key → the shape that defines it, in the layout and master. */
  layout: Map<string, XNode>;
  master: Map<string, XNode>;
  /** The master's p:txStyles, which is where most sizes actually live. */
  txStyles: XNode | null;
  /** The theme's fill style list, for shapes that reference it by index. */
  fillStyles: XNode[];
}

/** Read the theme's major and minor Latin fonts. */
export function readFonts(themeXml: XNode | null): ThemeFonts {
  if (!themeXml) return { major: null, minor: null };
  const scheme = find(themeXml, "a:fontScheme");
  const pick = (which: string) => {
    const group = scheme ? child(scheme, which) : null;
    const latin = group ? child(group, "a:latin") : null;
    const face = latin?.attrs.typeface;
    return face && !face.startsWith("+") ? face : null;
  };
  return { major: pick("a:majorFont"), minor: pick("a:minorFont") };
}

/** Placeholder key for a shape, matching the one the importer addresses by. */
export function keyOf(shape: XNode): string | null {
  const ph = find(shape, "p:ph");
  if (!ph) return null;
  return `${ph.attrs.type ?? "body"}:${ph.attrs.idx ?? "0"}`;
}

/** Index a part's placeholder shapes, so a slide can look its own up. */
export function indexPlaceholders(part: XNode | null): Map<string, XNode> {
  const found = new Map<string, XNode>();
  if (!part) return found;
  const tree = find(part, "p:spTree");
  if (!tree) return found;
  for (const shape of findAll(tree, "p:sp")) {
    const key = keyOf(shape);
    if (key && !found.has(key)) found.set(key, shape);
  }
  return found;
}

/** Which of the master's three text styles a placeholder type reads from. */
function styleListFor(key: string | null): string {
  if (!key) return "p:otherStyle";
  if (key.startsWith("title") || key.startsWith("ctrTitle")) return "p:titleStyle";
  if (
    key.startsWith("body") ||
    key.startsWith("subTitle") ||
    key.startsWith("outline") ||
    key.startsWith("obj")
  ) {
    return "p:bodyStyle";
  }
  return "p:otherStyle";
}

/** The defRPr for one outline level inside a lstStyle-shaped element. */
function levelProps(list: XNode | null, level: number): XNode | null {
  if (!list) return null;
  const wanted = `a:lvl${level + 1}pPr`;
  const found = child(list, wanted) ?? child(list, "a:lvl1pPr");
  return found;
}

/** Fold one level of the chain onto the style built so far. */
function apply(style: TextStyle, props: XNode | null, theme: Theme): void {
  if (!props) return;

  // A paragraph-level element carries alignment; a run-level one does not.
  if (props.attrs.algn) style.align = props.attrs.algn;

  const rPr =
    props.name === "a:defRPr" || props.name === "a:rPr" ? props : child(props, "a:defRPr");
  if (!rPr) return;

  if (rPr.attrs.sz) style.sizePt = Number(rPr.attrs.sz) / 100;
  if (rPr.attrs.b !== undefined) style.bold = rPr.attrs.b === "1";
  if (rPr.attrs.i !== undefined) style.italic = rPr.attrs.i === "1";
  if (rPr.attrs.u !== undefined) style.underline = rPr.attrs.u !== "none";

  const fill = child(rPr, "a:solidFill");
  if (fill) {
    const paint = paintOf(fill, theme);
    // Screened-back type is a real choice — a caption at 60% is how a deck
    // says "secondary" — so the run keeps the opacity it asked for.
    if (paint) style.colour = cssColour(paint);
  }

  const latin = child(rPr, "a:latin");
  if (latin?.attrs.typeface) style.face = latin.attrs.typeface;
}

/**
 * The formatting a run inherits before it states anything of its own.
 *
 * Walked lowest priority first, so each level overrides the one behind it —
 * which is the order PowerPoint resolves them in.
 */
export function inheritedStyle(
  inh: Inheritance,
  key: string | null,
  level: number,
  shape: XNode,
  paragraph: XNode,
): TextStyle {
  const style: TextStyle = {
    sizePt: 18,
    colour: null,
    bold: false,
    italic: false,
    underline: false,
    face: null,
    align: null,
  };

  // 1. The master's text styles for this kind of placeholder.
  const styles = inh.txStyles;
  apply(style, levelProps(styles ? child(styles, styleListFor(key)) : null, level), inh.theme);

  // 2. The master's own placeholder shape, then the layout's.
  for (const source of [key ? inh.master.get(key) : null, key ? inh.layout.get(key) : null]) {
    if (!source) continue;
    const body = child(source, "p:txBody");
    apply(style, levelProps(body ? child(body, "a:lstStyle") : null, level), inh.theme);
  }

  // 3. This shape's own list style, and the shape's theme font reference.
  const shapeStyle = child(shape, "p:style");
  const fontRef = shapeStyle ? child(shapeStyle, "a:fontRef") : null;
  if (fontRef) {
    const paint = paintOf(fontRef, inh.theme);
    if (paint) style.colour = cssColour(paint);
    if (fontRef.attrs.idx === "major" && inh.fonts.major) style.face = inh.fonts.major;
    if (fontRef.attrs.idx === "minor" && inh.fonts.minor) style.face = inh.fonts.minor;
  }
  const ownBody = child(shape, "p:txBody");
  apply(style, levelProps(ownBody ? child(ownBody, "a:lstStyle") : null, level), inh.theme);

  // 4. The paragraph's own properties.
  apply(style, child(paragraph, "a:pPr"), inh.theme);

  // A theme font reference resolves here rather than reaching the renderer.
  if (style.face === "+mj-lt") style.face = inh.fonts.major;
  if (style.face === "+mn-lt") style.face = inh.fonts.minor;
  if (!style.face) {
    style.face =
      styleListFor(key) === "p:titleStyle" ? (inh.fonts.major ?? null) : (inh.fonts.minor ?? null);
  }

  return style;
}

/** Fold a run's own properties onto what it inherited. */
export function withRunProps(base: TextStyle, rPr: XNode | null, theme: Theme): TextStyle {
  const style = { ...base };
  apply(style, rPr, theme);
  if (style.face === "+mj-lt" || style.face === "+mn-lt") style.face = base.face;
  return style;
}

/**
 * The fill a shape takes from the theme's style matrix.
 *
 * `<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>` is how most
 * shapes drawn in PowerPoint state their colour — the shape itself has no
 * solidFill at all, and reading only explicit fills imports them as invisible
 * rectangles.
 */
export function styleFill(shape: XNode, inh: Inheritance): string | null {
  const style = child(shape, "p:style");
  const fillRef = style ? child(style, "a:fillRef") : null;
  if (!fillRef) return null;
  if (fillRef.attrs.idx === "0") return null;
  const paint = paintOf(fillRef, inh.theme);
  // Returned as CSS rather than as a hex: a themed fill can be screened back
  // like any other, and the caller has no way to know that from a hex.
  return paint ? cssColour(paint) : null;
}

/** The outline a shape takes from the theme's style matrix. */
export function styleLine(shape: XNode, inh: Inheritance): string | null {
  const style = child(shape, "p:style");
  const lnRef = style ? child(style, "a:lnRef") : null;
  if (!lnRef || lnRef.attrs.idx === "0") return null;
  return colourOf(lnRef, inh.theme);
}

/** The background a part states, following bgRef into the theme when it uses one. */
export function backgroundOf(part: XNode | null, inh: Inheritance): string | null {
  if (!part) return null;
  const bg = find(part, "p:bg");
  if (!bg) return null;

  const solid = child(bg, "a:solidFill") ?? find(bg, "a:solidFill");
  if (solid) {
    const paint = paintOf(solid, inh.theme);
    if (paint) return cssColour(paint);
  }

  const ref = find(bg, "p:bgRef");
  if (ref) {
    const paint = paintOf(ref, inh.theme);
    if (paint) return cssColour(paint);
  }

  return null;
}

/** Every fill style the theme defines, for callers that resolve by index. */
export function readFillStyles(themeXml: XNode | null): XNode[] {
  if (!themeXml) return [];
  const fmt = find(themeXml, "a:fmtScheme");
  const list = fmt ? child(fmt, "a:fillStyleLst") : null;
  return list ? childrenNamed(list, "a:solidFill").concat(childrenNamed(list, "a:gradFill")) : [];
}
