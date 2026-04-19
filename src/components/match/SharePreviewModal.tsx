/**
 * SharePreviewModal — ukáže náhled share image + text pro WhatsApp.
 *
 * Proč preview místo přímého share?
 * Přímý `navigator.share({ files })` je nespolehlivý — některé prohlížeče /
 * WhatsApp klienti obrázek zahodí, uživatel pak pošle jen text a diví se.
 * Preview modal dává user-ovi kontrolu: vidí obrázek, vidí text, sám si
 * vybere „sdílet", „stáhnout" nebo „kopírovat". Nedá se to pokazit.
 *
 * Typický flow na mobilu:
 *   1. Vidí náhled obrázku + text
 *   2. Klik „Sdílet do WhatsApp" → Web Share API zkusí `{ text, files }`
 *   3. Pokud share sheet obrázek nepodporuje, uživatel klikne dlouhým podržením
 *      na obrázek → Uložit → ručně vloží do WhatsApp
 */

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { Z } from '../../utils/z-index';
import { useToastStore } from '../../store/toast.store';

interface Props {
  imageBlob: Blob;
  textMessage: string;
  fileName: string;
  onClose: () => void;
}

export function SharePreviewModal({ imageBlob, textMessage, fileName, onClose }: Props) {
  const { t } = useI18n();
  const [imageUrl, setImageUrl] = useState<string>('');
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const objectUrlRef = useRef<string | null>(null);

  // Object URL z blobu pro náhled
  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    objectUrlRef.current = url;
    setImageUrl(url);
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [imageBlob]);

  // Detekce Web Share API support pro files
  useEffect(() => {
    const file = new File([imageBlob], fileName, { type: 'image/png' });
    const navAny = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
    };
    setCanShareFiles(!!(navAny.canShare && navAny.canShare({ files: [file] })));
  }, [imageBlob, fileName]);

  // Esc close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleShareSystem = async () => {
    const file = new File([imageBlob], fileName, { type: 'image/png' });
    const navAny = navigator as Navigator & {
      share?: (data: { text?: string; files?: File[] }) => Promise<void>;
    };
    if (!navAny.share) {
      useToastStore.getState().show('error', t('matchShare.shareUnsupported'));
      return;
    }
    try {
      await navAny.share({ text: textMessage, files: canShareFiles ? [file] : undefined });
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === 'AbortError') return; // user cancelled
      useToastStore.getState().show('error', t('matchShare.imageFailed'));
    }
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(imageBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    useToastStore.getState().show('success', t('matchShare.imageDownloaded'));
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(textMessage);
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 2000);
      useToastStore.getState().show('success', t('matchShare.copied'));
    } catch {
      useToastStore.getState().show('error', t('matchShare.copyFailed'));
    }
  };

  const handleWhatsappText = () => {
    // Ne všechny klienty zvládnou share obrázku — tohle je čistě textová varianta,
    // kterou user může zkombinovat s ručně vloženým obrázkem.
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMessage)}`, '_blank');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.detail + 10,
        background: 'rgba(0,0,0,.65)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      role="dialog"
      aria-modal="true"
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 520, padding: '0 0 24px',
          maxHeight: '94dvh', overflowY: 'auto',
          animation: 'slideUp .25s ease',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 18px 14px',
        }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            📷 {t('matchShare.previewTitle')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 18px' }}>
          {/* Image preview */}
          <div style={{
            borderRadius: 14, overflow: 'hidden', marginBottom: 14,
            boxShadow: '0 4px 16px rgba(0,0,0,.15)',
            background: '#000',
          }}>
            {imageUrl && (
              <img
                src={imageUrl}
                alt="Share preview"
                style={{ width: '100%', display: 'block' }}
              />
            )}
          </div>

          {/* Tip */}
          <div style={{
            background: 'var(--primary-light)', borderRadius: 10,
            padding: '10px 12px', marginBottom: 14,
            fontSize: 12, color: 'var(--primary)', fontWeight: 600, lineHeight: 1.45,
          }}>
            💡 {t('matchShare.previewTip')}
          </div>

          {/* Primary CTA: share via system chooser */}
          {'share' in navigator && (
            <button
              onClick={handleShareSystem}
              style={{
                width: '100%', marginBottom: 10,
                padding: '14px', borderRadius: 12,
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontWeight: 800, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 12px rgba(37,211,102,.3)',
              }}
            >
              <span style={{ fontSize: 20 }}>📱</span>
              {canShareFiles
                ? t('matchShare.shareSystem')
                : t('matchShare.shareSystemTextOnly')}
            </button>
          )}

          {/* Secondary actions */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button
              onClick={handleDownload}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12,
                background: 'var(--primary)', color: '#fff',
                border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 18 }}>⬇️</span>
              {t('matchShare.downloadImage')}
            </button>
            <button
              onClick={handleCopyText}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12,
                background: textCopied ? 'var(--success, #22c55e)' : 'var(--surface-var)',
                color: textCopied ? '#fff' : 'var(--text)',
                border: textCopied ? 'none' : '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 18 }}>{textCopied ? '✓' : '📋'}</span>
              {textCopied ? t('matchShare.copied') : t('matchShare.copyText')}
            </button>
            <button
              onClick={handleWhatsappText}
              style={{
                flex: 1, padding: '12px 8px', borderRadius: 12,
                background: 'var(--surface-var)', color: 'var(--text)',
                border: '1px solid var(--border)', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 18 }}>💬</span>
              {t('matchShare.whatsappTextOnly')}
            </button>
          </div>

          {/* Text preview */}
          <details style={{
            background: 'var(--surface-var)', borderRadius: 10,
            padding: '10px 12px', cursor: 'pointer',
          }}>
            <summary style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>
              {t('matchShare.textPreviewLabel')}
            </summary>
            <pre style={{
              marginTop: 10, fontSize: 11, color: 'var(--text)',
              fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {textMessage}
            </pre>
          </details>
        </div>
      </div>
    </div>
  );
}
