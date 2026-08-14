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
      include: {
        course: {
          select: { id: true, title: true },
        },
      },
    });

    if (!section) {
      return NextResponse.json(
        { success: false, error: 'Section not found' },
        { status: 404 }
      );
    }

    // Parse slide content from JSON string
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
      order: section.order,
      totalPages: section.totalPages,
      createdAt: section.createdAt,
      updatedAt: section.updatedAt,
      course: section.course,
    };

    return NextResponse.json({ success: true, data: formattedSection });
  } catch (error) {
    console.error('Error fetching section:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch section' },
      { status: 500 }
    );
  }
}
