import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

// ============================================
// GET /api/notifications?userId=xxx
// Returns all notifications for a user, ordered by createdAt desc, paginated (limit 20)
// ============================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    // Notifications are personal, so the list is the caller's own whatever
    // the query string says.
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
    let actingUserId: string;
    try {
      actingUserId = (await requireUser()).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const body = await request.json();
    const { title, message, type, link } = body;
    const userId = actingUserId;

    if (!title || !message) {
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
    let actingUserId: string;
    try {
      actingUserId = (await requireUser()).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const body = await request.json();
    const { notificationId, readAll } = body;
    const userId = actingUserId;

    // Mark all as read
    if (readAll) {
      const result = await db.notification.updateMany({
        where: { userId, read: false },
        data: { read: true },
      });
      return NextResponse.json({ updated: result.count });
    }

    // Mark single notification as read
    if (notificationId && body.read !== undefined) {
      // Scoped by userId as well as id, so marking someone else's
      // notification read matches nothing rather than succeeding.
      const result = await db.notification.updateMany({
        where: { id: notificationId, userId },
        data: { read: body.read },
      });
      if (result.count === 0) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 });
      }
      return NextResponse.json({ updated: result.count });
    }

    return NextResponse.json(
      { error: "Invalid request. Provide { notificationId, read } or { readAll: true }" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}
