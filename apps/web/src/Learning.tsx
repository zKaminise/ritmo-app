import { useState } from 'react';
import { DateTime } from 'luxon';
import { BookOpen, Plus, Pencil, Trash2, Play } from 'lucide-react';
import { incidentSchema, incidentTechnologies } from '@ritmo/shared';
import { api, useData } from './api';
import { useUser } from './context';
import { duration } from './dates';
import type { Focus, Goal, Incident } from './models';
import { Button, Card, Empty, Field, Loading, Modal, PageTitle, Progress, useAction } from './ui';
import { StudyStart } from './StudyStart';
function IncidentEditor({ incident, onSaved }: { incident?: Incident; onSaved: () => void }) {
  const action = useAction();
  const [value, setValue] = useState(
    incident ?? {
      title: '',
      technology: 'NestJS',
      error: '',
      hypothesis: '',
      cause: '',
      solution: '',
      learning: '',
    },
  );
  const [error, setError] = useState('');
  const fields = [
    ['error', 'Erro'],
    ['hypothesis', 'Minha hipótese'],
    ['cause', 'Causa encontrada'],
    ['solution', 'Solução'],
    ['learning', 'O que aprendi'],
  ] as const;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = incidentSchema.safeParse(value);
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Confira os campos.');
          return;
        }
        void action
          .run(
            () =>
              api(
                `/learning/incidents${incident ? `/${incident.id}` : ''}`,
                incident ? 'PUT' : 'POST',
                parsed.data,
              ),
            'Aprendizado registrado.',
          )
          .then((v) => {
            if (v) onSaved();
          });
      }}
    >
      <p className="privacy-note">
        Não registre dados de clientes, tokens, senhas ou informações confidenciais.
      </p>
      <Field label="Título">
        <input
          required
          maxLength={160}
          value={value.title}
          onChange={(e) => setValue({ ...value, title: e.target.value })}
        />
      </Field>
      <Field label="Tecnologia">
        <select
          value={value.technology}
          onChange={(e) => setValue({ ...value, technology: e.target.value })}
        >
          {incidentTechnologies.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      {fields.map(([key, label]) => (
        <Field key={key} label={label}>
          <textarea
            rows={2}
            maxLength={2000}
            value={value[key]}
            onChange={(e) => setValue({ ...value, [key]: e.target.value })}
          />
        </Field>
      ))}
      {error && <p className="error">{error}</p>}
      <Button type="submit" loading={action.pending}>
        Salvar aprendizado
      </Button>
    </form>
  );
}
export function Learning() {
  const user = useUser();
  const zone = user.settings.timezone;
  const { data: goals } = useData<Goal[]>('/goals');
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week');
  const {
    data: history,
    isLoading,
    error,
  } = useData<Focus[]>(`/learning/history?period=${period}`);
  const { data: incidents } = useData<Incident[]>('/learning/incidents');
  const [start, setStart] = useState<Goal | null | undefined>(undefined);
  const [edit, setEdit] = useState<Incident | null | undefined>(undefined);
  const action = useAction();
  return (
    <>
      <PageTitle eyebrow="UM APRENDIZADO DE CADA VEZ" title="Meu aprendizado.">
        <Button onClick={() => setStart(null)}>
          <Play size={16} />
          Começar estudo
        </Button>
      </PageTitle>
      <div className="goal-grid">
        {goals
          ?.filter((g) => g.active && g.category === 'STUDY')
          .map((g) => (
            <Card key={g.id}>
              <div className="goal-heading">
                <span className="activity-icon">📚</span>
                <h2>{g.name}</h2>
              </div>
              <p className="muted">{g.description}</p>
              <p className="goal-number">
                {duration(g.progress * (g.unit === 'HOURS' ? 60 : 1))}
                <small>
                  {' '}
                  / {g.unit === 'HOURS' ? `${g.target}h` : `${g.target} min`} por semana
                </small>
              </p>
              <Progress value={g.percentage} />
              <div className="chips learning-topics">
                {g.topics.map((topic) => (
                  <span className="pill" key={topic}>
                    {topic}
                  </span>
                ))}
              </div>
              <Button variant="secondary" onClick={() => setStart(g)}>
                <Play size={15} />
                Começar estudo
              </Button>
            </Card>
          ))}
      </div>
      <Card>
        <div className="section-heading">
          <h2>Histórico de estudo</h2>
          <BookOpen size={20} />
        </div>
        <div className="segmented">
          {(['today', 'week', 'month'] as const).map((p) => (
            <button key={p} className={period === p ? 'selected' : ''} onClick={() => setPeriod(p)}>
              {{ today: 'Hoje', week: 'Esta semana', month: 'Este mês' }[p]}
            </button>
          ))}
        </div>
        {isLoading ? (
          <Loading />
        ) : error ? (
          <Empty title={error.message} />
        ) : history?.length ? (
          history.map((session) => (
            <article className="study-entry" key={session.id}>
              <div className="study-entry-header">
                <strong>{session.technology || session.title}</strong>
                <span>{duration(session.actualDuration)}</span>
              </div>
              <small>
                {DateTime.fromISO(session.startedAt, { zone, locale: 'pt-BR' }).toFormat(
                  'dd/LL · HH:mm',
                )}
                {session.goal ? ` · ${session.goal.name}` : ''}
              </small>
              {session.studied && <p>{session.studied}</p>}
              {session.learning && <p className="muted pre-wrap">{session.learning}</p>}
            </article>
          ))
        ) : (
          <Empty title="Seu próximo aprendizado começa aqui.">
            <p>
              As sessões finalizadas aparecem neste histórico, com o tempo real e suas observações.
            </p>
          </Empty>
        )}
      </Card>
      <Card>
        <div className="section-heading">
          <h2>Aprendizados de incidentes</h2>
          <Button variant="secondary" onClick={() => setEdit(null)}>
            <Plus size={16} />
            Registrar aprendizado de incidente
          </Button>
        </div>
        <p className="privacy-note">
          Não registre dados de clientes, tokens, senhas ou informações confidenciais.
        </p>
        {incidents?.length ? (
          incidents.map((incident) => (
            <details className="incident-entry" key={incident.id}>
              <summary>
                <strong>{incident.title}</strong>
                <span className="pill">{incident.technology}</span>
              </summary>
              {(
                [
                  ['error', 'Erro'],
                  ['hypothesis', 'Minha hipótese'],
                  ['cause', 'Causa encontrada'],
                  ['solution', 'Solução'],
                  ['learning', 'O que aprendi'],
                ] as const
              ).map(
                ([key, label]) =>
                  incident[key] && (
                    <div key={key}>
                      <h4>{label}</h4>
                      <p className="pre-wrap">{incident[key]}</p>
                    </div>
                  ),
              )}
              <div className="quick-actions">
                <Button variant="ghost" onClick={() => setEdit(incident)}>
                  <Pencil size={15} />
                  Editar
                </Button>
                <Button
                  variant="danger"
                  loading={action.pending}
                  onClick={() =>
                    void action.run(
                      () => api(`/learning/incidents/${incident.id}`, 'DELETE'),
                      'Registro removido.',
                    )
                  }
                >
                  <Trash2 size={15} />
                  Excluir
                </Button>
              </div>
            </details>
          ))
        ) : (
          <Empty title="Transforme um problema em aprendizado.">
            <p>Guarde hipóteses, causas e soluções para consultar depois.</p>
          </Empty>
        )}
      </Card>
      {start !== undefined && (
        <Modal title="Começar estudo" onClose={() => setStart(undefined)}>
          <StudyStart presetGoal={start ?? undefined} onStarted={() => setStart(undefined)} />
        </Modal>
      )}
      {edit !== undefined && (
        <Modal
          title={edit ? 'Editar aprendizado' : 'Registrar aprendizado de incidente'}
          onClose={() => setEdit(undefined)}
        >
          <IncidentEditor incident={edit ?? undefined} onSaved={() => setEdit(undefined)} />
        </Modal>
      )}
    </>
  );
}
