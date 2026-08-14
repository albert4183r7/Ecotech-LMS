"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
    icon: <GraduationCap className="w-20 h-20" />,
    gradient:
      "from-[oklch(0.55_0.18_250)] via-[oklch(0.50_0.15_200)] to-[oklch(0.55_0.16_175)]",
  },
  {
    title: "Explore Your Workspace",
    description: "Navigate through powerful features designed for your learning journey.",
    icon: <BookOpen className="w-14 h-14" />,
    gradient:
      "from-[oklch(0.50_0.15_200)] via-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.14_165)]",
  },
  {
    title: "Interactive Classrooms",
    description: "Engage with rich course content including slides, quizzes, notes, and detailed progress tracking.",
    icon: <Presentation className="w-14 h-14" />,
    gradient:
      "from-[oklch(0.55_0.16_175)] via-[oklch(0.50_0.14_165)] to-[oklch(0.45_0.18_250)]",
  },
  {
    title: "You're All Set!",
    description:
      "Start exploring courses and build your skills today. Your learning adventure begins now.",
    icon: <Rocket className="w-14 h-14" />,
    gradient:
      "from-[oklch(0.45_0.18_250)] via-[oklch(0.55_0.18_250)] to-[oklch(0.50_0.15_200)]",
  },
];

const featureItems = [
  { icon: <BookOpen className="w-5 h-5" />, label: "Courses", desc: "Browse & enroll" },
  {
    icon: <BookMarked className="w-5 h-5" />,
    label: "My Learning",
    desc: "Track progress",
  },
  { icon: <UserCircle className="w-5 h-5" />, label: "Profile", desc: "View achievements" },
];

const classroomItems = [
  { icon: <Presentation className="w-5 h-5" />, label: "Slides" },
  { icon: <ClipboardCheck className="w-5 h-5" />, label: "Quizzes" },
  { icon: <StickyNote className="w-5 h-5" />, label: "Notes" },
  { icon: <BarChart3 className="w-5 h-5" />, label: "Progress" },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
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
    [handleComplete]
  );

  if (!mounted) return null;

  const step = tourSteps[currentStep];
  const isLast = currentStep === tourSteps.length - 1;
  const isFirst = currentStep === 0;
  const animClass = direction === "next" ? "onboarding-slide-next" : "onboarding-slide-prev";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-lg p-0 overflow-hidden border-0 shadow-2xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Gradient background layer */}
        <div
          className={`relative bg-gradient-to-br ${step.gradient} p-[1px] rounded-xl`}
        >
          <div className="rounded-xl overflow-hidden bg-background">
            {/* Header with gradient accent */}
            <div
              className={`relative bg-gradient-to-br ${step.gradient} px-6 pt-8 pb-6 text-center overflow-hidden`}
            >
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-black/10 blur-xl" />

              {/* Icon */}
              <div className="onboarding-scale-in relative mx-auto mb-4">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-white/20 backdrop-blur-sm text-white shadow-lg">
                  {step.icon}
                </div>
              </div>

              {/* Title */}
              <DialogTitle className="onboarding-fade-in relative text-2xl font-bold text-white tracking-tight">
                {step.title}
              </DialogTitle>

              {/* Sparkles decoration for first step */}
              {isFirst && (
                <>
                  <Sparkles className="absolute top-4 left-6 w-5 h-5 text-white/40 animate-pulse" />
                  <Sparkles className="absolute top-8 right-8 w-4 h-4 text-white/30 animate-pulse [animation-delay:0.5s]" />
                </>
              )}
            </div>

            {/* Body content area */}
            <div className="p-6">
              <div key={currentStep} className={`${animClass} onboarding-step-content`}>
                <DialogDescription className="text-muted-foreground text-center text-sm leading-relaxed mb-6">
                  {step.description}
                </DialogDescription>

                {/* Step-specific content */}
                {currentStep === 0 && (
                  <div className="flex justify-center gap-3">
                    {featureItems.map((item) => (
                      <div
                        key={item.label}
                        className="glass-card rounded-xl p-4 text-center flex-1 max-w-[120px] hover-lift cursor-default"
                      >
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[oklch(0.55_0.18_250_/0.1)] text-[oklch(0.50_0.18_250)] mb-2">
                          {item.icon}
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {currentStep === 1 && (
                  <div className="space-y-3">
                    {featureItems.map((item, i) => (
                      <div
                        key={item.label}
                        className="flex items-center gap-4 p-3 rounded-xl bg-muted/50 hover:bg-muted/80 transition-colors"
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white flex items-center justify-center shadow-md">
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {item.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.desc}
                          </p>
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
                        className="glass-card rounded-xl p-4 flex items-center gap-3 hover-lift cursor-default"
                      >
                        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.14_165)] text-white flex items-center justify-center shadow-md">
                          {item.icon}
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {currentStep === 3 && (
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white mb-4 shadow-lg glow-pulse">
                      <Rocket className="w-8 h-8" />
                    </div>
                    <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                      Dive into our curated courses and start building skills that
                      matter to your career.
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
                      <ChevronLeft className="w-4 h-4" />
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
                        i === currentStep
                          ? "active"
                          : i < currentStep
                            ? "completed"
                            : ""
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
                        ? "bg-gradient-to-r from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white hover:shadow-lg gap-1.5 glow-pulse"
                        : "gap-1.5"
                    }
                  >
                    {isLast ? "Start Learning" : "Next"}
                    {!isLast && <ChevronRight className="w-4 h-4" />}
                    {isLast && <Rocket className="w-4 h-4" />}
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
