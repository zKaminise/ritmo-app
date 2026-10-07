import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Play, Timer } from 'lucide-react';
import { api, useData } from './api';
import { useUser } from './context';
import type { Focus as FocusSession } from './models';
import { Button, Card, Field, Loading, PageTitle, Progress, useAction, Modal } from './ui';
import { StudyStart } from './StudyStart';
export function Focus() {
  const { data: sessions, isLoading } = useData<FocusSession[]>('/focus-sessions', true, 15000);
  const user = useUser();
  const active = sessions?.find((s) => !s.endedAt);
  const action = useAction();
  const [title, setTitle] = useState('Estudar');
  const [minutes, setMinutes] = useState(user.settings.studyMinutes || 30);
  const [category, setCategory] = useState('STUDY');
  const [now, setNow] = useState(Date.now());
  const [finishing, setFinishing] = useState(false);
  const [studied, setStudied] = useState('');
  const [learning, setLearning] = useState('');
  const finish = async (withNotes: boolean) => {
    const value = await action.run(
      () =>
        api(`/focus-sessions/${active!.id}/finish`, 'POST', withNotes ? { studied, learning } : {}),
      'Tempo real registrado. Um passo a mais na sua meta.',
    );
    if (value) {
      setFinishing(false);
      setStudied('');
      setLearning('');
    }
  };
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (isLoading) return <Loading />;
  const remaining = active
    ? Math.max(
        0,
        Math.ceil((+new Date(active.startedAt) + active.plannedMinutes * 60000 - now) / 1000),
      )
    : 0;
  return (
    <>
      <PageTitle eyebrow="UM PASSO DE CADA VEZ" title="Só o que importa agora." />
      {active ? (
        <Card className="focus-card">
          <span className="focus-orbit">
            <Timer size={32} />
          </span>
          <p className="eyebrow">{active.title}</p>
          <h2 className="focus-timer">
            {String(Math.floor(remaining / 60)).padStart(2, '0')}
            <span>:</span>
            {String(remaining % 60).padStart(2, '0')}
          </h2>
          <p className="muted">
            {remaining
              ? 'Esse tempo é seu. Uma coisa de cada vez.'
              : 'Seu tempo planejado terminou. Registre seu progresso.'}
          </p>
          <Progress
            value={((now - +new Date(active.startedAt)) / (active.plannedMinutes * 60000)) * 100}
          />
          <Button loading={action.pending} onClick={() => setFinishing(true)}>
            <Check size={17} />
            Finalizar e registrar tempo
          </Button>
          <small>O cronômetro continua correto ao fechar e reabrir o app.</small>
          {active.occurrenceId && (
            <Link to={`/occurrences/${active.occurrenceId}`}>Ver compromisso</Link>
          )}
        </Card>
      ) : (
        <Card className="focus-start">
          <span className="planner-symbol">
            <Play />
          </span>
          <h2>Abra espaço para se concentrar.</h2>
          <p className="muted">Escolha uma atividade e dedique um tempo a ela.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                () => api('/focus-sessions', 'POST', { title, category, plannedMinutes: minutes }),
                '',
              );
            }}
          >
            <Field label="Atividade">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={120}
              />
            </Field>
            <div className="form-grid">
              <Field label="Categoria">
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {user.categories.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Minutos">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </Field>
            </div>
            <Button className="full" type="submit" loading={action.pending}>
              <Play size={16} />
              Começar foco
            </Button>
          </form>
        </Card>
      )}
      {!active && (
        <Card className="focus-start">
          <h2>Começar um estudo</h2>
          <p className="muted">Selecione tecnologia e meta para contabilizar seu aprendizado.</p>
          <StudyStart />
        </Card>
      )}
      <Card>
        <h3>Sessões recentes</h3>
        {sessions
          ?.filter((s) => s.endedAt)
          .slice(0, 10)
          .map((s) => (
            <div className="list-row" key={s.id}>
              <strong>{s.title}</strong>
              <small>{s.actualDuration} min registrados</small>
            </div>
          ))}
        {!sessions?.some((s) => s.endedAt) && (
          <p className="muted">Sua próxima sessão pode começar agora.</p>
        )}
      </Card>
      {finishing && active && (
        <Modal title="O que você estudou?" onClose={() => setFinishing(false)}>
          <p className="muted">Anotações opcionais para lembrar do seu próximo passo.</p>
          <Field label="O que você estudou?">
            <input
              maxLength={300}
              value={studied}
              onChange={(e) => setStudied(e.target.value)}
              placeholder="Ex.: Controllers e Services"
            />
          </Field>
          <Field label="Aprendizado / observação">
            <textarea
              maxLength={2000}
              rows={3}
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
            />
          </Field>
          <div className="quick-actions">
            <Button loading={action.pending} onClick={() => void finish(true)}>
              Finalizar e salvar
            </Button>
            <Button variant="ghost" loading={action.pending} onClick={() => void finish(false)}>
              Salvar sem anotações
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
