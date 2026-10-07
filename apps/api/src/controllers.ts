import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  categorySchema,
  completionSchema,
  dateSchema,
  eventSchema,
  exceptionSchema,
  focusSchema,
  finishFocusSchema,
  goalSchema,
  onboardingSchema,
  routineSchema,
  settingsSchema,
  snoozeSchema,
} from '@ritmo/shared';
import { AgendaService } from './agenda.js';
import { SessionGuard } from './auth.js';
import { Database } from './database.js';
import { AuthRequest, SchemaPipe } from './http.js';
import { InsightsService } from './insights.js';
import { PushService, subscriptionSchema } from './push.js';
const apiBody = (schema: z.ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as { type: 'object' },
  });
const plannerSchema = z.object({ date: dateSchema, goalIds: z.array(z.uuid()).max(30) });
@ApiTags('agenda')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller()
export class AgendaController {
  constructor(
    @Inject(AgendaService) private readonly agenda: AgendaService,
    @Inject(Database) private readonly db: Database,
    @Inject(InsightsService) private readonly insights: InsightsService,
    @Inject(PushService) private readonly push: PushService,
  ) {}
  @Get('users/me') me(@Req() req: AuthRequest) {
    return this.db.user.findUniqueOrThrow({
      where: { id: req.userId },
      select: { id: true, name: true, email: true },
    });
  }
  @Patch('users/me') @apiBody(z.object({ name: z.string().trim().min(1).max(80) })) updateMe(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(z.object({ name: z.string().trim().min(1).max(80) })))
    body: { name: string },
  ) {
    return this.db.user.update({
      where: { id: req.userId },
      data: body,
      select: { id: true, name: true, email: true },
    });
  }
  @Get('settings') settings(@Req() req: AuthRequest) {
    return this.agenda.settings(req.userId);
  }
  @Put('settings') @apiBody(settingsSchema) saveSettings(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
  ) {
    return this.agenda.saveSettings(req.userId, body);
  }
  @Post('settings/onboarding') @apiBody(onboardingSchema) onboarding(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(onboardingSchema)) body: z.infer<typeof onboardingSchema>,
  ) {
    return this.agenda.onboarding(req.userId, body);
  }
  @Get('categories') categories(@Req() req: AuthRequest) {
    return this.db.category.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('categories') @apiBody(categorySchema) category(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(categorySchema)) body: z.infer<typeof categorySchema>,
  ) {
    return this.db.category.upsert({
      where: { userId_key: { userId: req.userId, key: body.key } },
      create: { ...body, userId: req.userId },
      update: body,
    });
  }
  @Get('routines') routines(@Req() req: AuthRequest) {
    return this.agenda.routines(req.userId);
  }
  @Post('routines') @apiBody(routineSchema) createRoutine(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(routineSchema)) body: z.infer<typeof routineSchema>,
  ) {
    return this.agenda.saveRoutine(req.userId, body);
  }
  @Put('routines/:id') @apiBody(routineSchema) updateRoutine(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(routineSchema)) body: z.infer<typeof routineSchema>,
  ) {
    return this.agenda.saveRoutine(req.userId, body, id);
  }
  @Delete('routines/:id') deleteRoutine(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.agenda.deleteRoutine(req.userId, id);
  }
  @Get('events') events(@Req() req: AuthRequest) {
    return this.db.calendarEvent.findMany({
      where: { userId: req.userId },
      orderBy: { startAt: 'asc' },
    });
  }
  @Post('events/conflicts') @apiBody(eventSchema) conflicts(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(eventSchema)) body: z.infer<typeof eventSchema>,
  ) {
    return this.agenda.conflicts(req.userId, body);
  }
  @Post('events') @apiBody(eventSchema) createEvent(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(eventSchema)) body: z.infer<typeof eventSchema>,
  ) {
    return this.agenda.saveEvent(req.userId, body);
  }
  @Put('events/:id') @apiBody(eventSchema) updateEvent(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(eventSchema)) body: z.infer<typeof eventSchema>,
  ) {
    return this.agenda.saveEvent(req.userId, body, id);
  }
  @Delete('events/:id') deleteEvent(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.agenda.deleteEvent(req.userId, id);
  }
  @Get('occurrences') occurrences(
    @Req() req: AuthRequest,
    @Query('from', new SchemaPipe(dateSchema)) from: string,
    @Query('to', new SchemaPipe(dateSchema)) to: string,
  ) {
    return this.agenda.occurrences(req.userId, from, to);
  }
  @Get('occurrences/:id') occurrence(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.agenda.occurrence(req.userId, id);
  }
  @Post('occurrences/:id/completion') @apiBody(completionSchema) complete(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(completionSchema)) body: z.infer<typeof completionSchema>,
  ) {
    return this.agenda.complete(req.userId, id, body);
  }
  @Patch('occurrences/:id') @apiBody(exceptionSchema) exception(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(exceptionSchema)) body: z.infer<typeof exceptionSchema>,
  ) {
    return this.agenda.exception(req.userId, id, body);
  }
  @Post('occurrences/:id/snooze') @apiBody(snoozeSchema) snooze(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(snoozeSchema)) body: z.infer<typeof snoozeSchema>,
  ) {
    return this.agenda.snooze(req.userId, id, body.minutes);
  }
  @Get('reminders') reminders(@Req() req: AuthRequest) {
    return this.db.reminder.findMany({
      where: { occurrence: { userId: req.userId } },
      include: {
        deliveries: {
          select: { id: true, status: true, attempts: true, sentAt: true, lastError: true },
        },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 100,
    });
  }
  @Get('goals') goals(@Req() req: AuthRequest) {
    return this.insights.progress(req.userId);
  }
  @Post('goals') @apiBody(goalSchema) createGoal(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(goalSchema)) body: z.infer<typeof goalSchema>,
  ) {
    return this.agenda.saveGoal(req.userId, body);
  }
  @Put('goals/:id') @apiBody(goalSchema) updateGoal(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(goalSchema)) body: z.infer<typeof goalSchema>,
  ) {
    return this.agenda.saveGoal(req.userId, body, id);
  }
  @Delete('goals/:id') deleteGoal(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.agenda.deleteGoal(req.userId, id);
  }
  @Get('focus-sessions') focusSessions(@Req() req: AuthRequest) {
    return this.db.focusSession.findMany({
      where: { userId: req.userId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }
  @Post('focus-sessions') @apiBody(focusSchema) focus(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(focusSchema)) body: z.infer<typeof focusSchema>,
  ) {
    return this.agenda.startFocus(req.userId, body);
  }
  @Post('focus-sessions/:id/finish') @apiBody(finishFocusSchema) finish(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(finishFocusSchema.prefault({}))) body: z.infer<typeof finishFocusSchema>,
  ) {
    return this.agenda.finishFocus(req.userId, id, body);
  }
  @Get('dashboard') dashboard(@Req() req: AuthRequest) {
    return this.insights.dashboard(req.userId);
  }
  @Get('dashboard/summary') summary(@Req() req: AuthRequest) {
    return this.insights.summary(req.userId);
  }
  @Get('planner') planner(
    @Req() req: AuthRequest,
    @Query('date', new SchemaPipe(dateSchema)) date: string,
  ) {
    return this.insights.planner(req.userId, date);
  }
  @Post('planner/apply') @apiBody(plannerSchema) apply(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(plannerSchema)) body: z.infer<typeof plannerSchema>,
  ) {
    return this.insights.applyPlan(req.userId, body.date, body.goalIds);
  }
  @Get('push/config') pushConfig() {
    return this.push.config();
  }
  @Get('push/subscriptions') subscriptions(@Req() req: AuthRequest) {
    return this.db.pushSubscription.findMany({
      where: { userId: req.userId },
      select: { id: true, endpoint: true, active: true, createdAt: true },
    });
  }
  @Post('push/subscriptions') @apiBody(subscriptionSchema) subscribe(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(subscriptionSchema)) body: z.infer<typeof subscriptionSchema>,
  ) {
    return this.push.subscribe(req.userId, body, req.headers['user-agent'] ?? '');
  }
  @Delete('push/subscriptions') @apiBody(z.object({ endpoint: z.string() })) unsubscribe(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(z.object({ endpoint: z.string().max(2048) }))) body: { endpoint: string },
  ) {
    return this.push.unsubscribe(req.userId, body.endpoint);
  }
  @Post('push/test') testPush(@Req() req: AuthRequest) {
    return this.push.test(req.userId);
  }
  @Post('push/reminder-test') quickReminder(@Req() req: AuthRequest) {
    return this.push.test(req.userId, 1);
  }
  @Get('push/diagnostics') pushDiagnostics(@Req() req: AuthRequest) {
    return this.push.diagnostics(req.userId);
  }
}
