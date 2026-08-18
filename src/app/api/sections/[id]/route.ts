import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const section = await db.section.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        content: true,
        htmlBody: true,
        order: true,
        totalPages: true,
        createdAt: true,
        updatedAt: true,
        courseId: true,
      },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found' },
        { status: 404 },
      );
    }

    // Parse legacy slide content from JSON string
    let parsedContent = null;
    if (section.content) {
      try {
        parsedContent = JSON.parse(section.content);
      } catch {
        parsedContent = section.content;
      }
    }

    const formattedSection = {
      id: section.id,
      title: section.title,
      content: parsedContent,
      htmlBody: section.htmlBody,
      order: section.order,
      totalPages: section.totalPages,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      courseId: section.courseId,
    };

    return NextResponse.json({ success: true, data: formattedSection });
  } catch (error) {
    console.error('Error fetching section:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch section' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { htmlBody, title, order } = body;

    const section = await db.section.findUnique({ where: { id } });
    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found' },
        { status: 404 },
      );
    }

    const updated = await db.section.update({
      where: { id },
      data: {
        ...(htmlBody !== undefined && { htmlBody }),
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating section:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update section' },
      { status: 500 },
    );
  }
}
