import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useNavigate,
  Link,
  Navigate,
} from 'react-router-dom';
import {
  CalendarDays,
  CircleUserRound,
  House,
  Plus,
  Target,
  Timer,
  WifiOff,
  Moon,
  Sun,
  BookOpen,
} from 'lucide-react';
import { api, useData } from './api';
import type { User } from './models';
import { UserContext } from './context';
import { ToastContext, Empty, Loading, Modal, Button } from './ui';
import { registerWorker } from './pwa';
const Auth = lazy(() => import('./Auth').then((m) => ({ default: m.Auth })));
const Onboarding = lazy(() => import('./Onboarding').then((m) => ({ default: m.Onboarding })));
const Home = lazy(() => import('./Home').then((m) => ({ default: m.Home })));
const Calendar = lazy(() => import('./Calendar').then((m) => ({ default: m.Calendar })));
const Routines = lazy(() => import('./Calendar').then((m) => ({ default: m.Routines })));
const Goals = lazy(() => import('./Goals').then((m) => ({ default: m.Goals })));
const Profile = lazy(() => import('./Profile').then((m) => ({ default: m.Profile })));
const Focus = lazy(() => import('./Focus').then((m) => ({ default: m.Focus })));
const Learning = lazy(() => import('./Learning').then((m) => ({ default: m.Learning })));
const OccurrencePage = lazy(() =>
  import('./Occurrence').then((m) => ({ default: m.OccurrencePage })),
);
const ActivityEditor = lazy(() =>
  import('./ActivityEditor').then((m) => ({ default: m.ActivityEditor })),
);
function NewEvent() {
  const navigate = useNavigate();
  return (
    <Modal title="Adicionar compromisso" onClose={() => navigate(-1)}>
      <ActivityEditor onSaved={() => navigate('/calendar')} />
    </Modal>
  );
}
function Shell({ user }: { user: User }) {
  const [offline, setOffline] = useState(!navigator.onLine);
  const [theme, setTheme] = useState(user.settings.theme);
  useEffect(() => {
    setTheme(user.settings.theme);
  }, [user.settings.theme]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ritmo:theme', theme);
  }, [theme]);
  useEffect(() => {
    const online = () => setOffline(false),
      off = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', off);
    };
  }, []);
  const items = [
    { to: '/today', label: 'Hoje', icon: House },
    { to: '/calendar', label: 'Calendário', icon: CalendarDays },
    { to: '/new', label: 'Adicionar', icon: Plus },
    { to: '/goals', label: 'Metas', icon: Target },
    { to: '/profile', label: 'Perfil', icon: CircleUserRound },
  ];
  return (
    <UserContext.Provider value={user}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link to="/" className="brand">
            <span className="brand-mark">r</span>ritmo<span className="brand-dot">.</span>
          </Link>
          <p className="sidebar-caption">MAIS VIDA NO SEU DIA</p>
          <nav>
            {items
              .filter((i) => i.to !== '/new')
              .map((i) => (
                <NavLink end={i.to === '/'} key={i.to} to={i.to}>
                  <i.icon size={20} />
                  {i.label}
                </NavLink>
              ))}
            <NavLink to="/routines">
              <CalendarDays size={20} />
              Minha semana
            </NavLink>
            <NavLink to="/focus">
              <Timer size={20} />
              Modo foco
            </NavLink>
            <NavLink to="/learning">
              <BookOpen size={20} />
              Meu aprendizado
            </NavLink>
          </nav>
          <Link to="/new" className="button primary add-desktop">
            <Plus size={18} />
            Adicionar compromisso
          </Link>
          <div className="sidebar-bottom">
            <p>
              Não precisa fazer tudo.
              <br />
              <strong>Só o próximo passo.</strong>
            </p>
            <button
              className="theme-switch"
              onClick={() => {
                const next = theme === 'dark' ? 'light' : 'dark';
                setTheme(next);
                if (navigator.onLine)
                  void api('/settings', 'PUT', { ...user.settings, theme: next }).catch(() => {});
              }}
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}{' '}
              {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            </button>
            <Link to="/profile" className="sidebar-user">
              <span className="avatar small">{user.name[0]}</span>
              <div>
                <strong>{user.name}</strong>
                <small>Seu espaço pessoal</small>
              </div>
            </Link>
          </div>
        </aside>
        <div className="app-content">
          <header className="mobile-top">
            <Link to="/" className="brand">
              <span className="brand-mark">r</span>ritmo.
            </Link>
            <Link to="/profile" className="avatar small">
              {user.name[0]}
            </Link>
          </header>
          {offline && (
            <div className="offline-banner" role="status">
              <WifiOff size={16} />
              Você está offline. Agenda salva neste dispositivo; conecte-se para fazer alterações.
            </div>
          )}
          <main className="content">
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="/today" element={<Home />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/routines" element={<Routines />} />
              <Route path="/new" element={<NewEvent />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/focus" element={<Focus />} />
              <Route path="/learning" element={<Learning />} />
              <Route path="/occurrences/:id" element={<OccurrencePage />} />
              <Route
                path="*"
                element={
                  <Empty title="Vamos voltar ao seu dia.">
                    <Link to="/">Ir para Hoje</Link>
                  </Empty>
                }
              />
            </Routes>
            <footer className="app-footer">
              feito para a vida real. <span>ritmo.</span>
            </footer>
          </main>
        </div>
        <nav className="bottom-nav" aria-label="Navegação principal">
          {items.map((i) => (
            <NavLink
              end={i.to === '/'}
              className={i.to === '/new' ? 'nav-add' : ''}
              key={i.to}
              to={i.to}
            >
              <i.icon size={21} />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </UserContext.Provider>
  );
}
function Account() {
  const { data: user, isLoading, error } = useData<User>('/auth/me');
  useEffect(() => {
    if (user) localStorage.setItem('ritmo:user', user.id);
  }, [user]);
  if (isLoading) return <Loading />;
  if (error && 'status' in error && error.status === 401) return <Auth />;
  if (!user) {
    if (error && 'status' in error && error.status !== 401)
      return (
        <Empty title={error.message}>
          <Button onClick={() => location.reload()}>Tentar novamente</Button>
        </Empty>
      );
    return <Auth />;
  }
  return !user.settings.onboardingDone ? (
    <UserContext.Provider value={user}>
      <Onboarding />
    </UserContext.Provider>
  ) : (
    <Shell user={user} />
  );
}
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Empty title="Não conseguimos abrir esta tela.">
        <Button onClick={() => location.reload()}>Tentar novamente</Button>
      </Empty>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  const [toast, setToast] = useState('');
  useEffect(() => {
    document.documentElement.dataset.theme = localStorage.getItem('ritmo:theme') ?? 'dark';
    void registerWorker().catch(() =>
      setToast('Não foi possível ativar o modo offline. Recarregue para tentar novamente.'),
    );
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(''), 5500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  return (
    <Boundary>
      <ToastContext.Provider value={setToast}>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Account />
          </Suspense>
        </BrowserRouter>
        {toast && (
          <div className="toast" role="status" onClick={() => setToast('')}>
            {toast}
          </div>
        )}
      </ToastContext.Provider>
    </Boundary>
  );
}
