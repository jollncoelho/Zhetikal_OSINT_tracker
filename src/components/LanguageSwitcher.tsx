import { useState, useRef, useEffect } from 'react';
import { Globe, Check } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { LANGUAGES, type Language } from '../i18n/translations';

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = LANGUAGES.find(l => l.id === lang) ?? LANGUAGES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-cyber-text-dim hover:text-cyber-cyan hover:bg-cyber-cyan/10 border border-transparent hover:border-cyber-cyan/30 transition-all"
        title="Changer la langue"
      >
        <Globe size={12} />
        <span className="font-mono">{current.flag}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-cyber-border bg-cyber-dark/95 backdrop-blur-sm shadow-xl z-50 animate-fade-in overflow-hidden">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              onClick={() => { setLang(l.id as Language); setOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-medium transition-colors ${
                lang === l.id
                  ? 'bg-cyber-cyan/10 text-cyber-cyan'
                  : 'text-cyber-text-dim hover:bg-cyber-panel hover:text-cyber-text'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] px-1 py-0.5 rounded bg-cyber-panel border border-cyber-border">{l.flag}</span>
                {l.label}
              </span>
              {lang === l.id && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
