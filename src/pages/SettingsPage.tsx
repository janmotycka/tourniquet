import { useState } from 'react';
import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';
import { useSubscriptionStore } from '../store/subscription.store';
import { useTournamentStore } from '../store/tournament.store';
import { useMatchesStore } from '../store/matches.store';
import { useClubsStore } from '../store/clubs.store';
import { useTrainingsStore } from '../store/trainings.store';
import { useContactsStore } from '../store/contacts.store';
import { useUserPrefsStore } from '../store/userPrefs.store';
import { useToastStore } from '../store/toast.store';
import { useI18n, getCurrencyForLocale, getDateLocale } from '../i18n';
import type { Locale } from '../i18n';
import { useTheme } from '../theme/ThemeContext';
import type { ThemePreference } from '../theme/ThemeContext';
import { useLayoutMode } from '../hooks/useLayoutMode';
import { ADMIN_UID } from '../constants/admin';
import { PageHeader } from '../components/ui';

interface Props { navigate: (p: Page) => void; }

export function SettingsPage({ navigate }: Props) {
  const { user, logout } = useAuth();
  const subscription = useSubscriptionStore(s => s.subscription);
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const getLimits = useSubscriptionStore(s => s.getLimits);
  const createCheckoutSession = useSubscriptionStore(s => s.createCheckoutSession);
  const openCustomerPortal = useSubscriptionStore(s => s.openCustomerPortal);
  const tournaments = useTournamentStore(s => s.tournaments);
  const matches = useMatchesStore(s => s.matches);
  const clubs = useClubsStore(s => s.clubs);
  const trainings = useTrainingsStore(s => s.savedTrainings);
  const contacts = useContactsStore(s => s.contacts);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const setPreferredSport = useUserPrefsStore(s => s.setPreferredSport);
  const tennisUserType = useUserPrefsStore(s => s.tennisUserType);
  const setTennisUserType = useUserPrefsStore(s => s.setTennisUserType);
  const appMode = useUserPrefsStore(s => s.appMode);
  const setAppMode = useUserPrefsStore(s => s.setAppMode);
  const ensureActiveClubMatchesSport = useClubsStore(s => s.ensureActiveClubMatchesSport);
  // Wrapper — po změně sportu přepne aktivní klub na klub daného sportu.
  const handleSportSwitch = async (sp: 'football' | 'tennis') => {
    setPreferredSport(sp);
    await ensureActiveClubMatchesSport(sp);
  };
  const showToast = useToastStore(s => s.show);
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { isDesktop } = useLayoutMode();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    setError('');
    try {
      const currency = getCurrencyForLocale(locale);
      const url = await createCheckoutSession(currency);
      if (url) {
        window.location.href = url;
      } else {
        setError(t('settings.checkoutError'));
      }
    } catch {
      setError(t('settings.stripeError'));
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setLoading(true);
    setError('');
    try {
      const url = await openCustomerPortal();
      if (url) {
        window.location.href = url;
      } else {
        setError(t('settings.portalError'));
      }
    } catch {
      setError(t('settings.stripeError'));
    } finally {
      setLoading(false);
    }
  };

  const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    free:      { label: t('settings.statusFree'),      color: '#5D4037', bg: '#EFEBE9' },
    active:    { label: t('settings.statusActive'),    color: '#1B5E20', bg: 'var(--success-light)' },
    past_due:  { label: t('settings.statusPastDue'),   color: 'var(--warning)', bg: 'var(--warning-light)' },
    cancelled: { label: t('settings.statusCancelled'), color: '#B71C1C', bg: 'var(--danger-light)' },
  };
  const st = statusLabels[subscription.status] ?? statusLabels.free;

  const dateLocale = getDateLocale(locale);

  const cardStyle = {
    background: 'var(--surface)', borderRadius: isDesktop ? 12 : 14, padding: isDesktop ? 16 : 20,
    boxShadow: 'var(--shadow-sm)',
    display: 'flex' as const, flexDirection: 'column' as const, gap: isDesktop ? 10 : 12,
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header — only mobile (desktop already has shell breadcrumb) */}
      {!isDesktop && (
        <PageHeader
          title={t('settings.title')}
          onBack={() => navigate({ name: 'home' })}
        />
      )}

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isDesktop ? '24px 24px 32px' : '20px',
        display: 'flex', flexDirection: 'column',
        gap: isDesktop ? 14 : 20,
        width: '100%',
        maxWidth: isDesktop ? 720 : undefined,
        alignSelf: isDesktop ? 'center' : undefined,
        boxSizing: 'border-box',
      }}>

        {/* 1. Profil */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.profile')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: 48, height: 48, borderRadius: 12, background: 'var(--primary-light)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
              }}>⚽</div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.displayName ?? t('settings.coach')}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email ?? ''}
              </div>
            </div>
          </div>
        </div>

        {/* 1.4 Režim aplikace — simple vs advanced */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>🎛 {t('settings.mode')}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t('settings.modeDesc')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(['simple', 'advanced'] as const).map(mode => {
              const isActive = appMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setAppMode(mode)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 12,
                    background: isActive ? 'var(--primary-light)' : 'var(--surface-var)',
                    border: isActive ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                  }}
                >
                  <span style={{ fontSize: 22, lineHeight: 1 }}>
                    {mode === 'simple' ? '🟢' : '⚙️'}
                  </span>
                  <span style={{ flex: 1 }}>
                    <span style={{
                      display: 'block', fontWeight: 700, fontSize: 14,
                      color: isActive ? 'var(--primary)' : 'var(--text)',
                    }}>
                      {mode === 'simple' ? t('settings.modeSimple') : t('settings.modeAdvanced')}
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                      {mode === 'simple' ? t('settings.modeSimpleDesc') : t('settings.modeAdvancedDesc')}
                    </span>
                  </span>
                  {isActive && <span style={{ color: 'var(--primary)', fontSize: 18, fontWeight: 800 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 1.5 Sport preference */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>🎯 {t('settings.sport')}</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t('settings.sportDesc')}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['football', 'tennis'] as const).map(sp => {
              const isActive = preferredSport === sp;
              return (
                <button
                  key={sp}
                  onClick={() => void handleSportSwitch(sp)}
                  style={{
                    flex: 1, padding: '14px 10px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                    background: isActive ? 'var(--primary)' : 'var(--surface-var)',
                    color: isActive ? '#fff' : 'var(--text-muted)',
                    border: isActive ? 'none' : '1.5px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{sp === 'football' ? '⚽' : '🎾'}</span>
                  <span>{t(`sport.${sp}`)}</span>
                </button>
              );
            })}
          </div>

          {/* Tennis sub-mód — klubový vs individuální */}
          {preferredSport === 'tennis' && (
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                {t('settings.tennisUserType')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['club', 'individual'] as const).map(type => {
                  const active = tennisUserType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => setTennisUserType(type)}
                      style={{
                        flex: 1, padding: '12px 10px', borderRadius: 10, fontWeight: 700, fontSize: 12,
                        background: active ? (type === 'club' ? '#1565C0' : '#6A1B9A') : 'var(--surface-var)',
                        color: active ? '#fff' : 'var(--text-muted)',
                        border: active ? 'none' : '1.5px solid var(--border)',
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{type === 'club' ? '🏟' : '👤'}</span>
                      <span>{t(`tennisTypePicker.${type}Title`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 2. Subscription */}
        <div style={{ ...cardStyle, gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.subscription')}</h2>
            <span style={{
              background: st.bg, color: st.color, fontSize: 12, fontWeight: 700,
              padding: '4px 12px', borderRadius: 8,
            }}>{st.label}</span>
          </div>

          {isPremium() ? (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)',
                borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1B5E20' }}>
                  {t('settings.premiumActive')}
                </div>
                <div style={{ fontSize: 13, color: 'var(--success)', lineHeight: 1.5 }}>
                  {t('settings.premiumDesc')}
                </div>
                {subscription.currentPeriodEnd && (
                  <div style={{ fontSize: 12, color: '#388E3C', marginTop: 4 }}>
                    {subscription.cancelAtPeriodEnd ? t('settings.endsAt') : t('settings.renewsAt')}: {new Date(subscription.currentPeriodEnd).toLocaleDateString(dateLocale, {
                      day: 'numeric', month: 'long', year: 'numeric',
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={handleManageSubscription}
                disabled={loading}
                style={{
                  background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
                  fontSize: 15, padding: '12px', borderRadius: 12,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? t('common.loading') : t('settings.manageSubscription')}
              </button>
            </>
          ) : (
            <>
              <div style={{
                background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)',
                borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--warning)' }}>
                  {t('settings.freePlan')}
                </div>
                <div style={{ fontSize: 13, color: '#BF360C', lineHeight: 1.5 }}>
                  {t('settings.freePlanDesc')}
                </div>
                {/* Usage bars — napříč sporty (sport-agnostic limity).
                    V tenis módu skrýváme řádek Tréninky (tenis modul je nepoužívá). */}
                {(() => {
                  const limits = getLimits();
                  const isTennis = preferredSport === 'tennis';
                  // Počty filtrujeme podle aktuálního sportu — aby trenér neviděl
                  // cizí limity. Limity jsou sport-agnostic (sdílené pro oba sporty),
                  // ale počet ukazujeme jen pro ten, na který se teď dívá.
                  const tournamentsForSport = tournaments.filter(tt => (tt.sport ?? 'football') === preferredSport);
                  const matchesForSport = matches.filter(m => (m.sport ?? 'football') === preferredSport);
                  const items = [
                    { label: t('settings.usageTournaments'), count: tournamentsForSport.length, max: limits.maxTournaments },
                    { label: t('settings.usageMatches'), count: matchesForSport.length, max: limits.maxMatches },
                    ...(isTennis ? [] : [
                      { label: t('settings.usageTrainings'), count: trainings.length, max: limits.maxSavedTrainings },
                    ]),
                  ];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                      {items.map(item => {
                        const pct = Math.min(100, (item.count / item.max) * 100);
                        const atLimit = item.count >= item.max;
                        return (
                          <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6D4C41', fontWeight: 600 }}>
                              <span>{item.label}</span>
                              <span>{item.count} / {item.max}</span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(191,54,12,.15)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct}%`, height: '100%',
                                background: atLimit ? 'var(--danger)' : 'var(--warning)',
                                transition: 'width .3s',
                              }} />
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 10, color: '#8D6E63', fontStyle: 'italic', marginTop: 2 }}>
                        {t('settings.usageAcrossSports')}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--warning)', marginTop: 4 }}>
                  {t('settings.premiumOffer', { price: t('subscription.price') })}
                </div>
                <button
                  onClick={() => setFeaturesOpen(o => !o)}
                  style={{
                    background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, color: '#BF360C', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <span style={{
                    display: 'inline-block', transition: 'transform .2s',
                    transform: featuresOpen ? 'rotate(90deg)' : 'none', fontSize: 10,
                  }}>&#9658;</span>
                  {featuresOpen ? t('settings.hideDetails') : t('settings.showDetails')}
                </button>
                <div style={{
                  maxHeight: featuresOpen ? 200 : 0,
                  overflow: 'hidden',
                  transition: 'max-height .3s ease',
                }}>
                  <div style={{ fontSize: 12, color: '#BF360C', lineHeight: 1.5 }}>
                    {'\u2022'} {t('settings.premiumFeature1')}{'\n'}
                    {'\u2022'} {t('settings.premiumFeature2')}{'\n'}
                    {'\u2022'} {t('settings.premiumFeature3')}{'\n'}
                    {'\u2022'} {t('settings.premiumFeature4')}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSubscribe}
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                  padding: '14px', borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(230,81,0,.3)',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? t('settings.connecting') : t('settings.tryFree')}
              </button>
            </>
          )}

          {error && (
            <div style={{
              background: 'var(--danger-light)', color: '#B71C1C', fontSize: 13, fontWeight: 600,
              padding: '8px 12px', borderRadius: 8, textAlign: 'center',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* 3. Preferences — Language + Theme merged */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.preferences')}</h2>

          {/* Language */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('settings.language')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['cs', '🇨🇿 Čeština'], ['en', '🇬🇧 English'], ['de', '🇩🇪 Deutsch']] as [Locale, string][]).map(([loc, label]) => (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                    background: locale === loc ? 'var(--primary)' : 'var(--surface-var)',
                    color: locale === loc ? '#fff' : 'var(--text)',
                    border: locale === loc ? 'none' : '1.5px solid var(--border)',
                    transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('settings.theme')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([['light', t('settings.themeLight')], ['dark', t('settings.themeDark')], ['auto', t('settings.themeAuto')]] as [ThemePreference, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setTheme(val)}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 10, fontWeight: 600, fontSize: 14,
                    background: theme === val ? 'var(--primary)' : 'var(--surface-var)',
                    color: theme === val ? '#fff' : 'var(--text)',
                    border: theme === val ? 'none' : '1.5px solid var(--border)',
                    transition: 'all .15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* 4. Feedback */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.feedback')}</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
            {t('settings.feedbackDesc')}
          </p>
          <a
            href={`mailto:feedback@torq.cz?subject=${encodeURIComponent(t('settings.feedbackSubject'))}`}
            style={{
              background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
              fontSize: 15, padding: '12px', borderRadius: 12, textAlign: 'center',
              textDecoration: 'none', border: '1.5px solid var(--border)',
              display: 'block',
            }}
          >
            ✉️ {t('settings.feedbackBtn')}
          </a>
        </div>

        {/* 5. Data Management (GDPR) — collapsible */}
        <div style={cardStyle}>
          <button
            onClick={() => setDataOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              width: '100%', textAlign: 'left',
            }}
          >
            <h2 style={{ fontWeight: 700, fontSize: 16, margin: 0 }}>{t('settings.dataManagement')}</h2>
            <span style={{
              fontSize: 14, color: 'var(--text-muted)', transition: 'transform .2s',
              display: 'inline-block', transform: dataOpen ? 'rotate(90deg)' : 'none',
            }}>&#9658;</span>
          </button>
          <div style={{
            maxHeight: dataOpen ? 500 : 0,
            overflow: 'hidden',
            transition: 'max-height .3s ease',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: dataOpen ? 4 : 0 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                {t('settings.dataManagementDesc')}
              </p>

              {/* Export dat */}
              <button
                onClick={async () => {
                  setExporting(true);
                  try {
                    const data = {
                      exportedAt: new Date().toISOString(),
                      schemaVersion: 1,
                      user: { email: user?.email, displayName: user?.displayName },
                      tournaments,
                      seasonMatches: matches,
                      clubs,
                      trainings,
                      contacts,
                    };
                    const json = JSON.stringify(data, null, 2);
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `torq-backup-${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('success', t('settings.exportDone'));
                  } catch {
                    showToast('error', t('settings.exportFailed'));
                  } finally {
                    setExporting(false);
                  }
                }}
                disabled={exporting}
                style={{
                  background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
                  fontSize: 14, padding: '12px', borderRadius: 12,
                  border: '1.5px solid var(--border)', textAlign: 'center',
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                💾 {exporting ? t('settings.exporting') : t('settings.exportData')}
              </button>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('settings.exportDataDesc')}
              </p>

              {/* CSV export soupisky klubu — pro FAČR / email rodičům */}
              {clubs.length > 0 && (
                <button
                  onClick={() => {
                    try {
                      // Exportuje soupisky všech klubů do jednoho CSV
                      const rows: (string | number)[][] = [];
                      for (const club of clubs) {
                        for (const player of (club.players ?? [])) {
                          if (!player.active) continue;
                          const birthYear = player.birthYear ?? '';
                          rows.push([
                            club.name,
                            player.ageCategory ?? '',
                            player.squad ?? '',
                            player.jerseyNumber,
                            player.name,
                            birthYear,
                            player.position ?? '',
                            player.phone ?? '',
                            player.email ?? '',
                          ]);
                        }
                      }
                      if (rows.length === 0) {
                        showToast('error', t('settings.rosterCsvEmpty'));
                        return;
                      }
                      const headers = [
                        t('settings.rosterCsv.club'),
                        t('settings.rosterCsv.category'),
                        t('settings.rosterCsv.squad'),
                        t('settings.rosterCsv.jersey'),
                        t('settings.rosterCsv.name'),
                        t('settings.rosterCsv.birthYear'),
                        t('settings.rosterCsv.position'),
                        t('settings.rosterCsv.phone'),
                        t('settings.rosterCsv.email'),
                      ];
                      // Escape přesně jako export-csv.ts
                      const escape = (v: string | number): string => {
                        let s = String(v);
                        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
                        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                          return `"${s.replace(/"/g, '""')}"`;
                        }
                        return s;
                      };
                      const csv = '\uFEFF' + [headers, ...rows]
                        .map(row => row.map(escape).join(','))
                        .join('\r\n');
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `torq-soupisky-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast('success', t('settings.rosterCsvDone'));
                    } catch {
                      showToast('error', t('settings.exportFailed'));
                    }
                  }}
                  style={{
                    background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
                    fontSize: 14, padding: '12px', borderRadius: 12,
                    border: '1.5px solid var(--border)', textAlign: 'center',
                  }}
                >
                  📋 {t('settings.exportRosterCsv')}
                </button>
              )}
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                {t('settings.exportRosterCsvDesc')}
              </p>

              {/* Smazani uctu */}
              <div style={{
                background: 'var(--warning-light)', borderRadius: 12, padding: 14,
                display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4,
              }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--warning)' }}>
                  {t('settings.deleteAccount')}
                </div>
                <p style={{ fontSize: 12, color: '#BF360C', lineHeight: 1.5, margin: 0 }}>
                  {t('settings.deleteAccountDesc')}
                </p>
                <a
                  href={`mailto:privacy@torq.cz?subject=${encodeURIComponent(t('settings.deleteAccountSubject'))}`}
                  style={{
                    background: '#FFF', color: 'var(--warning)', fontWeight: 600,
                    fontSize: 13, padding: '10px', borderRadius: 10, textAlign: 'center',
                    textDecoration: 'none', border: '1.5px solid #FFCC80',
                    display: 'block',
                  }}
                >
                  {t('settings.deleteAccountBtn')}
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Legal */}
        <div style={cardStyle}>
          <h2 style={{ fontWeight: 700, fontSize: 16 }}>{t('settings.legal')}</h2>
          <button
            onClick={() => navigate({ name: 'privacy-policy' })}
            style={{
              background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
              fontSize: 14, padding: '12px 16px', borderRadius: 12, textAlign: 'left',
              border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {t('settings.privacyPolicy')}
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          </button>
          <button
            onClick={() => navigate({ name: 'terms-of-service' })}
            style={{
              background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
              fontSize: 14, padding: '12px 16px', borderRadius: 12, textAlign: 'left',
              border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            {t('settings.termsOfService')}
            <span style={{ color: 'var(--text-muted)' }}>→</span>
          </button>
        </div>

        {/* Admin panel — only for admin UID */}
        {user?.uid === ADMIN_UID && (
          <div style={cardStyle}>
            <button
              onClick={() => navigate({ name: 'admin' })}
              style={{
                background: 'var(--surface-var)', color: 'var(--text)', fontWeight: 600,
                fontSize: 14, padding: '12px 16px', borderRadius: 12, textAlign: 'left',
                border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              🛡️ Admin panel
              <span style={{ color: 'var(--text-muted)' }}>→</span>
            </button>
          </div>
        )}

        {/* Beta badge */}
        <div style={{
          textAlign: 'center', fontSize: 12, color: 'var(--text-muted)',
          opacity: 0.6, padding: '4px 0',
        }}>
          🚧 {t('home.betaNotice')}
        </div>

        {/* 7. Logout — always last */}
        <button
          onClick={logout}
          style={{
            background: 'var(--surface)', color: '#B71C1C', fontWeight: 600,
            fontSize: 15, padding: '14px', borderRadius: 14,
            border: '1.5px solid #FFCDD2',
          }}
        >
          {t('settings.logout')}
        </button>

      </div>
    </div>
  );
}
