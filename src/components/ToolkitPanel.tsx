import { useState, useEffect } from 'react';
import { X, Search, ExternalLink, Loader } from 'lucide-react';
import toolsData from '../tools.json';

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

const CATEGORY_COLORS: Record<string, string> = {
  Recon: '#0ea5e9',
  Network: '#00c8d4',
  Breach: '#ef4444',
  Email: '#f59e0b',
  Malware: '#ef4444',
  Web: '#10b981',
  Phone: '#8b5cf6',
  File: '#94a3b8',
  Image: '#f59e0b',
  Username: '#8b5cf6',
  Emails: '#f59e0b',
  Téléphones: '#8b5cf6',
  'Domaines & DNS': '#00c8d4',
  'Breaches & Leaks': '#ef4444',
  Métadonnées: '#94a3b8',
  'Moteurs de recherche': '#10b981',
  'Images inversées': '#f59e0b',
  'Réseaux sociaux': '#1877f2',
  'Archives web': '#10b981',
  Entreprises: '#0ea5e9',
  'Code & Repositories': '#8b5cf6',
  'Transport & Véhicules': '#0ea5e9',
  'Monitoring & Threat Intel': '#ef4444',
  'Documents & Data': '#94a3b8',
  'Visualisation & DataViz': '#10b981',
  'Telegram OSINT': '#8b5cf6',
  'Navigateur & OPSEC': '#94a3b8',
  'Outils IA': '#8b5cf6',
  Ressources: '#94a3b8',
  'People Search & Profils': '#f59e0b',
  'Web, Traffic & SEO': '#10b981',
  'Fact-check & Vérification': '#10b981',
  'Module Colombie': '#0ea5e9',
  Géolocalisation: '#10b981',
  'IAGéolocalisation': '#10b981',
  search_engines: '#10b981',
  'social-media-intelligence': '#1877f2',
  geolocation: '#10b981',
  'domain--network-analysis': '#00c8d4',
  people_search: '#f59e0b',
  threat_intelligence: '#ef4444',
  image_video_analysis: '#f59e0b',
  dark_web: '#ef4444',
  email_investigation: '#f59e0b',
  metadata_analysis: '#94a3b8',
  metadata: '#94a3b8',
  phone_research: '#8b5cf6',
  code_repository: '#8b5cf6',
  domain_network: '#00c8d4',
  file_document: '#94a3b8',
  finance_intelligence: '#f59e0b',
  news_media: '#10b981',
  social_media: '#1877f2',
  visualization_analysis: '#10b981',
  archive_history: '#10b981',
  data_statistics: '#f59e0b',
  image_video: '#f59e0b',
  maritime_aviation: '#0ea5e9',
  username_tracking: '#8b5cf6',
  company_research: '#0ea5e9',
  email: '#f59e0b',
  privacy_security: '#94a3b8',
  privacy_security_tools: '#94a3b8',
};

function getCategoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || '#94a3b8';
}

interface ToolkitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ToolkitPanel({ isOpen, onClose }: ToolkitPanelProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [toolCount, setToolCount] = useState<number>(1226);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Tools are statically imported via toolsData; no async fetch needed.
    // Just confirm count after mount.
    setToolCount(1226);
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

  const showPanel = isOpen && !loading;

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
          filtered.map((tool) => (
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
                        color: getCategoryColor(tool.category),
                        borderColor: `${getCategoryColor(tool.category)}44`,
                        background: `${getCategoryColor(tool.category)}11`,
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
          ))
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
