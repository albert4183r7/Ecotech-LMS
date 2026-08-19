// ============================================
// ImageKit URL Builder
// AI image generation and transformation helpers
// Server-side only — never import on client.
// ============================================

const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || '';
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || '';

/** Generate an ImageKit AI image URL
 *  Format: {URL_ENDPOINT}/ik-genimg-prompt-{encodedText}/anything-you-want.jpg
 */
export function getAIImageUrl(prompt: string, fileName = 'slide-image.jpg'): string {
  if (!IMAGEKIT_URL_ENDPOINT) {
    return '';
  }
  const encoded = encodeURIComponent(prompt);
  const cleanEndpoint = IMAGEKIT_URL_ENDPOINT.replace(/\/$/, '');
  return `${cleanEndpoint}/ik-genimg-prompt-${encoded}/${fileName}`;
}

/** Build a signed ImageKit URL using the private key
 * Uses ImageKit's standard URL signature pattern (HMAC-SHA1)
 *
 * Signature = urlSafeBase64(HMAC-SHA1(privateKey, path + expiryTimestamp))
 */
export function signImageUrl(path: string): string {
  if (!IMAGEKIT_URL_ENDPOINT || !IMAGEKIT_PRIVATE_KEY) {
    return path;
  }

  try {
    const url = new URL(path, IMAGEKIT_URL_ENDPOINT);
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    // ImageKit signature: path + query + expiry
    const signatureBase = url.pathname + url.search + expiry;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha1', IMAGEKIT_PRIVATE_KEY);
    hmac.update(signatureBase);
    const signature = hmac.digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    url.searchParams.set('ik-s', signature);
    url.searchParams.set('ik-t', String(expiry));
    return url.toString();
  } catch {
    return path;
  }
}

/** Check if ImageKit is properly configured */
export function isImageKitConfigured(): boolean {
  return !!(IMAGEKIT_URL_ENDPOINT && IMAGEKIT_PRIVATE_KEY);
}

/** Get the ImageKit URL endpoint */
export function getImageKitEndpoint(): string {
  return IMAGEKIT_URL_ENDPOINT;
}

// ============================================
// Transformation URL builders
// ============================================

export interface ImageTransformOptions {
  /** Replace background: e-changebg-prompt-{text} */
  changeBackgroundPrompt?: string;
  /** Remove background: e-removedotbg or e-bgremove */
  removeBackground?: 'removedotbg' | 'bgremove';
  /** Upscale: e-upscale */
  upscale?: boolean;
  /** Add shadow: e-dropshadow */
  dropShadow?: boolean;
  /** Custom transformation string */
  customTr?: string;
}

/** Build a transformation parameter string for ImageKit
 *  Multiple transforms are comma-separated in tr= param
 */
export function buildTransformParams(options: ImageTransformOptions): string {
  const transforms: string[] = [];

  if (options.changeBackgroundPrompt) {
    const encoded = encodeURIComponent(options.changeBackgroundPrompt);
    transforms.push(`e-changebg-prompt-${encoded}`);
  }
  if (options.removeBackground) {
    transforms.push(`e-${options.removeBackground}`);
  }
  if (options.upscale) {
    transforms.push('e-upscale');
  }
  if (options.dropShadow) {
    transforms.push('e-dropshadow');
  }
  if (options.customTr) {
    transforms.push(options.customTr);
  }

  return transforms.join(',');
}

/** Apply transformations to an existing ImageKit URL */
export function applyTransformations(imageUrl: string, options: ImageTransformOptions): string {
  const tr = buildTransformParams(options);
  if (!tr) return imageUrl;

  try {
    const url = new URL(imageUrl);
    const existingTr = url.searchParams.get('tr');
    url.searchParams.set('tr', existingTr ? `${existingTr},${tr}` : tr);
    return url.toString();
  } catch {
    // If URL parsing fails, return as-is
    return imageUrl;
  }
}
