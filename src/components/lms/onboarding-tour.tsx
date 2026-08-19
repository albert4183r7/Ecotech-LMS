"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  BookOpen,
  BookMarked,
  UserCircle,
  Presentation,
  ClipboardCheck,
  StickyNote,
  BarChart3,
  Rocket,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const STORAGE_KEY = "ecotech_onboarding_done";

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
}

const tourSteps: TourStep[] = [
  {
    title: "Welcome to Ecotech!",
    description:
      "Your personalized learning platform is ready. Discover courses, track your progress, and achieve your professional goals — all in one place.",
    icon: <GraduationCap className="h-20 w-20" />,
    gradient: "from-[oklch(0.55_0.18_250)] via-[oklch(0.50_0.15_200)] to-[oklch(0.55_0.16_175)]",
  },
  {
    title: "Explore Your Workspace",
    description: "Navigate through powerful features designed for your learning journey.",
    icon: <BookOpen className="h-14 w-14" />,
    gradient: "from-[oklch(0.50_0.15_200)] via-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.14_165)]",
  },
  {
    title: "Interactive Classrooms",
    description:
      "Engage with rich course content including slides, quizzes, notes, and detailed progress tracking.",
    icon: <Presentation className="h-14 w-14" />,
    gradient: "from-[oklch(0.55_0.16_175)] via-[oklch(0.50_0.14_165)] to-[oklch(0.45_0.18_250)]",
  },
  {
    title: "You're All Set!",
    description:
      "Start exploring courses and build your skills today. Your learning adventure begins now.",
    icon: <Rocket className="h-14 w-14" />,
    gradient: "from-[oklch(0.45_0.18_250)] via-[oklch(0.55_0.18_250)] to-[oklch(0.50_0.15_200)]",
  },
];

const featureItems = [
  { icon: <BookOpen className="h-5 w-5" />, label: "Courses", desc: "Browse & enroll" },
  {
    icon: <BookMarked className="h-5 w-5" />,
    label: "My Learning",
    desc: "Track progress",
  },
  { icon: <UserCircle className="h-5 w-5" />, label: "Profile", desc: "View achievements" },
];

const classroomItems = [
  { icon: <Presentation className="h-5 w-5" />, label: "Slides" },
  { icon: <ClipboardCheck className="h-5 w-5" />, label: "Quizzes" },
  { icon: <StickyNote className="h-5 w-5" />, label: "Notes" },
  { icon: <BarChart3 className="h-5 w-5" />, label: "Progress" },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      const timer = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleComplete = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    setOpen(false);
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setDirection("next");
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, handleComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection("prev");
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      if (!newOpen) {
        handleComplete();
      }
    },
    [handleComplete],
  );

  if (!mounted) return null;

  const step = tourSteps[currentStep];
  const isLast = currentStep === tourSteps.length - 1;
  const isFirst = currentStep === 0;
  const animClass = direction === "next" ? "onboarding-slide-next" : "onboarding-slide-prev";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-hidden border-0 p-0 shadow-2xl sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Gradient background layer */}
        <div className={`relative bg-gradient-to-br ${step.gradient} rounded-xl p-[1px]`}>
          <div className="bg-background overflow-hidden rounded-xl">
            {/* Header with gradient accent */}
            <div
              className={`relative bg-gradient-to-br ${step.gradient} overflow-hidden px-6 pt-8 pb-6 text-center`}
            >
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-black/10 blur-xl" />

              {/* Icon */}
              <div className="onboarding-scale-in relative mx-auto mb-4">
                <div className="inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-white shadow-lg backdrop-blur-sm">
                  {step.icon}
                </div>
              </div>

              {/* Title */}
              <DialogTitle className="onboarding-fade-in relative text-2xl font-bold tracking-tight text-white">
                {step.title}
              </DialogTitle>

              {/* Sparkles decoration for first step */}
              {isFirst && (
                <>
                  <Sparkles className="absolute top-4 left-6 h-5 w-5 animate-pulse text-white/40" />
                  <Sparkles className="absolute top-8 right-8 h-4 w-4 animate-pulse text-white/30 [animation-delay:0.5s]" />
                </>
              )}
            </div>

            {/* Body content area */}
            <div className="p-6">
              <div key={currentStep} className={`${animClass} onboarding-step-content`}>
                <DialogDescription className="text-muted-foreground mb-6 text-center text-sm leading-relaxed">
                  {step.description}
                </DialogDescription>

                {/* Step-specific content */}
                {currentStep === 0 && (
                  <div className="flex justify-center gap-3">
                    {featureItems.map((item) => (
                      <div
                        key={item.label}
                        className="glass-card hover-lift max-w-[120px] flex-1 cursor-default rounded-xl p-4 text-center"
                      >
                        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.55_0.18_250_/0.1)] text-[oklch(0.50_0.18_250)]">
                          {item.icon}
                        </div>
                        <p className="text-foreground text-sm font-semibold">{item.label}</p>
                        <p className="text-muted-foreground mt-0.5 text-xs">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="space-y-3">
                    {featureItems.map((item, i) => (
                      <div
                        key={item.label}
                        className="bg-muted/50 hover:bg-muted/80 flex items-center gap-4 rounded-xl p-3 transition-colors"
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white shadow-md">
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-foreground text-sm font-semibold">{item.label}</p>
                          <p className="text-muted-foreground text-xs">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="grid grid-cols-2 gap-3">
                    {classroomItems.map((item) => (
                      <div
                        key={item.label}
                        className="glass-card hover-lift flex cursor-default items-center gap-3 rounded-xl p-4"
                      >
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.14_165)] text-white shadow-md">
                          {item.icon}
                        </div>
                        <span className="text-foreground text-sm font-medium">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="text-center">
                    <div className="glow-pulse mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white shadow-lg">
                      <Rocket className="h-8 w-8" />
                    </div>
                    <p className="text-muted-foreground mx-auto max-w-xs text-sm">
                      Dive into our curated courses and start building skills that matter to your
                      career.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer: Dots + Buttons */}
              <div className="mt-6 flex items-center justify-between">
                {/* Skip / Back button */}
                <div>
                  {!isFirst ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handlePrev}
                      className="text-muted-foreground hover:text-foreground gap-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSkip}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Skip
                    </Button>
                  )}
                </div>

                {/* Dot indicators */}
                <div className="slide-progress-indicator">
                  {tourSteps.map((_, i) => (
                    <span
                      key={i}
                      className={`dot ${
                        i === currentStep ? "active" : i < currentStep ? "completed" : ""
                      }`}
                    />
                  ))}
                </div>

                {/* Next / CTA button */}
                <div>
                  <Button
                    size="sm"
                    onClick={handleNext}
                    className={
                      isLast
                        ? "glow-pulse gap-1.5 bg-gradient-to-r from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white hover:shadow-lg"
                        : "gap-1.5"
                    }
                  >
                    {isLast ? "Start Learning" : "Next"}
                    {!isLast && <ChevronRight className="h-4 w-4" />}
                    {isLast && <Rocket className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
