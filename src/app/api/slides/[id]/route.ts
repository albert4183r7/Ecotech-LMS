import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============================================
// PUT /api/slides/[id] — Update a single slide
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, order, htmlBody, status } = body;

    const slide = await db.slide.findUnique({ where: { id } });
    if (!slide) {
      return NextResponse.json(
        { success: false, error: "Slide not found" },
        { status: 404 }
      );
    }

    const updated = await db.slide.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
        ...(htmlBody !== undefined && { htmlBody }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating slide:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update slide" },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE /api/slides/[id] — Delete a slide
// ============================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const slide = await db.slide.findUnique({ where: { id } });
    if (!slide) {
      return NextResponse.json(
        { success: false, error: "Slide not found" },
        { status: 404 }
      );
    }

    await db.slide.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("Error deleting slide:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete slide" },
      { status: 500 }
    );
  }
}
