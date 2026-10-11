import { useId } from 'react';

/**
 * Logo « atome » de Zhétikal — traitement **néon**.
 *
 * Dessiné en SVG avec `currentColor` plutôt qu'importé en image : il reste net
 * à toutes les tailles et suit automatiquement la couleur du thème (le fichier
 * d'origine était blanc sur fond sombre, ce qui serait illisible en thème clair).
 *
 * La lueur est obtenue par un **second passage de trait large et translucide**
 * plutôt que par un flou CSS (`drop-shadow`) : le flou épaississait les ellipses
 * au point qu'on ne lisait plus l'atome. Ici les traits fins restent nets et le
 * halo les épouse exactement.
 */

const ORBITS = ['rotate(0 12 12)', 'rotate(60 12 12)', 'rotate(120 12 12)'];

function Orbits({ strokeWidth, opacity }: { strokeWidth: number; opacity?: number }) {
  return (
    <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity={opacity}>
      {ORBITS.map((transform) => (
        <ellipse key={transform} cx="12" cy="12" rx="9.6" ry="3.85" transform={transform} />
      ))}
    </g>
  );
}

export default function AtomLogo({
  size = 16,
  className = '',
  glow = true,
}: {
  size?: number;
  className?: string;
  /** Halo néon + noyau clair. Désactivé en thème clair, où une lueur n'a pas de sens. */
  glow?: boolean;
}) {
  // Le dégradé radial doit porter un identifiant unique si le logo est rendu
  // plusieurs fois dans la page (l'`id` de `useId` contient des « : »).
  const haloId = `atom-halo-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="Zhétikal"
      className={className}
    >
      <defs>
        <radialGradient id={haloId}>
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.8" />
          <stop offset="45%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Halo : trait large et translucide sous les traits fins */}
      {glow && <Orbits strokeWidth={3.1} opacity={0.32} />}

      {/* Traits fins — l'atome doit rester lisible */}
      <Orbits strokeWidth={1.4} />

      {/* Noyau : lueur centrée, puis cœur clair */}
      {glow && <circle cx="12" cy="12" r="3.4" fill={`url(#${haloId})`} />}
      <circle cx="12" cy="12" r="1.8" fill={glow ? '#ffffff' : 'currentColor'} />
    </svg>
  );
}
