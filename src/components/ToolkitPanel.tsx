import { useState, useEffect } from 'react';
import { X, Search, ExternalLink, Loader } from 'lucide-react';
import toolsData from '../tools.json';
import { useTheme } from '../theme/ThemeContext';

interface Tool {
  name: string;
  description: string;
  url: string;
  category: string;
  type?: string;
  source?: string;
}

const TOOLS: Tool[] = (toolsData?.tools ?? []) as Tool[];

const CATEGORIES = ['All', ...Array.from(new Set(TOOLS.map((t) => t.category)))].filter(
  (cat) => cat !== ''
);

/* Accents de catégorie. La plupart pointent sur un token de thème ; les deux
   teintes de marque restantes (violet générique, bleu Facebook) sont des
   couleurs de **légende** : on les assombrit en thème clair via `entityTone`
   au lieu de les figer en hexadécimal. */
const BRAND_VIOLET = '#8b5cf6';
const BRAND_FACEBOOK = '#1877f2';

const CATEGORY_COLORS: Record<string, string> = {
  Recon: 'var(--cyber-blue)',
  Network: 'var(--cyber-cyan-dim)',
  Breach: 'var(--cyber-red)',
  Email: 'var(--cyber-orange)',
  Malware: 'var(--cyber-red)',
  Web: 'var(--cyber-green)',
  Phone: BRAND_VIOLET,
  File: 'var(--cyber-text-dim)',
  Image: 'var(--cyber-orange)',
  Username: BRAND_VIOLET,
  Emails: 'var(--cyber-orange)',
  Téléphones: BRAND_VIOLET,
  'Domaines & DNS': 'var(--cyber-cyan-dim)',
  'Breaches & Leaks': 'var(--cyber-red)',
  Métadonnées: 'var(--cyber-text-dim)',
  'Moteurs de recherche': 'var(--cyber-green)',
  'Images inversées': 'var(--cyber-orange)',
  'Réseaux sociaux': BRAND_FACEBOOK,
  'Archives web': 'var(--cyber-green)',
  Entreprises: 'var(--cyber-blue)',
  'Code & Repositories': BRAND_VIOLET,
  'Transport & Véhicules': 'var(--cyber-blue)',
  'Monitoring & Threat Intel': 'var(--cyber-red)',
  'Documents & Data': 'var(--cyber-text-dim)',
  'Visualisation & DataViz': 'var(--cyber-green)',
  'Telegram OSINT': BRAND_VIOLET,
  'Navigateur & OPSEC': 'var(--cyber-text-dim)',
  'Outils IA': BRAND_VIOLET,
  Ressources: 'var(--cyber-text-dim)',
  'People Search & Profils': 'var(--cyber-orange)',
  'Web, Traffic & SEO': 'var(--cyber-green)',
  'Fact-check & Vérification': 'var(--cyber-green)',
  'Module Colombie': 'var(--cyber-blue)',
  Géolocalisation: 'var(--cyber-green)',
  'IAGéolocalisation': 'var(--cyber-green)',
  search_engines: 'var(--cyber-green)',
  'social-media-intelligence': BRAND_FACEBOOK,
  geolocation: 'var(--cyber-green)',
  'domain--network-analysis': 'var(--cyber-cyan-dim)',
  people_search: 'var(--cyber-orange)',
  threat_intelligence: 'var(--cyber-red)',
  image_video_analysis: 'var(--cyber-orange)',
  dark_web: 'var(--cyber-red)',
  email_investigation: 'var(--cyber-orange)',
  metadata_analysis: 'var(--cyber-text-dim)',
  metadata: 'var(--cyber-text-dim)',
  phone_research: BRAND_VIOLET,
  code_repository: BRAND_VIOLET,
  domain_network: 'var(--cyber-cyan-dim)',
  file_document: 'var(--cyber-text-dim)',
  finance_intelligence: 'var(--cyber-orange)',
  news_media: 'var(--cyber-green)',
  social_media: BRAND_FACEBOOK,
  visualization_analysis: 'var(--cyber-green)',
  archive_history: 'var(--cyber-green)',
  data_statistics: 'var(--cyber-orange)',
  image_video: 'var(--cyber-orange)',
  maritime_aviation: 'var(--cyber-blue)',
  username_tracking: BRAND_VIOLET,
  company_research: 'var(--cyber-blue)',
  email: 'var(--cyber-orange)',
  privacy_security: 'var(--cyber-text-dim)',
  privacy_security_tools: 'var(--cyber-text-dim)',
};

