import { api } from './api';
export async function registerWorker() {
  if ('serviceWorker' in navigator) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  }
}
export function installed() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && navigator.standalone === true)
  );
}
export async function activatePush() {
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator))
    throw new Error(
      'Este navegador não oferece Web Push. No iPhone, instale na Tela de Início primeiro.',
    );
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Notificações não foram permitidas. Você pode alterar isso nas configurações do dispositivo.',
    );
  const config = await api<{ configured: boolean; publicKey: string | null }>('/push/config');
  if (!config.configured || !config.publicKey)
    throw new Error('As chaves VAPID ainda não foram configuradas no servidor.');
  const registration = await navigator.serviceWorker.ready;
  const bytes = Uint8Array.from(
    atob(config.publicKey.replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: bytes,
    }));
  await api('/push/subscriptions', 'POST', subscription.toJSON());
  return subscription;
}
export async function lastPush() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.active) return null;
  return new Promise<string | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 2000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(typeof e.data === 'string' ? e.data : null);
    };
    reg.active!.postMessage({ type: 'LAST_PUSH' }, [channel.port2]);
  });
}
