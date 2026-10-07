import { z } from 'zod';
import { DateTime, IANAZone } from 'luxon';
export const priorities = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'] as const;
export const initialCategories = [
  { key: 'WORK', name: 'Trabalho', emoji: '💻', color: '#93c5fd' },
  { key: 'COLLEGE', name: 'Faculdade', emoji: '🎓', color: '#c4b5fd' },
  { key: 'GYM', name: 'Academia', emoji: '🏋️', color: '#a3e635' },
  { key: 'STUDY', name: 'Estudo', emoji: '📚', color: '#fcd34d' },
  { key: 'SLEEP', name: 'Sono', emoji: '🌙', color: '#a5b4fc' },
  { key: 'WAKE_UP', name: 'Acordar', emoji: '☀️', color: '#fde68a' },
  { key: 'VOLLEYBALL', name: 'Vôlei', emoji: '🏐', color: '#fdba74' },
  { key: 'GAMING', name: 'Jogos', emoji: '🎮', color: '#f0abfc' },
  { key: 'LEISURE', name: 'Lazer', emoji: '✨', color: '#f9a8d4' },
  { key: 'PERSONAL', name: 'Pessoal', emoji: '📌', color: '#6ee7b7' },
  { key: 'OTHER', name: 'Outros', emoji: '🗓️', color: '#cbd5e1' },
] as const;
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Informe um horário válido.');
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, 'Data inválida.');
export const timezoneSchema = z
  .string()
  .refine((v) => IANAZone.isValidZone(v), 'Escolha um timezone IANA válido.');
const text = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, 'Preencha este campo.')
    .max(max)
    .refine(
      (v) => !/[<>]/.test(v) && [...v].every((c) => c.charCodeAt(0) > 8),
      'Use texto simples.',
    );
export const remindersSchema = z
  .array(z.number().int().min(0).max(10080))
  .max(10)
  .transform((v) => [...new Set(v)].sort((a, b) => b - a));
export const activityShape = {
  title: text(),
  category: text(50),
  emoji: z.string().min(1).max(12).default('📌'),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default('#a3e635'),
  priority: z.enum(priorities).default('NORMAL'),
  location: z.string().trim().max(300).default(''),
  notes: z.string().trim().max(2000).default(''),
  reminderMessages: z
    .record(
      z.string().regex(/^\d+$/),
      z.object({
        title: z.string().trim().min(1).max(200),
        body: z.string().trim().max(1000).default(''),
      }),
    )
    .default({}),
  reminderMinutes: remindersSchema.default([10, 0]),
};
export const routineSchema = z
  .object({
    ...activityShape,
    weekdays: z
      .array(z.number().int().min(1).max(7))
      .min(1)
      .max(7)
      .transform((v) => [...new Set(v)]),
    startTime: timeSchema,
    endTime: timeSchema,
    flexible: z.boolean().default(false),
    active: z.boolean().default(true),
    effectiveFrom: dateSchema.optional(),
  })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'O início e o fim devem ser diferentes.',
    path: ['endTime'],
  });
export const eventSchema = z
  .object({ ...activityShape, date: dateSchema, startTime: timeSchema, endTime: timeSchema })
  .refine((v) => v.startTime !== v.endTime, {
    message: 'O início e o fim devem ser diferentes.',
    path: ['endTime'],
  });
