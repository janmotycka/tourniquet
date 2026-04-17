import { useState, useCallback, useMemo } from 'react';
import type { Tournament, Team, RosterSubmission } from '../../types/tournament.types';
import type { ClubPlayer, AgeCategory } from '../../types/club.types';
import { useI18n } from '../../i18n';
import { useTournamentStore } from '../../store/tournament.store';
import { useContactsStore } from '../../store/contacts.store';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import { submitRoster } from '../../services/roster.firebase';
import { generateId } from '../../utils/id';
import { textOnColor, isLightColor } from '../../utils/team-colors';

interface AdminPlayerRow {
  id: string;
  name: string;
  jerseyNumber: string;
  birthYear: string;
  /** ClubPlayer.id pokud byl hráč importován z klubu (propagates do Tournament.Player.clubPlayerId) */
  clubPlayerId?: string;
}

const ADMIN_BIRTH_MIN = 1950;
const ADMIN_BIRTH_MAX = new Date().getFullYear() - 3;
const CURRENT_YEAR = new Date().getFullYear();

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
  const getClubById = useClubsStore(s => s.getClubById);
  const showToast = useToastStore(s => s.show);

  // Klub, ze kterého lze importovat hráče (tým má clubId a user k němu má přístup)
  const sourceClub = team.clubId ? getClubById(team.clubId) : undefined;
  const [importOpen, setImportOpen] = useState(false);

  const existingRoster = rosterMap[team.id];

  const [coachName, setCoachName] = useState(existingRoster?.coach.name ?? team.coach?.name ?? '');
  const [coachPhone, setCoachPhone] = useState(existingRoster?.coach.phone ?? team.coach?.phone ?? '');
  const [coachEmail, setCoachEmail] = useState(existingRoster?.coach.email ?? team.coach?.email ?? '');
  const [coachOpen, setCoachOpen] = useState(!coachName.trim());

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [addJersey, setAddJersey] = useState('');
  const [addBirthYear, setAddBirthYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const maxBY = tournament.settings.maxBirthYear;
  const birthYearTooOld = maxBY && addBirthYear.length === 4 && parseInt(addBirthYear) < maxBY;
  const usedJerseys = players.filter(p => p.name.trim() && p.jerseyNumber.trim()).map(p => p.jerseyNumber.trim());
  const jerseyDuplicate = addJersey.trim() && usedJerseys.includes(addJersey.trim());
  const canAdd = addName.trim() && addJersey.trim() && addBirthYear.trim() && addBirthYear.length === 4 && !birthYearTooOld && !jerseyDuplicate;
  const addPlayer = useCallback(() => {
    if (!addName.trim() || !addJersey.trim() || !addBirthYear.trim()) return;
    if (birthYearTooOld || jerseyDuplicate) return;
    setPlayers(prev => [...prev, {
      id: generateId(),
      name: addName.trim(),
      jerseyNumber: addJersey.trim(),
      birthYear: addBirthYear.trim(),
    }]);
    setAddName('');
    setAddJersey('');
    setAddBirthYear('');
  }, [addName, addJersey, addBirthYear, birthYearTooOld, jerseyDuplicate]);
  const removePlayer = useCallback((id: string) => {
    setPlayers(prev => prev.filter(p => p.id !== id));
  }, []);
  const updatePlayer = useCallback((id: string, field: keyof AdminPlayerRow, value: string) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  }, []);

  // Bulk import vybraných klubových hráčů do lokálního seznamu soupisky.
  // Deduplikuje dle jméno+rok, jinak generuje nové id.
  const importClubPlayers = useCallback((clubPlayers: ClubPlayer[]) => {
    if (!clubPlayers.length) return;
    setPlayers(prev => {
      const existingKeys = new Set(
        prev
          .filter(p => p.name.trim())
          .map(p => `${p.name.trim().toLowerCase()}|${p.birthYear.trim()}`),
      );
      const usedJerseys = new Set(
        prev.filter(p => p.jerseyNumber.trim()).map(p => p.jerseyNumber.trim()),
      );
      const toAdd: AdminPlayerRow[] = [];
      for (const cp of clubPlayers) {
        const key = `${cp.name.trim().toLowerCase()}|${cp.birthYear ?? ''}`;
        if (existingKeys.has(key)) continue;
        let jersey = cp.jerseyNumber ? String(cp.jerseyNumber) : '';
        if (jersey && usedJerseys.has(jersey)) {
          // Duplicita → necháme prázdné, ať admin doplní ručně
          jersey = '';
        }
        if (jersey) usedJerseys.add(jersey);
        existingKeys.add(key);
        toAdd.push({
          id: generateId(),
          name: cp.name.trim(),
          jerseyNumber: jersey,
          birthYear: cp.birthYear ? String(cp.birthYear) : '',
          clubPlayerId: cp.id,
        });
      }
      if (!toAdd.length) return prev;
      // Zachovej prázdný placeholder řádek (bez jména), pokud je jediný řádek
      const nonEmpty = prev.filter(p => p.name.trim());
      showToast('success', t('roster.importFromClubAdded', { count: toAdd.length }));
      return [...nonEmpty, ...toAdd];
    });
  }, [showToast, t]);

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
          ...(p.clubPlayerId ? { clubPlayerId: p.clubPlayerId } : {}),
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

  const teamColor = team.color || '#666';
  const validCount = players.filter(p => p.name.trim()).length;

  const inp: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 7, border: '1.5px solid var(--border)',
    fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box', outline: 'none',
    WebkitAppearance: 'none', appearance: 'none' as never,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: '0 0 20px', height: '90dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        <div style={{ padding: '4px 14px 0', display: 'flex', flexDirection: 'column', gap: 6, touchAction: 'manipulation', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: teamColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {team.logoBase64 && (
                <img src={team.logoBase64} style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontWeight: 800, fontSize: 15, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {team.name}
              </h2>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {t('roster.adminTitle')} · {validCount} {t('dashboard.players')}
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: 'var(--surface-var)', width: 28, height: 28, borderRadius: 14, border: 'none', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>✕</button>
          </div>

          {/* Coach section - collapsible */}
          <div style={{ background: 'var(--bg)', borderRadius: 10, overflow: 'hidden' }}>
            <div
              onClick={() => setCoachOpen(!coachOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer' }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
                👤 {t('roster.coach')}{coachName.trim() ? ` — ${coachName.trim()}` : ''}
              </span>
              <span style={{ fontSize: 11 }}>
                {coachName.trim() && coachPhone.trim() ? '✅' : '⚠️'}
              </span>
              <span style={{
                fontSize: 11, color: 'var(--text-muted)', transition: 'transform .2s',
                transform: coachOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}>▼</span>
            </div>
            {coachOpen && (
              <div style={{ padding: '0 10px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 1, display: 'block' }}>{t('roster.coachName')} *</label>
                  <input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder={t('roster.coachNamePlaceholder')} style={inp} autoComplete="name" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 1, display: 'block' }}>{t('roster.coachPhone')} *</label>
                  <input type="tel" value={coachPhone} onChange={e => setCoachPhone(e.target.value)} placeholder={t('roster.coachPhonePlaceholder')} style={inp} autoComplete="tel" />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 1, display: 'block' }}>{t('roster.coachEmail')}</label>
                  <input type="email" value={coachEmail} onChange={e => setCoachEmail(e.target.value)} placeholder={t('roster.coachEmailPlaceholder')} style={inp} autoComplete="email" />
                </div>
              </div>
            )}
          </div>

          {/* Players section */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              📋 {t('roster.players')} ({validCount})
            </div>

            {/* Player rows — compact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {players.filter(p => p.name.trim()).map(player => {
                const isEditing = editingId === player.id;

                if (isEditing) {
                  return (
                    <div key={player.id} style={{
                      background: 'var(--primary-light, #E3F2FD)', borderRadius: 8,
                      padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="number" inputMode="numeric"
                          value={player.jerseyNumber}
                          onChange={e => updatePlayer(player.id, 'jerseyNumber', e.target.value.replace(/\D/g, '').slice(0, 2))}
                          style={{ ...inp, width: 40, textAlign: 'center', padding: '5px 2px' }}
                          placeholder="#"
                        />
                        <input
                          value={player.name}
                          onChange={e => updatePlayer(player.id, 'name', e.target.value)}
                          style={{ ...inp, flex: 1, minWidth: 0, padding: '5px 6px' }}
                        />
                        <input
                          type="number" inputMode="numeric"
                          value={player.birthYear}
                          onChange={e => updatePlayer(player.id, 'birthYear', e.target.value.replace(/\D/g, '').slice(0, 4))}
                          style={{ ...inp, width: 54, textAlign: 'center', padding: '5px 2px' }}
                          placeholder={String(CURRENT_YEAR - 10)}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => removePlayer(player.id)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, background: 'var(--danger-light)',
                            color: 'var(--danger)', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                          }}
                        >🗑 {t('common.delete')}</button>
                        <button
                          onClick={() => setEditingId(null)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, background: 'var(--primary)',
                            color: '#fff', fontSize: 11, fontWeight: 600, border: 'none', cursor: 'pointer',
                          }}
                        >✓ {t('common.done')}</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={player.id}
                    onClick={() => setEditingId(player.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 8px', borderRadius: 8,
                      background: 'var(--bg)', cursor: 'pointer',
                    }}
                  >
                    {/* Jersey badge — compact */}
                    <div style={{
                      width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                      background: teamColor, color: textOnColor(teamColor),
                      boxShadow: isLightColor(teamColor) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                      fontWeight: 800, fontSize: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {player.jerseyNumber || '–'}
                    </div>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                    <span style={{ fontSize: 12, color: player.birthYear ? 'var(--text-muted)' : 'var(--border)', flexShrink: 0 }}>
                      {player.birthYear || '—'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>
                  </div>
                );
              })}
            </div>

            {/* Import from club — only if team is linked to a club user has access to */}
            {sourceClub && (sourceClub.players?.length ?? 0) > 0 && (
              <button
                onClick={() => setImportOpen(true)}
                style={{
                  marginTop: 6, width: '100%', padding: '8px 10px', borderRadius: 10,
                  background: 'var(--primary-light, #E3F2FD)', color: 'var(--primary)',
                  border: '1.5px dashed var(--primary)', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', touchAction: 'manipulation',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>{t('roster.importFromClub')}</span>
                <span style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>
                  ({sourceClub.players.length})
                </span>
              </button>
            )}

            {/* Birth year limit info */}
            {maxBY && (
              <div style={{ background: 'var(--warning-light)', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: 'var(--warning)', lineHeight: 1.4, marginTop: 4 }}>
                🎂 {t('roster.birthYearRequirement', { year: String(maxBY) })}
              </div>
            )}

            {/* Add player — compact */}
            <div style={{
              marginTop: 6, borderRadius: 10, overflow: 'hidden',
              border: (birthYearTooOld || jerseyDuplicate) ? '2px solid #C62828' : canAdd ? '2px solid var(--primary)' : '1px solid var(--border)',
              transition: 'border .25s',
            }}>
              <div style={{
                padding: '5px 10px',
                background: (birthYearTooOld || jerseyDuplicate) ? 'var(--danger)' : canAdd ? 'var(--primary)' : teamColor,
                color: (birthYearTooOld || jerseyDuplicate || canAdd) ? '#fff' : textOnColor(teamColor),
                boxShadow: (!birthYearTooOld && !jerseyDuplicate && !canAdd && isLightColor(teamColor)) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                <span style={{ fontSize: 12 }}>👤</span>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{t('roster.addPlayer')}</span>
              </div>
              <div style={{ padding: '6px 8px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={addJersey}
                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 2); setAddJersey(v); }}
                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                    placeholder="#"
                    min={1} max={99}
                    style={{ ...inp, width: 44, textAlign: 'center', padding: '6px 2px', flexShrink: 0, borderColor: jerseyDuplicate ? 'var(--danger)' : 'var(--border)' }}
                  />
                  <input
                    value={addName}
                    onChange={e => setAddName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                    placeholder={t('tournament.create.playerName')}
                    style={{ ...inp, flex: 1, minWidth: 0 }}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    value={addBirthYear}
                    onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setAddBirthYear(v); }}
                    onKeyDown={e => e.key === 'Enter' && addPlayer()}
                    placeholder="Rok"
                    min={ADMIN_BIRTH_MIN} max={ADMIN_BIRTH_MAX}
                    style={{ ...inp, width: 54, textAlign: 'center', padding: '6px 2px', flexShrink: 0, borderColor: birthYearTooOld ? 'var(--danger)' : 'var(--border)' }}
                  />
                </div>
                {jerseyDuplicate && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠️ {t('roster.errorDuplicateJersey')}
                  </div>
                )}
                {birthYearTooOld && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠️ {t('roster.errorBirthYearTooOld', { name: addName.trim() || t('tournament.create.playerName'), year: addBirthYear, limit: String(maxBY) })}
                  </div>
                )}
                <button
                  onClick={addPlayer}
                  disabled={!canAdd}
                  style={{
                    width: '100%', padding: '7px', borderRadius: 7,
                    background: canAdd ? 'var(--primary)' : 'var(--surface-var, #eee)',
                    color: canAdd ? '#fff' : 'var(--text-muted)',
                    border: 'none', fontSize: 12, fontWeight: 700, cursor: canAdd ? 'pointer' : 'default',
                    transition: 'background .2s, color .2s',
                    touchAction: 'manipulation',
                  }}
                >
                  {canAdd ? `+ ${t('roster.addPlayer')}` : t('roster.fillAllFields')}
                </button>
              </div>
            </div>

          </div>

          {/* Player count warning */}
          {(() => {
            const maxPlayers = tournament.settings.maxPlayersPerRoster;
            if (maxPlayers && maxPlayers > 0 && validCount > maxPlayers) {
              return (
                <div style={{ background: 'var(--warning-light)', borderRadius: 10, padding: '7px 10px', fontSize: 12, color: 'var(--warning)' }}>
                  ⚠️ {t('roster.warnTooManyPlayers', { count: validCount, max: maxPlayers })}
                </div>
              );
            }
            return null;
          })()}

        </div>

        {/* Fixed bottom — error + save */}
        <div style={{ padding: '8px 14px 0', flexShrink: 0 }}>
          {error && (
            <div style={{ background: 'var(--danger-light)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>
              ⚠️ {error}
            </div>
          )}
          <button onClick={handleSave} disabled={saving} style={{
            width: '100%', padding: '10px', borderRadius: 10, border: 'none',
            background: saving ? 'var(--border)' : 'var(--primary)', color: saving ? 'var(--text-muted)' : '#fff',
            fontWeight: 800, fontSize: 14, cursor: 'pointer', touchAction: 'manipulation',
          }}>
            {saving ? t('roster.fillRosterSaving') : t('roster.fillRosterTitle')}
          </button>
        </div>
      </div>

      {/* Club import sub-sheet */}
      {importOpen && sourceClub && (
        <ClubImportSheet
          club={sourceClub}
          existingPlayers={players.filter(p => p.name.trim())}
          onClose={() => setImportOpen(false)}
          onConfirm={(picked) => {
            importClubPlayers(picked);
            setImportOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Club Import Sheet ─────────────────────────────────────────────────────
// Interní bottom sheet — ukáže hráče z klubu s checkboxy a (volitelně)
// filtr podle kategorie. Už existující hráči (stejné jméno+rok) jsou šedě
// označeni jako "již v soupisce".
function ClubImportSheet({
  club,
  existingPlayers,
  onClose,
  onConfirm,
}: {
  club: { id: string; name: string; color: string; players: ClubPlayer[]; ageCategories: AgeCategory[] };
  existingPlayers: AdminPlayerRow[];
  onClose: () => void;
  onConfirm: (picked: ClubPlayer[]) => void;
}) {
  const { t } = useI18n();

  const existingKey = useMemo(() => {
    const s = new Set<string>();
    for (const p of existingPlayers) {
      s.add(`${p.name.trim().toLowerCase()}|${p.birthYear.trim()}`);
    }
    return s;
  }, [existingPlayers]);

  // Aktivní hráči klubu, seřazeni podle jména
  const activePlayers = useMemo(
    () => (club.players ?? []).filter(p => p.active !== false),
    [club.players],
  );

  // Kategorie které se skutečně objevují v hráčích
  const categoriesInUse = useMemo(() => {
    const s = new Set<AgeCategory>();
    for (const p of activePlayers) if (p.ageCategory) s.add(p.ageCategory);
    return Array.from(s);
  }, [activePlayers]);

  const [category, setCategory] = useState<AgeCategory | 'ALL'>(
    categoriesInUse.length === 1 ? categoriesInUse[0] : 'ALL',
  );

  const visiblePlayers = useMemo(() => {
    const filtered = category === 'ALL'
      ? activePlayers
      : activePlayers.filter(p => p.ageCategory === category);
    return [...filtered].sort((a, b) => {
      const ja = a.jerseyNumber ?? 999;
      const jb = b.jerseyNumber ?? 999;
      if (ja !== jb) return ja - jb;
      return a.name.localeCompare(b.name);
    });
  }, [activePlayers, category]);

  // Pre-select všichni viditelní hráči, kteří ještě nejsou v soupisce
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const p of activePlayers) {
      const key = `${p.name.trim().toLowerCase()}|${p.birthYear ?? ''}`;
      if (!existingKey.has(key)) init[p.id] = true;
    }
    return init;
  });

  const toggleOne = (id: string) => setSelected(s => ({ ...s, [id]: !s[id] }));

  const allVisibleSelectable = visiblePlayers.filter(p => {
    const key = `${p.name.trim().toLowerCase()}|${p.birthYear ?? ''}`;
    return !existingKey.has(key);
  });
  const allVisibleSelected = allVisibleSelectable.length > 0
    && allVisibleSelectable.every(p => selected[p.id]);

  const toggleAllVisible = () => {
    setSelected(prev => {
      const next = { ...prev };
      if (allVisibleSelected) {
        for (const p of allVisibleSelectable) next[p.id] = false;
      } else {
        for (const p of allVisibleSelectable) next[p.id] = true;
      }
      return next;
    });
  };

  const pickedCount = Object.values(selected).filter(Boolean).length;
  const canConfirm = pickedCount > 0;

  const handleConfirm = () => {
    const picked = activePlayers.filter(p => selected[p.id]);
    onConfirm(picked);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 220,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
          height: '85dvh', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 14px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: club.color || '#666',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('roster.importFromClubTitle')}
            </h3>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {club.name}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'var(--surface-var)', width: 28, height: 28, borderRadius: 14, border: 'none', fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
          >✕</button>
        </div>

        {/* Category tabs */}
        {categoriesInUse.length > 1 && (
          <div style={{ padding: '0 14px 6px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setCategory('ALL')}
              style={{
                padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 700,
                border: '1px solid var(--border)',
                background: category === 'ALL' ? 'var(--primary)' : 'var(--bg)',
                color: category === 'ALL' ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {t('roster.importFromClubAllCategories')}
            </button>
            {categoriesInUse.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 700,
                  border: '1px solid var(--border)',
                  background: category === cat ? 'var(--primary)' : 'var(--bg)',
                  color: category === cat ? '#fff' : 'var(--text)',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Select all / deselect */}
        {allVisibleSelectable.length > 0 && (
          <div style={{ padding: '0 14px 6px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={toggleAllVisible}
              style={{
                padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                background: 'var(--surface-var)', color: 'var(--text)', border: 'none', cursor: 'pointer',
              }}
            >
              {allVisibleSelected ? t('roster.importFromClubDeselectAll') : t('roster.importFromClubSelectAll')}
            </button>
          </div>
        )}

        {/* Player list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 10px', minHeight: 0 }}>
          {visiblePlayers.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 10px' }}>
              {t('roster.importFromClubEmpty')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {visiblePlayers.map(p => {
                const key = `${p.name.trim().toLowerCase()}|${p.birthYear ?? ''}`;
                const alreadyIn = existingKey.has(key);
                const isSelected = !!selected[p.id];
                return (
                  <div
                    key={p.id}
                    onClick={() => !alreadyIn && toggleOne(p.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 8px', borderRadius: 8,
                      background: alreadyIn ? 'var(--surface-var, #eee)' : 'var(--bg)',
                      opacity: alreadyIn ? 0.55 : 1,
                      cursor: alreadyIn ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      readOnly
                      checked={alreadyIn ? true : isSelected}
                      disabled={alreadyIn}
                      style={{ width: 18, height: 18, accentColor: 'var(--primary)', flexShrink: 0, pointerEvents: 'none' }}
                    />
                    <div style={{
                      width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                      background: club.color || '#666', color: textOnColor(club.color || '#666'),
                      boxShadow: isLightColor(club.color || '#666') ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 11,
                    }}>
                      {p.jerseyNumber || '–'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', gap: 6 }}>
                        <span>{p.birthYear ?? '—'}</span>
                        {p.ageCategory && <span>· {p.ageCategory}</span>}
                        {alreadyIn && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>· {t('roster.importFromClubAlreadyIn')}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom confirm */}
        <div style={{ padding: '8px 14px 14px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, border: 'none',
              background: canConfirm ? 'var(--primary)' : 'var(--border)',
              color: canConfirm ? '#fff' : 'var(--text-muted)',
              fontWeight: 800, fontSize: 14,
              cursor: canConfirm ? 'pointer' : 'default',
              touchAction: 'manipulation',
            }}
          >
            {pickedCount === 1
              ? t('roster.importFromClubConfirmOne')
              : t('roster.importFromClubConfirm', { count: pickedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
