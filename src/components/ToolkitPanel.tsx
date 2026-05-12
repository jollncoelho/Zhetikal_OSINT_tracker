import { useState } from 'react';
import { X, Search, ExternalLink } from 'lucide-react';

interface Tool {
  name: string;
  description: string;
  category: string;
  url: string;
}

const TOOLS: Tool[] = [
  { name: 'Sherlock', description: 'Hunt down social media accounts by username', category: 'Username', url: 'https://github.com/sherlock-project/sherlock' },
  { name: 'theHarvester', description: 'Email, subdomain & IP address enumeration', category: 'Recon', url: 'https://github.com/laramies/theHarvester' },
  { name: 'SpiderFoot', description: 'Automated OSINT & threat intelligence', category: 'Recon', url: 'https://spiderfoot.net' },
  { name: 'Maltego', description: 'Visual link analysis and OSINT platform', category: 'Recon', url: 'https://maltego.com' },
  { name: 'Shodan', description: 'Search engine for internet-connected devices', category: 'Network', url: 'https://shodan.io' },
  { name: 'OSINT Framework', description: 'Collection of OSINT tools and resources', category: 'Recon', url: 'https://osintframework.com' },
  { name: 'Have I Been Pwned', description: 'Check if email was in a data breach', category: 'Breach', url: 'https://haveibeenpwned.com' },
  { name: 'VirusTotal', description: 'Analyze suspicious files, URLs, and IPs', category: 'Malware', url: 'https://virustotal.com' },
  { name: 'Hunter.io', description: 'Find email addresses by domain', category: 'Email', url: 'https://hunter.io' },
  { name: 'DNSlytics', description: 'DNS, IP & domain intelligence', category: 'Network', url: 'https://dnslytics.com' },
  { name: 'Wayback Machine', description: 'Browse historical snapshots of websites', category: 'Web', url: 'https://web.archive.org' },
  { name: 'Censys', description: 'Search for devices and certificates on the internet', category: 'Network', url: 'https://censys.io' },
  { name: 'Recon-ng', description: 'Full-featured web reconnaissance framework', category: 'Recon', url: 'https://github.com/lanmaster53/recon-ng' },
  { name: 'Amass', description: 'In-depth attack surface mapping', category: 'Network', url: 'https://github.com/owasp-amass/amass' },
  { name: 'IntelOwl', description: 'Threat intelligence orchestration platform', category: 'Malware', url: 'https://github.com/intelowlproject/IntelOwl' },
  { name: 'PhoneInfoga', description: 'Advanced phone number lookup & OSINT', category: 'Phone', url: 'https://github.com/sundowndev/phoneinfoga' },
  { name: 'ExifTool', description: 'Read and write metadata in files', category: 'File', url: 'https://exiftool.org' },
  { name: 'TinEye', description: 'Reverse image search engine', category: 'Image', url: 'https://tineye.com' },
  { name: 'Google Dorks', description: 'Advanced Google search operators', category: 'Web', url: 'https://www.exploit-db.com/google-hacking-database' },
];

const CATEGORIES = ['All', ...Array.from(new Set(TOOLS.map((t) => t.category)))];

const CATEGORY_COLORS: Record<string, string> = {
  Username: '#8b5cf6',
  Recon: '#0ea5e9',
  Network: '#00c8d4',
  Breach: '#ef4444',
  Email: '#f59e0b',
  Malware: '#ef4444',
  Web: '#10b981',
  Phone: '#8b5cf6',
  File: '#94a3b8',
  Image: '#f59e0b',
};

interface ToolkitPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ToolkitPanel({ isOpen, onClose }: ToolkitPanelProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const filtered = TOOLS.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
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
          <p className="text-[10px] text-cyber-text-dim mt-0.5">OSINT toolkit reference</p>
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

        <div className="flex flex-wrap gap-1">
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
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filtered.map((tool) => (
          <div
            key={tool.name}
            className="group rounded-xl bg-cyber-panel border border-cyber-border p-3 hover:border-cyber-cyan/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-cyber-text">{tool.name}</span>
                  <span
                    className="text-[9px] font-mono px-1.5 py-0.5 rounded border"
                    style={{
                      color: CATEGORY_COLORS[tool.category] || '#94a3b8',
                      borderColor: `${CATEGORY_COLORS[tool.category] || '#94a3b8'}44`,
                      background: `${CATEGORY_COLORS[tool.category] || '#94a3b8'}11`,
                    }}
                  >
                    {tool.category}
                  </span>
                </div>
                <p className="text-[10px] text-cyber-text-dim leading-relaxed">{tool.description}</p>
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
        ))}

        {filtered.length === 0 && (
          <p className="text-center text-xs text-cyber-text-dim py-8">No tools found</p>
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
          Full Ghostint-Tools Catalog
        </a>
      </div>
    </div>
  );
}
