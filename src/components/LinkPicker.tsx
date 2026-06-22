import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Link2, Search } from 'lucide-react';
import type { EntityNode, PinLink } from '../types';

interface Props {
  nodes: EntityNode[];
  existingLinks: PinLink[];
  onAdd: (identifierId: string, context: string) => void;
  onRemove: (linkId: string) => void;
  onClose: () => void;
}

export default function LinkPicker({ nodes, existingLinks, onAdd, onRemove, onClose }: Props) {
  const [search, setSearch] = useState('');
  const [context, setContext] = useState('');

  const linkedIds = new Set(existingLinks.map((l) => l.identifierId));
  const filtered = nodes.filter(
    (n) =>
      n.data.label.toLowerCase().includes(search.toLowerCase()) ||
      n.data.entityType.toLowerCase().includes(search.toLowerCase())
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative bg-cyber-dark border border-cyber-border rounded-2xl shadow-2xl p-5 w-[360px] max-h-[520px] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-cyber-text flex items-center gap-2">
              <Link2 size={14} className="text-cyber-cyan" /> Lier à un identifiant
            </h2>
            <p className="text-[10px] text-cyber-text-dim font-mono mt-0.5">Connecte ce point à un nœud du graphe</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex items-center gap-2 bg-cyber-black/50 border border-cyber-border rounded-lg px-3 py-1.5 mb-3">
          <Search size={11} className="text-cyber-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            className="flex-1 bg-transparent text-xs text-cyber-text outline-none placeholder:text-cyber-text-dim/50"
            autoFocus
          />
        </div>

        <input
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Contexte du lien (optionnel)"
          className="input-cyber mb-3 text-[11px]"
        />

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {filtered.length === 0 && (
            <p className="text-xs text-cyber-text-dim/40 text-center py-6">Aucun nœud trouvé</p>
          )}
          {filtered.map((node) => {
            const isLinked = linkedIds.has(node.id);
            const link = existingLinks.find((l) => l.identifierId === node.id);
            return (
              <div
                key={node.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border transition-all"
                style={{
                  borderColor: isLinked ? `${node.data.color}50` : '#1e3a5f',
                  background: isLinked ? `${node.data.color}10` : 'transparent',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: node.data.color }} />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-cyber-text truncate">{node.data.label}</p>
                    <p className="text-[10px] text-cyber-text-dim">{node.data.entityType}</p>
                  </div>
                </div>
                {isLinked ? (
                  <button
                    onClick={() => link && onRemove(link.id)}
                    className="text-[10px] text-red-400/70 hover:text-red-400 flex items-center gap-1 flex-shrink-0"
                  >
                    <X size={9} /> Délier
                  </button>
                ) : (
                  <button
                    onClick={() => onAdd(node.id, context)}
                    className="text-[10px] text-cyber-cyan hover:text-cyber-text flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded border border-cyber-cyan/30 hover:bg-cyber-cyan/10 transition-colors"
                  >
                    <Link2 size={9} /> Lier
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
