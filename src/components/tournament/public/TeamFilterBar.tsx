import type { Tournament } from '../../../types/tournament.types';
import { useI18n } from '../../../i18n';
import { PublicTeamBadge } from './PublicTeamBadge';
import { Dropdown } from '../../ui/Dropdown';
import type { DropdownItem } from '../../ui/Dropdown';

export function TeamFilterBar({ tournament, selectedTeamId, onSelect }: {
  tournament: Tournament;
  selectedTeamId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const selectedTeam = selectedTeamId ? tournament.teams.find(tm => tm.id === selectedTeamId) : null;
  const color = selectedTeam?.color ?? 'var(--primary)';

  const items: DropdownItem[] = [
    {
      id: '__all__',
      label: t('tournament.public.filterAll'),
      icon: <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>,
      active: selectedTeamId === null,
      right: selectedTeamId === null ? <span style={{ color: 'var(--primary)' }}>✓</span> : undefined,
      separator: true,
      onClick: () => onSelect(null),
    },
    ...tournament.teams.map(team => ({
      id: team.id,
      label: team.name,
      icon: <PublicTeamBadge team={team} size={18} />,
      active: selectedTeamId === team.id,
      accentColor: selectedTeamId === team.id ? (team.color ?? 'var(--primary)') : undefined,
      right: selectedTeamId === team.id
        ? <span style={{ color: team.color ?? 'var(--primary)' }}>✓</span>
        : undefined,
      onClick: () => onSelect(team.id),
    })),
  ];

  return (
    <div style={{
      padding: '10px 16px', flexShrink: 0,
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <Dropdown
        trigger={
          <div style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {selectedTeam ? (
              <PublicTeamBadge team={selectedTeam} size={16} />
            ) : (
              <span style={{ fontSize: 15, lineHeight: 1 }}>⚽</span>
            )}
            <span style={{
              flex: 1, fontWeight: 700, fontSize: 14, textAlign: 'left',
              color: selectedTeam ? 'var(--text)' : 'var(--primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {selectedTeam ? selectedTeam.name : t('tournament.public.selectTeam')}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: selectedTeam ? color : 'var(--primary)',
            }}>▾</span>
          </div>
        }
        triggerStyle={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 12,
          border: selectedTeam
            ? `2.5px solid ${color}`
            : '2px dashed var(--primary)',
          background: selectedTeam
            ? `${color}18`
            : 'var(--primary-light)',
          textAlign: 'left',
        }}
        items={items}
        align="left"
        width="100%"
      />
    </div>
  );
}
