import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { Database } from '../apps/api/src/database.js';
import { importProfile, profileImportSchema } from '../apps/api/src/admin.js';
const args = parseArgs({
  options: {
    email: { type: 'string' },
    file: { type: 'string' },
    replace: { type: 'boolean', default: false },
  },
}).values;
const email = args.email ?? process.env.BOOTSTRAP_USER_EMAIL;
if (!email || !args.file) {
  console.error('Informe --file com um perfil local e --email ou BOOTSTRAP_USER_EMAIL.');
  process.exitCode = 1;
} else {
  const db = new Database();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    const profile = profileImportSchema.parse(JSON.parse(await readFile(args.file, 'utf8')));
    const result = await importProfile(db, user.id, profile, args.replace);
    console.log(
      `Perfil configurado: ${result.routines} rotinas e ${result.goals} metas. Atividades existentes preservadas${args.replace ? ' com atualização explícita das chaves importadas' : ''}.`,
    );
  } catch {
    console.error('Não foi possível importar o perfil. Confira o arquivo, categorias e banco.');
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
