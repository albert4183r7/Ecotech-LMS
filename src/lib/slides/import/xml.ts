// ============================================
// A very small XML reader
//
// Enough of XML to walk OOXML: elements, attributes, text and entities. The
// project has no XML parser and none of the obvious ones are dependency-free;
// PowerPoint's parts are machine-written, so the awkward corners of the spec
// (DTDs, processing instructions inside content, CDATA in drawing markup) do
// not appear in them.
//
// Written as a reader rather than a validator: anything it does not recognise
// is skipped, because a slide that half-parses is worth more than an import
// that fails on one unexpected element.
// ============================================

export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  /** Direct text content of this element, entities decoded. */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decode(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code] ?? whole;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[1] ?? match[3];
    const value = match[2] ?? match[4] ?? "";
    attrs[name] = decode(value);
  }
  return attrs;
}

/** Parse a document, returning its root element. */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XNode[] = [root];
  const tag = /<([!?/]?)([\w:.-]*)([^>]*?)(\/?)>/g;

  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = tag.exec(xml))) {
    const [whole, prefix, name, rest, selfClose] = match;

    // Text between the previous tag and this one belongs to the open element.
    if (match.index > cursor) {
      const text = xml.slice(cursor, match.index);
      if (text.trim()) stack[stack.length - 1].text += decode(text);
    }
    cursor = match.index + whole.length;

    // Declarations, comments and processing instructions carry no content.
    if (prefix === "!" || prefix === "?") continue;

    if (prefix === "/") {
      if (stack.length > 1 && stack[stack.length - 1].name === name) stack.pop();
      continue;
    }

    const node: XNode = { name, attrs: parseAttrs(rest), children: [], text: "" };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }

  return root;
}

/** Every descendant with this tag name, in document order. */
export function findAll(node: XNode, name: string): XNode[] {
  const found: XNode[] = [];
  const visit = (n: XNode) => {
    for (const child of n.children) {
      if (child.name === name) found.push(child);
      visit(child);
    }
  };
  visit(node);
  return found;
}

/** The first descendant with this tag name. */
export function find(node: XNode, name: string): XNode | null {
  for (const child of node.children) {
    if (child.name === name) return child;
    const deeper = find(child, name);
    if (deeper) return deeper;
  }
  return null;
}

/** Direct children with this tag name — for cases where depth matters. */
export function childrenNamed(node: XNode, name: string): XNode[] {
  return node.children.filter((c) => c.name === name);
}

/** The first direct child with this tag name. */
export function child(node: XNode, name: string): XNode | null {
  return node.children.find((c) => c.name === name) ?? null;
}

/** All the text inside an element, in reading order. */
export function textOf(node: XNode): string {
  let out = node.text;
  for (const c of node.children) out += textOf(c);
  return out;
}
