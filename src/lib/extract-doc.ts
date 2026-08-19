/**
 * Document text extraction utility.
 * Supports: PDF, DOCX, PPTX, TXT, CSV, XLSX, MD, RTF
 *
 * For binary formats (PDF, DOCX, PPTX, XLSX) it uses dedicated parsers.
 * For plain-text formats it reads the file directly.
 * For unsupported binary formats (DOC, PPT, RTF) it returns a best-effort
 * text extraction or an empty string with a warning.
 */

import { readFile } from 'fs/promises';
import path from 'path';

// ---- PDF ------------------------------------------------------------------

async function extractPdfText(filePath: string): Promise<string> {
  // Dynamic import because pdf-parse uses Node-specific APIs
  const pdfParse = (await import('pdf-parse')).default;
  const buffer = await readFile(filePath);
  const data = await pdfParse(buffer);
  return data.text || '';
}

// ---- DOCX -----------------------------------------------------------------

async function extractDocxText(filePath: string): Promise<string> {
  const mammoth = await import('mammoth');
  const buffer = await readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value || '';
}

// ---- PPTX -----------------------------------------------------------------

async function extractPptxText(filePath: string): Promise<string> {
  // PPTX is a ZIP of XML files. We extract text from slide XMLs.
  // Use JSZip to unzip, then regex-extract text content.
  const JSZip = (await import('jszip')).default;
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const texts: string[] = [];

  // Slide XMLs are in ppt/slides/slideN.xml
  const slideFiles = Object.keys(zip.files).filter(
    (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)
  );

  // Sort by slide number
  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0', 10);
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0', 10);
    return numA - numB;
  });

  for (const file of slideFiles) {
    const xml = await zip.files[file].async('string');
    // Extract text between <a:t> tags (OOXML text elements)
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
    if (matches) {
      const slideText = matches
        .map((m) => m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, ''))
        .filter((t) => t.trim())
        .join(' ');
      if (slideText) texts.push(slideText);
    }
  }

  return texts.join('\n\n');
}

// ---- XLSX -----------------------------------------------------------------

async function extractXlsxText(filePath: string): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const buffer = await readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const texts: string[] = [];

  // Sheet XMLs are in xl/worksheets/sheetN.xml
  const sheetFiles = Object.keys(zip.files).filter(
    (f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)
  );

  for (const file of sheetFiles) {
    const xml = await zip.files[file].async('string');
    const matches = xml.match(/<v>([^<]*)<\/v>/g);
    if (matches) {
      const cellTexts = matches
        .map((m) => m.replace(/<v>/, '').replace(/<\/v>/, ''))
        .filter((t) => t.trim() && !/^\d+$/.test(t)); // skip pure numbers
      if (cellTexts.length > 0) texts.push(cellTexts.join(' '));
    }
  }

  return texts.join('\n');
}

// ---- Plain text (TXT, CSV, MD) ----------------------------------------------

async function extractPlainText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  // Try UTF-8 first, fall back to latin1
  let text = buffer.toString('utf-8');
  // If text has replacement characters, it might be wrong encoding
  if (text.includes('\ufffd')) {
    text = buffer.toString('latin1');
  }
  return text;
}

// ---- RTF (basic) -----------------------------------------------------------

async function extractRtfText(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  let text = buffer.toString('utf-8');
  // Strip RTF control words and braces, keep readable text
  // This is a basic extraction — full RTF parsing is complex
  text = text.replace(/\\[a-z]+\d* ?/gi, ' ');
  text = text.replace(/[{}]/g, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

// ---- Public API ------------------------------------------------------------

export type SupportedDocType =
  | 'pdf'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'txt'
  | 'csv'
  | 'md'
  | 'rtf';

const EXTENSION_MAP: Record<string, SupportedDocType> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.txt': 'txt',
  '.csv': 'csv',
  '.md': 'md',
  '.rtf': 'rtf',
};

const EXTRACTORS: Record<SupportedDocType, (filePath: string) => Promise<string>> = {
  pdf: extractPdfText,
  docx: extractDocxText,
  pptx: extractPptxText,
  xlsx: extractXlsxText,
  txt: extractPlainText,
  csv: extractPlainText,
  md: extractPlainText,
  rtf: extractRtfText,
};

/**
 * Extract text from a document file.
 * Returns the extracted text content, or empty string with a logged warning for unsupported formats.
 */
export async function extractTextFromFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const docType = EXTENSION_MAP[ext];

  if (!docType || !EXTRACTORS[docType]) {
    console.warn(
      `[extract-doc] Unsupported file type: ${ext}. Supported: ${Object.keys(EXTENSION_MAP).join(', ')}`
    );
    // For old .doc and .ppt, try plain text as best-effort
    if (ext === '.doc' || ext === '.ppt') {
      try {
        return await extractPlainText(filePath);
      } catch {
        return '';
      }
    }
    return '';
  }

  try {
    const text = await EXTRACTORS[docType](filePath);
    return text.trim();
  } catch (error) {
    console.error(`[extract-doc] Failed to extract text from ${filePath}:`, error);
    return '';
  }
}

