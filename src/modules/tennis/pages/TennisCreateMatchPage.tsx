/**
 * TennisCreateMatchPage — čistě tenisový formulář pro vytvoření zápasu.
 *
 * Design zcela jiný než fotbalová CreateMatchPage:
 *  - ŽÁDNÉ poločasy, formát X+1, délka poločasu, střídání
 *  - Typ: Dvouhra (singles) vs Soutěž družstev (team) — explicitní volba na začátku
 *  - Pro družstva: formát (4s-2d / 3s-1d / 2s-1d) a automaticky se vygenerují sub-matches
 *  - Pro dvouhru: pouze základní info + jeden sub-match s prázdnými sety
 *  - ČTenis link field na konci (oficiální rozpis)
 */

import { useState, useMemo } from 'react';
import type { Page } from '../../../App';
import { useMatchesStore } from '../../../store/matches.store';
import { useClubsStore } from '../../../store/clubs.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n } from '../../../i18n';
import { PageHeader } from '../../../components/ui';
import { AGE_CATEGORIES_BY_SPORT, type AgeCategory } from '../../../types/club.types';
import { TEAM_MATCH_FORMATS, createDefaultSubMatches } from '../utils/tennis-team';
import { generateId } from '../../../utils/id';
import { OpponentAutocomplete, type CatalogClub } from '../../../components/clubs/OpponentAutocomplete';

