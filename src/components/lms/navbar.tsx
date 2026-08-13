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
  Check,
  CheckCheck,
  Sparkles,
  BookMarked,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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

export function Navbar() {
  const { currentView, navigateTo } = useNavigationStore();
  const userName = useUserStore((s) => s.currentUserId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  // Notification state (initialized with mock data)
  const [notifications, setNotifications] = useState<NotificationItem[]>(getMockNotifications);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bellAnimating, setBellAnimating] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-card/95 backdrop-blur-lg supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <button
          type="button"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          onClick={() => navigateTo("home")}
          aria-label="Go to homepage"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight text-primary hidden sm:inline">
            OpenClass
          </span>
        </button>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              size="sm"
              onClick={() => navigateTo(item.view)}
              className={cn(
                "gap-2 rounded-lg transition-all duration-200",
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
                  className="relative h-9 w-9 rounded-lg"
                  onClick={toggleNotifications}
                  aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                >
                  <Bell className={cn("h-4 w-4 transition-colors", bellAnimating && "bell-ring")} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground shadow-sm">
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
                {/* Notification List */}
                <ScrollArea className="max-h-[360px]">
                  <div className="p-1">
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">No notifications</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <button
                          key={notif.id}
                          type="button"
                          onClick={() => markAsRead(notif.id)}
                          className={cn(
                            "group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors",
                            notif.read
                              ? "hover:bg-muted/50"
                              : "bg-primary/5 hover:bg-primary/8"
                          )}
                        >
                          {/* Icon */}
                          <div className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                            notif.read
                              ? "bg-muted/60"
                              : "bg-primary/10"
                          )}>
                            <NotificationIcon type={notif.type} />
                          </div>
                          {/* Content */}
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
                      ))
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
            className="hidden sm:flex gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-sm transition-all duration-200 hover:shadow-md"
            onClick={() => navigateTo("create-course")}
          >
            <PlusCircle className="h-4 w-4" />
            Create Course
          </Button>

          {/* User Avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                onClick={() => navigateTo("profile")}
                aria-label="User profile"
              >
                <Avatar className="h-7 w-7 border-2 border-primary/20">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                    {getInitials(userName)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Profile</TooltipContent>
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
          <div className="pt-2 border-t border-border/60 mt-2">
            <Button
              size="sm"
              className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg"
              onClick={() => {
                navigateTo("create-course");
                setMobileMenuOpen(false);
              }}
            >
              <PlusCircle className="h-4 w-4" />
              Create Course
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
