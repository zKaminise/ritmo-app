import { DateTime } from 'luxon';
export interface Interval {
  startAt: Date;
  endAt: Date;
}
export interface Recurrence {
  id: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  active: boolean;
}
export interface RecurrenceException {
  localDate: string;
  skipped: boolean;
  startTime?: string | null;
  endTime?: string | null;
  title?: string | null;
}
export function localInterval(date: string, start: string, end: string, zone: string): Interval {
  const startAt = DateTime.fromISO(`${date}T${start}`, { zone });
  let endAt = DateTime.fromISO(`${date}T${end}`, { zone });
  if (!startAt.isValid || !endAt.isValid) throw new Error('Data ou timezone inválido.');
  if (endAt <= startAt) endAt = endAt.plus({ days: 1 });
  return { startAt: startAt.toUTC().toJSDate(), endAt: endAt.toUTC().toJSDate() };
}
export function overlaps(a: Interval, b: Interval) {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}
export function freePeriods(
  startAt: Date,
  endAt: Date,
  items: Interval[],
  bufferMinutes = 0,
): Interval[] {
  if (endAt <= startAt) return [];
  const buffer = Math.max(0, bufferMinutes) * 60000;
  const busy = items
    .map((i) => ({
      startAt: new Date(Math.max(+startAt, +i.startAt - buffer)),
      endAt: new Date(Math.min(+endAt, +i.endAt + buffer)),
    }))
    .filter((i) => i.endAt > i.startAt)
    .sort((a, b) => +a.startAt - +b.startAt);
  let cursor = +startAt;
  const result: Interval[] = [];
  for (const i of busy) {
    if (+i.startAt > cursor) result.push({ startAt: new Date(cursor), endAt: i.startAt });
    cursor = Math.max(cursor, +i.endAt);
  }
  if (cursor < +endAt) result.push({ startAt: new Date(cursor), endAt });
  return result;
}
export function recurrenceDates(
  rule: Recurrence,
  from: Date,
  days = 15,
  exceptions: RecurrenceException[] = [],
) {
  if (!rule.active) return [];
  const result: (Interval & {
    localDate: string;
    skipped: boolean;
    title?: string | null;
    overridden: boolean;
    sourceKey: string;
  })[] = [];
  const first = DateTime.fromJSDate(from, { zone: rule.timezone }).startOf('day');
  for (let n = 0; n < days; n++) {
    const day = first.plus({ days: n });
    const localDate = day.toISODate()!;
    if (
      localDate < rule.effectiveFrom ||
      (rule.effectiveUntil && localDate > rule.effectiveUntil) ||
      !rule.weekdays.includes(day.weekday)
    )
      continue;
    const ex = exceptions.find((e) => e.localDate === localDate);
    result.push({
      ...localInterval(
        localDate,
        ex?.startTime ?? rule.startTime,
        ex?.endTime ?? rule.endTime,
        rule.timezone,
      ),
      localDate,
      skipped: ex?.skipped ?? false,
      title: ex?.title,
      overridden: !!ex,
      sourceKey: `routine:${rule.id}:${localDate}`,
    });
  }
  return result;
}
export function reminderTimes(startAt: Date, offsets: number[]) {
  return [...new Set(offsets)].map((minutes) => ({
    minutes,
    scheduledAt: new Date(+startAt - minutes * 60000),
  }));
}
export function snoozeAt(now: Date, minutes: 5 | 10 | 15 | 30) {
  return new Date(+now + minutes * 60000);
}
export function periodStart(now: Date, zone: string, period: 'DAILY' | 'WEEKLY') {
  return DateTime.fromJSDate(now, { zone })
    .startOf(period === 'DAILY' ? 'day' : 'week')
    .toJSDate();
}
export function minutesBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((+b - +a) / 60000));
}
export function sleepMinutes(sleep: string, wake: string, zone: string, date: string) {
  return minutesBetween(...(Object.values(localInterval(date, sleep, wake, zone)) as [Date, Date]));
}
