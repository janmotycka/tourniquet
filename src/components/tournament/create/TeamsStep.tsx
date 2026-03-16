import { useRef } from 'react';
import { useI18n } from '../../../i18n';
import type { TeamDraft } from './types';
import { TEAM_COLORS, colorSwatch, textOnColor } from '../../../utils/team-colors';
import { resizeLogoToBase64 } from './helpers';

interface TeamsStepProps {
  teams: TeamDraft[];
  totalMatches: number;
  totalHours: number;
  remainMinutes: number;
  newPlayerName: Record<number, string>;
  setNewPlayerName: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  newPlayerNumber: Record<number, string>;
  setNewPlayerNumber: React.Dispatch<React.SetStateAction<Record<number, string>>>;
  onAddTeam: () => void;
  onRemoveTeam: (idx: number) => void;
  onUpdateTeam: (idx: number, updates: Partial<TeamDraft>) => void;
  onAddPlayer: (teamIdx: number) => void;
  onRemovePlayer: (teamIdx: number, playerIdx: number) => void;
  onOpenClubPicker: (teamIdx: number) => void;
  logoUploading: Record<number, boolean>;
  setLogoUploading: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
}

export function TeamsStep({
  teams,
  totalMatches,
  totalHours,
  remainMinutes,
  newPlayerName,
  setNewPlayerName,
  newPlayerNumber,
  setNewPlayerNumber,
  onAddTeam,
  onRemoveTeam,
  onUpdateTeam,
  onAddPlayer,
  onRemovePlayer,
  onOpenClubPicker,
  logoUploading,
  setLogoUploading,
}: TeamsStepProps) {
  const { t } = useI18n();
  const logoFileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleLogoUpload = async (teamIdx: number, file: File) => {
    setLogoUploading(prev => ({ ...prev, [teamIdx]: true }));
    try {
      const b64 = await resizeLogoToBase64(file);
      onUpdateTeam(teamIdx, { logoBase64: b64 });
    } finally {
      setLogoUploading(prev => ({ ...prev, [teamIdx]: false }));
    }
  };

  return (
    <>
      {/* Info box */}
      <div style={{ background: 'var(--primary-light)', borderRadius: 14, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: 'var(--primary)', lineHeight: 1.4 }}>
          <b>{t('tournament.create.teamsCount', { count: teams.length })}</b> → <b>{t('tournament.create.matchesCount', { count: totalMatches })}</b>, {t('tournament.create.estimatedTime', { time:
            `${totalHours > 0 ? `${totalHours}h ` : ''}${remainMinutes > 0 ? `${remainMinutes} ${t('common.min')}` : ''}`
          })}
        </div>
      </div>

      {/* Tymy */}
      {teams.map((team, tIdx) => (
        <div key={tIdx} style={{ background: 'var(--surface)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          {/* Zahlavi tymu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
            {/* Logo nebo barevne kolecko */}
            {team.logoBase64 ? (
              <img src={team.logoBase64} alt={team.name} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={colorSwatch(team.color, 32)} />
            )}
            <input
              value={team.name}
              onChange={e => onUpdateTeam(tIdx, { name: e.target.value })}
              maxLength={100}
              style={{
                flex: 1, fontWeight: 700, fontSize: 15, background: 'transparent',
                border: 'none', color: 'var(--text)', outline: 'none',
              }}
            />
            {/* Z klubu */}
            <button onClick={() => onOpenClubPicker(tIdx)} style={{
              padding: '4px 8px', borderRadius: 8, background: 'var(--surface-var)',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap',
            }}>{t('tournament.create.selectClub')}</button>
            <button onClick={() => onUpdateTeam(tIdx, { expanded: !team.expanded })} style={{
              width: 30, height: 30, borderRadius: 8, background: 'var(--surface-var)',
              fontSize: 14, color: 'var(--text-muted)',
            }}>
              {team.expanded ? '▲' : '▼'}
            </button>
            {teams.length > 2 && (
              <button onClick={() => onRemoveTeam(tIdx)} style={{
                width: 30, height: 30, borderRadius: 8, background: '#FFEBEE',
                fontSize: 14, color: '#C62828',
              }}>✕</button>
            )}
          </div>

          {/* Vyber barvy + logo upload */}
          {team.expanded && (
            <div style={{ padding: '0 16px 8px' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.colorLabel')}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {TEAM_COLORS.map(c => (
                  <button key={c} onClick={() => onUpdateTeam(tIdx, { color: c })} style={{
                    ...colorSwatch(c, 28),
                    border: team.color === c ? '3px solid var(--text)' : '3px solid transparent',
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{t('tournament.create.clubLogo')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  ref={el => { logoFileRefs.current[tIdx] = el; }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(tIdx, f); }}
                />
                <button onClick={() => logoFileRefs.current[tIdx]?.click()} style={{
                  background: 'var(--surface-var)', border: '1.5px solid var(--border)',
                  padding: '6px 12px', borderRadius: 8, fontSize: 12, color: 'var(--text)',
                }}>
                  {logoUploading[tIdx] ? t('tournament.create.uploading') : t('tournament.create.uploadLogo')}
                </button>
                {team.logoBase64 && (
                  <button onClick={() => onUpdateTeam(tIdx, { logoBase64: null })} style={{ fontSize: 12, color: 'var(--text-muted)' }}>✕ {t('common.remove')}</button>
                )}
              </div>
            </div>
          )}

          {/* Soupiska */}
          {team.expanded && (
            <div style={{ padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
                {t('tournament.create.roster', { count: team.players.length })}
              </div>

              {team.players.map((p, pIdx) => (
                <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-var)', borderRadius: 8 }}>
                  <span style={{
                    ...colorSwatch(team.color, 28),
                    color: textOnColor(team.color), fontWeight: 700, fontSize: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{p.jerseyNumber}</span>
                  <span style={{ flex: 1, fontSize: 14 }}>{p.name}</span>
                  <button onClick={() => onRemovePlayer(tIdx, pIdx)} style={{
                    fontSize: 14, color: 'var(--text-muted)', padding: '4px',
                  }}>✕</button>
                </div>
              ))}

              {/* Pridat hrace */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                  placeholder={t('tournament.create.jerseyNo')}
                  type="number"
                  min={1} max={99}
                  value={newPlayerNumber[tIdx] ?? ''}
                  onChange={e => setNewPlayerNumber(prev => ({ ...prev, [tIdx]: e.target.value }))}
                  style={{
                    width: 55, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border)',
                    fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
                  }}
                />
                <input
                  placeholder={t('tournament.create.playerName')}
                  value={newPlayerName[tIdx] ?? ''}
                  onChange={e => setNewPlayerName(prev => ({ ...prev, [tIdx]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && onAddPlayer(tIdx)}
                  maxLength={100}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid var(--border)',
                    fontSize: 13, background: 'var(--bg)', color: 'var(--text)',
                  }}
                />
                <button onClick={() => onAddPlayer(tIdx)} style={{
                  background: 'var(--primary)', color: '#fff', fontWeight: 700,
                  padding: '8px 12px', borderRadius: 8, fontSize: 13,
                }}>+</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {teams.length < 16 && (
        <button onClick={onAddTeam} style={{
          background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, fontSize: 15,
          padding: '14px', borderRadius: 14, border: '2px dashed var(--primary)',
        }}>
          {t('tournament.create.addTeam')}
        </button>
      )}
    </>
  );
}
