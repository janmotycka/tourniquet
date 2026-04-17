/**
 * TennisCreateTournamentPage — čistě tenisové vytváření turnaje.
 *
 * Záměrně jednoduchý formulář (MVP). Bez fotbalového Plannera / round-robin
 * matematiky. Trenér zadá:
 *  - Název turnaje
 *  - Typ: Dvouhra / Čtyřhra / Družstva
 *  - Datum a čas začátku
 *  - Věková kategorie (ČTenis: Minitenis–Dospělí)
 *  - Místo konání
 *  - ČTenis link (volitelně)
 *  - Účastníky (minimálně 2 jména/týmy)
 *  - PIN pro rozhodčí
 *
 * Po vytvoření → `tournament-detail`. Draw/pavouk/skupiny se řeší v detailu
 * (navazující iterace).
 */

import { useState } from 'react';
import type { Page } from '../../../App';
import { useTournamentStore } from '../../../store/tournament.store';
import { useToastStore } from '../../../store/toast.store';
import { useI18n } from '../../../i18n';
import { PageHeader } from '../../../components/ui';
import { AGE_CATEGORIES_BY_SPORT, type AgeCategory } from '../../../types/club.types';
import { hashPin, generatePinSalt, markPinVerified } from '../../../utils/pin-hash';
import { TEAM_COLORS } from '../../../utils/team-colors';
import type { TournamentSettings } from '../../../types/tournament.types';

interface Props { navigate: (p: Page) => void; }

