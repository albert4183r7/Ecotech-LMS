"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface RiskRow {
  enrollmentId: string;
  studentName: string;
  courseTitle: string;
  progressPercent: number;
  minutesStudied7d: number;
  quizAverage7d: number | null;
  inactiveDays: number;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  signals: string[];
  summary: string;
  recommendation: string;
  assessedAt: string | null;
  modelKey: string;
}

const PAGE_SIZE = 10;

const levelStyle = {
  high: "border-rose-200 bg-rose-50/70 text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300",
  medium:
    "border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300",
  low: "border-emerald-200 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300",
};

function RiskIcon({ level }: { level: RiskRow["riskLevel"] }) {
  return level === "high" ? (
    <AlertTriangle className="h-4 w-4" />
  ) : level === "medium" ? (
    <Clock3 className="h-4 w-4" />
  ) : (
    <CheckCircle2 className="h-4 w-4" />
  );
}

function LoadingState() {
  return (
    <div className="text-muted-foreground flex items-center justify-center py-10 text-sm">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Reading learning signals…
    </div>
  );
}

export function RiskInsightsPanel({ mode = "compact" }: { mode?: "compact" | "workspace" }) {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<"all" | RiskRow["riskLevel"]>("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/analytics/risk");
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Could not load risk insights.");
      }
      setRows(json.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load risk insights.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch("/api/analytics/risk", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "AI analysis failed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "AI analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const counts = useMemo(
    () => ({
      high: rows.filter((row) => row.riskLevel === "high").length,
      medium: rows.filter((row) => row.riskLevel === "medium").length,
      low: rows.filter((row) => row.riskLevel === "low").length,
    }),
    [rows],
  );

  const attention = useMemo(
    () => rows.filter((row) => row.riskLevel !== "low").slice(0, 5),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (level === "all" || row.riskLevel === level) &&
        (!term ||
          row.studentName.toLowerCase().includes(term) ||
          row.courseTitle.toLowerCase().includes(term) ||
          row.signals.some((signal) => signal.toLowerCase().includes(term))),
    );
  }, [level, query, rows]);

  useEffect(() => {
    setPage(1);
  }, [level, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selected =
    filtered.find((row) => row.enrollmentId === selectedId) ?? visibleRows[0] ?? null;

  if (mode === "compact") {
    return (
      <section className="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <BrainCircuit className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground text-sm font-semibold">AI Early Warning</h2>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <ShieldCheck className="h-3 w-3" />
                Transactional signals
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              Prioritized interventions across courses
            </p>
          </div>
          {!loading && (
            <div className="hidden items-center gap-2 sm:flex">
              <Badge className="border-0 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                {counts.high} high
              </Badge>
              <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                {counts.medium} watch
              </Badge>
            </div>
          )}
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/analytics">
              Open center <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : rows.length === 0 ? (
          <div className="py-7 text-center">
            <UsersRound className="text-muted-foreground/40 mx-auto h-6 w-6" />
            <p className="text-foreground mt-2 text-sm font-medium">No students to monitor yet</p>
          </div>
        ) : attention.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-5">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="text-foreground text-sm font-medium">No intervention needed</p>
              <p className="text-muted-foreground text-xs">
                All {rows.length} monitored enrollments are currently low risk.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {attention.map((row) => (
              <div
                key={row.enrollmentId}
                className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_auto] sm:items-center sm:px-5"
              >
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">{row.studentName}</p>
                  <p className="text-muted-foreground truncate text-xs">{row.courseTitle}</p>
                </div>
                <p className="text-muted-foreground truncate text-xs">
                  {row.signals[0] ?? row.summary}
                </p>
                <Badge variant="outline" className={cn("w-fit gap-1", levelStyle[row.riskLevel])}>
                  <RiskIcon level={row.riskLevel} /> {row.riskScore}
                </Badge>
              </div>
            ))}
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[11px] sm:px-5">
              <span>
                Showing {attention.length} of {counts.high + counts.medium} students needing
                attention
              </span>
              <span>{counts.low} low-risk enrollments summarized</span>
            </div>
          </div>
        )}
        {error && (
          <p className="mx-4 mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["high", "High risk", counts.high],
            ["medium", "Watch", counts.medium],
            ["low", "On track", counts.low],
          ] as const
        ).map(([key, label, value]) => (
          <button
            key={key}
            type="button"
            onClick={() => setLevel(level === key ? "all" : key)}
            className={cn(
              "bg-card flex items-center gap-3 rounded-xl border p-4 text-left shadow-sm transition-colors",
              level === key && levelStyle[key],
            )}
          >
            <span className={cn("rounded-lg border p-2", levelStyle[key])}>
              <RiskIcon level={key} />
            </span>
            <span>
              <span className="text-foreground block text-2xl font-bold tabular-nums">{value}</span>
              <span className="text-muted-foreground text-xs">{label}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student, course, or signal"
              className="pl-9"
            />
          </div>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as typeof level)}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            aria-label="Filter by risk level"
          >
            <option value="all">All levels</option>
            <option value="high">High risk</option>
            <option value="medium">Watch</option>
            <option value="low">On track</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => void analyze()}
            disabled={loading || analyzing || rows.length === 0}
          >
            {analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {analyzing ? "Analyzing…" : "Refresh AI analysis"}
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid min-h-[32rem] lg:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="border-r">
              <div className="text-muted-foreground grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem] gap-3 border-b px-4 py-2 text-[10px] font-semibold tracking-wide uppercase">
                <span>Student</span>
                <span>Primary signal</span>
                <span className="text-right">Risk</span>
              </div>
              {visibleRows.length === 0 ? (
                <div className="text-muted-foreground py-16 text-center text-sm">
                  No students match these filters.
                </div>
              ) : (
                <div className="divide-y">
                  {visibleRows.map((row) => (
                    <button
                      key={row.enrollmentId}
                      type="button"
                      onClick={() => setSelectedId(row.enrollmentId)}
                      className={cn(
                        "hover:bg-muted/50 grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem] gap-3 px-4 py-3 text-left transition-colors",
                        selected?.enrollmentId === row.enrollmentId && "bg-muted/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="text-foreground block truncate text-sm font-medium">
                          {row.studentName}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs">
                          {row.courseTitle}
                        </span>
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {row.signals[0] ?? "No active warning"}
                      </span>
                      <span className="text-right">
                        <Badge
                          variant="outline"
                          className={cn("gap-1 tabular-nums", levelStyle[row.riskLevel])}
                        >
                          {row.riskScore}
                        </Badge>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-muted-foreground text-xs">
                  {filtered.length} result{filtered.length === 1 ? "" : "s"} · Page {page} of{" "}
                  {pageCount}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={page === 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    disabled={page === pageCount}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            <aside className="bg-muted/20 p-5">
              {selected ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-foreground truncate font-semibold">
                          {selected.studentName}
                        </h2>
                        <p className="text-muted-foreground truncate text-xs">
                          {selected.courseTitle}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("gap-1", levelStyle[selected.riskLevel])}
                      >
                        <RiskIcon level={selected.riskLevel} /> {selected.riskScore}
                      </Badge>
                    </div>
                    <Progress value={selected.riskScore} className="mt-4 h-1.5" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      [`${selected.progressPercent}%`, "Progress"],
                      [`${selected.minutesStudied7d}m`, "This week"],
                      [
                        selected.quizAverage7d === null ? "—" : `${selected.quizAverage7d}%`,
                        "Quiz",
                      ],
                    ].map(([value, label]) => (
                      <div key={label} className="bg-background rounded-lg border p-2">
                        <p className="text-foreground text-sm font-semibold tabular-nums">
                          {value}
                        </p>
                        <p className="text-muted-foreground text-[10px]">{label}</p>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                      Signals
                    </p>
                    <ul className="mt-2 space-y-2">
                      {selected.signals.map((signal) => (
                        <li
                          key={signal}
                          className="text-foreground flex gap-2 text-xs leading-relaxed"
                        >
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          {signal}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-background rounded-xl border p-3">
                    <p className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
                      Recommended intervention
                    </p>
                    <p className="text-foreground mt-2 text-xs leading-relaxed">
                      {selected.recommendation}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground py-16 text-center text-sm">
                  Select a student to inspect the evidence.
                </div>
              )}
            </aside>
          </div>
        )}
        {error && (
          <p className="m-4 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
