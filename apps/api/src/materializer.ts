import { Inject, Injectable } from '@nestjs/common';
import { DateTime } from 'luxon';
import { recurrenceDates, reminderTimes } from '@ritmo/shared';
import { Database } from './database.js';
import type { Prisma } from './generated/prisma/client.js';
type Tx = Prisma.TransactionClient;
@Injectable()
export class Materializer {
  constructor(@Inject(Database) private readonly db: Database) {}
  async run(userId: string, now = new Date(), days = 16) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const rules = await tx.routineRule.findMany({
          where: { userId },
          include: { exceptions: true },
        });
        for (const rule of rules) {
          const candidates = recurrenceDates(rule, now, days, rule.exceptions);
          const today = DateTime.fromJSDate(now, { zone: rule.timezone }).toISODate()!;
          const keys = candidates.map((c) => c.sourceKey);
          const last = DateTime.fromJSDate(now, { zone: rule.timezone })
            .plus({ days: days - 1 })
            .toISODate()!;
          await tx.scheduledOccurrence.deleteMany({
            where: {
              routineId: rule.id,
              localDate: { gte: today, lte: last },
              sourceKey: { notIn: keys },
              status: 'SCHEDULED',
              overridden: false,
              completion: null,
              focusSessions: { none: {} },
            },
          });
          for (const c of candidates) {
            const existing = await tx.scheduledOccurrence.findUnique({
              where: { sourceKey: c.sourceKey },
            });
            if (existing && ['COMPLETED', 'PARTIAL', 'MISSED'].includes(existing.status)) continue;
            const data = {
              userId,
              routineId: rule.id,
              localDate: c.localDate,
              title: c.title ?? rule.title,
              category: rule.category,
              emoji: rule.emoji,
              color: rule.color,
              startAt: c.startAt,
              endAt: c.endAt,
              timezone: rule.timezone,
              flexible: rule.flexible,
              priority: rule.priority,
              location: rule.location,
              notes: rule.notes,
              overridden: c.overridden,
              status: c.skipped ? ('SKIPPED' as const) : ('SCHEDULED' as const),
            };
            const occurrence = await tx.scheduledOccurrence.upsert({
              where: { sourceKey: c.sourceKey },
              create: { ...data, sourceKey: c.sourceKey },
              update: data,
            });
            await this.reminders(
              tx,
              occurrence.id,
              rule.reminderMinutes,
              now,
              rule.reminderMessages,
            );
          }
        }
        const events = await tx.calendarEvent.findMany({ where: { userId, endAt: { gte: now } } });
        for (const event of events) {
          const sourceKey = `event:${event.id}`;
          const existing = await tx.scheduledOccurrence.findUnique({ where: { sourceKey } });
          if (existing && existing.status !== 'SCHEDULED') continue;
          const data = {
            userId,
            eventId: event.id,
            localDate: DateTime.fromJSDate(event.startAt, { zone: event.timezone }).toISODate()!,
            title: event.title,
            category: event.category,
            emoji: event.emoji,
            color: event.color,
            startAt: event.startAt,
            endAt: event.endAt,
            timezone: event.timezone,
            flexible: !!event.plannerKey,
            goalId: event.goalId,
            priority: event.priority,
            location: event.location,
            notes: event.notes,
          };
          const occurrence = await tx.scheduledOccurrence.upsert({
            where: { sourceKey },
            create: { ...data, sourceKey },
            update: data,
          });
          await this.reminders(
            tx,
            occurrence.id,
            event.reminderMinutes,
            now,
            event.reminderMessages,
          );
        }
      },
      { timeout: 60000 },
    );
  }
  async reminders(
    tx: Tx,
    occurrenceId: string,
    offsets: number[],
    now = new Date(),
    messages: Prisma.JsonValue = {},
  ) {
    const occurrence = await tx.scheduledOccurrence.findUniqueOrThrow({
      where: { id: occurrenceId },
    });
    if (occurrence.status !== 'SCHEDULED') {
      await tx.reminder.updateMany({
        where: { occurrenceId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELLED' },
      });
      return;
    }
    const times = reminderTimes(occurrence.startAt, offsets);
    const keys = times.map((t) => `${occurrenceId}:${t.minutes}:${t.scheduledAt.toISOString()}`);
    await tx.reminder.updateMany({
      where: {
        occurrenceId,
        status: 'PENDING',
        key: { notIn: keys, startsWith: `${occurrenceId}:` },
      },
      data: { status: 'CANCELLED' },
    });
    for (const t of times) {
      const key = `${occurrenceId}:${t.minutes}:${t.scheduledAt.toISOString()}`;
      const custom =
        messages && typeof messages === 'object' && !Array.isArray(messages)
          ? messages[String(t.minutes)]
          : null;
      const user = custom
        ? await tx.user.findUniqueOrThrow({
            where: { id: occurrence.userId },
            select: { name: true },
          })
        : null;
      const template = (value: string) => value.replaceAll('{userName}', user?.name ?? '');
      const customTitle =
        custom &&
        typeof custom === 'object' &&
        !Array.isArray(custom) &&
        typeof custom.title === 'string'
          ? template(custom.title)
          : null;
      const customBody =
        custom &&
        typeof custom === 'object' &&
        !Array.isArray(custom) &&
        typeof custom.body === 'string'
          ? template(custom.body)
          : null;
      const title =
        customTitle ??
        (t.minutes === 0
          ? `${occurrence.emoji} AGORA: ${occurrence.title.toLocaleUpperCase()}`
          : `${occurrence.emoji} ${occurrence.title} em ${t.minutes} min`);
      const at = DateTime.fromJSDate(occurrence.startAt, { zone: occurrence.timezone }).toFormat(
        'HH:mm',
      );
      await tx.reminder.upsert({
        where: { key },
        create: {
          occurrenceId,
          key,
          scheduledAt: t.scheduledAt,
          nextAttemptAt: t.scheduledAt,
          title,
          body:
            customBody ??
            `Começa às ${at}${occurrence.location ? ` · ${occurrence.location}` : ''}.`,
          status: +t.scheduledAt < +now - 60000 ? 'CANCELLED' : 'PENDING',
        },
        update: {
          title,
          body:
            customBody ??
            `Começa às ${at}${occurrence.location ? ` · ${occurrence.location}` : ''}.`,
        },
      });
    }
  }
}
