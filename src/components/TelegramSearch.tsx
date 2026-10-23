import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Send, Search, Loader, ExternalLink, Plus, Check, AlertTriangle,
  Users, Megaphone, UserRound, KeyRound,
} from 'lucide-react';

import { useStore } from '../store/useStore';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { useToast } from './Toast';
import { ENTITY_COLORS } from '../types';
import type { EntityType } from '../types';
import {
  TelegramError,
  entityTypeFor,
  fetchPosts,
  getReaderKey,
  parseTargets,
  resolveMany,
  setReaderKey,
  type TelegramEntityKind,
  type TelegramErrorCode,
  type TelegramPost,
  type TelegramProfile,
} from '../services/telegramService';

/* ------------------------------------------------------------------ *
 * Petits blocs de présentation
 * ------------------------------------------------------------------ */

const KIND_ICON: Record<TelegramEntityKind, React.ElementType> = {
  channel: Megaphone,
  group: Users,
  user: UserRound,
  bot: Send,
  invite: KeyRound,
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/** Pastille de nature (CANAL / GROUPE / COMPTE / BOT / INVITATION). */
function KindBadge({ kind }: { kind: TelegramEntityKind }) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const Icon = KIND_ICON[kind];
  const tone = entityTone(ENTITY_COLORS[entityTypeFor(kind) as EntityType] ?? '#229ed9');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide"
      style={{ color: tone, borderColor: `${tone}55`, background: `${tone}14` }}
    >
      <Icon size={9} />
      {t(`telegram.kind.${kind}`)}
    </span>
  );
}

/** Formate une date ISO en libellé court, sans dépendre de la locale du système. */
function formatPostDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Carte de résultat — profil, canal, groupe, bot
 * ------------------------------------------------------------------ */

