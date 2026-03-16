import { useState, useCallback } from 'react';
import type { Tournament, Team, RosterSubmission } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { useTournamentStore } from '../../store/tournament.store';
import { useContactsStore } from '../../store/contacts.store';
import { submitRoster } from '../../services/roster.firebase';
import { generateId } from '../../utils/id';

interface AdminPlayerRow { id: string; name: string; jerseyNumber: string; birthYear: string; }

const ADMIN_BIRTH_MIN = 1950;
const ADMIN_BIRTH_MAX = new Date().getFullYear() - 3;

export function AdminRosterSheet({ tournament, team, rosterMap, onClose }: {
  tournament: Tournament;
  team: Team;
  rosterMap: Record<string, RosterSubmission>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const acceptRoster = useTournamentStore(s => s.acceptRoster);
  const firebaseUid = useTournamentStore(s => s.firebaseUid);
  const createOrUpdateContact = useContactsStore(s => s.createOrUpdateContact);

  const existingRoster = rosterMap[team.id];

  const [coachName, setCoachName] = useState(existingRoster?.coach.name ?? team.coach?.name ?? '');
  const [coachPhone, setCoachPhone] = useState(existingRoster?.coach.phone ?? team.coach?.phone ?? '');
  const [coachEmail, setCoachEmail] = useState(existingRoster?.coach.email ?? team.coach?.email ?? '');

  const [players, setPlayers] = useState<AdminPlayerRow[]>(() => {
    if (existingRoster?.players.length) {
      return existingRoster.players.map(p => ({
        id: generateId(), name: p.name,
        jerseyNumber: p.jerseyNumber ? String(p.jerseyNumber) : '',
        birthYear: p.birthYear ? String(p.birthYear) : '',
      }));
    }
    if (team.players.length) {
      return team.players.map(p => ({
        id: generateId(), name: p.name,
        jerseyNumber: p.jerseyNumber ? String(p.jerseyNumber) : '',
        birthYear: p.birthYear ? String(p.birthYear) : '',
      }));
    }
    return [{ id: generateId(), name: '', jerseyNumber: '', birthYear: '' }];
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addPlayer = useCallback(() => {
    setPlayers(prev => [...prev, { id: generateId(), name: '', jerseyNumber: '', birthYear: '' }]);
  }, []);
  const removePlayer = useCallback((id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  }, []);
  const updatePlayer = useCallback((id: string, field: keyof AdminPlayerRow, value: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  const validate = useCallback((): string | null => {
    if (!coachName.trim()) return t('roster.errorCoachName');
    if (!coachPhone.trim()) return t('roster.errorCoachPhone');
    const valid = players.filter(p => p.name.trim());
    if (valid.length === 0) return t('roster.errorNoPlayers');
    for (const p of valid) {
      const j = parseInt(p.jerseyNumber);
      if (p.jerseyNumber.trim() && (isNaN(j) || j < 1 || j > 99)) return t('roster.errorJersey', { name: p.name });
      if (p.birthYear.trim()) {
        const b = parseInt(p.birthYear);
        if (isNaN(b) || b < ADMIN_BIRTH_MIN || b > ADMIN_BIRTH_MAX) return t('roster.errorBirthYear', { name: p.name, min: ADMIN_BIRTH_MIN, max: ADMIN_BIRTH_MAX });
      }
    }
    const jerseys = valid.filter(p => p.jerseyNumber.trim()).map(p => parseInt(p.jerseyNumber));
    if (new Set(jerseys).size !== jerseys.length) return t('roster.errorDuplicateJersey');
    // Birth year age limit
    const maxBirthYear = tournament.settings.maxBirthYear;
    if (maxBirthYear) {
      for (const p of valid) {
        if (p.birthYear.trim()) {
          const b = parseInt(p.birthYear);
          if (!isNaN(b) && b < maxBirthYear) {
            return t('roster.errorBirthYearTooOld', { name: p.name, year: p.birthYear, limit: String(maxBirthYear) });
          }
        }
      }
    }
    return null;
  }, [coachName, coachPhone, players, t, tournament]);

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true);
    setError('');
    try {
      const validPlayers = players.filter(p => p.name.trim());
      const submission: RosterSubmission = {
        coach: { name: coachName.trim(), phone: coachPhone.trim(), email: coachEmail.trim() },
        players: validPlayers.map(p => ({
          name: p.name.trim(),
          jerseyNumber: p.jerseyNumber.trim() ? parseInt(p.jerseyNumber) : 0,
          birthYear: p.birthYear.trim() ? parseInt(p.birthYear) : null,
        })),
        submittedAt: new Date().toISOString(),
        teamId: team.id,
        teamName: team.name,
      };
      await submitRoster(tournament.id, team.id, submission);
      await acceptRoster(tournament.id, team.id, submission);
      if (firebaseUid && submission.coach.phone) {
        createOrUpdateContact(firebaseUid, {
          name: submission.coach.name, phone: submission.coach.phone,
          email: submission.coach.email || undefined,
          clubId: team.clubId ?? null, clubName: team.name,
        }).catch(() => {});
      }
      onClose();
    } catch {
      setError(t('roster.submitError'));
    } finally {
      setSaving(false);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)',
    fontSize: 16, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none',
  };
  const sml: React.CSSProperties = { ...inp, padding: '10px 10px', fontSize: 16, textAlign: 'center' as const };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '0 0 32px', maxHeight: '90dvh', overflowY: 'auto' }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>{t('roster.fillRosterTitle')} — {team.name}</h2>
            <button onClick={onClose} aria-label="Close" style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, border: 'none', fontSize: 16, color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
          </div>

          {/* Coach section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>👤 {t('roster.coach')}</h3>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('roster.coachName')} *</label>
              <input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder={t('roster.coachNamePlaceholder')} style={inp} autoComplete="name" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('roster.coachPhone')} *</label>
              <input type="tel" value={coachPhone} onChange={e => setCoachPhone(e.target.value)} placeholder={t('roster.coachPhonePlaceholder')} style={inp} autoComplete="tel" />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{t('roster.coachEmail')}</label>
              <input type="email" value={coachEmail} onChange={e => setCoachEmail(e.target.value)} placeholder={t('roster.coachEmailPlaceholder')} style={inp} autoComplete="email" />
            </div>
          </div>

          {/* Players section */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>⚽ {t('roster.players')} ({players.filter(p => p.name.trim()).length})</h3>
              <button onClick={addPlayer} style={{ background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 13, padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                + {t('roster.addPlayer')}
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 64px 28px', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>{t('tournament.create.jerseyNo')}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{t('tournament.create.playerName')}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textAlign: 'center' }}>{t('tournament.create.birthYear')}</span>
              <span />
            </div>

            {players.map(player => (
              <div key={player.id} style={{ display: 'grid', gridTemplateColumns: '48px 1fr 64px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input type="number" inputMode="numeric" value={player.jerseyNumber} onChange={e => updatePlayer(player.id, 'jerseyNumber', e.target.value)} placeholder="#" style={{ ...sml, width: '100%' }} min={1} max={99} />
                <input type="text" value={player.name} onChange={e => updatePlayer(player.id, 'name', e.target.value)} placeholder={`${t('tournament.create.playerName')}…`} style={{ ...inp, padding: '10px 10px', fontSize: 16 }} />
                <input type="number" inputMode="numeric" value={player.birthYear} onChange={e => updatePlayer(player.id, 'birthYear', e.target.value)} placeholder={String(new Date().getFullYear() - 10)} style={{ ...sml, width: '100%' }} />
                {players.length > 1 ? (
                  <button onClick={() => removePlayer(player.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#999', padding: 0, lineHeight: 1 }} title={t('common.remove')}>✕</button>
                ) : <span />}
              </div>
            ))}

            <button onClick={addPlayer} style={{ width: '100%', padding: '10px', background: 'var(--bg)', border: '1.5px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer', marginTop: 4 }}>
              + {t('roster.addPlayer')}
            </button>
          </div>

          {/* Player count warning */}
          {(() => {
            const maxPlayers = tournament.settings.maxPlayersPerRoster;
            const validCount = players.filter(p => p.name.trim()).length;
            if (maxPlayers && maxPlayers > 0 && validCount > maxPlayers) {
              return (
                <div style={{ background: '#FFF3E0', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#E65100' }}>
                  ⚠️ {t('roster.warnTooManyPlayers', { count: validCount, max: maxPlayers })}
                </div>
              );
            }
            return null;
          })()}

          {/* Error */}
          {error && (
            <div style={{ background: '#FFEBEE', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: '#C62828' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Save button */}
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: saving ? 'var(--border)' : 'var(--primary)', color: saving ? 'var(--text-muted)' : '#fff',
            fontWeight: 800, fontSize: 16, cursor: 'pointer',
          }}>
            {saving ? t('roster.fillRosterSaving') : t('roster.fillRosterTitle')}
          </button>
        </div>
      </div>
    </div>
  );
}
