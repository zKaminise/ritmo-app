import type { SettingsInput, RoutineInput, GoalInput } from '@ritmo/shared';
export interface Category {
  id: string;
  key: string;
  name: string;
  emoji: string;
  color: string;
}
export interface Settings extends SettingsInput {
  id: string;
  userId: string;
  onboardingDone: boolean;
}
export interface User {
  id: string;
  name: string;
  email: string;
  settings: Settings;
  categories: Category[];
}
export interface Occurrence {
  id: string;
  userId: string;
  routineId: string | null;
  eventId: string | null;
  localDate: string;
  title: string;
  category: string;
  emoji: string;
  color: string;
  startAt: string;
  endAt: string;
  timezone: string;
  flexible: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  location: string;
  notes: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'SKIPPED' | 'MISSED' | 'PARTIAL';
  reminders?: Reminder[];
  reminderMinutes?: number[];
  reminderMessages?: Record<string, { title: string; body: string }>;
  goalId?: string | null;
  completion?: { actualDuration: number; notes: string; status: string } | null;
}
export interface Routine extends RoutineInput {
  id: string;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
}
export interface Goal extends GoalInput {
  id: string;
  progress: number;
  percentage: number;
}
export interface Slot {
  startAt: string;
  endAt: string;
}
export interface Suggestion extends Slot {
  title: string;
  category: string;
  goalId: string;
  reason: string;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
}
export interface Focus {
  id: string;
  title: string;
  category: string;
  plannedMinutes: number;
  startedAt: string;
  endedAt: string | null;
  actualDuration: number;
  occurrenceId: string | null;
  goalId: string | null;
  technology: string;
  studied: string;
  learning: string;
  goal?: { id: string; name: string } | null;
}
export interface Incident {
  id: string;
  title: string;
  technology: string;
  error: string;
  hypothesis: string;
  cause: string;
  solution: string;
  learning: string;
  createdAt: string;
  updatedAt: string;
}
export interface Dashboard {
  now: string;
  date: string;
  settings: Settings;
  occurrences: Occurrence[];
  current: Occurrence | null;
  next: Occurrence | null;
  free: Slot[];
  goals: Goal[];
  suggestions: Suggestion[];
  focus: Focus | null;
  streaks: { study: number; gym: number };
}
export interface Reminder {
  id: string;
  title: string;
  body: string;
  scheduledAt: string;
  status: string;
  attempts: number;
  lastError: string | null;
  deliveries?: { status: string; attempts: number; lastError: string | null }[];
}
