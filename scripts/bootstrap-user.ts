import 'dotenv/config';
import { parseArgs } from 'node:util';
import { Database } from '../apps/api/src/database.js';
import { bootstrapSchema, bootstrapUser } from '../apps/api/src/admin.js';
const args = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    timezone: { type: 'string' },
    'reset-password': { type: 'boolean', default: false },
  },
}).values;
const password = process.env.BOOTSTRAP_USER_PASSWORD;
delete process.env.BOOTSTRAP_USER_PASSWORD;
const input = bootstrapSchema.safeParse({
  email: args.email ?? process.env.BOOTSTRAP_USER_EMAIL,
  name: args.name ?? process.env.BOOTSTRAP_USER_NAME ?? 'Usuário',
  timezone: args.timezone ?? process.env.BOOTSTRAP_USER_TIMEZONE ?? 'America/Sao_Paulo',
  password,
  resetPassword: args['reset-password'],
});
if (!input.success) {
  console.error(
    'Informe BOOTSTRAP_USER_EMAIL, BOOTSTRAP_USER_PASSWORD (mínimo 8 caracteres), nome e timezone válidos. A senha não é aceita na linha de comando.',
  );
  process.exitCode = 1;
} else {
  const db = new Database();
  try {
    const result = await bootstrapUser(db, input.data);
    console.log(
      result.created
        ? 'Usuário criado com hash Argon2id.'
        : result.passwordReset
          ? 'Senha redefinida com hash Argon2id; sessões anteriores revogadas.'
          : 'Usuário já existe. Dados e senha preservados.',
    );
  } catch {
    console.error(
      'Não foi possível configurar o usuário. Confira conexão e migrations. Nenhuma credencial foi registrada.',
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
