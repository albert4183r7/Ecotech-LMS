"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  GraduationCap,
  Home,
  BookOpen,
  User,
  PlusCircle,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  Bell,
  CheckCheck,
  Info,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Settings,
  Search,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { ViewName } from "@/types/lms";
import { useTheme } from "next-themes";

/** Navigation link configuration */
interface NavItem {
  label: string;
  icon: React.ReactNode;
  view: ViewName;
}

/** Main navigation items */
const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: <Home className="h-4 w-4" />, view: "home" },
  { label: "Courses", icon: <BookOpen className="h-4 w-4" />, view: "courses" },
  { label: "Learning Progress", icon: <GraduationCap className="h-4 w-4" />, view: "my-learning" },
  { label: "Profile", icon: <User className="h-4 w-4" />, view: "profile" },
  { label: "Settings", icon: <Settings className="h-4 w-4" />, view: "settings" },
];

/** Get human-readable label for any view including detail views */
function getViewLabel(view: ViewName): string {
  switch (view) {
    case "auth":
      return "";
    case "home":
      return "Home";
    case "courses":
      return "Courses";
    case "my-learning":
      return "Learning Progress";
    case "profile":
      return "Profile";
    case "course-detail":
      return "Course Details";
    case "classroom":
      return "Classroom";
    case "create-course":
      return "Create Course";
    case "dashboard":
      return "Dashboard";
    case "settings":
      return "Settings";
    default:
      return "";
  }
}

/** Notification item shape (from API) */
interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  link: string | null;
  createdAt: string;
}

/** Notification type → icon + color mapping */
function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case "info":
      return <Info className="h-4 w-4 text-blue-500" />;
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    case "course":
      return <BookOpen className="h-4 w-4 text-teal-500" />;
    case "system":
      return <Settings className="h-4 w-4 text-gray-500" />;
    case "achievement":
      return <Trophy className="h-4 w-4 text-amber-500" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

/** Notification type → icon bg color mapping */
function NotificationIconBg({ type, read }: { type: string; read: boolean }) {
  const base = read ? "bg-muted/60" : "bg-primary/10";
  const colorMap: Record<string, string> = {
    info: read ? "bg-blue-500/10" : "bg-blue-500/15",
    success: read ? "bg-emerald-500/10" : "bg-emerald-500/15",
    warning: read ? "bg-amber-500/10" : "bg-amber-500/15",
    course: read ? "bg-teal-500/10" : "bg-teal-500/15",
    system: read ? "bg-gray-500/10" : "bg-gray-500/15",
    achievement: read ? "bg-amber-500/10" : "bg-amber-500/15",
  };
  return colorMap[type] || base;
}

/** Notification type → left border accent color */
function NotificationBorderAccent({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    info: "border-l-blue-500",
    success: "border-l-emerald-500",
    warning: "border-l-amber-500",
    course: "border-l-teal-500",
    system: "border-l-gray-400",
    achievement: "border-l-amber-500",
  };
  return colorMap[type] || "border-l-blue-500";
}

/** Format relative time for notifications */
function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Group notifications by date category: Today, Yesterday, Earlier */
function groupNotificationsByDate(items: NotificationItem[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const today: NotificationItem[] = [];
  const yesterday: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];

  for (const item of items) {
    const t = new Date(item.createdAt).getTime();
    if (t >= todayStart) today.push(item);
    else if (t >= yesterdayStart) yesterday.push(item);
    else earlier.push(item);
  }

  return { today, yesterday, earlier };
}

