import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DateTime } from 'luxon';
import { ArrowUpRight, Check, ChevronRight, Moon, Sparkles, Sun } from 'lucide-react';
import { api, useData } from './api';
import { useUser } from './context';
import { clock, dayLabel, duration, until, countdown } from './dates';
import type { Dashboard } from './models';
import { Button, Card, Empty, Loading, Modal, PageTitle, Progress, useAction } from './ui';
import { OccurrenceActions } from './Occurrence';
export function Home() {
  const user = useUser();
  const { data, isLoading, error } = useData<Dashboard>('/dashboard', true, 15000);
  const [planner, setPlanner] = useState(false);
  const action = useAction();
  const [, tick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);
  if (isLoading) return <Loading />;
  if (!data)
    return (
      <Empty title={error instanceof Error ? error.message : 'Não conseguimos carregar seu dia.'} />
    );
  const zone = data.settings.timezone;
  const hour = DateTime.now().setZone(zone).hour;
  const name = user.name.split(' ')[0];
  const now = Date.now();
  const activeItems = data.occurrences.filter((i) => i.status === 'SCHEDULED');
  const current =
    activeItems
      .filter((i) => +new Date(i.startAt) <= now && +new Date(i.endAt) > now)
      .sort(
        (a, b) =>
          ({ CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 })[a.priority] -
          { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[b.priority],
      )[0] ?? null;
  const next = activeItems.find((i) => +new Date(i.startAt) > now) ?? null;
  const currentFree = data.free.find(
    (s) => +new Date(s.startAt) <= now && +new Date(s.endAt) > now,
  );
  const freeEnd = currentFree?.endAt ?? next?.startAt;
  const possible = data.suggestions.filter(
    (s) =>
      +new Date(s.endAt) > now &&
      (!freeEnd || +new Date(s.endAt) - +new Date(s.startAt) <= +new Date(freeEnd) - now),
  );
  const completed = data.occurrences.filter((i) => i.status === 'COMPLETED').length;
  const remainingStudy = data.goals.filter(
    (g) => g.active && g.category === 'STUDY' && g.progress < g.target,
  );
  const sleepStart = DateTime.fromFormat(data.settings.sleepTime, 'HH:mm');
  let wake = DateTime.fromFormat(data.settings.wakeTime, 'HH:mm');
  if (wake <= sleepStart) wake = wake.plus({ days: 1 });
  const sleep = duration(wake.diff(sleepStart, 'minutes').minutes);
  return (
    <>
      <PageTitle
        eyebrow={dayLabel(data.date, zone)}
        title={`${hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'}, ${name}.`}
      >
        <span className="day-note live-clock">
          <Sun size={16} />
          <time>{DateTime.now().setZone(zone).toFormat('HH:mm:ss')}</time>
        </span>
      </PageTitle>
      <div className="home-grid">
        <div className="home-main">
          <section className={`now-card ${current ? 'occupied' : 'free'}`}>
            <div className="now-top">
              <span className="eyebrow">
                <span className="live-dot" /> AGORA
              </span>
              <span className="pill">{current ? 'NO SEU RITMO' : 'RESPIRE UM POUCO'}</span>
            </div>
            <div className="now-content">
              <div>
                <h2>{current ? current.title : '🟢 Livre agora'}</h2>
                <p>
                  {current
                    ? `${clock(current.startAt, zone)} — ${clock(current.endAt, zone)}`
                    : 'Espaço para fazer o que importa.'}
                </p>
              </div>
              <div className="now-emoji">{current?.emoji ?? '✦'}</div>
            </div>
            <div className="now-remaining">
              <span>
                {current
                  ? 'Termina em'
                  : next
                    ? 'Até o próximo compromisso'
                    : 'Seu dia está aberto'}
              </span>
              <strong>
                {current
                  ? countdown(current.endAt)
                  : next
                    ? duration(until(next.startAt))
                    : 'Aproveite seu ritmo'}
              </strong>
            </div>
            {current && (
              <Progress
                value={
                  ((Date.now() - +new Date(current.startAt)) /
                    (+new Date(current.endAt) - +new Date(current.startAt))) *
                  100
                }
              />
            )}
            {current &&
              ['GAMING', 'LEISURE'].includes(current.category) &&
              remainingStudy.length > 0 && (
                <p className="leisure-note">
                  Você ainda possui metas de estudo planejadas para hoje. Aproveite seu lazer e
                  escolha um horário para elas.
                </p>
              )}
            <div className="now-divider" />
            {current ? (
              <OccurrenceActions item={current} compact />
            ) : (
              <div className="free-suggestion">
                <Sparkles size={17} />
                <span>
                  {possible[0]
                    ? `Você consegue fazer ${duration((+new Date(possible[0].endAt) - +new Date(possible[0].startAt)) / 60000)} de ${possible[0].title.toLocaleLowerCase()} antes do próximo compromisso.`
                    : 'Uma pausa também é parte do plano.'}
                </span>
                <Button variant="ghost" onClick={() => setPlanner(true)}>
                  <ArrowUpRight size={18} />
                </Button>
              </div>
            )}
          </section>
          {next ? (
            <Link to={`/occurrences/${next.id}`} className="next-card">
              <span className="activity-icon" style={{ background: `${next.color}22` }}>
                {next.emoji}
              </span>
              <div>
                <p className="eyebrow">A SEGUIR</p>
                <strong>{next.title}</strong>
                <small>
                  {clock(next.startAt, zone)} — {clock(next.endAt, zone)}
                </small>
              </div>
              <div className="next-time">
                em {duration(until(next.startAt))}
                <ChevronRight size={18} />
              </div>
            </Link>
          ) : (
            <Card className="next-empty">
              <p className="muted">
                Nenhum compromisso a seguir. Seu dia está livre neste período.
              </p>
            </Card>
          )}
          <div className="section-heading">
            <h2>
              Seu dia, com clareza<span className="count">{data.occurrences.length}</span>
            </h2>
            <Link to="/calendar">
              Ver agenda <ArrowUpRight size={15} />
            </Link>
          </div>
          <Card className="timeline-card">
            {data.occurrences.length ? (
              <div className="timeline">
                {data.occurrences.map((item) => {
                  const active = current?.id === item.id;
                  const missed =
                    item.status === 'MISSED' ||
                    (item.status === 'SCHEDULED' && +new Date(item.endAt) < Date.now());
                  return (
                    <Link
                      key={item.id}
                      to={`/occurrences/${item.id}`}
                      className={`timeline-row ${active ? 'active' : ''} ${item.status === 'COMPLETED' ? 'done' : ''} ${item.status === 'SKIPPED' ? 'skipped' : ''}`}
                    >
                      <div className="timeline-time">
                        {clock(item.startAt, zone)}
                        <small>{clock(item.endAt, zone)}</small>
                      </div>
                      <div className="timeline-node">
                        {item.status === 'COMPLETED' ? <Check size={12} /> : <span />}
                      </div>
                      <span className="activity-icon" style={{ background: `${item.color}18` }}>
                        {item.emoji}
                      </span>
                      <div className="timeline-title">
                        <strong>{item.title}</strong>
                        <small>
                          {item.status === 'COMPLETED'
                            ? 'Concluído'
                            : item.status === 'SKIPPED'
                              ? 'Pulado hoje'
                              : active
                                ? 'Acontecendo agora'
                                : missed
                                  ? 'Não registrado'
                                  : item.flexible
                                    ? 'Flexível'
                                    : item.location || 'Planejado'}
                        </small>
                      </div>
                      {active ? (
                        <span className="active-tag">agora</span>
                      ) : (
                        <ChevronRight size={16} className="muted" />
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty title="Nenhum compromisso por aqui 🎉">
                <p>Crie uma rotina ou deixe o planejador encontrar espaço para suas metas.</p>
                <Link to="/routines" className="text-link">
                  Criar minha rotina →
                </Link>
              </Empty>
            )}
          </Card>
          <Card className="free-periods-card">
            <h3>Quando você tem tempo livre</h3>
            <div className="chips">
              {data.free
                .filter((s) => +new Date(s.endAt) > now)
                .map((s, i) => (
                  <span className="pill" key={i}>
                    {clock(s.startAt, zone)} — {clock(s.endAt, zone)}
                  </span>
                ))}
            </div>
            {!data.free.some((s) => +new Date(s.endAt) > now) && (
              <p className="muted">
                Seu dia está reservado. Ajuste os compromissos se precisar de uma pausa.
              </p>
            )}
          </Card>
        </div>
        <aside className="home-side">
          <Card className="goals-card">
            <div className="section-heading">
              <h3>Pequenos passos.</h3>
              <Link to="/goals">
                <ArrowUpRight size={18} />
              </Link>
            </div>
            <Link className="text-link" to="/learning">
              Meu aprendizado →
            </Link>
            <p className="muted">Grandes mudanças começam aqui.</p>
            {data.goals
              .filter((g) => g.active)
              .slice(0, 4)
              .map((g) => (
                <div className="mini-goal" key={g.id}>
                  <div>
                    <span>
                      {user.categories.find((c) => c.key === g.category)?.emoji} {g.name}
                    </span>
                    <small>
                      {g.unit === 'HOURS'
                        ? duration(g.progress * 60)
                        : Math.round(g.progress * 10) / 10}{' '}
                      / {g.target} {g.unit === 'TIMES' ? 'vezes' : g.unit === 'HOURS' ? 'h' : 'min'}
                    </small>
                  </div>
                  <Progress value={g.percentage} />
                </div>
              ))}
            {!data.goals.length && (
              <p className="muted">
                Você ainda não criou nenhuma meta. <Link to="/goals">Vamos começar?</Link>
              </p>
            )}
            {data.streaks.study > 0 && (
              <div className="streak">🔥 {data.streaks.study} dias estudando</div>
            )}
            {data.streaks.gym > 0 && (
              <div className="streak">🏋️ {data.streaks.gym} treinos nesta semana</div>
            )}
          </Card>
          <Card className="planner-card">
            <span className="planner-symbol">
              <Sparkles size={25} />
            </span>
            <h3>
              Encontre espaço
              <br />
              no seu dia.
            </h3>
            <p className="muted">
              Seu plano pode mudar.
              <br />
              Seu ritmo também.
            </p>
            <Button variant="secondary" onClick={() => setPlanner(true)}>
              Planejar meu dia
              <ArrowUpRight size={16} />
            </Button>
          </Card>
          <Card className="sleep-card">
            <Moon size={20} />
            <div>
              <h3>Uma boa noite começa hoje.</h3>
              <p>
                Se dormir às {data.settings.sleepTime} e acordar às {data.settings.wakeTime}, terá{' '}
                <strong>{sleep}</strong> de sono.
              </p>
            </div>
          </Card>
          <p className="day-progress">
            {completed} de {data.occurrences.length} atividades concluídas
            <br />
            <span>Um passo de cada vez.</span>
          </p>
        </aside>
      </div>
      {planner && (
        <Modal title="Um plano para hoje" onClose={() => setPlanner(false)}>
          <p className="muted">
            Respeitamos seus compromissos fixos e suas preferências. Você decide o que entra na
            agenda.
          </p>
          <h3>Períodos livres</h3>
          <div className="chips">
            {data.free.map((s, i) => (
              <span className="pill" key={i}>
                {clock(s.startAt, zone)} — {clock(s.endAt, zone)}
              </span>
            ))}
          </div>
          <h3>Sugestões para suas metas</h3>
          {data.suggestions.length ? (
            data.suggestions.map((s) => (
              <div className="suggestion" key={s.goalId}>
                <div>
                  <strong>
                    {user.categories.find((c) => c.key === s.category)?.emoji} {s.title}
                  </strong>
                  <small>
                    {clock(s.startAt, zone)} — {clock(s.endAt, zone)} · {s.reason}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  loading={action.pending}
                  onClick={() =>
                    void action.run(
                      () => api('/planner/apply', 'POST', { date: data.date, goalIds: [s.goalId] }),
                      'Sugestão adicionada ao seu dia.',
                    )
                  }
                >
                  Adicionar
                </Button>
              </div>
            ))
          ) : (
            <Empty title="Seu dia está no ritmo.">
              <p>
                Nenhuma sugestão disponível: suas metas estão cumpridas ou os horários estão
                ocupados.
              </p>
            </Empty>
          )}
          {data.suggestions.length > 1 && (
            <Button
              className="full"
              loading={action.pending}
              onClick={() =>
                void action
                  .run(() =>
                    api('/planner/apply', 'POST', {
                      date: data.date,
                      goalIds: data.suggestions.map((s) => s.goalId),
                    }),
                  )
                  .then((v) => {
                    if (v) setPlanner(false);
                  })
              }
            >
              Adicionar todas ao meu dia
            </Button>
          )}
        </Modal>
      )}
    </>
  );
}
