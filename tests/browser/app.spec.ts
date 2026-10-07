import { expect, test } from '@playwright/test';
test('cadastro, onboarding, rotina, metas, compromisso, foco, calendário e offline', async ({
  page,
  context,
}) => {
  const failures: string[] = [];
  page.on('pageerror', (e) => failures.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Começar agora' }).click();
  const email = `browser-${Date.now()}@ritmo.local`;
  await page.getByLabel('Seu nome').fill('Marina');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill('SenhaBrowser!123');
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await expect(page.getByRole('heading', { name: 'Seu dia começa com você.' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Começar meu dia' }).click();
  await expect(page.getByRole('heading', { name: /Marina/, level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'work/browser-home-desktop.png', fullPage: true });
  await expect(page.getByText('Pequenos passos.')).toBeVisible();
  await page.getByRole('link', { name: 'Minha semana', exact: true }).click();
  await page.getByRole('button', { name: 'Nova atividade' }).click();
  await page.getByLabel('Nome da atividade').fill('Java de manhã');
  await page.getByLabel('Categoria', { exact: true }).selectOption('STUDY');
  await page.getByLabel('Começa às').fill('08:00');
  await page.getByLabel('Termina às').fill('08:30');
  await page.getByRole('button', { name: 'Adicionar ao meu dia' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Metas', exact: true }).first().click();
  await page.getByRole('button', { name: 'Nova meta' }).click();
  await page.getByLabel('Nome da meta').fill('Java em prática');
  await page.getByLabel('Tópico (opcional)').fill('Java');
  await page.getByRole('button', { name: 'Salvar meta' }).click();
  await expect(page.getByRole('heading', { name: 'Java em prática' })).toBeVisible();
  await page.getByRole('link', { name: 'Adicionar compromisso', exact: true }).click();
  await page.getByLabel('Nome da atividade').fill('Java browser');
  await page.getByLabel('Categoria', { exact: true }).selectOption('STUDY');
  await page.getByLabel('Começa às').fill('10:00');
  await page.getByLabel('Termina às').fill('10:30');
  await page.getByRole('button', { name: 'Adicionar ao meu dia' }).click();
  await expect(page.getByText('Conflito encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Manter os dois e salvar' }).click();
  await expect(page.getByRole('heading', { name: 'Sua agenda.' })).toBeVisible();
  await page.getByRole('link').filter({ hasText: 'Java browser' }).click();
  await expect(page.getByRole('heading', { name: 'Java browser' })).toBeVisible();
  await page.getByRole('button', { name: 'Concluir', exact: true }).click();
  await expect(page.getByText('Concluído', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Metas', exact: true }).first().click();
  const card = page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { name: 'Java em prática' }) });
  await expect(card.getByText('Meta alcançada. Celebre esse passo!')).toBeVisible();
  await page.getByRole('link', { name: 'Modo foco', exact: true }).click();
  await page.getByRole('button', { name: 'Começar foco' }).click();
  await expect(page.getByRole('button', { name: 'Finalizar e registrar tempo' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Finalizar e registrar tempo' })).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar e registrar tempo' }).click();
  await page.getByRole('button', { name: 'Salvar sem anotações' }).click();
  await expect(page.getByRole('button', { name: 'Começar foco' })).toBeVisible();
  await page.getByRole('link', { name: 'Perfil', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Diagnóstico', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ativar notificações' })).toBeVisible();
  await page.getByRole('link', { name: 'Hoje', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: /Marina/, level: 1 })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'work/browser-home-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: /Marina/, level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Você está offline.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Marina/, level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Calendário', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Sua agenda.' })).toBeVisible();
  await context.setOffline(false);
  expect(failures).toEqual([]);
});
test('manifest e service worker são servidos sem solicitar permissão automática', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(Notification, 'requestPermission', {
      value: () => {
        throw new Error('Permissão solicitada sem ação explícita.');
      },
    });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Começar agora' })).toBeVisible();
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  const value = await manifest.json();
  expect(value.display).toBe('standalone');
  expect(value.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  const sw = await page.request.get('/sw.js');
  const source = await sw.text();
  expect(source).toContain('/assets/');
  expect(source).toContain('notificationclick');
  expect(source).toContain('showNotification');
  expect(source).toContain('setAppBadge');
  expect(['default', 'denied']).toContain(await page.evaluate(() => Notification.permission));
});