/**
 * Extract text from multiple document files and return a combined string.
 * Each document's content is prefixed with a header identifying its source.
 */
export async function extractTextFromFiles(
  filePaths: string[]
): Promise<{ text: string; sources: { file: string; charCount: number }[] }> {
  const sources: { file: string; charCount: number }[] = [];
  const parts: string[] = [];

  for (const filePath of filePaths) {
    const text = await extractTextFromFile(filePath);
    if (text.length > 0) {
      const fileName = path.basename(filePath);
      sources.push({ file: fileName, charCount: text.length });
      parts.push(`--- Document: ${fileName} ---\n${text}`);
    }
  }

  return {
    text: parts.join('\n\n'),
    sources,
  };
}

/**
 * Select the most relevant portions of text for a given topic.
 * Uses a deterministic keyword-scoring approach — no vector DB needed.
 *
 * Strategy:
 * 1. Split text into paragraphs
 * 2. Build a set of topic keywords (split on whitespace/punctuation, lowercased)
 * 3. Score each paragraph by counting keyword matches
 * 4. Always include the first paragraph (likely an intro/overview)
 * 5. Select top-scoring paragraphs up to the budget
 * 6. If budget remains after selecting relevant paragraphs, include
 *    the next-highest-scoring or next-sequential paragraphs
 */
export function selectRelevantSections(
  text: string,
  topic: string,
  maxChars: number,
): string {
  if (text.length <= maxChars) return text;

  // Split into segments: try double newlines first, then single newlines, then sentences
  let segments = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // If no paragraph breaks found, split by single newlines
  if (segments.length <= 1) {
    segments = text
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  // If still one big block, split by sentences (period, question mark, exclamation)
  if (segments.length <= 1 && text.length > maxChars) {
    segments = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10);
  }

  if (segments.length === 0) return text.slice(0, maxChars);

  // Use segments as paragraphs
  const paragraphs = segments;

  // Build topic keywords
  const topicKeywords = new Set(
    topic
      .toLowerCase()
      .split(/[\s,;.!?/()\[\]{}"':]+/)
      .filter((w) => w.length > 2),
  );

  // Score each paragraph
  const scored = paragraphs.map((para, index) => {
    const lower = para.toLowerCase();
    let score = 0;
    for (const keyword of topicKeywords) {
      // Count occurrences of each keyword in the paragraph
      const regex = new RegExp(escapeRegex(keyword), 'gi');
      const matches = lower.match(regex);
      if (matches) score += matches.length;
    }
    // Small bonus for being near the beginning (first paragraphs often set context)
    if (index === 0 && score > 0) score += 0.3;
    return { para, index, score };
  });

  // Sort by score descending, then by original index ascending (tie-breaker)
  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);

  // Select paragraphs greedily up to budget
  const selected = new Set<number>();
  let totalChars = 0;

  for (const item of ranked) {
    if (totalChars + item.para.length > maxChars) {
      // Check if a smaller paragraph still fits
      if (item.para.length <= maxChars - totalChars) {
        selected.add(item.index);
        totalChars += item.para.length;
      }
      continue;
    }
    selected.add(item.index);
    totalChars += item.para.length;
  }

  // Always ensure at least the first paragraph is included (if it wasn't already)
  if (!selected.has(0) && paragraphs[0].length <= maxChars) {
    selected.add(0);
  }

  // Return paragraphs in original order
  const result = paragraphs
    .filter((_, i) => selected.has(i))
    .join('\n\n');

  // Final safety: if still over budget, hard-truncate
  if (result.length > maxChars) {
    return result.slice(0, maxChars) + '\n\n[... content truncated for length ...]';
  }

  return result;
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Smart context selection: uses relevance-based selection when topic is provided,
 * falls back to head+tail truncation when no topic is available.
 */
export function truncateTextForContext(
  text: string,
  maxChars: number,
  topic?: string,
): string {
  if (text.length <= maxChars) return text;

  if (topic && topic.trim().length > 0) {
    return selectRelevantSections(text, topic, maxChars);
  }

  // Fallback: keep first 70% and last 30%
  const headLen = Math.floor(maxChars * 0.7);
  const tailLen = maxChars - headLen;
  return (
    text.slice(0, headLen) +
    '\n\n[... content truncated for length ...]\n\n' +
    text.slice(-tailLen)
  );
}
