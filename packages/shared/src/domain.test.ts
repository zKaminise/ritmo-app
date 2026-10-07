import { describe, expect, it } from 'vitest';
import {
  freePeriods,
  localInterval,
  overlaps,
  recurrenceDates,
  reminderTimes,
  snoozeAt,
} from './time.js';
import { goalProgress, planDay, streak } from './planner.js';
const interval = (a: string, b: string) => localInterval('2026-10-12', a, b, 'America/Sao_Paulo');
describe('horários e timezone', () => {
  it('encontra janelas e une sobreposições', () => {
    const day = interval('06:30', '23:30');
    const free = freePeriods(day.startAt, day.endAt, [
      interval('09:00', '18:00'),
      interval('12:00', '13:00'),
      interval('19:00', '20:30'),
    ]);
    expect(free.map((i) => [i.startAt.toISOString(), i.endAt.toISOString()])).toEqual([
      ['2026-10-12T09:30:00.000Z', '2026-10-12T12:00:00.000Z'],
      ['2026-10-12T21:00:00.000Z', '2026-10-12T22:00:00.000Z'],
      ['2026-10-12T23:30:00.000Z', '2026-10-13T02:30:00.000Z'],
    ]);
  });
  it('respeita buffers e limites do dia', () => {
    const d = interval('06:30', '23:30');
    const free = freePeriods(d.startAt, d.endAt, [interval('09:00', '18:00')], 15);
    expect(free[0]?.endAt.toISOString()).toBe('2026-10-12T11:45:00.000Z');
    expect(free[1]?.startAt.toISOString()).toBe('2026-10-12T21:15:00.000Z');
  });
  it('distingue conflito de atividades adjacentes', () => {
    expect(overlaps(interval('18:00', '22:00'), interval('19:00', '20:30'))).toBe(true);
    expect(overlaps(interval('18:00', '19:00'), interval('19:00', '20:30'))).toBe(false);
  });
  it('converte São Paulo para UTC e cruza a meia-noite', () => {
    const i = interval('23:00', '06:30');
    expect(i.startAt.toISOString()).toBe('2026-10-13T02:00:00.000Z');
    expect((+i.endAt - +i.startAt) / 3600000).toBe(7.5);
  });
  it('mantém horário local através da mudança de DST', () => {
    const rule = {
      id: 'r',
      weekdays: [7],
      startTime: '09:00',
      endTime: '10:00',
      timezone: 'America/New_York',
      effectiveFrom: '2026-10-01',
      active: true,
    };
    const dates = recurrenceDates(rule, new Date('2026-10-25T12:00:00Z'), 15);
    expect(dates[0]?.startAt.toISOString()).toBe('2026-10-25T13:00:00.000Z');
    expect(dates[1]?.startAt.toISOString()).toBe('2026-11-01T14:00:00.000Z');
  });
});
describe('recorrência, exceções e lembretes', () => {
  const rule = {
    id: 'r',
    weekdays: [1],
    startTime: '19:00',
    endTime: '20:30',
    timezone: 'America/Sao_Paulo',
    effectiveFrom: '2026-10-01',
    active: true,
  };
  it('materializa duas segundas-feiras nos próximos 14 dias', () => {
    const rows = recurrenceDates(rule, new Date('2026-10-12T12:00:00Z'), 14);
    expect(rows.map((r) => r.localDate)).toEqual(['2026-10-12', '2026-10-19']);
    expect(new Set(rows.map((r) => r.sourceKey)).size).toBe(2);
  });
  it('aplica exceção a uma data sem alterar as próximas', () => {
    const rows = recurrenceDates(rule, new Date('2026-10-12T12:00:00Z'), 14, [
      { localDate: '2026-10-12', skipped: false, startTime: '20:00', endTime: '21:30' },
    ]);
    expect(rows[0]?.startAt.toISOString()).toBe('2026-10-12T23:00:00.000Z');
    expect(rows[1]?.startAt.toISOString()).toBe('2026-10-19T22:00:00.000Z');
  });
  it('mantém exceção de pular e respeita limite de vigência', () => {
    const rows = recurrenceDates(
      { ...rule, effectiveUntil: '2026-10-18' },
      new Date('2026-10-12T12:00:00Z'),
      14,
      [{ localDate: '2026-10-12', skipped: true }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skipped).toBe(true);
  });
  it('gera horários de lembrete únicos em UTC', () => {
    expect(
      reminderTimes(new Date('2026-10-12T10:00:00Z'), [30, 10, 0, 10]).map((r) =>
        r.scheduledAt.toISOString(),
      ),
    ).toEqual(['2026-10-12T09:30:00.000Z', '2026-10-12T09:50:00.000Z', '2026-10-12T10:00:00.000Z']);
  });
  it('adia o lembrete a partir do momento da ação', () => {
    expect(snoozeAt(new Date('2026-10-12T10:00:00Z'), 15).toISOString()).toBe(
      '2026-10-12T10:15:00.000Z',
    );
  });
});
describe('metas e planejador', () => {
  it('conta tempo parcial, tópicos e unidades', () => {
    const logs = [
      { category: 'STUDY', title: 'Estudar Java', actualDuration: 30, status: 'COMPLETED' },
      { category: 'STUDY', title: 'Estudar Node', actualDuration: 60, status: 'COMPLETED' },
      { category: 'STUDY', title: 'Java', actualDuration: 15, status: 'PARTIAL' },
      { category: 'STUDY', title: 'Java', actualDuration: 30, status: 'SKIPPED' },
    ];
    expect(goalProgress({ category: 'STUDY', topic: 'Java', unit: 'MINUTES' }, logs)).toBe(45);
    expect(goalProgress({ category: 'STUDY', topic: 'Java', unit: 'HOURS' }, logs)).toBe(0.75);
    expect(goalProgress({ category: 'STUDY', topic: 'Java', unit: 'TIMES' }, logs)).toBe(1);
  });
  it('sugere metas sem sobrepor eventos ou sono e é determinístico', () => {
    const p = {
      timezone: 'America/Sao_Paulo',
      wakeTime: '06:30',
      sleepTime: '23:00',
      gymDuration: 60,
      gymBuffer: 15,
      gymMinTime: '06:00',
      gymMaxTime: '08:30',
      gymPeriod: 'MORNING',
      studyMinutes: 30,
      studyPeriod: 'EVENING',
    };
    const goals = [
      {
        id: 'gym',
        name: 'Academia',
        category: 'GYM',
        target: 5,
        unit: 'TIMES' as const,
        period: 'WEEKLY' as const,
        topic: '',
        priority: 'HIGH' as const,
        progress: 0,
      },
      {
        id: 'study',
        name: 'Java',
        category: 'STUDY',
        target: 30,
        unit: 'MINUTES' as const,
        period: 'DAILY' as const,
        topic: 'Java',
        priority: 'HIGH' as const,
        progress: 0,
      },
    ];
    const busy = [interval('09:00', '18:00'), interval('19:00', '20:30')];
    const now = new Date('2026-10-12T08:00:00Z');
    const plan = planDay('2026-10-12', busy, goals, p, now);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.startAt.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(plan.every((s) => busy.every((b) => !overlaps(s, b)))).toBe(true);
    expect(planDay('2026-10-12', busy, goals, p, now)).toEqual(plan);
  });
  it('não sugere meta cumprida e não modifica compromissos', () => {
    const busy = [interval('09:00', '18:00')];
    const snapshot = JSON.stringify(busy);
    const p = {
      timezone: 'America/Sao_Paulo',
      wakeTime: '06:30',
      sleepTime: '23:00',
      gymDuration: 60,
      gymBuffer: 15,
      gymMinTime: '06:00',
      gymMaxTime: '08:30',
      gymPeriod: 'MORNING',
      studyMinutes: 30,
      studyPeriod: 'EVENING',
    };
    expect(
      planDay(
        '2026-10-12',
        busy,
        [
          {
            id: 'g',
            name: 'Academia',
            category: 'GYM',
            target: 5,
            progress: 5,
            unit: 'TIMES',
            period: 'WEEKLY',
            topic: '',
            priority: 'HIGH',
          },
        ],
        p,
        new Date('2026-10-12T08:00:00Z'),
      ),
    ).toEqual([]);
    expect(JSON.stringify(busy)).toBe(snapshot);
  });
  it('mantém streak até ontem sem penalizar hoje ainda aberto', () => {
    expect(streak(['2026-10-10', '2026-10-11'], '2026-10-12')).toBe(2);
    expect(streak(['2026-10-12', '2026-10-11', '2026-10-09'], '2026-10-12')).toBe(2);
  });
});
