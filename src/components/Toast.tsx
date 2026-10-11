import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

/**
 * Notifications éphémères (toasts).
 *
 * Remplace les `alert()` et les messages en ligne : le rendu passe par un
 * portail dans `document.body` pour échapper aux contextes d'empilement
 * (`backdrop-blur` crée un contenant de bloc pour les descendants `fixed`).
 *
 * Le conteneur est calé en bas à droite, au-dessus de la barre d'analyse IA.
 */

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Durée d'affichage en ms. `0` = persistante (fermeture manuelle). */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
  closing?: boolean;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4000;
const ERROR_DURATION = 6500;
const MAX_VISIBLE = 4;
const EXIT_MS = 180;

const VARIANT_STYLE: Record<
  ToastVariant,
  { icon: typeof Info; accent: string; ring: string; glow: string; bar: string }
> = {
  success: {
    icon: CheckCircle2,
    accent: 'text-cyber-green',
    ring: 'border-cyber-green/45',
    glow: 'shadow-[0_8px_28px_-8px_rgb(var(--cyber-green-rgb)/0.55)]',
    bar: 'bg-cyber-green',
  },
  error: {
    icon: XCircle,
    accent: 'text-cyber-red',
    ring: 'border-cyber-red/45',
    glow: 'shadow-[0_8px_28px_-8px_rgb(var(--cyber-red-rgb)/0.55)]',
    bar: 'bg-cyber-red',
  },
  warning: {
    icon: AlertTriangle,
    accent: 'text-cyber-orange',
    ring: 'border-cyber-orange/45',
    glow: 'shadow-[0_8px_28px_-8px_rgb(var(--cyber-orange-rgb)/0.55)]',
    bar: 'bg-cyber-orange',
  },
  info: {
    icon: Info,
    accent: 'text-cyber-cyan',
    ring: 'border-cyber-cyan/45',
    glow: 'shadow-[0_8px_28px_-8px_rgb(var(--cyber-cyan-rgb)/0.55)]',
    bar: 'bg-cyber-cyan',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) {
      window.clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((list) => list.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((list) =>
        list.map((item) => (item.id === id ? { ...item, closing: true } : item)),
      );
      const handle = window.setTimeout(() => remove(id), EXIT_MS);
      timers.current.set(id, handle);
    },
    [clearTimer, remove],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      const variant = options.variant ?? 'info';
      const record: ToastRecord = { ...options, variant, id };
      setToasts((list) => {
        const next = [...list, record];
        return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next;
      });

      const duration =
        options.duration ?? (variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION);
      if (duration > 0) {
        const handle = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, handle);
      }
      return id;
    },
    [dismiss],
  );

  const helpers = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ title, description, variant: 'success' }),
      error: (title, description) => toast({ title, description, variant: 'error' }),
      warning: (title, description) => toast({ title, description, variant: 'warning' }),
      info: (title, description) => toast({ title, description, variant: 'info' }),
    }),
    [toast, dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((handle) => window.clearTimeout(handle));
      map.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={helpers}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useLanguage();

  if (typeof document === 'undefined' || toasts.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed right-4 bottom-[112px] z-[10090] flex w-[min(92vw,380px)] flex-col gap-2"
      role="region"
      aria-live="polite"
      aria-label={t('toast.dismiss')}
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} toast={item} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
}) {
  const { t } = useLanguage();
  const variant = toast.variant ?? 'info';
  const { icon: Icon, accent, ring, glow, bar } = VARIANT_STYLE[variant];
  const duration =
    toast.duration ?? (variant === 'error' ? ERROR_DURATION : DEFAULT_DURATION);

  return (
    <div
      className={`pointer-events-auto overflow-hidden rounded-xl border bg-cyber-dark/95 backdrop-blur-sm ${ring} ${glow} ${
        toast.closing ? 'animate-toast-out' : 'animate-toast-in'
      }`}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Icon size={15} className={`mt-0.5 shrink-0 ${accent}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-5 text-cyber-text">{toast.title}</p>
          {toast.description && (
            <p className="mt-0.5 text-[11px] leading-4 text-cyber-text-dim">
              {toast.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label={t('toast.dismiss')}
          className="-mr-0.5 -mt-0.5 shrink-0 rounded p-1 text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
        >
          <X size={12} />
        </button>
      </div>
      {duration > 0 && (
        <div className="h-[2px] w-full bg-cyber-border/40">
          <div
            className={`toast-progress h-full ${bar}`}
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
