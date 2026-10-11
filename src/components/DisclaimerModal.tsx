import { ShieldAlert } from 'lucide-react';

interface DisclaimerModalProps {
  onAccept: () => void;
}

export default function DisclaimerModal({ onAccept }: DisclaimerModalProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl border border-cyber-border bg-cyber-dark shadow-2xl"
        style={{ boxShadow: '0 0 60px rgb(var(--cyber-cyan-dim-rgb) / 0.08), 0 25px 50px rgba(0,0,0,0.7)' }}
      >
        {/* Top accent line */}
        <div className="h-0.5 w-full rounded-t-2xl bg-gradient-to-r from-transparent via-cyber-cyan/60 to-transparent" />

        <div className="px-8 py-8">
          {/* Icon + title */}
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center">
              <ShieldAlert size={26} className="text-cyber-cyan" />
            </div>
            <div className="text-center">
              <h2 className="text-base font-bold text-cyber-text tracking-wide">
                Clause de non-responsabilité
              </h2>
              <p className="text-[11px] font-mono text-cyber-cyan/70 uppercase tracking-widest mt-0.5">
                Ghostint / CyberZ7 — OSINT Tracker
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-cyber-border mb-6" />

          {/* Disclaimer text */}
          <div className="rounded-xl border border-cyber-border bg-cyber-panel/50 px-5 py-4 mb-6">
            <p className="text-[13px] leading-relaxed text-cyber-text-dim text-center">
              Cet outil est destiné exclusivement à un{' '}
              <span className="text-cyber-text font-semibold">usage éducatif</span> et à des enquêtes{' '}
              <span className="text-cyber-text font-semibold">OSINT éthiques</span>.
            </p>
            <div className="h-px bg-cyber-border/50 my-3" />
            <p className="text-[13px] leading-relaxed text-cyber-text-dim text-center">
              L'utilisateur est <span className="text-cyber-text font-semibold">seul responsable</span> de
              l'usage qu'il fait des données collectées. Ghostint / CyberZ7 décline toute responsabilité
              en cas d'<span className="text-cyber-red font-semibold">usage illégal</span>.
            </p>
          </div>

          {/* Accept button */}
          <button
            onClick={onAccept}
            className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide transition-all duration-200
              bg-cyber-cyan/15 border border-cyber-cyan/40 text-cyber-cyan
              hover:bg-cyber-cyan/25 hover:border-cyber-cyan/70
              active:scale-[0.98]"
            style={{ boxShadow: '0 0 20px rgb(var(--cyber-cyan-dim-rgb) / 0.15)' }}
          >
            J'accepte les conditions d'utilisation
          </button>

          <p className="mt-3 text-center text-[10px] text-cyber-text-dim/50 font-mono">
            Ce choix sera mémorisé pour cette session
          </p>
        </div>
      </div>
    </div>
  );
}
