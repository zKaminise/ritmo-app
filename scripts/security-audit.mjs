import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
const local = parse(readFileSync('.env'));
const values = [
  process.env.BOOTSTRAP_USER_PASSWORD,
  process.env.BOOTSTRAP_USER_EMAIL,
  local.VAPID_PRIVATE_KEY,
  local.JWT_SECRET,
  local.DATABASE_URL,
].filter(Boolean);
const candidates = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean);
const failures = [];
for (const file of candidates) {
  if (
    (file.startsWith('.env') && file !== '.env.example') ||
    /(^|\/)(node_modules|dist|work|coverage)\//.test(file)
  ) {
    failures.push(file);
    continue;
  }
  const data = readFileSync(file);
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  if (values.some((value) => text.includes(value))) failures.push(file);
}
if (failures.length) {
  console.error('Revisão de segredos falhou nos arquivos: ' + [...new Set(failures)].join(', '));
  process.exitCode = 1;
} else {
  console.log(
    `Revisão de segredos: ${candidates.length} arquivos publicáveis verificados; nenhuma credencial local encontrada.`,
  );
  const privatePassword = process.env.BOOTSTRAP_USER_PASSWORD;
  if (privatePassword) {
    const localFiles = execFileSync(
      'rg',
      [
        '--files',
        '--hidden',
        '--no-ignore',
        '-g',
        '!node_modules/**',
        '-g',
        '!.git/**',
        '-g',
        '!work/pgdata/**',
      ],
      { encoding: 'utf8' },
    )
      .split(/\r?\n/)
      .filter(Boolean);
    const localFailures = [];
    for (const file of localFiles) {
      const data = readFileSync(file);
      if (!data.includes(0) && data.toString('utf8').includes(privatePassword))
        localFailures.push(file);
    }
    if (localFailures.length) {
      console.error('Senha pessoal encontrada em arquivos locais: ' + localFailures.join(', '));
      process.exitCode = 1;
    } else
      console.log(
        'Verificação local da senha pessoal: nenhuma ocorrência em fonte, builds, logs, relatórios ou arquivos de configuração.',
      );
  }
}
