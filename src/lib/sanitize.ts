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

/** Custom hook to strip all on* event handler attributes */
function stripEventHandlers(node: Element | DocumentFragment) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
  let el: Node | null;
  while ((el = walker.nextNode())) {
    if (el instanceof Element) {
      const attrs = Array.from(el.attributes);
      for (const attr of attrs) {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
        // Strip inline style attributes — Tailwind classes only
        if (attr.name === 'style') {
          el.removeAttribute(attr.name);
        }
      }
    }
  }
}

/** Custom URI policy for href */
function isValidHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  if (trimmed.startsWith('https://')) return true;
  // Allow same-page anchors
  if (trimmed.startsWith('#')) return true;
  return false;
}

/** Custom URI policy for img src — must be ImageKit domain */
function isValidImgSrc(src: string): boolean {
  const ikDomain = getImageKitDomain();
  if (!ikDomain) {
    // If ImageKit not configured, allow https images
    return src.trim().toLowerCase().startsWith('https://');
  }
  try {
    const url = new URL(src.trim());
    return url.hostname === ikDomain && url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Sanitize AI-generated HTML for safe iframe rendering */
export function sanitizeHtml(rawHtml: string): string {
  const ikDomain = getImageKitDomain();

  const config: DOMPurify.Config = {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['class', 'id', 'href', 'src', 'alt', 'width', 'height'],
    FORBIDDEN_TAGS,
    // Disallow all HTML comments
    ALLOW_COMMENTS: false,
    // Keep HTML entities intact
    KEEP_CONTENT: true,
  };

  // First pass: DOMPurify with base config
  let clean = DOMPurify.sanitize(rawHtml, config);

  // Second pass: post-processing in DOM to enforce stricter URL policies
  // DOMPurify's hooks are limited, so we do URL validation in a second pass
  if (typeof document !== 'undefined') {
    const temp = document.createElement('div');
    temp.innerHTML = clean;

    // Validate href attributes on <a> tags
    temp.querySelectorAll('a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !isValidHref(href)) {
        a.removeAttribute('href');
      }
    });

    // Validate src attributes on <img> tags
    temp.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (src && !isValidImgSrc(src)) {
        img.removeAttribute('src');
      }
    });

    // Strip any on* event handlers and inline styles
    stripEventHandlers(temp);

    clean = temp.innerHTML;
  }

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
