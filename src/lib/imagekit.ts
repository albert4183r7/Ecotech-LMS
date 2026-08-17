// ============================================
// ImageKit URL Builder
// AI image generation and transformation helpers
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
 * Uses ImageKit's URL signature pattern with crypto
 */
export function signImageUrl(path: string, params?: Record<string, string>): string {
  if (!IMAGEKIT_URL_ENDPOINT || !IMAGEKIT_PRIVATE_KEY) {
    return path;
  }

  const cleanEndpoint = IMAGEKIT_URL_ENDPOINT.replace(/\/$/, '');
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureBase = params
    ? `${path}${JSON.stringify(params)}${timestamp}`
    : `${path}${timestamp}`;

  // Simple HMAC-SHA256 signature
  const signature = createHmacSha256(IMAGEKIT_PRIVATE_KEY, signatureBase);
  
  const url = new URL(path, cleanEndpoint);
  url.searchParams.set('ik-s-t', timestamp);
  url.searchParams.set('ik-s', signature);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
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

// ============================================
// HMAC-SHA256 implementation (no crypto dependency needed in Node 18+)
// ============================================
async function hmacSha256(key: string, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(key);
  const msgData = encoder.encode(message);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return crypto.subtle.sign('HMAC', cryptoKey, msgData);
}

/** Synchronous HMAC-SHA256 for URL signing */
function createHmacSha256(key: string, message: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    return crypto.createHmac('sha256', key).update(message).digest('hex');
  } catch {
    // Fallback for non-Node environments
    return Buffer.from(key).toString('hex').slice(0, 20);
  }
}
