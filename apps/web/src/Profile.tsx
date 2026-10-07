import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { categorySchema, settingsSchema, type SettingsInput } from '@ritmo/shared';
import { LogOut, Moon, Sun, UserRound, CalendarDays } from 'lucide-react';
import { api, clearPrivateCache } from './api';
import { useUser } from './context';
import { Button, Card, Field, Modal, PageTitle, useAction } from './ui';
import { SettingsFields } from './SettingsFields';
import { Notifications } from './Notifications';
export function Profile() {
  const user = useUser();
  const action = useAction();
  const [p, setP] = useState<SettingsInput>(user.settings);
  useEffect(() => setP(user.settings), [user.settings]);
  const [name, setName] = useState(user.name);
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState(false);
  const [category, setCategory] = useState({ key: '', name: '', emoji: '✨', color: '#a3e635' });
  const save = async () => {
    const parsed = settingsSchema.safeParse(p);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira suas preferências.');
      return;
    }
    setError('');
    await action.run(async () => {
      await api('/users/me', 'PATCH', { name });
      return api('/settings', 'PUT', parsed.data);
    });
  };
  return (
    <>
      <PageTitle eyebrow="A ROTINA É SUA" title="Seu ritmo, suas escolhas." />
      <Card>
        <div className="profile-heading">
          <span className="avatar">{user.name.slice(0, 1).toLocaleUpperCase()}</span>
          <div className="grow">
            <h2>{user.name}</h2>
            <p className="muted">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            loading={action.pending}
            onClick={() =>
              void action.run(async () => {
                const r = await navigator.serviceWorker?.getRegistration();
                const s = await r?.pushManager?.getSubscription();
                if (s) {
                  await api('/push/subscriptions', 'DELETE', { endpoint: s.endpoint });
                  await s.unsubscribe();
                }
                await api('/auth/logout', 'POST');
                clearPrivateCache();
                return { ok: true };
              }, 'Até a próxima.')
            }
          >
            <LogOut size={16} />
            Sair
          </Button>
        </div>
        <Field label="Seu nome">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </Field>
        <Link className="button secondary" to="/routines">
          <CalendarDays size={16} />
          Editar minha rotina semanal
        </Link>
        <Link className="button ghost" to="/learning">
          📚 Meu aprendizado
        </Link>
        <p className="muted">
          Idioma: {user.settings.locale} · Horário: 24 horas · Semana começa na segunda-feira.
        </p>
        <Link className="button ghost" to="/focus">
          <UserRound size={16} />
          Começar uma sessão de foco
        </Link>
      </Card>
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <SettingsFields value={p} onChange={setP} />
          <h3>Seu jeito de planejar</h3>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.autoPlan}
              onChange={(e) => setP({ ...p, autoPlan: e.target.checked })}
            />
            Planejamento automático
          </label>
          <p className="muted">
            Autoriza adicionar atividades nas janelas livres. Compromissos críticos e fixos nunca
            são movidos.
          </p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={p.notificationsDesired}
              onChange={(e) => setP({ ...p, notificationsDesired: e.target.checked })}
            />
            Quero receber lembretes
          </label>
          <h3>Aparência</h3>
          <div className="segmented">
            <button
              type="button"
              className={p.theme === 'dark' ? 'selected' : ''}
              onClick={() => setP({ ...p, theme: 'dark' })}
            >
              <Moon size={15} />
              Escuro
            </button>
            <button
              type="button"
              className={p.theme === 'light' ? 'selected' : ''}
              onClick={() => setP({ ...p, theme: 'light' })}
            >
              <Sun size={15} />
              Claro
            </button>
          </div>
          <h3>Lembretes padrão por categoria</h3>
          <p className="muted">
            Usados em novas atividades e sugestões do planejador. Minutos antes, separados por
            vírgula; 0 é no início.
          </p>
          <div className="form-grid">
            {user.categories.map((c) => (
              <Field label={`${c.emoji} ${c.name}`} key={c.key}>
                <input
                  defaultValue={p.categoryReminders[c.key]?.join(', ') ?? '10, 0'}
                  onBlur={(e) =>
                    setP({
                      ...p,
                      categoryReminders: {
                        ...p.categoryReminders,
                        [c.key]: e.target.value.trim()
                          ? e.target.value.split(',').map((s) => Number(s.trim()))
                          : [],
                      },
                    })
                  }
                />
              </Field>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
          <Button type="submit" loading={action.pending}>
            Salvar preferências
          </Button>
        </form>
      </Card>
      <Card>
        <div className="section-heading">
          <h3>Categorias</h3>
          <Button variant="secondary" onClick={() => setNewCategory(true)}>
            Nova categoria
          </Button>
        </div>
        <div className="chips">
          {user.categories.map((c) => (
            <span className="pill" key={c.key}>
              {c.emoji} {c.name}
            </span>
          ))}
        </div>
      </Card>
      <Notifications />
      {newCategory && (
        <Modal title="Uma categoria do seu jeito" onClose={() => setNewCategory(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const result = categorySchema.safeParse(category);
              if (!result.success) {
                setError(result.error.issues[0]?.message ?? 'Confira a categoria.');
                return;
              }
              void action
                .run(() => api('/categories', 'POST', result.data))
                .then((v) => {
                  if (v) setNewCategory(false);
                });
            }}
          >
            <Field label="Nome">
              <input
                value={category.name}
                onChange={(e) =>
                  setCategory({
                    ...category,
                    name: e.target.value,
                    key: e.target.value
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .toUpperCase()
                      .replace(/[^A-Z0-9]+/g, '_'),
                  })
                }
              />
            </Field>
            <Field label="Identificador">
              <input
                value={category.key}
                onChange={(e) => setCategory({ ...category, key: e.target.value.toUpperCase() })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Emoji">
                <input
                  value={category.emoji}
                  onChange={(e) => setCategory({ ...category, emoji: e.target.value })}
                />
              </Field>
              <Field label="Cor">
                <input
                  type="color"
                  value={category.color}
                  onChange={(e) => setCategory({ ...category, color: e.target.value })}
                />
              </Field>
            </div>
            {error && <p className="error">{error}</p>}
            <Button type="submit" loading={action.pending}>
              Criar categoria
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
