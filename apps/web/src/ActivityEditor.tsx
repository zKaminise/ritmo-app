import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { eventSchema, routineSchema } from '@ritmo/shared';
import { api } from './api';
import { useUser } from './context';
import { today, weekdays, clock } from './dates';
import type { Occurrence, Routine } from './models';
import { Button, Field, useAction } from './ui';
interface Values {
  title: string;
  category: string;
  emoji: string;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  weekdays: number[];
  flexible: boolean;
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW';
  location: string;
  notes: string;
  reminders: string;
  active: boolean;
  reminderMessages: Record<string, { title: string; body: string }>;
}
export function ActivityEditor({
  kind = 'event',
  routine,
  occurrence,
  onSaved,
}: {
  kind?: 'event' | 'routine';
  routine?: Routine;
  occurrence?: Occurrence;
  onSaved: () => void;
}) {
  const user = useUser();
  const action = useAction();
  const zone = user.settings.timezone;
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<Occurrence[] | null>(null);
  const source = routine ?? occurrence;
  const form = useForm<Values>({
    defaultValues: {
      title: source?.title ?? '',
      category: source?.category ?? 'PERSONAL',
      emoji: source?.emoji ?? '📌',
      color: source?.color ?? '#6ee7b7',
      date: occurrence?.localDate ?? today(zone),
      startTime: routine?.startTime ?? (occurrence ? clock(occurrence.startAt, zone) : '09:00'),
      endTime: routine?.endTime ?? (occurrence ? clock(occurrence.endAt, zone) : '10:00'),
      weekdays: routine?.weekdays ?? [1, 2, 3, 4, 5],
      flexible: routine?.flexible ?? false,
      priority: source?.priority ?? 'NORMAL',
      location: source?.location ?? '',
      notes: source?.notes ?? '',
      reminders:
        (routine?.reminderMinutes ?? occurrence?.reminderMinutes)?.join(', ') ??
        user.settings.categoryReminders[source?.category ?? 'PERSONAL']?.join(', ') ??
        '10, 0',
      active: routine?.active ?? true,
      reminderMessages: source?.reminderMessages ?? {},
    },
  });
  const category = form.watch('category');
  const days = form.watch('weekdays');
  const reminderMessages = form.watch('reminderMessages');
  const offsets = form
    .watch('reminders')
    .split(',')
    .filter((v) => v.trim())
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
    .slice(0, 10);
  const chooseCategory = (key: string) => {
    const cat = user.categories.find((c) => c.key === key);
    form.setValue('category', key);
    if (cat) {
      form.setValue('emoji', cat.emoji);
      form.setValue('color', cat.color);
      form.setValue('reminders', user.settings.categoryReminders[key]?.join(', ') ?? '10, 0');
      form.setValue(
        'priority',
        ['WORK', 'COLLEGE'].includes(key)
          ? 'CRITICAL'
          : ['GYM', 'STUDY', 'SLEEP'].includes(key)
            ? 'HIGH'
            : 'NORMAL',
      );
    }
  };
  const submit = form.handleSubmit(async (v) => {
    setError('');
    const reminders = v.reminders.trim() ? v.reminders.split(',').map((s) => Number(s.trim())) : [];
    const value = { ...v, reminderMinutes: reminders, effectiveFrom: routine?.effectiveFrom };
    const parsed =
      kind === 'routine' ? routineSchema.safeParse(value) : eventSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os dados.');
      return;
    }
    if (kind === 'event' && conflicts === null) {
      const found = await action.run(
        () => api<Occurrence[]>('/events/conflicts', 'POST', parsed.data),
        '',
      );
      const relevant = found?.filter((c) => c.id !== occurrence?.id);
      if (relevant?.length) {
        setConflicts(relevant);
        return;
      }
      if (found === undefined) return;
    }
    const saved = await action.run(() =>
      api(
        kind === 'routine'
          ? `/routines${routine ? `/${routine.id}` : ''}`
          : `/events${occurrence?.eventId ? `/${occurrence.eventId}` : ''}`,
        routine || occurrence?.eventId ? 'PUT' : 'POST',
        parsed.data,
      ),
    );
    if (saved) onSaved();
  });
  return (
    <form onSubmit={submit} onChange={() => conflicts !== null && setConflicts(null)}>
      <Field label="Nome da atividade">
        <input
          placeholder="O que você vai fazer?"
          {...form.register('title', { required: true })}
        />
      </Field>
      {kind === 'event' && (
        <div className="quick-categories">
          {['VOLLEYBALL', 'GAMING', 'STUDY', 'GYM', 'WORK', 'COLLEGE', 'OTHER'].map((key) => {
            const cat = user.categories.find((c) => c.key === key);
            return (
              cat && (
                <button
                  type="button"
                  key={key}
                  className={category === key ? 'selected' : ''}
                  onClick={() => chooseCategory(key)}
                >
                  {cat.emoji} {cat.name}
                </button>
              )
            );
          })}
        </div>
      )}
      <div className="form-grid">
        <Field label="Categoria">
          <select
            {...form.register('category')}
            onChange={(e) => {
              const cat = user.categories.find((c) => c.key === e.target.value);
              form.setValue('category', e.target.value);
              if (cat) {
                form.setValue('emoji', cat.emoji);
                form.setValue('color', cat.color);
                form.setValue(
                  'reminders',
                  user.settings.categoryReminders[cat.key]?.join(', ') ?? '10, 0',
                );
              }
            }}
          >
            {user.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {kind === 'event' ? (
        <Field label="Data">
          <input type="date" {...form.register('date')} />
        </Field>
      ) : (
        <Field label="Dias da semana">
          <div className="day-picker">
            {weekdays.map((day, index) => (
              <button
                type="button"
                key={day}
                className={days.includes(index + 1) ? 'selected' : ''}
                onClick={() =>
                  form.setValue(
                    'weekdays',
                    days.includes(index + 1)
                      ? days.filter((d) => d !== index + 1)
                      : [...days, index + 1],
                  )
                }
              >
                {day}
              </button>
            ))}
          </div>
        </Field>
      )}
      <div className="form-grid">
        <Field label="Começa às">
          <input type="time" {...form.register('startTime')} />
        </Field>
        <Field label="Termina às" hint="Um fim anterior ao início termina no dia seguinte.">
          <input type="time" {...form.register('endTime')} />
        </Field>
      </div>
      <details className="advanced-options" open={kind === 'routine'}>
        <summary>Opções avançadas</summary>
        <Field label="Prioridade">
          <select {...form.register('priority')}>
            <option value="CRITICAL">Crítica · compromisso fixo</option>
            <option value="HIGH">Alta</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW">Baixa</option>
          </select>
        </Field>
        <div className="form-grid">
          <Field label="Emoji">
            <input maxLength={12} {...form.register('emoji')} />
          </Field>
          <Field label="Cor">
            <input type="color" {...form.register('color')} />
          </Field>
        </div>
        <Field
          label="Lembretes (minutos antes)"
          hint="Separe por vírgulas. 0 envia no início. Deixe vazio para nenhum."
        >
          <input placeholder="30, 10, 0" {...form.register('reminders')} />
        </Field>
        <Field label="Local">
          <input placeholder="Opcional" {...form.register('location')} />
        </Field>
        <Field label="Observações">
          <textarea rows={3} {...form.register('notes')} />
        </Field>
        {[...new Set(offsets)].map((offset) => (
          <Field
            key={offset}
            label={`Mensagem do lembrete ${offset === 0 ? 'na hora' : `${offset} min antes`}`}
            hint="Opcional. Use {userName} para incluir o nome da conta."
          >
            <input
              maxLength={200}
              value={reminderMessages[String(offset)]?.title ?? ''}
              onChange={(e) => {
                const updated = { ...reminderMessages };
                if (e.target.value.trim())
                  updated[String(offset)] = {
                    title: e.target.value,
                    body: updated[String(offset)]?.body ?? '',
                  };
                else delete updated[String(offset)];
                form.setValue('reminderMessages', updated);
              }}
              placeholder="Mensagem padrão da atividade"
            />
          </Field>
        ))}
        {kind === 'routine' && (
          <div className="form-grid">
            <label className="toggle">
              <input type="checkbox" {...form.register('flexible')} /> Horário flexível
            </label>
            <label className="toggle">
              <input type="checkbox" {...form.register('active')} /> Rotina ativa
            </label>
          </div>
        )}
      </details>
      {category === 'GAMING' && <p className="muted">Lazer também faz parte de uma boa rotina.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {conflicts && conflicts.length > 0 && (
        <div className="conflict">
          <strong>⚠️ Conflito encontrado</strong>
          {conflicts.map((c) => (
            <p key={c.id}>
              {c.title}, das {clock(c.startAt, zone)} às {clock(c.endAt, zone)}.
              <Button
                variant="ghost"
                type="button"
                loading={action.pending}
                onClick={() =>
                  void action
                    .run(
                      () => api(`/occurrences/${c.id}/completion`, 'POST', { status: 'SKIPPED' }),
                      'Compromisso pulado somente neste dia.',
                    )
                    .then((v) => {
                      if (v) setConflicts(conflicts.filter((i) => i.id !== c.id));
                    })
                }
              >
                Pular somente neste dia
              </Button>
            </p>
          ))}
          <small>Você pode alterar os horários acima ou manter os dois.</small>
        </div>
      )}
      <Button className="full" type="submit" loading={action.pending}>
        {conflicts?.length
          ? 'Manter os dois e salvar'
          : routine || occurrence
            ? 'Salvar alterações'
            : 'Adicionar ao meu dia'}
      </Button>
    </form>
  );
}
