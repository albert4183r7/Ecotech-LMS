import DOMPurify, { type Config } from "isomorphic-dompurify";
import { templateFor, templateCssVariables } from "@/lib/slides/template";

// ============================================
// HTML Sanitizer for AI-generated slide content
// Strict allowlist — only safe tags/attrs pass
// ============================================

const ALLOWED_TAGS = [
  "div",
  "section",
  "article",
  "header",
  "footer",
  "main",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "blockquote",
  "code",
  "pre",
  // A narrow SVG subset, for the renderer's icons and diagram connectors.
  // Without these the sanitizer stripped every icon and slides were text only.
  // The dangerous parts of SVG — foreignObject, use, image, script and the
  // animation elements — stay out of this list and are forbidden below.
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
];

const FORBIDDEN_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "link",
  "meta",
  "base",
  "noscript",
  // SVG elements that can load or execute something. The shape elements above
  // are inert; these are not.
  "foreignObject",
  "use",
  "image",
  "animate",
  "animateTransform",
  "set",
];

/** Check whether ImageKit is properly configured */
function isImageKitConfigured(): boolean {
  return !!process.env.IMAGEKIT_URL_ENDPOINT;
}

/** Get the allowed ImageKit URL endpoint from env */
function getImageKitDomain(): string | null {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

/** Sign an ImageKit URL server-side. Only works when env vars are set. */
function signImageKitUrl(url: string): string {
  const endpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!endpoint || !privateKey) return url;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== getImageKitDomain()) return url;

    const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    // Extract the path+query (everything after the hostname)
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    const signatureBase = pathAndQuery + expiry;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha1", privateKey);
    hmac.update(signatureBase);
    const signature = hmac
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    parsedUrl.searchParams.set("ik-s", signature);
    parsedUrl.searchParams.set("ik-t", String(expiry));
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

/** Regex-based href validation — works on both server and client */
function isValidHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  // Only allow https links or same-page anchors
  if (trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("#")) return true;
  return false;
}

/** Regex-based img src validation — works on both server and client */
function isValidImgSrc(src: string): boolean {
  const ikDomain = getImageKitDomain();
  const trimmed = src.trim();

  // SECURITY: Block data: URIs entirely (can contain SVG with embedded scripts)
  if (trimmed.startsWith("data:")) return false;

  if (ikDomain) {
    // When ImageKit is configured, ONLY allow ImageKit domain images
    try {
      const url = new URL(trimmed);
      return url.hostname === ikDomain && url.protocol === "https:";
    } catch {
      return false;
    }
  }

  // When ImageKit is NOT configured, block ALL external images.
  // This prevents the AI from generating URLs that point to arbitrary domains
  // or to the placeholder "ik.imagekit.io/YOUR_ID" that would fail to load.
  // Relative paths (e.g. /uploads/...) are allowed for user-uploaded images.
  if (trimmed.startsWith("/") || trimmed.startsWith("./")) return true;

  return false;
}

/** Regex-based second pass: enforce URL policies & strip on* / style attrs.
   This replaces the DOM-based second pass so it works on the server too. */

// ============================================
// Inline style filtering
//
// The renderer positions every box at the fraction the .pptx template places
// it at. Those values come from the template, not from a fixed scale, so they
// cannot be expressed as utility classes and have to travel as inline style.
//
// Both sanitiser passes used to delete every style attribute outright, which
// was right when a model wrote the markup. Now the renderer writes it, so the
// declarations are filtered instead: only these properties survive, and only
// with values that cannot fetch or execute anything.
// ============================================

const STYLE_PROPERTIES = new Set([
  "position",
  "left",
  "top",
  "right",
  "bottom",
  "inset",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "font-size",
  "line-height",
  "font-weight",
  "font-family",
  "font-style",
  "text-align",
  "text-transform",
  "letter-spacing",
  "white-space",
  "overflow",
  "overflow-wrap",
  "word-break",
  "display",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
  "padding",
  "margin",
  "border-radius",
  "border",
  "border-color",
  "border-width",
  "opacity",
  "filter",
  "transform",
  "z-index",
]);

