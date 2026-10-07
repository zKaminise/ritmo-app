import type { SettingsInput } from '@ritmo/shared';
import { Field } from './ui';
export function SettingsFields({
  value,
  onChange,
  section = 'all',
}: {
  value: SettingsInput;
  onChange: (v: SettingsInput) => void;
  section?: 'sleep' | 'gym' | 'study' | 'all';
}) {
  function set<K extends keyof SettingsInput>(key: K, next: SettingsInput[K]) {
    onChange({ ...value, [key]: next });
  }
  const number = (
    key:
      | 'sleepHours'
      | 'windDownMinutes'
      | 'gymTimes'
      | 'gymDuration'
      | 'gymBuffer'
      | 'studyMinutes'
      | 'studyIdealMinutes',
    label: string,
    min: number,
    max: number,
  ) => (
    <Field label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={key === 'sleepHours' ? 0.5 : 1}
        value={value[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </Field>
  );
  const time = (key: 'wakeTime' | 'sleepTime' | 'gymMinTime' | 'gymMaxTime', label: string) => (
    <Field label={label}>
      <input type="time" value={value[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );
  return (
    <>
      {(section === 'all' || section === 'sleep') && (
        <>
          <h3>Seu dia e seu sono</h3>
          <Field label="Timezone" hint="Ex.: America/Sao_Paulo, Europe/Lisbon">
            <input
              value={value.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              list="timezones"
            />
            <datalist id="timezones">
              {[
                'America/Sao_Paulo',
                'America/Manaus',
                'America/Fortaleza',
                'Europe/Lisbon',
                'Europe/London',
                'America/New_York',
                'Asia/Tokyo',
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </datalist>
          </Field>
          <div className="form-grid">
            {time('wakeTime', 'Qual horário começa seu dia?')}
            {time('sleepTime', 'Qual horário prefere dormir?')}
            {number('sleepHours', 'Quantas horas quer dormir?', 3, 14)}
            {number('windDownMinutes', 'Preparação para dormir (min)', 0, 180)}
          </div>
          <p className="muted">
            A meta de horas é uma referência. Os horários de dormir e acordar definem sua janela de
            sono.
          </p>
        </>
      )}
      {(section === 'all' || section === 'gym') && (
        <>
          <h3>Espaço para treinar</h3>
          <div className="form-grid">
            {number('gymTimes', 'Treinos por semana', 1, 7)}
            {number('gymDuration', 'Duração do treino (min)', 10, 240)}
            {time('gymMinTime', 'Horário mínimo')}
            {time('gymMaxTime', 'Horário máximo')}
            {number('gymBuffer', 'Preparação / deslocamento (min)', 0, 120)}
            <Field label="Período preferido">
              <select
                value={value.gymPeriod}
                onChange={(e) => set('gymPeriod', e.target.value as SettingsInput['gymPeriod'])}
              >
                <option value="MORNING">Manhã</option>
                <option value="AFTERNOON">Tarde</option>
                <option value="EVENING">Noite</option>
              </select>
            </Field>
          </div>
        </>
      )}
      {(section === 'all' || section === 'study') && (
        <>
          <h3>Um pouco de estudo, todo dia</h3>
          <div className="form-grid">
            {number('studyMinutes', 'Estudo mínimo diário (min)', 0, 600)}
            {number('studyIdealMinutes', 'Estudo ideal diário (min)', 1, 600)}
            <Field label="Período preferido">
              <select
                value={value.studyPeriod}
                onChange={(e) => set('studyPeriod', e.target.value as SettingsInput['studyPeriod'])}
              >
                <option value="MORNING">Manhã</option>
                <option value="AFTERNOON">Tarde</option>
                <option value="EVENING">Noite</option>
              </select>
            </Field>
          </div>
        </>
      )}
    </>
  );
}
