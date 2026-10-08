import { config, parse } from 'dotenv';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import { Materializer } from '../apps/api/src/materializer.js';
import { Database } from '../apps/api/src/database.js';
import { postgresConfig } from '../apps/api/src/pg-config.js';
config({ quiet: true });
const args = parseArgs({
  options: {
    email: { type: 'string' },
    'remote-env': { type: 'string', default: 'work/deployment.env' },
  },
}).values;
const email = args.email ?? process.env.BOOTSTRAP_USER_EMAIL;
delete process.env.BOOTSTRAP_USER_EMAIL;
if (!email) throw new Error('Informe o e-mail da conta pelo ambiente ou --email.');
const remoteEnv = parse(await readFile(args['remote-env']!, 'utf8'));
const remoteUrl = remoteEnv.DIRECT_URL || remoteEnv.DATABASE_URL;
if (!remoteUrl || remoteUrl === process.env.DATABASE_URL)
  throw new Error('O destino precisa ser um banco remoto separado da origem.');
const source = new Database();
const target = new PrismaClient({
  adapter: new PrismaPg({ ...postgresConfig(remoteUrl), connectionTimeoutMillis: 10000, max: 3 }),
});
let phase = 'ler origem';
try {
  const user = await source.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  const [settings, categories, routines, exceptions, goals, events, occurrences, focus, incidents] =
    await Promise.all([
      source.userSettings.findUniqueOrThrow({ where: { userId: user.id } }),
      source.category.findMany({ where: { userId: user.id } }),
      source.routineRule.findMany({ where: { userId: user.id } }),
      source.routineException.findMany({ where: { routine: { userId: user.id } } }),
      source.goal.findMany({ where: { userId: user.id } }),
      source.calendarEvent.findMany({ where: { userId: user.id } }),
      source.scheduledOccurrence.findMany({
        where: { userId: user.id, NOT: { sourceKey: { startsWith: 'test:' } } },
      }),
      source.focusSession.findMany({ where: { userId: user.id } }),
      source.incidentLearning.findMany({ where: { userId: user.id } }),
    ]);
  const ids = occurrences.map((o) => o.id);
  const completions = await source.completionLog.findMany({ where: { occurrenceId: { in: ids } } });
  phase = 'copiar registros';
  await target.$transaction(
    async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: user.email } });
      if (existing && existing.id !== user.id)
        throw new Error('Já existe outra identidade com esse e-mail no destino.');
      await tx.user.upsert({ where: { id: user.id }, create: user, update: {} });
      await tx.userSettings.upsert({
        where: { userId: user.id },
        create: { ...settings, categoryReminders: settings.categoryReminders ?? {} },
        update: {},
      });
      await tx.category.createMany({ data: categories, skipDuplicates: true });
      await tx.routineRule.createMany({
        data: routines.map((r) => ({ ...r, reminderMessages: r.reminderMessages ?? {} })),
        skipDuplicates: true,
      });
      await tx.routineException.createMany({ data: exceptions, skipDuplicates: true });
      await tx.goal.createMany({ data: goals, skipDuplicates: true });
      await tx.calendarEvent.createMany({
        data: events.map((e) => ({ ...e, reminderMessages: e.reminderMessages ?? {} })),
        skipDuplicates: true,
      });
      await tx.scheduledOccurrence.createMany({ data: occurrences, skipDuplicates: true });
      await tx.completionLog.createMany({ data: completions, skipDuplicates: true });
      await tx.focusSession.createMany({
        data: focus.filter((f) => !f.occurrenceId || ids.includes(f.occurrenceId)),
        skipDuplicates: true,
      });
      await tx.incidentLearning.createMany({ data: incidents, skipDuplicates: true });
    },
    { timeout: 120000 },
  );
  console.log('Registros pessoais copiados sem transportar sessões ou credenciais de navegador.');
  phase = 'materializar lembretes';
  const oldUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = remoteUrl;
  const remoteDb = new Database();
  try {
    await new Materializer(remoteDb).run(user.id, new Date(), 16, 180000);
  } finally {
    await remoteDb.$disconnect();
    process.env.DATABASE_URL = oldUrl;
  }
  console.log(
    `Conta migrada com hash preservado: ${routines.length} rotinas, ${goals.length} metas, ${events.length} eventos, ${focus.length} sessões. Sessões de login e inscrições push locais não foram copiadas.`,
  );
} catch (error) {
  console.error('Não foi possível concluir a migração pessoal. Nenhuma credencial foi registrada.');
  process.exitCode = 1;
  const message = error instanceof Error ? error.message : '';
  console.error({
    phase,
    code: error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined,
    tls: /certificate|SSL|TLS/i.test(message),
    timeout: /timeout|expired|timed out/i.test(message),
    constraint: /constraint|duplicate|foreign key/i.test(message),
    permissions: /permission|policy|row-level/i.test(message),
  });
} finally {
  await source.$disconnect();
  await target.$disconnect();
}
