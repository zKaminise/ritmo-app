import { describe, it, expect } from 'vitest';
import { goalMatches, goalProgress, planDay, type GoalProgress } from './planner.js';
import { localInterval, overlaps } from './time.js';
const p = {
  timezone: 'America/Sao_Paulo',
  wakeTime: '06:30',
  sleepTime: '23:15',
  gymDuration: 60,
  gymBuffer: 0,
  gymMinTime: '06:30',
  gymMaxTime: '08:30',
  gymPeriod: 'MORNING',
  studyMinutes: 30,
  studyIdealMinutes: 60,
  studyPeriod: 'EVENING',
};
const date = '2026-10-13';
const goals: GoalProgress[] = [
  {
    id: 'gym',
    name: 'Treino',
    category: 'GYM',
    target: 5,
    unit: 'TIMES',
    period: 'WEEKLY',
    topic: '',
    progress: 0,
    priority: 'HIGH',
  },
  {
    id: 'backend',
    name: 'Desenvolvimento',
    category: 'STUDY',
    target: 3,
    unit: 'HOURS',
    period: 'WEEKLY',
    topic: '',
    topics: ['Node.js', 'NestJS', 'React', 'Next.js'],
    planningOrder: 0,
    progress: 0,
    priority: 'HIGH',
  },
  {
    id: 'java',
    name: 'Curso Java',
    category: 'STUDY',
    target: 4,
    unit: 'HOURS',
    period: 'WEEKLY',
    topic: '',
    topics: ['Java'],
    planningOrder: 1,
    progress: 0,
    priority: 'HIGH',
  },
];
describe('planejamento e aprendizagem', () => {
  it('conta todas as tecnologias associadas sem misturar Java', () => {
    const logs = [
      {
        category: 'STUDY',
        title: 'Controllers',
        technology: 'NestJS',
        status: 'PARTIAL',
        actualDuration: 45,
      },
      {
        category: 'STUDY',
        title: 'Hooks',
        technology: 'React',
        status: 'COMPLETED',
        actualDuration: 30,
      },
      {
        category: 'STUDY',
        title: 'Spring',
        technology: 'Java',
        status: 'COMPLETED',
        actualDuration: 60,
      },
    ];
    expect(goalProgress(goals[1]!, logs)).toBe(1.25);
    expect(goalProgress(goals[2]!, logs)).toBe(1);
  });
  it('vínculo explícito da sessão resolve a meta', () => {
    expect(goalMatches(goals[1]!, { title: 'Java', category: 'STUDY', goalId: 'backend' })).toBe(
      true,
    );
    expect(goalMatches(goals[2]!, { title: 'Java', category: 'STUDY', goalId: 'backend' })).toBe(
      false,
    );
  });
  it('respeita trabalho, faculdade e preparação do sono com prioridade de academia', () => {
    const busy = [
      localInterval(date, '06:30', '06:45', p.timezone),
      localInterval(date, '09:00', '18:00', p.timezone),
      localInterval(date, '21:00', '22:30', p.timezone),
      localInterval(date, '22:45', '23:15', p.timezone),
    ];
    const plan = planDay(date, busy, goals, p, new Date('2026-10-13T08:00:00Z'));
    expect(plan).toHaveLength(2);
    expect(plan[0]?.goalId).toBe('gym');
    expect(plan[1]?.goalId).toBe('backend');
    expect((+plan[1]!.endAt - +plan[1]!.startAt) / 60000).toBe(60);
    expect(plan.every((s) => busy.every((b) => !overlaps(s, b)))).toBe(true);
  });
  it('não excede o estudo ideal e passa para a próxima meta cumprida a primeira', () => {
    const plan = planDay(
      date,
      [localInterval(date, '09:00', '18:00', p.timezone)],
      goals.map((g) => (g.id === 'backend' ? { ...g, progress: 3 } : g)),
      p,
      new Date('2026-10-13T08:00:00Z'),
    );
    expect(plan.find((s) => s.category === 'STUDY')?.goalId).toBe('java');
    expect(
      plan
        .filter((s) => s.category === 'STUDY')
        .reduce((sum, s) => sum + (+s.endAt - +s.startAt) / 60000, 0),
    ).toBeLessThanOrEqual(60);
  });
  it('considera metas já planejadas e o estudo concluído hoje', () => {
    const plan = planDay(
      date,
      [],
      goals.map((g) => ({ ...g, plannedProgress: g.target })),
      { ...p, studyCompletedMinutes: 60 },
      new Date('2026-10-13T08:00:00Z'),
    );
    expect(plan).toEqual([]);
  });
  it('não inventa uma sessão mínima em uma janela insuficiente', () => {
    const busy = [localInterval(date, '06:30', '22:50', p.timezone)];
    expect(planDay(date, busy, goals, p, new Date('2026-10-13T08:00:00Z'))).toEqual([]);
  });
});
