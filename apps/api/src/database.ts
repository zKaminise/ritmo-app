import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { postgresConfig } from './pg-config.js';
@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL no .env.');
    super({
      adapter: new PrismaPg({
        ...postgresConfig(process.env.DATABASE_URL),
        max: Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL === '1' ? 3 : 10)),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }),
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
