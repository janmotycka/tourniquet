import { useState } from 'react';
import type { SeasonMatch, PlayerRating } from '../../types/match.types';
import { useMatchesStore } from '../../store/matches.store';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';
import { StarRating } from './StarRating';

type AttrKey = 'effort' | 'technique' | 'teamwork' | 'behavior';
const ATTR_KEYS: AttrKey[] = ['effort', 'technique', 'teamwork', 'behavior'];
const QUICK_EMOJIS = ['👏', '💪', '🌟', '🔥', '🥇', '🎯'];

function MiniStarRating({ value, onChange }: { value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {([1, 2, 3, 4, 5] as const).map(star => (
        <button
          key={star}
          onClick={() => onChange(star)}
          style={{
            fontSize: 16, lineHeight: 1, padding: 1, borderRadius: 3,
            color: star <= value ? '#FFB300' : 'var(--border)',
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function RatingsTab({ match }: { match: SeasonMatch }) {
  const { t } = useI18n();
  const saveRatings = useMatchesStore(s => s.saveRatings);
  const [ratings, setRatings] = useState<PlayerRating[]>(match.ratings.length > 0 ? match.ratings : []);
  const [note, setNote] = useState(match.note ?? '');
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const allPlayers = [...match.lineup].sort((a, b) => {
    if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
    return a.jerseyNumber - b.jerseyNumber;
  });

  const getRating = (playerId: string): PlayerRating | undefined =>
    ratings.find(r => r.playerId === playerId);

  const getStars = (playerId: string): number =>
    getRating(playerId)?.stars ?? 0;

  const getAttr = (playerId: string, key: AttrKey): number =>
    getRating(playerId)?.attributes?.[key] ?? 0;

  const getEmoji = (playerId: string): string | undefined =>
    getRating(playerId)?.emoji;

  const upsertRating = (playerId: string, patch: Partial<PlayerRating>) => {
    setRatings(prev => {
      const idx = prev.findIndex(r => r.playerId === playerId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        return next;
      }
      // Require stars on creation — if patch doesn't include stars, default to 1
      const stars = (patch.stars ?? 1) as 1 | 2 | 3 | 4 | 5;
      return [...prev, { playerId, stars, ...patch }];
    });
    setSaved(false);
  };

  const setStars = (playerId: string, stars: 1 | 2 | 3 | 4 | 5) => {
    upsertRating(playerId, { stars });
  };

  const setAttribute = (playerId: string, key: AttrKey, value: 1 | 2 | 3 | 4 | 5) => {
    const existing = getRating(playerId);
    const currentAttrs = existing?.attributes ?? {};
    upsertRating(playerId, { attributes: { ...currentAttrs, [key]: value } });
  };

  const toggleEmoji = (playerId: string, emoji: string) => {
    const current = getEmoji(playerId);
    upsertRating(playerId, { emoji: current === emoji ? undefined : emoji });
  };

  const toggleExpanded = (playerId: string) => {
    setExpanded(prev => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const handleSave = () => {
    saveRatings(match.id, ratings, note.trim() || undefined);
    setSaved(true);
    useToastStore.getState().show('success', t('toast.ratingsSaved'));
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {match.status !== 'finished' && (
        <div style={{
          background: 'var(--warning-light)', borderRadius: 12, padding: '10px 14px',
          fontSize: 13, color: 'var(--warning)', fontWeight: 600,
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
        {allPlayers.map(p => {
          const isOpen = !!expanded[p.playerId];
          const currentEmoji = getEmoji(p.playerId);
          return (
            <div key={p.playerId} style={{
              display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}>
              {/* Main row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
                {currentEmoji && (
                  <span style={{ fontSize: 16 }}>{currentEmoji}</span>
                )}
                <StarRating value={getStars(p.playerId)} onChange={stars => setStars(p.playerId, stars)} />
              </div>

              {/* Expand toggle */}
              <button
                onClick={() => toggleExpanded(p.playerId)}
                style={{
                  alignSelf: 'flex-start', background: 'transparent', border: 'none',
                  padding: '2px 0', cursor: 'pointer',
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <span>{isOpen ? '▲' : '▼'}</span>
                <span>{t('match.ratings.detailed')}</span>
              </button>

              {/* Expanded details */}
              {isOpen && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '8px 10px', borderRadius: 10,
                  background: 'var(--bg)',
                }}>
                  {/* Attributes */}
                  {ATTR_KEYS.map(key => (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                        {t(`match.ratings.${key}`)}
                      </span>
                      <MiniStarRating
                        value={getAttr(p.playerId, key)}
                        onChange={v => setAttribute(p.playerId, key, v)}
                      />
                    </div>
                  ))}

                  {/* Quick emoji row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
                    paddingTop: 6, borderTop: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginRight: 4 }}>
                      {t('match.ratings.emoji')}
                    </span>
                    {QUICK_EMOJIS.map(emoji => {
                      const active = currentEmoji === emoji;
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleEmoji(p.playerId, emoji)}
                          style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: active ? 'var(--primary-light)' : 'var(--surface-var)',
                            border: active ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                            fontSize: 16, lineHeight: 1, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
            background: saved ? 'var(--success)' : 'var(--primary)', color: '#fff',
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
