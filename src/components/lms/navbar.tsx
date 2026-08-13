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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { ViewName } from "@/types/lms";

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
  const user = useUserStore((s) => s.currentUserId);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight text-primary">
            OpenClass
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              size="sm"
              onClick={() => navigateTo(item.view)}
              className={cn(
                "gap-2 transition-colors",
                currentView === item.view
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="hidden sm:flex gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => navigateTo("create-course")}
          >
            <PlusCircle className="h-4 w-4" />
            Create Course
          </Button>

          {/* Mobile Menu Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
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
        <nav className="md:hidden border-t border-border bg-card px-4 py-2 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.view}
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
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
          <Button
            size="sm"
            className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground mt-2"
            onClick={() => {
              navigateTo("create-course");
              setMobileMenuOpen(false);
            }}
          >
            <PlusCircle className="h-4 w-4" />
            Create Course
          </Button>
        </nav>
      )}
    </header>
  );
}
