import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { fail, handleRoute, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/session";
import { collectRiskSignals, defaultNarrative, saveRiskAssessment } from "@/lib/analytics/risk";
import { generateStructuredJSON } from "@/lib/ai";
import { AI_GENERATION_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

const NarrativeSchema = z.object({
  assessments: z.array(
    z.object({
      enrollmentId: z.string(),
      summary: z.string().min(10).max(300),
      recommendation: z.string().min(10).max(400),
    }),
  ),
});

async function rowsForInstructor(instructorId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { course: { creatorId: instructorId }, status: { not: "dropped" } },
    select: { id: true },
  });
  const rows = await Promise.all(
    enrollments.map((enrollment) => collectRiskSignals(enrollment.id)),
  );
  return rows.filter((row): row is NonNullable<typeof row> => row !== null);
}

export async function GET() {
  return handleRoute("analytics.risk.GET", async () => {
    const user = await requireUser();
    if (user.role !== "instructor") return fail("Instructor access required.", 403);
    const signals = await rowsForInstructor(user.id);
    const saved = await db.riskAssessment.findMany({
      where: { enrollment: { course: { creatorId: user.id } } },
    });
    const byEnrollment = new Map(saved.map((assessment) => [assessment.enrollmentId, assessment]));
    return ok(
      signals
        .map((row) => {
          const assessment = byEnrollment.get(row.enrollmentId);
          const narrative = assessment ?? defaultNarrative(row);
          return {
            ...row,
            summary: narrative.summary,
            recommendation: narrative.recommendation,
            assessedAt: assessment?.assessedAt ?? null,
            modelKey: assessment?.modelKey ?? "live-transactional-score",
          };
        })
        .sort((a, b) => b.riskScore - a.riskScore),
    );
  });
}

export async function POST(request: NextRequest) {
  return handleRoute("analytics.risk.POST", async () => {
    const user = await requireUser();
    if (user.role !== "instructor") return fail("Instructor access required.", 403);
    const limited = consumeAuthenticatedRequest(
      request.headers,
      user.id,
      "ai:risk-analysis",
      AI_GENERATION_RULE,
    );
    if (!limited.allowed) return fail("Analysis limit reached. Please try again later.", 429);
    const rows = await rowsForInstructor(user.id);
    if (rows.length === 0) return ok([]);

    const result = await generateStructuredJSON(
      `Analyze these LMS transactional metrics. The numeric riskScore is already calibrated; do not change it. Explain the strongest evidence without diagnosing personal traits. Recommend a specific, proportionate intervention or remedial lesson.\n\n${JSON.stringify(rows)}`,
      NarrativeSchema,
      {
        task: "risk-analysis",
        temperature: 0.2,
        systemInstruction:
          "You are an education early-warning analyst. Use only the supplied login, reading-time, progress, assessment, and weak-topic metrics. Do not infer protected characteristics. Return one concise assessment for every enrollmentId.",
      },
    );
    const narratives = new Map(result.assessments.map((item) => [item.enrollmentId, item]));
    await Promise.all(
      rows.map((row) =>
        saveRiskAssessment(
          row,
          narratives.get(row.enrollmentId) ?? defaultNarrative(row),
          "risk-analysis",
        ),
      ),
    );
    return ok(rows.length);
  });
}
