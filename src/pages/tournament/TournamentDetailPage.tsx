import { useState, useEffect, useCallback } from 'react';
import type { Page } from '../../App';
import { useTournamentStore } from '../../store/tournament.store';
import { verifyPin, markPinVerified, isPinVerified } from '../../utils/pin-hash';
import { computeStandings, formatMatchTime, computeMatchElapsed, computeCurrentMinute } from '../../utils/tournament-schedule';
import { getTournamentPublicUrl, getAdminInviteUrl, generateQRCodeDataUrl } from '../../utils/qr-code';
import { exportTournamentPdf } from '../../utils/tournament-pdf';
import type { Tournament, Match, Team, Player, Goal, Standing, TiebreakerCriterion, PenaltyResult } from '../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../types/tournament.types';
import { useI18n } from '../../i18n';
import { logger } from '../../utils/logger';
import { colorSwatch, textOnColor, isLightColor, isNearWhite } from '../../utils/team-colors';
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props { tournamentId: string; navigate: (p: Page) => void; }

type Tab = 'standings' | 'matches' | 'scorers' | 'settings';

// ─── Team logo/color badge ─────────────────────────────────────────────────────
function TeamBadge({ team, size = 12 }: { team?: Team; size?: number }) {
  if (team?.logoBase64) {
    return <img src={team.logoBase64} alt={team.name} style={{ width: size, height: size, borderRadius: size / 3, objectFit: 'cover', flexShrink: 0 }} />;
  }
  return <div style={colorSwatch(team?.color ?? '#ccc', size)} />;
}

