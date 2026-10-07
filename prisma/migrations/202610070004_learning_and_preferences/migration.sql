-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "reminderMessages" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "learning" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "studied" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "technology" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "bootstrapKey" TEXT,
ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "planningOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "topics" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "RoutineRule" ADD COLUMN     "bootstrapKey" TEXT,
ADD COLUMN     "reminderMessages" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "ScheduledOccurrence" ADD COLUMN     "goalId" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'pt-BR',
ADD COLUMN     "studyIdealMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "timeFormat" TEXT NOT NULL DEFAULT '24h',
ADD COLUMN     "weekStartsOn" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "IncidentLearning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "technology" TEXT NOT NULL,
    "error" TEXT NOT NULL DEFAULT '',
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "cause" TEXT NOT NULL DEFAULT '',
    "solution" TEXT NOT NULL DEFAULT '',
    "learning" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IncidentLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentLearning_userId_createdAt_idx" ON "IncidentLearning"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Goal_userId_bootstrapKey_key" ON "Goal"("userId", "bootstrapKey");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRule_userId_bootstrapKey_key" ON "RoutineRule"("userId", "bootstrapKey");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledOccurrence" ADD CONSTRAINT "ScheduledOccurrence_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentLearning" ADD CONSTRAINT "IncidentLearning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
