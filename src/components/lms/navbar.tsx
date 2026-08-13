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
  Bell,
  CheckCheck,
  Sparkles,
  BookMarked,
  Trophy,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
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
  { label: "My Learning", icon: <GraduationCap className="h-4 w-4" />, view: "my-learning" },
  { label: "Profile", icon: <User className="h-4 w-4" />, view: "profile" },
];

/** Get human-readable label for any view including detail views */
function getViewLabel(view: ViewName): string {
  switch (view) {
    case "home": return "Home";
    case "courses": return "Courses";
    case "my-learning": return "My Learning";
    case "profile": return "Profile";
    case "course-detail": return "Course Details";
    case "classroom": return "Classroom";
    case "create-course": return "Create Course";
    default: return "";
  }
}

/** Notification item shape */
interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "achievement" | "course" | "system" | "reminder";
  read: boolean;
  createdAt: string;
}

/** Generate mock notifications (internal MVP) */
function getMockNotifications(): NotificationItem[] {
  const now = new Date();
  return [
    {
      id: "n1",
      title: "New Course Available",
      message: "Advanced TypeScript Patterns has been published. Check it out!",
      type: "course",
      read: false,
      createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    },
    {
      id: "n2",
      title: "Achievement Unlocked!",
      message: "You completed your first course. Keep up the great work!",
      type: "achievement",
      read: false,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "n3",
      title: "Weekly Reminder",
      message: "You haven't started a course this week. Keep your learning streak going!",
      type: "reminder",
      read: false,
      createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "n4",
      title: "Course Updated",
      message: "React Fundamentals has new content in Chapter 3.",
      type: "course",
      read: true,
      createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "n5",
      title: "System Update",
      message: "OpenClass v1.0 is now live with new features and improvements.",
      type: "system",
      read: true,
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];
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

/** Notification type icon */
function NotificationIcon({ type }: { type: NotificationItem["type"] }) {
  switch (type) {
    case "achievement":
      return <Trophy className="h-4 w-4 text-amber-500" />;
    case "course":
      return <BookMarked className="h-4 w-4 text-primary" />;
    case "reminder":
      return <Sparkles className="h-4 w-4 text-cyan-500" />;
    case "system":
      return <Bell className="h-4 w-4 text-muted-foreground" />;
  }
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

/** Notification group with date header */
function NotificationGroup({
  label,
  items,
  onMarkRead,
}: {
  label: string;
  items: NotificationItem[];
  onMarkRead: (id: string) => void;
}) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      {items.map((notif) => (
        <button
          key={notif.id}
          type="button"
          onClick={() => onMarkRead(notif.id)}
          className={cn(
            "group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
            notif.read
              ? "hover:bg-muted/50"
              : "bg-primary/5 hover:bg-primary/8"
          )}
        >
          <div className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            notif.read
              ? "bg-muted/60"
              : "bg-primary/10"
          )}>
            <NotificationIcon type={notif.type} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className={cn(
                "text-sm leading-snug",
                notif.read
                  ? "text-muted-foreground font-medium"
                  : "text-foreground font-semibold"
              )}>
                {notif.title}
              </p>
              {!notif.read && (
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {notif.message}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              {formatRelativeTime(notif.createdAt)}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

export function Navbar() {
  const { currentView, navigateTo } = useNavigationStore();
  const userName = useUserStore((s) => s.currentUserId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Search bar state
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notification state (initialized with mock data)
  const [notifications, setNotifications] = useState<NotificationItem[]>(getMockNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);
  const [badgeKey, setBadgeKey] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  // Breadcrumb: derive current page label
  const currentPageLabel = getViewLabel(currentView);

  // Close mobile menu and search on view change
  useEffect(() => {
    // Intentional: reset UI state when user navigates to a different page
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
      if (searchInputRef.current && !searchInputRef.current.parentElement?.contains(e.target as Node)) {
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

  /** Mark a single notification as read */
  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  /** Mark all notifications as read */
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const groupedNotifications = groupNotificationsByDate(notifications);

  // Bounce badge when unread count changes
  const prevUnreadRef = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount !== prevUnreadRef.current) {
      // Trigger badge re-render with new key for bounce animation
      const handleBadgeUpdate = () => {
        setBadgeKey((k) => k + 1);
      };
      handleBadgeUpdate();
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

  /** Format user id to display name */
  const displayName = userName.includes("_")
    ? userName.split("_").filter((p) => !/^\d+$/.test(p) && p.length > 0).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
    : userName.charAt(0).toUpperCase() + userName.slice(1);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      navigateTo("home");
    }
    if (e.key === "Escape") {
      setSearchExpanded(false);
    }
  }, [navigateTo]);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 frosted-glass glass-card">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + Breadcrumb */}
        <div className="flex flex-col gap-0">
          <button
            type="button"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            onClick={() => navigateTo("home")}
            aria-label="Go to homepage"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:inline gradient-text">
              OpenClass
            </span>
          </button>
          {/* Breadcrumb: subtle page indicator */}
          {currentView !== "home" && (
            <span className={cn(
              "text-[10px] font-medium leading-none tracking-wide uppercase",
              "text-muted-foreground/60 sm:hidden"
            )}>
              {currentPageLabel}
            </span>
          )}
          {currentView !== "home" && (
            <span className={cn(
              "hidden sm:block text-[10px] font-medium leading-none tracking-wide",
              "text-muted-foreground/50 pl-10"
            )}>
              {currentPageLabel}
            </span>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              size="sm"
              onClick={() => navigateTo(item.view)}
              className={cn(
                "gap-2 rounded-lg transition-all duration-200 hover-lift",
                currentView === item.view
                  ? "bg-primary/10 text-primary font-medium shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
          <div className="relative hidden sm:flex items-center">
            <div
              className={cn(
                "flex items-center rounded-lg border border-border/60 bg-muted/40 transition-all duration-300 overflow-hidden",
                searchExpanded ? "w-56 h-9" : "w-9 h-9"
              )}
            >
              <button
                type="button"
                onClick={handleSearchClick}
                className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
              {searchExpanded && (
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search courses..."
                  className="h-full flex-1 bg-transparent px-0 pr-3 text-sm outline-none placeholder:text-muted-foreground/50"
                  onKeyDown={handleSearchKeyDown}
                />
              )}
            </div>
          </div>

          {/* Mobile search button */}
          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden h-9 w-9 rounded-lg"
            onClick={handleSearchClick}
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Dark Mode Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-lg"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
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
                    unreadCount > 0 && "badge-glow"
                  )}
                  onClick={toggleNotifications}
                  aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                >
                  <Bell className={cn("h-4 w-4 transition-colors", bellAnimating && "bell-ring")} />
                  {unreadCount > 0 && (
                    <span
                      key={badgeKey}
                      className="badge-bounce absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm"
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
              <div className="panel-slide-in absolute right-0 top-full mt-2 w-80 rounded-xl border border-border/60 bg-card shadow-xl sm:w-96">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
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
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No notifications</p>
                      </div>
                    ) : (
                      <>
                        {groupedNotifications.today.length > 0 && (
                          <NotificationGroup label="Today" items={groupedNotifications.today} onMarkRead={markAsRead} />
                        )}
                        {groupedNotifications.yesterday.length > 0 && (
                          <NotificationGroup label="Yesterday" items={groupedNotifications.yesterday} onMarkRead={markAsRead} />
                        )}
                        {groupedNotifications.earlier.length > 0 && (
                          <NotificationGroup label="Earlier" items={groupedNotifications.earlier} onMarkRead={markAsRead} />
                        )}
                      </>
                    )}
                  </div>
                </ScrollArea>
                <Separator />
                {/* Footer */}
                <div className="px-4 py-2.5">
                  <button
                    type="button"
                    className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    onClick={() => {
                      setShowNotifications(false);
                    }}
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Create Course Button */}
          <Button
            size="sm"
            className="hidden sm:flex gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-sm transition-all duration-200 hover:shadow-md press-effect"
            onClick={() => navigateTo("create-course")}
          >
            <PlusCircle className="h-4 w-4" />
            Create Course
          </Button>

          {/* User Avatar with Online Status Indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => navigateTo("profile")}
                aria-label="User profile"
              >
                <span className="relative">
                  <Avatar className="h-7 w-7 border-2 border-primary/20">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {getInitials(userName)}
                    </AvatarFallback>
                  </Avatar>
                  <span
                    className="pulse-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500"
                    aria-hidden="true"
                  />
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online &middot; Profile
              </span>
            </TooltipContent>
          </Tooltip>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 rounded-lg"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      {mobileMenuOpen && (
        <nav className="md:hidden border-t border-border/60 bg-card/95 backdrop-blur-lg px-4 py-3 space-y-1 slide-in-left" aria-label="Mobile navigation">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 rounded-lg h-11",
                currentView === item.view
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground"
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
          {/* Gradient Create Course CTA */}
          <div className="pt-2 border-t border-border/60 mt-2">
            <Button
              size="sm"
              className="w-full gap-2 rounded-lg text-white font-semibold shadow-md transition-all duration-200 hover:shadow-lg bg-gradient-to-r from-primary to-primary/70 hover:from-primary/90 hover:to-primary/60"
              onClick={() => {
                navigateTo("create-course");
                setMobileMenuOpen(false);
              }}
            >
              <PlusCircle className="h-4 w-4" />
              Create Course
            </Button>
          </div>
          {/* User Info Section at Bottom */}
          <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5 mt-2">
            <span className="relative">
              <Avatar className="h-9 w-9 border-2 border-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <span
                className="pulse-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500"
                aria-hidden="true"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{userName.replace(/_/g, ".")}@openclass.com</p>
            </div>
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>
        </nav>
      )}
    </header>
  );
}
