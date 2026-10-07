import { DateTime } from 'luxon';
import { freePeriods, localInterval, type Interval } from './time.js';
import type { Priority } from './schemas.js';
export interface GoalProgress {
  id: string;
  name: string;
  category: string;
  target: number;
  unit: 'MINUTES' | 'HOURS' | 'TIMES';
  period: 'DAILY' | 'WEEKLY';
  topic: string;
  priority: Priority;
  progress: number;
  topics?: string[];
  planningOrder?: number;
  plannedProgress?: number;
}
export interface ProgressLog {
  category: string;
  title: string;
  actualDuration: number;
  status: string;
  technology?: string;
  goalId?: string | null;
}
export function goalMatches(
  goal: { id?: string; category: string; topic: string; topics?: string[] },
  log: { category: string; title: string; technology?: string; goalId?: string | null },
) {
  if (log.category !== goal.category) return false;
  const topics = goal.topics?.length ? goal.topics : goal.topic ? [goal.topic] : [];
  if (!topics.length) return true;
  if (log.goalId && goal.id) return log.goalId === goal.id;
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  const title = normalize(`${log.title} ${log.technology ?? ''}`);
  return topics.some((topic) => title.includes(normalize(topic)));
}
export function goalProgress(
  goal: Pick<GoalProgress, 'category' | 'topic' | 'unit'> & { id?: string; topics?: string[] },
  logs: ProgressLog[],
) {
  return logs
    .filter((l) => ['COMPLETED', 'PARTIAL'].includes(l.status) && goalMatches(goal, l))
    .reduce(
      (sum, l) =>
        sum +
        (goal.unit === 'TIMES'
          ? l.status === 'COMPLETED'
            ? 1
            : 0
          : l.actualDuration / (goal.unit === 'HOURS' ? 60 : 1)),
      0,
    );
}
export interface PlannerPreferences {
  wakeTime: string;
  sleepTime: string;
  timezone: string;
  gymDuration: number;
  gymBuffer: number;
  gymMinTime: string;
  gymMaxTime: string;
  gymPeriod: string;
  studyMinutes: number;
  studyPeriod: string;
  studyIdealMinutes?: number;
  studyCompletedMinutes?: number;
}
export interface Suggestion extends Interval {
  title: string;
  category: string;
  goalId: string;
  reason: string;
  priority: Priority;
}
export function planDay(
  date: string,
  busy: Interval[],
  goals: GoalProgress[],
  p: PlannerPreferences,
  now = new Date(),
): Suggestion[] {
  const day = localInterval(date, p.wakeTime, p.sleepTime, p.timezone);
  const startAt = new Date(Math.max(+day.startAt, +now));
  if (startAt >= day.endAt) return [];
  const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const suggestions: Suggestion[] = [];
  const available = [...busy];
  let studyBudget = Math.max(
    0,
    (p.studyIdealMinutes ?? p.studyMinutes) - (p.studyCompletedMinutes ?? 0),
  );
  const categoryRank = (category: string) =>
    category === 'GYM'
      ? 0
      : category === 'STUDY'
        ? 1
        : ['LEISURE', 'GAMING'].includes(category)
          ? 3
          : 2;
  for (const goal of [...goals].sort(
    (a, b) =>
      rank[a.priority] - rank[b.priority] ||
      categoryRank(a.category) - categoryRank(b.category) ||
      (a.planningOrder ?? 0) - (b.planningOrder ?? 0) ||
      a.id.localeCompare(b.id),
  )) {
    const remaining = goal.target - goal.progress - (goal.plannedProgress ?? 0);
    if (remaining <= 0) continue;
    if (goal.category === 'STUDY' && studyBudget <= 0) continue;
    let duration =
      goal.category === 'GYM'
        ? p.gymDuration
        : Math.min(
            goal.unit === 'HOURS' ? remaining * 60 : goal.unit === 'MINUTES' ? remaining : 30,
            Math.max(
              1,
              goal.category === 'STUDY'
                ? Math.min(p.studyIdealMinutes ?? p.studyMinutes, studyBudget)
                : p.studyMinutes || 30,
            ),
          );
    const windows = freePeriods(
      startAt,
      day.endAt,
      available,
      goal.category === 'GYM' ? p.gymBuffer : 5,
    );
    if (goal.category === 'STUDY') {
      const maxSlot = Math.max(0, ...windows.map((w) => (+w.endAt - +w.startAt) / 60000));
      duration = Math.min(duration, maxSlot);
      if (
        duration <
        Math.min(
          p.studyMinutes || 30,
          goal.unit === 'HOURS' ? remaining * 60 : goal.unit === 'MINUTES' ? remaining : 30,
        )
      )
        continue;
    }
    const preferredPeriod = goal.category === 'GYM' ? p.gymPeriod : p.studyPeriod;
    const desiredHour =
      preferredPeriod === 'MORNING' ? 7 : preferredPeriod === 'AFTERNOON' ? 13 : 20;
    const preferred = DateTime.fromISO(date, { zone: p.timezone })
      .set({ hour: desiredHour })
      .toJSDate();
    const gymWindow = localInterval(date, p.gymMinTime, p.gymMaxTime, p.timezone);
    const candidates = windows
      .map((w) => {
        const min = Math.max(+w.startAt, goal.category === 'GYM' ? +gymWindow.startAt : -Infinity);
        const max = Math.min(+w.endAt, goal.category === 'GYM' ? +gymWindow.endAt : Infinity);
        if (max - min < duration * 60000) return null;
        const at = Math.min(Math.max(min, +preferred), max - duration * 60000);
        return {
          startAt: new Date(at),
          endAt: new Date(at + duration * 60000),
          score: Math.abs(at - +preferred),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.score - b.score || +a.startAt - +b.startAt);
    const slot = candidates[0];
    if (!slot) continue;
    const suggestion = {
      startAt: slot.startAt,
      endAt: slot.endAt,
      title: goal.topic ? `Estudar ${goal.topic}` : goal.name,
      category: goal.category,
      goalId: goal.id,
      reason: `${Math.round(remaining * 10) / 10} ${goal.unit === 'TIMES' ? 'vezes' : goal.unit === 'HOURS' ? 'horas' : 'minutos'} restantes na meta`,
      priority: goal.priority,
    };
    suggestions.push(suggestion);
    if (goal.category === 'STUDY') studyBudget -= duration;
    available.push(suggestion);
  }
  return suggestions.sort((a, b) => +a.startAt - +b.startAt);
}
export function streak(dates: string[], today: string) {
  const done = new Set(dates);
  let day = DateTime.fromISO(today);
  let count = 0;
  if (!done.has(today)) day = day.minus({ days: 1 });
  while (done.has(day.toISODate()!)) {
    count++;
    day = day.minus({ days: 1 });
  }
  return count;
}
