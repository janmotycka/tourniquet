import { useState, useMemo } from 'react';
import { useTournamentStore } from '../../store/tournament.store';
import { useSubscriptionStore } from '../../store/subscription.store';
import { computeStandings } from '../../utils/tournament-schedule';
import { FeatureGate } from '../../components/FeatureGate';
import { useI18n } from '../../i18n';
import type { Page } from '../../App';
import type { Tournament } from '../../types/tournament.types';
import { colorSwatch } from '../../utils/team-colors';

interface Props { navigate: (p: Page) => void; }

function getStatusLabels(t: (key: string, params?: Record<string, string | number>) => string): Record<string, { label: string; color: string; bg: string }> {
  return {
    draft:    { label: t('tournament.statusDraft'),    color: '#5D4037', bg: '#FFF3E0' },
    active:   { label: t('tournament.statusActive'),   color: '#1B5E20', bg: '#E8F5E9' },
    finished: { label: t('tournament.statusFinished'), color: '#4A148C', bg: '#F3E5F5' },
  };
}

const PODIUM_EMOJI = ['🥇', '🥈', '🥉'];

function TournamentCard({ t, onClick, isJoined, statusLabels }: { t: Tournament; onClick: () => void; isJoined?: boolean; statusLabels: Record<string, { label: string; color: string; bg: string }> }) {
  const { t: tr } = useI18n();
  const st = statusLabels[t.status];
  const date = new Date(t.settings.startDate).toLocaleDateString('cs-CZ', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const finishedMatches = t.matches.filter(m => m.status === 'finished').length;

  // Pódium pro ukončené turnaje
  const podium = t.status === 'finished'
    ? computeStandings(t.matches, t.teams).slice(0, 3)
    : null;

  return (
    <button onClick={onClick} style={{
      background: 'var(--surface)', borderRadius: 16, padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left',
      boxShadow: '0 1px 4px rgba(0,0,0,.06)', width: '100%', color: 'var(--text)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, paddingRight: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2 }}>{t.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>📅 {date}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <span style={{
            background: st.bg, color: st.color, fontSize: 11, fontWeight: 700,
            padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap',
          }}>{st.label}</span>
          {isJoined && (
            <span style={{
              background: '#E3F2FD', color: '#1565C0', fontSize: 10, fontWeight: 700,
              padding: '2px 8px', borderRadius: 6,
            }}>{tr('tournament.list.shared')}</span>
          )}
        </div>
      </div>

      {/* Pódium pro ukončené turnaje */}
      {podium && podium.length > 0 ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {podium.map((s, idx) => {
            const team = t.teams.find(tm => tm.id === s.teamId);
            return (
              <div key={s.teamId} style={{
                flex: 1, background: 'var(--surface-var)', borderRadius: 10,
                padding: '8px 10px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
              }}>
                <span style={{ fontSize: 18 }}>{PODIUM_EMOJI[idx]}</span>
                {team?.logoBase64 ? (
                  <img src={team.logoBase64} alt={team.name} style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'cover' }} />
                ) : (
                  <div style={colorSwatch(team?.color ?? '#ccc', 14)} />
                )}
                <span style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', color: 'var(--text)', lineHeight: 1.2 }}>
                  {team?.name ?? '?'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.points} b</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{t.teams.length}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>týmů</span>
          </div>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>{t.matches.length}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>zápasů</span>
          </div>
          <div style={{
            background: 'var(--surface-var)', borderRadius: 10, padding: '8px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1,
          }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: finishedMatches > 0 ? '#43A047' : 'var(--text-muted)' }}>
              {finishedMatches}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>odehráno</span>
          </div>
        </div>
      )}

      {/* Progress bar (pouze pro ne-ukončené) */}
      {t.status !== 'finished' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'var(--primary)',
              width: t.matches.length > 0 ? `${(finishedMatches / t.matches.length) * 100}%` : '0%',
              transition: 'width .3s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'right' }}>
            {t.matches.length > 0 ? Math.round((finishedMatches / t.matches.length) * 100) : 0}%
          </span>
        </div>
      )}
    </button>
  );
}