/** Notification group with date header */
function NotificationGroup({
  label,
  items,
  onNotificationClick,
}: {
  label: string;
  items: NotificationItem[];
  onNotificationClick: (notif: NotificationItem) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <p className="text-muted-foreground/60 px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </p>
      {items.map((notif) => (
        <button
          key={notif.id}
          type="button"
          onClick={() => onNotificationClick(notif)}
          className={cn(
            "group notif-appear flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
            notif.read ? "hover:bg-muted/50" : "bg-primary/5 hover:bg-primary/8",
          )}
        >
          {/* Left border accent for unread */}
          {!notif.read && (
            <div
              className={cn(
                "absolute top-3 bottom-3 left-1 w-0.5 rounded-full",
                NotificationBorderAccent({ type: notif.type }),
              )}
              style={{ position: "absolute" }}
            />
          )}
          <div
            className={cn(
              "relative mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              NotificationIconBg({ type: notif.type, read: notif.read }),
            )}
          >
            <NotificationIcon type={notif.type} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={cn(
                  "text-sm leading-snug",
                  notif.read
                    ? "text-muted-foreground font-medium"
                    : "text-foreground font-semibold",
                )}
              >
                {notif.title}
              </p>
              {!notif.read && <div className="bg-primary mt-1.5 h-2 w-2 shrink-0 rounded-full" />}
            </div>
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs leading-relaxed">
              {notif.message}
            </p>
            <p className="text-muted-foreground/60 mt-1 text-[10px]">
              {formatRelativeTime(notif.createdAt)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Skeleton loader for notifications */
function NotificationSkeleton() {
  return (
    <div className="space-y-1 p-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Parse link string into view + id for navigation */
function parseNotificationLink(link: string | null): { view: ViewName; courseId?: string } | null {
  if (!link) return null;
  if (link === "profile") return { view: "profile" };
  if (link.startsWith("course-detail:")) {
    const courseId = link.replace("course-detail:", "");
    return { view: "course-detail", courseId };
  }
  return null;
}

export function Navbar() {
  const { currentView, navigateTo, openCourseDetail } = useNavigationStore();
  const { currentUserId, currentRole, isAuthenticated, logout } = useUserStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // Search bar state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);
  const [badgeKey, setBadgeKey] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const notifRef = useRef<HTMLDivElement>(null);

  // Theme toggle state for cycling animation
  const [themeIconRotating, setThemeIconRotating] = useState(false);

  // Breadcrumb: derive current page label
  const currentPageLabel = getViewLabel(currentView);

  // ============================================
  // Fetch notifications from API
  // ============================================
  useEffect(() => {
    let cancelled = false;
    async function fetchNotifications() {
      setNotificationsLoading(true);
      try {
        const res = await fetch(`/api/notifications?userId=${encodeURIComponent(currentUserId)}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (!cancelled) {
          setNotifications(data.notifications || []);
        }
      } catch {
        // Silently fail — notifications will just be empty
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    }
    fetchNotifications();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // Close mobile menu and search on view change
  useEffect(() => {
    const handleViewCleanup = () => {
      setMobileMenuOpen(false);
      setSearchExpanded(false);
    };
    handleViewCleanup();
  }, [currentView]);

  // Collapse search when clicking outside
  useEffect(() => {
    if (!searchExpanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        searchInputRef.current &&
        !searchInputRef.current.parentElement?.contains(e.target as Node)
      ) {
        setSearchExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchExpanded]);

  // Close notification panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showNotifications]);

  /** Toggle notification panel */
  const toggleNotifications = useCallback(() => {
    if (!showNotifications) {
      setBellAnimating(true);
      setTimeout(() => setBellAnimating(false), 600);
    }
    setShowNotifications((prev) => !prev);
  }, [showNotifications]);

  /** Mark a single notification as read via API */
  const handleMarkAsRead = useCallback(
    async (notif: NotificationItem) => {
      // Navigate if link is present
      const parsed = parseNotificationLink(notif.link);
      if (parsed) {
        if (parsed.courseId) {
          openCourseDetail(parsed.courseId);
        } else {
          navigateTo(parsed.view);
        }
        setShowNotifications(false);
      }

      // Mark as read in API
      if (!notif.read) {
        try {
          await fetch("/api/notifications", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId: notif.id, read: true }),
          });
          setNotifications((prev) =>
            prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
          );
        } catch {
          // Silently fail
        }
      }
    },
    [navigateTo, openCourseDetail],
  );

  /** Mark all notifications as read via API */
  const markAllAsRead = useCallback(async () => {
    try {
      await fetch("/api/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUserId, readAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // Silently fail
    }
  }, [currentUserId]);

  /** Handle "View All" — navigate to profile */
  const handleViewAll = useCallback(() => {
    setShowNotifications(false);
    navigateTo("profile");
  }, [navigateTo]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const groupedNotifications = notificationsLoading
    ? null
    : groupNotificationsByDate(notifications);

  // Bounce badge when unread count changes
  const prevUnreadRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount !== prevUnreadRef.current) {
      setBadgeKey((k) => k + 1);
      prevUnreadRef.current = unreadCount;
    }
  }, [unreadCount]);

  /** Handle search icon click: navigate to home on mobile, expand on desktop */
  const handleSearchClick = useCallback(() => {
    if (window.innerWidth < 768) {
      navigateTo("home");
      setMobileMenuOpen(false);
    } else {
      setSearchExpanded(true);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [navigateTo]);

  /** Get initials from user name for avatar */
  const getInitials = (name: string) => {
    if (name.includes("_")) {
      const parts = name.split("_");
      return parts
        .filter((p) => !/^\d+$/.test(p) && p.length > 0)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
    }
    return name.slice(0, 2).toUpperCase();
  };

  /** Role-aware display name */
  const displayNameMap: Record<string, string> = {
    user_instructor_001: "Dr. Sarah Chen",
    user_student_001: "Alex Johnson",
    user_student_002: "Maria Garcia",
  };
  const displayName =
    displayNameMap[currentUserId] ||
    (currentUserId.includes("_")
      ? currentUserId
          .split("_")
          .filter((p) => !/^\d+$/.test(p) && p.length > 0)
          .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
          .join(" ")
      : currentUserId.charAt(0).toUpperCase() + currentUserId.slice(1));

  /** Role-aware visible nav items */
  const dashboardItem: NavItem = {
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    view: "dashboard",
  };
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    // Instructors cannot access Learning Progress (my-learning)
    if (item.view === "my-learning" && currentRole === "instructor") return false;
    return true;
  }).concat(currentRole === "instructor" ? [dashboardItem] : []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigateTo("home");
      }
      if (e.key === "Escape") {
        setSearchExpanded(false);
      }
    },
    [navigateTo],
  );

  /** Cycle theme: light → dark → system → light */
  const cycleTheme = useCallback(() => {
    setThemeIconRotating(true);
    setTimeout(() => setThemeIconRotating(false), 300);
    const current = resolvedTheme || "light";
    if (current === "light") {
      setTheme("dark");
    } else if (current === "dark") {
      setTheme("system");
    } else {
      setTheme("light");
    }
  }, [resolvedTheme, setTheme]);

  /** Get theme tooltip text */
  const getThemeTooltip = () => {
    if (theme === "system") return "System";
    if (theme === "dark") return "Dark mode";
    return "Light mode";
  };

  /** Get theme icon based on current theme setting */
  const ThemeIcon = () => {
    const iconClass = cn(
      "h-4 w-4 transition-all duration-300",
      themeIconRotating && "rotate-180 scale-75",
    );
    if (theme === "system") return <Monitor className={iconClass} />;
    if (theme === "dark") return <Moon className={iconClass} />;
    return <Sun className={iconClass} />;
  };

  return (
    <header className="border-border/60 frosted-glass glass-card neon-glow sticky top-0 z-50 w-full border-b">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + Breadcrumb */}
        <div className="flex flex-col gap-0">
          <button
            type="button"
            className="flex items-center gap-2 transition-opacity hover:opacity-80"
            onClick={() => navigateTo("home")}
            aria-label="Go to homepage"
          >
            <img
              src="/ecotech-logo.png"
              alt="Ecotech"
              className="h-8 w-8 rounded-md object-contain"
            />
            <img
              src="/ecotech-name.png"
              alt="Ecotech"
              className="hidden h-6 w-auto object-contain sm:inline"
            />
          </button>
          {/* Breadcrumb: subtle page indicator */}
          {currentView !== "home" && (
            <span
              className={cn(
                "text-[10px] leading-none font-medium tracking-wide uppercase",
                "text-muted-foreground/60 sm:hidden",
              )}
            >
              {currentPageLabel}
            </span>
          )}
          {currentView !== "home" && (
            <span
              className={cn(
                "hidden text-[10px] leading-none font-medium tracking-wide sm:block",
                "text-muted-foreground/50 pl-10",
              )}
            >
              {currentPageLabel}
            </span>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {visibleNavItems.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              size="sm"
              onClick={() => navigateTo(item.view)}
              className={cn(
                "hover-lift gap-2 rounded-lg transition-all duration-200",
                currentView === item.view
                  ? "bg-primary/10 text-primary font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              {item.icon}
              <span className="hidden lg:inline">{item.label}</span>
            </Button>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-1.5">
          {/* Search Bar (desktop) */}
          <div className="relative hidden items-center sm:flex">
            <div
              className={cn(
                "border-border/60 bg-muted/40 flex items-center overflow-hidden rounded-lg border transition-all duration-300",
                searchExpanded ? "h-9 w-56" : "h-9 w-9",
              )}
            >
              <button
                type="button"
                onClick={handleSearchClick}
                className="text-muted-foreground hover:text-foreground flex h-9 w-9 shrink-0 items-center justify-center transition-colors"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {searchExpanded && (
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search courses..."
                  className="placeholder:text-muted-foreground/50 h-full flex-1 bg-transparent px-0 pr-3 text-sm outline-none"
                  onKeyDown={handleSearchKeyDown}
                />
              )}
            </div>
          </div>

          {/* Mobile search button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg sm:hidden"
            onClick={handleSearchClick}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Dark Mode Toggle — cycles Light → Dark → System */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={cycleTheme}
                aria-label={`Current: ${getThemeTooltip()}. Click to switch.`}
                suppressHydrationWarning
              >
                <ThemeIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="flex items-center gap-1.5">
                {getThemeTooltip()}
                <span className="text-muted-foreground/60 text-[10px]">(click to switch)</span>
              </span>
            </TooltipContent>
          </Tooltip>

          {/* Notification Bell */}
          <div className="relative" ref={notifRef}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "relative h-9 w-9 rounded-lg transition-all duration-300",
                    unreadCount > 0 && "badge-glow",
                  )}
                  onClick={toggleNotifications}
                  aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                >
                  <Bell className={cn("h-4 w-4 transition-colors", bellAnimating && "bell-ring")} />
                  {unreadCount > 0 && (
                    <span
                      key={badgeKey}
                      className="badge-bounce bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow-sm"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notifications</TooltipContent>
            </Tooltip>

            {/* Notification Panel Dropdown */}
            {showNotifications && (
              <div className="panel-slide-in border-border/60 bg-card absolute top-full right-0 mt-2 w-80 rounded-xl border shadow-xl sm:w-96">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-foreground text-sm font-semibold">Notifications</h3>
                    {!notificationsLoading && unreadCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 min-w-5 px-1.5 text-[10px] font-bold"
                      >
                        {unreadCount}
                      </Badge>
                    )}
                  </div>
                  {!notificationsLoading && unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium transition-colors"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Mark all read
                    </button>
                  )}
                </div>
                <Separator />
                {/* Notification List (grouped by date) */}
                <ScrollArea className="max-h-[360px]">
                  <div className="p-1">
                    {notificationsLoading ? (
                      <NotificationSkeleton />
                    ) : notifications.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <Bell className="text-muted-foreground/30 mb-2 h-8 w-8" />
                        <p className="text-muted-foreground text-sm">No notifications</p>
                      </div>
                    ) : (
                      groupedNotifications && (
                        <>
                          {groupedNotifications.today.length > 0 && (
                            <NotificationGroup
                              label="Today"
                              items={groupedNotifications.today}
                              onNotificationClick={handleMarkAsRead}
                            />
                          )}
                          {groupedNotifications.yesterday.length > 0 && (
                            <NotificationGroup
                              label="Yesterday"
                              items={groupedNotifications.yesterday}
                              onNotificationClick={handleMarkAsRead}
                            />
                          )}
                          {groupedNotifications.earlier.length > 0 && (
                            <NotificationGroup
                              label="Earlier"
                              items={groupedNotifications.earlier}
                              onNotificationClick={handleMarkAsRead}
                            />
                          )}
                        </>
                      )
                    )}
                  </div>
                </ScrollArea>
                <Separator />
                {/* Footer */}
                <div className="px-4 py-2.5">
                  <button
                    type="button"
                    className="text-primary hover:text-primary/80 w-full text-center text-xs font-medium transition-colors"
                    onClick={handleViewAll}
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Create Course Button - only for instructors */}
          {currentRole === "instructor" && (
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground press-effect hidden gap-2 rounded-lg shadow-sm transition-all duration-200 hover:shadow-md sm:flex"
              onClick={() => navigateTo("create-course")}
            >
              <PlusCircle className="h-4 w-4" />
              Create Course
            </Button>
          )}

          {/* User Avatar with Online Status Indicator + Role Badge */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative h-9 w-9 rounded-full"
                onClick={() => navigateTo("profile")}
                aria-label="User profile"
              >
                <span className="relative">
                  <Avatar className="border-primary/20 h-7 w-7 border-2">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold",
                        currentRole === "instructor"
                          ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      {getInitials(currentUserId)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="pulse-dot border-card absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-500"
                    aria-hidden="true"
                  />
                </span>
                {/* Tiny role indicator dot */}
                <span
                  className={cn(
                    "border-card absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full border",
                    currentRole === "instructor" ? "bg-violet-500" : "bg-emerald-500",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {displayName} &middot; {currentRole === "instructor" ? "Instructor" : "Student"}
              </span>
            </TooltipContent>
          </Tooltip>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-lg md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <nav
          className="border-border/60 bg-card/95 slide-in-left space-y-1 border-t px-4 py-3 backdrop-blur-lg md:hidden"
          aria-label="Mobile navigation"
        >
          {visibleNavItems.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              className={cn(
                "h-11 w-full justify-start gap-3 rounded-lg",
                currentView === item.view
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground",
              )}
              onClick={() => {
                navigateTo(item.view);
                setMobileMenuOpen(false);
              }}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
          {/* Gradient Create Course CTA - only for instructors */}
          {currentRole === "instructor" && (
            <div className="border-border/60 mt-2 border-t pt-2">
              <Button
                size="sm"
                className="from-primary to-primary/70 hover:from-primary/90 hover:to-primary/60 w-full gap-2 rounded-lg bg-gradient-to-r font-semibold text-white shadow-md transition-all duration-200 hover:shadow-lg"
                onClick={() => {
                  navigateTo("create-course");
                  setMobileMenuOpen(false);
                }}
              >
                <PlusCircle className="h-4 w-4" />
                Create Course
              </Button>
            </div>
          )}
          {/* User Info Section at Bottom */}
          <div className="bg-muted/40 mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5">
            <span className="relative">
              <Avatar className="border-primary/20 h-9 w-9 border-2">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {getInitials(currentUserId)}
                </AvatarFallback>
              </Avatar>
              <span
                className="pulse-dot border-card absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 bg-emerald-500"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-foreground truncate text-sm font-medium">{displayName}</p>
                <Badge
                  variant="outline"
                  className={cn(
                    "h-4 shrink-0 px-1.5 py-0 text-[9px] font-medium",
                    currentRole === "instructor"
                      ? "border-violet-500/50 text-violet-600 dark:text-violet-400"
                      : "border-emerald-500/50 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {currentRole === "instructor" ? "Instructor" : "Student"}
                </Badge>
              </div>
              <p className="text-muted-foreground truncate text-xs">
                {currentUserId.replace(/_/g, ".")}@ecotech.com
              </p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
          {/* Logout Button */}
          <button
            type="button"
            onClick={() => {
              logout();
              setMobileMenuOpen(false);
            }}
            className="text-destructive hover:bg-destructive/10 mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </nav>
      )}
    </header>
  );
}