/**
 * Les tokens `var(--cyber-*)` s'adaptent déjà au thème ; seules les couleurs de
 * marque (hexadécimales) doivent passer par `entityTone`.
 */
function getCategoryColor(cat: string, tone: (hex: string) => string): string {
  const color = CATEGORY_COLORS[cat] || 'var(--cyber-text-dim)';
  return color.startsWith('#') ? tone(color) : color;
}

interface ToolkitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ToolkitPanel({ isOpen, onClose }: ToolkitPanelProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const { entityTone } = useTheme();

  useEffect(() => {
    setLoading(false);
  }, []);

  const filtered = TOOLS.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase())) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === 'All' || t.category === category;
    return matchSearch && matchCategory;
  });

  return (
    <div
      className={`fixed right-0 w-96 bg-cyber-dark border-l border-t border-b border-cyber-border flex flex-col transition-transform duration-300 z-50 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{ top: 60, bottom: 28 }}
    >
      <div className="relative flex items-center px-5 py-4 border-b border-cyber-border">
        <div className="flex-1">
          <h2 className="text-sm font-bold text-cyber-text">Ghostint-Tools</h2>
          <p className="text-[10px] text-cyber-text-dim mt-0.5">
            OSINT toolkit · 1226 outils
          </p>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          <img
            src="/photo_2026-05-04_13-46-20.jpg"
            alt="Zhétikal"
            className="h-10 w-10 rounded-full object-cover object-center mix-blend-lighten"
            style={{ filter: 'brightness(1.15) contrast(1.1)' }}
          />
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-2.5 border-b border-cyber-border">
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-text-dim" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools..."
            className="w-full bg-cyber-panel border border-cyber-border rounded-lg pl-8 pr-3 py-2 text-xs text-cyber-text placeholder-cyber-text-dim outline-none focus:border-cyber-cyan transition-colors"
          />
        </div>

        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                category === cat
                  ? 'bg-cyber-cyan/15 border-cyber-cyan/40 text-cyber-cyan'
                  : 'bg-cyber-panel border-cyber-border text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              {cat === 'All' ? 'Tous' : cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-cyber-text-dim py-8">Aucun outil trouvé</p>
        ) : (
          filtered.map((tool) => {
            const accent = getCategoryColor(tool.category, entityTone);
            return (
            <div
              key={tool.name + tool.url}
              className="group rounded-xl bg-cyber-panel border border-cyber-border p-3 hover:border-cyber-cyan/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-cyber-text truncate">
                      {tool.name}
                    </span>
                    <span
                      className="text-[9px] font-mono px-1.5 py-0.5 rounded border whitespace-nowrap"
                      style={{
                        color: accent,
                        borderColor: `${accent}44`,
                        background: `${accent}11`,
                      }}
                    >
                      {tool.category}
                    </span>
                  </div>
                  {tool.description && (
                    <p className="text-[10px] text-cyber-text-dim leading-relaxed line-clamp-2">
                      {tool.description}
                    </p>
                  )}
                  {tool.type && (
                    <p className="text-[9px] text-cyber-text-dim mt-0.5 font-mono">
                      {tool.type}
                    </p>
                  )}
                </div>
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-cyber-dark border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/40 transition-colors"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-3 border-t border-cyber-border">
        <a
          href="https://osint-zhetikal-master-toolkit-v2.vercel.app"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-xs font-medium hover:bg-cyber-cyan/20 transition-colors"
        >
          <ExternalLink size={12} />
          Catalogue complet · 1226 outils
        </a>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-cyber-dark/80 z-10">
          <Loader size={24} className="animate-spin text-cyber-cyan" />
        </div>
      )}
    </div>
  );
}
