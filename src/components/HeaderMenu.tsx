import { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown } from 'lucide-react';

export interface HeaderMenuItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Action interne. */
  onClick?: () => void;
  /** Lien externe — rendu en `<a>`. */
  href?: string;
  /** Marque l'élément comme actif (coche). */
  active?: boolean;
  /** Séparateur affiché avant cet élément. */
  separatorBefore?: boolean;
}

interface HeaderMenuProps {
  label: string;
  title?: string;
  icon: LucideIcon;
  items: HeaderMenuItem[];
  align?: 'left' | 'right';
}

export default function HeaderMenu({ label, title, icon: TriggerIcon, items, align = 'right' }: HeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        title={title ?? label}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
          open
            ? 'border-cyber-cyan/40 bg-cyber-cyan/10 text-cyber-cyan'
            : 'border-transparent text-cyber-text-dim hover:border-cyber-cyan/30 hover:bg-cyber-cyan/10 hover:text-cyber-cyan'
        }`}
      >
        <TriggerIcon size={12} />
        <span className="hidden xl:inline">{label}</span>
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-cyber-border bg-cyber-dark/95 shadow-xl backdrop-blur-sm animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => {
            const Icon = item.icon;
            const className = `flex w-full items-center gap-2.5 px-3 py-2 text-left text-[11px] transition-colors ${
              item.active
                ? 'bg-cyber-cyan/10 text-cyber-cyan'
                : 'text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text'
            }`;
            const content = (
              <>
                <Icon size={13} className="flex-shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.active && <Check size={12} className="flex-shrink-0" />}
              </>
            );
            return (
              <div key={item.id}>
                {item.separatorBefore && <div className="my-1 h-px bg-cyber-border" />}
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer" className={className} onClick={() => setOpen(false)}>
                    {content}
                  </a>
                ) : (
                  <button className={className} onClick={() => { setOpen(false); item.onClick?.(); }}>
                    {content}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
