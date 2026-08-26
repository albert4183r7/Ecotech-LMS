"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/stores/lms-store";
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
  Wand2,
  FileUp,
  Eye,
  Send,
  Users,
  MessageCircle,
} from "lucide-react";

// ============================================
// The welcome tour
//
// Two things were wrong with it. It told everyone the same story, so an
// instructor was walked through enrolling on courses and never shown how to
// make one. And "Retake tour" only cleared the flag it reads on mount, so
// nothing happened until the page was reloaded — which read as a dead button.
//
// The tour is data now: one list of steps per role, and an event anything can
// fire to start it again on the spot.
// ============================================

/** Fired by "Retake tour". The tour listens wherever it happens to be mounted. */
const START_EVENT = "ecotech:start-tour";

/** Start the tour immediately, from anywhere in the app. */
export function startTour(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_EVENT));
}

/** Seen-it flags are per role: the two tours are different tours. */
function storageKey(role: string): string {
  return `ecotech_onboarding_done_${role}`;
}

interface TourItem {
  icon: React.ReactNode;
  label: string;
  desc?: string;
}

interface TourStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  /** Cards shown under the description. */
  items?: TourItem[];
  /** Two columns rather than a row, for four short items. */
  grid?: boolean;
  /** The closing step, which gets the rocket instead of cards. */
  finale?: boolean;
}

const DEEP = "from-[oklch(0.55_0.18_250)] via-[oklch(0.50_0.15_200)] to-[oklch(0.55_0.16_175)]";
const MID = "from-[oklch(0.50_0.15_200)] via-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.14_165)]";
const TEAL = "from-[oklch(0.55_0.16_175)] via-[oklch(0.50_0.14_165)] to-[oklch(0.45_0.18_250)]";
const CLOSE = "from-[oklch(0.45_0.18_250)] via-[oklch(0.55_0.18_250)] to-[oklch(0.50_0.15_200)]";

const studentTour: TourStep[] = [
  {
    title: "Welcome to Ecotech!",
    description:
      "Your learning platform is ready. Find a course, work through its lessons, and see your progress as you go.",
    icon: <GraduationCap className="h-20 w-20" />,
    gradient: DEEP,
    items: [
      { icon: <BookOpen className="h-5 w-5" />, label: "Courses", desc: "Browse & enroll" },
      { icon: <BookMarked className="h-5 w-5" />, label: "My Learning", desc: "Track progress" },
      { icon: <UserCircle className="h-5 w-5" />, label: "Profile", desc: "Your account" },
    ],
  },
  {
    title: "Inside a lesson",
    description:
      "Every lesson is slides you move through at your own pace, with a quiz at the end and somewhere to keep notes.",
    icon: <Presentation className="h-14 w-14" />,
    gradient: MID,
    grid: true,
    items: [
      { icon: <Presentation className="h-5 w-5" />, label: "Slides" },
      { icon: <ClipboardCheck className="h-5 w-5" />, label: "Quiz" },
      { icon: <StickyNote className="h-5 w-5" />, label: "Notes" },
      { icon: <BarChart3 className="h-5 w-5" />, label: "Progress" },
    ],
  },
  {
    title: "Ask while you learn",
    description:
      "The study assistant sits beside the lesson and answers from that lesson only. Stuck on a slide? Ask it there, rather than looking elsewhere.",
    icon: <MessageCircle className="h-14 w-14" />,
    gradient: TEAL,
  },
  {
    title: "You're all set",
    description: "Pick a course and start. Your progress is saved as you go.",
    icon: <Rocket className="h-14 w-14" />,
    gradient: CLOSE,
    finale: true,
  },
];

const instructorTour: TourStep[] = [
  {
    title: "Welcome to Ecotech!",
    description:
      "This is where you build the training your team takes. A course holds lessons; each lesson is a deck and a quiz.",
    icon: <GraduationCap className="h-20 w-20" />,
    gradient: DEEP,
    items: [
      { icon: <Wand2 className="h-5 w-5" />, label: "Generate", desc: "Write it with AI" },
      { icon: <FileUp className="h-5 w-5" />, label: "Upload", desc: "Use your own deck" },
      { icon: <Users className="h-5 w-5" />, label: "Publish", desc: "Share with learners" },
    ],
  },
  {
    title: "Two ways to make a lesson",
    description:
      "Describe the subject and let the model plan and write it, or upload a .pptx you already have and keep it exactly as you made it.",
    icon: <Wand2 className="h-14 w-14" />,
    gradient: MID,
    grid: true,
    items: [
      { icon: <Wand2 className="h-5 w-5" />, label: "Outline" },
      { icon: <Presentation className="h-5 w-5" />, label: "Slides" },
      { icon: <FileUp className="h-5 w-5" />, label: "Upload a deck" },
      { icon: <ClipboardCheck className="h-5 w-5" />, label: "Quiz" },
    ],
  },
  {
    title: "Review before anyone sees it",
    description:
      "Preview walks the lesson the way a learner takes it. Click any text on a generated slide to change it, and edit the quiz question by question.",
    icon: <Eye className="h-14 w-14" />,
    gradient: TEAL,
  },
  {
    title: "Publish when it is ready",
    description:
      "A draft course is visible only to you. Publishing puts it in the catalogue for your learners to enrol on.",
    icon: <Send className="h-14 w-14" />,
    gradient: CLOSE,
    finale: true,
  },
];

