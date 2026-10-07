import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { randomBytes, createHash } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { initialCategories, registerSchema, loginSchema } from '@ritmo/shared';
import { Database } from './database.js';
import { AuthRequest, SchemaPipe } from './http.js';
const digest = (v: string) => createHash('sha256').update(v).digest('hex');
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Database) private readonly db: Database) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const cookie: unknown = req.cookies?.ritmo_session;
    if (typeof cookie !== 'string')
      throw new UnauthorizedException('Entre na sua conta para continuar.');
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(cookie) } });
    if (!session || session.expiresAt < new Date())
      throw new UnauthorizedException('Sua sessão expirou. Entre novamente.');
    req.userId = session.userId;
    return true;
  }
}
@Injectable()
export class AuthService {
  constructor(@Inject(Database) private readonly db: Database) {}
  async session(userId: string, res: Response) {
    const token = randomBytes(32).toString('base64url');
    const maxAge = Number(process.env.SESSION_DAYS ?? 30) * 86400000;
    await this.db.session.create({
      data: { userId, tokenHash: digest(token), expiresAt: new Date(Date.now() + maxAge) },
    });
    res.cookie('ritmo_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      maxAge,
    });
    return this.me(userId);
  }
  async register(data: z.infer<typeof registerSchema>, res: Response) {
    if (await this.db.user.findUnique({ where: { email: data.email } }))
      throw new BadRequestException('Este e-mail já está cadastrado.');
    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await this.db.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        settings: { create: { timezone: data.timezone } },
        categories: { create: initialCategories.map((c) => ({ ...c })) },
      },
    });
    return this.session(user.id, res);
  }
  async login(data: z.infer<typeof loginSchema>, res: Response) {
    const user = await this.db.user.findUnique({ where: { email: data.email } });
    if (!user || !(await argon2.verify(user.passwordHash, data.password)))
      throw new UnauthorizedException('E-mail ou senha incorretos.');
    return this.session(user.id, res);
  }
  me(id: string) {
    return this.db.user.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, settings: true, categories: true },
    });
  }
  async logout(req: Request, res: Response) {
    const token: unknown = req.cookies?.ritmo_session;
    if (typeof token === 'string')
      await this.db.session.deleteMany({ where: { tokenHash: digest(token) } });
    res.clearCookie('ritmo_session', {
      path: '/api',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    return { ok: true };
  }
}
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService) {}
  @Post('register')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'email', 'password'],
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string', minLength: 10 },
        timezone: { type: 'string' },
      },
    },
  })
  register(
    @Body(new SchemaPipe(registerSchema)) body: z.infer<typeof registerSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.register(body, res);
  }
  @Post('login')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email: { type: 'string' }, password: { type: 'string' } },
    },
  })
  login(
    @Body(new SchemaPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.login(body, res);
  }
  @Post('logout') logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.service.logout(req, res);
  }
  @Get('me') @UseGuards(SessionGuard) @ApiCookieAuth() me(@Req() req: AuthRequest) {
    return this.service.me(req.userId);
  }
}
