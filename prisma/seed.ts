import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import { initialCategories } from '@ritmo/shared';
import { Database } from '../apps/api/src/database.js';
import { Materializer } from '../apps/api/src/materializer.js';
const db = new Database();
try {
  const email = process.env.DEMO_EMAIL ?? 'gabriel@ritmo.local';
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Seed já aplicado. Dados existentes preservados.');
    await new Materializer(db).run(existing.id);
  } else {
    const password = process.env.DEMO_PASSWORD || randomBytes(12).toString('base64url');
    const user = await db.user.create({
      data: {
        name: 'Gabriel',
        email,
        passwordHash: await argon2.hash(password),
        settings: {
          create: {
            timezone: 'America/Sao_Paulo',
            onboardingDone: true,
            wakeTime: '06:30',
            sleepTime: '23:00',
            sleepHours: 7.5,
            categoryReminders: {
              GYM: [30, 10, 0],
              WORK: [15, 0],
              SLEEP: [30, 0],
              COLLEGE: [30, 10, 0],
            },
          },
        },
        categories: { create: initialCategories.map((c) => ({ ...c })) },
      },
    });
    const base = {
      userId: user.id,
      timezone: 'America/Sao_Paulo',
      effectiveFrom: DateTime.now().setZone('America/Sao_Paulo').toISODate()!,
      notes: 'Exemplo demonstrativo. Edite como preferir.',
      location: '',
    };
    for (const rule of [
      {
        title: 'Trabalho',
        category: 'WORK',
        emoji: '💻',
        color: '#93c5fd',
        weekdays: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '12:00',
        priority: 'CRITICAL' as const,
        reminderMinutes: [15, 0],
      },
      {
        title: 'Trabalho',
        category: 'WORK',
        emoji: '💻',
        color: '#93c5fd',
        weekdays: [1, 2, 3, 4, 5],
        startTime: '13:00',
        endTime: '18:00',
        priority: 'CRITICAL' as const,
        reminderMinutes: [15, 0],
      },
      {
        title: 'Almoço',
        category: 'PERSONAL',
        emoji: '🍽️',
        color: '#6ee7b7',
        weekdays: [1, 2, 3, 4, 5],
        startTime: '12:00',
        endTime: '13:00',
        flexible: true,
        priority: 'NORMAL' as const,
        reminderMinutes: [0],
      },
      {
        title: 'Faculdade',
        category: 'COLLEGE',
        emoji: '🎓',
        color: '#c4b5fd',
        weekdays: [1, 5],
        startTime: '19:00',
        endTime: '20:30',
        priority: 'CRITICAL' as const,
        reminderMinutes: [30, 10, 0],
      },
      {
        title: 'Faculdade',
        category: 'COLLEGE',
        emoji: '🎓',
        color: '#c4b5fd',
        weekdays: [2, 4],
        startTime: '21:00',
        endTime: '22:30',
        priority: 'CRITICAL' as const,
        reminderMinutes: [30, 10, 0],
      },
      {
        title: 'Faculdade',
        category: 'COLLEGE',
        emoji: '🎓',
        color: '#c4b5fd',
        weekdays: [3],
        startTime: '19:00',
        endTime: '22:30',
        priority: 'CRITICAL' as const,
        reminderMinutes: [30, 10, 0],
      },
      {
        title: 'Dormir',
        managedKind: 'SLEEP',
        category: 'SLEEP',
        emoji: '🌙',
        color: '#a5b4fc',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: '23:00',
        endTime: '06:30',
        priority: 'HIGH' as const,
        reminderMinutes: [30, 0],
      },
      {
        title: 'Começar o dia',
        managedKind: 'WAKE_UP',
        category: 'WAKE_UP',
        emoji: '☀️',
        color: '#fde68a',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: '06:30',
        endTime: '06:45',
        priority: 'HIGH' as const,
        reminderMinutes: [0],
      },
      {
        title: 'Academia',
        category: 'GYM',
        emoji: '🏋️',
        color: '#a3e635',
        weekdays: [1, 2, 3, 4, 5],
        startTime: '07:00',
        endTime: '08:00',
        flexible: true,
        priority: 'HIGH' as const,
        reminderMinutes: [30, 10, 0],
      },
      {
        title: 'Estudar Java',
        category: 'STUDY',
        emoji: '📚',
        color: '#fcd34d',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        startTime: '20:00',
        endTime: '20:30',
        flexible: true,
        priority: 'HIGH' as const,
        reminderMinutes: [10, 0],
      },
    ])
      await db.routineRule.create({ data: { ...base, ...rule } });
    for (const goal of [
      {
        name: 'Academia',
        category: 'GYM',
        target: 5,
        unit: 'TIMES' as const,
        period: 'WEEKLY' as const,
      },
      {
        name: 'Estudo diário',
        category: 'STUDY',
        target: 30,
        unit: 'MINUTES' as const,
        period: 'DAILY' as const,
      },
      {
        name: 'Java',
        category: 'STUDY',
        target: 3,
        unit: 'HOURS' as const,
        period: 'WEEKLY' as const,
        topic: 'Java',
      },
      {
        name: 'Node.js',
        category: 'STUDY',
        target: 2,
        unit: 'HOURS' as const,
        period: 'WEEKLY' as const,
        topic: 'Node',
      },
      {
        name: 'Sono no horário',
        category: 'SLEEP',
        target: 5,
        unit: 'TIMES' as const,
        period: 'WEEKLY' as const,
      },
    ])
      await db.goal.create({ data: { userId: user.id, ...goal } });
    await new Materializer(db).run(user.id);
    console.log(
      `Demo criada: ${email}\nSenha: ${password}\nGuarde esta senha. O seed é opcional e idempotente.`,
    );
  }
} finally {
  await db.$disconnect();
}
