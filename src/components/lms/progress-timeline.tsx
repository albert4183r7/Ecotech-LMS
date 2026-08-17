"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Play,
  CheckCircle2,
  Flag,
  Trophy,
  Clock,
  ChevronRight,
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SectionItem, ClassroomState } from "@/types/lms";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SectionTimelineData {
  sectionId: string;
  sectionTitle: string;
  order: number;
  status: "not-started" | "in-progress" | "completed";
  currentPage: number;
  totalPages: number;
  progressPct: number;
  lastAccessedAt: string | null;
  lastAccessedDaysAgo: number | null;
  timeEstimateMinutes: number;
}

interface Milestone {
  type: "first-access" | "first-completed" | "halfway" | "course-completed";
  label: string;
  date: string | null;
  icon: string;
}

interface TimelineData {
  courseId: string;
  courseTitle: string;
  userId: string;
  overallProgress: number;
  totalSections: number;
  completedSections: number;
  sections: SectionTimelineData[];
  milestones: Milestone[];
  totalTimeEstimateMinutes: number;
}

interface ProgressTimelineProps {
  courseId: string;
  courseTitle: string;
  userId: string;
  isEnrolled: boolean;
  sections: SectionItem[];
  openClassroom: (state: ClassroomState) => void;
  course: {
    id: string;
    title: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Milestone Icon                                                     */
/* ------------------------------------------------------------------ */

function MilestoneIcon({ type }: { type: Milestone["type"] }) {
  switch (type) {
    case "first-access":
      return <Play className="h-3.5 w-3.5" />;
    case "first-completed":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "halfway":
      return <Flag className="h-3.5 w-3.5" />;
    case "course-completed":
      return <Trophy className="h-3.5 w-3.5" />;
    default:
      return <CheckCircle2 className="h-3.5 w-3.5" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Progress Timeline Component                                        */
/* ------------------------------------------------------------------ */

export function ProgressTimeline({
  courseId,
  courseTitle,
  userId,
  isEnrolled,
  sections,
  openClassroom,
  course,
}: ProgressTimelineProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    if (!isEnrolled) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/progress-timeline?userId=${userId}&courseId=${courseId}`
      );
      const json = await res.json();
      if (json.success) {
        setData(json.data);
      } else if (res.status === 404) {
        // Not enrolled — don't show error, just empty
        setLoading(false);
        return;
      } else {
        setError(json.error || "Failed to load timeline");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [userId, courseId, isEnrolled]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  // Handle section click → open classroom
  const handleSectionClick = async (section: SectionItem) => {
    try {
      const res = await fetch(`/api/sections/${section.id}`);
      if (!res.ok) return;
      const json = await res.json();
      const htmlBody = json.success && json.data.htmlBody
        ? json.data.htmlBody
        : '<div class="flex items-center justify-center h-full"><p class="text-gray-500">No content available.</p></div>';
      const allSectionIds = sections.map((s) => s.id);
      const currentSectionIndex = allSectionIds.indexOf(section.id);
      const classroomState: ClassroomState = {
        courseId: course.id,
        courseTitle: course.title,
        sectionId: section.id,
        sectionTitle: section.title,
        htmlBody,
        allSectionIds,
        currentSectionIndex,
      };
      openClassroom(classroomState);
    } catch {
      // Silently fail
    }
  };

  // If not enrolled, don't render
  if (!isEnrolled) return null;

  // Loading state
  if (loading) {
    return (
      <Card className="glass-card content-reveal border-border/50">
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-2 w-full mt-2 rounded-full" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error || !data) return null;

  const totalMinutes = data.totalTimeEstimateMinutes;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeStr =
    hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  // Find the first in-progress or first not-started section for CTA
  const continueSection = data.sections.find(
    (s) => s.status === "in-progress"
  );
  const nextSection = data.sections.find(
    (s) => s.status === "not-started"
  );
  const ctaSection =
    continueSection ||
    nextSection ||
    (data.sections.length > 0 ? data.sections[0] : null);

  const ctaSectionItem = ctaSection
    ? sections.find((s) => s.id === ctaSection.sectionId)
    : null;

  return (
    <Card className="glass-card content-reveal border-border/50 overflow-hidden">
      {/* ─── Timeline Header ─── */}
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base gradient-text">
          <Flag className="h-4 w-4" />
          Learning Progress
        </CardTitle>
        <div className="mt-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-muted-foreground">
              {data.completedSections} of {data.totalSections} sections
            </span>
            <span className="text-xs font-bold text-foreground">
              {data.overallProgress}%
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out",
                data.overallProgress === 100
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-primary to-teal-500"
              )}
              style={{ width: `${data.overallProgress}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* ─── Timeline Items ─── */}
        <div className="relative">
          {/* Vertical line */}
          {data.sections.length > 1 && (
            <div className="absolute left-[15px] top-3 bottom-3 w-0.5 bg-border/60" />
          )}

          <div className="space-y-1">
            {data.sections.map((section, index) => {
              const sectionItem = sections.find(
                (s) => s.id === section.sectionId
              );

              const isLast = index === data.sections.length - 1;

              // Circle node styles based on status
              const nodeClass =
                section.status === "completed"
                  ? "bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-500/30"
                  : section.status === "in-progress"
                    ? "bg-amber-500 text-white border-amber-500 shadow-sm shadow-amber-500/30 animate-pulse"
                    : "bg-muted text-muted-foreground border-muted-foreground/30";

              const statusBadge =
                section.status === "completed" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] px-1.5 py-0">
                    Completed
                  </Badge>
                ) : section.status === "in-progress" ? (
                  <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0">
                    In Progress
                  </Badge>
                ) : null;

              // Time ago text
              const timeAgoText =
                section.lastAccessedDaysAgo !== null
                  ? section.lastAccessedDaysAgo === 0
                    ? "Today"
                    : section.lastAccessedDaysAgo === 1
                      ? "Yesterday"
                      : `${section.lastAccessedDaysAgo} days ago`
                  : null;

              return (
                <button
                  key={section.sectionId}
                  className={cn(
                    "group relative flex items-start gap-3.5 w-full text-left rounded-lg p-2.5 -mx-2.5 transition-colors hover:bg-muted/50",
                    isLast && "mb-0"
                  )}
                  onClick={() => {
                    if (sectionItem) handleSectionClick(sectionItem);
                  }}
                  disabled={!sectionItem}
                >
                  {/* Circle Node */}
                  <div
                    className={cn(
                      "relative z-10 mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      nodeClass
                    )}
                  >
                    {section.status === "completed" ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : section.status === "in-progress" ? (
                      <Play className="h-3 w-3 ml-0.5" />
                    ) : (
                      <span className="text-[10px] font-bold">
                        {index + 1}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {section.sectionTitle}
                      </span>
                      {statusBadge}
                    </div>

                    {/* Mini progress bar */}
                    {section.status !== "not-started" && (
                      <div className="flex items-center gap-2 mb-1">
                        <div className="flex-1 relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700 ease-out",
                              section.status === "completed"
                                ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                : "bg-gradient-to-r from-amber-400 to-amber-500"
                            )}
                            style={{ width: `${section.progressPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {section.currentPage}/{section.totalPages}
                        </span>
                      </div>
                    )}

                    {/* Last accessed & time estimate */}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      {timeAgoText && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last accessed: {timeAgoText}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        ~{section.timeEstimateMinutes} min
                      </span>
                    </div>
                  </div>

                  {/* Chevron */}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors mt-1" />
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── Milestones Section ─── */}
        {data.milestones.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border/50">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Learning Milestones
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.milestones.map((milestone) => {
                const iconBgClass =
                  milestone.type === "first-access"
                    ? "bg-teal-500/10 text-teal-600 dark:text-teal-400"
                    : milestone.type === "first-completed"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : milestone.type === "halfway"
                        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400";

                return (
                  <div
                    key={milestone.type}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 p-2 stat-pop",
                      !milestone.date && "opacity-40"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        iconBgClass
                      )}
                    >
                      <MilestoneIcon type={milestone.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground leading-tight">
                        {milestone.label}
                      </p>
                      {milestone.date && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {milestone.date}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Summary Footer ─── */}
        <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>~{timeStr} total</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {data.completedSections}/{data.totalSections} completed
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{data.totalSections} sections</span>
            </span>
          </div>

          {ctaSection && ctaSectionItem && data.overallProgress < 100 && (
            <Button
              size="sm"
              className={cn(
                "gap-1.5 font-semibold",
                continueSection
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
              onClick={() => handleSectionClick(ctaSectionItem)}
            >
              {continueSection ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {continueSection ? "Continue Learning" : "Start Next"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
