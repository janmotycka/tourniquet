import type { TiebreakerCriterion } from '../../../types/tournament.types';
import { DEFAULT_TIEBREAKER_ORDER } from '../../../types/tournament.types';
import { useI18n } from '../../../i18n';

export function StandingsCriteriaBox({ tiebreakerOrder, penaltyResults }: { tiebreakerOrder?: TiebreakerCriterion[]; penaltyResults?: Array<{ teamAId: string; teamBId: string; teamAScore: number; teamBScore: number }> }) {
  const { t } = useI18n();
  const order = tiebreakerOrder ?? DEFAULT_TIEBREAKER_ORDER;

  // Dynamicky sestavíme seznam: Body (fixní #1), pak nakonfigurované pořadí, pak Abeceda (fixní poslední)
  const items: Array<{ n: string; label: string; desc: string; pending?: boolean }> = [
    { n: '1', label: t('tournament.tiebreaker.points'), desc: t('tournament.tiebreaker.pointsDesc') },
  ];

  order.forEach((criterion, idx) => {
    const isPenalties = criterion === 'penalties';
    const hasPendingPenalties = isPenalties && (!penaltyResults || penaltyResults.length === 0);
    items.push({
      n: String(idx + 2),
      label: t(`tournament.tiebreaker.${criterion}`),
      desc: t(`tournament.tiebreaker.${criterion}Desc`),
      pending: hasPendingPenalties,
    });
  });

  items.push({
    n: String(order.length + 2),
    label: t('tournament.tiebreaker.alphabet'),
    desc: t('tournament.tiebreaker.alphabetDesc'),
  });

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '16px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
      <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{t('tournament.public.criteriaTitle')}</h3>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
        {t('tournament.public.criteriaDesc')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => (
          <div key={item.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 10, background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: 'var(--primary)', flexShrink: 0, marginTop: 1,
            }}>{item.n}</div>
            <div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 5 }}>— {item.desc}</span>
              {item.pending && (
                <span style={{ fontSize: 11, color: '#E65100', marginLeft: 6, fontWeight: 600 }}>
                  ({t('tournament.tiebreaker.penaltyPending')})
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
