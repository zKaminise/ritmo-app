import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studyTechnologies } from '@ritmo/shared';
import { Play } from 'lucide-react';
import { api, useData } from './api';
import type { Goal } from './models';
import { Button, Field, useAction } from './ui';
export function StudyStart({
  presetGoal,
  onStarted,
}: {
  presetGoal?: Goal;
  onStarted?: () => void;
}) {
  const { data: goals } = useData<Goal[]>('/goals');
  const action = useAction();
  const navigate = useNavigate();
  const [technology, setTechnology] = useState(
    presetGoal?.topics.includes('Java') ? 'Java' : 'Node.js',
  );
  const [custom, setCustom] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [goalId, setGoalId] = useState(presetGoal?.id ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void action
          .run(
            () =>
              api('/focus-sessions', 'POST', {
                title: `Estudar ${technology === 'Outro' ? custom : technology}`,
                technology: technology === 'Outro' ? custom : technology,
                category: 'STUDY',
                plannedMinutes: minutes,
                ...(goalId ? { goalId } : {}),
              }),
            '',
          )
          .then((value) => {
            if (value) {
              onStarted?.();
              navigate('/focus');
            }
          });
      }}
    >
      <Field label="O que vamos estudar?">
        <select value={technology} onChange={(e) => setTechnology(e.target.value)}>
          {studyTechnologies.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      {technology === 'Outro' && (
        <Field label="Tema de estudo">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            required
            maxLength={80}
          />
        </Field>
      )}
      <Field label="Meta correspondente">
        <select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">Identificar pela tecnologia</option>
          {goals
            ?.filter((g) => g.category === 'STUDY' && g.active)
            .map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Duração">
        <div className="duration-picker">
          {[30, 45, 60].map((n) => (
            <button
              type="button"
              className={minutes === n ? 'selected' : ''}
              key={n}
              onClick={() => setMinutes(n)}
            >
              {n} min
            </button>
          ))}
        </div>
      </Field>
      <Field label="Minutos personalizados">
        <input
          type="number"
          min={1}
          max={720}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </Field>
      <Button type="submit" loading={action.pending} className="full">
        <Play size={16} />
        Começar estudo
      </Button>
    </form>
  );
}
