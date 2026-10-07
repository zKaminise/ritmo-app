import { expect, test } from '@playwright/test';
import { DateTime } from 'luxon';
test('aprendizado, notas, incidentes, lembrete rápido e countdown nas duas telas', async ({
  page,
}) => {
  const registered = await page.request.post('/api/auth/register', {
    data: {
      name: 'Pessoa de teste',
      email: `learning-${Date.now()}@ritmo.local`,
      password: 'LearningTest!123',
      timezone: 'America/Sao_Paulo',
    },
  });
  expect(registered.ok()).toBe(true);
  const user = await registered.json();
  const onboarding = await page.request.post('/api/settings/onboarding', {
    data: {
      settings: user.settings,
      workDays: [],
      workStart: '09:00',
      workEnd: '18:00',
      college: false,
      collegeDays: [],
      collegeStart: '19:00',
      collegeEnd: '20:30',
      gym: false,
      study: false,
    },
  });
  expect(onboarding.ok()).toBe(true);
  await page.goto('/goals');
  await page.getByRole('button', { name: 'Nova meta' }).click();
  await page.getByLabel('Nome da meta').fill('Tecnologias web');
  await page.getByLabel('Quantidade').fill('3');
  await page.getByLabel('Unidade').selectOption('HOURS');
  await page.getByLabel('Período').selectOption('WEEKLY');
  await page.getByLabel('Tecnologias / tópicos associados').fill('Node.js, NestJS, React, Next.js');
  await page.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/learning');
  await expect(page.getByRole('heading', { name: 'Meu aprendizado.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tecnologias web' })).toBeVisible();
  await page.getByRole('button', { name: 'Começar estudo', exact: true }).first().click();
  await page.getByLabel('O que vamos estudar?').selectOption('React');
  await page.getByRole('button', { name: '45 min', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Começar estudo' }).click();
  await expect(page.getByRole('button', { name: 'Finalizar e registrar tempo' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar e registrar tempo' }).click();
  await page
    .getByRole('textbox', { name: 'O que você estudou?', exact: true })
    .fill('Hooks e efeitos');
  await page
    .getByLabel('Aprendizado / observação')
    .fill('Observação de teste sem informação confidencial.');
  const finish = page.waitForResponse(
    (r) => r.url().includes('/finish') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Finalizar e salvar' }).click();
  expect((await finish).ok()).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/learning');
  await expect(page.getByText('Hooks e efeitos', { exact: true })).toBeVisible();
  for (const label of ['Hoje', 'Esta semana', 'Este mês']) {
    await page.locator('.segmented').getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByText('Hooks e efeitos', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Registrar aprendizado de incidente' }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByText(
      'Não registre dados de clientes, tokens, senhas ou informações confidenciais.',
    ),
  ).toBeVisible();
  await page.getByLabel('Título', { exact: true }).fill('Incidente de teste');
  await page.getByLabel('Tecnologia', { exact: true }).selectOption('API');
  await page.getByLabel('Erro', { exact: true }).fill('Timeout simulado');
  await page.getByLabel('Minha hipótese').fill('Latência');
  await page.getByLabel('Causa encontrada').fill('Conexão indisponível');
  await page.getByLabel('Solução', { exact: true }).fill('Revisar timeout');
  await page.getByLabel('O que aprendi', { exact: true }).fill('Investigar antes de alterar.');
  await page.getByRole('button', { name: 'Salvar aprendizado' }).click();
  await expect(dialog).toHaveCount(0);
  const incident = page.locator('details.incident-entry').filter({ hasText: 'Incidente de teste' });
  await incident.locator('summary').click();
  await incident.getByRole('button', { name: 'Editar' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Incidente atualizado');
  await page.getByRole('button', { name: 'Salvar aprendizado' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const updated = page
    .locator('details.incident-entry')
    .filter({ hasText: 'Incidente atualizado' });
  if ((await updated.getAttribute('open')) === null) await updated.locator('summary').click();
  await updated.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(updated).toHaveCount(0);
  const now = DateTime.now().setZone('America/Sao_Paulo');
  await page.request.post('/api/routines', {
    data: {
      title: 'Atividade atual do teste',
      category: 'WORK',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      startTime: now.minus({ minutes: 15 }).toFormat('HH:mm'),
      endTime: now.plus({ minutes: 45 }).toFormat('HH:mm'),
      priority: 'CRITICAL',
      reminderMinutes: [],
    },
  });
  await page.goto('/today');
  await expect(
    page.locator('.now-card').getByRole('heading', { name: 'Atividade atual do teste' }),
  ).toBeVisible();
  const countdown = page.locator('.now-remaining strong');
  const before = await countdown.innerText();
  await expect.poll(() => countdown.innerText()).not.toBe(before);
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ['/today', '/learning', '/new']) {
      await page.goto(path);
      await expect(page.locator('.loading')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (path === '/new') {
        const box = await page.getByRole('dialog').boundingBox();
        expect(box!.height).toBeLessThanOrEqual(viewport.height);
        expect(box!.width).toBeLessThanOrEqual(viewport.width);
        await page.getByText('Opções avançadas', { exact: true }).click();
        await page.getByLabel('Lembretes (minutos antes)').fill('10, 0');
      }
    }
  }
  await page.goto('/profile');
  const response = page.waitForResponse(
    (r) => r.url().endsWith('/api/push/reminder-test') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Criar lembrete para daqui a 1 minuto' }).click();
  const reminder = await response;
  expect(reminder.ok()).toBe(true);
  await expect(page.getByText('Backend', { exact: true })).toBeVisible();
});
