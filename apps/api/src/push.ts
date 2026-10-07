import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Database } from './database.js';
import { DateTime } from 'luxon';
const providers = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  'push.apple.com',
  'notify.windows.com',
];
export const subscriptionSchema = z.object({
  endpoint: z
    .url()
    .max(2048)
    .refine((value) => {
      const u = new URL(value);
      return (
        u.protocol === 'https:' &&
        !u.port &&
        !u.username &&
        !u.password &&
        providers.some((p) => u.hostname === p || u.hostname.endsWith(`.${p}`))
      );
    }, 'Este serviço de push não é compatível.'),
  keys: z.object({
    p256dh: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(80)
      .max(100),
    auth: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .min(20)
      .max(30),
  }),
});
@Injectable()
export class PushService {
  private readonly logger = new Logger('WebPush');
  readonly configured = !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
  constructor(@Inject(Database) private readonly db: Database) {
    if (this.configured)
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );
  }
  config() {
    return { configured: this.configured, publicKey: process.env.VAPID_PUBLIC_KEY ?? null };
  }
  async subscribe(userId: string, input: z.infer<typeof subscriptionSchema>, userAgent: string) {
    if (!this.configured)
      throw new BadRequestException(
        'Configure as chaves VAPID no servidor para ativar notificações.',
      );
    const old = await this.db.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (old && old.userId !== userId)
      await this.db.notificationDelivery.deleteMany({ where: { subscriptionId: old.id } });
    const result = await this.db.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent.slice(0, 500),
      },
      update: {
        userId,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        active: true,
        userAgent: userAgent.slice(0, 500),
      },
    });
    await this.db.userSettings.update({ where: { userId }, data: { notificationsDesired: true } });
    return result;
  }
  async unsubscribe(userId: string, endpoint: string) {
    await this.db.pushSubscription.updateMany({
      where: { userId, endpoint },
      data: { active: false },
    });
    if (!(await this.db.pushSubscription.count({ where: { userId, active: true } })))
      await this.db.userSettings.update({
        where: { userId },
        data: { notificationsDesired: false },
      });
    return { ok: true };
  }
  async send(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: { title: string; body: string; url: string; occurrenceId: string; reminderId: string },
  ) {
    if (!this.configured) throw new Error('VAPID não configurado.');
    return webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      { TTL: 3600, urgency: 'high', timeout: 15000, topic: createTopic(payload.reminderId) },
    );
  }
  async test(userId: string, delayMinutes = 0) {
    if (!this.configured) throw new BadRequestException('Configure as chaves VAPID no servidor.');
    if (
      delayMinutes === 0 &&
      !(await this.db.pushSubscription.count({ where: { userId, active: true } }))
    )
      throw new BadRequestException('Ative notificações neste dispositivo primeiro.');
    const now = new Date();
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      include: { settings: true },
    });
    const scheduledAt = new Date(+now + delayMinutes * 60000);
    const id = randomUUID();
    const occurrence = await this.db.scheduledOccurrence.create({
      data: {
        userId,
        sourceKey: `test:${id}`,
        localDate: DateTime.fromJSDate(scheduledAt, {
          zone: user.settings?.timezone ?? 'America/Sao_Paulo',
        }).toISODate()!,
        title: 'Notificação de teste',
        category: 'OTHER',
        emoji: '🔔',
        color: '#a3e635',
        startAt: scheduledAt,
        endAt: new Date(+scheduledAt + 3600000),
        timezone: user.settings?.timezone ?? 'America/Sao_Paulo',
        priority: 'NORMAL',
        location: '',
        notes: '',
      },
    });
    const reminder = await this.db.reminder.create({
      data: {
        occurrenceId: occurrence.id,
        key: `test:${id}`,
        scheduledAt,
        nextAttemptAt: scheduledAt,
        title: '🔔 Ritmo funcionando',
        body: `${user.name}, suas notificações estão configuradas.`,
      },
    });
    return {
      reminderId: reminder.id,
      scheduledAt,
      message: delayMinutes
        ? 'Lembrete criado para daqui a 1 minuto. Mantenha o servidor ativo.'
        : 'Teste agendado. O worker enviará em até 15 segundos.',
    };
  }
  async process(id: string) {
    const reminder = await this.db.reminder.findUniqueOrThrow({
      where: { id },
      include: {
        occurrence: {
          include: {
            user: { include: { settings: true, subscriptions: { where: { active: true } } } },
          },
        },
      },
    });
    if (reminder.status !== 'PROCESSING') return;
    if (
      !reminder.occurrence.user.settings?.notificationsDesired &&
      !reminder.key.startsWith('test:')
    ) {
      await this.db.reminder.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'CANCELLED', lastError: 'Notificações pausadas nas preferências.' },
      });
      return;
    }
    if (reminder.occurrence.status !== 'SCHEDULED') {
      await this.db.reminder.update({ where: { id }, data: { status: 'CANCELLED' } });
      return;
    }
    const subscriptions = reminder.occurrence.user.subscriptions;
    for (const subscription of subscriptions) {
      await this.db.reminder.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { claimedAt: new Date() },
      });
      await this.db.notificationDelivery.createMany({
        data: [{ reminderId: id, subscriptionId: subscription.id }],
        skipDuplicates: true,
      });
      const delivery = await this.db.notificationDelivery.findUniqueOrThrow({
        where: { reminderId_subscriptionId: { reminderId: id, subscriptionId: subscription.id } },
      });
      const claimed = await this.db.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          OR: [{ status: 'PENDING' }, { status: 'FAILED', retryable: true, attempts: { lt: 3 } }],
        },
        data: { status: 'PROCESSING', attempts: { increment: 1 }, retryable: false },
      });
      if (!claimed.count) continue;
      try {
        await this.send(subscription, {
          title: reminder.title,
          body: reminder.body,
          url: reminder.key.startsWith('test:')
            ? '/today'
            : `/occurrences/${reminder.occurrenceId}`,
          occurrenceId: reminder.occurrenceId,
          reminderId: id,
        });
        await this.db.notificationDelivery.update({
          where: { id: delivery.id },
          data: { status: 'SENT', sentAt: new Date(), lastError: null },
        });
      } catch (error) {
        const status =
          error && typeof error === 'object' && 'statusCode' in error
            ? Number(error.statusCode)
            : 0;
        if (status === 404 || status === 410)
          await this.db.pushSubscription.update({
            where: { id: subscription.id },
            data: { active: false },
          });
        const retryable = status === 429 || status >= 500;
        await this.db.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'FAILED',
            lastError: error instanceof Error ? error.message.slice(0, 1000) : 'Erro de push',
            retryable,
          },
        });
        this.logger.warn(`Falha no envio ${id}: HTTP ${status || 'resposta desconhecida'}`);
      }
    }
    const deliveries = await this.db.notificationDelivery.findMany({ where: { reminderId: id } });
    if (deliveries.some((d) => d.status === 'PROCESSING')) return;
    const retry = deliveries.some((d) => d.status === 'FAILED' && d.retryable && d.attempts < 3);
    const sent = deliveries.some((d) => d.status === 'SENT');
    const allSent = deliveries.length > 0 && deliveries.every((d) => d.status === 'SENT');
    await this.db.reminder.updateMany({
      where: { id, status: 'PROCESSING' },
      data: {
        status: retry ? 'PENDING' : allSent ? 'SENT' : 'FAILED',
        sentAt: sent ? new Date() : null,
        nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** reminder.attempts) * 60000),
        lastError: allSent
          ? null
          : subscriptions.length
            ? 'Um ou mais dispositivos não receberam o push.'
            : 'Nenhum dispositivo inscrito.',
      },
    });
  }
  async diagnostics(userId: string) {
    const [settings, delivery, subscriptions] = await Promise.all([
      this.db.userSettings.findUniqueOrThrow({ where: { userId } }),
      this.db.notificationDelivery.findFirst({
        where: { reminder: { occurrence: { userId } }, status: 'SENT' },
        orderBy: { sentAt: 'desc' },
        select: { sentAt: true },
      }),
      this.db.pushSubscription.count({ where: { userId, active: true } }),
    ]);
    return {
      backend: 'online',
      timezone: settings.timezone,
      lastSentAt: delivery?.sentAt ?? null,
      subscriptions,
      configured: this.configured,
      notificationsDesired: settings.notificationsDesired,
    };
  }
}
function createTopic(id: string) {
  return Buffer.from(id.replaceAll('-', '')).toString('base64url').slice(0, 32);
}
