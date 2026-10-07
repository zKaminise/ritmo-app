import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, Clock3, ArrowRight, Pencil, MapPin, Play, Trash2 } from 'lucide-react';
import { api, useData } from './api';
import { useUser } from './context';
import { clock, dayLabel, duration } from './dates';
import type { Focus, Occurrence } from './models';
import { Button, Card, Empty, Field, Loading, Modal, PageTitle, useAction } from './ui';
import { ActivityEditor } from './ActivityEditor';
export function OccurrenceActions({
  item,
  compact = false,
}: {
  item: Occurrence;
  compact?: boolean;
}) {
  const [panel, setPanel] = useState<'snooze' | 'edit' | null>(null);
  const user = useUser();
  const action = useAction();
  const navigate = useNavigate();
  const [scope, setScope] = useState('TODAY');
  const [start, setStart] = useState(clock(item.startAt, item.timezone));
  const [end, setEnd] = useState(clock(item.endAt, item.timezone));
  const [title, setTitle] = useState(item.title);
  return (
    <>
      <div className={`quick-actions ${compact ? 'compact' : ''}`}>
        <Button
          variant="secondary"
          loading={action.pending}
          onClick={() =>
            void action.run(
              () => api(`/occurrences/${item.id}/completion`, 'POST', { status: 'COMPLETED' }),
              'Atividade concluída. Bom trabalho!',
            )
          }
        >
          <Check size={16} />
          Concluir
        </Button>
        <Button variant="ghost" aria-label="Adiar lembrete" onClick={() => setPanel('snooze')}>
          <Clock3 size={16} />
          {!compact && 'Adiar'}
        </Button>
        <Button
          variant="ghost"
          aria-label="Pular hoje"
          loading={action.pending}
          onClick={() =>
            void action.run(
              () => api(`/occurrences/${item.id}/completion`, 'POST', { status: 'SKIPPED' }),
              'Pulada só hoje. Tudo bem ajustar o ritmo.',
            )
          }
        >
          <ArrowRight size={16} />
          {!compact && 'Pular hoje'}
        </Button>
        <Button variant="ghost" aria-label="Alterar" onClick={() => setPanel('edit')}>
          <Pencil size={16} />
          {!compact && 'Alterar'}
        </Button>
      </div>
      {panel === 'snooze' && (
        <Modal title="Lembrar de novo em…" onClose={() => setPanel(null)}>
          <p className="muted">O horário da atividade continua o mesmo.</p>
          <div className="form-grid">
            {[5, 10, 15, 30].map((minutes) => (
              <Button
                key={minutes}
                variant="secondary"
                loading={action.pending}
                onClick={() =>
                  void action
                    .run(
                      () => api(`/occurrences/${item.id}/snooze`, 'POST', { minutes }),
                      `Lembrete adiado por ${minutes} minutos.`,
                    )
                    .then((v) => {
                      if (v) setPanel(null);
                    })
                }
              >
                {minutes} minutos
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {panel === 'edit' && (
        <Modal title="Ajustar compromisso" onClose={() => setPanel(null)}>
          {item.eventId ? (
            <ActivityEditor occurrence={item} onSaved={() => setPanel(null)} />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action
                  .run(() =>
                    api(`/occurrences/${item.id}`, 'PATCH', {
                      scope,
                      startTime: start,
                      endTime: end,
                      title,
                    }),
                  )
                  .then((v) => {
                    if (v) setPanel(null);
                  });
              }}
            >
              <Field label="Aplicar alteração">
                <select value={scope} onChange={(e) => setScope(e.target.value)}>
                  <option value="TODAY">Somente neste dia</option>
                  <option value="FUTURE">Todas as próximas ocorrências</option>
                </select>
              </Field>
              <Field label="Nome">
                <input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </Field>
              <div className="form-grid">
                <Field label="Início">
                  <input
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Fim">
                  <input
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <small className="muted">Horários em {user.settings.timezone}</small>
              <Button type="submit" loading={action.pending}>
                Salvar alteração
              </Button>
            </form>
          )}
        </Modal>
      )}
      <Button
        variant="ghost"
        className="focus-link"
        loading={action.pending}
        onClick={() =>
          void action
            .run(
              () =>
                api<Focus>('/focus-sessions', 'POST', {
                  occurrenceId: item.id,
                  title: item.title,
                  category: item.category,
                  plannedMinutes: Math.max(
                    1,
                    Math.round(
                      (+new Date(item.endAt) - Math.max(Date.now(), +new Date(item.startAt))) /
                        60000,
                    ),
                  ),
                }),
              '',
            )
            .then((v) => {
              if (v) navigate('/focus');
            })
        }
      >
        <Play size={15} /> Entrar em foco
      </Button>
    </>
  );
}
export function OccurrencePage() {
  const { id } = useParams();
  const { data: item, isLoading, error } = useData<Occurrence>(`/occurrences/${id}`);
  const action = useAction();
  const navigate = useNavigate();
  if (isLoading) return <Loading />;
  if (!item)
    return (
      <Empty title={error instanceof Error ? error.message : 'Compromisso não encontrado.'}>
        <Link to="/">Voltar para hoje</Link>
      </Empty>
    );
  return (
    <>
      <PageTitle eyebrow={dayLabel(item.localDate, item.timezone)} title={item.title} />
      <Card className="detail-card">
        <div className="detail-emoji" style={{ background: `${item.color}22` }}>
          {item.emoji}
        </div>
        <h2>
          {clock(item.startAt, item.timezone)} — {clock(item.endAt, item.timezone)}
        </h2>
        <p className="muted">
          {duration((+new Date(item.endAt) - +new Date(item.startAt)) / 60000)} · {item.timezone}
        </p>
        {item.location && (
          <p>
            <MapPin size={16} /> {item.location}
          </p>
        )}
        {item.notes && <p className="pre-wrap">{item.notes}</p>}
        <span className="pill">
          {
            {
              SCHEDULED: 'Planejado',
              COMPLETED: 'Concluído',
              SKIPPED: 'Pulado neste dia',
              MISSED: 'Não registrado',
              PARTIAL: 'Parcial',
            }[item.status]
          }
        </span>
        <OccurrenceActions item={item} />
        {item.completion && (
          <p className="muted">
            Tempo registrado: {duration(item.completion.actualDuration)} {item.completion.notes}
          </p>
        )}
        {item.eventId && (
          <Button
            variant="danger"
            loading={action.pending}
            onClick={() =>
              void action
                .run(() => api(`/events/${item.eventId}`, 'DELETE'), 'Compromisso removido.')
                .then((v) => {
                  if (v) navigate('/calendar');
                })
            }
          >
            <Trash2 size={16} />
            Excluir compromisso
          </Button>
        )}
      </Card>
      <Card>
        <h3>Lembretes</h3>
        {item.reminders?.length ? (
          item.reminders.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <strong>{r.title}</strong>
                <small>
                  {clock(r.scheduledAt, item.timezone)} · {r.status}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Nenhum lembrete configurado.</p>
        )}
      </Card>
    </>
  );
}
