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
import { useConfirmStore } from '../../store/confirm.store';
import { useMatchesStore } from '../../store/matches.store';
import { useAuth } from '../../context/AuthContext';
import { useClubsStore } from '../../store/clubs.store';
import { generateMatchShareImage } from '../../utils/match-share-image';
import { generateMatchSummaryText } from '../../utils/match-summary';
import { SharePreviewModal } from './SharePreviewModal';

interface Props {
  match: SeasonMatch;
  clubDisplayName: string;
  isPublic: boolean;
  onTogglePublic: () => void;
  onToggleLineupEarly: () => void;
  onClose: () => void;
}

export function ShareMatchSheet({ match, clubDisplayName, isPublic, onTogglePublic, onToggleLineupEarly, onClose }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingData, setPairingData] = useState<{ pin: string; joinUrl: string } | null>(null);
  const [imageSharing, setImageSharing] = useState(false);
  const [previewData, setPreviewData] = useState<{ blob: Blob; text: string; fileName: string } | null>(null);
  const createMatchPairingInvite = useMatchesStore(s => s.createMatchPairingInvite);
  const revokeMatchPairingInvite = useMatchesStore(s => s.revokeMatchPairingInvite);
  const unlinkMatchPairing = useMatchesStore(s => s.unlinkMatchPairing);
  const activeClub = useClubsStore(s => s.clubs.find(c => c.id === match.clubId));
  const locale = (useI18n().locale as 'cs' | 'en' | 'de') ?? 'cs';

  const pairing = match.pairing;
  const isPaired = !!(pairing?.awayCoachUid);
  const hasActiveInvite = !!(pairing?.joinToken && !isPaired);

  const url = getMatchPublicUrl(match.id);
  const home = match.isHome ? clubDisplayName : match.opponent;
  const away = match.isHome ? match.opponent : clubDisplayName;
  const dateStr = formatDate(match.date);
  const homeAway = match.isHome ? t('matchShare.home') : t('matchShare.away');
  // Pokud je místo konání zadané, použijeme ho. Jinak fallback: "Doma" / "Venku".
  const venueForMessage = match.venue?.trim() || homeAway;

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
    venue: venueForMessage,
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

  // ── Open preview modal: image + text, user sám rozhodne jak share ────────
  // Pokud zápas ještě není public, automaticky ho přepneme — trenér chce
  // sdílet, tzn. implicitně chce aby link fungoval. Toggle zůstane viditelný
  // ve ShareMatchSheet, může ho později vypnout.
  const handleOpenSharePreview = async () => {
    if (imageSharing) return;
    setImageSharing(true);
    try {
      // Auto-enable public sharing pokud není
      if (!isPublic) {
        onTogglePublic();
      }
      const blob = await generateMatchShareImage({
        match,
        clubDisplayName,
        lang: locale,
        clubColor: activeClub?.color,
      });
      // Link vždy — po auto-enable bude fungovat.
      const text = generateMatchSummaryText({
        match,
        clubDisplayName,
        publicUrl: url,
      }, locale);
      const fileName = `${home}-${away}-${match.date}.png`.replace(/\s+/g, '_');
      setPreviewData({ blob, text, fileName });
    } catch (err) {
      useToastStore.getState().show('error', t('matchShare.imageFailed'));
       
      console.error('[ShareMatchSheet] generateMatchShareImage failed:', err);
    } finally {
      setImageSharing(false);
    }
  };

  // ─── Cross-team pairing handlers ──────────────────────────────────────────
  const handleGenerateInvite = async () => {
    setPairingBusy(true);
    const invitedBy = user?.displayName || user?.email?.split('@')[0] || 'Trenér';
    const result = await createMatchPairingInvite(match.id, invitedBy);
    setPairingBusy(false);
    if (result) {
      setPairingData(result);
      setPairingOpen(true);
    } else {
      useToastStore.getState().show('error', t('matchPairing.generateFailed'));
    }
  };

  const handleRevokeInvite = async () => {
    setPairingBusy(true);
    await revokeMatchPairingInvite(match.id);
    setPairingBusy(false);
    setPairingData(null);
    useToastStore.getState().show('success', t('matchPairing.inviteRevoked'));
  };

  const handleUnlink = async () => {
    const ok = await useConfirmStore.getState().ask({
      title: t('matchPairing.unlinkButton'),
      message: t('matchPairing.confirmUnlink'),
      destructive: true,
    });
    if (!ok) return;
    setPairingBusy(true);
    await unlinkMatchPairing(match.id);
    setPairingBusy(false);
    useToastStore.getState().show('success', t('matchPairing.unlinked'));
  };

  const handleCopyPairingUrl = async () => {
    if (!pairingData) return;
    try {
      const message = t('matchPairing.whatsappMessage', {
        home, away, date: dateStr, pin: pairingData.pin, url: pairingData.joinUrl,
      });
      await navigator.clipboard.writeText(message);
      useToastStore.getState().show('success', t('matchShare.copied'));
    } catch { /* clipboard not available */ }
  };

  const handleShareWhatsappPairing = () => {
    if (!pairingData) return;
    const msg = t('matchPairing.whatsappMessage', {
      home, away, date: dateStr, pin: pairingData.pin, url: pairingData.joinUrl,
    });
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
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
          {/* ─── Cross-team pairing section ───────────────────────────────── */}
          <div style={{
            background: isPaired ? 'var(--success-light)' : 'var(--primary-light)',
            borderRadius: 14, padding: '12px 14px', marginBottom: 14,
            border: `1px solid ${isPaired ? 'var(--success, #22c55e)' : 'var(--primary)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 20 }}>{isPaired ? '🤝' : '👥'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: isPaired ? 'var(--success, #22c55e)' : 'var(--primary)' }}>
                  {isPaired ? t('matchPairing.pairedTitle') : t('matchPairing.inviteTitle')}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                  {isPaired
                    ? t('matchPairing.pairedWith', { name: pairing?.awayCoachName || t('matchPairing.opposingCoach') })
                    : t('matchPairing.inviteHint')}
                </div>
              </div>
            </div>

            {/* Paired state — action buttons */}
            {isPaired && (
              <button
                onClick={handleUnlink}
                disabled={pairingBusy}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 10,
                  background: 'var(--surface)', color: 'var(--danger)',
                  border: '1px solid var(--danger-light, #fecaca)',
                  fontSize: 12, fontWeight: 700, cursor: pairingBusy ? 'default' : 'pointer',
                  opacity: pairingBusy ? 0.6 : 1,
                }}
              >
                {t('matchPairing.unlinkButton')}
              </button>
            )}

            {/* Invite active — show PIN + URL + share buttons */}
            {!isPaired && (hasActiveInvite || pairingData) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* PIN display — only if we still have it (just generated) */}
                {pairingData && pairingOpen && (
                  <div style={{
                    background: 'var(--surface)', borderRadius: 10, padding: '10px 12px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('matchPairing.pinLabel')}
                      </div>
                      <div style={{ fontWeight: 900, fontSize: 28, color: 'var(--primary)', letterSpacing: 4, fontFamily: 'monospace' }}>
                        {pairingData.pin}
                      </div>
                    </div>
                    <button
                      onClick={() => navigator.clipboard?.writeText(pairingData.pin).then(() => useToastStore.getState().show('success', t('matchShare.copied')))}
                      aria-label={t('matchShare.copyLink')}
                      style={{
                        width: 40, height: 40, borderRadius: 10, border: 'none',
                        background: 'var(--primary)', color: '#fff', cursor: 'pointer',
                        fontSize: 16, flexShrink: 0,
                      }}
                    >
                      📋
                    </button>
                  </div>
                )}
                {hasActiveInvite && !pairingData && (
                  <div style={{
                    background: 'var(--surface)', borderRadius: 10, padding: '10px 12px',
                    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
                  }}>
                    {t('matchPairing.inviteActiveNoPin')}
                  </div>
                )}

                {/* Share buttons — only when we have the URL */}
                {pairingData && pairingOpen && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleShareWhatsappPairing}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 10,
                        background: '#25D366', color: '#fff', border: 'none',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      💬 WhatsApp
                    </button>
                    <button
                      onClick={handleCopyPairingUrl}
                      style={{
                        flex: 1, padding: '10px 8px', borderRadius: 10,
                        background: 'var(--primary)', color: '#fff', border: 'none',
                        fontWeight: 700, fontSize: 13, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}
                    >
                      📋 {t('matchPairing.copyMessage')}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleGenerateInvite}
                    disabled={pairingBusy}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10,
                      background: 'var(--surface)', color: 'var(--primary)',
                      border: '1px solid var(--primary)',
                      fontSize: 12, fontWeight: 700, cursor: pairingBusy ? 'default' : 'pointer',
                      opacity: pairingBusy ? 0.6 : 1,
                    }}
                  >
                    🔄 {t('matchPairing.regeneratePin')}
                  </button>
                  <button
                    onClick={handleRevokeInvite}
                    disabled={pairingBusy}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10,
                      background: 'var(--surface)', color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      fontSize: 12, fontWeight: 700, cursor: pairingBusy ? 'default' : 'pointer',
                      opacity: pairingBusy ? 0.6 : 1,
                    }}
                  >
                    {t('matchPairing.revokeInvite')}
                  </button>
                </div>
              </div>
            )}

            {/* No invite yet — big CTA */}
            {!isPaired && !hasActiveInvite && !pairingData && (
              <button
                onClick={handleGenerateInvite}
                disabled={pairingBusy}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  background: 'var(--primary)', color: '#fff', border: 'none',
                  fontSize: 13, fontWeight: 800, cursor: pairingBusy ? 'default' : 'pointer',
                  opacity: pairingBusy ? 0.6 : 1,
                }}
              >
                {pairingBusy ? t('common.loading') : `📡 ${t('matchPairing.generateButton')}`}
              </button>
            )}
          </div>

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

          {/* Sestava — toggle "zveřejnit hned" (jen pokud je zápas naplánovaný a veřejný) */}
          {isPublic && match.status === 'planned' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 12, marginBottom: 14,
              background: 'var(--surface-var)', border: '1px solid var(--border)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                  {t('matchShare.lineupEarlyToggle')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {(match.lineupVisibility ?? 'atStart') === 'always'
                    ? t('matchShare.lineupEarlyOn')
                    : t('matchShare.lineupEarlyOff')}
                </div>
              </div>
              <button
                onClick={onToggleLineupEarly}
                aria-pressed={(match.lineupVisibility ?? 'atStart') === 'always'}
                style={{
                  position: 'relative',
                  width: 44, height: 24, borderRadius: 12,
                  background: (match.lineupVisibility ?? 'atStart') === 'always' ? 'var(--primary)' : 'var(--border)',
                  border: 'none', cursor: 'pointer', flexShrink: 0,
                  transition: 'background .18s ease',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2,
                  left: (match.lineupVisibility ?? 'atStart') === 'always' ? 22 : 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left .18s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,.2)',
                }} />
              </button>
            </div>
          )}

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

              {/* Primární CTA: otevřít preview modal s obrázkem + textem */}
              <button
                onClick={handleOpenSharePreview}
                disabled={imageSharing}
                style={{
                  width: '100%', marginBottom: 10,
                  padding: '14px', borderRadius: 12,
                  background: imageSharing
                    ? 'var(--surface-var)'
                    : 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                  color: imageSharing ? 'var(--text-muted)' : '#fff',
                  border: 'none', cursor: imageSharing ? 'default' : 'pointer',
                  fontWeight: 800, fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  boxShadow: imageSharing ? 'none' : '0 4px 12px rgba(37,211,102,.3)',
                }}
              >
                <span style={{ fontSize: 20 }}>{imageSharing ? '⏳' : '📷'}</span>
                {imageSharing ? t('matchShare.generatingImage') : t('matchShare.shareAsImage')}
              </button>

              {/* Share buttons — textová/link varianta (pro fallback + desktop) */}
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

      {/* Preview modal — ukáže obrázek + text + tlačítka (sdílet/download/copy) */}
      {previewData && (
        <SharePreviewModal
          imageBlob={previewData.blob}
          textMessage={previewData.text}
          fileName={previewData.fileName}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}
