import React, { useEffect, useMemo, useState } from 'react';
import { Minimize2, Maximize2, Save, Eye, EyeOff, Key, PlusCircle, PlugZap } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  runAnalysis,
  checkOllama,
  checkFreeLlm,
  RECOMMENDED_MODELS,
  getOllamaModel,
  setOllamaModel,
  getFreeLlmKey,
  setFreeLlmKey,
  getFreeLlmBaseUrl,
  setFreeLlmBaseUrl,
  getFreeLlmModel,
  setFreeLlmModel,
  getFreeLlmAuto,
  setFreeLlmAuto,
  fetchFreeLlmModels,
  isLoopbackOrigin,
  DEFAULT_FREELLM_BASE_URL,
  DEFAULT_FREELLM_MODEL,
} from '../hermesService';
import type { AnalysisMode, HermesDiscovery, HermesEntity } from '../types/hermes';
import { useLanguage } from '../i18n/LanguageContext';

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
  const [freeLlmStatus, setFreeLlmStatus] = useState<ServiceStatus>('unknown');
  const [checking, setChecking] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [barCollapsed, setBarCollapsed] = useState(false);
  /** Secondes écoulées + caractères reçus : la preuve visible que ça avance. */
  const [elapsed, setElapsed] = useState(0);
  const [received, setReceived] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [loading]);

  // FreeLLMAPI config state
  const [savedKey, setSavedKey] = useState<string>(() => getFreeLlmKey());
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [panelOpen, setPanelOpen] = useState<boolean>(() => !getFreeLlmKey());
  const [baseUrlInput, setBaseUrlInput] = useState<string>(() => getFreeLlmBaseUrl());
  const [modelInput, setModelInput] = useState<string>(() => getFreeLlmModel());
  const [autoModel, setAutoModel] = useState<boolean>(() => getFreeLlmAuto());
  const [ollamaModel, setOllamaModelState] = useState<string>(() => getOllamaModel());
  const [customModel, setCustomModel] = useState<string>('');

  // Models advertised by the configured FreeLLMAPI router
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const { t } = useLanguage();

  /**
   * Both backends live on 127.0.0.1. Chrome 138+ refuses a loopback request
   * that carries no user activation — and a silent refusal sticks to the
   * origin. Probing automatically on mount therefore does two bad things: it
   * paints a perfectly healthy router red, and it can burn the local-network
   * permission before the user has clicked anything. On a hosted origin the
   * indicator stays grey and we wait for the explicit "Test connection"
   * button below — its click *is* the user activation Chrome wants.
   */
  useEffect(() => {
    if (!isLoopbackOrigin()) {
      setOllamaStatus('unknown');
      setFreeLlmStatus('unknown');
      return;
    }
    Promise.all([checkOllama(), checkFreeLlm()]).then(([ollama, freeLlm]) => {
      setOllamaStatus(ollama ? 'up' : 'down');
      setFreeLlmStatus(freeLlm ? 'up' : 'down');
    });
  }, [savedKey]);

  /** User-initiated probe — the only kind that can succeed on a hosted origin. */
  const runChecks = async () => {
    setChecking(true);
    try {
      const [ollama, freeLlm] = await Promise.all([checkOllama(), checkFreeLlm()]);
      setOllamaStatus(ollama ? 'up' : 'down');
      setFreeLlmStatus(freeLlm ? 'up' : 'down');
    } finally {
      setChecking(false);
    }
  };

  const handleSaveKey = () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setFreeLlmKey(trimmed);
    setFreeLlmBaseUrl(baseUrlInput);
    setFreeLlmModel(modelInput);
    setFreeLlmAuto(autoModel);
    setSavedKey(trimmed);
    setKeyInput('');
    setShowKey(false);
    setPanelOpen(false);
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 3000);
  };

  /**
   * Persist the FreeLLMAPI fields currently in the form (without closing the
   * panel) and return the effective key. Used before querying the router.
   */
  const persistConfig = (): string => {
    const typed = keyInput.trim();
    const key = typed || savedKey;
    if (typed) {
      setFreeLlmKey(typed);
      setSavedKey(typed);
      setKeyInput('');
      setShowKey(false);
    }
    setFreeLlmBaseUrl(baseUrlInput);
    setFreeLlmModel(modelInput);
    return key;
  };

  const handleLoadModels = async () => {
    const key = persistConfig();
    if (!key) {
      setModelsError(t('analyzer.apiKeyNotConfigured'));
      return;
    }
    setModelsLoading(true);
    setModelsError(null);
    try {
      const list = await fetchFreeLlmModels();
      setModels(list);
      if (list.length === 0) setModelsError(t('analyzer.noModels'));
    } catch (err: any) {
      setModels([]);
      setModelsError(err?.message ?? 'Erreur inconnue');
    } finally {
      setModelsLoading(false);
    }
  };

  const handlePickModel = (value: string) => {
    if (!value) return;
    setModelInput(value);
    setFreeLlmModel(value);
  };

  const handleModelChange = (value: string) => {
    if (value === '__custom__') {
      setOllamaModelState('');
      return;
    }
    setOllamaModelState(value);
    setOllamaModel(value);
  };

  const handleCustomModelSave = () => {
    const trimmed = customModel.trim();
    if (!trimmed) return;
    setOllamaModelState(trimmed);
    setOllamaModel(trimmed);
    setCustomModel('');
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setDiscovery(null);
    setElapsed(0);
    setReceived(0);
    try {
      const result = await runAnalysis(mode, { nodes, edges }, analystName, (progress) => {
        setReceived(progress.chars);
      });
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
        const id = addEntity(entity.type, entity.label, entity.properties?.notes ? { notes: entity.properties.notes } : undefined);
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

  const handleInjectOne = (entity: HermesEntity) => {
    const key = entity.label.trim().toLowerCase();
    if (!existingLabels.has(key)) {
      addEntity(entity.type, entity.label, entity.properties?.notes ? { notes: entity.properties.notes } : undefined);
    }
    // Remove this single entity from the list
    setDiscovery((d) =>
      d ? { ...d, entities: d.entities.filter((e) => !(e.type === entity.type && e.label === entity.label)) } : null
    );
  };

  const handleSave = () => {
    if (!discovery && !error) return;
    const lines: string[] = [];
    const now = new Date().toLocaleString('fr-FR');
    lines.push(`RAPPORT FREELLMAPI — ${now}`);
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
    a.download = `freellmapi-rapport-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Existing node labels (lowercase) used to filter out duplicates from AI output
  const existingLabels = new Set(nodes.map((n) => String(n.data?.label ?? '').trim().toLowerCase()).filter(Boolean));
  const newEntities = discovery
    ? discovery.entities.filter((e) => e.label && !existingLabels.has(e.label.trim().toLowerCase()))
    : [];

  /** Type d'identifiant d'une valeur écartée (absent = simple mot, pas une piste). */
  const suggestedTypes = useMemo(
    () => new Map((discovery?.suggested ?? []).map((item) => [item.value, item.type])),
    [discovery]
  );

  /**
   * Promouvoir une valeur écartée en entité.
   *
   * Le modèle n'a ni réseau ni moteur : une adresse qu'il cite n'est pas une
   * découverte, c'est une hypothèse. On l'ajoute donc cotée **F6** (« on ne
   * peut rien juger ») avec une note qui le dit, pour qu'elle apparaisse comme
   * une piste et jamais comme une preuve. `admiraltyWeight` la neutralise dans
   * les analyses suivantes, qui ne la traiteront pas comme un fait établi.
   */
  const handleAddSuggestion = (value: string, type: string) => {
    const key = value.trim().toLowerCase();
    if (!key || existingLabels.has(key)) return;
    addEntity(type, value.trim(), {
      notes: t('analyzer.suggestedNote'),
      admiralty: { source: 'F', credibility: 6 },
    });
  };

  /**
   * Pages publiques à ouvrir pour chaque domaine du dossier.
   *
   * Aucune requête n'est émise : le modèle ne peut pas « trouver » une adresse
   * publiée — il n'a ni réseau ni moteur — et faire lire une cible par un
   * lecteur tiers la révélerait à ce tiers. On se contente donc de nommer les
   * endroits où l'analyste regarde lui-même : c'est un pense-bête, pas une
   * découverte, et rien ici ne prétend être une donnée.
   */
  const checkTargets = useMemo(() => {
    const seen = new Set<string>();
    const targets: { domain: string; pages: { label: string; url: string }[] }[] = [];

    for (const node of nodes) {
      const type = String(node.data?.entityType ?? '');
      if (!['domain', 'hostname', 'url'].includes(type)) continue;

      const host = String(node.data?.label ?? '')
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/[/?#].*$/, '')
        .toLowerCase();

      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || seen.has(host)) continue;
      seen.add(host);

      targets.push({
        domain: host,
        pages: [
          { label: '/contact', url: `https://${host}/contact` },
          { label: '/mentions-legales', url: `https://${host}/mentions-legales` },
          { label: '/a-propos', url: `https://${host}/a-propos` },
          { label: 'WHOIS', url: `https://who.is/whois/${host}` },
        ],
      });
    }

    return targets;
  }, [nodes]);

  /**
   * The dot has three states, and the grey one is the one people misread: on a
   * hosted origin nothing is probed automatically, so grey means "not tested
   * yet", not "down". Spell that out in a tooltip — a silent grey dot next to
   * "Local (Ollama)" reads as "Ollama broke".
   */
  const statusDot = (status: ServiceStatus) => {
    const label =
      status === 'up'
        ? t('analyzer.statusUp')
        : status === 'down'
          ? t('analyzer.statusDown')
          : t('analyzer.statusUnknown');
    const color =
      status === 'up'
        ? 'var(--cyber-green)'
        : status === 'down'
          ? 'var(--cyber-red)'
          : 'var(--cyber-text-dim)';
    return (
      <span title={label} style={{ color, fontSize: 10, cursor: 'help' }}>
        &#9679;
      </span>
    );
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
          data-testid="hermes-result"
          style={{
            width: '100%',
            background: 'var(--cyber-dark)',
            border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.3)',
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
                background: 'rgb(var(--cyber-red-rgb) / 0.1)',
                borderBottom: '1px solid rgb(var(--cyber-red-rgb) / 0.3)',
                color: 'var(--cyber-red)',
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
                data-testid="hermes-summary"
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgb(var(--cyber-cyan-rgb) / 0.2)',
                  color: 'var(--cyber-text)',
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

              {/* Valeurs citées par le modèle mais absentes du dossier : on les
                  montre au lieu de laisser passer une affirmation pour un fait. */}
              {!!discovery.unsupported?.length && (
                <div
                  data-testid="hermes-unsupported"
                  style={{
                    padding: '8px 16px',
                    borderBottom: '1px solid rgb(var(--cyber-cyan-rgb) / 0.2)',
                    background: 'rgb(var(--cyber-orange-rgb) / 0.08)',
                    fontSize: 10,
                    lineHeight: 1.6,
                    color: 'var(--cyber-orange)',
                  }}
                >
                  <b>{t('analyzer.unsupported')}</b>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    {discovery.unsupported.map((value) => {
                      const type = suggestedTypes.get(value);
                      // Un mot écarté (« Hetzner », « darknet ») reste du texte :
                      // rien à en faire dans le graphe.
                      if (!type) {
                        return (
                          <span key={value} style={{ fontFamily: 'monospace' }}>
                            {value}
                          </span>
                        );
                      }
                      const already = existingLabels.has(value.trim().toLowerCase());
                      return (
                        <span
                          key={value}
                          data-testid="hermes-suggestion"
                          data-entity-type={type}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '1px 2px 1px 6px',
                            border: '1px solid rgb(var(--cyber-orange-rgb) / 0.45)',
                            borderRadius: 999,
                            background: 'rgb(var(--cyber-orange-rgb) / 0.1)',
                          }}
                        >
                          <span style={{ fontFamily: 'monospace' }}>{value}</span>
                          <button
                            type="button"
                            disabled={already}
                            onClick={() => handleAddSuggestion(value, type)}
                            title={already ? t('analyzer.suggestAdded') : t('analyzer.suggestAdd')}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              padding: '1px 6px',
                              borderRadius: 999,
                              border: '1px solid rgb(var(--cyber-orange-rgb) / 0.5)',
                              background: already
                                ? 'transparent'
                                : 'rgb(var(--cyber-orange-rgb) / 0.2)',
                              color: already ? 'var(--cyber-text-dim)' : 'var(--cyber-orange)',
                              fontSize: 9,
                              fontFamily: 'inherit',
                              cursor: already ? 'default' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <PlusCircle size={9} />
                            {already ? t('analyzer.suggestAdded') : t('analyzer.suggestAdd')}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ color: 'var(--cyber-text-dim)', marginTop: 4 }}>
                    {t('analyzer.unsupportedHint')}
                  </div>
                  {discovery.suggested?.length ? (
                    <div style={{ color: 'var(--cyber-text-dim)', marginTop: 2 }}>
                      {t('analyzer.suggestHint')}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Entities */}
              {newEntities.length > 0 && (
                <div data-testid="hermes-entities" style={{ padding: '10px 16px' }}>
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
                        color: 'var(--cyber-cyan)',
                      }}
                    >
                      {newEntities.length} {t('analyzer.newEntities')}
                    </span>
                    <button
                      onClick={handleInject}
                      style={{
                        padding: '3px 10px',
                        background: 'rgb(var(--cyber-cyan-rgb) / 0.25)',
                        border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.5)',
                        borderRadius: 5,
                        color: 'var(--cyber-cyan)',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.4)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.25)')}
                    >
                      {t('analyzer.injectAll')}
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
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px 6px 10px',
                          background: 'rgb(var(--cyber-panel-rgb) / 0.8)',
                          borderRadius: 6,
                          border: '1px solid rgb(var(--cyber-border-rgb) / 0.6)',
                        }}
                      >
                        {/* Type + label */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              letterSpacing: '0.1em',
                              color: 'var(--cyber-blue)',
                            }}
                          >
                            {e.type}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: 'var(--cyber-text)',
                              wordBreak: 'break-all',
                              lineHeight: 1.4,
                            }}
                          >
                            {e.label}
                          </span>
                          {e.properties?.notes && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--cyber-text-dim)',
                                fontStyle: 'italic',
                                lineHeight: 1.3,
                                marginTop: 2,
                              }}
                            >
                              {e.properties.notes}
                            </span>
                          )}
                        </div>

                        {/* Individual inject button */}
                        <button
                          onClick={() => handleInjectOne(e)}
                          title={t('analyzer.addToGraph')}
                          style={{
                            flexShrink: 0,
                            width: 26,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'rgb(var(--cyber-cyan-rgb) / 0.15)',
                            border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                            borderRadius: 6,
                            color: 'var(--cyber-cyan)',
                            cursor: 'pointer',
                            transition: 'background 0.15s, color 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.35)';
                            e.currentTarget.style.color = 'var(--cyber-cyan)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.15)';
                            e.currentTarget.style.color = 'var(--cyber-cyan)';
                          }}
                        >
                          <PlusCircle size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pages à ouvrir soi-même : aucun appel réseau, aucune donnée
                  inventée. Le pendant honnête de « l'IA devrait trouver ça ». */}
              {checkTargets.length > 0 && (
                <div
                  data-testid="hermes-check-pages"
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid rgb(var(--cyber-cyan-rgb) / 0.2)',
                    background: 'rgb(var(--cyber-panel-rgb) / 0.4)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--cyber-cyan)',
                      marginBottom: 4,
                    }}
                  >
                    {t('analyzer.checkPages')}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--cyber-text-dim)', lineHeight: 1.5, marginBottom: 8 }}>
                    {t('analyzer.checkPagesHint')}
                  </div>
                  {checkTargets.map(({ domain, pages }) => (
                    <div key={domain} style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: 'var(--cyber-text)', fontFamily: 'monospace', marginBottom: 3 }}>
                        {domain}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {pages.map((page) => (
                          <a
                            key={page.url}
                            href={page.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '2px 8px',
                              borderRadius: 5,
                              border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                              background: 'rgb(var(--cyber-cyan-rgb) / 0.1)',
                              color: 'var(--cyber-cyan)',
                              fontSize: 10,
                              textDecoration: 'none',
                              fontFamily: 'monospace',
                            }}
                          >
                            {page.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* FreeLLMAPI config — only in advanced mode */}
      {mode === 'freellm' && (
        keySaved ? (
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--cyber-green)', fontWeight: 600, letterSpacing: '0.02em' }}>
            {t('analyzer.apiKeySaved')}
          </div>
        ) : panelOpen ? (
          <div style={{
            width: '100%',
            background: 'rgb(var(--cyber-dark-rgb) / 0.97)',
            border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.3)',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Key size={12} color="var(--cyber-cyan)" />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cyber-cyan)' }}>
                  {t('analyzer.freeLlmTitle')}
                </span>
              </div>
              {savedKey && (
                <button
                  onClick={() => { setPanelOpen(false); setKeyInput(''); setShowKey(false); }}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cyber-text-dim)', fontSize: 14, lineHeight: 1 }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* OPSEC notice — this mode is a local router, not a local model */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                padding: '8px 10px',
                background: 'rgb(var(--cyber-orange-rgb) / 0.12)',
                border: '1px solid rgb(var(--cyber-orange-rgb) / 0.45)',
                borderRadius: 7,
                color: 'var(--cyber-orange)',
                fontSize: 10,
                lineHeight: 1.55,
              }}
            >
              <span style={{ flex: 1 }}>{t('analyzer.privacyWarning')}</span>
            </div>

            {/* API key */}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                  placeholder={t('analyzer.apiKeyPlaceholder')}
                  autoFocus
                  style={{
                    width: '100%',
                    paddingLeft: 10, paddingRight: 32, paddingTop: 6, paddingBottom: 6,
                    background: 'rgb(var(--cyber-text-rgb) / 0.04)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                    borderRadius: 7,
                    color: 'var(--cyber-text)',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => setShowKey(v => !v)}
                  title={showKey ? t('analyzer.hide') : t('analyzer.show')}
                  style={{ position: 'absolute', right: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--cyber-text-dim)', padding: 0, display: 'flex' }}
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={!keyInput.trim()}
                style={{
                  padding: '6px 12px', borderRadius: 7, flexShrink: 0,
                  background: keyInput.trim() ? 'rgb(var(--cyber-cyan-rgb) / 0.25)' : 'rgb(var(--cyber-border-rgb) / 0.3)',
                  border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.4)',
                  color: keyInput.trim() ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)',
                  fontSize: 11, fontWeight: 700, cursor: keyInput.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {t('analyzer.saveKey')}
              </button>
            </div>

            {/* Base URL */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cyber-text-dim)' }}>
                {t('analyzer.baseUrlTitle')}
              </span>
              <input
                type="text"
                value={baseUrlInput}
                onChange={e => setBaseUrlInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                placeholder={DEFAULT_FREELLM_BASE_URL}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  background: 'rgb(var(--cyber-text-rgb) / 0.04)',
                  border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                  borderRadius: 7,
                  color: 'var(--cyber-text)',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.4 }}>
                {t('analyzer.baseUrlHint')}
              </span>
              {/* The most common misunderstanding: the key and the URL must
                  belong to the same service. A FreeLLMAPI key is useless
                  against a hosted provider, and vice versa. */}
              <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.45 }}>
                {t('analyzer.keyMatchesUrl')}
              </span>
              {/* Only meaningful when the app itself is served from a hosted
                  origin — that is when the router's CORS allowlist blocks us.
                  Deliberately styled as plain info, not a warning: this is a
                  one-time setup, and showing it in alert colours made people
                  believe the mode could never work. */}
              {!isLoopbackOrigin() && (
                <>
                  <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.45 }}>
                    {t('analyzer.originsHint')}
                  </span>
                  {/* The origin to declare, spelled out. The same deployment is
                      often reachable under several domains, and only the one in
                      the address bar counts — declaring the wrong one is the
                      easiest mistake to make and the hardest to see. */}
                  <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.45 }}>
                    {t('analyzer.yourOrigin')}
                  </span>
                  <code
                    style={{
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: 'var(--cyber-cyan)',
                      userSelect: 'all',
                      wordBreak: 'break-all',
                    }}
                  >
                    {typeof window !== 'undefined' ? window.location.origin : ''}
                  </code>
                  {/* Some Chromium forks never surface the prompt: Comet 143
                      refuses the request outright (its console says "unknown
                      address space", not "loopback") and asks nothing. So
                      "answer Allow" is not actionable there — give the manual
                      route, which is a one-time setting and survives restarts. */}
                  <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.45 }}>
                    {t('analyzer.permissionManual')}
                  </span>
                </>
              )}
            </div>

            {/* Explicit, user-initiated probe. On a hosted origin this is the
                only moment Chrome will consider granting local network access:
                a request fired on mount carries no user activation and is
                refused, which used to leave the status dot permanently red. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <button
                onClick={runChecks}
                disabled={checking}
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 7,
                  background: 'rgb(var(--cyber-cyan-rgb) / 0.15)',
                  border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.4)',
                  color: 'var(--cyber-cyan)',
                  fontSize: 10, fontWeight: 700,
                  cursor: checking ? 'wait' : 'pointer',
                  opacity: checking ? 0.6 : 1,
                }}
              >
                <PlugZap size={11} />
                {checking ? t('analyzer.testing') : t('analyzer.testConnection')}
              </button>
              <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.45 }}>
                {t('analyzer.testConnectionHint')}
              </span>
            </div>
            {/* Auto mode — let the router pick and fail over between models */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={autoModel}
                onChange={e => setAutoModel(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--cyber-cyan)', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: autoModel ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)' }}>
                  {t('analyzer.autoModel')}
                </span>
                <span style={{ fontSize: 9, color: 'var(--cyber-text-dim)', lineHeight: 1.4 }}>
                  {t('analyzer.autoModelHint')}
                </span>
              </span>
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: autoModel ? 0.45 : 1 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cyber-text-dim)' }}>
                {t('analyzer.modelTitle')}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={modelInput}
                  onChange={e => setModelInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                  placeholder={DEFAULT_FREELLM_MODEL}
                  disabled={autoModel}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '6px 10px',
                    background: 'rgb(var(--cyber-text-rgb) / 0.04)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                    borderRadius: 7,
                    color: 'var(--cyber-text)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    outline: 'none',
                    boxSizing: 'border-box',
                    cursor: autoModel ? 'not-allowed' : 'text',
                  }}
                />
                <button
                  type="button"
                  onClick={handleLoadModels}
                  disabled={modelsLoading || autoModel}
                  title={t('analyzer.loadModelsHint')}
                  style={{
                    flexShrink: 0,
                    padding: '6px 10px',
                    borderRadius: 7,
                    background: modelsLoading ? 'rgb(var(--cyber-border-rgb) / 0.3)' : 'rgb(var(--cyber-cyan-rgb) / 0.18)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.4)',
                    color: modelsLoading ? 'var(--cyber-text-dim)' : 'var(--cyber-cyan)',
                    fontSize: 10,
                    fontWeight: 700,
                    cursor: modelsLoading ? 'wait' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {modelsLoading ? t('analyzer.loadingModels') : t('analyzer.loadModels')}
                </button>
              </div>

              {models.length > 0 && (
                <select
                  value={models.includes(modelInput) ? modelInput : ''}
                  onChange={e => handlePickModel(e.target.value)}
                  disabled={autoModel}
                  style={{
                    width: '100%',
                    padding: '5px 8px',
                    background: 'rgb(var(--cyber-dark-rgb) / 0.9)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                    borderRadius: 7,
                    color: 'var(--cyber-text)',
                    fontSize: 11,
                    fontFamily: 'monospace',
                    outline: 'none',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">
                    {models.length} {t('analyzer.modelsAvailable')}
                  </option>
                  {models.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}

              {modelsError && (
                <span style={{ fontSize: 9, color: 'var(--cyber-red)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                  {modelsError}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: savedKey ? 'var(--cyber-green)' : 'var(--cyber-orange)' }}>
              {savedKey ? t('analyzer.apiKeyConfigured') : t('analyzer.apiKeyNotConfigured')}
            </span>
            <button
              onClick={() => { setPanelOpen(true); setKeyInput(''); }}
              style={{ fontSize: 10, color: 'var(--cyber-cyan)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              {savedKey ? t('analyzer.edit') : t('analyzer.configure')}
            </button>
          </div>
        )
      )}

      {/* Control bar */}
      {barCollapsed ? (
        <button
          type="button"
          onClick={() => setBarCollapsed(false)}
          title={t('analyzer.restore')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'rgb(var(--cyber-dark-rgb) / 0.95)', border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)', borderRadius: 10, color: 'var(--cyber-cyan)', cursor: 'pointer', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          <Maximize2 size={14} /> {t('analyzer.restore')}
        </button>
      ) : (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgb(var(--cyber-dark-rgb) / 0.95)',
          border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
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
            background: 'rgb(var(--cyber-dark-rgb) / 0.8)',
            borderRadius: 8,
            border: '1px solid rgb(var(--cyber-border-rgb) / 0.6)',
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
              background: mode === 'local' ? 'rgb(var(--cyber-cyan-rgb) / 0.3)' : 'transparent',
              color: mode === 'local' ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)',
            }}
          >
            {statusDot(ollamaStatus)}
            {t('analyzer.local')}
          </button>
          <div style={{ width: 1, height: 20, background: 'rgb(var(--cyber-border-rgb) / 0.6)' }} />
          <button
            onClick={() => setMode('freellm')}
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
              background: mode === 'freellm' ? 'rgb(var(--cyber-cyan-rgb) / 0.3)' : 'transparent',
              color: mode === 'freellm' ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)',
            }}
          >
            {statusDot(freeLlmStatus)}
            {t('analyzer.advanced')}
          </button>
        </div>

        {/* Model selector — only in local mode */}
        {mode === 'local' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={ollamaModel || (RECOMMENDED_MODELS.some(m => m.id === ollamaModel) ? ollamaModel : '__custom__')}
              onChange={(e) => handleModelChange(e.target.value)}
              title="Modèle Ollama pour l'extraction d'entités"
              style={{
                padding: '5px 8px',
                fontSize: 11,
                background: 'rgb(var(--cyber-dark-rgb) / 0.8)',
                border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                borderRadius: 6,
                color: 'var(--cyber-text)',
                outline: 'none',
                cursor: 'pointer',
                maxWidth: 160,
              }}
            >
              <option value="" disabled>Sélectionner un modèle…</option>
              {RECOMMENDED_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
              <option value="__custom__">Personnalisé…</option>
              {ollamaModel && !RECOMMENDED_MODELS.some(m => m.id === ollamaModel) && (
                <option value={ollamaModel}>{ollamaModel}</option>
              )}
            </select>
            {(!ollamaModel || (RECOMMENDED_MODELS.some(m => m.id === ollamaModel) === false && !RECOMMENDED_MODELS.some(m => m.id === ollamaModel))) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCustomModelSave()}
                  placeholder="nom-du-modèle"
                  style={{
                    padding: '5px 8px',
                    fontSize: 11,
                    width: 120,
                    background: 'rgb(var(--cyber-dark-rgb) / 0.8)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.35)',
                    borderRadius: 6,
                    color: 'var(--cyber-text)',
                    outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleCustomModelSave}
                  disabled={!customModel.trim()}
                  style={{
                    padding: '5px 8px',
                    fontSize: 10,
                    fontWeight: 700,
                    background: customModel.trim() ? 'rgb(var(--cyber-cyan-rgb) / 0.25)' : 'rgb(var(--cyber-border-rgb) / 0.3)',
                    border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.4)',
                    borderRadius: 6,
                    color: customModel.trim() ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)',
                    cursor: customModel.trim() ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}
                >OK</button>
              </div>
            )}
          </div>
        )}

        {/* Privacy badge — the advanced mode sends data to third-party providers */}
        {mode === 'freellm' && (
          <span
            title={t('analyzer.privacyWarning')}
            style={{
              padding: '3px 8px',
              background: 'rgb(var(--cyber-orange-rgb) / 0.14)',
              border: '1px solid rgb(var(--cyber-orange-rgb) / 0.45)',
              borderRadius: 6,
              color: 'var(--cyber-orange)',
              fontSize: 10,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              cursor: 'help',
            }}
          >
            {t('analyzer.privacyBadge')}
          </span>
        )}

        {/* Launch button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          title={loading ? t('analyzer.analyzing') : t('analyzer.launch')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            background: loading ? 'rgb(var(--cyber-border-rgb) / 0.4)' : 'rgb(var(--cyber-cyan-rgb) / 0.2)',
            border: '1px solid rgb(var(--cyber-cyan-rgb) / 0.4)',
            borderRadius: 8,
            color: loading ? 'var(--cyber-text-dim)' : 'var(--cyber-cyan)',
            fontSize: 12,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            if (!loading) e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.35)';
          }}
          onMouseLeave={(e) => {
            if (!loading) e.currentTarget.style.background = 'rgb(var(--cyber-cyan-rgb) / 0.2)';
          }}
        >
          {loading ? (
            <>
              <span
                style={{
                  width: 12,
                  height: 12,
                  border: '2px solid rgb(var(--cyber-cyan-rgb) / 0.5)',
                  borderTopColor: 'var(--cyber-cyan)',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.75s linear infinite',
                  flexShrink: 0,
                }}
              />
              {t('analyzer.analyzing')} {elapsed}s{received > 0 ? ` · ${received}c` : ''}
            </>
          ) : (
            <>🧬 {t('analyzer.launch')}</>
          )}
        </button>

        {/* Save */}
        {(discovery || error) && (
          <button
            onClick={handleSave}
            title={t('analyzer.saveReport')}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--cyber-text-dim)', borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cyber-green)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cyber-text-dim)')}
          >
            <Save size={14} />
          </button>
        )}

        {/* Collapse / restore bottom bar */}
        <button
            onClick={() => setBarCollapsed(true)}
            title={t('analyzer.minimize')}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--cyber-text-dim)', borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cyber-cyan)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cyber-text-dim)')}
          >
            <Minimize2 size={14} />
          </button>

        {/* Close */}
        {(discovery || error) && (
          <button
            onClick={() => { setDiscovery(null); setError(null); setMinimized(false); setBarCollapsed(false); }}
            title={t('analyzer.clear')}
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--cyber-text-dim)', fontSize: 14, borderRadius: 6, transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--cyber-red)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--cyber-text-dim)')}
          >
            ✕
          </button>
        )}
      </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
