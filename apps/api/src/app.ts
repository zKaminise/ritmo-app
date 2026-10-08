import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Database } from './database.js';
import { AgendaService } from './agenda.js';
import { AgendaController } from './controllers.js';
import { AuthController, AuthService, SessionGuard } from './auth.js';
import { Materializer } from './materializer.js';
import { PushService } from './push.js';
import { ReminderWorker } from './worker.js';
import { InsightsService } from './insights.js';
import { LearningService, LearningController } from './learning.js';
import { SchedulerController, SchedulerService, SchedulerGuard } from './scheduler.js';
@ApiTags('health')
@Controller('health')
class HealthController {
  @Get() health() {
    return { status: 'ok', version: '1.0.0' };
  }
}
@Module({
  controllers: [
    AuthController,
    AgendaController,
    HealthController,
    LearningController,
    SchedulerController,
  ],
  providers: [
    Database,
    AuthService,
    SessionGuard,
    AgendaService,
    Materializer,
    PushService,
    ReminderWorker,
    InsightsService,
    LearningService,
    SchedulerService,
    SchedulerGuard,
  ],
})
export class AppModule {}
