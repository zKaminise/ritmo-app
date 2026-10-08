-- CreateTable
CREATE TABLE "SchedulerState" (
    "id" TEXT NOT NULL,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMPTZ(3),
    "lastStartedAt" TIMESTAMPTZ(3),
    "lastCompletedAt" TIMESTAMPTZ(3),
    "lastRefreshAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SchedulerState_pkey" PRIMARY KEY ("id")
);
