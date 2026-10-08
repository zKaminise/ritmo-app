import { useEffect, useState } from 'react';
import { Bell, BellRing, Check, Download, RefreshCw } from 'lucide-react';
import { api, useData } from './api';
import { installed, lastPush, activatePush } from './pwa';
import type { Reminder } from './models';
import { Button, Card, useAction } from './ui';
import { useUser } from './context';
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function Notifications() {
  const action = useAction();
  const user = useUser();
  const diagnostics = useData<{
    backend: string;
    timezone: string;
    lastSentAt: string | null;
    subscriptions: number;
    configured: boolean;
    notificationsDesired: boolean;
    schedulerMode: string;
    scheduler: { lastCompletedAt: string | null; lastError: string | null } | null;
  }>('/push/diagnostics', true, 15000);
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'indisponível',
  );
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [activeWorker, setActiveWorker] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [isInstalled, setInstalled] = useState(installed());
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const { data: reminders } = useData<Reminder[]>('/reminders', true, 15000);
  const { data: subscriptions } =
    useData<{ endpoint: string; active: boolean }[]>('/push/subscriptions');
  const { data: config } = useData<{ configured: boolean }>('/push/config');
  const registered =
    !!subscription &&
    !!subscriptions?.some((s) => s.endpoint === subscription.endpoint && s.active);
  async function refresh() {
    if ('Notification' in window) setPermission(Notification.permission);
    setInstalled(installed());
    if ('serviceWorker' in navigator) {
      const r = await navigator.serviceWorker.getRegistration();
      setActiveWorker(!!r?.active);
      if (r?.pushManager) setSubscription(await r.pushManager.getSubscription());
      setLast(await lastPush());
    }
  }
  useEffect(() => {
    void refresh();
    const install = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const push = () => void refresh();
    window.addEventListener('beforeinstallprompt', install);
    window.addEventListener('appinstalled', push);
    navigator.serviceWorker?.addEventListener('message', push);
    return () => {
      window.removeEventListener('beforeinstallprompt', install);
      window.removeEventListener('appinstalled', push);
      navigator.serviceWorker?.removeEventListener('message', push);
    };
  }, []);
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return (
    <>
      <Card>
        <div className="section-heading">
          <h2>
            <Bell size={20} /> Notificações
          </h2>
          <span className={`pill ${registered ? 'success' : ''}`}>
            {permission === 'denied'
              ? 'Permissão negada'
              : registered
                ? 'Dispositivo inscrito'
                : permission === 'granted'
                  ? 'Permitidas'
                  : 'Não configuradas'}
          </span>
        </div>
        <Button
          variant="secondary"
          loading={action.pending}
          onClick={() =>
            void action.run(
              () => api('/push/reminder-test', 'POST'),
              'Lembrete criado para daqui a 1 minuto. A entrega depende da permissão neste dispositivo.',
            )
          }
        >
          Criar lembrete para daqui a 1 minuto
        </Button>
        {!registered && (
          <p className="muted">
            O lembrete de 1 minuto pode ser criado para testar a fila. A entrega exige um
            dispositivo inscrito.
          </p>
        )}
        <p className="muted">Lembretes enviados pelo servidor, mesmo com o Ritmo fechado.</p>
        {!config?.configured && (
          <p className="error">As chaves VAPID precisam ser configuradas no servidor.</p>
        )}
        <div className="quick-actions">
          <Button
            loading={action.pending}
            disabled={registered}
            onClick={() =>
              void action
                .run(activatePush, 'Notificações ativadas neste dispositivo.')
                .then(() => refresh())
            }
          >
            <BellRing size={16} />
            {registered ? 'Notificações ativadas' : 'Ativar notificações'}
          </Button>
          <Button
            variant="secondary"
            loading={action.pending}
            disabled={!registered}
            onClick={() =>
              void action
                .run(
                  () => api('/push/test', 'POST'),
                  diagnostics.data?.schedulerMode === 'external'
                    ? 'Notificação agendada para o próximo ciclo, em cerca de 1 minuto.'
                    : 'Notificação real agendada. Aguarde até 15 segundos.',
                )
                .then(() => refresh())
            }
          >
            Enviar notificação de teste
          </Button>
          {registered && (
            <Button
              variant="ghost"
              loading={action.pending}
              onClick={() =>
                void action.run(async () => {
                  await api('/push/subscriptions', 'DELETE', { endpoint: subscription!.endpoint });
                  await subscription!.unsubscribe();
                  setSubscription(null);
                  return { ok: true };
                }, 'Notificações desativadas neste dispositivo.')
              }
            >
              Desativar
            </Button>
          )}
        </div>
      </Card>
      {!isInstalled && (
        <Card>
          <h3>
            <Download size={20} /> Leve o Ritmo com você
          </h3>
          <p>
            {ios
              ? 'Para receber lembretes mesmo com o aplicativo fechado, adicione o Ritmo à Tela de Início.'
              : 'Instale o Ritmo para abrir sua rotina direto da tela inicial.'}
          </p>
          {ios ? (
            <p className="muted">
              No Safari: Compartilhar → Adicionar à Tela de Início. Abra o app pelo ícone e ative as
              notificações.
            </p>
          ) : prompt ? (
            <Button variant="secondary" onClick={() => void prompt.prompt().then(() => refresh())}>
              Instalar Ritmo
            </Button>
          ) : (
            <p className="muted">
              Use “Instalar aplicativo” no menu ou na barra de endereço do navegador. É necessário
              HTTPS ou localhost.
            </p>
          )}
        </Card>
      )}
      <Card>
        <div className="section-heading">
          <h3>Diagnóstico</h3>
          <Button variant="ghost" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        </div>
        <dl className="diagnostics">
          {[
            ['PWA', isInstalled ? 'Instalada' : 'Navegador'],
            ['Service Worker', activeWorker ? 'Ativo' : 'Inativo'],
            ['Notification API', 'Notification' in window ? 'Disponível' : 'Indisponível'],
            ['Permissão', permission],
            ['Push API', 'PushManager' in window ? 'Disponível' : 'Indisponível'],
            ['PushSubscription', registered ? 'Ativa no servidor' : 'Inativa'],
            [
              'Backend',
              !navigator.onLine || diagnostics.error
                ? 'Offline'
                : diagnostics.data
                  ? 'Online'
                  : 'Verificando',
            ],
            [
              'Último push enviado',
              diagnostics.data?.lastSentAt
                ? new Date(diagnostics.data.lastSentAt).toLocaleString('pt-BR', {
                    timeZone: user.settings.timezone,
                    hour12: false,
                  })
                : 'Nenhum registrado',
            ],
            [
              'Último push recebido',
              last ? new Date(last).toLocaleString('pt-BR') : 'Nenhum registrado',
            ],
            ['Timezone da conta', diagnostics.data?.timezone ?? user.settings.timezone],
            [
              'Agendador',
              diagnostics.data?.schedulerMode === 'external'
                ? 'Hospedado · Supabase'
                : diagnostics.data?.schedulerMode === 'preview-disabled'
                  ? 'Desativado no preview'
                  : 'Contínuo no servidor',
            ],
            [
              'Último ciclo de lembretes',
              diagnostics.data?.scheduler?.lastCompletedAt
                ? new Date(diagnostics.data.scheduler.lastCompletedAt).toLocaleString('pt-BR', {
                    timeZone: user.settings.timezone,
                    hour12: false,
                  })
                : diagnostics.data?.schedulerMode === 'external'
                  ? 'Aguardando primeiro ciclo'
                  : 'Servidor local',
            ],
            ['Timezone detectado', Intl.DateTimeFormat().resolvedOptions().timeZone],
            ['Versão', '1.0.0'],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h4>Últimos envios do servidor</h4>
        {reminders?.slice(0, 8).map((r) => (
          <div className="delivery-row" key={r.id}>
            <span>
              {r.status === 'SENT' ? <Check size={14} /> : <Bell size={14} />} {r.title}
            </span>
            <small>
              {new Date(r.scheduledAt).toLocaleString('pt-BR')} · {r.status} · {r.attempts}{' '}
              tentativa(s)
            </small>
            {r.lastError && <small className="muted">{r.lastError}</small>}
          </div>
        ))}
        {!reminders?.length && <p className="muted">Nenhum envio registrado ainda.</p>}
      </Card>
    </>
  );
}