export function OnboardingTour() {
  const currentRole = useUserStore((s) => s.currentRole);
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const steps = currentRole === "instructor" ? instructorTour : studentTour;

  // First visit in this role.
  useEffect(() => {
    const done = localStorage.getItem(storageKey(currentRole));
    if (done) return;
    const timer = setTimeout(() => {
      setCurrentStep(0);
      setOpen(true);
    }, 600);
    return () => clearTimeout(timer);
  }, [currentRole]);

  // Asked for again, from the profile page. Opens now rather than on the next
  // reload, which is what the button used to promise and not deliver.
  useEffect(() => {
    const onStart = () => {
      setCurrentStep(0);
      setDirection("next");
      setOpen(true);
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, []);

  const handleComplete = useCallback(() => {
    localStorage.setItem(storageKey(currentRole), "true");
    setOpen(false);
  }, [currentRole]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setDirection("next");
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, steps.length, handleComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection("prev");
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  if (!mounted) return null;

  const step = steps[Math.min(currentStep, steps.length - 1)];
  const isLast = currentStep === steps.length - 1;
  const isFirst = currentStep === 0;
  const animClass = direction === "next" ? "onboarding-slide-next" : "onboarding-slide-prev";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : handleComplete())}>
      <DialogContent
        className="overflow-hidden border-0 p-0 shadow-2xl sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={`relative bg-gradient-to-br ${step.gradient} rounded-xl p-[1px]`}>
          <div className="bg-background overflow-hidden rounded-xl">
            {/* Header */}
            <div
              className={`relative bg-gradient-to-br ${step.gradient} overflow-hidden px-6 pt-8 pb-6 text-center`}
            >
              <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-black/10 blur-xl" />

              <div className="onboarding-scale-in relative mx-auto mb-4">
                <div className="inline-flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-white shadow-lg backdrop-blur-sm">
                  {step.icon}
                </div>
              </div>

              <DialogTitle className="onboarding-fade-in relative text-2xl font-bold tracking-tight text-white">
                {step.title}
              </DialogTitle>

              {isFirst && (
                <>
                  <Sparkles className="absolute top-4 left-6 h-5 w-5 animate-pulse text-white/40" />
                  <Sparkles className="absolute top-8 right-8 h-4 w-4 animate-pulse text-white/30 [animation-delay:0.5s]" />
                </>
              )}
            </div>

            {/* Body */}
            <div className="p-6">
              <div key={currentStep} className={`${animClass} onboarding-step-content`}>
                <DialogDescription className="text-muted-foreground mb-6 text-center text-sm leading-relaxed">
                  {step.description}
                </DialogDescription>

                {step.items && step.grid && (
                  <div className="grid grid-cols-2 gap-3">
                    {step.items.map((item) => (
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

                {step.items && !step.grid && (
                  <div className="flex justify-center gap-3">
                    {step.items.map((item) => (
                      <div
                        key={item.label}
                        className="glass-card hover-lift max-w-[130px] flex-1 cursor-default rounded-xl p-4 text-center"
                      >
                        <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.55_0.18_250_/0.1)] text-[oklch(0.50_0.18_250)]">
                          {item.icon}
                        </div>
                        <p className="text-foreground text-sm font-semibold">{item.label}</p>
                        {item.desc && (
                          <p className="text-muted-foreground mt-0.5 text-xs">{item.desc}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {step.finale && (
                  <div className="text-center">
                    <div className="glow-pulse mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[oklch(0.55_0.16_175)] to-[oklch(0.50_0.18_250)] text-white shadow-lg">
                      <Rocket className="h-8 w-8" />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="mt-6 flex items-center justify-between">
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
                      onClick={handleComplete}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      Skip
                    </Button>
                  )}
                </div>

                <div className="slide-progress-indicator">
                  {steps.map((_, i) => (
                    <span
                      key={i}
                      className={`dot ${
                        i === currentStep ? "active" : i < currentStep ? "completed" : ""
                      }`}
                    />
                  ))}
                </div>

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
                    {isLast
                      ? currentRole === "instructor"
                        ? "Start building"
                        : "Start learning"
                      : "Next"}
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
