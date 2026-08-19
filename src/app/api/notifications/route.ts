import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// GET /api/notifications?userId=xxx
// Returns all notifications for a user, ordered by createdAt desc, paginated (limit 20)
// ============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// ============================================
// POST /api/notifications
// Create a new notification
// Body: { userId, title, message, type?, link? }
// ============================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, title, message, type, link } = body;

    if (!userId || !title || !message) {
      return NextResponse.json(
        { error: "userId, title, and message are required" },
        { status: 400 },
      );
    }

    const notification = await db.notification.create({
      data: {
        userId,
        title,
        message,
        type: type || "info",
        link: link || null,
      },
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error("Error creating notification:", error);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

// ============================================
// PUT /api/notifications
// Mark a notification as read, or mark all as read
// Body: { notificationId, read: true } — mark single
// Body: { userId, readAll: true } — mark all
// ============================================
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId, userId, readAll } = body;

    // Mark all as read
    if (readAll && userId) {
      const result = await db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ updated: result.count });
    }

    // Mark single notification as read
    if (notificationId && body.read !== undefined) {
      const notification = await db.notification.update({
        where: { id: notificationId },
        data: { read: body.read },
      });
      return NextResponse.json({ notification });
    }

    return NextResponse.json(
      { error: "Invalid request. Provide { notificationId, read } or { userId, readAll: true }" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}
