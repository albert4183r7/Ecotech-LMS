"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Info, CheckCircle2, AlertTriangle, X } from "lucide-react";

const STORAGE_PREFIX = "openclass_dismissed_ann_";

type BannerType = "info" | "success" | "warning";

interface Announcement {
  id: string;
  type: BannerType;
  message: string;
}

const announcements: Announcement[] = [
  {
    id: "new-courses-q4",
    type: "info",
    message:
      "🎉 12 new courses added this quarter! Explore the latest in AI, Leadership, and Data Science.",
  },
  {
    id: "streak-milestone",
    type: "success",
    message:
      "🏆 Congratulations to our top learners! Over 500 course completions this month.",
  },
  {
    id: "maintenance-window",
    type: "warning",
    message:
      "📅 Scheduled maintenance on Saturday 2:00–4:00 AM UTC. Save your progress before then.",
  },
];

const typeConfig: Record<
  BannerType,
  {
    icon: React.ReactNode;
    bgClass: string;
    borderClass: string;
    iconClass: string;
    textClass: string;
  }
> = {
  info: {
    icon: <Info className="w-4 h-4" />,
    bgClass: "bg-[oklch(0.95_0.03_200)]",
    borderClass: "border-[oklch(0.75_0.06_200)]",
    iconClass: "text-[oklch(0.50_0.15_230)]",
    textClass: "text-[oklch(0.30_0.05_230)]",
  },
  success: {
    icon: <CheckCircle2 className="w-4 h-4" />,
    bgClass: "bg-[oklch(0.95_0.03_155)]",
    borderClass: "border-[oklch(0.75_0.08_155)]",
    iconClass: "text-[oklch(0.52_0.14_155)]",
    textClass: "text-[oklch(0.30_0.06_155)]",
  },
  warning: {
    icon: <AlertTriangle className="w-4 h-4" />,
    bgClass: "bg-[oklch(0.97_0.04_85)]",
    borderClass: "border-[oklch(0.80_0.10_85)]",
    iconClass: "text-[oklch(0.65_0.18_65)]",
    textClass: "text-[oklch(0.35_0.08_65)]",
  },
};

const darkTypeConfig: Record<
  BannerType,
  {
    bgClass: string;
    borderClass: string;
    iconClass: string;
    textClass: string;
  }
> = {
  info: {
    bgClass: "dark:bg-[oklch(0.22_0.03_230)]",
    borderClass: "dark:border-[oklch(0.35_0.06_230)]",
    iconClass: "dark:text-[oklch(0.65_0.12_210)]",
    textClass: "dark:text-[oklch(0.85_0.02_210)]",
  },
  success: {
    bgClass: "dark:bg-[oklch(0.22_0.03_160)]",
    borderClass: "dark:border-[oklch(0.35_0.06_160)]",
    iconClass: "dark:text-[oklch(0.65_0.12_160)]",
    textClass: "dark:text-[oklch(0.85_0.02_160)]",
  },
  warning: {
    bgClass: "dark:bg-[oklch(0.22_0.04_75)]",
    borderClass: "dark:border-[oklch(0.35_0.06_75)]",
    iconClass: "dark:text-[oklch(0.70_0.15_75)]",
    textClass: "dark:text-[oklch(0.85_0.03_75)]",
  },
};

export function AnnouncementBanner() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Determine which announcement to show based on rotation
  const currentAnnouncement = announcements[currentIndex];
  const config = typeConfig[currentAnnouncement.type];
  const darkConfig = darkTypeConfig[currentAnnouncement.type];

  // Get dismissed set from localStorage
  const getDismissed = useCallback((): Set<string> => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}set`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }, []);

  // Find the next non-dismissed announcement
  const findNextAvailable = useCallback((): number => {
    const dismissed = getDismissed();
    for (let i = 0; i < announcements.length; i++) {
      if (!dismissed.has(announcements[i].id)) return i;
    }
    return -1;
  }, [getDismissed]);

  useEffect(() => {
    const idx = findNextAvailable();
    if (idx >= 0) {
      // Use a single async callback to set both index and visibility
      const timer = setTimeout(() => {
        setCurrentIndex(idx);
        setVisible(true);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [findNextAvailable]);

  const handleDismiss = useCallback(() => {
    setDismissing(true);
    // Wait for slide-up animation to finish
    setTimeout(() => {
      // Mark as dismissed
      const dismissed = getDismissed();
      dismissed.add(announcements[currentIndex].id);
      localStorage.setItem(
        `${STORAGE_PREFIX}set`,
        JSON.stringify([...dismissed])
      );

      // Try to show the next one
      const nextIdx = findNextAvailable();
      if (nextIdx >= 0) {
        setCurrentIndex(nextIdx);
        setDismissing(false);
      } else {
        setVisible(false);
        setDismissing(false);
      }
    }, 350);
  }, [currentIndex, getDismissed, findNextAvailable]);

  if (!mounted || !visible) return null;

  const animClass = dismissing
    ? "announcement-slide-up"
    : "announcement-slide-down";

  return (
    <div
      className={`px-4 pt-0 ${animClass}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          "relative flex items-center gap-3 rounded-lg border px-4 py-3",
          config.bgClass,
          config.borderClass,
          darkConfig.bgClass,
          darkConfig.borderClass,
        ].join(" ")}
      >
        {/* Icon */}
        <div
          className={["flex-shrink-0", config.iconClass, darkConfig.iconClass].join(
            " "
          )}
        >
          {config.icon}
        </div>

        {/* Message */}
        <p
          className={[
            "flex-1 text-sm leading-relaxed",
            config.textClass,
            darkConfig.textClass,
          ].join(" ")}
        >
          {currentAnnouncement.message}
        </p>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className={[
            "flex-shrink-0 p-1 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/5",
            config.iconClass,
            darkConfig.iconClass,
          ].join(" ")}
          aria-label="Dismiss announcement"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
