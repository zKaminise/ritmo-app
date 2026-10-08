import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Database } from './database.js';
import { Materializer } from './materializer.js';
import { PushService } from './push.js';
import { InsightsService } from './insights.js';
import { schedulerMode } from './platform.js';
@Injectable()
export class ReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private busy = false;
  private refreshing = false;
  private readonly logger = new Logger('ReminderWorker');
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Materializer) private readonly materializer: Materializer,
    @Inject(PushService) private readonly push: PushService,
    @Inject(InsightsService) private readonly insights: InsightsService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test' || schedulerMode() !== 'continuous') return;
    this.timer = setInterval(() => void this.tick().catch((e) => this.logger.error(e)), 15000);
    this.refreshTimer = setInterval(
      () => void this.refresh().catch((e) => this.logger.error(e)),
      10 * 60000,
    );
    void this.refresh().catch((e) => this.logger.error(e));
    void this.tick().catch((e) => this.logger.error(e));
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }
  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      let cursor: string | undefined;
      for (;;) {
        const users = await this.db.user.findMany({
          take: 100,
          orderBy: { id: 'asc' },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          select: { id: true, settings: true },
        });
        for (const user of users) {
          await this.materializer.run(user.id);
          if (user.settings?.autoPlan && user.settings.onboardingDone) {
            const date = DateTime.now().setZone(user.settings.timezone).toISODate()!;
            const plan = await this.insights.planner(user.id, date);
            await this.insights.applyPlan(
              user.id,
              date,
              plan.suggestions.map((s) => s.goalId),
            );
          }
        }
        if (users.length < 100) break;
        cursor = users.at(-1)!.id;
      }
      await this.db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await this.db.scheduledOccurrence.deleteMany({
        where: {
          sourceKey: { startsWith: 'test:' },
          startAt: { lt: new Date(Date.now() - 7 * 86400000) },
        },
      });
    } finally {
      this.refreshing = false;
    }
  }
  async claim(now = new Date()) {
    return this.db.$queryRaw<{ id: string }[]>`
      WITH due AS (
        SELECT id FROM "Reminder"
        WHERE status='PENDING' AND "scheduledAt" <= ${now} AND "nextAttemptAt" <= ${now}
        ORDER BY "scheduledAt" LIMIT 20 FOR UPDATE SKIP LOCKED
      ) UPDATE "Reminder" r SET status='PROCESSING', "claimedAt"=${now}, attempts=attempts+1, "updatedAt"=${now}
      FROM due WHERE r.id=due.id RETURNING r.id`;
  }
  async recover(now = new Date()) {
    const stale = await this.db.reminder.findMany({
      where: { status: 'PROCESSING', claimedAt: { lt: new Date(+now - 10 * 60000) } },
    });
    for (const r of stale) {
      await this.db.$transaction(async (tx) => {
        await tx.notificationDelivery.updateMany({
          where: { reminderId: r.id, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            retryable: false,
            lastError:
              'Resposta de envio desconhecida após interrupção. Não reenviado para evitar duplicação.',
          },
        });
        const uncertain = await tx.notificationDelivery.count({
          where: { reminderId: r.id, status: 'FAILED', retryable: false },
        });
        await tx.reminder.updateMany({
          where: { id: r.id, status: 'PROCESSING' },
          data: {
            status: uncertain ? 'FAILED' : 'PENDING',
            nextAttemptAt: now,
            lastError: uncertain ? 'Envio interrompido; confira diagnóstico.' : null,
          },
        });
      });
    }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = new Date();
      await this.recover(now);
      await this.db.reminder.updateMany({
        where: { status: 'PENDING', scheduledAt: { lt: new Date(+now - 3600000) } },
        data: { status: 'CANCELLED', lastError: 'Lembrete expirado há mais de uma hora.' },
      });
      const expired = await this.db.scheduledOccurrence.findMany({
        where: {
          status: 'SCHEDULED',
          endAt: { lt: now },
          NOT: { sourceKey: { startsWith: 'test:' } },
          focusSessions: { none: { endedAt: null } },
        },
        take: 100,
      });
      for (const item of expired)
        await this.db.$transaction(async (tx) => {
          const changed = await tx.scheduledOccurrence.updateMany({
            where: { id: item.id, status: 'SCHEDULED' },
            data: { status: 'MISSED' },
          });
          if (changed.count)
            await tx.completionLog.upsert({
              where: { occurrenceId: item.id },
              create: {
                occurrenceId: item.id,
                status: 'MISSED',
                completedAt: now,
                actualDuration: 0,
              },
              update: {},
            });
          await tx.reminder.updateMany({
            where: { occurrenceId: item.id, status: 'PENDING' },
            data: { status: 'CANCELLED' },
          });
        });
      await Promise.allSettled((await this.claim()).map((r) => this.push.process(r.id))).then(
        (results) => {
          for (const result of results)
            if (result.status === 'rejected') this.logger.error(result.reason);
        },
      );
    } finally {
      this.busy = false;
    }
  }
}