/** Values that could fetch, execute, or escape the declaration. */
const UNSAFE_VALUE = /url\(|expression\(|javascript:|behaviour:|behavior:|@import|[<>{}\\]/i;

/** Keep only allowlisted declarations with inert values. */
export function filterInlineStyle(value: string): string {
  return value
    .split(";")
    .map((declaration) => {
      const colon = declaration.indexOf(":");
      if (colon < 0) return "";
      const property = declaration.slice(0, colon).trim().toLowerCase();
      const propertyValue = declaration.slice(colon + 1).trim();
      if (!STYLE_PROPERTIES.has(property)) return "";
      if (!propertyValue || UNSAFE_VALUE.test(propertyValue)) return "";
      return `${property}:${propertyValue}`;
    })
    .filter(Boolean)
    .join(";");
}

function serverSidePostProcess(html: string): string {
  // 1. Validate and remove invalid href on <a> tags
  html = html.replace(
    /<a\s+([^>]*?)\bhref=("[^"]*"|'[^']*')([^>]*?)>/gi,
    (_match, before, href, after) => {
      const hrefVal = href.replace(/^['"]|['"]$/g, "");
      if (!isValidHref(hrefVal)) {
        // Remove the href attribute but keep the <a> tag
        return `<a ${before}${after}>`;
      }
      return _match;
    },
  );

  // 2. Validate and remove invalid src on <img> tags
  html = html.replace(
    /<img\s+([^>]*?)\bsrc=("[^"]*"|'[^']*')([^>]*?)(\/?)>/gi,
    (_match, before, src, after, selfClose) => {
      const srcVal = src.replace(/^['"]|['"]$/g, "");
      if (!isValidImgSrc(srcVal)) {
        // Remove the src attribute but keep the <img> tag
        return `<img ${before}${after}${selfClose}>`;
      }
      return _match;
    },
  );

  // 3. Strip on* event handler attributes
  html = html.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 4. Filter inline style down to inert layout declarations
  html = html.replace(/\s+style\s*=\s*("([^"]*)"|'([^']*)')/gi, (_m, _q, dq, sq) => {
    const filtered = filterInlineStyle(dq ?? sq ?? "");
    return filtered ? ` style="${filtered}"` : "";
  });

  // 5. Sign ImageKit URLs server-side (only when configured)
  if (typeof require === "function" && isImageKitConfigured()) {
    html = html.replace(
      /(<img\s[^>]*?\bsrc=)("([^"]*)"|'([^']*)')([^>]*?)(\/?>)/gi,
      (_match, before, srcFull, srcDq, srcSq, after, close) => {
        const srcVal = srcDq ?? srcSq;
        if (!srcVal) return _match;
        const signed = signImageKitUrl(srcVal);
        if (signed === srcVal) return _match; // No change needed
        return `${before}"${signed}"${after}${close}`;
      },
    );
  }

  return html;
}

/** Browser-side post-processing using DOM (more precise, used as supplement on client) */
function browserSidePostProcess(html: string): string {
  if (typeof document === "undefined") return html;

  const temp = document.createElement("div");
  temp.innerHTML = html;

  temp.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href && !isValidHref(href)) {
      a.removeAttribute("href");
    }
  });

  temp.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && !isValidImgSrc(src)) {
      img.removeAttribute("src");
    }
  });

  // Strip on* event handlers and inline styles
  const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
  let el: Node | null;
  while ((el = walker.nextNode())) {
    if (el instanceof Element) {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (attr.name.startsWith("on")) {
          el.removeAttribute(attr.name);
        }
        if (attr.name === "style") {
          const filtered = filterInlineStyle(attr.value);
          if (filtered) el.setAttribute("style", filtered);
          else el.removeAttribute("style");
        }
      }
    }
  }

  return temp.innerHTML;
}

