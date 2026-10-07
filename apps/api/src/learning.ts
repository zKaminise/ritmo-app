import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { incidentSchema, goalMatches } from '@ritmo/shared';
import { Database } from './database.js';
import { SessionGuard } from './auth.js';
import { SchemaPipe, type AuthRequest } from './http.js';
@Injectable()
export class LearningService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async resolveGoal(userId: string, title: string, technology: string, goalId?: string | null) {
    if (goalId) {
      const goal = await this.db.goal.findFirst({ where: { id: goalId, userId } });
      if (!goal) throw new BadRequestException('Meta não encontrada.');
      return goal.id;
    }
    const goals = await this.db.goal.findMany({
      where: { userId, category: 'STUDY', active: true },
      orderBy: [{ planningOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return (
      goals.find(
        (g) =>
          (g.topic || g.topics.length) && goalMatches(g, { category: 'STUDY', title, technology }),
      )?.id ?? null
    );
  }
  async history(userId: string, period: 'today' | 'week' | 'month') {
    const settings = await this.db.userSettings.findUniqueOrThrow({ where: { userId } });
    const now = DateTime.now().setZone(settings.timezone);
    const from = now.startOf(period === 'today' ? 'day' : period);
    return this.db.focusSession.findMany({
      where: {
        userId,
        category: 'STUDY',
        endedAt: { not: null },
        startedAt: { gte: from.toJSDate(), lte: now.endOf('day').toJSDate() },
      },
      include: { goal: { select: { id: true, name: true } } },
      orderBy: { startedAt: 'desc' },
      take: 300,
    });
  }
  incidents(userId: string) {
    return this.db.incidentLearning.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
  }
  async saveIncident(userId: string, input: z.infer<typeof incidentSchema>, id?: string) {
    if (id && !(await this.db.incidentLearning.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Aprendizado não encontrado.');
    return id
      ? this.db.incidentLearning.update({ where: { id }, data: input })
      : this.db.incidentLearning.create({ data: { userId, ...input } });
  }
  async deleteIncident(userId: string, id: string) {
    if (!(await this.db.incidentLearning.findFirst({ where: { id, userId } })))
      throw new NotFoundException('Aprendizado não encontrado.');
    await this.db.incidentLearning.delete({ where: { id } });
    return { ok: true };
  }
}
@ApiTags('learning')
@ApiCookieAuth()
@UseGuards(SessionGuard)
@Controller('learning')
export class LearningController {
  constructor(@Inject(LearningService) private readonly service: LearningService) {}
  @Get('history') history(
    @Req() req: AuthRequest,
    @Query('period', new SchemaPipe(z.enum(['today', 'week', 'month']).default('week')))
    period: 'today' | 'week' | 'month',
  ) {
    return this.service.history(req.userId, period);
  }
  @Get('incidents') incidents(@Req() req: AuthRequest) {
    return this.service.incidents(req.userId);
  }
  @Post('incidents')
  @ApiBody({ schema: z.toJSONSchema(incidentSchema, { io: 'input' }) as { type: 'object' } })
  create(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(incidentSchema)) input: z.infer<typeof incidentSchema>,
  ) {
    return this.service.saveIncident(req.userId, input);
  }
  @Put('incidents/:id')
  @ApiBody({ schema: z.toJSONSchema(incidentSchema, { io: 'input' }) as { type: 'object' } })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body(new SchemaPipe(incidentSchema)) input: z.infer<typeof incidentSchema>,
  ) {
    return this.service.saveIncident(req.userId, input, id);
  }
  @Delete('incidents/:id') delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.deleteIncident(req.userId, id);
  }
}
