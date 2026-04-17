/**
 * TennisIndividualCreateMatchPage — vytvoření zápasu v individuálním módu.
 *
 * Rozdíl proti klubovému TennisCreateMatchPage:
 *  - Žádný výběr klubu (není)
 *  - Výběr „Můj hráč" z MyPlayers seznamu (jeden z mých sledovaných)
 *  - Soupeř jako free text (bez filtru podle klubu)
 *  - Bez Singles/Team volby — individuální mód = vždy singles
 *    (družstvy se zpravidla řeší na úrovni klubu, kterým tenhle uživatel není)
 *  - ČTenis URL pro propojení
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../../App';
import { useI18n } from '../../../i18n';
import { useMyPlayersStore } from '../store/myPlayers.store';
import { useMatchesStore } from '../../../store/matches.store';
import { useToastStore } from '../../../store/toast.store';
import { PageHeader } from '../../../components/ui';
import { generateId } from '../../../utils/id';
import { AGE_CATEGORIES_BY_SPORT, type AgeCategory } from '../../../types/club.types';

interface Props { navigate: (p: Page) => void; }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function TennisIndividualCreateMatchPage({ navigate }: Props) {
  const { t } = useI18n();
  const myPlayers = useMyPlayersStore(s => s.players);
  const createMatch = useMatchesStore(s => s.createMatch);
  const showToast = useToastStore(s => s.show);

  const sortedPlayers = useMemo(
    () => [...myPlayers].sort((a, b) => a.name.localeCompare(b.name)),
    [myPlayers],
  );

  const [myPlayerId, setMyPlayerId] = useState<string>(sortedPlayers[0]?.id ?? '');
  const [opponent, setOpponent] = useState('');
  const [isHome, setIsHome] = useState(true);
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(todayStr());
  const [kickoffTime, setKickoffTime] = useState(nowTimeStr());
  const [competition, setCompetition] = useState('');
  const [ageCategory, setAgeCategory] = useState<AgeCategory | null>(null);
  const [officialResultsUrl, setOfficialResultsUrl] = useState('');

  const selectedPlayer = sortedPlayers.find(p => p.id === myPlayerId);
  const canSave = myPlayerId && opponent.trim().length > 0;

  // Pokud nemáme vybraného hráče, pre-fill kategorii podle jeho
  useMemo(() => {
    if (selectedPlayer?.category && !ageCategory) {
      setAgeCategory(selectedPlayer.category);
    }
  }, [selectedPlayer, ageCategory]);

  const handleCreate = async () => {
    if (!canSave || !selectedPlayer) return;
    try {
      // Singles sub-match s prázdnými sety
      const subMatches = [{
        id: generateId(),
        type: 'singles' as const,
        order: 1,
        homePlayerIds: [],       // individuální mód nepoužívá roster IDs
        awayPlayerName: opponent.trim(),
        sets: [],
        winner: null,
      }];

      const match = await createMatch({
        sport: 'tennis',
        matchType: 'single',
        subMatches,
        officialResultsUrl: officialResultsUrl.trim() || undefined,
        myPlayerId,
        // clubId je required v typu ale pro individuální mód nepoužitý.
        // Ukládáme UID-like placeholder "individual-{myPlayerId}".
        clubId: `individual-${myPlayerId}`,
        clubName: selectedPlayer.name,  // zobrazí se v rozcestníku
        opponent: opponent.trim(),
        isHome,
        venue: venue.trim() || undefined,
        date,
        kickoffTime,
        competition: competition.trim(),
        durationMinutes: 0,
        periods: 1,
        periodDurationMinutes: 0,
        ageCategory: ageCategory ?? undefined,
        lineup: [],
      });

      showToast('success', t('tennisIndividual.create.created'));
      navigate({ name: 'match-detail', matchId: match.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    }
  };

  // Empty state pokud žádný hráč
  if (sortedPlayers.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader
          title={t('tennisIndividual.create.title')}
          onBack={() => navigate({ name: 'match-list' })}
        />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 40, textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 48 }}>👤</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t('tennisIndividual.create.noPlayerTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.5 }}>
            {t('tennisIndividual.create.noPlayerDesc')}
          </div>
          <button
            onClick={() => navigate({ name: 'clubs' })}
            style={{
              padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
              background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)',
              color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            {t('tennisIndividual.create.addPlayerCta')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 100 }}>
      <PageHeader
        title={t('tennisIndividual.create.title')}
        onBack={() => navigate({ name: 'match-list' })}
      />

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Kdo hraje */}
        <Card>
          <Label>{t('tennisIndividual.create.whoPlays')}</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sortedPlayers.map(p => {
              const active = myPlayerId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setMyPlayerId(p.id)}
                  style={{
                    padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                    background: active ? 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)' : 'var(--surface-var)',
                    color: active ? '#fff' : 'var(--text)',
                    border: active ? 'none' : '1.5px solid var(--border)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}
                >
                  <span style={{ fontSize: 18 }}>👤</span>
                  <span style={{ flex: 1 }}>
                    {p.name}
                    {p.category && <span style={{ opacity: 0.75, fontWeight: 400, marginLeft: 6 }}>· {p.category}</span>}
                  </span>
                  {active && <span>✓</span>}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Soupeř */}
        <Card>
          <Label>{t('tennisIndividual.create.opponentTitle')}</Label>
          <input
            type="text"
            value={opponent}
            onChange={e => setOpponent(e.target.value)}
            placeholder={t('tennisIndividual.create.opponentPlaceholder')}
            style={inputStyle}
          />
        </Card>

        {/* Kde */}
        <Card>
          <Label>{t('tennisIndividual.create.whereTitle')}</Label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[
              { v: true, label: `🏠 ${t('tennis.create.home')}` },
              { v: false, label: `✈️ ${t('tennis.create.away')}` },
            ].map(({ v, label }) => (
              <button
                key={String(v)}
                onClick={() => setIsHome(v)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: isHome === v ? 'var(--primary)' : 'var(--surface-var)',
                  color: isHome === v ? '#fff' : 'var(--text-muted)',
                  border: 'none', cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>
          <input
            type="text"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            placeholder={t('tennis.create.venuePlaceholder')}
            style={inputStyle}
          />
        </Card>

        {/* Kdy */}
        <Card>
          <Label>{t('tennis.create.whenTitle')}</Label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.date')}</div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.time')}</div>
              <input type="time" value={kickoffTime} onChange={e => setKickoffTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
        </Card>

        {/* Soutěž + kategorie */}
        <Card>
          <Label>{t('tennis.create.competitionTitle')}</Label>
          <input
            type="text"
            value={competition}
            onChange={e => setCompetition(e.target.value)}
            placeholder={t('tennisIndividual.create.competitionPlaceholder')}
            style={inputStyle}
          />

          <Label style={{ marginTop: 14 }}>{t('tennis.create.category')}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {AGE_CATEGORIES_BY_SPORT.tennis.map(cat => {
              const active = ageCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setAgeCategory(active ? null : cat)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                    background: active ? 'var(--primary)' : 'var(--surface-var)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer',
                  }}
                >{cat}</button>
              );
            })}
          </div>
        </Card>

        {/* ČTenis URL */}
        <Card>
          <Label>🔗 {t('tennis.create.officialUrlTitle')}</Label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            {t('tennis.create.officialUrlDesc')}
          </div>
          <input
            type="url"
            inputMode="url"
            value={officialResultsUrl}
            onChange={e => setOfficialResultsUrl(e.target.value)}
            placeholder="https://cztenis.cz/..."
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
        </Card>

        <button
          disabled={!canSave}
          onClick={() => { void handleCreate(); }}
          style={{
            padding: '16px', borderRadius: 14, fontWeight: 800, fontSize: 15,
            background: canSave
              ? 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 100%)'
              : 'var(--surface-var)',
            color: canSave ? '#fff' : 'var(--text-muted)',
            border: 'none', cursor: canSave ? 'pointer' : 'not-allowed',
            boxShadow: canSave ? '0 4px 16px rgba(74,20,140,.25)' : 'none',
          }}
        >
          🎾 {t('tennisIndividual.create.submit')}
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: 'var(--shadow-sm)',
    }}>
      {children}
    </div>
  );
}
function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: 'var(--text)',
      textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}
const miniLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14,
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
