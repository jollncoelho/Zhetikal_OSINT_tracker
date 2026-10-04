import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader, X, Crop, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { supabase } from '../lib/supabase';
import type { EvidenceArtifact } from '../types/investigation';

const LOCAL_ARTIFACTS_KEY = 'zhetikal-investigation-artifacts-v1';
const LOCAL_CASES_KEY = 'zhetikal-investigation-cases-v1';

interface InvestigationCase {
  id: string;
  case_name: string;
  investigating_officer: string;
  agency: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

async function sha512(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function readLocalList<T>(key: string): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function writeLocalList<T>(key: string, value: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

async function captureScreenStream(): Promise<string> {
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 } as MediaTrackConstraints, audio: false });
  try {
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    const width = typeof settings.width === 'number' && settings.width > 0 ? settings.width : 1920;
    const height = typeof settings.height === 'number' && settings.height > 0 ? settings.height : 1080;
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.width = width;
    video.height = height;
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener('loadeddata', () => resolve(), { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || width;
    canvas.height = video.videoHeight || height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
  }
}

type Phase = 'idle' | 'capturing' | 'cropping' | 'saving' | 'done' | 'error';

interface Rect { x: number; y: number; w: number; h: number; }

export default function SnippingTool({ activeCaseId }: { activeCaseId: string | null }) {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [rect, setRect] = useState<Rect | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  const reset = useCallback(() => {
    setPhase('idle');
    setImageDataUrl('');
    setRect(null);
    setErrorMsg('');
    dragRef.current = null;
  }, []);

  const startCapture = useCallback(async () => {
    if (!activeCaseId) {
      setErrorMsg(t('snipping.noCase'));
      setPhase('error');
      return;
    }
    setPhase('capturing');
    setErrorMsg('');
    try {
      const dataUrl = await captureScreenStream();
      if (!dataUrl.startsWith('data:image/')) throw new Error('Invalid capture');
      setImageDataUrl(dataUrl);
      setPhase('cropping');
    } catch (cause) {
      const message = cause instanceof Error && cause.message === 'unsupported' ? t('snipping.unsupported') : t('snipping.error');
      setErrorMsg(message);
      setPhase('error');
    }
  }, [activeCaseId, t]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (phase !== 'cropping' || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    dragRef.current = { startX: event.clientX - bounds.left, startY: event.clientY - bounds.top };
    setRect({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, w: 0, h: 0 });
  }, [phase]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const currentX = event.clientX - bounds.left;
    const currentY = event.clientY - bounds.top;
    const x = Math.min(dragRef.current.startX, currentX);
    const y = Math.min(dragRef.current.startY, currentY);
    const w = Math.abs(currentX - dragRef.current.startX);
    const h = Math.abs(currentY - dragRef.current.startY);
    setRect({ x, y, w, h });
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const cropAndSave = useCallback(async () => {
    if (!imageDataUrl || !activeCaseId) return;
    setPhase('saving');
    try {
      const img = imgRef.current;
      if (!img) throw new Error('Image not loaded');
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;
      const displayedWidth = img.clientWidth;
      const displayedHeight = img.clientHeight;
      const scaleX = naturalWidth / displayedWidth;
      const scaleY = naturalHeight / displayedHeight;
      let cropX = 0, cropY = 0, cropW = naturalWidth, cropH = naturalHeight;
      if (rect && rect.w > 4 && rect.h > 4) {
        cropX = Math.round(rect.x * scaleX);
        cropY = Math.round(rect.y * scaleY);
        cropW = Math.round(rect.w * scaleX);
        cropH = Math.round(rect.h * scaleY);
        cropX = Math.max(0, Math.min(cropX, naturalWidth - 1));
        cropY = Math.max(0, Math.min(cropY, naturalHeight - 1));
        cropW = Math.min(cropW, naturalWidth - cropX);
        cropH = Math.min(cropH, naturalHeight - cropY);
      }
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = naturalWidth;
      sourceCanvas.height = naturalHeight;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (!sourceCtx) throw new Error('Canvas context unavailable');
      await new Promise<void>((resolve, reject) => {
        const tempImg = new Image();
        tempImg.onload = () => { sourceCtx.drawImage(tempImg, 0, 0); resolve(); };
        tempImg.onerror = () => reject(new Error('Image decode failed'));
        tempImg.src = imageDataUrl;
      });
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const croppedCtx = croppedCanvas.getContext('2d');
      if (!croppedCtx) throw new Error('Canvas context unavailable');
      croppedCtx.drawImage(sourceCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const croppedDataUrl = croppedCanvas.toDataURL('image/png');
      const capturedAt = new Date().toISOString();
      const hashInput = `snipping|${activeCaseId}|${croppedDataUrl.length}|${capturedAt}`;
      const hash = await sha512(hashInput);
      const cases = readLocalList<InvestigationCase>(LOCAL_CASES_KEY);
      const activeCase = cases.find((c) => c.id === activeCaseId);
      if (activeCase) {
        const { error: parentError } = await supabase.from('investigation_cases').upsert({
          id: activeCase.id,
          case_name: activeCase.case_name,
          investigating_officer: activeCase.investigating_officer,
          agency: activeCase.agency,
          notes: activeCase.notes,
          created_at: activeCase.created_at,
          updated_at: activeCase.updated_at,
        }, { onConflict: 'id' });
        if (parentError) throw parentError;
      }
      const record = {
        id: crypto.randomUUID(),
        case_id: activeCaseId,
        artifact_type: 'screenshot' as const,
        target_url: 'screen-capture',
        final_url: 'screen-capture',
        title: `Screen capture ${new Date().toLocaleString('fr-FR')}`,
        http_status: null,
        content_type: 'image/png',
        raw_html: '',
        sha512: hash,
        captured_at: capturedAt,
        browser_metadata: { source: 'snipping-tool', crop: `${cropW}x${cropH}` } as Record<string, string | number>,
        meta: {},
        screenshot_preview: croppedDataUrl,
        screenshot_previews: [croppedDataUrl],
        extracted_links: [] as string[],
        notes: '',
        created_at: capturedAt,
      };
      const { data, error: insertError } = await supabase.from('evidence_artifacts').insert(record).select().maybeSingle();
      if (insertError || !data) throw insertError ?? new Error('Evidence could not be saved');
      const savedArtifact = data as EvidenceArtifact;
      const nextArtifacts = [savedArtifact, ...readLocalList<EvidenceArtifact>(LOCAL_ARTIFACTS_KEY)];
      writeLocalList(LOCAL_ARTIFACTS_KEY, nextArtifacts);
      window.dispatchEvent(new CustomEvent('investigation-artifact-added', { detail: { caseId: activeCaseId, artifact: savedArtifact } }));
      setPhase('done');
      setTimeout(() => reset(), 1800);
    } catch (cause) {
      console.error(cause);
      setErrorMsg(t('snipping.error'));
      setPhase('error');
    }
  }, [imageDataUrl, activeCaseId, rect, t, reset]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && (phase === 'cropping' || phase === 'error' || phase === 'done')) reset();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [phase, reset]);

  if (phase === 'idle') {
    return (
      <button
        onClick={startCapture}
        title={t('snipping.title')}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-[11px] font-semibold hover:bg-cyber-cyan/20 transition-colors"
      >
        <Camera size={12} /> {t('snipping.button')}
      </button>
    );
  }

  if (phase === 'capturing') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan text-[11px] font-semibold">
        <Loader size={12} className="animate-spin" /> {t('snipping.capturing')}
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green text-[11px] font-semibold">
        <Check size={12} /> {t('snipping.attached')}
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-semibold max-w-[200px] truncate" title={errorMsg}>
          <AlertCircle size={12} /> {errorMsg}
        </span>
        <button onClick={reset} className="rounded-lg border border-cyber-border px-2 py-1 text-[11px] text-cyber-text-dim hover:text-cyber-text">
          {t('snipping.retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {phase === 'saving' && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-xl border border-cyber-border bg-cyber-dark px-6 py-4 text-sm text-cyber-cyan">
            <Loader size={18} className="animate-spin" /> {t('snipping.capturing')}
          </div>
        </div>
      )}
      {(phase === 'cropping' || phase === 'saving') && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-cyber-cyan">
              <Crop size={14} /> {t('snipping.selectArea')}
            </span>
            <button
              onClick={cropAndSave}
              disabled={phase === 'saving'}
              className="flex items-center gap-1.5 rounded-lg bg-cyber-cyan px-3 py-1.5 text-xs font-semibold text-cyber-black disabled:opacity-60"
            >
              <Check size={13} /> {t('snipping.confirm')}
            </button>
            <button
              onClick={reset}
              disabled={phase === 'saving'}
              className="flex items-center gap-1.5 rounded-lg border border-cyber-border px-3 py-1.5 text-xs text-cyber-text-dim hover:text-cyber-text disabled:opacity-60"
            >
              <X size={13} /> {t('snipping.cancel')}
            </button>
          </div>
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="relative max-h-[80vh] max-w-[90vw] cursor-crosshair select-none overflow-hidden rounded-lg border border-cyber-border"
            style={{ touchAction: 'none' }}
          >
            <img
              ref={imgRef}
              src={imageDataUrl}
              alt="Screen capture"
              className="block max-h-[80vh] max-w-[90vw] object-contain"
              draggable={false}
            />
            {rect && rect.w > 0 && rect.h > 0 && (
              <div
                className="absolute border-2 border-cyber-cyan bg-cyber-cyan/10"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.w,
                  height: rect.h,
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
                }}
              >
                <span className="absolute -top-6 left-0 rounded bg-cyber-cyan px-1.5 py-0.5 text-[10px] font-mono font-semibold text-cyber-black">
                  {Math.round(rect.w)} × {Math.round(rect.h)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
