import { z } from 'zod';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import {
  initialCategories,
  timezoneSchema,
  settingsSchema,
  routineSchema,
  goalSchema,
} from '@ritmo/shared';
import { Database } from './database.js';
import { Materializer } from './materializer.js';
export const bootstrapSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
  timezone: timezoneSchema,
  resetPassword: z.boolean().default(false),
});
export async function bootstrapUser(db: Database, input: z.infer<typeof bootstrapSchema>) {
  const data = bootstrapSchema.parse(input);
  const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bootstrap:${data.email}`}))`;
    const existing = await tx.user.findUnique({ where: { email: data.email } });
    if (existing) {
      if (data.resetPassword) {
        await tx.user.update({ where: { id: existing.id }, data: { passwordHash } });
        await tx.session.deleteMany({ where: { userId: existing.id } });
      }
      return { id: existing.id, created: false, passwordReset: data.resetPassword };
    }
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        settings: { create: { timezone: data.timezone } },
        categories: { create: initialCategories.map((c) => ({ ...c })) },
      },
    });
    return { id: user.id, created: true, passwordReset: false };
  });
}
export const profileImportSchema = z.object({
  settings: settingsSchema.partial(),
  routines: z
    .array(
      z.object({
        key: z.string().min(1).max(80),
        managedKind: z.enum(['SLEEP', 'WAKE_UP', 'WIND_DOWN']).optional(),
        data: routineSchema,
      }),
    )
    .max(100),
  goals: z.array(z.object({ key: z.string().min(1).max(80), data: goalSchema })).max(100),
});
export async function importProfile(
  db: Database,
  userId: string,
  input: z.infer<typeof profileImportSchema>,
  replace = false,
) {
  const data = profileImportSchema.parse(input);
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
      const existing = await tx.userSettings.findUniqueOrThrow({ where: { userId } });
      const settings = settingsSchema.parse({ ...existing, ...data.settings });
      await tx.userSettings.update({
        where: { userId },
        data: { ...settings, onboardingDone: true },
      });
      const effectiveFrom = DateTime.now()
        .setZone(settings.timezone)
        .minus({ days: 1 })
        .toISODate()!;
      for (const item of data.routines) {
        const category = await tx.category.findUnique({
          where: { userId_key: { userId, key: item.data.category } },
        });
        if (!category) throw new Error('Categoria de rotina não cadastrada.');
        const rule = {
          ...item.data,
          timezone: settings.timezone,
          effectiveFrom: item.data.effectiveFrom ?? effectiveFrom,
          managedKind: item.managedKind ?? null,
        };
        await tx.routineRule.upsert({
          where: { userId_bootstrapKey: { userId, bootstrapKey: item.key } },
          create: { ...rule, userId, bootstrapKey: item.key },
          update: replace ? rule : {},
        });
      }
      for (const item of data.goals) {
        if (
          !(await tx.category.findUnique({
            where: { userId_key: { userId, key: item.data.category } },
          }))
        )
          throw new Error('Categoria de meta não cadastrada.');
        await tx.goal.upsert({
          where: { userId_bootstrapKey: { userId, bootstrapKey: item.key } },
          create: { ...item.data, userId, bootstrapKey: item.key },
          update: replace ? item.data : {},
        });
      }
    },
    { timeout: 30000 },
  );
  await new Materializer(db).run(userId, DateTime.now().minus({ days: 1 }).toJSDate(), 17);
  return { routines: data.routines.length, goals: data.goals.length };
}
