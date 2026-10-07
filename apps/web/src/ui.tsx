import {
  createContext,
  Children,
  cloneElement,
  isValidElement,
  useId,
  useEffect,
  useRef,
  useContext,
  useState,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { X, LoaderCircle, ArrowUpRight } from 'lucide-react';
import { queryClient } from './api';
export const ToastContext = createContext<(message: string) => void>(() => {});
export function useAction() {
  const notify = useContext(ToastContext);
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async <T,>(
      task: () => Promise<T>,
      message = 'Salvo. Seu dia está atualizado.',
    ): Promise<T | undefined> => {
      setPending(true);
      try {
        const value = await task();
        await queryClient.invalidateQueries();
        if (message) notify(message);
        return value;
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Não conseguimos salvar. Tente novamente.');
        return undefined;
      } finally {
        setPending(false);
      }
    },
  };
}
export function Button({
  children,
  className = '',
  variant = 'primary',
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading && <LoaderCircle size={16} className="spin" />}
      {children}
    </button>
  );
}
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const controls = Children.map(children, (child) =>
    isValidElement<{ id?: string; 'aria-describedby'?: string }>(child) &&
    typeof child.type === 'string' &&
    ['input', 'select', 'textarea'].includes(child.type)
      ? cloneElement(child, { id, 'aria-describedby': hint ? `${id}-hint` : undefined })
      : child,
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {controls}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
    </div>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} />;
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = panel.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
      );
      if (!controls?.length) return;
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={panel}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Fechar" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">✦</span>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" />
      <span>Encontrando seu ritmo…</span>
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}
export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuenow={Math.min(100, Math.max(0, value))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
    </div>
  );
}
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
