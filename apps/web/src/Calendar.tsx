import { useState } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { api, useData } from './api';
import { useUser } from './context';
import { clock, dayLabel, today, weekdays } from './dates';
import type { Occurrence, Routine } from './models';
import { Button, Card, Empty, Loading, Modal, PageTitle, useAction } from './ui';
import { ActivityEditor } from './ActivityEditor';
export function Calendar() {
  const user = useUser();
  const zone = user.settings.timezone;
  const [date, setDate] = useState(today(zone));
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  const selected = DateTime.fromISO(date, { zone, locale: 'pt-BR' });
  const first = selected.startOf(view);
  const last = selected.endOf(view);
  const from = first.toISODate()!;
  const to = last.toISODate()!;
  const {
    data: items,
    isLoading,
    error,
  } = useData<Occurrence[]>(`/occurrences?from=${from}&to=${to}`);
  const days = Array.from({ length: Math.round(last.diff(first, 'days').days) }, (_, i) =>
    first.plus({ days: i }),
  );
  return (
    <>
      <PageTitle eyebrow="ESPAÇO PARA SUA VIDA" title="Sua agenda.">
        <Link className="button secondary" to="/routines">
          <CalendarDays size={16} />
          Minha rotina semanal
        </Link>
      </PageTitle>
      <Card className="calendar-toolbar">
        <div className="segmented">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>
              {{ day: 'Dia', week: 'Semana', month: 'Mês' }[v]}
            </button>
          ))}
        </div>
        <div className="calendar-nav">
          <button
            className="icon-button"
            aria-label="Período anterior"
            onClick={() =>
              setDate(
                selected
                  .minus({ [view === 'day' ? 'days' : view === 'week' ? 'weeks' : 'months']: 1 })
                  .toISODate()!,
              )
            }
          >
            <ChevronLeft />
          </button>
          <input
            aria-label="Data da agenda"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <button
            className="icon-button"
            aria-label="Próximo período"
            onClick={() =>
              setDate(
                selected
                  .plus({ [view === 'day' ? 'days' : view === 'week' ? 'weeks' : 'months']: 1 })
                  .toISODate()!,
              )
            }
          >
            <ChevronRight />
          </button>
          <Button variant="ghost" onClick={() => setDate(today(zone))}>
            Hoje
          </Button>
        </div>
      </Card>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Empty title={error.message} />
      ) : view === 'month' ? (
        <Card>
          <h2>{selected.toFormat('LLLL yyyy')}</h2>
          <div className="month-grid">
            {weekdays.map((d) => (
              <strong className="month-label" key={d}>
                {d}
              </strong>
            ))}
            {Array.from({ length: first.weekday - 1 }, (_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map((d) => {
              const list = items?.filter((i) => i.localDate === d.toISODate()) ?? [];
              return (
                <button
                  className={`month-day ${d.toISODate() === today(zone) ? 'today' : ''}`}
                  key={d.toISODate()}
                  onClick={() => {
                    setDate(d.toISODate()!);
                    setView('day');
                  }}
                >
                  <strong>{d.day}</strong>
                  {list.slice(0, 3).map((i) => (
                    <span key={i.id} style={{ borderLeftColor: i.color }}>
                      {i.emoji} {i.title}
                    </span>
                  ))}
                  {list.length > 3 && <small>+{list.length - 3} atividades</small>}
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className={`calendar-days ${view}`}>
          {days.map((d) => {
            const list =
              items?.filter(
                (i) =>
                  i.localDate === d.toISODate() ||
                  (new Date(i.startAt) < d.toJSDate() && new Date(i.endAt) > d.toJSDate()),
              ) ?? [];
            return (
              <Card key={d.toISODate()}>
                <h3 className="calendar-day-title">{dayLabel(d.toISODate()!, zone)}</h3>
                {list.length ? (
                  list.map((item) => (
                    <Link
                      className={`calendar-event ${item.status === 'COMPLETED' ? 'done' : ''}`}
                      key={item.id}
                      to={`/occurrences/${item.id}`}
                      style={{ borderLeftColor: item.color }}
                    >
                      <span>{item.emoji}</span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {clock(item.startAt, zone)} — {clock(item.endAt, zone)}
                          {item.status === 'SKIPPED' ? ' · Pulado hoje' : ''}
                        </small>
                      </div>
                      <ChevronRight size={15} />
                    </Link>
                  ))
                ) : (
                  <Empty title="Seu dia está livre neste período." />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
export function Routines() {
  const { data: rules, isLoading, error } = useData<Routine[]>('/routines');
  const [editing, setEditing] = useState<Routine | null | undefined>(undefined);
  const [day, setDay] = useState(1);
  const action = useAction();
  return (
    <>
      <PageTitle eyebrow="UMA BASE PARA SEUS DIAS" title="Minha semana.">
        <Button onClick={() => setEditing(null)}>
          <Plus size={16} />
          Nova atividade
        </Button>
      </PageTitle>
      <div className="day-picker week-picker">
        {weekdays.map((d, i) => (
          <button key={d} onClick={() => setDay(i + 1)} className={day === i + 1 ? 'selected' : ''}>
            {d}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Empty title={error.message} />
      ) : (
        <Card>
          {rules?.filter((r) => r.weekdays.includes(day)).length ? (
            rules
              .filter((r) => r.weekdays.includes(day))
              .map((rule) => (
                <div className={`routine-row ${rule.active ? '' : 'inactive'}`} key={rule.id}>
                  <span className="activity-icon" style={{ background: `${rule.color}22` }}>
                    {rule.emoji}
                  </span>
                  <div className="grow">
                    <strong>{rule.title}</strong>
                    <small>
                      {rule.startTime} — {rule.endTime} · {rule.flexible ? 'Flexível' : 'Fixo'} ·{' '}
                      {rule.active ? 'Ativo' : 'Inativo'}
                      {rule.effectiveUntil ? ` · até ${rule.effectiveUntil}` : ''}
                    </small>
                  </div>
                  <Button
                    variant="ghost"
                    aria-label={`Editar ${rule.title}`}
                    onClick={() => setEditing(rule)}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Desativar ${rule.title}`}
                    loading={action.pending}
                    onClick={() =>
                      void action.run(
                        () => api(`/routines/${rule.id}`, 'DELETE'),
                        'Rotina desativada. O histórico foi preservado.',
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))
          ) : (
            <Empty title="Um novo espaço na sua semana.">
              <p>Adicione suas atividades recorrentes. Todas podem ser ajustadas depois.</p>
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Criar atividade
              </Button>
            </Empty>
          )}
        </Card>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? 'Editar rotina' : 'Nova atividade recorrente'}
          onClose={() => setEditing(undefined)}
        >
          <ActivityEditor
            kind="routine"
            routine={editing ?? undefined}
            onSaved={() => setEditing(undefined)}
          />
        </Modal>
      )}
      <p className="muted footnote">
        Para alterar somente um dia, abra o compromisso na agenda. As próximas 14 datas são
        materializadas automaticamente.
      </p>
    </>
  );
}