// ─── Roster modal ─────────────────────────────────────────────────────────────
function RosterModal({ tournament, teamId, onClose, readOnly = false, onAddPlayer, onRemovePlayer, onUpdatePlayer, onUpdateTeamName }: {
  tournament: Tournament;
  teamId: string;
  onClose: () => void;
  readOnly?: boolean;
  onAddPlayer?: (teamId: string, p: { name: string; jerseyNumber: number; birthYear: number | null }) => void;
  onRemovePlayer?: (teamId: string, playerId: string) => void;
  onUpdatePlayer?: (teamId: string, playerId: string, updates: { name?: string; jerseyNumber?: number; birthYear?: number | null }) => void;
  onUpdateTeamName?: (teamId: string, name: string) => void;
}) {
  const { t } = useI18n();
  const team = tournament.teams.find(tm => tm.id === teamId);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Název týmu
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameDraft, setTeamNameDraft] = useState('');
  // Nový hráč
  const [newName, setNewName] = useState('');
  const [newJersey, setNewJersey] = useState('');
  const [newBirth, setNewBirth] = useState('');
  const [addError, setAddError] = useState('');
  // Inline edit stav
  const [editName, setEditName] = useState('');
  const [editJersey, setEditJersey] = useState('');
  const [editBirth, setEditBirth] = useState('');
  const [editError, setEditError] = useState('');

  const saveTeamName = () => {
    const trimmed = teamNameDraft.trim();
    if (trimmed && onUpdateTeamName) {
      onUpdateTeamName(teamId, trimmed);
    }
    setEditingTeamName(false);
  };

  if (!team) return null;

  const players = [...team.players].sort((a, b) => a.jerseyNumber - b.jerseyNumber);

  // Zjistí, zda číslo dresu už existuje v týmu (excludePlayerId = ignorovat aktuálně editovaného hráče)
  const isDuplicateJersey = (jersey: number, excludePlayerId?: string) =>
    team.players.some(p => p.jerseyNumber === jersey && p.id !== excludePlayerId);

  const startEdit = (p: Player) => {
    setEditingId(p.id);
    setEditName(p.name);
    setEditJersey(String(p.jerseyNumber));
    setEditBirth(p.birthYear != null ? String(p.birthYear) : '');
    setEditError('');
  };

  const currentYear = new Date().getFullYear();
  const BIRTH_MIN = 1950;
  const BIRTH_MAX = currentYear - 3; // hráč musí mít alespoň 3 roky

  const parseBirth = (val: string): number | null => {
    if (!val.trim()) return null;
    const n = parseInt(val);
    return isNaN(n) ? null : n;
  };

  const isBirthValid = (birth: number | null): boolean => {
    if (birth === null) return true; // rok není povinný
    return birth >= BIRTH_MIN && birth <= BIRTH_MAX;
  };

  const saveEdit = (playerId: string) => {
    if (!editName.trim()) return;
    const jersey = parseInt(editJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey, playerId)) {
      setEditError(t('tournament.detail.duplicateJersey', { jersey }));
      return;
    }
    const birth = parseBirth(editBirth);
    if (!isBirthValid(birth)) {
      setEditError(t('tournament.detail.invalidBirthYear', { min: BIRTH_MIN, max: BIRTH_MAX }));
      return;
    }
    onUpdatePlayer?.(teamId, playerId, {
      name: editName.trim(),
      jerseyNumber: jersey,
      birthYear: birth,
    });
    setEditingId(null);
    setEditError('');
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const jersey = parseInt(newJersey);
    if (isNaN(jersey) || jersey < 1 || jersey > 99) return;
    if (isDuplicateJersey(jersey)) {
      setAddError(t('tournament.detail.duplicateJersey', { jersey }));
      return;
    }
    const birth = parseBirth(newBirth);
    if (!isBirthValid(birth)) {
      setAddError(t('tournament.detail.invalidBirthYear', { min: BIRTH_MIN, max: BIRTH_MAX }));
      return;
    }
    onAddPlayer?.(teamId, {
      name: newName.trim(),
      jerseyNumber: jersey,
      birthYear: birth,
    });
    setNewName(''); setNewJersey(''); setNewBirth(''); setAddError('');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
        padding: '0 0 32px', maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px 14px' }}>
          <TeamBadge team={team} size={20} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {!readOnly && editingTeamName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  autoFocus
                  value={teamNameDraft}
                  onChange={e => setTeamNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTeamName();
                    if (e.key === 'Escape') setEditingTeamName(false);
                  }}
                  style={{
                    flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: 8,
                    border: '1.5px solid var(--primary)', fontSize: 16, fontWeight: 800,
                    background: 'var(--bg)', color: 'var(--text)',
                  }}
                />
                <button onClick={saveTeamName} style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>✓</button>
                <button onClick={() => setEditingTeamName(false)} style={{ padding: '5px 10px', borderRadius: 8, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>✕</button>
              </div>
            ) : (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}
                onClick={() => {
                  if (!readOnly) {
                    setTeamNameDraft(team.name);
                    setEditingTeamName(true);
                  }
                }}
              >
                <h2 style={{ fontWeight: 800, fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</h2>
                {!readOnly && <span style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>✏️</span>}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('tournament.detail.roster', { count: players.length })}{readOnly ? t('tournament.detail.rosterReadOnly') : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        {/* Hlavičky sloupců */}
        <div style={{
          display: 'grid', gridTemplateColumns: '36px 1fr 60px 50px',
          gap: 6, padding: '6px 20px', background: 'var(--surface-var)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        }}>
          <span style={{ textAlign: 'center' }}>#</span>
          <span>{t('tournament.create.playerName')}</span>
          <span style={{ textAlign: 'center' }}>{t('tournament.create.birthYear')}</span>
          {!readOnly && <span />}
        </div>

        {/* Hráči */}
        <div style={{ flex: 1 }}>
          {players.map(p => (
            <div key={p.id}>
              {editingId === p.id ? (
                /* Inline editace */
                <div style={{ padding: '8px 20px', background: '#FFF8F0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 68px', gap: 6, marginBottom: 8 }}>
                    <input
                      type="number" min={1} max={99} value={editJersey}
                      onChange={e => { setEditJersey(e.target.value); setEditError(''); }}
                      placeholder="#"
                      style={{ padding: '7px', borderRadius: 8, border: `1.5px solid ${editError ? '#C62828' : '#FFB74D'}`, fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <input
                      value={editName} onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveEdit(p.id)}
                      placeholder={t('tournament.create.playerName')}
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
                    />
                    <input
                      type="number" min={1990} max={2020} value={editBirth}
                      onChange={e => setEditBirth(e.target.value)}
                      placeholder={t('tournament.create.birthYear')}
                      style={{ padding: '7px', borderRadius: 8, border: '1.5px solid #FFB74D', fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => saveEdit(p.id)} style={{ flex: 1, padding: '7px', borderRadius: 8, background: '#E65100', color: '#fff', fontWeight: 700, fontSize: 13 }}>
                      ✓ {t('common.save')}
                    </button>
                    <button onClick={() => { if (confirm(t('tournament.detail.deletePlayer', { name: p.name }))) { onRemovePlayer?.(teamId, p.id); setEditingId(null); } }} style={{ padding: '7px 12px', borderRadius: 8, background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 13 }}>
                      🗑
                    </button>
                    <button onClick={() => { setEditingId(null); setEditError(''); }} style={{ padding: '7px 12px', borderRadius: 8, background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 13 }}>
                      ✕
                    </button>
                  </div>
                  {editError && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#C62828', fontWeight: 600 }}>
                      ⚠️ {editError}
                    </div>
                  )}
                </div>
              ) : (
                /* Normální řádek */
                <div
                  onClick={() => !readOnly && startEdit(p)}
                  style={{
                    display: 'grid', gridTemplateColumns: '36px 1fr 60px 50px', gap: 6,
                    padding: '10px 20px', alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                    cursor: readOnly ? 'default' : 'pointer',
                    background: 'transparent',
                  }}
                >
                  <div style={{
                    ...colorSwatch(team.color, 28), borderRadius: 7,
                    color: textOnColor(team.color),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 12,
                  }}>{p.jerseyNumber}</div>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{p.name}</span>
                  <span style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
                    {p.birthYear ?? '—'}
                  </span>
                  {!readOnly && (
                    <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>✏️</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {players.length === 0 && (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              {t('tournament.detail.rosterEmpty')}
            </div>
          )}
        </div>

        {/* Přidat hráče (jen admin) */}
        {!readOnly && (
          <div style={{ padding: '12px 20px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>
              ➕ {t('common.add')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '52px 1fr 68px', gap: 6, marginBottom: 8 }}>
              <input
                type="number" min={1} max={99} value={newJersey}
                onChange={e => { setNewJersey(e.target.value); setAddError(''); }}
                placeholder="#"
                style={{ padding: '8px', borderRadius: 9, border: `1.5px solid ${addError ? '#C62828' : 'var(--border)'}`, fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
              />
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                placeholder={t('tournament.create.playerName')}
                style={{ padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, background: 'var(--bg)', color: 'var(--text)' }}
              />
              <input
                type="number" min={1990} max={2020} value={newBirth}
                onChange={e => setNewBirth(e.target.value)}
                placeholder={t('tournament.create.birthYear')}
                style={{ padding: '8px', borderRadius: 9, border: '1.5px solid var(--border)', fontSize: 14, textAlign: 'center', background: 'var(--bg)', color: 'var(--text)' }}
              />
            </div>
            {addError && (
              <div style={{ marginBottom: 6, fontSize: 12, color: '#C62828', fontWeight: 600 }}>
                ⚠️ {addError}
              </div>
            )}
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || !newJersey}
              style={{
                width: '100%', padding: '10px', borderRadius: 10,
                background: (!newName.trim() || !newJersey) ? 'var(--border)' : 'var(--primary)',
                color: (!newName.trim() || !newJersey) ? 'var(--text-muted)' : '#fff',
                fontWeight: 700, fontSize: 14,
              }}
            >{t('common.add')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Standings table ──────────────────────────────────────────────────────────
function StandingsTab({ tournament, onTeamClick, isOwner }: { tournament: Tournament; onTeamClick?: (teamId: string) => void; isOwner?: boolean }) {
  const { t } = useI18n();
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const [penaltyPair, setPenaltyPair] = useState<{ teamA: string; teamB: string } | null>(null);
  const [penaltyA, setPenaltyA] = useState(0);
  const [penaltyB, setPenaltyB] = useState(0);
  const [penaltySaved, setPenaltySaved] = useState(false);

  const standings = computeStandings(
    tournament.matches,
    tournament.teams,
    tournament.settings.tiebreakerOrder,
    tournament.settings.penaltyResults,
  );
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  // Detekce remízujících párů kde penalties je v tiebreaker order
  // Seskupíme týmy dle bodů a vygenerujeme všechny páry uvnitř skupiny
  const tbOrder = tournament.settings.tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER;
  const hasPenaltyCriterion = tbOrder.includes('penalties');
  const tiedPairs: Array<{ teamA: string; teamB: string; resolved: boolean }> = [];
  if (hasPenaltyCriterion) {
    const pointGroups = new Map<number, Standing[]>();
    for (const s of standings) {
      if (s.played === 0) continue;
      const arr = pointGroups.get(s.points) ?? [];
      arr.push(s);
      pointGroups.set(s.points, arr);
    }
    for (const group of pointGroups.values()) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const a = group[i];
          const b = group[j];
          const existing = (tournament.settings.penaltyResults ?? []).find(
            pr => (pr.teamAId === a.teamId && pr.teamBId === b.teamId) ||
                  (pr.teamAId === b.teamId && pr.teamBId === a.teamId),
          );
          tiedPairs.push({ teamA: a.teamId, teamB: b.teamId, resolved: !!existing });
        }
      }
    }
  }

  const openPenaltyModal = (teamA: string, teamB: string) => {
    const existing = (tournament.settings.penaltyResults ?? []).find(
      pr => (pr.teamAId === teamA && pr.teamBId === teamB) ||
            (pr.teamAId === teamB && pr.teamBId === teamA),
    );
    setPenaltyA(existing ? (existing.teamAId === teamA ? existing.teamAScore : existing.teamBScore) : 0);
    setPenaltyB(existing ? (existing.teamAId === teamB ? existing.teamAScore : existing.teamBScore) : 0);
    setPenaltyPair({ teamA, teamB });
    setPenaltySaved(false);
  };

  const handleSavePenalty = async () => {
    if (!penaltyPair) return;
    const currentResults = tournament.settings.penaltyResults ?? [];
    // Odstranit existující záznam pro tento pár
    const filtered = currentResults.filter(
      pr => !((pr.teamAId === penaltyPair.teamA && pr.teamBId === penaltyPair.teamB) ||
              (pr.teamAId === penaltyPair.teamB && pr.teamBId === penaltyPair.teamA)),
    );
    const newResult: PenaltyResult = {
      teamAId: penaltyPair.teamA,
      teamBId: penaltyPair.teamB,
      teamAScore: penaltyA,
      teamBScore: penaltyB,
    };
    await updateTournament(tournament.id, {
      settings: { ...tournament.settings, penaltyResults: [...filtered, newResult] },
    });
    setPenaltySaved(true);
    setTimeout(() => { setPenaltyPair(null); setPenaltySaved(false); }, 1200);
  };

  // Zobrazit všechny týmy i když ještě nehrály
  const allTeamIds = tournament.teams.map(tm => tm.id);
  const standingTeamIds = standings.map(s => s.teamId);
  const displayStandings = [
    ...standings,
    ...allTeamIds
      .filter(id => !standingTeamIds.includes(id))
      .map(teamId => ({ teamId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 })),
  ];

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 26px 26px 26px 38px 32px', gap: 4, padding: '8px 12px', background: 'var(--surface-var)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
          <span>#</span><span>{t('tournament.teamA').replace(/ A$/, '')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.played')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.won')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.lost')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.goalsFor')}</span><span style={{ textAlign: 'center' }}>{t('tournament.detail.points')}</span>
        </div>
        {displayStandings.map((s, idx) => {
          const team = getTeam(s.teamId);
          const isFirst = idx === 0 && s.played > 0;
          return (
            <div
              key={s.teamId}
              onClick={() => onTeamClick?.(s.teamId)}
              style={{
                display: 'grid', gridTemplateColumns: '24px minmax(0,1fr) 26px 26px 26px 38px 32px', gap: 4,
                padding: '10px 12px', alignItems: 'center',
                borderTop: idx > 0 ? '1px solid var(--border)' : 'none',
                background: isFirst ? 'var(--primary-light)' : 'transparent',
                cursor: onTeamClick ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontWeight: 700, color: isFirst ? 'var(--primary)' : 'var(--text-muted)', fontSize: 13 }}>
                {isFirst ? '🥇' : idx + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <TeamBadge team={team} size={12} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: isFirst ? 800 : 600, fontSize: 14, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? '?'}</div>
                  {onTeamClick && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{team?.players.length ?? 0} {t('common.players')}</div>
                  )}
                </div>
              </div>
              <span style={{ textAlign: 'center', fontSize: 13 }}>{s.played}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>{s.won}</span>
              <span style={{ textAlign: 'center', fontSize: 13, color: '#C62828', fontWeight: 600 }}>{s.lost}</span>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{s.goalsFor}:{s.goalsAgainst}</span>
              <span style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: isFirst ? 'var(--primary)' : 'var(--text)' }}>{s.points}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {t('tournament.detail.played')} · {t('tournament.detail.won')} · {t('tournament.detail.lost')} · {t('tournament.detail.goalsFor')} · {t('tournament.detail.points')}
      </div>

      {/* Penalty resolution for tied teams */}
      {isOwner && tiedPairs.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
            ⚽ {t('tournament.tiebreaker.penaltyTitle')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tiedPairs.map(pair => {
              const teamA = getTeam(pair.teamA);
              const teamB = getTeam(pair.teamB);
              return (
                <button
                  key={`${pair.teamA}-${pair.teamB}`}
                  onClick={() => openPenaltyModal(pair.teamA, pair.teamB)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
                    borderRadius: 10, background: 'var(--surface-var)', textAlign: 'left',
                    border: pair.resolved ? '1.5px solid #2E7D32' : '1.5px solid #FF8F00',
                  }}
                >
                  <TeamBadge team={teamA} size={14} />
                  <span style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {teamA?.name} vs {teamB?.name}
                  </span>
                  <TeamBadge team={teamB} size={14} />
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    background: pair.resolved ? '#E8F5E9' : '#FFF3E0',
                    color: pair.resolved ? '#2E7D32' : '#E65100',
                  }}>
                    {pair.resolved ? '✅' : t('tournament.tiebreaker.resolvePenalty')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Penalty modal */}
      {penaltyPair && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setPenaltyPair(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
            padding: '0 0 32px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
            </div>
            <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontWeight: 800, fontSize: 18 }}>⚽ {t('tournament.tiebreaker.penaltyTitle')}</h2>
                <button onClick={() => setPenaltyPair(null)} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
              </div>

              {/* Tým A */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TeamBadge team={getTeam(penaltyPair.teamA)} size={18} />
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{getTeam(penaltyPair.teamA)?.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPenaltyA(v => Math.max(0, v - 1))} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 22, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{penaltyA}</span>
                  <button onClick={() => setPenaltyA(v => v + 1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>+</button>
                </div>
              </div>

              {/* Tým B */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <TeamBadge team={getTeam(penaltyPair.teamB)} size={18} />
                <span style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>{getTeam(penaltyPair.teamB)?.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setPenaltyB(v => Math.max(0, v - 1))} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>−</button>
                  <span style={{ fontWeight: 800, fontSize: 22, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{penaltyB}</span>
                  <button onClick={() => setPenaltyB(v => v + 1)} style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 18 }}>+</button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
                {t('tournament.tiebreaker.penaltyGoals')}
              </div>

              <button
                onClick={handleSavePenalty}
                disabled={penaltyA === penaltyB}
                style={{
                  background: penaltySaved ? '#2E7D32' : (penaltyA === penaltyB ? 'var(--surface-var)' : 'var(--primary)'),
                  color: penaltyA === penaltyB ? 'var(--text-muted)' : '#fff',
                  fontWeight: 700, fontSize: 15, padding: '14px', borderRadius: 12,
                  transition: 'background .2s', opacity: penaltyA === penaltyB ? 0.5 : 1,
                }}
              >
                {penaltySaved ? `✅ ${t('tournament.tiebreaker.penaltySaved')}` : `💾 ${t('tournament.tiebreaker.resolvePenalty')}`}
              </button>
              {penaltyA === penaltyB && (
                <div style={{ fontSize: 12, color: '#E65100', textAlign: 'center', marginTop: -8 }}>
                  Penalty musí mít vítěze — skóre nemůže být stejné
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gól sub-modal ────────────────────────────────────────────────────────────
function GoalModal({ match, teams, onAdd, onClose }: {
  match: Match;
  teams: Team[];
  onAdd: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [scoringTeamId, setScoringTeamId] = useState(match.homeTeamId);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [isOwnGoal, setIsOwnGoal] = useState(false);
  // Auto-minuta z timeru (pokud live), jinak 1
  const [minute, setMinute] = useState(() =>
    match.status === 'live' ? computeCurrentMinute(match.startedAt, match.pausedAt, match.pausedElapsed) : 1
  );
  const [ownGoalTeamId, setOwnGoalTeamId] = useState(match.homeTeamId);

  const scoringTeam = teams.find(tm => tm.id === scoringTeamId);

  const handleAdd = () => {
    onAdd({
      teamId: isOwnGoal ? ownGoalTeamId : scoringTeamId,
      playerId: isOwnGoal ? null : playerId,
      isOwnGoal,
      minute,
    });
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        maxHeight: '85dvh', overflowY: 'auto', padding: '0 0 32px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
        <div style={{ padding: '8px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontWeight: 800, fontSize: 18 }}>⚽ {t('tournament.detail.addGoal')}</h2>
            <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, fontSize: 16, color: 'var(--text-muted)' }}>✕</button>
          </div>

          {/* Vlastní gól toggle */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setIsOwnGoal(false)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: !isOwnGoal ? 'var(--primary)' : 'var(--surface-var)',
              color: !isOwnGoal ? '#fff' : 'var(--text)',
            }}>{t('tournament.detail.addGoal')}</button>
            <button onClick={() => setIsOwnGoal(true)} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
              background: isOwnGoal ? '#C62828' : 'var(--surface-var)',
              color: isOwnGoal ? '#fff' : 'var(--text)',
            }}>{t('tournament.detail.ownGoal')}</button>
          </div>

          {/* Výběr týmu / hráče */}
          {!isOwnGoal ? (
            <>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.goalTeam')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[match.homeTeamId, match.awayTeamId].map(tid => {
                    const tm = teams.find(x => x.id === tid);
                    return (
                      <button key={tid} onClick={() => { setScoringTeamId(tid); setPlayerId(null); }} style={{
                        flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                        background: scoringTeamId === tid ? tm?.color ?? 'var(--primary)' : 'var(--surface-var)',
                        color: scoringTeamId === tid ? '#fff' : 'var(--text)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        {tm?.logoBase64 ? (
                          <img src={tm.logoBase64} alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover' }} />
                        ) : null}
                        {tm?.name ?? '?'}
                      </button>
                    );
                  })}
                </div>
              </div>

              {scoringTeam && scoringTeam.players.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.scorer')}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    <button onClick={() => setPlayerId(null)} style={{
                      padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontWeight: 600, fontSize: 14,
                      background: playerId === null ? 'var(--primary-light)' : 'var(--surface-var)',
                      color: playerId === null ? 'var(--primary)' : 'var(--text)',
                      border: playerId === null ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                    }}>
                      — Bez střelce
                    </button>
                    {scoringTeam.players.map((p: Player) => (
                      <button key={p.id} onClick={() => setPlayerId(p.id)} style={{
                        padding: '8px 12px', borderRadius: 8, textAlign: 'left', fontSize: 14,
                        background: playerId === p.id ? 'var(--primary-light)' : 'var(--surface-var)',
                        color: playerId === p.id ? 'var(--primary)' : 'var(--text)',
                        border: playerId === p.id ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span style={{
                          width: 26, height: 26, borderRadius: 6, background: scoringTeam.color,
                          color: '#fff', fontWeight: 700, fontSize: 12,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>{p.jerseyNumber}</span>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.detail.ownGoalTeam')}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[match.homeTeamId, match.awayTeamId].map(tid => {
                  const tm = teams.find(x => x.id === tid);
                  return (
                    <button key={tid} onClick={() => setOwnGoalTeamId(tid)} style={{
                      flex: 1, padding: '10px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                      background: ownGoalTeamId === tid ? '#C62828' : 'var(--surface-var)',
                      color: ownGoalTeamId === tid ? '#fff' : 'var(--text)',
                    }}>{tm?.name ?? '?'}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Minuta */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('tournament.detail.goalMinute')}</div>
              {match.status === 'live' && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('tournament.detail.goalMinuteHint')}</div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setMinute(m => Math.max(1, m - 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>−</button>
              <span style={{ fontWeight: 800, fontSize: 18, minWidth: 32, textAlign: 'center', color: 'var(--primary)' }}>{minute}</span>
              <button onClick={() => setMinute(m => Math.min(120, m + 1))} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-var)', fontWeight: 700, fontSize: 16 }}>+</button>
            </div>
          </div>

          <button onClick={handleAdd} style={{
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 16,
            padding: '14px', borderRadius: 14, marginTop: 4,
          }}>
            {t('match.detail.addGoal')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Score modal ──────────────────────────────────────────────────────────────
function ScoreModal({ match, tournament, onClose, onStart, onFinish, onAddGoal, onRemoveLastGoal, onRemoveGoal, onUpdateGoalPlayer, onReopen, onReset }: {
  match: Match;
  tournament: Tournament;
  onClose: () => void;
  onStart: () => void;
  onFinish: () => void;
  onAddGoal: (goal: Omit<Goal, 'id' | 'recordedAt'>) => void;
  onRemoveLastGoal: () => void;
  onRemoveGoal: (goalId: string) => void;
  onUpdateGoalPlayer: (goalId: string, playerId: string | null) => void;
  onReopen: () => void;
  onReset: () => void;
}) {
  const [showGoalModal, setShowGoalModal] = useState<'home' | 'away' | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const { t } = useI18n();
  const [elapsed, setElapsed] = useState(() => computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
  const homeTeam = tournament.teams.find(tm => tm.id === match.homeTeamId);
  const awayTeam = tournament.teams.find(tm => tm.id === match.awayTeamId);

  // Timer — aktualizace každou sekundu jen když live a není pauza
  useEffect(() => {
    if (match.status !== 'live') return;
    if (match.pausedAt) {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
      return;
    }
    setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    const interval = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(interval);
  }, [match.status, match.startedAt, match.pausedAt, match.pausedElapsed]);

  const durationSec = match.durationMinutes * 60;
  const remaining = durationSec - elapsed;
  const isOvertime = remaining < 0;
  const isPausedModal = match.status === 'live' && !!match.pausedAt;
  // Countdown display
  const displaySec = isOvertime ? -remaining : remaining;
  const timerMM = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const timerSS = (displaySec % 60).toString().padStart(2, '0');
  const timerLabel = isOvertime ? `+${timerMM}:${timerSS}` : `${timerMM}:${timerSS}`;
  const timerColor = isPausedModal ? '#E65100' : isOvertime ? '#C62828' : remaining <= 60 ? '#E65100' : 'var(--text)';

  const handleGoalModalAdd = (goal: Omit<Goal, 'id' | 'recordedAt'>) => {
    onAddGoal(goal);
    setShowGoalModal(null);
  };

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 100,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--surface)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480,
          padding: '0 0 32px', maxHeight: '92dvh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
          </div>

          <div style={{ padding: '8px 20px 0' }}>
            {/* Status + čas */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                background: match.status === 'live' ? '#FFEBEE' : match.status === 'finished' ? '#F3E5F5' : 'var(--surface-var)',
                color: match.status === 'live' ? '#C62828' : match.status === 'finished' ? '#6A1B9A' : 'var(--text-muted)',
              }}>
                {match.status === 'live' ? t('tournament.public.live') : match.status === 'finished' ? `✅ ${t('match.played')}` : `🕐 ${t('match.scheduled')}`}
              </span>
              {/* Timer — countdown */}
              {match.status === 'live' && (
                <span style={{
                  fontWeight: 800, fontSize: 18, color: timerColor,
                  fontVariantNumeric: 'tabular-nums',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {isPausedModal && <span style={{ fontSize: 13 }}>⏸</span>}
                  {timerLabel}
                  {isOvertime && <span style={{ fontSize: 12, marginLeft: 2 }}>{t('match.detail.overtime')}</span>}
                </span>
              )}
              <button onClick={onClose} style={{ background: 'var(--surface-var)', width: 32, height: 32, borderRadius: 16, color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
            </div>

            {/* Live score */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {homeTeam?.logoBase64 ? (
                  <img src={homeTeam.logoBase64} alt={homeTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: homeTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {homeTeam?.name ?? '?'}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 48, lineHeight: 1, color: 'var(--text)', letterSpacing: -2 }}>
                  {match.homeScore}<span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>:</span>{match.awayScore}
                </div>
              </div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                {awayTeam?.logoBase64 ? (
                  <img src={awayTeam.logoBase64} alt={awayTeam.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', margin: '0 auto 5px', display: 'block' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: awayTeam?.color ?? '#ccc', margin: '0 auto 5px' }} />
                )}
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {awayTeam?.name ?? '?'}
                </div>
              </div>
            </div>

            {/* +1 Gól tlačítka (jen živý zápas) */}
            {match.status === 'live' && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <button onClick={() => setShowGoalModal('home')} style={{
                  flex: 1, background: homeTeam?.color ?? 'var(--primary)',
                  color: textOnColor(homeTeam?.color ?? '#1a3c6e'),
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                  boxShadow: homeTeam?.color && isLightColor(homeTeam.color) ? 'inset 0 0 0 2px rgba(0,0,0,0.15)' : undefined,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{homeTeam?.name}</span>
                </button>
                <button onClick={() => setShowGoalModal('away')} style={{
                  flex: 1, background: awayTeam?.color ?? '#666',
                  color: textOnColor(awayTeam?.color ?? '#666'),
                  fontWeight: 800, fontSize: 20, padding: '18px 10px', borderRadius: 14,
                  boxShadow: awayTeam?.color && isLightColor(awayTeam.color) ? 'inset 0 0 0 2px rgba(0,0,0,0.15)' : undefined,
                }}>
                  +1 ⚽<br />
                  <span style={{ fontSize: 13, opacity: 0.9, fontWeight: 600 }}>{awayTeam?.name}</span>
                </button>
              </div>
            )}

            {/* Historie gólů */}
            {match.goals.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {/* Edit mód hlavička — pro live i finished */}
                {(match.status === 'finished' || match.status === 'live') && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    <button
                      onClick={() => { setEditMode(e => !e); setEditingGoalId(null); }}
                      style={{
                        fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                        background: editMode ? '#FFF3E0' : 'var(--surface-var)',
                        color: editMode ? '#E65100' : 'var(--text-muted)',
                        border: editMode ? '1px solid #FFB74D' : '1px solid transparent',
                      }}
                    >
                      {editMode ? `✅ ${t('common.close')}` : `✏️ ${t('common.edit')}`}
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...match.goals].sort((a, b) => a.minute - b.minute).map(g => {
                    const team = tournament.teams.find(t => t.id === g.teamId);
                    const player = team?.players.find((p: Player) => p.id === g.playerId);
                    const beneficiaryId = g.isOwnGoal
                      ? (g.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId)
                      : g.teamId;
                    const isHomeGoal = beneficiaryId === match.homeTeamId;
                    const playerLabel = g.isOwnGoal
                      ? `⚠️ VG (${team?.name ?? '?'})`
                      : player ? `${player.jerseyNumber}. ${player.name}` : 'bez střelce';
                    const homeBeneficiary = tournament.teams.find(t => t.id === match.homeTeamId);
                    const awayBeneficiary = tournament.teams.find(t => t.id === match.awayTeamId);
                    const isEditing = editMode && editingGoalId === g.id;
                    const scoringTeam = tournament.teams.find(t => t.id === beneficiaryId);

                    return (
                      <div key={g.id}>
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 32px 1fr', gap: 4, alignItems: 'center',
                        }}>
                          {/* Domácí strana */}
                          {isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 6px 4px 4px',
                                borderLeft: `3px solid ${homeBeneficiary?.color ?? 'var(--primary)'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: homeBeneficiary?.color ?? 'var(--primary)' }} />
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                ⚽ {playerLabel}
                              </span>
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                            </button>
                          ) : <div />}

                          <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                            {g.minute}'
                          </div>

                          {/* Hosté strana */}
                          {!isHomeGoal ? (
                            <button
                              onClick={() => editMode && setEditingGoalId(isEditing ? null : g.id)}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, textAlign: 'right',
                                background: isEditing ? '#FFF3E0' : 'var(--surface-var)',
                                borderRadius: 6, padding: '4px 4px 4px 6px',
                                borderRight: `3px solid ${awayBeneficiary?.color ?? '#666'}`,
                                outline: isEditing ? '2px solid #FFB74D' : 'none',
                                cursor: editMode ? 'pointer' : 'default',
                              }}
                            >
                              {editMode && <span style={{ fontSize: 10, color: '#E65100', fontWeight: 700, flexShrink: 0 }}>✏️</span>}
                              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {playerLabel} ⚽
                              </span>
                              <div style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0, background: awayBeneficiary?.color ?? '#666' }} />
                            </button>
                          ) : <div />}
                        </div>

                        {/* Rozbalená editace gólu */}
                        {isEditing && scoringTeam && (
                          <div style={{
                            margin: '4px 0 6px', padding: '10px', borderRadius: 10,
                            background: '#FFF8F0', border: '1px solid #FFB74D',
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#E65100', marginBottom: 8 }}>
                              Přiřadit střelce ({scoringTeam.name}):
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                              <button
                                onClick={() => { onUpdateGoalPlayer(g.id, null); setEditingGoalId(null); }}
                                style={{
                                  padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 600,
                                  background: g.playerId === null ? '#FFB74D' : 'var(--surface-var)',
                                  color: g.playerId === null ? '#fff' : 'var(--text-muted)',
                                  border: '1px dashed var(--border)',
                                }}
                              >— Bez střelce</button>
                              {scoringTeam.players.slice().sort((a, b) => a.jerseyNumber - b.jerseyNumber).map((p: Player) => (
                                <button
                                  key={p.id}
                                  onClick={() => { onUpdateGoalPlayer(g.id, p.id); setEditingGoalId(null); }}
                                  style={{
                                    padding: '5px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                                    background: g.playerId === p.id ? scoringTeam.color : 'var(--surface-var)',
                                    color: g.playerId === p.id ? '#fff' : 'var(--text)',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                  }}
                                >
                                  <span style={{ background: 'rgba(0,0,0,.15)', borderRadius: 4, padding: '1px 4px', fontSize: 10 }}>{p.jerseyNumber}</span>
                                  {p.name}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => { onRemoveGoal(g.id); setEditingGoalId(null); }}
                              style={{
                                width: '100%', padding: '7px', borderRadius: 8,
                                background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 12,
                              }}
                            >🗑 Smazat tento gól</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {match.status === 'live' && match.goals.length > 0 && (
                  <button onClick={onRemoveLastGoal} style={{
                    marginTop: 8, width: '100%', padding: '8px', borderRadius: 10,
                    background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 13,
                  }}>
                    ↩ Zrušit poslední gól
                  </button>
                )}
              </div>
            )}

            {/* Akce */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {match.status === 'scheduled' && (
                <button onClick={onStart} style={{
                  background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14, border: '1.5px solid #FFB74D',
                }}>
                  ▶ Začít zápas
                </button>
              )}
              {match.status === 'live' && (
                <button onClick={onFinish} style={{
                  background: '#B71C1C', color: '#fff', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 14,
                }}>
                  ⏹ Ukončit zápas
                </button>
              )}
              {match.status === 'finished' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { if (confirm('Znovu spustit zápas? Výsledek zůstane, ale zápas se označí jako ŽIVĚ.')) onReopen(); }}
                    style={{
                      flex: 1, background: 'var(--surface-var)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid var(--border)',
                    }}
                  >
                    ↩ Znovu spustit
                  </button>
                  <button
                    onClick={() => { if (confirm(t('tournament.detail.resetConfirm'))) { onReset(); onClose(); } }}
                    style={{
                      flex: 1, background: '#FFEBEE', color: '#C62828', fontWeight: 600, fontSize: 14,
                      padding: '11px', borderRadius: 12, border: '1px solid #FFCDD2',
                    }}
                  >
                    🔄 Reset zápasu
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Gól sub-modal */}
      {showGoalModal && (
        <GoalModal
          match={{
            ...match,
            homeTeamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
            awayTeamId: showGoalModal === 'home' ? match.awayTeamId : match.homeTeamId,
          }}
          teams={tournament.teams}
          onAdd={goal => handleGoalModalAdd({
            ...goal,
            teamId: showGoalModal === 'home' ? match.homeTeamId : match.awayTeamId,
          })}
          onClose={() => setShowGoalModal(null)}
        />
      )}
    </>
  );
}

// ─── Match card timer — countdown + pauza podpora ─────────────────────────────
// Zobrazuje zbývající čas do konce (countdown). Nadčas s "+".
function MatchCardTimer({ match, variant = 'card' }: { match: Match; variant?: 'card' | 'list' }) {
  const [elapsed, setElapsed] = useState(() =>
    computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed)
  );

  useEffect(() => {
    // Pokud je pauza — timer se nemá pohybovat
    if (match.pausedAt) {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
      return;
    }
    setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    const iv = setInterval(() => {
      setElapsed(computeMatchElapsed(match.startedAt, match.pausedAt, match.pausedElapsed));
    }, 1000);
    return () => clearInterval(iv);
  }, [match.startedAt, match.pausedAt, match.pausedElapsed]);

  const totalSec = match.durationMinutes * 60;
  const remaining = totalSec - elapsed;
  const isOvertime = remaining < 0;
  const isPaused = !!match.pausedAt;

  // Countdown: kolik zbývá; nadčas = kolik překročeno
  const displaySec = isOvertime ? -remaining : remaining;
  const mm = Math.floor(displaySec / 60).toString().padStart(2, '0');
  const ss = (displaySec % 60).toString().padStart(2, '0');

  const nearEnd = !isOvertime && remaining <= 60;

  if (variant === 'list') {
    // Malá verze pro match list kartu
    const color = isPaused ? '#FFB74D' : isOvertime ? '#EF9A9A' : nearEnd ? '#FFB74D' : 'var(--text-muted)';
    return (
      <span style={{ fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color }}>
        {isPaused ? '⏸ ' : ''}{isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`}
      </span>
    );
  }

  // Velká verze pro ScoreModal
  const color = isPaused ? '#FF8F00' : isOvertime ? '#C62828' : nearEnd ? '#E65100' : 'var(--text)';
  return (
    <span style={{ fontSize: 32, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color, letterSpacing: -1 }}>
      {isPaused ? '⏸ ' : ''}{isOvertime ? `+${mm}:${ss}` : `${mm}:${ss}`}
    </span>
  );
}

// ─── Inline gól panel — tým je už předvybraný, stačí vybrat hráče ─────────────
function InlineGoalPanel({ match, teams, teamId, onGoal, onClose }: {
  match: Match;
  teams: Team[];
  teamId: string;         // předvybraný tým (domácí nebo hosté)
  onGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onClose: () => void;
}) {
  const team = teams.find(t => t.id === teamId);
  const teamColor = team?.color ?? '#666';

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: '0 0 14px 14px',
      boxShadow: `0 0 0 2px ${teamColor}`,
      overflow: 'hidden',
    }}>
      {/* Hlavička s barvou týmu */}
      <div style={{
        background: teamColor, padding: '6px 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {team?.logoBase64
            ? <img src={team.logoBase64} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />
            : null
          }
          <span style={{ color: textOnColor(teamColor), fontWeight: 700, fontSize: 13 }}>
            ⚽ {team?.name ?? '?'}
          </span>
        </div>
        <button onClick={onClose} style={{ color: textOnColor(teamColor), opacity: 0.75, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>✕</button>
      </div>

      {/* Hráči */}
      <div style={{ padding: '10px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {/* Bez střelce */}
        <button
          onClick={() => { onGoal(match.id, teamId, null); onClose(); }}
          style={{
            padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--surface-var)', color: 'var(--text-muted)',
            border: '1.5px dashed var(--border)',
          }}
        >
          — Bez střelce
        </button>

        {(team?.players ?? [])
          .slice()
          .sort((a, b) => a.jerseyNumber - b.jerseyNumber)
          .map(p => (
            <button
              key={p.id}
              onClick={() => { onGoal(match.id, teamId, p.id); onClose(); }}
              style={{
                padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: teamColor, color: textOnColor(teamColor),
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <span style={{
                background: 'rgba(255,255,255,.22)', borderRadius: 4, padding: '1px 5px',
                fontSize: 11, fontWeight: 800, minWidth: 20, textAlign: 'center',
              }}>{p.jerseyNumber}</span>
              {p.name}
            </button>
          ))}

        {(team?.players ?? []).length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
            Žádní hráči v soupisce.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Matches tab ──────────────────────────────────────────────────────────────
function MatchesTab({ tournament, isVerified, onQuickGoal, onStartMatch, onFinishMatchConfirm, onPauseMatch, onResumeMatch, onEditMatch, onCancelMatch, onReorderMatches }: {
  tournament: Tournament;
  isVerified: boolean;
  onQuickGoal: (matchId: string, teamId: string, playerId: string | null) => void;
  onStartMatch: (matchId: string) => void;
  onFinishMatchConfirm: (matchId: string) => void;
  onPauseMatch: (matchId: string) => void;
  onResumeMatch: (matchId: string) => void;
  onEditMatch: (match: Match) => void;
  onCancelMatch?: (matchId: string) => void;
  onReorderMatches?: (reorderedScheduledIds: string[]) => void;
}) {
  const { t } = useI18n();
  const [openGoalPanel, setOpenGoalPanel] = useState<{ matchId: string; side: 'home' | 'away' } | null>(null);
  const getTeam = (id: string) => tournament.teams.find(tm => tm.id === id);

  const toggleGoal = (matchId: string, side: 'home' | 'away') => {
    setOpenGoalPanel(prev =>
      prev?.matchId === matchId && prev.side === side ? null : { matchId, side }
    );
  };

  // Řazení: live → scheduled (podle času) → finished (od nejnovějšího)
  const liveMatches = tournament.matches.filter(m => m.status === 'live');
  const scheduledMatches = tournament.matches
    .filter(m => m.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
  const finishedMatches = tournament.matches
    .filter(m => m.status === 'finished')
    .sort((a, b) => new Date(b.finishedAt ?? b.scheduledTime).getTime() - new Date(a.finishedAt ?? a.scheduledTime).getTime());

  const canReorder = isVerified && !!onReorderMatches && scheduledMatches.length > 1;

  // DnD sensors — pointer (desktop) + touch (mobile) s aktivační vzdáleností
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 5 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorderMatches) return;
    const ids = scheduledMatches.map(m => m.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, active.id as string);
    onReorderMatches(ids);
  }, [scheduledMatches, onReorderMatches]);

  if (tournament.matches.length === 0) {
    return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('tournament.detail.noMatches')}</div>;
  }

  // Renderovací helper pro jednu kartu zápasu (sdílený pro live/scheduled/finished)
  const renderMatchCard = (match: Match, opts: { showDragHandle?: boolean } = {}) => {
                const homeT = getTeam(match.homeTeamId);
                const awayT = getTeam(match.awayTeamId);
                const isLive = match.status === 'live';
                const isScheduled = match.status === 'scheduled';
                const isFinished = match.status === 'finished';
                const isPaused = isLive && !!match.pausedAt;
                const panelOpen = openGoalPanel?.matchId === match.id;
                const panelSide = panelOpen ? openGoalPanel!.side : null;
                const panelTeamId = panelSide === 'home' ? match.homeTeamId : match.awayTeamId;

                // Barva skóre
                const scoreColor = isScheduled ? 'var(--text-muted)' : isLive ? (isPaused ? '#E65100' : '#C62828') : 'var(--text)';

                return (
                  <div>
                    <div style={{
                      background: 'var(--surface)',
                      borderRadius: panelOpen ? '14px 14px 0 0' : 14,
                      border: isLive
                        ? `2px solid ${isPaused ? '#E65100' : '#C62828'}`
                        : isFinished
                        ? '1.5px solid #C8E6C9'
                        : '1.5px solid var(--border)',
                      boxShadow: isLive
                        ? `0 2px 8px rgba(198,40,40,.15)`
                        : '0 1px 3px rgba(0,0,0,.06)',
                      overflow: 'hidden',
                    }}>

                      {/* ══ LIVE zápas — 3-sloupcový layout ══ */}
                      {isLive && (
                        <>
                          {/* Řádek 1: tým A | skóre + timer | tým B */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px 4px', gap: 8 }}>
                            {/* Levý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <TeamBadge team={homeT} size={14} />
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                                {homeT?.name ?? '?'}
                              </span>
                            </div>
                            {/* Střed: skóre + badge */}
                            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 70 }}>
                              <div style={{ fontWeight: 900, fontSize: 24, lineHeight: 1, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>
                                {`${match.homeScore}:${match.awayScore}`}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <div style={{ width: 5, height: 5, borderRadius: 3, background: isPaused ? '#E65100' : '#C62828' }} />
                                <span style={{ fontSize: 8, fontWeight: 900, letterSpacing: 0.5, color: isPaused ? '#E65100' : '#C62828' }}>
                                  {isPaused ? 'PAUZA' : 'ŽIVĚ'}
                                </span>
                              </div>
                            </div>
                            {/* Pravý tým */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>
                                {awayT?.name ?? '?'}
                              </span>
                              <TeamBadge team={awayT} size={14} />
                            </div>
                          </div>

                          {/* Řádek 2: timer + ⚽ tlačítka přes celou šířku */}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '2px 12px 6px', gap: 8 }}>
                            {/* ⚽ domácí */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'home')}
                                title={`Gól: ${homeT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'home'
                                    ? (homeT?.color ?? '#666')
                                    : (homeT?.color && !isNearWhite(homeT.color) ? homeT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'home'
                                    ? textOnColor(homeT?.color ?? '#666')
                                    : (homeT?.color && !isNearWhite(homeT.color) ? homeT.color : 'var(--text)'),
                                  border: `2px solid ${homeT?.color && !isNearWhite(homeT.color) ? homeT.color : 'var(--border)'}`,
                                  boxShadow: panelSide === 'home' && homeT?.color && isLightColor(homeT.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                                  transition: 'all .12s',
                                }}
                              >⚽ +1</button>
                            ) : <div style={{ flex: 1 }} />}

                            {/* Timer countdown */}
                            <div style={{ flexShrink: 0, minWidth: 60, textAlign: 'center' }}>
                              <MatchCardTimer match={match} variant="list" />
                            </div>

                            {/* ⚽ hosté */}
                            {isVerified ? (
                              <button
                                onClick={() => toggleGoal(match.id, 'away')}
                                title={`Gól: ${awayT?.name}`}
                                style={{
                                  flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 14, fontWeight: 800,
                                  background: panelSide === 'away'
                                    ? (awayT?.color ?? '#666')
                                    : (awayT?.color && !isNearWhite(awayT.color) ? awayT.color + '22' : 'var(--surface-var)'),
                                  color: panelSide === 'away'
                                    ? textOnColor(awayT?.color ?? '#666')
                                    : (awayT?.color && !isNearWhite(awayT.color) ? awayT.color : 'var(--text)'),
                                  border: `2px solid ${awayT?.color && !isNearWhite(awayT.color) ? awayT.color : 'var(--border)'}`,
                                  boxShadow: panelSide === 'away' && awayT?.color && isLightColor(awayT.color) ? 'inset 0 0 0 1.5px rgba(0,0,0,0.15)' : undefined,
                                  transition: 'all .12s',
                                }}
                              >+1 ⚽</button>
                            ) : <div style={{ flex: 1 }} />}
                          </div>

                          {/* Řádek 3: akce bar (jen admin) */}
                          {isVerified && (
                            <div style={{ display: 'flex', gap: 6, padding: '0 12px 9px', alignItems: 'center' }}>
                              {isPaused ? (
                                <button
                                  onClick={() => onResumeMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1.5px solid #FFB74D',
                                  }}
                                >▶</button>
                              ) : (
                                <button
                                  onClick={() => onPauseMatch(match.id)}
                                  style={{
                                    padding: '6px 14px', borderRadius: 9,
                                    background: 'var(--surface-var)', color: '#E65100',
                                    fontWeight: 700, fontSize: 13,
                                    border: '1px solid #FFB74D',
                                  }}
                                >⏸</button>
                              )}
                              <button
                                onClick={() => onFinishMatchConfirm(match.id)}
                                style={{
                                  flex: 1, padding: '6px 0', borderRadius: 9,
                                  background: '#FFEBEE', color: '#C62828',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid #FFCDD2',
                                }}
                              >⏹ Ukončit</button>
                              <button
                                onClick={() => onEditMatch(match)}
                                style={{
                                  padding: '6px 10px', borderRadius: 9,
                                  background: 'var(--surface-var)', color: 'var(--text-muted)',
                                  fontWeight: 700, fontSize: 13,
                                  border: '1px solid var(--border)',
                                }}
                              >✏️</button>
                            </div>
                          )}
                        </>
                      )}

                      {/* ══ SCHEDULED / FINISHED — kompaktní jednořádkový layout ══ */}
                      {!isLive && (
                        <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', gap: 8 }}>
                          {/* Drag handle — jen scheduled + owner s DnD */}
                          {opts.showDragHandle && (
                            <span
                              className="drag-handle"
                              style={{
                                cursor: 'grab', fontSize: 16, color: 'var(--text-muted)', flexShrink: 0,
                                userSelect: 'none', lineHeight: 1, opacity: 0.5, touchAction: 'none',
                              }}
                            >☰</span>
                          )}
                          {/* Status vlevo: ikonka + čas (jen plánované)/tlačítko */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 40, flexShrink: 0 }}>
                            {isFinished
                              ? <span style={{ fontSize: 11, color: '#2E7D32', flexShrink: 0 }}>✓</span>
                              : isVerified
                              ? (
                                <button
                                  onClick={() => onStartMatch(match.id)}
                                  style={{
                                    width: 22, height: 22, borderRadius: 6,
                                    background: '#FFF3E0', color: '#E65100',
                                    fontWeight: 900, fontSize: 11,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    border: '1px solid #FFB74D',
                                  }}
                                >▶</button>
                              )
                              : <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>·</span>
                            }
                            {!isFinished && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>
                                  {formatMatchTime(match.scheduledTime)}
                                </span>
                                {(tournament.settings.numberOfPitches ?? 1) > 1 && (
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                                    H{(match.pitchNumber ?? 1)}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Tým A */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <TeamBadge team={homeT} size={12} />
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word' }}>
                              {homeT?.name ?? '?'}
                            </span>
                          </div>

                          {/* Skóre střed — podbarvené jako v PublicView */}
                          <div style={{
                            flexShrink: 0,
                            background: isFinished ? '#E8F5E9' : 'transparent',
                            borderRadius: 8,
                            padding: isFinished ? '3px 8px' : '3px 4px',
                            minWidth: 44, textAlign: 'center',
                          }}>
                            <span style={{
                              fontWeight: 900, fontSize: isFinished ? 15 : 16,
                              color: isFinished ? '#2E7D32' : 'var(--text-muted)',
                              fontVariantNumeric: 'tabular-nums',
                            }}>
                              {isScheduled ? '— : —' : `${match.homeScore} : ${match.awayScore}`}
                            </span>
                          </div>

                          {/* Tým B */}
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', lineHeight: 1.3, wordBreak: 'break-word', textAlign: 'right' }}>
                              {awayT?.name ?? '?'}
                            </span>
                            <TeamBadge team={awayT} size={12} />
                          </div>

                          {/* Akce vpravo */}
                          {isVerified && isFinished && (
                            <button
                              onClick={() => onEditMatch(match)}
                              style={{
                                flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                                background: 'var(--surface-var)', color: 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, border: '1px solid var(--border)',
                              }}
                            >✏️</button>
                          )}
                          {/* Cancel scheduled / placeholder */}
                          {isVerified && isScheduled && onCancelMatch ? (
                            <button
                              onClick={() => {
                                if (confirm(t('tournament.match.cancelConfirm'))) {
                                  onCancelMatch(match.id);
                                }
                              }}
                              style={{
                                flexShrink: 0, width: 30, height: 30, borderRadius: 8,
                                background: '#FFEBEE', color: '#C62828',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, border: '1px solid #FFCDD2',
                              }}
                            >✕</button>
                          ) : (!isVerified || isScheduled) ? (
                            <div style={{ width: 30, flexShrink: 0 }} />
                          ) : null}
                        </div>
                      )}
                    </div>

                    {/* Inline goal panel */}
                    {panelOpen && isVerified && (
                      <InlineGoalPanel
                        match={match}
                        teams={tournament.teams}
                        teamId={panelTeamId}
                        onGoal={(matchId, teamId, playerId) => {
                          onQuickGoal(matchId, teamId, playerId);
                          setOpenGoalPanel(null);
                        }}
                        onClose={() => setOpenGoalPanel(null)}
                      />
                    )}
                  </div>
                );
  };

  // Sortable wrapper pro scheduled match
  const SortableMatchCard = ({ match }: { match: Match }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: match.id });
    return (
      <div ref={setNodeRef} style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        position: 'relative',
      }} {...attributes} {...listeners}>
        {renderMatchCard(match, { showDragHandle: canReorder })}
      </div>
    );
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 🔴 Live */}
      {liveMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#C62828', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            🔴 Právě hrají
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {liveMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
          </div>
        </div>
      )}

      {/* 🕐 Scheduled — s DnD pokud je owner */}
      {scheduledMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            🕐 Nadcházející
          </div>
          {canReorder ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={scheduledMatches.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {scheduledMatches.map(m => <SortableMatchCard key={m.id} match={m} />)}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scheduledMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ✅ Finished */}
      {finishedMatches.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            ✅ Odehrané
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {finishedMatches.map(m => <div key={m.id}>{renderMatchCard(m)}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scorers tab ──────────────────────────────────────────────────────────────
function ScorersTab({ tournament }: { tournament: Tournament }) {
  const { t } = useI18n();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Sestavíme tabulku střelců ze všech gólů
  const scorerMap = new Map<string, { playerId: string; teamId: string; goals: number }>();

  for (const match of tournament.matches) {
    for (const goal of match.goals) {
      if (goal.isOwnGoal || !goal.playerId) continue;
      const key = `${goal.teamId}-${goal.playerId}`;
      const existing = scorerMap.get(key);
      if (existing) {
        existing.goals += 1;
      } else {
        scorerMap.set(key, { playerId: goal.playerId, teamId: goal.teamId, goals: 1 });
      }
    }
  }

  const scorers = Array.from(scorerMap.values())
    .filter(s => s.goals > 0)
    .sort((a, b) => b.goals - a.goals);

  const totalGoals = tournament.matches.reduce((sum, m) => sum + m.homeScore + m.awayScore, 0);
  const knownGoals = scorers.reduce((sum, s) => sum + s.goals, 0);
  const unknownGoals = totalGoals - knownGoals;

  // Vrátí zápasy, ve kterých hráč skóroval, s počtem gólů per zápas
  const getMatchBreakdown = (playerId: string, teamId: string) => {
    const breakdown: Array<{ match: Match; goalsInMatch: number }> = [];
    for (const match of tournament.matches) {
      const goalsInMatch = match.goals.filter(
        g => g.playerId === playerId && g.teamId === teamId && !g.isOwnGoal
      ).length;
      if (goalsInMatch > 0) {
        breakdown.push({ match, goalsInMatch });
      }
    }
    // Seřadit: nejdřív live, pak dle scheduledTime
    return breakdown.sort((a, b) => new Date(a.match.scheduledTime).getTime() - new Date(b.match.scheduledTime).getTime());
  };

  if (scorers.length === 0) {
    return (
      <div style={{ padding: '16px' }}>
        <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 14 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🥇</div>
          <p style={{ fontSize: 14, fontWeight: 600 }}>{t('tournament.detail.noGoals')}</p>
          <p style={{ fontSize: 13, marginTop: 4 }}>{t('tournament.detail.noGoalsDesc')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        {/* Hlavička */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🥇</span>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{t('tournament.detail.scorersTable')}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>{totalGoals} gólů celkem</span>
        </div>

        {scorers.map((scorer, idx) => {
          const key = `${scorer.teamId}-${scorer.playerId}`;
          const team = tournament.teams.find(t => t.id === scorer.teamId);
          const player = team?.players.find(p => p.id === scorer.playerId);
          const name = player?.name ?? 'Neznámý hráč';
          const jersey = player?.jerseyNumber;
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
          const isFirst = idx === 0;
          const isExpanded = expandedKey === key;
          const matchBreakdown = isExpanded ? getMatchBreakdown(scorer.playerId, scorer.teamId) : [];

          return (
            <div key={key} style={{
              borderBottom: idx < scorers.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              {/* Hlavní řádek — kliknutelný */}
              <div
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '11px 16px',
                  background: isFirst ? 'linear-gradient(90deg, rgba(255,193,7,.08) 0%, transparent 100%)' : 'transparent',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ width: 28, textAlign: 'center', flexShrink: 0 }}>
                  {medal
                    ? <span style={{ fontSize: 18 }}>{medal}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)' }}>{idx + 1}.</span>
                  }
                </div>
                <TeamBadge team={team} size={16} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {name}
                    {jersey != null && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>#{jersey}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team?.name ?? '—'}
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: isFirst ? 'rgba(255,193,7,.2)' : 'var(--primary-light)',
                  borderRadius: 10, padding: '4px 10px', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 13 }}>⚽</span>
                  <span style={{ fontWeight: 800, fontSize: 16, color: isFirst ? '#B8860B' : 'var(--primary)' }}>
                    {scorer.goals}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 2 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {/* Rozbalený detail zápasů */}
              {isExpanded && (
                <div style={{
                  background: 'var(--bg)',
                  borderTop: '1px solid var(--border)',
                  padding: '8px 16px 10px 56px',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  {matchBreakdown.map(({ match, goalsInMatch }) => {
                    const homeTeam = tournament.teams.find(t => t.id === match.homeTeamId);
                    const awayTeam = tournament.teams.find(t => t.id === match.awayTeamId);
                    const opponentTeam = match.homeTeamId === scorer.teamId ? awayTeam : homeTeam;
                    const isHome = match.homeTeamId === scorer.teamId;
                    const myScore = isHome ? match.homeScore : match.awayScore;
                    const oppScore = isHome ? match.awayScore : match.homeScore;
                    const statusDone = match.status === 'finished';

                    return (
                      <div key={match.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 10px',
                        background: 'var(--surface)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}>
                        <span style={{ fontSize: 13 }}>⚽</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', minWidth: 18 }}>×{goalsInMatch}</span>
                        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>vs.</span>
                        <TeamBadge team={opponentTeam} size={12} />
                        <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {opponentTeam?.name ?? '—'}
                        </span>
                        {statusDone && (
                          <span style={{ fontWeight: 700, color: myScore > oppScore ? 'var(--primary)' : myScore < oppScore ? '#C62828' : 'var(--text-muted)', flexShrink: 0 }}>
                            {myScore}:{oppScore}
                          </span>
                        )}
                        {match.status === 'live' && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#C62828', flexShrink: 0 }}>{t('tournament.detail.liveLabel')}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {unknownGoals > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              + {unknownGoals} gól{unknownGoals === 1 ? '' : unknownGoals < 5 ? 'y' : 'ů'} bez přiřazeného střelce
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings tab ─────────────────────────────────────────────────────────────
function SettingsTab({ tournament, navigate, isOwner, leaveTournament }: { tournament: Tournament; navigate: (p: Page) => void; isOwner: boolean; leaveTournament: (tournamentId: string) => Promise<void> }) {
  const { t, locale } = useI18n();
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [adminCopied, setAdminCopied] = useState(false);
  const [rulesEdit, setRulesEdit] = useState(tournament.settings.rules ?? '');
  const [rulesSaved, setRulesSaved] = useState(false);

  // Přegenerování harmonogramu
  const [regenDate, setRegenDate] = useState(tournament.settings.startDate);
  const [regenTime, setRegenTime] = useState(tournament.settings.startTime);
  const [regenDuration, setRegenDuration] = useState(tournament.settings.matchDurationMinutes);
  const [regenBreak, setRegenBreak] = useState(tournament.settings.breakBetweenMatchesMinutes);
  const [regenPitches, setRegenPitches] = useState(tournament.settings.numberOfPitches ?? 1);
  const [regenSaved, setRegenSaved] = useState(false);

  // Tiebreaker criteria drag & drop
  const [tbOrder, setTbOrder] = useState<TiebreakerCriterion[]>(
    tournament.settings.tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER,
  );
  const [tbDragIdx, setTbDragIdx] = useState<number | null>(null);
  const [tbDragOverIdx, setTbDragOverIdx] = useState<number | null>(null);
  const [tbSaved, setTbSaved] = useState(false);

  // Team removal
  const [teamRemoved, setTeamRemoved] = useState(false);

  const deleteTournament = useTournamentStore(s => s.deleteTournament);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const regenerateSchedule = useTournamentStore(s => s.regenerateSchedule);
  const removeTeam = useTournamentStore(s => s.removeTeam);

  useEffect(() => {
    generateQRCodeDataUrl(tournament.id).then(setQrUrl).catch(() => {});
  }, [tournament.id]);

  const publicUrl = getTournamentPublicUrl(tournament.id);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAdminLink = async () => {
    const adminUrl = getAdminInviteUrl(tournament.id);
    await navigator.clipboard.writeText(adminUrl);
    setAdminCopied(true);
    setTimeout(() => setAdminCopied(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Smazat turnaj "${tournament.name}"? Tato akce je nevratná.`)) {
      deleteTournament(tournament.id);
      navigate({ name: 'tournament-list' });
    }
  };

  const handlePublicView = () => {
    navigate({ name: 'tournament-public', tournamentId: tournament.id });
  };

  // PDF export
  const [pdfExporting, setPdfExporting] = useState(false);
  const handlePdfExport = async () => {
    setPdfExporting(true);
    try {
      await exportTournamentPdf(tournament, t, locale);
    } catch (err) {
      logger.error('[PDF] Export failed:', err);
      alert(t('pdf.exportFailed'));
    } finally {
      setPdfExporting(false);
    }
  };

  const handleSaveRules = () => {
    updateTournament(tournament.id, { settings: { ...tournament.settings, rules: rulesEdit.trim() || undefined } });
    setRulesSaved(true);
    setTimeout(() => setRulesSaved(false), 2000);
  };

  const handleRegenerate = async () => {
    const scheduledCount = tournament.matches.filter(m => m.status === 'scheduled').length;
    const finishedCount = tournament.matches.filter(m => m.status === 'finished' || m.status === 'live').length;
    const msg = finishedCount > 0
      ? `Přegenerování přepočítá časy ${scheduledCount} naplánovaných zápasů. ${finishedCount} odehraných/živých zápasů zůstane beze změny. Pokračovat?`
      : `Přegenerování přepočítá časy všech ${scheduledCount} zápasů. Pokračovat?`;
    if (!confirm(msg)) return;
    const newSettings = {
      ...tournament.settings,
      startDate: regenDate,
      startTime: regenTime,
      matchDurationMinutes: regenDuration,
      breakBetweenMatchesMinutes: regenBreak,
      numberOfPitches: regenPitches > 1 ? regenPitches : undefined,
    };
    await regenerateSchedule(tournament.id, newSettings);
    setRegenSaved(true);
    setTimeout(() => setRegenSaved(false), 2500);
  };

  // Inline stepper helper for SettingsTab
  const SettingsStepper = ({ value, min, max, onChange, label, unit }: {
    value: number; min: number; max: number;
    onChange: (v: number) => void; label: string; unit: string;
  }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{value} {unit}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value <= min ? 'var(--text-muted)' : 'var(--text)' }}>−</button>
        <span style={{ fontWeight: 800, fontSize: 18, minWidth: 36, textAlign: 'center', color: 'var(--primary)' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}
          style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)', fontWeight: 700, fontSize: 20, color: value >= max ? 'var(--text-muted)' : 'var(--text)' }}>+</button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* QR kód */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, alignSelf: 'flex-start' }}>📱 QR kód pro hosty</h3>
        {qrUrl
          ? <img src={qrUrl} alt="QR kód turnaje" style={{ width: 200, height: 200, borderRadius: 12 }} />
          : <div style={{ width: 200, height: 200, borderRadius: 12, background: 'var(--surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-muted)' }}>{t('tournament.detail.loadingQr')}</div>
        }
        <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.4 }}>
          Naskenováním QR kódu si hosté zobrazí živou tabulku a výsledky.
        </p>
        <button onClick={handleCopy} style={{
          background: copied ? '#2E7D32' : 'var(--primary)', color: '#fff', fontWeight: 700,
          fontSize: 14, padding: '10px 20px', borderRadius: 10, transition: 'background .2s',
        }}>
          {copied ? '✅ Zkopírováno!' : '🔗 Kopírovat odkaz'}
        </button>
        <button onClick={handlePublicView} style={{
          background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
          fontSize: 14, padding: '10px 20px', borderRadius: 10,
        }}>
          👁 Zobrazit jako host
        </button>
      </div>

      {/* Admin invite link — jen pro ownery */}
      {isOwner && (
        <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15 }}>🔑 Odkaz pro rozhodčí</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
            Pošlete tento odkaz rozhodčím nebo spolupořadatelům. Po otevření budou vyzváni k zadání PINu a získají admin přístup k turnaji.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0, fontStyle: 'italic' }}>
            💡 Diváci a rodiče tento odkaz nepotřebují — stačí jim veřejný QR kód výše.
          </p>
          <button onClick={handleCopyAdminLink} style={{
            background: adminCopied ? '#2E7D32' : '#E65100', color: '#fff', fontWeight: 700,
            fontSize: 14, padding: '10px 20px', borderRadius: 10, transition: 'background .2s',
          }}>
            {adminCopied ? '✅ Zkopírováno!' : '🔑 Kopírovat odkaz pro rozhodčí'}
          </button>
        </div>
      )}

      {/* PDF export */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('pdf.downloadPdf')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.4, margin: 0 }}>
          {t('pdf.downloadDesc')}
        </p>
        <button onClick={handlePdfExport} disabled={pdfExporting} style={{
          background: pdfExporting ? 'var(--border)' : 'var(--primary)', color: pdfExporting ? 'var(--text-muted)' : '#fff',
          fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 10,
          cursor: pdfExporting ? 'wait' : 'pointer', transition: 'background .2s',
        }}>
          {pdfExporting ? `⏳ ${t('pdf.generating')}` : `📄 ${t('pdf.downloadPdf')}`}
        </button>
      </div>

      {/* Propozice */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📋 Pravidla / propozice</h3>
        <textarea
          value={rulesEdit}
          onChange={e => { setRulesEdit(e.target.value); setRulesSaved(false); }}
          placeholder="Popis pravidel, délka poločasů, penalty, formát skupin..."
          rows={5}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <button onClick={handleSaveRules} style={{
          background: rulesSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
          fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 10,
          alignSelf: 'flex-start', transition: 'background .2s',
        }}>
          {rulesSaved ? '✅ Uloženo!' : '💾 Uložit propozice'}
        </button>
      </div>

      {/* Správa týmů — odebrání nepřijízdivších */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>👥 {t('tournament.teams.title')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          Pokud tým nepřijel, odeberte ho. Zápasy se přepočítají.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tournament.teams.map(team => {
            const matchCount = tournament.matches.filter(
              m => m.homeTeamId === team.id || m.awayTeamId === team.id,
            ).length;
            return (
              <div key={team.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', background: 'var(--surface-var)', borderRadius: 10,
              }}>
                <TeamBadge team={team} size={14} />
                <span style={{ flex: 1, fontWeight: 600, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {team.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {matchCount} {matchCount === 1 ? 'zápas' : matchCount < 5 ? 'zápasy' : 'zápasů'}
                </span>
                <button
                  onClick={async () => {
                    if (tournament.teams.length <= 2) {
                      alert(t('tournament.teams.minTeams'));
                      return;
                    }
                    const msg = t('tournament.teams.noShowConfirm').replace('{name}', team.name);
                    if (!confirm(msg)) return;
                    await removeTeam(tournament.id, team.id);
                    setTeamRemoved(true);
                    setTimeout(() => setTeamRemoved(false), 2500);
                  }}
                  style={{
                    padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                    background: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2',
                    flexShrink: 0,
                  }}
                >
                  🚫 {t('tournament.teams.noShow')}
                </button>
              </div>
            );
          })}
        </div>
        {teamRemoved && (
          <div style={{
            marginTop: 10, padding: '10px 14px', background: '#E8F5E9', borderRadius: 10,
            fontSize: 13, fontWeight: 700, color: '#2E7D32', textAlign: 'center',
          }}>
            ✅ {t('tournament.teams.removed')}
          </div>
        )}
      </div>
      )}

      {/* Přegenerování harmonogramu — only for owners */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>🔄 Přegenerovat harmonogram</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
          Změňte nastavení a přegenerujte časy zápasů. Odehrané a živé zápasy zůstanou beze změny.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Datum</label>
              <input
                type="date"
                value={regenDate}
                onChange={e => setRegenDate(e.target.value)}
                style={{
                  padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 14, background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Čas zahájení</label>
              <input
                type="time"
                value={regenTime}
                onChange={e => setRegenTime(e.target.value)}
                style={{
                  padding: '8px 10px', borderRadius: 10, border: '1.5px solid var(--border)',
                  fontSize: 14, background: 'var(--bg)', color: 'var(--text)', width: '100%', boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <SettingsStepper label="Délka zápasu" value={regenDuration} min={1} max={120} onChange={setRegenDuration} unit="min" />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <SettingsStepper label="Přestávka" value={regenBreak} min={0} max={15} onChange={setRegenBreak} unit="min" />
          <div style={{ height: 1, background: 'var(--border)' }} />
          <SettingsStepper label={t('tournament.detail.pitchCountLabel')} value={regenPitches} min={1} max={8} onChange={setRegenPitches} unit={t('tournament.detail.pitchUnit')} />
        </div>
        <button
          onClick={handleRegenerate}
          disabled={!regenDate || !regenTime}
          style={{
            background: regenSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 10,
            transition: 'background .2s', opacity: (!regenDate || !regenTime) ? 0.5 : 1,
          }}
        >
          {regenSaved ? '✅ Harmonogram přegenerován!' : '🔄 Přegenerovat harmonogram'}
        </button>
      </div>
      )}

      {/* Viditelnost střelců + Chat — toggley */}
      {isOwner && (
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Scorer visibility */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>⚽ {t('tournament.scorers.visibilityTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.scorers.visibilityDesc')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                onClick={async () => {
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, scorersVisible: val },
                  });
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  background: (tournament.settings.scorersVisible ?? true) === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: (tournament.settings.scorersVisible ?? true) === val ? '#fff' : 'var(--text)',
                  transition: 'background .15s',
                }}
              >
                {val ? `👁 ${t('tournament.scorers.visible')}` : `🔒 ${t('tournament.scorers.hidden')}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* Chat toggle */}
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>💬 {t('tournament.chat.enableTitle')}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{t('tournament.chat.enableDesc')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[true, false].map(val => (
              <button
                key={String(val)}
                onClick={async () => {
                  await updateTournament(tournament.id, {
                    settings: { ...tournament.settings, chatEnabled: val },
                  });
                }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 13,
                  background: (tournament.settings.chatEnabled ?? false) === val ? 'var(--primary)' : 'var(--surface-var)',
                  color: (tournament.settings.chatEnabled ?? false) === val ? '#fff' : 'var(--text)',
                  transition: 'background .15s',
                }}
              >
                {val ? `✅ ${t('tournament.chat.enabled')}` : `❌ ${t('tournament.chat.disabled')}`}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* Kritéria pro umístění v tabulce — drag & drop */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>🏅 {t('tournament.tiebreaker.title')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
          {isOwner ? t('tournament.tiebreaker.desc') : 'V případě shody bodů rozhodují tato kritéria postupně:'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Fixní #1 — Body */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10, opacity: 0.6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
            }}>1</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('tournament.tiebreaker.points')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.tiebreaker.pointsDesc')}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
          </div>

          {/* Draggable criteria */}
          {tbOrder.map((criterion, idx) => {
            const isDragging = tbDragIdx === idx;
            const isDragOver = tbDragOverIdx === idx && tbDragIdx !== idx;
            return (
              <div
                key={criterion}
                draggable={isOwner}
                onDragStart={() => { setTbDragIdx(idx); }}
                onDragOver={(e) => { e.preventDefault(); setTbDragOverIdx(idx); }}
                onDrop={() => {
                  if (tbDragIdx === null || tbDragIdx === idx) { setTbDragIdx(null); setTbDragOverIdx(null); return; }
                  setTbOrder(prev => {
                    const next = [...prev];
                    const [moved] = next.splice(tbDragIdx, 1);
                    next.splice(idx, 0, moved);
                    return next;
                  });
                  setTbDragIdx(null);
                  setTbDragOverIdx(null);
                  setTbSaved(false);
                }}
                onDragEnd={() => { setTbDragIdx(null); setTbDragOverIdx(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10,
                  opacity: isDragging ? 0.4 : 1,
                  borderTop: isDragOver ? '2.5px solid var(--primary)' : '2.5px solid transparent',
                  transition: 'opacity .15s, border-color .15s',
                  cursor: isOwner ? 'grab' : 'default',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
                }}>{idx + 2}</div>
                {isOwner && <span style={{ cursor: 'grab', fontSize: 14, color: 'var(--text-muted)', flexShrink: 0, userSelect: 'none' }}>⠿</span>}
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(`tournament.tiebreaker.${criterion}`)}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t(`tournament.tiebreaker.${criterion}Desc`)}</span>
                </div>
              </div>
            );
          })}

          {/* Fixní poslední — Abeceda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', background: 'var(--surface-var)', borderRadius: 10, opacity: 0.6 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 11, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0,
            }}>{tbOrder.length + 2}</div>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('tournament.tiebreaker.alphabet')}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— {t('tournament.tiebreaker.alphabetDesc')}</span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>🔒</span>
          </div>
        </div>

        {/* Tlačítko Uložit (jen owner) */}
        {isOwner && (
          <button
            onClick={async () => {
              await updateTournament(tournament.id, {
                settings: { ...tournament.settings, tiebreakerOrder: tbOrder },
              });
              setTbSaved(true);
              setTimeout(() => setTbSaved(false), 2000);
            }}
            style={{
              marginTop: 12, width: '100%',
              background: tbSaved ? '#2E7D32' : 'var(--primary)', color: '#fff',
              fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 10,
              transition: 'background .2s',
            }}
          >
            {tbSaved ? `✅ ${t('tournament.tiebreaker.saved')}` : `💾 ${t('tournament.tiebreaker.title')}`}
          </button>
        )}
      </div>

      {/* Informace */}
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>ℹ️ Informace</h3>
        {[
          { label: 'Délka zápasu', value: `${tournament.settings.matchDurationMinutes} min` },
          { label: 'Přestávka', value: `${tournament.settings.breakBetweenMatchesMinutes} min` },
          { label: 'Počet týmů', value: String(tournament.teams.length) },
          { label: 'Celkem zápasů', value: String(tournament.matches.length) },
        ].map(({ label, value }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 600 }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Nebezpečná zóna */}
      {isOwner ? (
        <button onClick={handleDelete} style={{
          background: '#FFEBEE', color: '#C62828', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #FFCDD2',
        }}>
          🗑 Smazat turnaj
        </button>
      ) : (
        <button onClick={async () => {
          if (confirm('Opustit turnaj? Nebudete ho mít ve svém seznamu.')) {
            await leaveTournament(tournament.id);
            navigate({ name: 'tournament-list' });
          }
        }} style={{
          background: '#FFF3E0', color: '#E65100', fontWeight: 700, fontSize: 14,
          padding: '14px', borderRadius: 14, border: '1.5px solid #FFE0B2',
        }}>
          🚪 Opustit turnaj
        </button>
      )}
    </div>
  );
}

// ─── PIN gate ─────────────────────────────────────────────────────────────────
function PinGate({ tournament, onVerified, onClose }: { tournament: Tournament; onVerified: () => void; onClose?: () => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (input.length < 4) { setError('PIN musí mít alespoň 4 číslice'); return; }
    setLoading(true);
    const ok = await verifyPin(input, tournament.pinHash, tournament.pinSalt);
    setLoading(false);
    if (ok) {
      markPinVerified(tournament.id);
      onVerified();
    } else {
      setError('Nesprávný PIN. Zkuste to znovu.');
      setInput('');
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 20, padding: '28px 24px',
        width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <h2 style={{ fontWeight: 800, fontSize: 20 }}>Zadejte PIN organizátora</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6 }}>
            Pro zápis výsledků je vyžadován PIN.
          </p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={6}
          value={input}
          onChange={e => { setInput(e.target.value.replace(/\D/g, '')); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleVerify()}
          placeholder="••••"
          autoFocus
          style={{
            width: '100%', padding: '14px', borderRadius: 12, fontSize: 24,
            border: `2px solid ${error ? '#C62828' : 'var(--border)'}`,
            background: 'var(--bg)', color: 'var(--text)', letterSpacing: 10,
            textAlign: 'center', boxSizing: 'border-box',
          }}
        />
        {error && <div style={{ color: '#C62828', fontSize: 13, textAlign: 'center' }}>⚠️ {error}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          {onClose && (
            <button onClick={onClose} style={{
              flex: 1, padding: '14px', borderRadius: 12,
              fontWeight: 700, fontSize: 16, cursor: 'pointer',
              background: 'var(--bg)', color: 'var(--text-muted)',
              border: '1.5px solid var(--border)',
            }}>
              Zpět
            </button>
          )}
          <button onClick={handleVerify} disabled={loading || input.length < 4} style={{
            flex: 1, background: loading || input.length < 4 ? 'var(--border)' : 'var(--primary)',
            color: loading || input.length < 4 ? 'var(--text-muted)' : '#fff',
            fontWeight: 700, fontSize: 16, padding: '14px', borderRadius: 12,
          }}>
            {loading ? 'Ověřuji…' : 'Potvrdit PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function TournamentDetailPage({ tournamentId, navigate }: Props) {
  const [tab, setTab] = useState<Tab>('matches');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);

  const tournament = useTournamentStore(s => s.getTournamentById(tournamentId));
  const isOwner = useTournamentStore(s => s.isOwner(tournamentId));
  const leaveTournament = useTournamentStore(s => s.leaveTournament);

  const [pinVerified, setPinVerified] = useState(() => isPinVerified(tournamentId) || !isOwner);
  const startMatch = useTournamentStore(s => s.startMatch);
  const finishMatch = useTournamentStore(s => s.finishMatch);
  const addGoal = useTournamentStore(s => s.addGoal);
  const removeLastGoal = useTournamentStore(s => s.removeLastGoal);
  const removeGoal = useTournamentStore(s => s.removeGoal);
  const updateGoalPlayer = useTournamentStore(s => s.updateGoalPlayer);
  const reopenMatch = useTournamentStore(s => s.reopenMatch);
  const resetMatch = useTournamentStore(s => s.resetMatch);
  const pauseMatch = useTournamentStore(s => s.pauseMatch);
  const resumeMatch = useTournamentStore(s => s.resumeMatch);
  const cancelMatchStore = useTournamentStore(s => s.cancelMatch);
  const reorderMatchesStore = useTournamentStore(s => s.reorderMatches);
  const addPlayer = useTournamentStore(s => s.addPlayer);
  const removePlayer = useTournamentStore(s => s.removePlayer);
  const updatePlayer = useTournamentStore(s => s.updatePlayer);
  const updateTeamName = useTournamentStore(s => s.updateTeamName);
  const [rosterTeamId, setRosterTeamId] = useState<string | null>(null);

  if (!tournament) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 40 }}>😕</div>
        <p>Turnaj nenalezen</p>
        <button onClick={() => navigate({ name: 'tournament-list' })} style={{ color: 'var(--primary)', fontWeight: 700 }}>← Zpět</button>
      </div>
    );
  }

  const liveMatch = tournament.matches.find(m => m.status === 'live');


  const handleQuickGoal = (matchId: string, teamId: string, playerId: string | null) => {
    if (!pinVerified) return;
    const match = tournament.matches.find(m => m.id === matchId);
    if (!match) return;
    addGoal(tournamentId, matchId, {
      teamId,
      playerId,
      isOwnGoal: false,
      minute: computeCurrentMinute(match.startedAt, match.pausedAt, match.pausedElapsed),
    });
  };

  const handleStartMatchInline = (matchId: string) => {
    if (!pinVerified) return;
    startMatch(tournamentId, matchId);
  };

  const handleFinishMatchConfirm = (matchId: string) => {
    if (!pinVerified) return;
    if (confirm('Ukončit zápas?')) {
      finishMatch(tournamentId, matchId);
    }
  };

  const handlePauseMatch = (matchId: string) => {
    if (!pinVerified) return;
    pauseMatch(tournamentId, matchId);
  };

  const handleResumeMatch = (matchId: string) => {
    if (!pinVerified) return;
    resumeMatch(tournamentId, matchId);
  };

  const STATUS_LABELS: Record<string, string> = {
    draft: 'Příprava', active: 'Probíhá', finished: 'Ukončen',
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'matches', label: '⚽ Zápasy' },
    { id: 'standings', label: '🏅 Tabulka' },
    { id: 'scorers', label: '🥇 Střelci' },
    { id: 'settings', label: '⚙️ Nastavení' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
          <button onClick={() => navigate({ name: 'tournament-list' })} style={{
            width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
            fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>←</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontWeight: 800, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              🏆 {tournament.name}
            </h1>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {STATUS_LABELS[tournament.status]} · {tournament.teams.length} týmů
            </div>
          </div>
          {!pinVerified && (
            <button onClick={() => setShowPinGate(true)} style={{
              background: 'var(--surface-var)', color: 'var(--text-muted)', fontSize: 12,
              fontWeight: 600, padding: '6px 10px', borderRadius: 8, flexShrink: 0,
            }}>🔐 PIN</button>
          )}
          {pinVerified && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#2E7D32', fontWeight: 600, padding: '4px 8px', background: '#E8F5E9', borderRadius: 8 }}>
                ✅ Admin
              </span>
              {!isOwner && (
                <button
                  onClick={() => {
                    if (confirm('Opustit turnaj? Nebudete ho mít ve svém seznamu.')) {
                      leaveTournament(tournamentId);
                      navigate({ name: 'tournament-list' });
                    }
                  }}
                  title="Opustit turnaj"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#FFEBEE', border: '1.5px solid #FFCDD2',
                    cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  }}
                >
                  🚪
                </button>
              )}
            </div>
          )}
        </div>

        {/* Live banner */}
        {liveMatch && (
          <div style={{
            background: '#C62828', color: '#fff', padding: '6px 16px',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: '#fff' }} />
            ŽIVĚ: {tournament.teams.find(t => t.id === liveMatch.homeTeamId)?.name} {liveMatch.homeScore}:{liveMatch.awayScore} {tournament.teams.find(t => t.id === liveMatch.awayTeamId)?.name}
          </div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', padding: '0 16px', gap: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '10px 6px', fontWeight: 600, fontSize: 13,
              color: tab === t.id ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.id ? '2.5px solid var(--primary)' : '2.5px solid transparent',
              transition: 'all .15s',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'standings' && <StandingsTab tournament={tournament} onTeamClick={setRosterTeamId} isOwner={isOwner} />}
        {tab === 'matches' && (
          <MatchesTab
            tournament={tournament}
            isVerified={pinVerified}
            onQuickGoal={handleQuickGoal}
            onStartMatch={handleStartMatchInline}
            onFinishMatchConfirm={handleFinishMatchConfirm}
            onPauseMatch={handlePauseMatch}
            onResumeMatch={handleResumeMatch}
            onEditMatch={setSelectedMatch}
            onCancelMatch={isOwner ? (matchId) => cancelMatchStore(tournamentId, matchId) : undefined}
            onReorderMatches={isOwner ? (ids) => reorderMatchesStore(tournamentId, ids) : undefined}
          />
        )}
        {tab === 'scorers' && <ScorersTab tournament={tournament} />}
        {tab === 'settings' && <SettingsTab tournament={tournament} navigate={navigate} isOwner={isOwner} leaveTournament={leaveTournament} />}
      </div>

      {/* PIN gate */}
      {showPinGate && (
        <PinGate
          tournament={tournament}
          onVerified={() => { setPinVerified(true); setShowPinGate(false); }}
          onClose={() => setShowPinGate(false)}
        />
      )}

      {/* Score modal */}
      {selectedMatch && (
        <ScoreModal
          match={selectedMatch}
          tournament={tournament}
          onClose={() => setSelectedMatch(null)}
          onStart={() => {
            startMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(prev => prev ? { ...prev, status: 'live', startedAt: new Date().toISOString() } : null);
          }}
          onFinish={() => {
            finishMatch(tournamentId, selectedMatch.id);
            setSelectedMatch(null);
          }}
          onAddGoal={goal => {
            addGoal(tournamentId, selectedMatch.id, goal);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveLastGoal={() => {
            removeLastGoal(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onRemoveGoal={goalId => {
            removeGoal(tournamentId, selectedMatch.id, goalId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onUpdateGoalPlayer={(goalId, playerId) => {
            updateGoalPlayer(tournamentId, selectedMatch.id, goalId, playerId);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReopen={() => {
            reopenMatch(tournamentId, selectedMatch.id);
            const updated = useTournamentStore.getState().getTournamentById(tournamentId);
            const updatedMatch = updated?.matches.find(m => m.id === selectedMatch.id);
            if (updatedMatch) setSelectedMatch(updatedMatch);
          }}
          onReset={() => {
            resetMatch(tournamentId, selectedMatch.id);
          }}
        />
      )}

      {/* Roster modal */}
      {rosterTeamId && tournament && pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          onAddPlayer={(teamId, p) => addPlayer(tournamentId, teamId, p)}
          onRemovePlayer={(teamId, playerId) => removePlayer(tournamentId, teamId, playerId)}
          onUpdatePlayer={(teamId, playerId, updates) => updatePlayer(tournamentId, teamId, playerId, updates)}
          onUpdateTeamName={(teamId, name) => updateTeamName(tournamentId, teamId, name)}
        />
      )}
      {/* Roster modal pro hosta (jen čtení) */}
      {rosterTeamId && tournament && !pinVerified && (
        <RosterModal
          tournament={tournament}
          teamId={rosterTeamId}
          onClose={() => setRosterTeamId(null)}
          readOnly
        />
      )}
    </div>
  );
}
