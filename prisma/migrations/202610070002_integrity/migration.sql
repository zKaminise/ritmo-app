CREATE UNIQUE INDEX "FocusSession_one_active_per_user" ON "FocusSession" ("userId") WHERE "endedAt" IS NULL;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_positive_duration" CHECK ("endAt" > "startAt");
ALTER TABLE "ScheduledOccurrence" ADD CONSTRAINT "ScheduledOccurrence_positive_duration" CHECK ("endAt" > "startAt");
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_positive_target" CHECK (target > 0);
ALTER TABLE "CompletionLog" ADD CONSTRAINT "CompletionLog_positive_duration" CHECK ("actualDuration" >= 0);
