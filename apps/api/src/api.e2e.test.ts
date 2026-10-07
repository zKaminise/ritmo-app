import 'reflect-metadata';
import { config } from 'dotenv';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import webpush from 'web-push';
import * as argon2 from 'argon2';
import { bootstrapUser } from './admin.js';
import { Database } from './database.js';
import { Materializer } from './materializer.js';
import { ReminderWorker } from './worker.js';
import { PushService } from './push.js';
config({ quiet: true });
process.env.NODE_ENV = 'test';
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')
)
  throw new Error(
    'Configure TEST_DATABASE_URL apontando para um banco terminado em _test e aplique migrations antes do E2E.',
  );
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const vapid = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
process.env.VAPID_SUBJECT = 'mailto:test@ritmo.local';
describe('API NestJS + PostgreSQL real', () => {
  let app: INestApplication;
  let db: Database;
  let agent: ReturnType<typeof request.agent>;
  let other: ReturnType<typeof request.agent>;
  let userId: string;
  let otherId: string;
  let ruleId: string;
  let occurrenceId: string;
  let studyId: string;
  const zone = 'America/Sao_Paulo';
  const day = DateTime.now().setZone(zone).toISODate()!;
  const nextDay = DateTime.fromISO(day).plus({ days: 1 }).toISODate()!;
  const activity = {
    title: 'Trabalho E2E',
    category: 'WORK',
    emoji: '💻',
    color: '#93c5fd',
    priority: 'CRITICAL',
    startTime: '09:00',
    endTime: '18:00',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    reminderMinutes: [30, 10, 0],
    active: true,
    flexible: false,
  };
  beforeAll(async () => {
    const { createApp } = await import('./bootstrap.js');
    app = await createApp();
    await app.init();
    db = app.get(Database);
    agent = request.agent(app.getHttpServer());
    other = request.agent(app.getHttpServer());
    const suffix = randomUUID();
    const first = await agent.post('/api/auth/register').send({
      name: 'Teste',
      email: `test-${suffix}@ritmo.local`,
      password: 'SenhaTeste!123',
      timezone: zone,
    });
    expect(first.status).toBe(201);
    userId = first.body.id;
    const second = await other
      .post('/api/auth/register')
      .send({ name: 'Outro', email: `other-${suffix}@ritmo.local`, password: 'SenhaTeste!123' });
    otherId = second.body.id;
  });
  afterAll(async () => {
    if (db) {
      await db.user.deleteMany({ where: { id: { in: [userId, otherId].filter(Boolean) } } });
    }
    if (app) await app.close();
  });
  it('persiste sessão HttpOnly e autentica chamadas', async () => {
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.id).toBe(userId);
    expect(me.body.passwordHash).toBeUndefined();
    expect((await request(app.getHttpServer()).get('/api/routines')).status).toBe(401);
  });
  it('valida DTOs e bloqueia origem estrangeira', async () => {
    expect((await agent.post('/api/routines').send({ title: 'Inválida' })).status).toBe(400);
    expect(
      (await agent.post('/api/events').set('Origin', 'https://outro.example').send({})).status,
    ).toBe(403);
  });
  it('cria rotina, 16 dias de ocorrências e lembretes idempotentes', async () => {
    const created = await agent.post('/api/routines').send(activity);
    expect(created.status).toBe(201);
    ruleId = created.body.id;
    let occurrences = await db.scheduledOccurrence.findMany({
      where: { routineId: ruleId },
      orderBy: { startAt: 'asc' },
    });
    expect(occurrences.length).toBeGreaterThanOrEqual(15);
    occurrenceId = occurrences.find((o) => o.localDate === day)!.id;
    const count = await db.reminder.count({ where: { occurrence: { routineId: ruleId } } });
    await app.get(Materializer).run(userId);
    expect(await db.reminder.count({ where: { occurrence: { routineId: ruleId } } })).toBe(count);
    occurrences = await db.scheduledOccurrence.findMany({ where: { routineId: ruleId } });
    expect(occurrences.find((o) => o.id === occurrenceId)?.startAt.toISOString()).toContain(
      'T12:00:00.000Z',
    );
  });
  it('aplica exceção só hoje e permite adiar sem mover compromisso', async () => {
    expect(
      (
        await agent
          .patch(`/api/occurrences/${occurrenceId}`)
          .send({ scope: 'TODAY', startTime: '10:00', endTime: '11:00' })
      ).status,
    ).toBe(200);
    const updated = await db.scheduledOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
    expect(updated.startAt.toISOString()).toContain('T13:00:00.000Z');
    const tomorrow = await db.scheduledOccurrence.findFirstOrThrow({
      where: { routineId: ruleId, localDate: nextDay },
    });
    expect(tomorrow.startAt.toISOString()).toContain('T12:00:00.000Z');
    const snooze = await agent
      .post(`/api/occurrences/${occurrenceId}/snooze`)
      .send({ minutes: 10 });
    expect(snooze.status).toBe(201);
    expect(Math.abs(+new Date(snooze.body.scheduledAt) - Date.now() - 600000)).toBeLessThan(5000);
    await app.get(Materializer).run(userId);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: snooze.body.id } })).status).toBe(
      'PENDING',
    );
    expect(
      (await db.scheduledOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } })).startAt,
    ).toEqual(updated.startAt);
  });
  it('detecta conflito e permite manter ambos', async () => {
    const event = {
      title: 'Campeonato',
      category: 'GAMING',
      date: day,
      startTime: '10:30',
      endTime: '12:00',
      priority: 'LOW',
    };
    const conflicts = await agent.post('/api/events/conflicts').send(event);
    expect(conflicts.body.some((o: { id: string }) => o.id === occurrenceId)).toBe(true);
    const saved = await agent.post('/api/events').send(event);
    expect(saved.status).toBe(201);
    expect(saved.body.conflicts.length).toBeGreaterThan(0);
    expect(saved.body.occurrence.id).toBeTruthy();
  });
  it('autoriza apenas o proprietário da ocorrência', async () => {
    expect((await other.get(`/api/occurrences/${occurrenceId}`)).status).toBe(404);
    expect(
      (
        await other
          .post(`/api/occurrences/${occurrenceId}/completion`)
          .send({ status: 'COMPLETED' })
      ).status,
    ).toBe(404);
    expect((await other.put(`/api/routines/${ruleId}`).send(activity)).status).toBe(404);
  });
  it('registra conclusão uma vez e calcula progresso da meta', async () => {
    expect(
      (
        await agent.post('/api/goals').send({
          name: 'Java',
          category: 'STUDY',
          target: 30,
          unit: 'MINUTES',
          period: 'DAILY',
          topic: 'Java',
        })
      ).status,
    ).toBe(201);
    const event = await agent.post('/api/events').send({
      title: 'Estudar Java',
      category: 'STUDY',
      date: day,
      startTime: '19:00',
      endTime: '19:30',
    });
    studyId = event.body.occurrence.id;
    for (let n = 0; n < 2; n++)
      expect(
        (
          await agent
            .post(`/api/occurrences/${studyId}/completion`)
            .send({ status: 'COMPLETED', actualDuration: 30 })
        ).status,
      ).toBe(201);
    expect(await db.completionLog.count({ where: { occurrenceId: studyId } })).toBe(1);
    const goals = await agent.get('/api/goals');
    expect(goals.body[0].progress).toBe(30);
    expect(goals.body[0].percentage).toBe(100);
  });
  it('divide recorrência a partir da data selecionada', async () => {
    const tomorrow = await db.scheduledOccurrence.findFirstOrThrow({
      where: { routineId: ruleId, localDate: nextDay },
    });
    expect(
      (
        await agent
          .patch(`/api/occurrences/${tomorrow.id}`)
          .send({ scope: 'FUTURE', startTime: '08:00', endTime: '09:00' })
      ).status,
    ).toBe(200);
    const old = await db.routineRule.findUniqueOrThrow({ where: { id: ruleId } });
    expect(old.effectiveUntil).toBe(day);
    expect(
      (
        await db.scheduledOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } })
      ).startAt.toISOString(),
    ).toContain('T13:00:00.000Z');
    const future = await db.scheduledOccurrence.findFirstOrThrow({
      where: { userId, category: 'WORK', localDate: nextDay, status: 'SCHEDULED' },
    });
    expect(future.startAt.toISOString()).toContain('T11:00:00.000Z');
  });
  it('registra foco real e encerra de forma idempotente', async () => {
    const start = await agent
      .post('/api/focus-sessions')
      .send({ title: 'Estudar Java', category: 'STUDY', plannedMinutes: 20 });
    expect(start.status).toBe(201);
    await db.focusSession.update({
      where: { id: start.body.id },
      data: { startedAt: new Date(Date.now() - 15 * 60000) },
    });
    const finished = await agent.post(`/api/focus-sessions/${start.body.id}/finish`);
    expect(finished.body.actualDuration).toBe(15);
    expect(
      (await agent.post(`/api/focus-sessions/${start.body.id}/finish`)).body.actualDuration,
    ).toBe(15);
    expect((await agent.get('/api/goals')).body[0].progress).toBe(45);
  });
  it('reserva lembrete concorrentemente e impede envio duplicado', async () => {
    await db.userSettings.update({ where: { userId }, data: { notificationsDesired: true } });
    const future = new Date(Date.now() + 3600000);
    const occurrence = await db.scheduledOccurrence.create({
      data: {
        userId,
        sourceKey: `worker:${randomUUID()}`,
        localDate: day,
        title: 'Push E2E',
        category: 'OTHER',
        emoji: '🔔',
        color: '#a3e635',
        startAt: future,
        endAt: new Date(+future + 60000),
        timezone: zone,
        priority: 'NORMAL',
        location: '',
        notes: '',
      },
    });
    const subscription = await db.pushSubscription.create({
      data: {
        userId,
        endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
        p256dh: 'test',
        auth: 'test',
      },
    });
    const now = new Date();
    const reminder = await db.reminder.create({
      data: {
        occurrenceId: occurrence.id,
        key: `worker:${randomUUID()}`,
        scheduledAt: now,
        nextAttemptAt: now,
        title: 'Push E2E',
        body: 'Teste',
      },
    });
    const worker = app.get(ReminderWorker);
    const push = app.get(PushService);
    const send = vi
      .spyOn(push, 'send')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    const claims = await Promise.all([worker.claim(), worker.claim()]);
    expect(claims.flat().filter((r) => r.id === reminder.id)).toHaveLength(1);
    await Promise.all([push.process(reminder.id), push.process(reminder.id)]);
    await push.process(reminder.id);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.notificationDelivery.findUniqueOrThrow({
          where: {
            reminderId_subscriptionId: { reminderId: reminder.id, subscriptionId: subscription.id },
          },
        })
      ).status,
    ).toBe('SENT');
    expect((await db.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe(
      'SENT',
    );
    send.mockRestore();
  });
  it('worker recupera reserva interrompida sem reenviar entrega incerta', async () => {
    const occurrence = await db.scheduledOccurrence.findFirstOrThrow({
      where: { userId, sourceKey: { startsWith: 'worker:' } },
    });
    const sub = await db.pushSubscription.findFirstOrThrow({ where: { userId } });
    const old = new Date(Date.now() - 15 * 60000);
    const r = await db.reminder.create({
      data: {
        occurrenceId: occurrence.id,
        key: `stale:${randomUUID()}`,
        scheduledAt: old,
        nextAttemptAt: old,
        status: 'PROCESSING',
        claimedAt: old,
        title: 'Interrompida',
        body: '',
      },
    });
    await db.notificationDelivery.create({
      data: { reminderId: r.id, subscriptionId: sub.id, status: 'PROCESSING', attempts: 1 },
    });
    await app.get(ReminderWorker).recover();
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('FAILED');
    expect(
      (await db.notificationDelivery.findFirstOrThrow({ where: { reminderId: r.id } })).retryable,
    ).toBe(false);
  });
  it('fornece dashboard, planner, OpenAPI e endpoint de teste real', async () => {
    expect((await agent.get('/api/dashboard')).status).toBe(200);
    expect((await agent.get(`/api/planner?date=${day}`)).status).toBe(200);
    const openapi = await agent.get('/api/openapi.json');
    expect(openapi.body.paths['/api/push/test']).toBeDefined();
    expect(openapi.body.paths['/api/routines'].post.requestBody).toBeDefined();
    const test = await agent.post('/api/push/test');
    expect(test.status).toBe(201);
    expect(test.body.reminderId).toBeTruthy();
  });
  it('registra subscription validada e desativa dispositivo expirado (410)', async () => {
    await db.pushSubscription.updateMany({ where: { userId }, data: { active: false } });
    const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
    const subscribed = await agent
      .post('/api/push/subscriptions')
      .send({ endpoint, keys: { p256dh: vapid.publicKey, auth: 'AAECAwQFBgcICQoLDA0ODw' } });
    expect(subscribed.status).toBe(201);
    expect(
      (await db.userSettings.findUniqueOrThrow({ where: { userId } })).notificationsDesired,
    ).toBe(true);
    expect(
      (
        await agent.post('/api/push/subscriptions').send({
          endpoint: 'https://127.0.0.1/internal',
          keys: { p256dh: vapid.publicKey, auth: 'AAECAwQFBgcICQoLDA0ODw' },
        })
      ).status,
    ).toBe(400);
    const queued = await app.get(PushService).test(userId);
    await app.get(ReminderWorker).claim();
    const send = vi
      .spyOn(app.get(PushService), 'send')
      .mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    await app.get(PushService).process(queued.reminderId);
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).active).toBe(
      false,
    );
    expect((await db.reminder.findUniqueOrThrow({ where: { id: queued.reminderId } })).status).toBe(
      'FAILED',
    );
    send.mockRestore();
  });
  it('retenta apenas dispositivo que falhou sem duplicar o que recebeu', async () => {
    await db.pushSubscription.updateMany({ where: { userId }, data: { active: false } });
    const subscriptions = await Promise.all(
      ['a', 'b'].map((s) =>
        db.pushSubscription.create({
          data: {
            userId,
            endpoint: `https://fcm.googleapis.com/fcm/send/${s}-${randomUUID()}`,
            p256dh: vapid.publicKey,
            auth: 'AAECAwQFBgcICQoLDA0ODw',
          },
        }),
      ),
    );
    const push = app.get(PushService);
    const queued = await push.test(userId);
    await app.get(ReminderWorker).claim();
    let retryFails = true;
    const send = vi.spyOn(push, 'send').mockImplementation(async (subscription) => {
      if (subscription.endpoint === subscriptions[1]!.endpoint && retryFails)
        throw Object.assign(new Error('Unavailable'), { statusCode: 503 });
      return { statusCode: 201, body: '', headers: {} };
    });
    await push.process(queued.reminderId);
    expect((await db.reminder.findUniqueOrThrow({ where: { id: queued.reminderId } })).status).toBe(
      'PENDING',
    );
    retryFails = false;
    await db.reminder.update({
      where: { id: queued.reminderId },
      data: { nextAttemptAt: new Date() },
    });
    await app.get(ReminderWorker).claim();
    await push.process(queued.reminderId);
    expect(send.mock.calls.filter(([s]) => s.endpoint === subscriptions[0]!.endpoint)).toHaveLength(
      1,
    );
    expect(send.mock.calls.filter(([s]) => s.endpoint === subscriptions[1]!.endpoint)).toHaveLength(
      2,
    );
    expect((await db.reminder.findUniqueOrThrow({ where: { id: queued.reminderId } })).status).toBe(
      'SENT',
    );
    send.mockRestore();
  });
  it('atualiza sono gerado pelo onboarding e respeita pausa de notificações', async () => {
    const me = await agent.get('/api/auth/me');
    const settings = {
      ...me.body.settings,
      sleepTime: '22:30',
      wakeTime: '06:00',
      notificationsDesired: false,
    };
    expect(
      (
        await agent.post('/api/settings/onboarding').send({
          settings,
          workDays: [],
          workStart: '09:00',
          workEnd: '18:00',
          college: false,
          collegeDays: [],
          collegeStart: '19:00',
          collegeEnd: '20:30',
          gym: false,
          study: false,
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await agent
          .put('/api/settings')
          .send({ ...settings, sleepTime: '22:00', wakeTime: '05:30' })
      ).status,
    ).toBe(200);
    const sleep = await db.routineRule.findFirstOrThrow({
      where: { userId, managedKind: 'SLEEP' },
    });
    expect(sleep.startTime).toBe('22:00');
    expect(sleep.endTime).toBe('05:30');
    const occurrence = await db.scheduledOccurrence.findFirstOrThrow({
      where: { userId, sourceKey: { startsWith: 'worker:' } },
    });
    const now = new Date();
    const r = await db.reminder.create({
      data: {
        occurrenceId: occurrence.id,
        key: `paused:${randomUUID()}`,
        scheduledAt: now,
        nextAttemptAt: now,
        title: 'Pausa',
        body: '',
      },
    });
    await app.get(ReminderWorker).claim();
    const send = vi.spyOn(app.get(PushService), 'send');
    await app.get(PushService).process(r.id);
    expect(send).not.toHaveBeenCalled();
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('CANCELLED');
    send.mockRestore();
  });
  it('tick do scheduler consulta vencidos e envia sem repetir no próximo ciclo', async () => {
    await db.userSettings.update({ where: { userId }, data: { notificationsDesired: true } });
    await db.reminder.updateMany({
      where: { occurrence: { userId }, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });
    const occurrence = await db.scheduledOccurrence.findFirstOrThrow({
      where: { userId, sourceKey: { startsWith: 'worker:' } },
    });
    const now = new Date();
    const r = await db.reminder.create({
      data: {
        occurrenceId: occurrence.id,
        key: `tick:${randomUUID()}`,
        scheduledAt: now,
        nextAttemptAt: now,
        title: 'Agora',
        body: 'Tick',
      },
    });
    const push = app.get(PushService);
    const worker = app.get(ReminderWorker);
    const send = vi
      .spyOn(push, 'send')
      .mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await worker.tick();
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('SENT');
    const count = send.mock.calls.length;
    expect(count).toBe(2);
    await worker.tick();
    expect(send).toHaveBeenCalledTimes(count);
    send.mockRestore();
  });
  it('bootstrap cria conta com senha administrativa de 8 caracteres sem duplicar e redefine explicitamente', async () => {
    const email = `bootstrap-${randomUUID()}@ritmo.local`;
    const input = {
      name: 'Conta administrativa de teste',
      email,
      password: 'Test8Ab!',
      timezone: zone,
      resetPassword: false,
    };
    const created = await bootstrapUser(db, input);
    try {
      const repeat = await bootstrapUser(db, { ...input, password: 'Other8Ab!' });
      expect(repeat.id).toBe(created.id);
      expect(repeat.created).toBe(false);
      let user = await db.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(await argon2.verify(user.passwordHash, input.password)).toBe(true);
      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email, password: input.password });
      expect(login.status).toBe(201);
      await bootstrapUser(db, { ...input, password: 'Other8Ab!', resetPassword: true });
      user = await db.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(await argon2.verify(user.passwordHash, 'Other8Ab!')).toBe(true);
      expect(await db.session.count({ where: { userId: created.id } })).toBe(0);
    } finally {
      await db.user.delete({ where: { id: created.id } });
    }
  });
  it('associa estudo NestJS à meta de tecnologias e preserva anotações no histórico', async () => {
    const goal = await agent.post('/api/goals').send({
      name: 'Desenvolvimento backend',
      category: 'STUDY',
      target: 3,
      unit: 'HOURS',
      period: 'WEEKLY',
      topics: ['Node.js', 'NestJS', 'React', 'Next.js'],
      description: 'Aprendizado técnico',
      planningOrder: 0,
    });
    expect(goal.status).toBe(201);
    const start = await agent.post('/api/focus-sessions').send({
      title: 'Estudar NestJS',
      technology: 'NestJS',
      category: 'STUDY',
      plannedMinutes: 60,
    });
    expect(start.body.goalId).toBe(goal.body.id);
    await db.focusSession.update({
      where: { id: start.body.id },
      data: { startedAt: new Date(Date.now() - 45 * 60000) },
    });
    const finished = await agent.post(`/api/focus-sessions/${start.body.id}/finish`).send({
      studied: 'Controllers e Services',
      learning: 'Fluxo de dependências entre componentes.',
    });
    expect(finished.body.actualDuration).toBe(45);
    expect(finished.body.studied).toBe('Controllers e Services');
    const goals = await agent.get('/api/goals');
    expect(goals.body.find((g: { id: string }) => g.id === goal.body.id).progress).toBe(0.75);
    for (const period of ['today', 'week', 'month']) {
      const history = await agent.get(`/api/learning/history?period=${period}`);
      expect(history.status).toBe(200);
      expect(
        history.body.some(
          (s: { id: string; learning: string }) =>
            s.id === start.body.id && s.learning === 'Fluxo de dependências entre componentes.',
        ),
      ).toBe(true);
    }
    expect(
      (
        await other
          .post('/api/focus-sessions')
          .send({ title: 'Estudar', category: 'STUDY', goalId: goal.body.id, plannedMinutes: 30 })
      ).status,
    ).toBe(400);
  });
  it('separa meta Java da meta Node e valida propriedade do histórico', async () => {
    const goal = await agent.post('/api/goals').send({
      name: 'Curso Java',
      category: 'STUDY',
      target: 4,
      unit: 'HOURS',
      period: 'WEEKLY',
      topics: ['Java', 'Spring'],
      planningOrder: 1,
    });
    const before = await agent.get('/api/goals');
    const baseline = before.body.find((g: { id: string }) => g.id === goal.body.id).progress;
    const start = await agent.post('/api/focus-sessions').send({
      title: 'Estudar Java',
      technology: 'Java',
      category: 'STUDY',
      goalId: goal.body.id,
      plannedMinutes: 60,
    });
    await db.focusSession.update({
      where: { id: start.body.id },
      data: { startedAt: new Date(Date.now() - 60 * 60000) },
    });
    await agent
      .post(`/api/focus-sessions/${start.body.id}/finish`)
      .send({ studied: 'Spring Boot' });
    const goals = await agent.get('/api/goals');
    expect(goals.body.find((g: { id: string }) => g.id === goal.body.id).progress).toBe(
      baseline + 1,
    );
    expect(
      goals.body.find((g: { name: string }) => g.name === 'Desenvolvimento backend').progress,
    ).toBe(0.75);
    const history = await other.get('/api/learning/history?period=month');
    expect(history.body.some((s: { id: string }) => s.id === start.body.id)).toBe(false);
  });
  it('incidentes têm CRUD autenticado e autorização por usuário', async () => {
    const created = await agent.post('/api/learning/incidents').send({
      title: 'Falha de integração',
      technology: 'API',
      error: 'Timeout',
      hypothesis: 'Latência',
      cause: 'Conexão',
      solution: 'Ajuste de timeout',
      learning: 'Validar as hipóteses.',
    });
    expect(created.status).toBe(201);
    expect(
      (
        await other
          .put(`/api/learning/incidents/${created.body.id}`)
          .send({ title: 'Outro', technology: 'API' })
      ).status,
    ).toBe(404);
    expect((await other.delete(`/api/learning/incidents/${created.body.id}`)).status).toBe(404);
    const updated = await agent
      .put(`/api/learning/incidents/${created.body.id}`)
      .send({ title: 'Falha investigada', technology: 'Node.js', learning: 'Verificar métricas.' });
    expect(updated.status).toBe(200);
    const list = await agent.get('/api/learning/incidents');
    expect(
      list.body.some(
        (i: { id: string; title: string }) =>
          i.id === created.body.id && i.title === 'Falha investigada',
      ),
    ).toBe(true);
    expect((await agent.delete(`/api/learning/incidents/${created.body.id}`)).status).toBe(200);
    expect(
      (await request(app.getHttpServer()).post('/api/learning/incidents').send({})).status,
    ).toBe(401);
  });
  it('lembrete de 1 minuto é persistido e protegido por autenticação', async () => {
    expect((await request(app.getHttpServer()).post('/api/push/reminder-test')).status).toBe(401);
    const created = await agent.post('/api/push/reminder-test');
    expect(created.status).toBe(201);
    expect(Math.abs(+new Date(created.body.scheduledAt) - Date.now() - 60000)).toBeLessThan(3000);
    const reminder = await db.reminder.findUniqueOrThrow({
      where: { id: created.body.reminderId },
    });
    expect(reminder.status).toBe('PENDING');
    expect(reminder.title).toBe('🔔 Ritmo funcionando');
    const diagnostic = await agent.get('/api/push/diagnostics');
    expect(diagnostic.body.timezone).toBe(zone);
    expect(diagnostic.body.backend).toBe('online');
  });
});