export const goalSchema = z.object({
  name: text(),
  category: text(50),
  target: z.number().positive().max(10080),
  unit: z.enum(['MINUTES', 'HOURS', 'TIMES']),
  period: z.enum(['DAILY', 'WEEKLY']),
  active: z.boolean().default(true),
  topic: z.string().trim().max(100).default(''),
  priority: z.enum(priorities).default('HIGH'),
  description: z.string().trim().max(2000).default(''),
  topics: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  planningOrder: z.number().int().min(0).max(100).default(0),
});
export const settingsSchema = z.object({
  timezone: timezoneSchema,
  wakeTime: timeSchema,
  sleepTime: timeSchema,
  sleepHours: z.number().min(3).max(14),
  windDownMinutes: z.number().int().min(0).max(180),
  gymTimes: z.number().int().min(0).max(7),
  gymDuration: z.number().int().min(10).max(240),
  gymPeriod: z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
  gymMinTime: timeSchema,
  gymMaxTime: timeSchema,
  gymBuffer: z.number().int().min(0).max(120),
  studyMinutes: z.number().int().min(0).max(600),
  studyIdealMinutes: z.number().int().min(1).max(600).default(60),
  locale: z.literal('pt-BR').default('pt-BR'),
  timeFormat: z.literal('24h').default('24h'),
  weekStartsOn: z.literal(1).default(1),
  studyPeriod: z.enum(['MORNING', 'AFTERNOON', 'EVENING']),
  autoPlan: z.boolean(),
  notificationsDesired: z.boolean(),
  theme: z.enum(['dark', 'light']),
  categoryReminders: z.record(z.string(), remindersSchema),
});
export const registerSchema = z.object({
  name: text(80),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(10, 'Use pelo menos 10 caracteres.').max(128),
  timezone: timezoneSchema.default('America/Sao_Paulo'),
});
export const loginSchema = registerSchema
  .pick({ email: true })
  .extend({ password: z.string().min(1, 'Informe sua senha.').max(128) });
export const completionSchema = z.object({
  status: z.enum(['COMPLETED', 'SKIPPED', 'MISSED', 'PARTIAL']),
  actualDuration: z.number().int().min(0).max(1440).optional(),
  notes: z.string().max(2000).default(''),
});
export const exceptionSchema = z
  .object({
    scope: z.enum(['TODAY', 'FUTURE']),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    title: text().optional(),
    skipped: z.boolean().default(false),
  })
  .refine((v) => (v.startTime === undefined) === (v.endTime === undefined), {
    message: 'Informe os dois horários.',
    path: ['endTime'],
  });
export const snoozeSchema = z.object({
  minutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]),
});
export const focusSchema = z.object({
  title: text(),
  category: text(50),
  plannedMinutes: z.number().int().min(1).max(720),
  occurrenceId: z.uuid().optional(),
  goalId: z.uuid().optional(),
  technology: z.string().trim().max(80).default(''),
});
export const finishFocusSchema = z.object({
  studied: z.string().trim().max(300).default(''),
  learning: z.string().trim().max(2000).default(''),
});
export const incidentTechnologies = [
  'Node.js',
  'NestJS',
  'React',
  'Next.js',
  'Java',
  'Spring',
  'Banco',
  'AWS',
  'API',
  'Outro',
] as const;
export const studyTechnologies = [
  'Node.js',
  'NestJS',
  'React',
  'Next.js',
  'Java',
  'Faculdade',
  'Outro',
] as const;
export const incidentSchema = z.object({
  title: text(160),
  technology: z.enum(incidentTechnologies),
  error: z.string().trim().max(2000).default(''),
  hypothesis: z.string().trim().max(2000).default(''),
  cause: z.string().trim().max(2000).default(''),
  solution: z.string().trim().max(2000).default(''),
  learning: z.string().trim().max(2000).default(''),
});
export const onboardingSchema = z.object({
  settings: settingsSchema,
  workDays: z.array(z.number().int().min(1).max(7)),
  workStart: timeSchema,
  workEnd: timeSchema,
  college: z.boolean(),
  collegeDays: z.array(z.number().int().min(1).max(7)),
  collegeStart: timeSchema,
  collegeEnd: timeSchema,
  gym: z.boolean(),
  study: z.boolean(),
});
export const categorySchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,49}$/),
  name: text(50),
  emoji: z.string().min(1).max(12),
  color: activityShape.color,
});
export type RoutineInput = z.infer<typeof routineSchema>;
export type EventInput = z.infer<typeof eventSchema>;
export type GoalInput = z.infer<typeof goalSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type OnboardingInput = z.infer<typeof onboardingSchema>;
export type Priority = (typeof priorities)[number];
