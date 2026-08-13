"use client";

import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

export function Navbar() {
  const { currentView, navigateTo } = useNavigationStore();
  const userName = useUserStore((s) => s.currentUserId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  /** Get initials from user name for avatar */
  const getInitials = (name: string) => {
    if (name.includes("_")) {
      // Extract initials from "user_demo_001" format
      const parts = name.split("_");
      return parts
        .filter((p) => !/^\d+$/.test(p) && p.length > 0)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
    }
    return name.slice(0, 2).toUpperCase();
  };

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
        <nav className="md:hidden border-t border-border/60 bg-card/95 backdrop-blur-lg px-4 py-3 space-y-1" aria-label="Mobile navigation">
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
