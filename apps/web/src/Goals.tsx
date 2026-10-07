import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { goalSchema, type GoalInput } from '@ritmo/shared';
import { Pencil, Plus, Trash2, Target } from 'lucide-react';
import { api, useData } from './api';
import { useUser } from './context';
import type { Goal } from './models';
import { Button, Card, Empty, Field, Loading, Modal, PageTitle, Progress, useAction } from './ui';
function GoalEditor({ goal, onSaved }: { goal?: Goal; onSaved: () => void }) {
  const user = useUser();
  const action = useAction();
  const [error, setError] = useState('');
  const [topics, setTopics] = useState(goal?.topics.join(', ') ?? '');
  const form = useForm<GoalInput>({
    defaultValues: goal ?? {
      name: '',
      category: 'STUDY',
      target: 30,
      unit: 'MINUTES',
      period: 'DAILY',
      topic: '',
      active: true,
      priority: 'HIGH',
    },
  });
  return (
    <form
      onSubmit={form.handleSubmit(async (values) => {
        const parsed = goalSchema.safeParse({
          ...values,
          topics: topics
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Confira a meta.');
          return;
        }
        const result = await action.run(() =>
          api(`/goals${goal ? `/${goal.id}` : ''}`, goal ? 'PUT' : 'POST', parsed.data),
        );
        if (result) onSaved();
      })}
    >
      <Field label="Nome da meta">
        <input placeholder="Ex.: Estudar Java" {...form.register('name')} />
      </Field>
      <Field label="Categoria">
        <select {...form.register('category')}>
          {user.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label="Quantidade">
          <input
            type="number"
            min="0.1"
            step="0.1"
            {...form.register('target', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Unidade">
          <select {...form.register('unit')}>
            <option value="MINUTES">Minutos</option>
            <option value="HOURS">Horas</option>
            <option value="TIMES">Vezes</option>
          </select>
        </Field>
      </div>
      <Field label="Período">
        <select {...form.register('period')}>
          <option value="DAILY">Diariamente</option>
          <option value="WEEKLY">Semanalmente</option>
        </select>
      </Field>
      <Field
        label="Tópico (opcional)"
        hint="Conta apenas atividades cujo nome contenha este tópico."
      >
        <input placeholder="Ex.: Java, Node.js" {...form.register('topic')} />
      </Field>
      <Field label="Prioridade">
        <select {...form.register('priority')}>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Baixa</option>
        </select>
      </Field>
      <Field
        label="Tecnologias / tópicos associados"
        hint="Separe por vírgulas. Uma sessão de qualquer tópico conta para esta meta."
      >
        <input value={topics} onChange={(e) => setTopics(e.target.value)} />
      </Field>
      <Field label="Descrição">
        <textarea maxLength={2000} rows={3} {...form.register('description')} />
      </Field>
      <Field
        label="Ordem de estudo no planner"
        hint="Um número menor é considerado primeiro entre metas de mesma prioridade."
      >
        <input
          type="number"
          min={0}
          max={100}
          {...form.register('planningOrder', { valueAsNumber: true })}
          defaultValue={goal?.planningOrder ?? 0}
        />
      </Field>
      <label className="toggle">
        <input type="checkbox" {...form.register('active')} />
        Meta ativa
      </label>
      {error && <p className="error">{error}</p>}
      <Button type="submit" loading={action.pending} className="full">
        Salvar meta
      </Button>
    </form>
  );
}
export function Goals() {
  const user = useUser();
  const { data: goals, isLoading, error } = useData<Goal[]>('/goals');
  const { data: summary } = useData<{ completed: number; total: number; adherence: number }>(
    '/dashboard/summary',
  );
  const [editing, setEditing] = useState<Goal | null | undefined>(undefined);
  const action = useAction();
  return (
    <>
      <PageTitle eyebrow="CONSTÂNCIA, SEM PRESSA" title="O que importa para você.">
        <Button onClick={() => setEditing(null)}>
          <Plus size={16} />
          Nova meta
        </Button>
      </PageTitle>
      {summary && (
        <Card className="summary-card">
          <Target size={28} />
          <div>
            <p className="eyebrow">MINHA SEMANA</p>
            <h2>{summary.adherence}% da rotina cumprida.</h2>
            <p className="muted">{summary.completed} atividades concluídas. Cada passo conta.</p>
          </div>
        </Card>
      )}
      {isLoading ? (
        <Loading />
      ) : error ? (
        <Empty title={error.message} />
      ) : goals?.length ? (
        <div className="goal-grid">
          {goals.map((g) => {
            const cat = user.categories.find((c) => c.key === g.category);
            return (
              <Card key={g.id}>
                <div className="goal-heading">
                  <span
                    className="activity-icon"
                    style={{ background: `${cat?.color ?? '#a3e635'}22` }}
                  >
                    {cat?.emoji ?? '🎯'}
                  </span>
                  <div className="grow">
                    <h3>{g.name}</h3>
                    <small>
                      {g.period === 'DAILY' ? 'Todos os dias' : 'Nesta semana'} ·{' '}
                      {g.active ? 'Ativa' : 'Pausada'}
                    </small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Editar ${g.name}`}
                    onClick={() => setEditing(g)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <p className="goal-number">
                  {Math.round(g.progress * 10) / 10}
                  <small>
                    {' '}
                    / {g.target} {g.unit === 'TIMES' ? 'vezes' : g.unit === 'HOURS' ? 'h' : 'min'}
                  </small>
                </p>
                <Progress value={g.percentage} color={cat?.color} />
                <div className="goal-footer">
                  <span>
                    {g.percentage >= 100
                      ? 'Meta alcançada. Celebre esse passo!'
                      : `${g.percentage}% · No seu tempo, no seu ritmo.`}
                  </span>
                  <button
                    className="icon-button"
                    aria-label={`Excluir ${g.name}`}
                    disabled={action.pending}
                    onClick={() =>
                      void action.run(() => api(`/goals/${g.id}`, 'DELETE'), 'Meta removida.')
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty title="Você ainda não criou nenhuma meta.">
            <p>Escolha algo que merece um espaço no seu dia.</p>
            <Button onClick={() => setEditing(null)}>Criar minha primeira meta</Button>
          </Empty>
        </Card>
      )}
      {editing !== undefined && (
        <Modal
          title={editing ? 'Editar meta' : 'Uma nova intenção'}
          onClose={() => setEditing(undefined)}
        >
          <GoalEditor goal={editing ?? undefined} onSaved={() => setEditing(undefined)} />
        </Modal>
      )}
    </>
  );
}
