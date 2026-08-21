import { NextRequest, NextResponse } from "next/server";
import { requireUser, AuthorizationError } from "@/lib/session";
import { writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

const COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"]);

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

function getExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
}

export async function POST(req: NextRequest) {
  try {
    // Writing files to the server needs a signed-in user; this endpoint was
    // open to anyone who could reach it.
    try {
      await requireUser();
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
        { success: false, error: `File type ${ext} is not allowed` },
        { status: 400 },
      );
    }

    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: `File is too large (max ${maxSize / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    const subDir = type === "cover" ? "covers" : "docs";
    const uniqueName = `${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, subDir, uniqueName);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    const url = `/uploads/${subDir}/${uniqueName}`;

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
        size: file.size,
        type: file.type || "application/octet-stream",
      },
    });
  } catch (err) {
    console.error("[upload] Error:", err);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }
}