interface Props { navigate: (p: Page) => void; }

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowTimeStr(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type MatchKind = 'single' | 'team';

export function TennisCreateMatchPage({ navigate }: Props) {
  const { t } = useI18n();
  const createMatch = useMatchesStore(s => s.createMatch);
  const allClubs = useClubsStore(s => s.clubs);
  const activeClubId = useClubsStore(s => s.activeClubId);
  const showToast = useToastStore(s => s.show);

  // Jen tenisové kluby.
  const tennisClubs = useMemo(
    () => allClubs.filter(c => (c.sport ?? 'football') === 'tennis'),
    [allClubs],
  );
  const selectedClubId = activeClubId ?? tennisClubs[0]?.id ?? '';
  const selectedClub = tennisClubs.find(c => c.id === selectedClubId);
  const clubCategories: AgeCategory[] = selectedClub?.ageCategories ?? [];
  // Fallback: pokud klub nemá zadané kategorie, nabídni všechny tenisové.
  const categoriesForPicker = clubCategories.length > 0
    ? clubCategories
    : AGE_CATEGORIES_BY_SPORT.tennis;

  // ─── Form state ────────────────────────────────────────────────────────────
  const [kind, setKind] = useState<MatchKind>('single');
  const [teamFormatId, setTeamFormatId] = useState<string>('4s-2d');
  const [opponent, setOpponent] = useState('');
  const [opponentCatalogId, setOpponentCatalogId] = useState<string | undefined>();
  const [isHome, setIsHome] = useState(true);
  const [venue, setVenue] = useState('');
  const [date, setDate] = useState(todayStr());
  const [kickoffTime, setKickoffTime] = useState(nowTimeStr());
  const [competition, setCompetition] = useState('');
  const [ageCategory, setAgeCategory] = useState<AgeCategory | null>(null);
  const [officialResultsUrl, setOfficialResultsUrl] = useState('');

  const canSave = opponent.trim().length > 0 && selectedClubId;

  const handleOpponentSelect = (catalog: CatalogClub) => {
    setOpponent(catalog.name);
    setOpponentCatalogId(catalog.id);
  };

  const handleCreate = async () => {
    if (!canSave) return;
    try {
      let subMatches;
      if (kind === 'team') {
        const fmt = TEAM_MATCH_FORMATS.find(f => f.id === teamFormatId) ?? TEAM_MATCH_FORMATS[0];
        subMatches = createDefaultSubMatches(fmt);
      } else {
        // Singles — jeden sub-match s prázdnými sety.
        subMatches = [{
          id: generateId(),
          type: 'singles' as const,
          order: 1,
          homePlayerIds: [],
          awayPlayerName: opponent.trim(),
          sets: [],
          winner: null,
        }];
      }

      const match = await createMatch({
        sport: 'tennis',
        matchType: kind,
        subMatches,
        officialResultsNote: kind === 'team'
          ? 'Výsledky jsou orientační. Oficiální výsledky zveřejněny na ČTenis.'
          : undefined,
        officialResultsUrl: officialResultsUrl.trim() || undefined,
        clubId: selectedClubId,
        clubName: selectedClub?.name,
        opponent: opponent.trim(),
        opponentCatalogId,
        isHome,
        venue: venue.trim() || undefined,
        date,
        kickoffTime,
        competition: competition.trim(),
        durationMinutes: 0,  // tenis nemá pevnou délku
        periods: 1,          // placeholder — tenis to nepoužívá
        periodDurationMinutes: 0,
        ageCategory: ageCategory ?? undefined,
        lineup: [],          // tenis používá homePlayerIds na sub-matchích
      });

      showToast('success', t('tennis.create.created'));
      navigate({ name: 'match-detail', matchId: match.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    }
  };

  if (tennisClubs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <PageHeader
          title={t('tennis.create.title')}
          onBack={() => navigate({ name: 'match-list' })}
        />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 40, textAlign: 'center', gap: 14,
        }}>
          <div style={{ fontSize: 48 }}>🏟</div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{t('tennis.create.noClubTitle')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, lineHeight: 1.5 }}>
            {t('tennis.create.noClubDesc')}
          </div>
          <button
            onClick={() => navigate({ name: 'clubs' })}
            style={{
              padding: '12px 20px', borderRadius: 12, fontWeight: 700, fontSize: 14,
              background: 'var(--primary)', color: '#fff',
              border: 'none', cursor: 'pointer',
            }}
          >
            {t('tennis.create.goToClub')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 100 }}>
      <PageHeader
        title={t('tennis.create.title')}
        onBack={() => navigate({ name: 'match-list' })}
      />

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* ─── Typ zápasu ─── */}
        <Card>
          <Label>{t('tennis.create.typeTitle')}</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['single', 'team'] as const).map(k => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1, padding: '16px 10px', borderRadius: 12,
                    background: active ? 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)' : 'var(--surface-var)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: active ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    boxShadow: active ? '0 4px 12px rgba(21,101,192,.25)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{k === 'single' ? '🎾' : '👥'}</span>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {t(k === 'single' ? 'tennis.create.kindSingle' : 'tennis.create.kindTeam')}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.85, textAlign: 'center', lineHeight: 1.3 }}>
                    {t(k === 'single' ? 'tennis.create.kindSingleDesc' : 'tennis.create.kindTeamDesc')}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Formát týmového zápasu */}
          {kind === 'team' && (
            <>
              <Label style={{ marginTop: 14 }}>{t('tennis.create.teamFormatTitle')}</Label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {TEAM_MATCH_FORMATS.map(fmt => {
                  const active = teamFormatId === fmt.id;
                  return (
                    <button
                      key={fmt.id}
                      onClick={() => setTeamFormatId(fmt.id)}
                      style={{
                        padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                        background: active ? 'var(--primary-light)' : 'var(--surface-var)',
                        color: active ? 'var(--primary)' : 'var(--text)',
                        border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                        fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {fmt.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* ─── Soupeř + kde se hraje ─── */}
        <Card>
          <Label>{t('tennis.create.opponentTitle')}</Label>
          <OpponentAutocomplete
            value={opponent}
            onChange={v => { setOpponent(v); setOpponentCatalogId(undefined); }}
            onSelect={handleOpponentSelect}
            placeholder={t('tennis.create.opponentPlaceholder')}
            sport="tennis"
          />

          <Label style={{ marginTop: 14 }}>{t('tennis.create.whereTitle')}</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: true, label: t('tennis.create.home') },
              { v: false, label: t('tennis.create.away') },
            ].map(({ v, label }) => (
              <button
                key={String(v)}
                onClick={() => setIsHome(v)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: isHome === v ? 'var(--primary)' : 'var(--surface-var)',
                  color: isHome === v ? '#fff' : 'var(--text-muted)',
                  border: isHome === v ? 'none' : '1.5px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <Label style={{ marginTop: 14 }}>{t('tennis.create.venue')}</Label>
          <input
            type="text"
            value={venue}
            onChange={e => setVenue(e.target.value)}
            placeholder={t('tennis.create.venuePlaceholder')}
            style={inputStyle}
          />
        </Card>

        {/* ─── Kdy ─── */}
        <Card>
          <Label>{t('tennis.create.whenTitle')}</Label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.date')}</div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.time')}</div>
              <input
                type="time"
                value={kickoffTime}
                onChange={e => setKickoffTime(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </Card>

        {/* ─── Soutěž + kategorie ─── */}
        <Card>
          <Label>{t('tennis.create.competitionTitle')}</Label>
          <input
            type="text"
            value={competition}
            onChange={e => setCompetition(e.target.value)}
            placeholder={t('tennis.create.competitionPlaceholder')}
            style={inputStyle}
          />

          {categoriesForPicker.length > 0 && (
            <>
              <Label style={{ marginTop: 14 }}>{t('tennis.create.category')}</Label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {categoriesForPicker.map(cat => {
                  const active = ageCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setAgeCategory(active ? null : cat)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: active ? 'var(--primary)' : 'var(--surface-var)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* ─── ČTenis link (optional) ─── */}
        <Card>
          <Label>🔗 {t('tennis.create.officialUrlTitle')}</Label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            {t('tennis.create.officialUrlDesc')}
          </div>
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            value={officialResultsUrl}
            onChange={e => setOfficialResultsUrl(e.target.value)}
            placeholder="https://cztenis.cz/..."
            style={{ ...inputStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
          />
        </Card>

        {/* ─── Submit ─── */}
        <button
          disabled={!canSave}
          onClick={() => { void handleCreate(); }}
          style={{
            padding: '16px', borderRadius: 14, fontWeight: 800, fontSize: 15,
            background: canSave
              ? 'linear-gradient(135deg, #1565C0 0%, #1976D2 100%)'
              : 'var(--surface-var)',
            color: canSave ? '#fff' : 'var(--text-muted)',
            border: 'none',
            cursor: canSave ? 'pointer' : 'not-allowed',
            boxShadow: canSave ? '0 4px 16px rgba(21,101,192,.25)' : 'none',
          }}
        >
          🎾 {t('tennis.create.submit')}
        </button>
      </div>
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────────
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
      textTransform: 'uppercase', letterSpacing: 0.4,
      marginBottom: 6, ...style,
    }}>
      {children}
    </div>
  );
}
const miniLabelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  marginBottom: 4,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid var(--border)', fontSize: 14,
  background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
};
