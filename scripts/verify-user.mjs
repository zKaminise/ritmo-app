import { config } from 'dotenv';
import { chromium, expect } from '@playwright/test';
import { DateTime } from 'luxon';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '../apps/api/dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
config({ quiet: true });
const email = process.env.BOOTSTRAP_USER_EMAIL,
  password = process.env.BOOTSTRAP_USER_PASSWORD;
delete process.env.BOOTSTRAP_USER_EMAIL;
delete process.env.BOOTSTRAP_USER_PASSWORD;
if (!email || !password)
  throw new Error('Informe as credenciais somente pelo ambiente do processo.');
const root = fileURLToPath(new URL('../', import.meta.url));
const report = {
  date: new Date().toISOString(),
  steps: [],
  login: false,
  sessionRefresh: false,
  sessionRestart: false,
  logoutLogin: false,
  responsive: false,
  studyProgress: false,
  plannerProgress: false,
  reminderMinute: false,
  push: 'não validável',
  subscription: false,
  passwordOnlyHash: false,
};
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
let browser,
  step = 'iniciar',
  focusId,
  plannerEventId,
  plannerOccurrenceId,
  temporaryEventId;
let incidentId;
const finishStep = (name) => {
  report.steps.push(name);
  console.log(`OK: ${name}`);
};
const restart = async () => {
  for (const file of ['stop-local.ps1', 'start-local.ps1']) {
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', `${root}scripts/${file}`],
      { cwd: root, stdio: 'ignore', timeout: 30000 },
    );
    if (result.status !== 0) throw new Error('Não foi possível reiniciar a aplicação.');
  }
  for (let n = 0; n < 60; n++) {
    try {
      const response = await fetch('http://localhost:3000/api/health');
      if (response.ok) return;
    } catch {
      /* Aguarde a API terminar sua inicialização. */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('API não iniciou a tempo.');
};
try {
  browser = await chromium.launch({ headless: process.env.VERIFY_HEADED !== '1' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const login = async () => {
    await page.goto('http://localhost:3000/today');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Entrar no meu dia' }).click();
    await expect(page.getByRole('heading', { level: 1, name: /Gabriel/ })).toBeVisible();
  };
  step = 'login pela interface';
  await login();
  report.login = true;
  finishStep(step);
  const me = await (await page.request.get('http://localhost:3000/api/auth/me')).json();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  await db.incidentLearning.deleteMany({
    where: {
      userId: me.id,
      title: { in: ['Verificação temporária de incidente', 'Verificação temporária ajustada'] },
      learning: 'Como consultar meu histórico pessoal.',
    },
  });
  report.passwordOnlyHash =
    user.passwordHash.startsWith('$argon2id$') && !user.passwordHash.includes(password);
  const cookies = await context.cookies();
  if (!cookies.some((c) => c.name === 'ritmo_session' && c.httpOnly))
    throw new Error('Cookie de sessão não está HttpOnly.');
  step = 'persistência após atualizar';
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: /Gabriel/ })).toBeVisible();
  report.sessionRefresh = true;
  finishStep(step);
  step = 'rotinas de trabalho e faculdade';
  await page.goto('http://localhost:3000/routines');
  await expect(page.getByText('Trabalho', { exact: true })).toBeVisible();
  await expect(page.getByText('Faculdade', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ter', exact: true }).click();
  await expect(page.getByText(/21:00 — 22:30/)).toBeVisible();
  finishStep(step);
  step = 'metas iniciais';
  await page.goto('http://localhost:3000/goals');
  for (const name of ['Academia', 'Node / Nest / React', 'Java Elite'])
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  finishStep(step);
  step = 'adicionar, editar e excluir evento';
  await page.goto('http://localhost:3000/new');
  const saturday = DateTime.now()
    .setZone(me.settings.timezone)
    .plus({ days: (6 - DateTime.now().setZone(me.settings.timezone).weekday + 7) % 7 })
    .toISODate();
  await page.getByLabel('Nome da atividade').fill('Verificação de evento temporário');
  await page.getByRole('button', { name: '🏐 Vôlei', exact: true }).click();
  await page.getByLabel('Data', { exact: true }).fill(saturday);
  await page.getByLabel('Começa às').fill('14:00');
  await page.getByLabel('Termina às').fill('18:00');
  await page.getByRole('button', { name: 'Adicionar ao meu dia' }).click();
  if (await page.getByRole('button', { name: 'Manter os dois e salvar' }).isVisible())
    await page.getByRole('button', { name: 'Manter os dois e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Sua agenda.' })).toBeVisible();
  await page.getByLabel('Data da agenda').fill(saturday);
  await page.getByRole('link').filter({ hasText: 'Verificação de evento temporário' }).click();
  const occurrenceId = page.url().split('/').at(-1);
  const occurrence = await (
    await page.request.get(`http://localhost:3000/api/occurrences/${occurrenceId}`)
  ).json();
  temporaryEventId = occurrence.eventId;
  await page.getByRole('button', { name: 'Alterar', exact: true }).click();
  await page.getByLabel('Nome da atividade').fill('Verificação de evento ajustado');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(
    page.getByRole('heading', { name: 'Verificação de evento ajustado', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Excluir compromisso' }).click();
  await expect(page.getByRole('heading', { name: 'Sua agenda.' })).toBeVisible();
  finishStep(step);
  step = 'estudo e progresso da meta';
  await page.goto('http://localhost:3000/learning');
  const goalsBefore = await (await page.request.get('http://localhost:3000/api/goals')).json();
  const workGoal = goalsBefore.find((g) => g.topics.includes('NestJS'));
  const before = workGoal.progress;
  await page.getByRole('button', { name: 'Começar estudo', exact: true }).first().click();
  await page.getByLabel('O que vamos estudar?').selectOption('NestJS');
  await page.getByLabel('Meta correspondente').selectOption(workGoal.id);
  await page.getByLabel('Minutos personalizados').fill('1');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Começar estudo', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Finalizar e registrar tempo' })).toBeVisible();
  const sessions = await (
    await page.request.get('http://localhost:3000/api/focus-sessions')
  ).json();
  const active = sessions.find((s) => !s.endedAt);
  focusId = active.id;
  step = 'sessão e dados após reiniciar a aplicação';
  await restart();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finalizar e registrar tempo' })).toBeVisible();
  report.sessionRestart = true;
  finishStep(step);
  console.log('Aguardando um minuto real de sessão para validar o registro de tempo.');
  while (Date.now() - +new Date(active.startedAt) < 65000) await page.waitForTimeout(1000);
  step = 'finalizar estudo e confirmar histórico';
  await page.getByRole('button', { name: 'Finalizar e registrar tempo' }).click();
  await page
    .getByRole('textbox', { name: 'O que você estudou?', exact: true })
    .fill('Verificação técnica do modo estudo');
  await page
    .getByLabel('Aprendizado / observação')
    .fill('Sessão temporária criada para validar persistência e contagem de tempo.');
  const finishResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/focus-sessions/${focusId}/finish`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Finalizar e salvar' }).click();
  if (!(await finishResponse).ok()) throw new Error('A gravação da sessão falhou.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('http://localhost:3000/learning');
  await expect(page.getByText('Verificação técnica do modo estudo', { exact: true })).toBeVisible();
  const afterStudy = await (await page.request.get('http://localhost:3000/api/goals')).json();
  if (afterStudy.find((g) => g.id === workGoal.id).progress <= before)
    throw new Error('Meta de estudo não foi atualizada.');
  report.studyProgress = true;
  finishStep('estudo finalizado e meta atualizada');
  step = 'registrar aprendizado de incidente';
  await page.getByRole('button', { name: 'Registrar aprendizado de incidente' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Verificação temporária de incidente');
  await page.getByLabel('Tecnologia', { exact: true }).selectOption('NestJS');
  await page.getByLabel('Erro', { exact: true }).fill('Exemplo técnico sem dados confidenciais');
  await page
    .getByLabel('O que aprendi', { exact: true })
    .fill('Como consultar meu histórico pessoal.');
  const incidentCreateResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/learning/incidents') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Salvar aprendizado' }).click();
  const createdIncident = await incidentCreateResponse;
  if (!createdIncident.ok()) throw new Error('Incidente não foi gravado.');
  incidentId = (await createdIncident.json()).id;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const incident = page
    .locator('details.incident-entry')
    .filter({ hasText: 'Verificação temporária de incidente' });
  await incident.locator('summary').click();
  await incident.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Verificação temporária ajustada');
  await page.getByRole('button', { name: 'Salvar aprendizado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const changed = page
    .locator('details.incident-entry')
    .filter({ hasText: 'Verificação temporária ajustada' });
  if ((await changed.getAttribute('open')) === null) await changed.locator('summary').click();
  await changed.getByRole('button', { name: 'Excluir', exact: true }).click();
  finishStep(step);
  step = 'planner, aceitação e conclusão';
  await page.goto('http://localhost:3000/today');
  await page.getByRole('button', { name: 'Planejar meu dia' }).click();
  await expect(page.getByRole('dialog', { name: 'Um plano para hoje' })).toBeVisible();
  const planner = await (
    await page.request.get(
      `http://localhost:3000/api/planner?date=${DateTime.now().setZone(me.settings.timezone).toISODate()}`,
    )
  ).json();
  if (!planner.suggestions.length)
    throw new Error('Nenhuma janela disponível neste horário para validar o planner.');
  const suggestion = planner.suggestions[0];
  const progressBefore = afterStudy.find((g) => g.id === suggestion.goalId)?.progress ?? 0;
  const planResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/planner/apply') && r.request().method() === 'POST',
  );
  await page
    .locator('.suggestion')
    .filter({ hasText: suggestion.title })
    .getByRole('button', { name: 'Adicionar', exact: true })
    .click();
  if (!(await planResponse).ok()) throw new Error('A aceitação da sugestão falhou.');
  const events = await (await page.request.get('http://localhost:3000/api/events')).json();
  const planned = events.find(
    (e) =>
      e.plannerKey ===
      `${DateTime.now().setZone(me.settings.timezone).toISODate()}:${suggestion.goalId}`,
  );
  plannerEventId = planned.id;
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.locator('.timeline').getByRole('link').filter({ hasText: suggestion.title }).click();
  plannerOccurrenceId = page.url().split('/').at(-1);
  const completionResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/occurrences/${plannerOccurrenceId}/completion`) &&
      r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  if (!(await completionResponse).ok()) throw new Error('A conclusão falhou.');
  const afterPlan = await (await page.request.get('http://localhost:3000/api/goals')).json();
  if (afterPlan.find((g) => g.id === suggestion.goalId).progress <= progressBefore)
    throw new Error('Conclusão não atualizou a meta.');
  report.plannerProgress = true;
  finishStep(step);
  step = 'responsividade';
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of ['/today', '/learning', '/new', '/profile']) {
      await page.goto(`http://localhost:3000${route}`);
      await page.waitForLoadState('networkidle');
      if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
        throw new Error('Overflow de tela.');
      if (route === '/new') {
        const modal = await page.getByRole('dialog').boundingBox();
        if (modal && (modal.height > viewport.height || modal.width > viewport.width))
          throw new Error('Modal ultrapassa viewport.');
      }
    }
  }
  report.responsive = true;
  finishStep(step);
  step = 'lembrete para daqui a 1 minuto';
  await page.goto('http://localhost:3000/profile');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/push/reminder-test') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar lembrete para daqui a 1 minuto' }).click();
  const queued = await response;
  report.reminderMinute = queued.ok();
  if (!queued.ok()) throw new Error('Lembrete não criado.');
  finishStep(step);
  step = 'logout e novo login';
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Entrar no meu dia' })).toBeVisible();
  await login();
  report.logoutLogin = true;
  finishStep(step);
  step = 'tentativa de ativação real de push';
  await page.goto('http://localhost:3000/profile');
  await page.getByRole('button', { name: 'Ativar notificações', exact: true }).click();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    if (await page.getByText('Dispositivo inscrito', { exact: true }).isVisible()) {
      report.subscription = true;
      break;
    }
    if (await page.getByText('Permissão negada', { exact: true }).isVisible()) break;
  }
  if (report.subscription) {
    await page.getByRole('button', { name: 'Enviar notificação de teste' }).click();
    for (let i = 0; i < 25; i++) {
      await page.waitForTimeout(1000);
      const last = await (
        await page.request.get('http://localhost:3000/api/push/diagnostics')
      ).json();
      if (last.lastSentAt) {
        report.push = 'aceito pelo serviço externo';
        break;
      }
    }
  }
  finishStep('diagnóstico de push verificado; resultado de plataforma registrado');
  await page.goto('http://localhost:3000/today');
} catch (error) {
  report.failureStep = step;
  console.error(
    `Verificação interrompida na etapa: ${step}. Credenciais e conteúdo dos campos não foram registrados.`,
  );
  process.exitCode = 1;
  let reason = error instanceof Error ? error.message : 'Erro de verificação';
  for (const value of [
    password,
    email,
    process.env.DATABASE_URL,
    process.env.VAPID_PRIVATE_KEY,
  ].filter(Boolean))
    reason = reason.replaceAll(value, '[redigido]');
  console.error(reason.slice(0, 700));
} finally {
  if (incidentId) await db.incidentLearning.deleteMany({ where: { id: incidentId } });
  if (plannerOccurrenceId)
    await db.scheduledOccurrence.deleteMany({ where: { id: plannerOccurrenceId } });
  if (plannerEventId) await db.calendarEvent.deleteMany({ where: { id: plannerEventId } });
  if (temporaryEventId) {
    await db.scheduledOccurrence.deleteMany({
      where: { eventId: temporaryEventId, completion: null },
    });
    await db.calendarEvent.deleteMany({ where: { id: temporaryEventId } });
  }
  if (focusId) await db.focusSession.deleteMany({ where: { id: focusId } });
  await db.$disconnect();
  await browser?.close();
  await mkdir(`${root}work`, { recursive: true });
  await writeFile(`${root}work/real-user-validation.json`, JSON.stringify(report, null, 2));
  console.log(
    'Relatório sem credenciais salvo em work/real-user-validation.json. Registros transitórios de estudo e planner foram removidos.',
  );
}
