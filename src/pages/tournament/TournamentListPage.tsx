import { useTournamentStore } from '../../store/tournament.store';
import { computeStandings } from '../../utils/tournament-schedule';
import type { Page } from '../../App';
import type { Tournament } from '../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'Příprava',  color: '#5D4037', bg: '#FFF3E0' },
  active:   { label: 'Probíhá',  color: '#1B5E20', bg: '#E8F5E9' },
  finished: { label: 'Ukončen',  color: '#4A148C', bg: '#F3E5F5' },
};

const PODIUM_EMOJI = ['🥇', '🥈', '🥉'];

function TournamentCard({ t, onClick }: { t: Tournament; onClick: () => void }) {
  const st = STATUS_LABELS[t.status];
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
        <span style={{
          background: st.bg, color: st.color, fontSize: 11, fontWeight: 700,
          padding: '4px 10px', borderRadius: 8, whiteSpace: 'nowrap', flexShrink: 0,
        }}>{st.label}</span>
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
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: team?.color ?? '#ccc' }} />
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
  const tournaments = useTournamentStore(s => s.tournaments);

  // Řazení: active → draft (nejnovější) → finished (nejnovější)
  const sorted = [...tournaments].sort((a, b) => {
    const order = { active: 0, draft: 1, finished: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    // Stejný status: nejnovější první
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

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
        <button onClick={() => navigate({ name: 'tournament-create' })} style={{
          background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 14,
          padding: '8px 16px', borderRadius: 10,
        }}>+ Nový</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sorted.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '60px 20px' }}>
            <div style={{ fontSize: 64 }}>🏆</div>
            <h2 style={{ fontWeight: 800, fontSize: 20, textAlign: 'center' }}>Žádné turnaje</h2>
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
                onClick={() => navigate({ name: 'tournament-detail', tournamentId: t.id })}
              />
            ))}

            <button onClick={() => navigate({ name: 'tournament-create' })} style={{
              background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
              padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)', opacity: 0.8,
              marginTop: 4,
            }}>
              ➕ Vytvořit nový turnaj
            </button>
          </>
        )}
      </div>
    </div>
  );
}