export function TournamentListPage({ navigate }: Props) {
  const { t } = useI18n();
  const tournaments = useTournamentStore(s => s.tournaments);
  const joinedTournaments = useTournamentStore(s => s.joinedTournaments);
  const joinTournament = useTournamentStore(s => s.joinTournament);
  const syncError = useTournamentStore(s => s.syncError);
  const clearSyncError = useTournamentStore(s => s.clearSyncError);
  const getLimits = useSubscriptionStore(s => s.getLimits);
  const limits = getLimits();
  const statusLabels = getStatusLabels(t);

  // Join modal state
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinId, setJoinId] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  // Handle join
  const handleJoin = async () => {
    // Extract tournament ID from pasted URL if needed
    let id = joinId.trim();
    if (id.includes('tournament=')) {
      const match = id.match(/tournament=([^&]+)/);
      if (match) id = match[1];
    }

    if (!id) {
      setJoinError('Zadejte ID turnaje nebo odkaz.');
      return;
    }
    if (!/^\d{6}$/.test(joinPin)) {
      setJoinError('PIN musí být přesně 6 číslic.');
      return;
    }

    setJoining(true);
    setJoinError('');

    try {
      const result = await joinTournament(id, joinPin);
      if (result.success) {
        setShowJoinModal(false);
        setJoinId('');
        setJoinPin('');
        setJoinError('');
        navigate({ name: 'tournament-detail', tournamentId: id });
      } else {
        setJoinError(result.error ?? 'Nepodařilo se připojit.');
      }
    } catch {
      setJoinError('Chyba při připojování k turnaji.');
    } finally {
      setJoining(false);
    }
  };

  // Merge owned + joined tournaments with _isJoined flag
  type MergedTournament = Tournament & { _isJoined: boolean };

  // Řazení: active → draft (nejnovější) → finished (nejnovější)
  // useMemo: přepočítá se jen při změně tournaments nebo joinedTournaments
  const sorted = useMemo<MergedTournament[]>(() => {
    const merged: MergedTournament[] = [
      ...tournaments.map(t => ({ ...t, _isJoined: false })),
      ...joinedTournaments.map(t => ({ ...t, _isJoined: true })),
    ];
    const order: Record<string, number> = { active: 0, draft: 1, finished: 2 };
    return merged.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tournaments, joinedTournaments]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
        borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      }}>
        <button onClick={() => navigate({ name: 'home' })} style={{
          width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
          fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>←</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontWeight: 800, fontSize: 20 }}>🏆 Turnaje</h1>
        </div>
        <button onClick={() => navigate({ name: 'clubs' })} style={{
          background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600, fontSize: 13,
          padding: '8px 12px', borderRadius: 10,
        }}>🏟 Kluby</button>
        <button onClick={() => setShowJoinModal(true)} style={{
          background: '#E3F2FD', color: '#1565C0', fontWeight: 700, fontSize: 14,
          padding: '8px 14px', borderRadius: 10,
        }}>🔗 Připojit se</button>
        <button onClick={() => navigate({ name: 'tournament-create' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>+ Nový</button>
      </div>

      {/* Sync error banner */}
      {syncError && (
        <div style={{
          margin: '12px 20px 0', padding: '12px 16px', borderRadius: 12,
          background: '#FFF3E0', border: '1px solid #FFB74D',
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#E65100' }}>
              Synchronizace selhala
            </div>
            <div style={{ fontSize: 12, color: '#BF360C', marginTop: 4, lineHeight: 1.4 }}>
              {syncError}
            </div>
            <div style={{ fontSize: 11, color: '#E65100', marginTop: 6, lineHeight: 1.4 }}>
              Zkontrolujte Firebase pravidla v konzoli: Database → Rules.<br />
              Cesta <code>/tournaments</code> a <code>/public</code> musí mít povolen zápis pro přihlášené uživatele.
            </div>
          </div>
          <button onClick={clearSyncError} style={{ fontSize: 16, color: '#E65100', padding: 4 }}>✕</button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 20px' }}>
            <div style={{ fontSize: 64 }}>🏆</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>{t('tournament.list.noTournaments')}</h2>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 15, lineHeight: 1.5 }}>
              Vytvořte svůj první turnaj a začněte organizovat zápasy.
            </p>
            <button onClick={() => navigate({ name: 'tournament-create' })} style={{
              background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
              padding: '14px 32px', borderRadius: 14, marginTop: 8,
            }}>
              ➕ Vytvořit turnaj
            </button>
          </div>
        ) : (
          <>
            {sorted.map(t => (
              <TournamentCard
                key={t.id}
                t={t}
                isJoined={t._isJoined}
                statusLabels={statusLabels}
                onClick={() => navigate({ name: 'tournament-detail', tournamentId: t.id })}
              />
            ))}

            <FeatureGate
              currentCount={tournaments.length}
              maxAllowed={limits.maxTournaments}
              featureLabel="turnajů"
              onUpgrade={() => navigate({ name: 'settings' })}
            >
              <button onClick={() => navigate({ name: 'tournament-create' })} style={{
                background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
                padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)', opacity: 0.8,
                marginTop: 4, width: '100%',
              }}>
                ➕ Vytvořit nový turnaj
              </button>
            </FeatureGate>
          </>
        )}
      </div>

      {/* Join Tournament Modal */}
      {showJoinModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={() => setShowJoinModal(false)}>
          <div style={{
            background: 'var(--surface)', borderRadius: 20, padding: 24,
            width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontWeight: 800, fontSize: 18, textAlign: 'center' }}>
              Připojit se k turnaji
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                ID turnaje nebo odkaz
              </label>
              <input
                type="text"
                value={joinId}
                onChange={e => { setJoinId(e.target.value); setJoinError(''); }}
                placeholder={t('tournament.list.joinPlaceholder')}
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 15,
                  border: '1px solid var(--border)', background: 'var(--surface-var)',
                  color: 'var(--text)', outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                PIN (6 číslic)
              </label>
              <input
                type="password"
                value={joinPin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setJoinPin(val);
                  setJoinError('');
                }}
                placeholder="000000"
                maxLength={6}
                inputMode="numeric"
                style={{
                  padding: '10px 14px', borderRadius: 10, fontSize: 15,
                  border: '1px solid var(--border)', background: 'var(--surface-var)',
                  color: 'var(--text)', outline: 'none', letterSpacing: 4,
                }}
              />
            </div>

            {joinError && (
              <div style={{
                background: '#FFF3E0', color: '#E65100', fontSize: 13, fontWeight: 600,
                padding: '8px 12px', borderRadius: 8, textAlign: 'center',
              }}>
                {joinError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={() => {
                  setShowJoinModal(false);
                  setJoinId('');
                  setJoinPin('');
                  setJoinError('');
                }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                  background: 'var(--surface-var)', color: 'var(--text)',
                }}
              >
                Zrušit
              </button>
              <button
                onClick={handleJoin}
                disabled={joining}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                  background: 'var(--primary)', color: '#fff',
                  opacity: joining ? 0.6 : 1, cursor: joining ? 'not-allowed' : 'pointer',
                }}
              >
                {joining ? 'Připojuji...' : 'Připojit se'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
