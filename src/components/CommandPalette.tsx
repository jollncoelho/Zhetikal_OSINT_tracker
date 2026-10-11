import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CornerDownLeft, Search } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export interface PaletteCommand {
  id: string;
  /** Libellé déjà traduit. */
  label: string;
  /** Précision affichée à droite (raccourci, valeur courante…). */
  hint?: string;
  /** Groupe déjà traduit — sert aussi à l'affichage. */
  group: string;
  icon: LucideIcon;
  /** Termes supplémentaires pour la recherche. */
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}

/** Minuscules sans accents, pour une recherche tolérante. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return commands;
    return commands.filter((command) => {
      const haystack = normalize(
        [command.label, command.hint ?? '', command.group, command.keywords ?? ''].join(' '),
      );
      return needle.split(/\s+/).every((part) => haystack.includes(part));
    });
  }, [commands, query]);

  // Regroupement en conservant l'ordre d'apparition.
  const groups = useMemo(() => {
    const map = new Map<string, { command: PaletteCommand; index: number }[]>();
    filtered.forEach((command, index) => {
      const bucket = map.get(command.group) ?? [];
      bucket.push({ command, index });
      map.set(command.group, bucket);
    });
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(0);
  }, [filtered.length, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const target = filtered[activeIndex];
        if (target) {
          onClose();
          target.run();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, activeIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[68vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-cyber-border bg-cyber-dark shadow-2xl">
        <div className="flex items-center gap-3 border-b border-cyber-border px-4 py-3">
          <Search size={15} className="flex-shrink-0 text-cyber-text-dim" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('palette.placeholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-cyber-text outline-none placeholder:text-cyber-text-dim/60"
          />
          <kbd className="flex-shrink-0 rounded border border-cyber-border bg-cyber-panel px-1.5 py-0.5 text-[10px] font-mono text-cyber-text-dim">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-cyber-text-dim">{t('palette.empty')}</p>
          ) : (
            groups.map(([group, entries]) => (
              <div key={group} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-cyber-text-dim">
                  {group}
                </p>
                {entries.map(({ command, index }) => {
                  const Icon = command.icon;
                  const active = index === activeIndex;
                  return (
                    <button
                      key={command.id}
                      data-index={index}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => { onClose(); command.run(); }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                        active ? 'bg-cyber-cyan/15 text-cyber-cyan' : 'text-cyber-text hover:bg-cyber-panel'
                      }`}
                    >
                      <Icon size={14} className={active ? 'text-cyber-cyan' : 'text-cyber-text-dim'} />
                      <span className="min-w-0 flex-1 truncate text-xs">{command.label}</span>
                      {command.hint && (
                        <span className="flex-shrink-0 font-mono text-[10px] text-cyber-text-dim">
                          {command.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-cyber-border px-4 py-2 text-[10px] text-cyber-text-dim">
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-cyber-border bg-cyber-panel px-1 py-0.5 font-mono">↑↓</kbd>
              {t('palette.hintNavigate')}
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={10} />
              {t('palette.hintSelect')}
            </span>
          </span>
          <span className="font-mono">{filtered.length}</span>
        </div>
      </div>
    </div>
  );
}
