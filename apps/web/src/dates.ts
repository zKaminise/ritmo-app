import { DateTime } from 'luxon';
export const clock = (iso: string, zone: string) =>
  DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
export const today = (zone: string) => DateTime.now().setZone(zone).toISODate()!;
export const dayLabel = (date: string, zone: string) =>
  DateTime.fromISO(date, { zone, locale: 'pt-BR' }).toFormat("cccc, d 'de' LLLL");
export function duration(minutes: number) {
  const min = Math.max(0, Math.round(minutes));
  return min >= 60
    ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}min`
    : `${min} min`;
}
export function until(iso: string) {
  return Math.max(0, Math.ceil((+new Date(iso) - Date.now()) / 60000));
}
export function countdown(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((+new Date(iso) - now) / 1000));
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export const weekdays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
