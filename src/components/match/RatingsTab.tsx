import { useState } from 'react';
import type { SeasonMatch, PlayerRating } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';
import { StarRating } from './StarRating';

export function RatingsTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const saveRatings = useMatchesStore(s => s.saveRatings);
  const [ratings, setRatings] = useState<PlayerRating[]>(match.ratings.length > 0 ? match.ratings : []);
  const [note, setNote] = useState(match.note ?? '');
  const [saved, setSaved] = useState(false);

  const allPlayers = [...match.lineup].sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return a.jerseyNumber - b.jerseyNumber;
  });

  const getRating = (playerId: string): number =>
    ratings.find(r => r.playerId === playerId)?.stars ?? 0;

  const setRating = (playerId: string, stars: 1 | 2 | 3 | 4 | 5) => {
    setRatings(prev => {
      const existing = prev.findIndex(r => r.playerId === playerId);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = { ...next[existing], stars };
        return next;
      }
      return [...prev, { playerId, stars }];
    });
    setSaved(false);
  };

  const handleSave = () => {
    saveRatings(match.id, ratings, note.trim() || undefined);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {match.status !== 'finished' && (
        <div style={{
          background: '#FFF3E0', borderRadius: 12, padding: '10px 14px',
          fontSize: 13, color: '#E65100', fontWeight: 600,
        }}>
          💡 {t('match.ratings.availableAfter')}
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>⭐ {t('match.ratings.playerRatings')}</h3>
        {allPlayers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👕</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{t('match.ratings.noLineup')}</div>
          </div>
        )}
        {allPlayers.map(p => (
          <div key={p.playerId} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: p.isStarter ? 'var(--primary)' : 'var(--surface-var)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: p.isStarter ? '#fff' : 'var(--text)',
            }}>
              {p.jerseyNumber}
            </div>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.name}
            </span>
            <StarRating value={getRating(p.playerId)} onChange={stars => setRating(p.playerId, stars)} />
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>📝 {t('match.ratings.coachNote')}</h3>
        <textarea
          value={note}
          onChange={e => { setNote(e.target.value); setSaved(false); }}
          placeholder={t('match.detail.notesPlaceholder')}
          rows={4}
          style={{
            width: '100%', padding: '10px', borderRadius: 10, border: '1.5px solid var(--border)',
            fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            resize: 'vertical', lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSave}
          style={{
            background: saved ? '#2E7D32' : 'var(--primary)', color: '#fff',
            fontWeight: 700, fontSize: 14, padding: '12px 20px', borderRadius: 10,
            alignSelf: 'flex-start', transition: 'background .2s',
          }}
        >
          {saved ? t('match.detail.saved') : t('match.detail.saveRatings')}
        </button>
      </div>
    </div>
  );
}
