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

/** Check whether ImageKit is properly configured */
function isImageKitConfigured(): boolean {
  return !!(process.env.IMAGEKIT_URL_ENDPOINT);
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
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha1', privateKey);
    hmac.update(signatureBase);
    const signature = hmac.digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    parsedUrl.searchParams.set('ik-s', signature);
    parsedUrl.searchParams.set('ik-t', String(expiry));
    return parsedUrl.toString();
  } catch {
    return url;
  }
}

/** Regex-based href validation — works on both server and client */
function isValidHref(href: string): boolean {
  const trimmed = href.trim().toLowerCase();
  // Only allow https links or same-page anchors
  if (trimmed.startsWith('https://')) return true;
  if (trimmed.startsWith('#')) return true;
  return false;
}

/** Regex-based img src validation — works on both server and client */
function isValidImgSrc(src: string): boolean {
  const ikDomain = getImageKitDomain();
  const trimmed = src.trim();

  // SECURITY: Block data: URIs entirely (can contain SVG with embedded scripts)
  if (trimmed.startsWith('data:')) return false;

  if (ikDomain) {
    // When ImageKit is configured, ONLY allow ImageKit domain images
    try {
      const url = new URL(trimmed);
      return url.hostname === ikDomain && url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // When ImageKit is NOT configured, block ALL external images.
  // This prevents the AI from generating URLs that point to arbitrary domains
  // or to the placeholder "ik.imagekit.io/YOUR_ID" that would fail to load.
  // Relative paths (e.g. /uploads/...) are allowed for user-uploaded images.
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) return true;

  return false;
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

  // 5. Sign ImageKit URLs server-side (only when configured)
  if (typeof require === 'function' && isImageKitConfigured()) {
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
