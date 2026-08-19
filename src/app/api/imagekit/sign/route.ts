import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

// ============================================
// POST /api/imagekit/sign
// Server-side ImageKit URL signing
// Never expose the private key to the client.
// ============================================
//
// ImageKit signed URL format:
//   {URL_ENDPOINT}{path}?tr={transformations}&ik-s={signature}&ik-t={expiry}
//
// Signature algorithm:
//   signature = urlSafeBase64(HMAC-SHA1(privateKey, path + expiryTimestamp))
//
// Request body:
//   { urlPath: string, expirySeconds?: number }
//   - urlPath: the path part after the URL endpoint, including any ?tr= params
//     Example: "/ik-genimg-prompt-colorful+chart/data-viz.jpg?tr=e-upscale"
//   - expirySeconds: optional, defaults to 3600 (1 hour)
//
// Response:
//   { success: true, data: { signedUrl: string, expiresAt: number } }
//
// NOTE: Verify the exact signature algorithm against ImageKit's current docs.
// The implementation below follows the standard ImageKit Node.js SDK pattern.
// ============================================

interface SignRequest {
  urlPath: string;
  expirySeconds?: number;
}

const DEFAULT_EXPIRY_SECONDS = 3600; // 1 hour

export async function POST(request: NextRequest) {
  try {
    const { urlPath, expirySeconds } = (await request.json()) as SignRequest;

    if (!urlPath || typeof urlPath !== 'string') {
      return NextResponse.json(
        { success: false, error: 'urlPath is required and must be a string' },
        { status: 400 },
      );
    }

    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

    if (!privateKey || !urlEndpoint) {
      return NextResponse.json(
        {
          success: false,
          error:
            'ImageKit is not configured. Set IMAGEKIT_URL_ENDPOINT and IMAGEKIT_PRIVATE_KEY in .env',
        },
        { status: 503 },
      );
    }

    const expiry = Math.floor(Date.now() / 1000) + (expirySeconds || DEFAULT_EXPIRY_SECONDS);

    // Strip any existing ik-s and ik-t params from the path before signing
    const cleanPath = urlPath
      .replace(/[?&]ik-s=[^&]*/g, '')
      .replace(/[?&]ik-t=[^&]*/g, '')
      .replace(/[?&]$/g, '');

    // Build signature string: the path (after endpoint) + expiry timestamp
    // The path must start with /
    const signatureString = cleanPath + expiry;

    // HMAC-SHA1 with the private key
    const hmac = createHmac('sha1', privateKey);
    hmac.update(signatureString);
    const signature = hmac.digest('base64');

    // URL-safe Base64: replace + with -, / with _, remove trailing =
    const urlSafeSignature = signature
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Build the separator: if cleanPath already has query params, use &; otherwise ?
    const separator = cleanPath.includes('?') ? '&' : '?';

    // Construct the full signed URL
    const signedUrl = `${urlEndpoint}${cleanPath}${separator}ik-s=${urlSafeSignature}&ik-t=${expiry}`;

    return NextResponse.json({
      success: true,
      data: { signedUrl, expiresAt: expiry },
    });
  } catch (error) {
    console.error('Error signing ImageKit URL:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sign ImageKit URL' },
      { status: 500 },
    );
  }
}
