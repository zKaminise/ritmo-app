import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import {
  freePeriods,
  goalProgress,
  goalMatches,
  localInterval,
  overlaps,
  periodStart,
  planDay,
  streak,
  type ProgressLog,
} from '@ritmo/shared';
import { Database } from './database.js';
import { AgendaService } from './agenda.js';
@Injectable()
export class InsightsService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(AgendaService) private readonly agenda: AgendaService,
  ) {}
  async progress(userId: string, now = new Date()) {
    const p = await this.agenda.settings(userId);
    const goals = await this.agenda.goals(userId);
    const earliest = periodStart(now, p.timezone, 'WEEKLY');
    const end = DateTime.fromJSDate(now, { zone: p.timezone }).endOf('day').toJSDate();
    const [completions, focus] = await Promise.all([
      this.db.completionLog.findMany({
        where: { occurrence: { userId, startAt: { gte: earliest, lte: end } } },
        include: { occurrence: true },
      }),
      this.db.focusSession.findMany({
        where: {
          userId,
          occurrenceId: null,
          startedAt: { gte: earliest, lte: end },
          endedAt: { not: null },
        },
      }),
    ]);
    return goals.map((g) => {
      const start = periodStart(now, p.timezone, g.period);
      const logs: ProgressLog[] = completions
        .filter((c) => c.occurrence.startAt >= start)
        .map((c) => ({
          category: c.occurrence.category,
          title: c.occurrence.title,
          status: c.status,
          actualDuration: c.actualDuration,
          goalId: c.occurrence.goalId,
        }));
      logs.push(
        ...focus
          .filter((f) => f.startedAt >= start)
          .map((f) => ({
            category: f.category,
            title: f.title,
            status: f.actualDuration >= f.plannedMinutes ? 'COMPLETED' : 'PARTIAL',
            actualDuration: f.actualDuration,
            goalId: f.goalId,
            technology: f.technology,
          })),
      );
      const progress = goalProgress(g, logs);
      return { ...g, progress, percentage: Math.min(100, Math.round((progress / g.target) * 100)) };
    });
  }
  async planningContext(userId: string, date: string) {
    const p = await this.agenda.settings(userId);
    const point = DateTime.fromISO(date, { zone: p.timezone });
    const [items, goals, scheduled, done, focus] = await Promise.all([
      this.agenda.occurrences(userId, date, date),
      this.progress(userId, point.toJSDate()),
      this.db.scheduledOccurrence.findMany({
        where: {
          userId,
          status: 'SCHEDULED',
          startAt: { gte: point.startOf('week').toJSDate(), lte: point.endOf('week').toJSDate() },
        },
      }),
      this.db.completionLog.findMany({
        where: {
          status: { in: ['COMPLETED', 'PARTIAL'] },
          occurrence: {
            userId,
            category: 'STUDY',
            startAt: { gte: point.startOf('day').toJSDate(), lte: point.endOf('day').toJSDate() },
          },
        },
      }),
      this.db.focusSession.findMany({
        where: {
          userId,
          category: 'STUDY',
          occurrenceId: null,
          endedAt: { not: null },
          startedAt: { gte: point.startOf('day').toJSDate(), lte: point.endOf('day').toJSDate() },
        },
      }),
    ]);
    const studyCompletedMinutes =
      done.reduce((sum, l) => sum + l.actualDuration, 0) +
      focus.reduce((sum, l) => sum + l.actualDuration, 0);
    const planningGoals = goals
      .filter((g) => g.active)
      .map((g) => ({
        ...g,
        plannedProgress: scheduled
          .filter(
            (o) =>
              (g.period === 'WEEKLY' || o.localDate === date) &&
              o.endAt > new Date() &&
              goalMatches(g, o),
          )
          .reduce(
            (sum, o) =>
              sum +
              (g.unit === 'TIMES'
                ? 1
                : (+o.endAt - +o.startAt) / 60000 / (g.unit === 'HOURS' ? 60 : 1)),
            0,
          ),
      }));
    return { p, items, goals, planningGoals, studyCompletedMinutes };
  }
  async dashboard(userId: string, date?: string) {
    const p = await this.agenda.settings(userId);
    const now = new Date();
    const today = date ?? DateTime.fromJSDate(now, { zone: p.timezone }).toISODate()!;
    const { items, goals, planningGoals, studyCompletedMinutes } = await this.planningContext(
      userId,
      today,
    );
    const active = items.filter((i) => i.status === 'SCHEDULED');
    const current =
      active
        .filter((i) => i.startAt <= now && i.endAt > now)
        .sort(
          (a, b) =>
            ({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 })[a.priority] -
            { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[b.priority],
        )[0] ?? null;
    const next = active.find((i) => i.startAt > now) ?? null;
    const bounds = localInterval(today, p.wakeTime, p.sleepTime, p.timezone);
    const free = freePeriods(bounds.startAt, bounds.endAt, active);
    const suggestions = planDay(today, active, planningGoals, { ...p, studyCompletedMinutes }, now);
    const recent = await this.db.scheduledOccurrence.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        startAt: { gte: DateTime.fromJSDate(now).minus({ days: 365 }).toJSDate() },
      },
      select: { localDate: true, category: true },
    });
    const focus = await this.db.focusSession.findFirst({ where: { userId, endedAt: null } });
    return {
      now: now.toISOString(),
      date: today,
      settings: p,
      occurrences: items,
      current,
      next,
      free,
      goals,
      suggestions,
      focus,
      streaks: {
        study: streak(
          recent.filter((i) => i.category === 'STUDY').map((i) => i.localDate),
          today,
        ),
        gym: recent.filter(
          (i) =>
            i.category === 'GYM' &&
            i.localDate >=
              DateTime.fromJSDate(now, { zone: p.timezone }).startOf('week').toISODate()!,
        ).length,
      },
    };
  }
  async planner(userId: string, date: string) {
    const { p, items, planningGoals, studyCompletedMinutes } = await this.planningContext(
      userId,
      date,
    );
    const busy = items.filter((i) => i.status === 'SCHEDULED');
    const bounds = localInterval(date, p.wakeTime, p.sleepTime, p.timezone);
    return {
      free: freePeriods(bounds.startAt, bounds.endAt, busy),
      suggestions: planDay(date, busy, planningGoals, { ...p, studyCompletedMinutes }),
    };
  }
  async applyPlan(userId: string, date: string, goalIds: string[]) {
    const { suggestions } = await this.planner(userId, date);
    const p = await this.agenda.settings(userId);
    const added = [];
    for (const s of suggestions.filter((s) => goalIds.includes(s.goalId))) {
      const plannerKey = `${date}:${s.goalId}`;
      const existing = await this.db.calendarEvent.findUnique({
        where: { userId_plannerKey: { userId, plannerKey } },
      });
      if (existing) continue;
      const event = await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const conflicts = await tx.scheduledOccurrence.findMany({
          where: {
            userId,
            status: 'SCHEDULED',
            startAt: { lt: s.endAt },
            endAt: { gt: s.startAt },
          },
        });
        if (conflicts.some((c) => overlaps(c, s))) return null;
        const cat = await tx.category.findUnique({
          where: { userId_key: { userId, key: s.category } },
        });
        return tx.calendarEvent.upsert({
          where: { userId_plannerKey: { userId, plannerKey } },
          create: {
            userId,
            plannerKey,
            title: s.title,
            category: s.category,
            emoji: cat?.emoji ?? '📌',
            color: cat?.color ?? '#a3e635',
            startAt: s.startAt,
            endAt: s.endAt,
            timezone: p.timezone,
            priority: s.priority,
            notes: s.reason,
            goalId: s.goalId,
            reminderMinutes:
              p.categoryReminders &&
              typeof p.categoryReminders === 'object' &&
              !Array.isArray(p.categoryReminders) &&
              Array.isArray(p.categoryReminders[s.category])
                ? (p.categoryReminders[s.category] as number[])
                : [10, 0],
          },
          update: {},
        });
      });
      if (event) {
        added.push(event);
        await this.db.scheduledOccurrence
          .create({
            data: {
              userId,
              eventId: event.id,
              sourceKey: `event:${event.id}`,
              localDate: date,
              title: event.title,
              category: event.category,
              emoji: event.emoji,
              color: event.color,
              startAt: event.startAt,
              endAt: event.endAt,
              timezone: event.timezone,
              priority: event.priority,
              flexible: true,
              goalId: event.goalId,
              location: event.location,
              notes: event.notes,
            },
          })
          .catch(async (e) => {
            if (
              !(await this.db.scheduledOccurrence.findUnique({
                where: { sourceKey: `event:${event.id}` },
              }))
            )
              throw e;
          });
      }
    }
    await this.agenda.occurrences(userId, date, date);
    return { added };
  }
  async summary(userId: string) {
    const p = await this.agenda.settings(userId);
    const from = DateTime.now().setZone(p.timezone).startOf('week');
    const occurrences = await this.db.scheduledOccurrence.findMany({
      where: {
        userId,
        startAt: { gte: from.toJSDate(), lte: new Date() },
        NOT: { sourceKey: { startsWith: 'test:' } },
      },
    });
    const completed = occurrences.filter((i) => i.status === 'COMPLETED').length;
    return {
      goals: await this.progress(userId),
      completed,
      total: occurrences.length,
      adherence: occurrences.length ? Math.round((completed / occurrences.length) * 100) : 0,
    };
  }
}
