/* ------------------------------------------------------------------ *
 * Balayage de profils publics — « Sherlock-lite » côté navigateur.
 *
 * OsintHunter interroge 400+ sites depuis un backend Python : le serveur n'a
 * ni CORS ni limite de requêtes. Ici tout passe par le lecteur public
 * r.jina.ai, déjà utilisé pour Telegram. On ne peut donc pas viser 400 sites :
 * au-delà d'une vingtaine, le quota anonyme (20/min) et la lenteur rendent
 * l'attente insupportable.
 *
 * Règle d'or : un site n'est déclaré « trouvé » que si sa page affiche un
 * marqueur positif explicite, **et** aucun marqueur d'absence. Une page
 * générique (« Instagram », « Sign Up | LinkedIn », « Checking your
 * browser… ») n'est jamais une preuve : on préfère un faux négatif à un faux
 * compte dans le graphe.
 * ------------------------------------------------------------------ */

export interface PublicSite {
  id: string;
  label: string;
  /** `{u}` est remplacé par le pseudo normalisé. */
  url: (username: string) => string;
  /** Si l'un de ces motifs apparaît, le profil est absent. */
  absent: RegExp[];
  /** Au moins un de ces motifs doit apparaître pour déclarer le profil trouvé. */
  present: RegExp[];
  /** Titre minimum attendu (les titres vides ou génériques sont rejetés). */
  minTitle?: number;
}

export const PUBLIC_SITES: PublicSite[] = [
  {
    id: 'tiktok',
    label: 'TikTok',
    url: (u) => `https://www.tiktok.com/@${u}`,
    absent: [/Couldn.t find this account/i, /Page not found/i, /Target URL returned error 404/i],
    present: [/\(@[\w.-]+\)\s*\|\s*TikTok/i],
  },
  {
    id: 'youtube',
    label: 'YouTube',
    url: (u) => `https://www.youtube.com/@${u}`,
    absent: [/^Title:\s*404 Not Found/im, /Target URL returned error 404/i, /This channel does not exist/i],
    present: [/^Title:\s*.{3,90}$/im],
    minTitle: 3,
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    url: (u) => `https://www.pinterest.com/${u}/`,
    absent: [/^Title:\s*$/im, /Target URL returned error 404/i],
    present: [/\([\w.-]+\)\s*-\s*Profile\s*\|\s*Pinterest/i],
  },
  {
    id: 'github',
    label: 'GitHub',
    url: (u) => `https://github.com/${u}`,
    absent: [/Target URL returned error 404/i, /^Title:\s*Page not found/im],
    present: [/^Title:\s*.{2,80}(?:Overview|GitHub)/im],
  },
  {
    id: 'deviantart',
    label: 'DeviantArt',
    url: (u) => `https://www.deviantart.com/${u}`,
    absent: [/request could not be satisfied/i, /Target URL returned error 404/i, /Checking your browser/i],
    present: [/on DeviantArt/i],
  },
  {
    id: 'wordpress',
    label: 'WordPress',
    url: (u) => `https://${u}.wordpress.com`,
    absent: [/Target URL returned error 404/i, /doesn.t exist/i, /Page not found/i],
    present: [/^Title:\s*.{3,90}$/im],
    minTitle: 3,
  },
  {
    id: 'blogger',
    label: 'Blogger',
    url: (u) => `https://${u}.blogspot.com`,
    absent: [/Target URL returned error 404/i, /Blog not found/i],
    present: [/^Title:\s*.{3,90}$/im],
    minTitle: 3,
  },
  {
    id: 'linktree',
    label: 'Linktree',
    url: (u) => `https://linktr.ee/${u}`,
    absent: [/Target URL returned error 404/i, /Page not found/i, /This link is no longer available/i],
    present: [/^Title:\s*.{2,90}$/im],
    minTitle: 2,
  },
  {
    id: 'medium',
    label: 'Medium',
    url: (u) => `https://medium.com/@${u}`,
    absent: [/Target URL returned error 404/i, /Page not found/i],
    present: [/^Title:\s*.{3,90}(?:Medium|@)/im],
    minTitle: 4,
  },
  {
    id: 'telegram',
    label: 'Telegram',
    url: (u) => `https://t.me/${u}`,
    absent: [/Target URL returned error 404/i, /Telegram:\s*Contact\s*@/i],
    present: [/^Title:\s*.{2,90}$/im],
    minTitle: 3,
  },
];

/**
 * Décide si une page est un profil prouvé. Le titre est lu sur la première
 * ligne du Markdown renvoyé par r.jina.ai (`Title: …`).
 */
export function evaluatePublicSite(site: PublicSite, raw: string): {
  found: boolean;
  title: string;
  reason: string;
} {
  const title = /^Title:\s*(.*)$/im.exec(raw)?.[1]?.trim() ?? '';

  for (const pattern of site.absent) {
    if (pattern.test(raw) || pattern.test(title)) {
      return { found: false, title, reason: 'absent' };
    }
  }

  const hasPresent = site.present.some((pattern) => pattern.test(raw) || pattern.test(title));
  if (!hasPresent || title.length < (site.minTitle ?? 1)) {
    return { found: false, title, reason: 'non prouvé' };
  }

  // Un titre générique ou d'erreur ne prouve rien, même s'il passe les motifs
  // positifs — SoundCloud par exemple sert « Something went wrong » à tous.
  if (
    /^(instagram|sign up \| linkedin|checking your browser|just a moment|attention required|access denied)$/i.test(title) ||
    /something went wrong|page not found|not found|error|unavailable|access denied|sorry/i.test(title)
  ) {
    return { found: false, title, reason: 'page générique' };
  }

  return { found: true, title, reason: '' };
}
