import { z } from "zod/v4";

// ============================================
// Evaluation contract
//
// A critic returns structured findings, never prose. Prose cannot drive
// control flow: the gate needs to know which slide is affected, whether the
// problem blocks completion, and what to tell the reviser.
// ============================================

export const FindingSchema = z.object({
  severity: z
    .enum(["blocking", "advisory"])
    .describe("blocking means the lesson is not acceptable until this is fixed"),
  slidePosition: z
    .number()
    .int()
    .min(0)
    .describe("1-based slide this concerns, or 0 when it concerns the lesson as a whole"),
  problem: z.string().min(10).describe("What is wrong, specifically"),
  fix: z.string().min(10).describe("A concrete instruction that would resolve it"),
});

export const EvaluationSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Overall quality"),
  summary: z.string().min(10).max(600),
  findings: z.array(FindingSchema).max(20),
});

export type Finding = z.infer<typeof FindingSchema>;
export type EvaluationResult = z.infer<typeof EvaluationSchema>;

/** Score below which a lesson fails even with no blocking finding. */
export const PASS_SCORE = 70;

/** A pass needs both a clean bill on blocking findings and a decent score. */
export function passes(result: EvaluationResult): boolean {
  return result.score >= PASS_SCORE && !result.findings.some((f) => f.severity === "blocking");
}

/** Findings that must be acted on, newest evaluation first. */
export function blockingFindings(result: EvaluationResult): Finding[] {
  return result.findings.filter((f) => f.severity === "blocking");
}
