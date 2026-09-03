import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthorizationError } from "@/lib/session";
import { contentMatchesExtension } from "@/lib/file-type";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

// ============================================
// POST /api/upload
//
// Uploads land under public/, which Next serves as static files from the
// application's own origin. That makes what is accepted here a question about
// the application's security, not about disk space: a file served from your
// own origin runs with your users' session behind it.
//
// Three rules follow from that.
//
// SVG is not an image for this purpose. It is an XML document that can carry
// script, and it was accepted as a cover. Opening one would run its script on
// this origin, as whoever opened it. It is gone from the list.
//
// The extension is a claim, not evidence. Every upload's leading bytes are now
// read and required to match the extension it arrived under, so a file cannot
// be one thing and be named another.
//
// Raster covers are re-encoded rather than stored as received. Decoding and
// re-writing an image drops everything that is not pixels — metadata, trailing
// data appended after the image ends, a payload smuggled in a comment block —
// and a file that cannot be decoded is not an image at all.
// ============================================

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Raster formats only. SVG is deliberately absent — see the header. */
const COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

const DOC_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".xls",
  ".xlsx",
  ".md",
  ".rtf",
]);

const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_DOC_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Ceiling on a re-encoded cover's dimensions.
 *
 * A 5 MB file can still decode to an image large enough to exhaust memory when
 * it is processed, so the limit that matters is pixels, not bytes.
 */
const MAX_COVER_DIMENSION = 4000;

/**
 * The extension, taken from the file's base name only.
 *
 * path.basename first, so a name carrying separators cannot contribute a
 * directory to what is read as the extension.
 */
function getExt(filename: string): string {
  const base = path.basename(filename);
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx).toLowerCase() : "";
}

/**
 * Re-encode a cover image, returning the bytes to store and the extension to
 * store them under.
 *
 * Animated GIFs keep their frames; everything else becomes a WebP, which is
 * smaller at the same quality and, more to the point, is written by this
 * process rather than accepted from the caller.
 *
 * Returns Uint8Array rather than Buffer: sharp's buffers are not tied to a
 * plain ArrayBuffer, and writeFile takes either.
 */
async function reencodeCover(
  bytes: Buffer,
  extension: string,
): Promise<{ data: Uint8Array; extension: string }> {
  const image = sharp(bytes, { animated: extension === ".gif", failOn: "error" });

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("not a decodable image");
  }

  const resized = image.resize({
    width: MAX_COVER_DIMENSION,
    height: MAX_COVER_DIMENSION,
    fit: "inside",
    // Only shrink. Enlarging a small cover would waste bytes and quality.
    withoutEnlargement: true,
  });

  if (extension === ".gif") {
    return { data: await resized.gif().toBuffer(), extension: ".gif" };
  }
  return { data: await resized.webp({ quality: 82 }).toBuffer(), extension: ".webp" };
}

export async function POST(req: NextRequest) {
  try {
    // Writing files to the server needs a signed-in user; this endpoint was
    // open to anyone who could reach it.
    let userId: string;
    try {
      userId = (await requireUser()).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const type = req.nextUrl.searchParams.get("type");
    if (type !== "cover" && type !== "doc") {
      return NextResponse.json(
        { success: false, error: "Invalid upload type. Use ?type=cover or ?type=doc" },
        { status: 400 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }

    const ext = getExt(file.name);
    const maxSize = type === "cover" ? MAX_COVER_SIZE : MAX_DOC_SIZE;
    const allowed = type === "cover" ? COVER_EXTENSIONS : DOC_EXTENSIONS;

    if (!allowed.has(ext)) {
      return NextResponse.json(
        {
          success: false,
          error:
            ext === ".svg"
              ? "SVG covers are not accepted, because an SVG can carry scripts. Upload a PNG, JPEG or WebP."
              : `File type ${ext} is not allowed`,
        },
        { status: 400 },
      );
    }

    // Checked before the bytes are read, so an oversized upload is refused
    // without being pulled into memory first.
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: `File is too large (max ${maxSize / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    const received = Buffer.from(await file.arrayBuffer());

    // The extension said what this is; the bytes have to agree.
    const check = contentMatchesExtension(ext, received);
    if (!check.ok) {
      console.warn(
        `[upload] rejected "${file.name}": ${check.reason} (detected: ${check.detected ?? "unrecognised"})`,
      );
      return NextResponse.json({ success: false, error: check.reason }, { status: 400 });
    }

    let data: Uint8Array = received;
    let storedExt = ext;

    if (type === "cover") {
      try {
        const encoded = await reencodeCover(received, ext);
        data = encoded.data;
        storedExt = encoded.extension;
      } catch (error) {
        console.warn(
          `[upload] cover "${file.name}" could not be decoded:`,
          error instanceof Error ? error.message : error,
        );
        return NextResponse.json(
          { success: false, error: "This image could not be read. Try a different file." },
          { status: 400 },
        );
      }
    }

    const subDir = type === "cover" ? "covers" : "docs";
    // The stored name is generated, never derived from what was uploaded, so
    // nothing the caller chose reaches the filesystem.
    const uniqueName = `${randomUUID()}${storedExt}`;
    // Ownership is encoded in the directory, so a later reference request can
    // prove the document belongs to the signed-in instructor without trusting
    // an arbitrary public path from the client.
    const ownedDir = path.join(UPLOAD_DIR, subDir, userId);
    await mkdir(ownedDir, { recursive: true });
    const filePath = path.join(ownedDir, uniqueName);

    await writeFile(filePath, data);

    const url = `/uploads/${subDir}/${userId}/${uniqueName}`;

    if (type === "cover") {
      return NextResponse.json({
        success: true,
        data: { url },
      });
    }

    // doc upload
    return NextResponse.json({
      success: true,
      data: {
        name: file.name,
        url,
        size: data.length,
        type: file.type || "application/octet-stream",
      },
    });
  } catch (err) {
    console.error("[upload] Error:", err);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
