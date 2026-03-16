import { useI18n } from '../../../i18n';
import type { TournamentFormat } from './types';
import type { TournamentTemplate } from '../../../types/tournament.types';
import { Stepper } from './Stepper';

interface BasicInfoStepProps {
  name: string;
  setName: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  startTime: string;
  setStartTime: (v: string) => void;
  matchDuration: number;
  setMatchDuration: (v: number) => void;
  breakDuration: number;
  setBreakDuration: (v: number) => void;
  numberOfPitches: number;
  setNumberOfPitches: (v: number) => void;
  rules: string;
  setRules: (v: string) => void;
  format: TournamentFormat;
  setFormat: (v: TournamentFormat) => void;
  groupCount: number;
  setGroupCount: (v: number) => void;
  advancePerGroup: number;
  setAdvancePerGroup: (v: number) => void;
  thirdPlaceMatch: boolean;
  setThirdPlaceMatch: (v: boolean) => void;
  templates: TournamentTemplate[];
  onOpenTemplatePicker: () => void;
}

export function BasicInfoStep({
  name, setName,
  startDate, setStartDate,
  startTime, setStartTime,
  matchDuration, setMatchDuration,
  breakDuration, setBreakDuration,
  numberOfPitches, setNumberOfPitches,
  rules, setRules,
  format, setFormat,
  groupCount, setGroupCount,
  advancePerGroup, setAdvancePerGroup,
  thirdPlaceMatch, setThirdPlaceMatch,
  templates, onOpenTemplatePicker,
}: BasicInfoStepProps) {
  const { t } = useI18n();

  return (
    <>
      {/* Ze sablony */}
      {templates.length > 0 && (
        <button onClick={onOpenTemplatePicker} style={{
          background: 'var(--surface)', borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 1px 4px rgba(0,0,0,.05)', width: '100%',
          border: '1.5px dashed var(--primary)', color: 'var(--primary)', fontWeight: 700, fontSize: 14,
        }}>
          <span style={{ fontSize: 18 }}>📋</span>
          {t('template.fromTemplate')} ({templates.length})
        </button>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.name')}</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('tournament.create.namePlaceholder')}
            maxLength={200}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
              fontSize: 15, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.date')}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, display: 'block' }}>{t('tournament.create.startTime')}</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
                fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('tournament.create.matchDurations')}</h3>
        <Stepper label={t('tournament.create.matchDuration')} value={matchDuration} min={1} max={120} step={1} onChange={setMatchDuration} unit={t('common.min')} />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <Stepper label={t('tournament.create.break')} value={breakDuration} min={0} max={15} step={1} onChange={setBreakDuration} unit={t('common.min')} />
        <div style={{ height: 1, background: 'var(--border)' }} />
        <Stepper label={t('tournament.create.pitchCount')} value={numberOfPitches} min={1} max={8} step={1} onChange={setNumberOfPitches} unit="" />
      </div>

      {/* Format turnaje */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 14, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15 }}>{t('knockout.format')}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {([
            ['round-robin', t('knockout.roundRobin'), '🔄'],
            ['groups-knockout', t('knockout.groupsKnockout'), '🏆'],
            ['knockout', t('knockout.pureKnockout'), '⚡'],
          ] as [TournamentFormat, string, string][]).map(([f, label, icon]) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 12, textAlign: 'center',
                background: format === f ? 'var(--primary)' : 'var(--surface-var)',
                color: format === f ? '#fff' : 'var(--text)',
                fontWeight: 600, fontSize: 13, border: 'none',
                transition: 'background .15s',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
              {label}
            </button>
          ))}
        </div>

        {/* Nastaveni pro skupiny+knockout */}
        {format === 'groups-knockout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
            <Stepper label={t('knockout.groupCount')} value={groupCount} min={2} max={4} step={1} onChange={setGroupCount} unit="" />
            <Stepper label={t('knockout.advancePerGroup')} value={advancePerGroup} min={1} max={2} step={1} onChange={setAdvancePerGroup} unit="" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
              <button
                onClick={() => setThirdPlaceMatch(!thirdPlaceMatch)}
                style={{
                  width: 44, height: 26, borderRadius: 13,
                  background: thirdPlaceMatch ? 'var(--primary)' : 'var(--border)',
                  position: 'relative', transition: 'background .2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: 10, background: '#fff',
                  position: 'absolute', top: 3,
                  left: thirdPlaceMatch ? 21 : 3, transition: 'left .2s',
                }} />
              </button>
            </div>
          </div>
        )}

        {/* Nastaveni pro cisty vyrazovak */}
        {format === 'knockout' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{t('knockout.thirdPlace')}</label>
            <button
              onClick={() => setThirdPlaceMatch(!thirdPlaceMatch)}
              style={{
                width: 44, height: 26, borderRadius: 13,
                background: thirdPlaceMatch ? 'var(--primary)' : 'var(--border)',
                position: 'relative', transition: 'background .2s',
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: 10, background: '#fff',
                position: 'absolute', top: 3,
                left: thirdPlaceMatch ? 21 : 3, transition: 'left .2s',
              }} />
            </button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '20px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
        <div>
          <label style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, display: 'block' }}>
            {t('tournament.create.rules')}
            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 12 }}>{t('tournament.create.rulesOptional')}</span>
          </label>
          <textarea
            value={rules}
            onChange={e => setRules(e.target.value)}
            placeholder={t('tournament.create.rulesPlaceholder')}
            maxLength={5000}
            rows={4}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--border)',
              fontSize: 14, background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
              resize: 'vertical', lineHeight: 1.5,
            }}
          />
        </div>
      </div>
    </>
  );
}
