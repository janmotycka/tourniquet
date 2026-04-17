/**
 * TennisTournamentDetailPage — tenisově-specifický detail turnaje.
 *
 * Zjednodušený proti fotbalovému TournamentDetailPage (tabs, standings, chat
 * apod.). MVP obsahuje:
 *  - Header s názvem, datem, počtem účastníků
 *  - Seznam účastníků
 *  - Seznam zápasů (pokud jsou)
 *  - Share button (QR + link pro rodiče)
 *  - Delete button
 *
 * Pokročilé draw/pavouk/skupiny budou v budoucí iteraci.
 */

import { useState, useEffect, useMemo } from 'react';
import type { Page } from '../../../App';
import { useTournamentStore } from '../../../store/tournament.store';
import { useConfirmStore } from '../../../store/confirm.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n, getDateLocale } from '../../../i18n';
import { PageHeader, OfficialLinkButton } from '../../../components/ui';
import { getTournamentPublicUrl, generateQRCodeDataUrl } from '../../../utils/qr-code';
import { Z } from '../../../utils/z-index';

interface Props { tournamentId: string; navigate: (p: Page) => void; }

export function TennisTournamentDetailPage({ tournamentId, navigate }: Props) {
  const { t, locale } = useI18n();
  const tournaments = useTournamentStore(s => s.tournaments);
  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const ask = useConfirmStore(s => s.ask);
  const showToast = useToastStore(s => s.show);

  const tournament = tournaments.find(tt => tt.id === tournamentId);
  const [showShare, setShowShare] = useState(false);

  const publicUrl = useMemo(() => tournament ? getTournamentPublicUrl(tournament.id) : '', [tournament]);

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ fontSize: 48 }}>❓</div>
        <div style={{ fontWeight: 700 }}>{t('tournament.notFound')}</div>
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          style={{
            padding: '10px 18px', borderRadius: 10, background: 'var(--primary)',
            color: '#fff', fontWeight: 700, border: 'none', cursor: 'pointer',
          }}
        >
          ← {t('common.back')}
        </button>
      </div>
    );
  }

  const handleDelete = async () => {
    const ok = await ask({
      title: t('common.delete'),
      message: t('tennis.tournamentDetail.deleteConfirm', { name: tournament.name }),
      destructive: true,
    });
    if (ok) {
      await deleteTournament(tournament.id);
      showToast('success', t('tennis.tournamentDetail.deleted'));
      navigate({ name: 'tournament-list' });
    }
  };

  const handleStatusChange = async (newStatus: 'draft' | 'active' | 'finished') => {
    await updateTournament(tournament.id, { status: newStatus });
    showToast('success', t('tennis.tournamentDetail.statusChanged'));
  };

  const date = new Date(tournament.settings.startDate + 'T00:00:00').toLocaleDateString(
    getDateLocale(locale),
    { day: 'numeric', month: 'long', year: 'numeric' },
  );

  const finishedMatches = tournament.matches.filter(m => m.status === 'finished').length;
  const totalMatches = tournament.matches.length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 40 }}>
      <PageHeader
        title={tournament.name}
        subtitle={`🎾 ${date} · ${tournament.settings.startTime}`}
        onBack={() => navigate({ name: 'tournament-list' })}
        action={
          <button
            onClick={() => setShowShare(true)}
            aria-label={t('matchShare.title')}
            style={{
              background: 'linear-gradient(135deg, #00695C, #00897B)',
              color: '#fff', fontWeight: 700, fontSize: 12,
              padding: '8px 12px', borderRadius: 10,
              border: 'none', cursor: 'pointer',
            }}
          >
            📡 {t('matchShare.shareBtn')}
          </button>
        }
      />

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Meta card */}
        <div style={{
          background: 'linear-gradient(135deg, #00695C 0%, #00897B 100%)',
          color: '#fff', borderRadius: 16, padding: 16,
          boxShadow: '0 6px 18px rgba(0,137,123,.20)',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 14, fontSize: 13, flexWrap: 'wrap' }}>
            <span>👥 {tournament.teams.length} {t('tennis.tournamentDetail.participants')}</span>
            <span>🎾 {finishedMatches}/{totalMatches} {t('tennis.tournamentDetail.matches')}</span>
            {tournament.settings.venueName && (
              <span>📍 {tournament.settings.venueName}</span>
            )}
          </div>

          {/* Status pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['draft', 'active', 'finished'] as const).map(s => {
              const active = tournament.status === s;
              return (
                <button
                  key={s}
                  onClick={() => { void handleStatusChange(s); }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: active ? '#fff' : 'rgba(255,255,255,.2)',
                    color: active ? '#00695C' : '#fff',
                    border: 'none', cursor: 'pointer', letterSpacing: 0.4,
                    textTransform: 'uppercase',
                  }}
                >
                  {t(`tournament.status${s.charAt(0).toUpperCase() + s.slice(1)}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Official link (ČTenis) */}
        {tournament.settings.officialResultsUrl && (
          <OfficialLinkButton url={tournament.settings.officialResultsUrl} />
        )}

        {/* Participants */}
        <Section title={t('tennis.tournamentDetail.participantsTitle')}>
          {tournament.teams.length === 0 ? (
            <EmptyRow text={t('tennis.tournamentDetail.noParticipants')} />
          ) : (
            tournament.teams.map((team, idx) => (
              <div
                key={team.id ?? idx}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  borderBottom: idx < tournament.teams.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: 15,
                  background: team.color, color: '#fff',
                  fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>{idx + 1}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14 }}>
                  {team.name}
                </span>
                {team.players.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {team.players.length} {t('tennis.club.playersCount')}
                  </span>
                )}
              </div>
            ))
          )}
        </Section>

        {/* Matches */}
        <Section title={t('tennis.tournamentDetail.matchesTitle')}>
          {tournament.matches.length === 0 ? (
            <EmptyRow text={t('tennis.tournamentDetail.noMatches')} />
          ) : (
            tournament.matches.map((m, idx) => {
              const home = tournament.teams.find(tt => tt.id === m.homeTeamId);
              const away = tournament.teams.find(tt => tt.id === m.awayTeamId);
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px',
                    borderBottom: idx < tournament.matches.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                    {home?.name ?? '?'} <span style={{ color: 'var(--text-muted)' }}>vs</span> {away?.name ?? '?'}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 800,
                    color: m.status === 'finished' ? 'var(--text)' : 'var(--text-muted)',
                  }}>
                    {m.status === 'finished' ? `${m.homeScore}:${m.awayScore}` : '—'}
                  </div>
                </div>
              );
            })
          )}
        </Section>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          <button
            onClick={() => { void handleDelete(); }}
            style={{
              padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'transparent', color: 'var(--danger)',
              border: '1.5px solid var(--danger)', cursor: 'pointer',
            }}
          >
            🗑 {t('tennis.tournamentDetail.delete')}
          </button>
        </div>
      </div>

      {showShare && (
        <TennisShareSheet
          url={publicUrl}
          tournamentName={tournament.name}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

// ─── Tennis share sheet (minimalistic) ─────────────────────────────────────
function TennisShareSheet({
  url, tournamentName, onClose,
}: {
  url: string;
  tournamentName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    generateQRCodeDataUrl(url).then(setQr).catch(() => {});
  }, [url]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* */ }
  };

  const handleWhatsApp = () => {
    const msg = `🎾 *${tournamentName}*\n\n${t('tennis.share.whatsappMsg')}\n${url}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.detail,
        background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 480, padding: '0 0 28px',
          maxHeight: '92dvh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '4px 18px 14px',
        }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{t('matchShare.title')}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 10, border: 'none',
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 14,
          }}>✕</button>
        </div>
        <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '14px 0',
          }}>
            <div style={{
              width: 168, height: 168, borderRadius: 14,
              background: '#fff', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 8, boxSizing: 'border-box',
            }}>
              {qr ? <img src={qr} alt="QR" style={{ width: '100%', height: '100%' }} /> : <span>…</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly value={url}
              onFocus={e => e.currentTarget.select()}
              style={{
                flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-var)',
                fontSize: 12, fontFamily: 'monospace',
              }}
            />
            <button onClick={() => { void handleCopy(); }} style={{
              padding: '0 14px', borderRadius: 10, border: 'none',
              background: copied ? 'var(--success)' : 'var(--primary)',
              color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>{copied ? '✓' : '📋'}</button>
          </div>
          <button onClick={handleWhatsApp} style={{
            padding: '12px', borderRadius: 12,
            background: '#25D366', color: '#fff',
            border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 14,
          }}>
            💬 WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{
        fontSize: 12, fontWeight: 800, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px',
      }}>
        {title}
      </h3>
      <div style={{
        background: 'var(--surface)', borderRadius: 12,
        overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
      }}>
        {children}
      </div>
    </div>
  );
}
function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
      {text}
    </div>
  );
}
