"use client";

import Link from "next/link";
import { ArrowLeft, BrainCircuit, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskInsightsPanel } from "@/components/lms/risk-insights-panel";

export function RiskCenterPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 gap-2">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </Button>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-emerald-600 text-white shadow-lg shadow-violet-500/20">
          <BrainCircuit className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">
              Early Warning Center
            </h1>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <ShieldCheck className="h-3 w-3" /> Transactional signals only
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Triage the students who need attention, then inspect one evidence-backed recommendation
            at a time. Search and pagination keep large cohorts manageable.
          </p>
        </div>
      </header>

      <RiskInsightsPanel mode="workspace" />
    </div>
  );
}