type TournamentKind = 'singles' | 'doubles' | 'team';

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function TennisCreateTournamentPage({ navigate }: Props) {
  const { t } = useI18n();
  const createTournament = useTournamentStore(s => s.createTournament);
  const showToast = useToastStore(s => s.show);

  // ─── State ──────────────────────────────────────────────────────────────
  const [kind, setKind] = useState<TournamentKind>('singles');
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [startTime, setStartTime] = useState('09:00');
  const [ageCategory, setAgeCategory] = useState<AgeCategory>('Mladší žactvo');
  const [venueName, setVenueName] = useState('');
  const [officialResultsUrl, setOfficialResultsUrl] = useState('');
  const [participants, setParticipants] = useState<string[]>(['', '']);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');
  const [creating, setCreating] = useState(false);

  const validParticipants = participants.map(p => p.trim()).filter(Boolean);
  const canSave = name.trim().length > 0
    && validParticipants.length >= 2
    && pin.length >= 4
    && pin === pinConfirm;

  const addParticipant = () => setParticipants([...participants, '']);
  const updateParticipant = (idx: number, v: string) => {
    setParticipants(participants.map((p, i) => i === idx ? v : p));
  };
  const removeParticipant = (idx: number) => {
    if (participants.length <= 2) return;
    setParticipants(participants.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!canSave) return;
    if (pin !== pinConfirm) { setPinError(t('tennis.tournamentCreate.pinMatch')); return; }
    setPinError('');
    setCreating(true);
    try {
      const pinSalt = generatePinSalt();
      const pinHash = await hashPin(pin, pinSalt);

      const settings: TournamentSettings = {
        matchDurationMinutes: 60,      // tenis nemá pevnou délku, pole jen placeholder
        breakBetweenMatchesMinutes: 10,
        startTime,
        startDate,
        numberOfPitches: 1,
        format: 'round-robin',          // MVP — bez pokročilých variant
        venueName: venueName.trim() || undefined,
        officialResultsUrl: officialResultsUrl.trim() || undefined,
      };

      // Převést jména účastníků na "týmy" (každý je sólo "tým" s jedním "hráčem")
      const teams = validParticipants.map((name, idx) => ({
        name: name.trim(),
        color: TEAM_COLORS[idx % TEAM_COLORS.length],
        players: kind === 'team'
          ? []  // team championship — hráči se přidají později (nominace)
          : [{ name: name.trim(), jerseyNumber: 1 }],  // singles/doubles — hráč je účastník sám
      }));

      const tournament = await createTournament({
        name: name.trim(),
        sport: 'tennis',
        settings,
        teams,
        pinHash,
        pinSalt,
      });

      // Uchovat věkovou kategorii + typ jako metadata (v budoucí iteraci přidáme
      // TennisTournamentMeta field); pro teď ukládáme do name/description.
      markPinVerified(tournament.id);
      try { sessionStorage.setItem(`torq_just_created_${tournament.id}`, '1'); } catch { /* ignore */ }
      showToast('success', t('tennis.tournamentCreate.created'));
      navigate({ name: 'tournament-detail', tournamentId: tournament.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh', paddingBottom: 40 }}>
      <PageHeader
        title={t('tennis.tournamentCreate.title')}
        onBack={() => navigate({ name: 'tournament-list' })}
      />

      <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Typ turnaje */}
        <Card>
          <Label>{t('tennis.tournamentCreate.kindTitle')}</Label>
          <div style={{ display: 'flex', gap: 8 }}>
            {([
              { k: 'singles' as const, icon: '🎾', label: t('tennis.tournamentCreate.kindSingles') },
              { k: 'doubles' as const, icon: '👥', label: t('tennis.tournamentCreate.kindDoubles') },
              { k: 'team' as const, icon: '🏆', label: t('tennis.tournamentCreate.kindTeam') },
            ]).map(({ k, icon, label }) => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    flex: 1, padding: '14px 6px', borderRadius: 12,
                    background: active ? 'linear-gradient(135deg, #00695C 0%, #00897B 100%)' : 'var(--surface-var)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: active ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    boxShadow: active ? '0 4px 12px rgba(0,137,123,.25)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Název + kategorie */}
        <Card>
          <Label>{t('tennis.tournamentCreate.nameTitle')}</Label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('tennis.tournamentCreate.namePlaceholder')}
            style={inputStyle}
          />

          <Label style={{ marginTop: 14 }}>{t('tennis.create.category')}</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {AGE_CATEGORIES_BY_SPORT.tennis.map(cat => {
              const active = ageCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setAgeCategory(cat)}
                  style={{
                    padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
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
        </Card>

        {/* Kdy + kde */}
        <Card>
          <Label>{t('tennis.create.whenTitle')}</Label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.date')}</div>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={miniLabelStyle}>{t('tennis.create.time')}</div>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <Label style={{ marginTop: 14 }}>{t('tennis.tournamentCreate.venueTitle')}</Label>
          <input
            type="text"
            value={venueName}
            onChange={e => setVenueName(e.target.value)}
            placeholder={t('tennis.tournamentCreate.venuePlaceholder')}
            style={inputStyle}
          />
        </Card>

        {/* Účastníci */}
        <Card>
          <Label>
            {kind === 'team'
              ? t('tennis.tournamentCreate.participantsTeams')
              : t('tennis.tournamentCreate.participantsPlayers')}
          </Label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            {t('tennis.tournamentCreate.participantsHint')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {participants.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{
                  width: 28, textAlign: 'center', fontSize: 12, fontWeight: 700,
                  color: 'var(--text-muted)',
                }}>{idx + 1}.</span>
                <input
                  type="text"
                  value={p}
                  onChange={e => updateParticipant(idx, e.target.value)}
                  placeholder={kind === 'team'
                    ? t('tennis.tournamentCreate.teamPlaceholder')
                    : t('tennis.tournamentCreate.playerPlaceholder')}
                  style={{ ...inputStyle, flex: 1 }}
                />
                {participants.length > 2 && (
                  <button
                    onClick={() => removeParticipant(idx)}
                    aria-label={t('common.delete')}
                    style={{
                      width: 34, height: 34, borderRadius: 8,
                      background: 'var(--danger-light)', color: 'var(--danger)',
                      border: 'none', cursor: 'pointer', fontSize: 14,
                    }}
                  >×</button>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={addParticipant}
            style={{
              marginTop: 8, padding: '10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: 'var(--surface-var)', color: 'var(--primary)',
              border: '1.5px dashed var(--primary)', cursor: 'pointer',
            }}
          >
            + {t('tennis.tournamentCreate.addParticipant')}
          </button>
        </Card>

        {/* ČTenis link */}
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

        {/* PIN */}
        <Card>
          <Label>🔑 {t('tennis.tournamentCreate.pinTitle')}</Label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -4, marginBottom: 8, lineHeight: 1.4 }}>
            {t('tennis.tournamentCreate.pinDesc')}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder={t('tennis.tournamentCreate.pinPlaceholder')}
              style={{ ...inputStyle, flex: 1, letterSpacing: 4, textAlign: 'center' }}
            />
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder={t('tennis.tournamentCreate.pinConfirmPlaceholder')}
              style={{ ...inputStyle, flex: 1, letterSpacing: 4, textAlign: 'center' }}
            />
          </div>
          {pinError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{pinError}</div>
          )}
        </Card>

        {/* Submit */}
        <button
          disabled={!canSave || creating}
          onClick={() => { void handleCreate(); }}
          style={{
            padding: '16px', borderRadius: 14, fontWeight: 800, fontSize: 15,
            background: (canSave && !creating)
              ? 'linear-gradient(135deg, #00695C 0%, #00897B 100%)'
              : 'var(--surface-var)',
            color: (canSave && !creating) ? '#fff' : 'var(--text-muted)',
            border: 'none',
            cursor: (canSave && !creating) ? 'pointer' : 'not-allowed',
            boxShadow: (canSave && !creating) ? '0 4px 16px rgba(0,137,123,.25)' : 'none',
          }}
        >
          {creating ? '…' : `🏆 ${t('tennis.tournamentCreate.submit')}`}
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
      textTransform: 'uppercase', letterSpacing: 0.4,
      marginBottom: 6, ...style,
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
