import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { AppModule } from './app.js';
import { Errors } from './http.js';
import { appOrigin, schedulerMode } from './platform.js';
export async function createApp() {
  if (process.env.NODE_ENV === 'production' && !appOrigin().startsWith('https://'))
    throw new Error('APP_URL deve usar HTTPS em produção.');
  if (
    process.env.NODE_ENV === 'production' &&
    schedulerMode() === 'external' &&
    (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
  )
    throw new Error(
      'Configure CRON_SECRET com pelo menos 32 caracteres para o agendador hospedado.',
    );
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  const server = app.getHttpAdapter().getInstance() as express.Express;
  server.disable('x-powered-by');
  server.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false);
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          workerSrc: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '100kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      message: { message: 'Muitas solicitações. Aguarde um minuto.' },
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      skip: (req) => req.path === '/me' || req.path === '/logout',
      message: { message: 'Aguarde alguns minutos antes de tentar entrar novamente.' },
    }),
  );
  app.use('/api', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = new Set([appOrigin()]);
      if (process.env.NODE_ENV !== 'production') {
        allowed.add('http://localhost:3000');
        allowed.add('http://localhost:5173');
      }
      if (origin && !allowed.has(origin)) {
        res.status(403).json({ message: 'Origem da solicitação não permitida.' });
        return;
      }
      if (req.headers['sec-fetch-site'] === 'cross-site') {
        res.status(403).json({ message: 'Solicitação não permitida.' });
        return;
      }
    }
    next();
  });
  app.useGlobalFilters(new Errors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Ritmo API')
      .setDescription('Agenda pessoal, rotina, metas e lembretes persistentes.')
      .setVersion('1.0.0')
      .addCookieAuth('ritmo_session')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  const publicDir = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(publicDir)) {
    app.use(
      express.static(publicDir, {
        setHeaders: (res, path) => {
          if (path.endsWith('sw.js') || path.endsWith('index.html'))
            res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.includes('.'))
        res.sendFile(`${publicDir}/index.html`);
      else next();
    });
  }
  app.enableShutdownHooks();
  return app;
}
