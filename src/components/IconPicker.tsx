import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'ghostint-custom-icons';

export interface StoredIcon {
  id: string;
  name: string;
  dataUrl: string;
}

export function loadIcons(): StoredIcon[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveIcons(icons: StoredIcon[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(icons));
}

interface Props {
  currentIconId: string | null;
  onSelect: (iconId: string | null) => void;
  onClose: () => void;
}

export default function IconPicker({ currentIconId, onSelect, onClose }: Props) {
  const [icons, setIcons] = useState<StoredIcon[]>(loadIcons);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const newIcon: StoredIcon = {
        id: Math.random().toString(36).slice(2),
        name: file.name.replace(/\.[^.]+$/, ''),
        dataUrl: reader.result as string,
      };
      const updated = [...icons, newIcon];
      setIcons(updated);
      saveIcons(updated);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDelete = (id: string) => {
    const updated = icons.filter((i) => i.id !== id);
    setIcons(updated);
    saveIcons(updated);
    if (currentIconId === id) onSelect(null);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-cyber-dark border border-cyber-border rounded-2xl shadow-2xl p-5 w-[380px]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-cyber-text">Choisir une icône</h2>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-panel transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Upload */}
        <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg" className="hidden" onChange={handleUpload} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2 mb-4 rounded-lg border border-dashed border-cyber-border text-cyber-text-dim text-xs hover:border-cyber-cyan/50 hover:text-cyber-cyan transition-colors"
        >
          <Upload size={12} /> Importer une icône (PNG / SVG)
        </button>

        {/* Icon grid */}
        {icons.length === 0 ? (
          <p className="text-xs text-cyber-text-dim/40 text-center py-6 italic">Aucune icône importée</p>
        ) : (
          <div className="grid grid-cols-4 gap-3 max-h-52 overflow-y-auto custom-scrollbar pr-1">
            {/* Reset option */}
            <button
              onClick={() => onSelect(null)}
              className="flex flex-col items-center gap-1 p-2 rounded-xl border transition-all"
              style={{ borderColor: currentIconId === null ? '#00c8d4' : '#1e3a5f', background: currentIconId === null ? '#00c8d410' : 'transparent' }}
            >
              <span className="text-lg">🔄</span>
              <span className="text-[9px] text-cyber-text-dim truncate w-full text-center">Défaut</span>
            </button>

            {icons.map((icon) => (
              <div key={icon.id} className="relative group">
                <button
                  onClick={() => onSelect(icon.id)}
                  className="w-full flex flex-col items-center gap-1 p-2 rounded-xl border transition-all"
                  style={{
                    borderColor: currentIconId === icon.id ? '#00c8d4' : '#1e3a5f',
                    background: currentIconId === icon.id ? '#00c8d410' : 'transparent',
                  }}
                >
                  <img src={icon.dataUrl} alt={icon.name} className="w-8 h-8 object-contain rounded" />
                  <span className="text-[9px] text-cyber-text-dim truncate w-full text-center">{icon.name}</span>
                </button>
                <button
                  onClick={() => handleDelete(icon.id)}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500/80 text-white items-center justify-center hidden group-hover:flex"
                >
                  <Trash2 size={8} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-cyber-panel border border-cyber-border text-cyber-text-dim text-xs hover:bg-cyber-dark transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
