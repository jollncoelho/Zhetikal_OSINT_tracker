import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

/** Trois pastilles représentatives : fond, surface, accent. */
function ThemeSwatch({ tokens }: { tokens: { black: string; panel: string; cyan: string } }) {
  return (
    <span
      className="flex h-5 w-9 flex-shrink-0 items-center justify-center gap-0.5 rounded border border-cyber-border"
      style={{ background: tokens.black }}
    >
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: tokens.panel, border: `1px solid ${tokens.cyan}` }} />
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: tokens.cyan }} />
    </span>
  );
}

export default function ThemeSwitcher() {
  const { themeId, theme, themes, setTheme } = useTheme();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('theme.title')}
        className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[11px] font-semibold text-cyber-text-dim transition-all hover:border-cyber-cyan/30 hover:bg-cyber-cyan/10 hover:text-cyber-cyan"
      >
        <Palette size={12} />
        <span className="hidden 2xl:inline">{t(theme.labelKey)}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-cyber-border bg-cyber-dark/95 shadow-xl backdrop-blur-sm animate-fade-in">
          <div className="border-b border-cyber-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-cyber-text-dim">
            {t('theme.title')}
          </div>
          {themes.map((candidate) => {
            const active = candidate.id === themeId;
            return (
              <button
                key={candidate.id}
                onClick={() => { setTheme(candidate.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  active
                    ? 'bg-cyber-cyan/10 text-cyber-cyan'
                    : 'text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text'
                }`}
              >
                <ThemeSwatch tokens={candidate.tokens} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium">{t(candidate.labelKey)}</span>
                  <span className="block truncate text-[10px] text-cyber-text-dim">{t(candidate.hintKey)}</span>
                </span>
                {active && <Check size={12} className="flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
