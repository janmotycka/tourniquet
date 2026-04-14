/**
 * ShareMatchSheet — bottom sheet pro sdílení zápasu s rodiči.
 * - Velký QR kód
 * - Public URL + kopírovat
 * - WhatsApp, Kopírovat, E-mail
 * - Toggle "Zápas je veřejný"
 */

import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n';
import { Z } from '../../utils/z-index';
import { getMatchPublicUrl, generateMatchQRCodeDataUrl } from '../../utils/qr-code';
import { formatDate } from './match-utils';
import type { SeasonMatch } from '../../types/match.types';
import { useToastStore } from '../../store/toast.store';

interface Props {
  match: SeasonMatch;
  clubDisplayName: string;
  isPublic: boolean;
  onTogglePublic: () => void;
  onClose: () => void;
}

export function ShareMatchSheet({ match, clubDisplayName, isPublic, onTogglePublic, onClose }: Props) {
  const { t } = useI18n();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const url = getMatchPublicUrl(match.id);
  const home = match.isHome ? clubDisplayName : match.opponent;
  const away = match.isHome ? match.opponent : clubDisplayName;
  const dateStr = formatDate(match.date);
  const homeAway = match.isHome ? t('matchShare.home') : t('matchShare.away');

  // Generate QR on open (only when public)
  useEffect(() => {
    let cancelled = false;
    if (!isPublic) { setQrDataUrl(null); return; }
    generateMatchQRCodeDataUrl(match.id)
      .then(u => { if (!cancelled) setQrDataUrl(u); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [match.id, isPublic]);

  // Esc closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const buildWhatsappMessage = () => t('matchShare.whatsappMessage', {
    home,
    away,
    club: clubDisplayName,
    opponent: match.opponent,
    date: dateStr,
    time: match.kickoffTime,
    competition: match.competition,
    homeAway,
    url,
  });

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      useToastStore.getState().show('success', t('matchShare.copied'));
    } catch { /* clipboard not available */ }
  };

  const handleWhatsApp = () => {
    const msg = buildWhatsappMessage();
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleEmail = () => {
    const subject = t('matchShare.emailSubject', { home, away });
    const body = buildWhatsappMessage();
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: Z.detail,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadeIn .2s ease',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-sheet-title"
    >
      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 28px',
          maxHeight: '92dvh', overflowY: 'auto',
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
          <div id="share-sheet-title" style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            {t('matchShare.title')}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '0 18px' }}>
          {/* Public toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: isPublic ? 'var(--primary-light)' : 'var(--surface-var)',
            padding: '12px 14px', borderRadius: 14, marginBottom: 14,
            border: `1px solid ${isPublic ? 'var(--primary-light)' : 'var(--border)'}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700, fontSize: 14,
                color: isPublic ? 'var(--primary)' : 'var(--text)',
              }}>
                {t('matchShare.publicToggle')}
              </div>
              <div style={{
                fontSize: 12, color: isPublic ? 'var(--primary)' : 'var(--text-muted)',
                marginTop: 2, opacity: .9,
              }}>
                {isPublic ? t('matchShare.liveSharing') : t('matchShare.makePublicHint')}
              </div>
            </div>
            <button
              onClick={onTogglePublic}
              aria-pressed={isPublic}
              style={{
                position: 'relative',
                width: 48, height: 28, borderRadius: 14,
                background: isPublic ? 'var(--primary)' : 'var(--border)',
                border: 'none', cursor: 'pointer', flexShrink: 0,
                transition: 'background .18s ease',
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: isPublic ? 23 : 3,
                width: 22, height: 22, borderRadius: '50%',
                background: '#fff',
                transition: 'left .18s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,.2)',
              }} />
            </button>
          </div>

          {isPublic ? (
            <>
              {/* QR code */}
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '16px 0 10px',
              }}>
                <div style={{
                  width: 168, height: 168, borderRadius: 14,
                  background: '#fff', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 8, boxSizing: 'border-box',
                }}>
                  {qrDataUrl ? (
                    <img
                      src={qrDataUrl}
                      alt="QR"
                      style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>…</div>
                  )}
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center',
                }}>
                  {t('matchShare.qrHint')}
                </div>
              </div>

              {/* URL + copy */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  readOnly
                  value={url}
                  onFocus={e => e.currentTarget.select()}
                  style={{
                    flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface-var)',
                    fontSize: 12, color: 'var(--text)', fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={handleCopyLink}
                  aria-label={t('matchShare.copyLink')}
                  style={{
                    padding: '0 14px', borderRadius: 10, border: 'none',
                    background: linkCopied ? 'var(--success, #22c55e)' : 'var(--primary)',
                    color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {linkCopied ? `✓` : `📋`}
                </button>
              </div>

              {/* Share buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button
                  onClick={handleWhatsApp}
                  style={{
                    flex: 1, padding: '12px 8px', borderRadius: 12,
                    background: '#25D366', color: '#fff',
                    border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 13,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>💬</span>
                  WhatsApp
                </button>
                <button
                  onClick={handleCopyLink}
                  style={{
                    flex: 1, padding: '12px 8px', borderRadius: 12,
                    background: 'var(--primary)', color: '#fff',
                    border: 'none', cursor: 'pointer',
                    fontWeight: 700, fontSize: 13,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>🔗</span>
                  {linkCopied ? t('matchShare.copied') : t('matchShare.copyLink')}
                </button>
                <button
                  onClick={handleEmail}
                  style={{
                    flex: 1, padding: '12px 8px', borderRadius: 12,
                    background: 'var(--surface-var)', color: 'var(--text)',
                    border: '1px solid var(--border)', cursor: 'pointer',
                    fontWeight: 700, fontSize: 13,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{ fontSize: 18 }}>✉️</span>
                  {t('matchShare.email')}
                </button>
              </div>

              {/* Info text */}
              <div style={{
                fontSize: 12, color: 'var(--text-muted)',
                background: 'var(--surface-var)', borderRadius: 10,
                padding: '10px 12px', lineHeight: 1.5,
              }}>
                👨‍👩‍👧 {t('matchShare.infoText')}
              </div>
            </>
          ) : (
            <div style={{
              textAlign: 'center', padding: '24px 12px 18px',
              color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.55,
            }}>
              {t('matchShare.makePublicHint')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