/** Sanitize AI-generated HTML for safe iframe rendering */
export function sanitizeHtml(rawHtml: string): string {
  const config: Config & { RETURN_TRUSTED_TYPE: false } = {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [
      "class",
      "id",
      "href",
      "src",
      "alt",
      "width",
      "height",
      "aria-hidden",
      // Names which content field an element renders, so a click can address it.
      "data-path",
      // Names the template layout a slide was drawn with, for diagnostics.
      "data-layout",
      // Slide geometry. The renderer positions every box at the fraction the
      // template places it at, which cannot be expressed as utility classes
      // because the values come from the .pptx rather than a fixed scale.
      // DOMPurify parses and filters declarations when style is allowed, so
      // url(), expression() and behaviour properties do not survive.
      "style",
      // SVG geometry and presentation. All inert: they describe shapes only.
      "viewBox",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "d",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "x",
      "y",
      "x1",
      "y1",
      "x2",
      "y2",
      "points",
      "transform",
    ],
    // DOMPurify reads FORBID_TAGS. This was passed as FORBIDDEN_TAGS, which it
    // ignores — harmless while ALLOWED_TAGS is an allowlist, but it meant the
    // list did nothing, so anything added to the allowlist bypassed it.
    FORBID_TAGS: FORBIDDEN_TAGS,
    // ALLOW_COMMENTS used to be set here. DOMPurify has no such option, so it
    // never did anything; it typechecked only because the Config type was
    // being resolved as any. Comments are dropped regardless, because
    // ALLOWED_TAGS is an allowlist and does not contain "#comment".
    KEEP_CONTENT: true,
    // Stated so the overload resolves to string. Left off, a widened Config
    // matched the TrustedHTML overload first and every caller downstream was
    // handed a type it could not concatenate or post-process.
    RETURN_TRUSTED_TYPE: false,
  };

  // First pass: DOMPurify with base config (removes forbidden tags)
  let clean = DOMPurify.sanitize(rawHtml, config);

  // Second pass: URL validation and attribute stripping
  // Server-safe regex pass runs always
  clean = serverSidePostProcess(clean);
  // Client-side DOM pass supplements on browser (more precise)
  clean = browserSidePostProcess(clean);

  return clean;
}

/** Slide design canvas. Every slide is authored and rendered at this exact
 *  size, then scaled to fit whatever box it is displayed in. Without a fixed
 *  canvas the same slide lays out differently in the classroom and in a small
 *  preview, because the model's absolute type and spacing values are measured
 *  against the viewport. */
export const SLIDE_WIDTH = 1280;
export const SLIDE_HEIGHT = 720;

/**
 * Wrap sanitized HTML in a full slide document for iframe srcDoc or rendering.
 *
 * The template is written in as custom properties rather than baked into the
 * markup, so the same body renders in any template and a stored slide can be
 * re-themed without regenerating it.
 */
export function wrapSlideHtml(
  bodyHtml: string,
  options?: { title?: string; templateId?: string },
): string {
  const title = options?.title || "Slide";
  const template = templateFor(options?.templateId);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/slide-runtime.css" />
  <style>
    :root { --slide-w: ${SLIDE_WIDTH}px; --slide-h: ${SLIDE_HEIGHT}px; --slide-scale: 1; }
    :root { ${templateCssVariables(template)} }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #ffffff; }
    .slide-stage {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden;
    }
    .slide-canvas {
      width: var(--slide-w); height: var(--slide-h);
      flex: none; overflow: hidden; position: relative;
      transform: scale(var(--slide-scale)); transform-origin: center center;
      background: var(--tpl-surface); color: var(--tpl-body);
      font-family: var(--tpl-font-body);
    }
    /* Make the generated root fill the canvas. Declared after the stylesheet
       link so it also neutralises viewport-relative heights such as
       min-h-screen, which would otherwise stretch past the canvas. */
    .slide-canvas > * { width: 100%; height: 100%; min-height: 0; }
  </style>
</head>
<body>
  <div class="slide-stage">
    <div class="slide-canvas" id="slide-canvas">
      ${bodyHtml}
    </div>
  </div>
  <script>
    (function () {
      var root = document.documentElement;
      function fit() {
        root.style.setProperty(
          "--slide-scale",
          String(Math.min(window.innerWidth / ${SLIDE_WIDTH}, window.innerHeight / ${SLIDE_HEIGHT}))
        );
      }
      fit();
      window.addEventListener("resize", fit);
    })();
  </script>
</body>
</html>`;
}

/** True when a stored document already uses the current slide canvas. */
export function isCanvasDocument(html: string): boolean {
  return html.includes('id="slide-canvas"');
}

/**
 * Guarantee a slide document renders on the current canvas.
 *
 * Slides generated before the canvas existed are plain documents. Measuring
 * one of those finds no canvas element and would otherwise report a perfectly
 * clean slide, which is a false pass.
 */
export function ensureCanvasDocument(html: string, title?: string, templateId?: string): string {
  if (isCanvasDocument(html)) return html;
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return wrapSlideHtml(body, { title, templateId });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
