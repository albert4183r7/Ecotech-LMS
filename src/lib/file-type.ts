// ============================================
// File type, from the bytes rather than the name
//
// Uploads were accepted on the strength of their extension alone, so what a
// file claimed to be and what it actually was never had to agree. That is how
// an executable script arrives named .png, and it is why the SVG hole was a
// hole: nothing ever opened the file.
//
// The signatures below are the leading bytes each format is defined to start
// with. This is not a general-purpose sniffer — it only has to answer one
// question: does this file's content match the extension it was uploaded
// under? Anything it cannot positively identify is rejected rather than
// guessed at, because "unrecognised" is exactly what a crafted file looks like.
// ============================================

export type DetectedType =
  | "jpeg"
  | "png"
  | "gif"
  | "webp"
  | "bmp"
  | "pdf"
  | "zip"
  | "ole"
  | "rtf"
  | "text";

interface Signature {
  type: DetectedType;
  /** Bytes the format begins with. */
  magic: number[];
  /** Where those bytes sit, for formats that do not lead with them. */
  offset?: number;
  /** A second run of bytes further in, where the first is not conclusive. */
  also?: { offset: number; magic: number[] };
}

const SIGNATURES: Signature[] = [
  { type: "jpeg", magic: [0xff, 0xd8, 0xff] },
  { type: "png", magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "gif", magic: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // RIFF....WEBP — the size field sits between the two, so both runs are checked.
  {
    type: "webp",
    magic: [0x52, 0x49, 0x46, 0x46],
    also: { offset: 8, magic: [0x57, 0x45, 0x42, 0x50] },
  },
  { type: "bmp", magic: [0x42, 0x4d] },
  { type: "pdf", magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // Modern Office files are ZIP archives; .docx/.xlsx/.pptx all land here.
  { type: "zip", magic: [0x50, 0x4b, 0x03, 0x04] },
  { type: "zip", magic: [0x50, 0x4b, 0x05, 0x06] }, // empty archive
  { type: "zip", magic: [0x50, 0x4b, 0x07, 0x08] }, // spanned archive
  // Legacy Office (.doc/.xls/.ppt) is an OLE compound file.
  { type: "ole", magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { type: "rtf", magic: [0x7b, 0x5c, 0x72, 0x74, 0x66] }, // {\rtf
];

function startsWith(bytes: Uint8Array, magic: number[], offset = 0): boolean {
  if (bytes.length < offset + magic.length) return false;
  return magic.every((byte, i) => bytes[offset + i] === byte);
}

/**
 * Whether a buffer looks like plain text.
 *
 * Text formats have no signature, so they are recognised by absence: no NUL
 * bytes and no stray control characters in the opening kilobyte. A UTF-16 file
 * fails this on its NULs, which is the intended answer — the extractors this
 * feeds read UTF-8.
 */
function looksTextual(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 1024));
  if (sample.length === 0) return false;

  for (const byte of sample) {
    if (byte === 0x00) return false;
    // Tab, newline and carriage return are the only control codes text uses.
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) return false;
  }
  return true;
}

/** What a file's leading bytes say it is, or null if nothing matched. */
export function detectType(bytes: Uint8Array): DetectedType | null {
  for (const signature of SIGNATURES) {
    if (!startsWith(bytes, signature.magic, signature.offset ?? 0)) continue;
    if (signature.also && !startsWith(bytes, signature.also.magic, signature.also.offset)) continue;
    return signature.type;
  }
  return looksTextual(bytes) ? "text" : null;
}

/**
 * The content types an extension is allowed to hold.
 *
 * Deliberately a whitelist per extension rather than a general "is this file
 * safe" question. A .docx must be a ZIP; a .png must be a PNG. An extension
 * missing from this map is not uploadable at all.
 */
const ALLOWED_CONTENT: Record<string, DetectedType[]> = {
  // Images. SVG is absent on purpose: it is an XML document that executes
  // script, and it was being served from the application's own origin.
  ".jpg": ["jpeg"],
  ".jpeg": ["jpeg"],
  ".png": ["png"],
  ".gif": ["gif"],
  ".webp": ["webp"],
  ".bmp": ["bmp"],

  // Documents.
  ".pdf": ["pdf"],
  ".docx": ["zip"],
  ".xlsx": ["zip"],
  ".pptx": ["zip"],
  ".doc": ["ole"],
  ".xls": ["ole"],
  ".ppt": ["ole"],
  ".rtf": ["rtf", "text"],
  ".txt": ["text"],
  ".csv": ["text"],
  ".md": ["text"],
};

export interface ContentCheck {
  ok: boolean;
  detected: DetectedType | null;
  /** Why it was rejected, phrased for the person who uploaded it. */
  reason?: string;
}

/** Does this file's content match the extension it arrived under? */
export function contentMatchesExtension(extension: string, bytes: Uint8Array): ContentCheck {
  const allowed = ALLOWED_CONTENT[extension];
  if (!allowed) {
    return { ok: false, detected: null, reason: `File type ${extension} is not allowed` };
  }

  const detected = detectType(bytes);
  if (detected === null) {
    return {
      ok: false,
      detected,
      reason: `This file's contents are not a readable ${extension.slice(1).toUpperCase()} file`,
    };
  }

  if (!allowed.includes(detected)) {
    return {
      ok: false,
      detected,
      reason: `This file is named ${extension} but its contents are ${detected.toUpperCase()}`,
    };
  }

  return { ok: true, detected };
}

/** Extensions this module will accept, for building an upload form's filter. */
export const KNOWN_EXTENSIONS = Object.keys(ALLOWED_CONTENT);
