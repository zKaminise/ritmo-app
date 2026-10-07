import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
interface WorkerEvent {
  waitUntil: (promise: Promise<unknown>) => void;
  data?: unknown;
  notification?: unknown;
  action?: string;
  ports?: unknown[];
}
function harness() {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  const client = {
    url: 'https://ritmo.test/',
    navigate: vi.fn(async () => {}),
    focus: vi.fn(async () => {}),
    postMessage: vi.fn(),
  };
  const registration = { showNotification: vi.fn(async () => {}) };
  const navigator = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
  const fetch = vi.fn(async () => ({ ok: true }));
  const self = {
    location: { origin: 'https://ritmo.test' },
    addEventListener: (type: string, listener: (event: WorkerEvent) => void) =>
      handlers.set(type, listener),
    registration,
    navigator,
    clients: { matchAll: async () => [client], openWindow: vi.fn(async () => {}) },
  };
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self,
    indexedDB: new IDBFactory(),
    URL,
    fetch,
    Date,
    Promise,
  });
  const dispatch = async (type: string, fields: Omit<WorkerEvent, 'waitUntil'>) => {
    const promises: Promise<unknown>[] = [];
    handlers.get(type)!({ ...fields, waitUntil: (p) => promises.push(p) });
    await Promise.all(promises);
  };
  return { dispatch, client, registration, navigator, fetch };
}
describe('Service Worker de produção com adaptadores de plataforma', () => {
  it('processa push, deduplica reminderId e guarda último recebido', async () => {
    const h = harness();
    const payload = {
      title: 'Academia',
      body: 'Começa agora.',
      url: '/occurrences/123',
      occurrenceId: '123',
      reminderId: 'r1',
    };
    await h.dispatch('push', { data: { json: () => payload } });
    await h.dispatch('push', { data: { json: () => payload } });
    expect(h.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(h.navigator.setAppBadge).toHaveBeenCalledWith(1);
    const postMessage = vi.fn();
    await h.dispatch('message', { data: { type: 'LAST_PUSH' }, ports: [{ postMessage }] });
    expect(postMessage).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });
  it('foca a aba existente e abre o compromisso no clique', async () => {
    const h = harness();
    const close = vi.fn();
    await h.dispatch('notificationclick', {
      notification: { close, data: { url: '/occurrences/123', occurrenceId: '123' } },
      action: '',
    });
    expect(close).toHaveBeenCalledOnce();
    expect(h.client.navigate).toHaveBeenCalledWith('https://ritmo.test/occurrences/123');
    expect(h.client.focus).toHaveBeenCalledOnce();
    expect(h.navigator.clearAppBadge).toHaveBeenCalledOnce();
  });
  it('cria snooze por REST sem mudar o compromisso', async () => {
    const h = harness();
    await h.dispatch('notificationclick', {
      notification: { close: vi.fn(), data: { url: '/occurrences/123', occurrenceId: '123' } },
      action: 'snooze-10',
    });
    expect(h.fetch).toHaveBeenCalledWith(
      '/api/occurrences/123/snooze',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ minutes: 10 }),
      }),
    );
    expect(h.client.navigate).not.toHaveBeenCalled();
  });
  it('não mostra push nem abre link de origem externa', async () => {
    const h = harness();
    await h.dispatch('push', {
      data: {
        json: () => ({ title: 'Externo', url: 'https://outro.test/', reminderId: 'external' }),
      },
    });
    expect(h.registration.showNotification).not.toHaveBeenCalled();
    await h.dispatch('notificationclick', {
      notification: { close: vi.fn(), data: { url: 'https://outro.test/' } },
      action: '',
    });
    expect(h.client.navigate).not.toHaveBeenCalled();
  });
});