function ProfileCard({
  profile,
  injected,
  canInject,
  onInject,
}: {
  profile: TelegramProfile;
  injected: boolean;
  canInject: boolean;
  onInject: (profile: TelegramProfile) => void;
}) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const tone = entityTone(ENTITY_COLORS[entityTypeFor(profile.kind) as EntityType] ?? '#229ed9');
  const Icon = KIND_ICON[profile.kind];

  return (
    <div
      className="rounded-xl border bg-cyber-panel p-3 transition-colors"
      style={{ borderColor: `${tone}33` }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar : la photo publique quand elle existe, sinon l'icône du type */}
        <div
          className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center"
          style={{ background: `${tone}1f`, color: tone }}
        >
          {profile.photoUrl ? (
            <img
              src={profile.photoUrl}
              alt=""
              className="h-full w-full object-cover"
              // Une photo distante peut disparaître : on retombe sur l'icône.
              onError={(event) => {
                (event.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <Icon size={18} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-bold" style={{ color: tone }}>
              {profile.title}
            </span>
            {profile.verified && (
              <span title={t('telegram.verified')} style={{ color: tone }} className="text-[10px]">
                ✔
              </span>
            )}
            <KindBadge kind={profile.kind} />
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-cyber-text-dim">
            {profile.handle && <span>@{profile.handle}</span>}
            {profile.subscribersLabel && <span>{profile.subscribersLabel}</span>}
            {profile.noPublicData && (
              <span className="text-cyber-orange">{t('telegram.noPublicData')}</span>
            )}
          </div>

          {profile.bio && (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-cyber-text/80">
              {profile.bio}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onInject(profile)}
              disabled={injected || !canInject}
              title={!canInject ? t('telegram.needCase') : undefined}
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                color: injected ? 'var(--cyber-green)' : tone,
                borderColor: injected ? 'var(--cyber-green)' : `${tone}66`,
                background: injected ? 'rgb(var(--cyber-green-rgb) / 0.12)' : `${tone}12`,
              }}
            >
              {injected ? <Check size={10} /> : <Plus size={10} />}
              {injected ? t('telegram.added') : t('telegram.addToGraph')}
            </button>
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-lg border border-cyber-border px-2 py-1 text-[10px] font-semibold text-cyber-text-dim transition-colors hover:border-cyber-cyan/40 hover:text-cyber-cyan"
            >
              <ExternalLink size={10} />
              {t('telegram.open')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Composant principal
 * ------------------------------------------------------------------ */

export default function TelegramSearch({ isOpen, onClose }: Props) {
  const { t } = useLanguage();
  const { entityTone } = useTheme();
  const toast = useToast();
  const addEntity = useStore((s) => s.addEntity);
  const onConnect = useStore((s) => s.onConnect);
  const nodes = useStore((s) => s.nodes);
  const activeCaseId = useStore((s) => s.activeCaseId);

  const [tab, setTab] = useState<'profiles' | 'posts'>('profiles');
  const [input, setInput] = useState('');
  const [channel, setChannel] = useState('');
  const [keyword, setKeyword] = useState('');

  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<TelegramProfile[]>([]);
  const [failures, setFailures] = useState<{ input: string; message: string; code: TelegramErrorCode }[]>([]);
  const [posts, setPosts] = useState<TelegramPost[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<TelegramErrorCode | null>(null);
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyValue, setKeyValue] = useState(() => getReaderKey());

  /** Identifiants déjà injectés, pour éviter les doublons involontaires. */
  const [injected, setInjected] = useState<Record<string, boolean>>({});

  const abortRef = useRef<AbortController | null>(null);

  // Annule la requête en cours quand le panneau se ferme : sans cela, une
  // analyse de dix handles continuerait d'interroger le lecteur en arrière-plan
  // et consommerait le quota pour rien.
  useEffect(() => {
    if (!isOpen && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setLoading(false);
    }
  }, [isOpen]);

  const tone = entityTone('#229ed9');

  const targetCount = useMemo(() => parseTargets(input).length, [input]);

  /**
   * Le lecteur a refusé au moins une requête (blocage anonyme, quota, clé
   * invalide). Les échecs par cible ne remontent pas dans `error` : ils vivent
   * dans `failures`, il faut donc regarder les deux pour ouvrir le champ de clé.
   */
  const readerBlocked =
    errorCode === 'reader' || failures.some((failure) => failure.code === 'reader');

  const runProfiles = useCallback(async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setProfiles([]);
    setFailures([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const { results, failures: failed } = await resolveMany(input, controller.signal);
      setProfiles(results);
      setFailures(failed);
      if (results.length === 0 && failed.length === 0) {
        setError(t('telegram.noTarget'));
      }
    } catch (err) {
      setError(err instanceof TelegramError ? err.message : t('telegram.genericError'));
      setErrorCode(err instanceof TelegramError ? err.code : null);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, t]);

  const runPosts = useCallback(async () => {
    if (!channel.trim() || loading) return;
    setLoading(true);
    setError(null);
    setErrorCode(null);
    setPosts([]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await fetchPosts(channel, keyword, controller.signal);
      setPosts(result);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError(err instanceof TelegramError ? err.message : t('telegram.genericError'));
      setErrorCode(err instanceof TelegramError ? err.code : null);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [channel, keyword, loading, t]);

  const injectProfile = useCallback(
    (profile: TelegramProfile) => {
      if (!activeCaseId) {
        toast.warning(t('telegram.needCase'));
        return;
      }
      const type = entityTypeFor(profile.kind);
      const isGroup = type === 'telegram_group';
      const fields: Record<string, string> = {
        handle: profile.handle ? `@${profile.handle}` : '',
        verified: profile.verified ? t('telegram.yes') : '',
        url: profile.url,
      };
      if (isGroup) {
        fields.members = profile.subscribersLabel;
      } else if (type === 'telegram_channel') {
        fields.subscribers = profile.subscribersLabel;
      }

      // La bio va dans `notes`, son emplacement naturel sur la carte (ligne
      // italique). La mettre aussi dans `fields.description` la faisait
      // apparaître deux fois ; la retirer des deux laissait « Aucune note… ».
      addEntity(type, profile.title, {
        notes: profile.bio,
        fields,
        ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {}),
      });
      setInjected((prev) => ({ ...prev, [`${profile.kind}:${profile.handle || profile.url}`]: true }));
      toast.success(t('telegram.injected'), profile.title);
    },
    [activeCaseId, addEntity, t, toast]
  );

  const injectPost = useCallback(
    (post: TelegramPost) => {
      if (!activeCaseId) {
        toast.warning(t('telegram.needCase'));
        return;
      }
      const normalized = channel.replace(/^@/, '').toLowerCase();
      const id = addEntity('note', `Post @${normalized}/${post.id}`, {
        notes: [
          post.text,
          '',
          [post.views, formatPostDate(post.time)].filter(Boolean).join(' · '),
          post.url,
        ]
          .filter(Boolean)
          .join('\n'),
        fields: { url: post.url, source: `@${normalized}` },
      });

      // Rattachement automatique au nœud du canal s'il est déjà sur le graphe :
      // un post orphelin n'apprend rien à l'analyste.
      const channelNode = nodes.find((node) => {
        const fields = (node.data.fields ?? {}) as Record<string, unknown>;
        const handle = String(fields.handle ?? '').replace(/^@/, '').toLowerCase();
        return handle === normalized;
      });
      if (channelNode) {
        onConnect({
          source: channelNode.id,
          sourceHandle: 'right',
          target: id,
          targetHandle: 'left-in',
        });
      }

      setInjected((prev) => ({ ...prev, [`post:${post.id}`]: true }));
      toast.success(
        t('telegram.injected'),
        channelNode ? `@${normalized}/${post.id}` : t('telegram.postOrphan')
      );
    },
    [activeCaseId, addEntity, channel, nodes, onConnect, t, toast]
  );

  if (!isOpen) return null;

  const canInject = !!activeCaseId;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cyber-border bg-cyber-dark shadow-2xl"
        style={{ boxShadow: `0 0 44px ${tone}22` }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-cyber-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${tone}1f`, color: tone }}
            >
              <Send size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-cyber-text">{t('telegram.title')}</h2>
              <p className="mt-0.5 text-[10px] text-cyber-text-dim">{t('telegram.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-cyber-text-dim transition-colors hover:bg-cyber-panel hover:text-cyber-text"
          >
            <X size={14} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex items-center gap-1 border-b border-cyber-border px-5 py-2">
          {(['profiles', 'posts'] as const).map((id) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                tab === id
                  ? 'bg-cyber-cyan/15 text-cyber-cyan'
                  : 'text-cyber-text-dim hover:text-cyber-text'
              }`}
            >
              {id === 'profiles' ? t('telegram.tabProfiles') : t('telegram.tabPosts')}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <div className="space-y-2.5 border-b border-cyber-border px-5 py-3">
          {tab === 'profiles' ? (
            <>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-cyber-text-dim">
                {t('telegram.inputLabel')}
              </label>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void runProfiles();
                  }
                }}
                rows={3}
                placeholder={'@durov\nt.me/telegram\nhttps://t.me/+AbCdEfGhIjK'}
                spellCheck={false}
                className="w-full resize-none rounded-lg border border-cyber-border bg-cyber-panel px-3 py-2 font-mono text-xs text-cyber-text outline-none transition-colors placeholder:text-cyber-text-dim/60 focus:border-cyber-cyan"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-cyber-text-dim">
                  {targetCount > 0 ? t('telegram.targetsFound').replace('{n}', String(targetCount)) : t('telegram.inputHint')}
                </span>
                <button
                  onClick={() => void runProfiles()}
                  disabled={loading || targetCount === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? <Loader size={12} className="animate-spin" /> : <Search size={12} />}
                  {loading ? t('telegram.analyzing') : t('telegram.analyze')}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-cyber-text-dim">
                    {t('telegram.channelLabel')}
                  </label>
                  <input
                    value={channel}
                    onChange={(event) => setChannel(event.target.value)}
                    placeholder="@telegram"
                    spellCheck={false}
                    className="w-full rounded-lg border border-cyber-border bg-cyber-panel px-3 py-2 font-mono text-xs text-cyber-text outline-none transition-colors placeholder:text-cyber-text-dim/60 focus:border-cyber-cyan"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-cyber-text-dim">
                    {t('telegram.keywordLabel')}
                  </label>
                  <input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void runPosts();
                      }
                    }}
                    placeholder={t('telegram.keywordPlaceholder')}
                    spellCheck={false}
                    className="w-full rounded-lg border border-cyber-border bg-cyber-panel px-3 py-2 text-xs text-cyber-text outline-none transition-colors placeholder:text-cyber-text-dim/60 focus:border-cyber-cyan"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] text-cyber-text-dim">{t('telegram.postsHint')}</span>
                <button
                  onClick={() => void runPosts()}
                  disabled={loading || !channel.trim()}
                  className="flex items-center gap-1.5 rounded-lg border border-cyber-cyan/40 bg-cyber-cyan/10 px-3 py-1.5 text-[11px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? <Loader size={12} className="animate-spin" /> : <Search size={12} />}
                  {loading ? t('telegram.searching') : t('telegram.search')}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Résultats */}
        <div className="flex-1 space-y-2 overflow-y-auto px-5 py-3">
          {!canInject && (
            <div className="flex items-start gap-2 rounded-lg border border-cyber-orange/40 bg-cyber-orange/10 px-3 py-2 text-[10px] text-cyber-orange">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{t('telegram.needCase')}</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-cyber-red/40 bg-cyber-red/10 px-3 py-2 text-[11px] text-cyber-red">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {tab === 'profiles' && profiles.length === 0 && failures.length === 0 && !error && !loading && (
            <p className="py-8 text-center text-xs text-cyber-text-dim">{t('telegram.emptyProfiles')}</p>
          )}

          {tab === 'profiles' &&
            profiles.map((profile) => (
              <ProfileCard
                key={`${profile.kind}:${profile.handle || profile.url}`}
                profile={profile}
                injected={!!injected[`${profile.kind}:${profile.handle || profile.url}`]}
                canInject={canInject}
                onInject={injectProfile}
              />
            ))}

          {tab === 'profiles' && failures.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-cyber-text-dim">
                {t('telegram.failures')}
              </p>
              {failures.map((failure) => (
                <div
                  key={failure.input}
                  className="rounded-lg border border-cyber-border bg-cyber-panel/60 px-3 py-2"
                >
                  <p className="font-mono text-[10px] text-cyber-text">{failure.input}</p>
                  <p className="mt-0.5 text-[10px] text-cyber-text-dim">{failure.message}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'posts' && posts.length === 0 && !error && !loading && (
            <p className="py-8 text-center text-xs text-cyber-text-dim">{t('telegram.emptyPosts')}</p>
          )}

          {tab === 'posts' && posts.length > 0 && (
            <p className="text-[10px] text-cyber-text-dim">
              {t('telegram.postsCount').replace('{n}', String(posts.length))}
            </p>
          )}

          {tab === 'posts' &&
            posts.map((post) => {
              const already = !!injected[`post:${post.id}`];
              return (
                <div key={post.id} className="rounded-xl border border-cyber-border bg-cyber-panel p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] text-cyber-text-dim">
                      #{post.id}
                      {post.views ? ` · ${post.views}` : ''}
                      {post.time ? ` · ${formatPostDate(post.time)}` : ''}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => injectPost(post)}
                        disabled={already || !canInject}
                        className="flex items-center gap-1 rounded-lg border border-cyber-cyan/40 px-2 py-1 text-[10px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {already ? <Check size={10} /> : <Plus size={10} />}
                        {already ? t('telegram.added') : t('telegram.addToGraph')}
                      </button>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-cyber-border text-cyber-text-dim transition-colors hover:border-cyber-cyan/40 hover:text-cyber-cyan"
                      >
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-cyber-text/85">{post.text}</p>
                </div>
              );
            })}
        </div>

        {/* Pied — ce que le module ne sait pas faire, puis la clé du lecteur */}
        <div className="border-t border-cyber-border px-5 py-2.5">
          <p className="text-[9px] leading-relaxed text-cyber-text-dim">{t('telegram.footerNote')}</p>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <button
              onClick={() => setKeyOpen((open) => !open)}
              className="flex items-center gap-1 text-[9px] font-semibold text-cyber-text-dim transition-colors hover:text-cyber-cyan"
            >
              <KeyRound size={9} />
              {t('telegram.readerKey')}
              <span
                className="rounded px-1 font-mono text-[8px]"
                style={{
                  color: keyValue ? 'var(--cyber-cyan)' : 'var(--cyber-text-dim)',
                  background: 'rgb(var(--cyber-panel-rgb) / 0.8)',
                }}
              >
                {keyValue ? t('telegram.readerKeySet') : t('telegram.readerKeyUnset')}
              </span>
            </button>
            <a
              href="https://jina.ai/reader"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[9px] text-cyber-text-dim transition-colors hover:text-cyber-cyan"
            >
              {t('telegram.readerKeyGet')} <ExternalLink size={8} />
            </a>
          </div>

          {(keyOpen || readerBlocked) && (
            <div
              className="mt-1.5 rounded-lg border px-2 py-1.5"
              style={{
                borderColor: readerBlocked ? 'rgb(var(--cyber-orange-rgb) / 0.4)' : 'var(--cyber-border)',
                background: 'rgb(var(--cyber-panel-rgb) / 0.5)',
              }}
            >
              <p className="text-[9px] leading-relaxed text-cyber-text-dim">{t('telegram.readerKeyHint')}</p>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="password"
                  value={keyValue}
                  onChange={(event) => setKeyValue(event.target.value)}
                  placeholder={t('telegram.readerKeyPlaceholder')}
                  className="min-w-0 flex-1 rounded-md border border-cyber-border bg-cyber-dark px-2 py-1 font-mono text-[10px] text-cyber-text outline-none focus:border-cyber-cyan/50"
                />
                <button
                  onClick={() => {
                    setReaderKey(keyValue);
                    setError(null);
                    setErrorCode(null);
                    // Les échecs dus au lecteur ne valent plus rien sous la
                    // nouvelle configuration ; ceux qui viennent de Telegram
                    // (handle inexistant, groupe privé) restent affichés.
                    setFailures((previous) => previous.filter((failure) => failure.code !== 'reader'));
                    setKeyOpen(false);
                    toast.success(
                      keyValue.trim() ? t('telegram.readerKeySaved') : t('telegram.readerKeyCleared')
                    );
                  }}
                  className="flex-shrink-0 rounded-md border border-cyber-cyan/40 px-2 py-1 text-[10px] font-semibold text-cyber-cyan transition-colors hover:bg-cyber-cyan/10"
                >
                  {t('telegram.readerKeySave')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
