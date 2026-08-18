import DOMPurify from 'isomorphic-dompurify';

// ============================================
// HTML Sanitizer for AI-generated slide content
// Strict allowlist — only safe tags/attrs pass
// ============================================

const ALLOWED_TAGS = [
  'div', 'section', 'article', 'header', 'footer', 'main',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'span',
  'ul', 'ol', 'li',
  'a', 'img',
  'strong', 'em', 'b', 'i', 'u',
  'br', 'hr',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'blockquote', 'code', 'pre',
];

const FORBIDDEN_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed',
  'form', 'input', 'button', 'link', 'meta', 'base',
  'noscript', 'svg',
];

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

/** Regex-based href validation — works on both server and client */
function isValidHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (trimmed.startsWith('https://')) return true;
  if (trimmed.startsWith('#')) return true;
  return false;
}

/** Regex-based img src validation — works on both server and client */
function isValidImgSrc(src: string): boolean {
  const ikDomain = getImageKitDomain();
  const trimmed = src.trim();

  // Allow data: URIs (e.g., inline SVGs)
  if (trimmed.startsWith('data:')) return true;

  if (!ikDomain) {
    // If ImageKit not configured, allow any https image
    return trimmed.toLowerCase().startsWith('https://');
  }

  try {
    const url = new URL(trimmed);
    return url.hostname === ikDomain && url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Regex-based second pass: enforce URL policies & strip on* / style attrs.
   This replaces the DOM-based second pass so it works on the server too. */
function serverSidePostProcess(html: string): string {
  // 1. Validate and remove invalid href on <a> tags
  html = html.replace(
    /<a\s+([^>]*?)\bhref=("[^"]*"|'[^']*')([^>]*?)>/gi,
    (_match, before, href, after) => {
      const hrefVal = href.replace(/^['"]|['"]$/g, '');
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
      const srcVal = src.replace(/^['"]|['"]$/g, '');
      if (!isValidImgSrc(srcVal)) {
        // Remove the src attribute but keep the <img> tag
        return `<img ${before}${after}${selfClose}>`;
      }
      return _match;
    },
  );

  // 3. Strip on* event handler attributes
  html = html.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 4. Strip inline style attributes
  html = html.replace(/\s+style\s*=\s*("[^"]*"|'[^']*')/gi, '');

  return html;
}

/** Browser-side post-processing using DOM (more precise, used as supplement on client) */
function browserSidePostProcess(html: string): string {
  if (typeof document === 'undefined') return html;

  const temp = document.createElement('div');
  temp.innerHTML = html;

  temp.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href && !isValidHref(href)) {
      a.removeAttribute('href');
    }
  });

  temp.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src && !isValidImgSrc(src)) {
      img.removeAttribute('src');
    }
  });

  // Strip on* event handlers and inline styles
  const walker = document.createTreeWalker(temp, NodeFilter.SHOW_ELEMENT);
  let el: Node | null;
  while ((el = walker.nextNode())) {
    if (el instanceof Element) {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        if (attr.name === 'style') {
          el.removeAttribute(attr.name);
        }
      }
    }
  }

  return temp.innerHTML;
}

/** Sanitize AI-generated HTML for safe iframe rendering */
export function sanitizeHtml(rawHtml: string): string {
  const config: DOMPurify.Config = {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['class', 'id', 'href', 'src', 'alt', 'width', 'height'],
    FORBIDDEN_TAGS,
    ALLOW_COMMENTS: false,
    KEEP_CONTENT: true,
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

/** Wrap sanitized HTML in a full slide document for iframe srcDoc */
export function wrapSlideHtml(bodyHtml: string, options?: { title?: string }): string {
  const title = options?.title || 'Slide';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
  </style>
</head>
<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
  ${bodyHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
