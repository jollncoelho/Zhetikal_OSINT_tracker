import React, { useEffect, useState } from 'react';
import { Minimize2, Maximize2, Save } from 'lucide-react';
import { useStore } from '../store/useStore';
import { runAnalysis, checkOllama, checkHermes } from '../hermesService';
import type { AnalysisMode, HermesDiscovery } from '../types/hermes';

type ServiceStatus = 'unknown' | 'up' | 'down';

export const HermesAnalyzer: React.FC = () => {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const addEntity = useStore((s) => s.addEntity);
  const onConnect = useStore((s) => s.onConnect);
  const analystName = useStore((s) => s.analystName);

  const [mode, setMode] = useState<AnalysisMode>('local');
  const [loading, setLoading] = useState(false);
  const [discovery, setDiscovery] = useState<HermesDiscovery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<ServiceStatus>('unknown');
  const [hermesStatus, setHermesStatus] = useState<ServiceStatus>('unknown');
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    Promise.all([checkOllama(), checkHermes()]).then(([ollama, hermes]) => {
      setOllamaStatus(ollama ? 'up' : 'down');
      setHermesStatus(hermes ? 'up' : 'down');
    });
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setDiscovery(null);
    try {
      const result = await runAnalysis(mode, { nodes, edges }, analystName);
      setDiscovery(result);
    } catch (err: any) {
      setError(err.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleInject = () => {
    if (!discovery) return;

    // Build label→ID map from existing nodes before injection
    const labelToId = new Map<string, string>();
    for (const n of nodes) {
      if (n.data?.label) labelToId.set(String(n.data.label).trim().toLowerCase(), n.id);
    }

    // Only inject entities whose label is not already on the graph
    const newLabelToId = new Map<string, string>(labelToId);
    for (const entity of newEntities) {
      const key = entity.label.trim().toLowerCase();
      if (!newLabelToId.has(key)) {
        const id = addEntity(entity.type, entity.label);
        newLabelToId.set(key, id);
      }
    }

    // Inject relations
    for (const rel of discovery.relations) {
      const srcKey = rel.source.trim().toLowerCase();
      const tgtKey = rel.target.trim().toLowerCase();
      let sourceId = newLabelToId.get(srcKey);
      let targetId = newLabelToId.get(tgtKey);

      if (!sourceId) {
        sourceId = addEntity('note', rel.source);
        newLabelToId.set(srcKey, sourceId);
      }
      if (!targetId) {
        targetId = addEntity('note', rel.target);
        newLabelToId.set(tgtKey, targetId);
      }

      onConnect({ source: sourceId, target: targetId, sourceHandle: null, targetHandle: null });
    }

    setDiscovery(null);
  };

  const handleSave = () => {
    if (!discovery && !error) return;
    const lines: string[] = [];
    const now = new Date().toLocaleString('fr-FR');
    lines.push(`RAPPORT HERMES — ${now}`);
    lines.push('='.repeat(60));
    if (discovery?.summary) {
      lines.push('');
      lines.push('ANALYSE');
      lines.push('-'.repeat(40));
      lines.push(discovery.summary);
    }
    if (newEntities.length > 0) {
      lines.push('');
      lines.push('NOUVELLES ENTITÉS');
      lines.push('-'.repeat(40));
      for (const e of newEntities) lines.push(`[${e.type}] ${e.label}`);
    }
    if (error) {
      lines.push('');
      lines.push('ERREUR');
      lines.push(error);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-rapport-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Existing node labels (lowercase) used to filter out duplicates from AI output
  const existingLabels = new Set(nodes.map((n) => String(n.data?.label ?? '').trim().toLowerCase()).filter(Boolean));
  const newEntities = discovery
    ? discovery.entities.filter((e) => e.label && !existingLabels.has(e.label.trim().toLowerCase()))
    : [];

  const statusDot = (status: ServiceStatus) => {
    if (status === 'up') return <span style={{ color: '#22c55e', fontSize: 10 }}>&#9679;</span>;
    if (status === 'down') return <span style={{ color: '#ef4444', fontSize: 10 }}>&#9679;</span>;
    return <span style={{ color: '#6b7280', fontSize: 10 }}>&#9679;</span>;
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: '100%',
        maxWidth: 560,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        boxSizing: 'border-box',
      }}
    >
      {/* Results panel */}
      {!minimized && (discovery || error) && (
        <div
          style={{
            width: '100%',
            background: '#0d111c',
            border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '70vh',
          }}
        >
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(239,68,68,0.1)',
                borderBottom: '1px solid rgba(239,68,68,0.3)',
                color: '#fca5a5',
                fontSize: 12,
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {error}
            </div>
          )}

          {discovery && (
            <>
              {/* Summary — narrative investigation text */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(99,102,241,0.2)',
                  color: '#cbd5e1',
                  fontSize: 12,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflowY: 'auto',
                  maxHeight: 160,
                  fontFamily: 'monospace',
                }}
              >
                {discovery.summary}
              </div>

              {/* Entities */}
              {newEntities.length > 0 && (
                <div style={{ padding: '10px 16px' }}>
                  {/* Header row: count + inline inject button */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: '#818cf8',
                      }}
                    >
                      {newEntities.length} nouvelle{newEntities.length > 1 ? 's' : ''} entit{newEntities.length === 1 ? 'é' : 'és'} détecté{newEntities.length === 1 ? 'e' : 'es'}
                    </span>
                    <button
                      onClick={handleInject}
                      style={{
                        padding: '3px 10px',
                        background: 'rgba(99,102,241,0.25)',
                        border: '1px solid rgba(99,102,241,0.5)',
                        borderRadius: 5,
                        color: '#a5b4fc',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.25)')}
                    >
                      Tout injecter
                    </button>
                  </div>

                  {/* Entity cards */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                      overflowY: 'auto',
                      maxHeight: 180,
                    }}
                  >
                    {newEntities.map((e, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          padding: '6px 10px',
                          background: 'rgba(30,41,59,0.8)',
                          borderRadius: 6,
                          border: '1px solid rgba(51,65,85,0.6)',
                        }}
                      >
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.1em',
                            color: '#60a5fa',
                          }}
                        >
                          + {e.type}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: '#e2e8f0',
                            wordBreak: 'break-all',
                            lineHeight: 1.4,
                          }}
                        >
                          {e.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Control bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(11,15,25,0.95)',
          border: '1px solid rgba(99,102,241,0.35)',
          borderRadius: 12,
          padding: '8px 12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(12px)',
        }}
      >
        {/* Mode toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            background: 'rgba(15,23,42,0.8)',
            borderRadius: 8,
            border: '1px solid rgba(51,65,85,0.6)',
            overflow: 'hidden',
          }}
        >
          <button
            onClick={() => setMode('local')}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              outline: 'none',
              borderRadius: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background 0.15s, color 0.15s',
              background: mode === 'local' ? 'rgba(99,102,241,0.3)' : 'transparent',
              color: mode === 'local' ? '#a5b4fc' : '#64748b',
            }}
          >
            {statusDot(ollamaStatus)}
            Local (Ollama)
          </button>
          <div style={{ width: 1, height: 20, background: 'rgba(51,65,85,0.6)' }} />
          <button
            onClick={() => setMode('hermes')}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              outline: 'none',
              borderRadius: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              transition: 'background 0.15s, color 0.15s',
              background: mode === 'hermes' ? 'rgba(99,102,241,0.3)' : 'transparent',
              color: mode === 'hermes' ? '#a5b4fc' : '#64748b',
            }}
          >
            {statusDot(hermesStatus)}
            Avancé (Hermes)
          </button>
        </div>

        {/* Launch button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          title={loading ? 'Analyse en cours...' : 'Lancer l\'Analyse'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: loading ? 'rgba(51,65,85,0.4)' : 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.4)',
            borderRadius: 8,
            color: loading ? '#475569' : '#a5b4fc',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = 'rgba(99,102,241,0.35)';
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = 'rgba(99,102,241,0.2)';
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  width: 12,
                  height: 12,
                  border: '2px solid rgba(99,102,241,0.5)',
                  borderTopColor: '#818cf8',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.75s linear infinite',
                  flexShrink: 0,
                }}
              />
              Analyse en cours...
            </>
          ) : (
            <>🧬 Lancer l'Analyse</>
          )}
        </button>

        {/* Save */}
        {(discovery || error) && (
          <button
            onClick={handleSave}
            title="Sauvegarder le rapport"
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#64748b', borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#22c55e')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            <Save size={14} />
          </button>
        )}

        {/* Minimize / Restore */}
        {(discovery || error) && (
          <button
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? 'Restaurer' : 'Réduire'}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#64748b', borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#a5b4fc')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
        )}

        {/* Close */}
        {(discovery || error) && (
          <button
            onClick={() => { setDiscovery(null); setError(null); setMinimized(false); }}
            title="Effacer"
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: '#64748b', fontSize: 14, borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
          >
            ✕
          </button>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
