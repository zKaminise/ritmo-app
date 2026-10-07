import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import {
  localInterval,
  overlaps,
  minutesBetween,
  snoozeAt,
  type RoutineInput,
  type EventInput,
  type GoalInput,
  type SettingsInput,
  type OnboardingInput,
  completionSchema,
  exceptionSchema,
  focusSchema,
  finishFocusSchema,
  eventSchema,
} from '@ritmo/shared';
import { z } from 'zod';
import { Database } from './database.js';
import { Materializer } from './materializer.js';
import { LearningService } from './learning.js';
@Injectable()
export class AgendaService {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Materializer) private readonly materializer: Materializer,
    @Inject(LearningService) private readonly learning: LearningService,
  ) {}
  settings(userId: string) {
    return this.db.userSettings.findUniqueOrThrow({ where: { userId } });
  }
  async category(userId: string, key: string) {
    if (!(await this.db.category.findUnique({ where: { userId_key: { userId, key } } })))
      throw new BadRequestException('Escolha uma categoria cadastrada.');
  }
  async saveSettings(userId: string, input: SettingsInput) {
    const old = await this.settings(userId);
    const result = await this.db.$transaction(async (tx) => {
      const updated = await tx.userSettings.update({ where: { userId }, data: input });
      if (old.timezone !== input.timezone)
        await tx.routineRule.updateMany({ where: { userId }, data: { timezone: input.timezone } });
      if (
        old.sleepTime !== input.sleepTime ||
        old.wakeTime !== input.wakeTime ||
        old.windDownMinutes !== input.windDownMinutes
      ) {
        const windDown = await tx.routineRule.findFirst({
          where: { userId, managedKind: 'WIND_DOWN', effectiveUntil: null },
        });
        const sleepRules = await tx.routineRule.findMany({
          where: { userId, managedKind: 'SLEEP', effectiveUntil: null },
        });
        for (const sleepRule of sleepRules)
          await tx.routineRule.update({
            where: { id: sleepRule.id },
            data: {
              startTime: input.sleepTime,
              endTime: input.wakeTime,
              reminderMinutes: windDown
                ? sleepRule.reminderMinutes
                : sleepRule.reminderMinutes.map((offset) =>
                    offset === old.windDownMinutes ? input.windDownMinutes : offset,
                  ),
            },
          });
        if (windDown)
          await tx.routineRule.updateMany({
            where: { userId, managedKind: 'WIND_DOWN', effectiveUntil: null },
            data: {
              startTime: DateTime.fromFormat(input.sleepTime, 'HH:mm')
                .minus({ minutes: input.windDownMinutes })
                .toFormat('HH:mm'),
              endTime: input.sleepTime,
            },
          });
        await tx.routineRule.updateMany({
          where: { userId, managedKind: 'WAKE_UP', effectiveUntil: null },
          data: {
            startTime: input.wakeTime,
            endTime: DateTime.fromFormat(input.wakeTime, 'HH:mm')
              .plus({ minutes: 15 })
              .toFormat('HH:mm'),
          },
        });
      }
      return updated;
    });
    await this.materializer.run(userId);
    return result;
  }
  routines(userId: string) {
    return this.db.routineRule.findMany({ where: { userId }, orderBy: { startTime: 'asc' } });
  }
  async saveRoutine(userId: string, input: RoutineInput, id?: string) {
    await this.category(userId, input.category);
    const settings = await this.settings(userId);
    const original = id ? await this.db.routineRule.findFirst({ where: { id, userId } }) : null;
    if (id && !original) throw new NotFoundException('Rotina não encontrada.');
    const data = {
      ...input,
      timezone: settings.timezone,
      effectiveFrom: input.effectiveFrom ?? DateTime.now().setZone(settings.timezone).toISODate()!,
    };
    const rule = id
      ? await this.db.routineRule.update({ where: { id }, data })
      : await this.db.routineRule.create({ data: { ...data, userId } });
    if (original?.managedKind === 'SLEEP')
      await this.db.userSettings.update({
        where: { userId },
        data: { sleepTime: input.startTime, wakeTime: input.endTime },
      });
    if (original?.managedKind === 'WAKE_UP')
      await this.db.userSettings.update({ where: { userId }, data: { wakeTime: input.startTime } });
    await this.materializer.run(userId);
    return rule;
  }
  async deleteRoutine(userId: string, id: string) {
    if (!(await this.db.routineRule.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Rotina não encontrada.');
    await this.db.$transaction(async (tx) => {
      await tx.routineRule.update({ where: { id }, data: { active: false } });
      await tx.scheduledOccurrence.deleteMany({
        where: {
          routineId: id,
          startAt: { gte: new Date() },
          status: 'SCHEDULED',
          completion: null,
          focusSessions: { none: {} },
        },
      });
      await tx.reminder.updateMany({
        where: { occurrence: { routineId: id }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    });
    return { ok: true };
  }
  async occurrences(userId: string, from: string, to: string) {
    const p = await this.settings(userId);
    const start = DateTime.fromISO(from, { zone: p.timezone }).startOf('day');
    const end = DateTime.fromISO(to, { zone: p.timezone }).endOf('day');
    const days = Math.ceil(end.diff(start, 'days').days);
    if (!start.isValid || !end.isValid || days < 0 || days > 45)
      throw new BadRequestException('Escolha um período de até 45 dias.');
    await this.materializer.run(userId, start.minus({ days: 1 }).toJSDate(), days + 2);
    const items = await this.db.scheduledOccurrence.findMany({
      where: {
        userId,
        startAt: { lte: end.toJSDate() },
        endAt: { gte: start.toJSDate() },
        NOT: { sourceKey: { startsWith: 'test:' } },
      },
      include: {
        completion: true,
        event: { select: { reminderMinutes: true, reminderMessages: true } },
        routine: { select: { reminderMinutes: true, reminderMessages: true } },
      },
      orderBy: { startAt: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      reminderMinutes: item.event?.reminderMinutes ?? item.routine?.reminderMinutes ?? [],
      reminderMessages: item.event?.reminderMessages ?? item.routine?.reminderMessages ?? {},
    }));
  }
  async occurrence(userId: string, id: string) {
    const item = await this.db.scheduledOccurrence.findFirst({
      where: { id, userId },
      include: {
        completion: true,
        reminders: { orderBy: { scheduledAt: 'asc' } },
        event: { select: { reminderMinutes: true, reminderMessages: true } },
        routine: { select: { reminderMinutes: true, reminderMessages: true } },
      },
    });
    if (!item) throw new NotFoundException('Compromisso não encontrado.');
    return {
      ...item,
      reminderMinutes: item.event?.reminderMinutes ?? item.routine?.reminderMinutes ?? [],
      reminderMessages: item.event?.reminderMessages ?? item.routine?.reminderMessages ?? {},
    };
  }
  async saveEvent(userId: string, input: EventInput, id?: string) {
    await this.category(userId, input.category);
    if (id && !(await this.db.calendarEvent.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Compromisso não encontrado.');
    const p = await this.settings(userId);
    const { date, startTime, endTime, ...fields } = input;
    const interval = localInterval(date, startTime, endTime, p.timezone);
    await this.materializer.run(userId, interval.startAt);
    const candidates = await this.db.scheduledOccurrence.findMany({
      where: {
        userId,
        status: 'SCHEDULED',
        startAt: { lt: interval.endAt },
        endAt: { gt: interval.startAt },
        ...(id ? { NOT: { eventId: id } } : {}),
      },
    });
    const conflicts = candidates.filter((c) => overlaps(c, interval));
    const data = { ...fields, ...interval, timezone: p.timezone };
    const event = id
      ? await this.db.calendarEvent.update({ where: { id }, data })
      : await this.db.calendarEvent.create({ data: { ...data, userId } });
    if (id)
      await this.db.scheduledOccurrence.updateMany({
        where: { eventId: id, userId },
        data: { status: 'SCHEDULED' },
      });
    await this.materializer.run(userId, interval.startAt);
    const occurrence = await this.db.scheduledOccurrence.findUnique({
      where: { sourceKey: `event:${event.id}` },
    });
    return { event, occurrence, conflicts };
  }
  async conflicts(userId: string, input: EventInput) {
    const p = await this.settings(userId);
    const interval = localInterval(input.date, input.startTime, input.endTime, p.timezone);
    await this.materializer.run(userId, interval.startAt);
    return this.db.scheduledOccurrence.findMany({
      where: {
        userId,
        status: 'SCHEDULED',
        startAt: { lt: interval.endAt },
        endAt: { gt: interval.startAt },
      },
    });
  }
  async deleteEvent(userId: string, id: string) {
    if (!(await this.db.calendarEvent.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Compromisso não encontrado.');
    await this.db.$transaction(async (tx) => {
      await tx.reminder.updateMany({
        where: { occurrence: { eventId: id }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
      await tx.scheduledOccurrence.deleteMany({
        where: { eventId: id, userId, completion: null, focusSessions: { none: {} } },
      });
      await tx.scheduledOccurrence.updateMany({
        where: { eventId: id, status: 'SCHEDULED' },
        data: { status: 'SKIPPED', overridden: true },
      });
      await tx.calendarEvent.delete({ where: { id } });
    });
    return { ok: true };
  }
  async complete(userId: string, id: string, input: z.infer<typeof completionSchema>) {
    const item = await this.occurrence(userId, id);
    return this.db.$transaction(async (tx) => {
      const result = await tx.completionLog.upsert({
        where: { occurrenceId: id },
        create: {
          occurrenceId: id,
          status: input.status,
          actualDuration:
            input.actualDuration ??
            (input.status === 'COMPLETED' ? minutesBetween(item.startAt, item.endAt) : 0),
          notes: input.notes,
          completedAt: new Date(),
        },
        update: {
          status: input.status,
          actualDuration:
            input.actualDuration ??
            (input.status === 'COMPLETED' ? minutesBetween(item.startAt, item.endAt) : 0),
          notes: input.notes,
          completedAt: new Date(),
        },
      });
      await tx.scheduledOccurrence.update({ where: { id }, data: { status: input.status } });
      if (item.routineId && input.status === 'SKIPPED')
        await tx.routineException.upsert({
          where: { routineId_localDate: { routineId: item.routineId, localDate: item.localDate } },
          create: { routineId: item.routineId, localDate: item.localDate, skipped: true },
          update: { skipped: true },
        });
      await tx.reminder.updateMany({
        where: { occurrenceId: id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELLED' },
      });
      return result;
    });
  }
  async exception(userId: string, id: string, input: z.infer<typeof exceptionSchema>) {
    const item = await this.occurrence(userId, id);
    if (!item.routineId) {
      if (input.skipped) return this.complete(userId, id, { status: 'SKIPPED', notes: '' });
      const event = await this.db.calendarEvent.findUniqueOrThrow({ where: { id: item.eventId! } });
      return this.saveEvent(
        userId,
        eventSchema.parse({
          ...event,
          date: item.localDate,
          startTime:
            input.startTime ??
            DateTime.fromJSDate(item.startAt, { zone: item.timezone }).toFormat('HH:mm'),
          endTime:
            input.endTime ??
            DateTime.fromJSDate(item.endAt, { zone: item.timezone }).toFormat('HH:mm'),
          title: input.title ?? item.title,
        }),
        event.id,
      );
    }
    const rule = await this.db.routineRule.findUniqueOrThrow({ where: { id: item.routineId } });
    if (input.scope === 'TODAY') {
      await this.db.routineException.upsert({
        where: { routineId_localDate: { routineId: rule.id, localDate: item.localDate } },
        create: {
          routineId: rule.id,
          localDate: item.localDate,
          skipped: input.skipped,
          startTime: input.startTime,
          endTime: input.endTime,
          title: input.title,
        },
        update: {
          skipped: input.skipped,
          startTime: input.startTime,
          endTime: input.endTime,
          title: input.title,
        },
      });
    } else {
      await this.db.$transaction(async (tx) => {
        await tx.routineRule.update({
          where: { id: rule.id },
          data: {
            effectiveUntil: DateTime.fromISO(item.localDate).minus({ days: 1 }).toISODate()!,
          },
        });
        const { id: _id, createdAt: _created, updatedAt: _updated, ...clone } = rule;
        await tx.routineRule.create({
          data: {
            ...clone,
            bootstrapKey: null,
            reminderMessages: rule.reminderMessages ?? {},
            effectiveFrom: item.localDate,
            effectiveUntil: null,
            startTime: input.startTime ?? rule.startTime,
            endTime: input.endTime ?? rule.endTime,
            title: input.title ?? rule.title,
            active: !input.skipped,
          },
        });
        await tx.scheduledOccurrence.deleteMany({
          where: {
            routineId: rule.id,
            localDate: { gte: item.localDate },
            status: 'SCHEDULED',
            overridden: false,
            completion: null,
            focusSessions: { none: {} },
          },
        });
      });
    }
    await this.materializer.run(userId, item.startAt);
    return { ok: true };
  }
  async snooze(userId: string, id: string, minutes: 5 | 10 | 15 | 30) {
    const item = await this.occurrence(userId, id);
    if (item.status !== 'SCHEDULED')
      throw new BadRequestException('Esta atividade já foi registrada.');
    const scheduledAt = snoozeAt(new Date(), minutes);
    return this.db.reminder.create({
      data: {
        occurrenceId: id,
        key: `snooze:${randomUUID()}`,
        scheduledAt,
        nextAttemptAt: scheduledAt,
        title: `${item.emoji} Lembrete: ${item.title}`,
        body: 'Seu lembrete adiado chegou.',
      },
    });
  }
  goals(userId: string) {
    return this.db.goal.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }
  async saveGoal(userId: string, input: GoalInput, id?: string) {
    await this.category(userId, input.category);
    if (id && !(await this.db.goal.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Meta não encontrada.');
    return id
      ? this.db.goal.update({ where: { id }, data: input })
      : this.db.goal.create({ data: { ...input, userId } });
  }
  async deleteGoal(userId: string, id: string) {
    await this.db.goal.deleteMany({ where: { id, userId } });
    return { ok: true };
  }
  async startFocus(userId: string, input: z.infer<typeof focusSchema>) {
    await this.category(userId, input.category);
    const occurrence = input.occurrenceId
      ? await this.occurrence(userId, input.occurrenceId)
      : null;
    const goalId =
      input.category === 'STUDY'
        ? await this.learning.resolveGoal(
            userId,
            input.title,
            input.technology,
            input.goalId ?? occurrence?.goalId,
          )
        : (input.goalId ?? occurrence?.goalId ?? null);
    if (goalId && !(await this.db.goal.findFirst({ where: { id: goalId, userId } })))
      throw new BadRequestException('Meta não encontrada.');
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`active-focus:${userId}`}))`;
      const active = await tx.focusSession.findFirst({ where: { userId, endedAt: null } });
      if (active) return active;
      return tx.focusSession.create({ data: { ...input, userId, goalId } });
    });
  }
  async finishFocus(
    userId: string,
    id: string,
    input: z.infer<typeof finishFocusSchema> = { studied: '', learning: '' },
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`focus:${id}`}))`;
      const session = await tx.focusSession.findFirst({ where: { id, userId } });
      if (!session) throw new NotFoundException('Sessão não encontrada.');
      if (session.endedAt) return session;
      const endedAt = new Date();
      const actualDuration = Math.max(0, Math.round((+endedAt - +session.startedAt) / 60000));
      const result = await tx.focusSession.update({
        where: { id },
        data: { endedAt, actualDuration, ...input },
      });
      if (session.occurrenceId) {
        const status =
          actualDuration >= session.plannedMinutes ? ('COMPLETED' as const) : ('PARTIAL' as const);
        const data = {
          status,
          actualDuration,
          completedAt: endedAt,
          notes:
            [input.studied, input.learning].filter(Boolean).join('\n') ||
            'Registrado no modo foco.',
        };
        await tx.completionLog.upsert({
          where: { occurrenceId: session.occurrenceId },
          create: { occurrenceId: session.occurrenceId, ...data },
          update: data,
        });
        await tx.scheduledOccurrence.update({
          where: { id: session.occurrenceId },
          data: { status },
        });
        await tx.reminder.updateMany({
          where: { occurrenceId: session.occurrenceId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }
      return result;
    });
  }
  async onboarding(userId: string, input: OnboardingInput) {
    const current = await this.settings(userId);
    if (current.onboardingDone)
      throw new BadRequestException(
        'A configuração inicial já foi concluída. Edite sua rotina no perfil.',
      );
    const p = input.settings;
    await this.db.$transaction(async (tx) => {
      await tx.userSettings.update({ where: { userId }, data: { ...p, onboardingDone: true } });
      const base = {
        userId,
        timezone: p.timezone,
        effectiveFrom: DateTime.now().setZone(p.timezone).toISODate()!,
        location: '',
        notes: '',
        active: true,
        color: '#a3e635',
      };
      const rules = [];
      rules.push({
        title: 'Dormir',
        category: 'SLEEP',
        emoji: '🌙',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: p.sleepTime,
        endTime: p.wakeTime,
        priority: 'HIGH' as const,
        reminderMinutes: [p.windDownMinutes, 0],
      });
      const wakeEnd = DateTime.fromFormat(p.wakeTime, 'HH:mm')
        .plus({ minutes: 15 })
        .toFormat('HH:mm');
      rules.push({
        title: 'Começar o dia',
        category: 'WAKE_UP',
        emoji: '☀️',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: p.wakeTime,
        endTime: wakeEnd,
        priority: 'HIGH' as const,
        reminderMinutes: [0],
      });
      if (input.workDays.length)
        rules.push({
          title: 'Trabalho',
          category: 'WORK',
          emoji: '💻',
          weekdays: input.workDays,
          startTime: input.workStart,
          endTime: input.workEnd,
          priority: 'CRITICAL' as const,
          reminderMinutes: [15, 0],
        });
      if (input.college && input.collegeDays.length)
        rules.push({
          title: 'Faculdade',
          category: 'COLLEGE',
          emoji: '🎓',
          weekdays: input.collegeDays,
          startTime: input.collegeStart,
          endTime: input.collegeEnd,
          priority: 'CRITICAL' as const,
          reminderMinutes: [30, 10, 0],
        });
      for (const rule of rules) {
        if (rule.startTime === rule.endTime)
          throw new BadRequestException('Confira os horários da sua rotina.');
        await tx.routineRule.create({
          data: {
            ...base,
            ...rule,
            managedKind:
              rule.category === 'SLEEP' ? 'SLEEP' : rule.category === 'WAKE_UP' ? 'WAKE_UP' : null,
          },
        });
      }
      if (input.gym)
        await tx.goal.create({
          data: {
            userId,
            name: 'Academia',
            category: 'GYM',
            target: p.gymTimes,
            unit: 'TIMES',
            period: 'WEEKLY',
          },
        });
      if (input.study)
        await tx.goal.create({
          data: {
            userId,
            name: 'Estudo diário',
            category: 'STUDY',
            target: p.studyMinutes || 30,
            unit: 'MINUTES',
            period: 'DAILY',
          },
        });
    });
    await this.materializer.run(userId);
    return { ok: true };
  }
}
