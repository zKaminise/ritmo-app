import { useState } from 'react';
import { onboardingSchema, type SettingsInput } from '@ritmo/shared';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useUser } from './context';
import { api } from './api';
import { weekdays } from './dates';
import { Button, Card, Field, Progress, useAction } from './ui';
import { SettingsFields } from './SettingsFields';
export function Onboarding() {
  const user = useUser();
  const action = useAction();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<SettingsInput>(user.settings);
  const [workDays, setWorkDays] = useState([1, 2, 3, 4, 5]);
  const [workStart, setWorkStart] = useState('09:00');
  const [workEnd, setWorkEnd] = useState('18:00');
  const [college, setCollege] = useState(false);
  const [collegeDays, setCollegeDays] = useState([1, 3, 5]);
  const [collegeStart, setCollegeStart] = useState('19:00');
  const [collegeEnd, setCollegeEnd] = useState('20:30');
  const [gym, setGym] = useState(true);
  const [study, setStudy] = useState(true);
  const [error, setError] = useState('');
  const days = (values: number[], change: (v: number[]) => void) => (
    <div className="day-picker">
      {weekdays.map((d, i) => (
        <button
          type="button"
          key={d}
          className={values.includes(i + 1) ? 'selected' : ''}
          onClick={() =>
            change(values.includes(i + 1) ? values.filter((v) => v !== i + 1) : [...values, i + 1])
          }
        >
          {d}
        </button>
      ))}
    </div>
  );
  const finish = async () => {
    const result = onboardingSchema.safeParse({
      settings: p,
      workDays,
      workStart,
      workEnd,
      college,
      collegeDays,
      collegeStart,
      collegeEnd,
      gym,
      study,
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Confira os campos.');
      return;
    }
    await action.run(
      () => api('/settings/onboarding', 'POST', result.data),
      'Sua rotina está pronta. Vamos encontrar seu ritmo.',
    );
  };
  return (
    <main className="onboarding">
      <div className="brand">
        <span className="brand-mark">r</span>ritmo.
      </div>
      <Card>
        <span className="pill">
          <Sparkles size={14} /> COMEÇAR COM LEVEZA
        </span>
        <h1>
          {
            [
              'Seu dia começa com você.',
              'Uma base para sua semana.',
              'Espaço para o que importa.',
              'Seu ritmo está quase pronto.',
            ][step]
          }
        </h1>
        <p className="muted">Etapa {step + 1} de 4 · Tudo pode ser alterado depois.</p>
        <Progress value={((step + 1) / 4) * 100} />
        {step === 0 && <SettingsFields value={p} onChange={setP} section="sleep" />}
        {step === 1 && (
          <>
            <h3>Trabalho</h3>
            <Field
              label="Quais dias você trabalha?"
              hint="Nenhum dia selecionado significa sem trabalho fixo."
            >
              {days(workDays, setWorkDays)}
            </Field>
            <div className="form-grid">
              <Field label="Início">
                <input
                  type="time"
                  value={workStart}
                  onChange={(e) => setWorkStart(e.target.value)}
                />
              </Field>
              <Field label="Fim">
                <input type="time" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
              </Field>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={college}
                onChange={(e) => setCollege(e.target.checked)}
              />
              Tenho faculdade ou escola
            </label>
            {college && (
              <>
                <Field label="Dias de aula">{days(collegeDays, setCollegeDays)}</Field>
                <div className="form-grid">
                  <Field label="Início">
                    <input
                      type="time"
                      value={collegeStart}
                      onChange={(e) => setCollegeStart(e.target.value)}
                    />
                  </Field>
                  <Field label="Fim">
                    <input
                      type="time"
                      value={collegeEnd}
                      onChange={(e) => setCollegeEnd(e.target.value)}
                    />
                  </Field>
                </div>
                <small className="muted">
                  Se cada dia tem horários diferentes, ajuste as rotinas na sua semana depois.
                </small>
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <label className="toggle">
              <input type="checkbox" checked={gym} onChange={(e) => setGym(e.target.checked)} />
              Quero encaixar academia
            </label>
            {gym && <SettingsFields value={p} onChange={setP} section="gym" />}
            <label className="toggle">
              <input type="checkbox" checked={study} onChange={(e) => setStudy(e.target.checked)} />
              Quero reservar tempo para estudo
            </label>
            {study && <SettingsFields value={p} onChange={setP} section="study" />}
          </>
        )}
        {step === 3 && (
          <>
            <div className="onboarding-summary">
              <p>
                🌙 Sono às <strong>{p.sleepTime}</strong> · ☀️ Seu dia às{' '}
                <strong>{p.wakeTime}</strong>
              </p>
              <p>
                💻 {workDays.length} dias de trabalho {college ? '· 🎓 com estudos formais' : ''}
              </p>
              {gym && <p>🏋️ Meta de {p.gymTimes} treinos por semana</p>}
              {study && <p>📚 {p.studyMinutes} minutos de estudo por dia</p>}
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={p.notificationsDesired}
                onChange={(e) => setP({ ...p, notificationsDesired: e.target.checked })}
              />
              Quero receber lembretes
            </label>
            <p className="muted">
              Você poderá ativar a permissão em Perfil → Notificações, quando estiver pronto.
            </p>
            <label className="toggle">
              <input
                type="checkbox"
                checked={p.autoPlan}
                onChange={(e) => setP({ ...p, autoPlan: e.target.checked })}
              />
              Planejamento automático
            </label>
            <p className="muted">
              Quando habilitado, o planejador poderá adicionar sugestões às janelas livres do seu
              dia. Os compromissos fixos são preservados.
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="onboarding-nav">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} />
              Voltar
            </Button>
          )}
          <Button
            loading={action.pending}
            onClick={() => (step < 3 ? setStep(step + 1) : void finish())}
          >
            {step < 3 ? 'Continuar' : 'Começar meu dia'}
            <ArrowRight size={16} />
          </Button>
        </div>
      </Card>
    </main>
  );
}
