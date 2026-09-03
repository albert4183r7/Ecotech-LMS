import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

interface ManualQuestionDraft {
  prompt: string;
  explanation?: string;
  options: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

const APPEND_RETRIES = 5;

function isRetryableWriteConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

/**
 * Append a hand-written question without deriving its order from a stale quiz
 * read. The unique (quizId, order) constraint remains the final authority; a
 * concurrent writer that loses the race retries from the new maximum.
 */
export async function appendManualQuestion(quizId: string, draft: ManualQuestionDraft) {
  for (let attempt = 0; attempt < APPEND_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const latest = await tx.question.aggregate({
            where: { quizId },
            _max: { order: true },
          });

          return tx.question.create({
            data: {
              quizId,
              prompt: draft.prompt,
              explanation: draft.explanation || null,
              // Written by hand, so there is no lesson sentence to cite. Left
              // null rather than invented: a fabricated quote would make the
              // question look audited when it is not.
              sourceQuote: null,
              order: (latest._max.order ?? -1) + 1,
              options: {
                create: draft.options.map((option, index) => ({
                  text: option.text,
                  isCorrect: option.isCorrect,
                  order: index,
                })),
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isRetryableWriteConflict(error) || attempt === APPEND_RETRIES - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
    }
  }

  throw new Error("Could not append the quiz question.");
}
