import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

/**
 * POST /api/upload
 * Upload a file (cover image or document) to public/uploads/
 * 
 * Body: FormData with file field
 * Query: ?type=cover | ?type=doc
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const type = req.nextUrl.searchParams.get("type") || "cover";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    const ALLOWED_DOC_TYPES = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/markdown",
      "application/rtf",
    ];

    if (type === "cover") {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: "Invalid image type. Supported: JPEG, PNG, WebP, GIF, SVG" },
          { status: 400 }
        );
      }
      // Max 5MB for cover
      if (file.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: "Image must be under 5MB" },
          { status: 400 }
        );
      }
    } else if (type === "doc") {
      if (!ALLOWED_DOC_TYPES.includes(file.type)) {
        return NextResponse.json(
          { success: false, error: "Unsupported document format" },
          { status: 400 }
        );
      }
      // Max 20MB for docs
      if (file.size > 20 * 1024 * 1024) {
        return NextResponse.json(
          { success: false, error: "Document must be under 20MB" },
          { status: 400 }
        );
      }
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique filename preserving extension
    const ext = file.name.split(".").pop() || "bin";
    const uniqueName = `${randomUUID()}.${ext}`;
    const subDir = type === "cover" ? "covers" : "docs";
    const filePath = join(process.cwd(), "public", "uploads", subDir, uniqueName);

    // Ensure directory exists
    await mkdir(join(process.cwd(), "public", "uploads", subDir), { recursive: true });
    await writeFile(filePath, buffer);

    const url = `/uploads/${subDir}/${uniqueName}`;

    return NextResponse.json({
      success: true,
      data: {
        url,
        name: file.name,
        size: file.size,
        type: file.type,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
