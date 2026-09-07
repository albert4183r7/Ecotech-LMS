-- Additive migration for installations whose database still contains legacy
-- tables not represented by schema.prisma. This deliberately does not drop or
-- rebuild any existing table.

ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;

CREATE TABLE "MasteryQuestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "prompt" TEXT NOT NULL,
  "optionsJson" TEXT NOT NULL,
  "correctOptionIndex" INTEGER NOT NULL,
  "explanation" TEXT,
  "sourceQuote" TEXT,
  "topic" TEXT,
  "fingerprint" TEXT NOT NULL,
  "timesShown" INTEGER NOT NULL DEFAULT 0,
  "wrongCount" INTEGER NOT NULL DEFAULT 0,
  "mastered" BOOLEAN NOT NULL DEFAULT false,
  "lastShownAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "lessonId" TEXT,
  CONSTRAINT "MasteryQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MasteryQuestion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MasteryQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "MasteryResponse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "selectedOptionIndex" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "questionId" TEXT NOT NULL,
  CONSTRAINT "MasteryResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "MasteryQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "LearningEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "metadata" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "lessonId" TEXT,
  "slideId" TEXT,
  CONSTRAINT "LearningEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningEvent_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LearningEvent_slideId_fkey" FOREIGN KEY ("slideId") REFERENCES "Slide" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "RiskAssessment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "riskScore" INTEGER NOT NULL,
  "riskLevel" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendation" TEXT NOT NULL,
  "signalsJson" TEXT NOT NULL DEFAULT '[]',
  "modelKey" TEXT NOT NULL,
  "assessedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  CONSTRAINT "RiskAssessment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MasteryQuestion_userId_courseId_fingerprint_key" ON "MasteryQuestion"("userId", "courseId", "fingerprint");
CREATE INDEX "MasteryQuestion_userId_courseId_mastered_idx" ON "MasteryQuestion"("userId", "courseId", "mastered");
CREATE INDEX "MasteryResponse_questionId_answeredAt_idx" ON "MasteryResponse"("questionId", "answeredAt");
CREATE INDEX "LearningEvent_userId_courseId_createdAt_idx" ON "LearningEvent"("userId", "courseId", "createdAt");
CREATE INDEX "LearningEvent_courseId_type_createdAt_idx" ON "LearningEvent"("courseId", "type", "createdAt");
CREATE UNIQUE INDEX "RiskAssessment_enrollmentId_key" ON "RiskAssessment"("enrollmentId");
CREATE INDEX "RiskAssessment_riskLevel_assessedAt_idx" ON "RiskAssessment"("riskLevel", "assessedAt");
