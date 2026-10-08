import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Post,
  UseGuards,
  UnauthorizedException,
  Header,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Database } from './database.js';
import { ReminderWorker } from './worker.js';
import { schedulerMode } from './platform.js';
@Injectable()
export class SchedulerGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const expected = process.env.CRON_SECRET;
    const provided = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!expected || expected.length < 32 || !provided)
      throw new UnauthorizedException('Credencial de agendamento inválida.');
    const expectedBytes = Buffer.from(expected),
      providedBytes = Buffer.from(provided);
    if (
      expectedBytes.length !== providedBytes.length ||
      !timingSafeEqual(expectedBytes, providedBytes)
    )
      throw new UnauthorizedException('Credencial de agendamento inválida.');
    return true;
  }
}
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger('HostedScheduler');
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(ReminderWorker) private readonly worker: ReminderWorker,
  ) {}
  async run() {
    if (schedulerMode() === 'preview-disabled') return { status: 'disabled-preview' };
    const id = 'reminders',
      owner = randomUUID(),
      now = new Date();
    await this.db.schedulerState.createMany({ data: [{ id }], skipDuplicates: true });
    const claimed = await this.db.schedulerState.updateMany({
      where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      data: {
        leaseOwner: owner,
        leaseUntil: new Date(+now + 4 * 60000),
        lastStartedAt: now,
        lastError: null,
      },
    });
    if (!claimed.count) return { status: 'busy' };
    try {
      await this.worker.tick();
      const state = await this.db.schedulerState.findUniqueOrThrow({ where: { id } });
      if (!state.lastRefreshAt || +now - +state.lastRefreshAt > 6 * 3600000) {
        await this.worker.refresh();
        await this.db.schedulerState.updateMany({
          where: { id, leaseOwner: owner },
          data: { lastRefreshAt: new Date() },
        });
      }
      await this.db.schedulerState.updateMany({
        where: { id, leaseOwner: owner },
        data: { lastCompletedAt: new Date(), lastError: null },
      });
      return { status: 'ok', completedAt: new Date().toISOString() };
    } catch (error) {
      await this.db.schedulerState.updateMany({
        where: { id, leaseOwner: owner },
        data: { lastError: 'Ciclo interrompido. Consulte os logs do backend.' },
      });
      this.logger.error(error instanceof Error ? error.stack : String(error));
      throw new HttpException('Não foi possível completar o ciclo de lembretes.', 503);
    } finally {
      await this.db.schedulerState.updateMany({
        where: { id, leaseOwner: owner },
        data: { leaseOwner: null, leaseUntil: null },
      });
    }
  }
}
@ApiTags('scheduler')
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer CRON_SECRET. Segredo exclusivo do agendador.',
})
@UseGuards(SchedulerGuard)
@Controller('internal/scheduler')
export class SchedulerController {
  constructor(@Inject(SchedulerService) private readonly scheduler: SchedulerService) {}
  @Post() @Header('Cache-Control', 'no-store') post() {
    return this.scheduler.run();
  }
  @Get() @Header('Cache-Control', 'no-store') get() {
    return this.scheduler.run();
  }
}
