/**
 * OnboardingWizard — first-time setup wizard for new coaches.
 *
 * 3 steps:
 *  1. Welcome — uvítací obrazovka s "Začít" / "Přeskočit"
 *  2. Vytvoř svůj klub — název (s katalog autocomplete), barva, věkové
 *     kategorie, volitelné logo
 *  3. Hotovo — potvrzení + 3 next-step cards (importovat hráče / vytvořit
 *     zápas / vytvořit turnaj)
 *
 * Detection: mountuje se z HomePage, když user.clubs.length === 0
 * a uživatel ještě nedokončil onboarding (`torq-onboarded-{uid}` v localStorage).
 *
 * Volá `useClubsStore.createClub()` (která pod kapotou volá CF
 * `createPersonalClub` a nastaví nový klub jako active).
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ref as dbRef, get as dbGet } from 'firebase/database';
import type { Page } from '../../App';
import { db } from '../../firebase';
import { useI18n } from '../../i18n';
import { useAuth } from '../../context/AuthContext';
import { useClubsStore } from '../../store/clubs.store';
import { useToastStore } from '../../store/toast.store';
import { AGE_CATEGORIES, type AgeCategory } from '../../types/club.types';
import { resizeLogoToBase64 } from '../clubs/resize-logo';
import { logger } from '../../utils/logger';
import { radius, fontSize, fontWeight, spacing } from '../../theme/tokens';

// ─── Storage helpers ───────────────────────────────────────────────────────
const ONBOARDED_KEY_PREFIX = 'torq-onboarded-';
export function isOnboarded(uid: string): boolean {
  try {
    return !!localStorage.getItem(`${ONBOARDED_KEY_PREFIX}${uid}`);
  } catch {
    return true; // safe default — pokud nejde číst, neotravujeme
  }
}
function markOnboarded(uid: string) {
  try {
    localStorage.setItem(`${ONBOARDED_KEY_PREFIX}${uid}`, '1');
  } catch {
    /* blocked / quota */
  }
}

// ─── Catalog ───────────────────────────────────────────────────────────────
interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
  logoBase64?: string;
  torqClubId?: string;  // set when club already exists in TORQ
}

async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', headers: { Accept: 'image/*' } });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Color palette ─────────────────────────────────────────────────────────
const CLUB_COLORS = [
  '#1565C0', '#0D47A1', '#2E7D32', '#1B5E20',
  '#C62828', '#E65100', '#6A1B9A', '#283593',
  '#00695C', '#37474F', '#F9A825', '#4E342E',
];

// ─── Props ────────────────────────────────────────────────────────────────
interface Props {
  navigate: (p: Page) => void;
  onComplete: () => void;
}

type Step = 'welcome' | 'club' | 'done';

// ─── Component ─────────────────────────────────────────────────────────────
export function OnboardingWizard({ navigate, onComplete }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createClub = useClubsStore(s => s.createClub);
  const showToast = useToastStore(s => s.show);

  const [step, setStep] = useState<Step>('welcome');

  // Club state
  const [clubName, setClubName] = useState('');
  const [clubColor, setClubColor] = useState(CLUB_COLORS[0]);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<AgeCategory[]>([]);
  const [creating, setCreating] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  // Catalog autocomplete (reused logic from ClubForm)
  const [catalog, setCatalog] = useState<CatalogClub[]>([]);
  const [suggestions, setSuggestions] = useState<CatalogClub[]>([]);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogClub | null>(null);

  useEffect(() => {
    let cancelled = false;
    dbGet(dbRef(db, 'clubsCatalog'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.val() as Record<string, CatalogClub> | null;
        setCatalog(data ? Object.values(data) : []);
      })
      .catch(() => {
        /* katalog je optional — fail silently */
      });
    return () => { cancelled = true; };
  }, []);

  const handleNameChange = useCallback((v: string) => {
    setClubName(v);
    setSelectedCatalog(null);
    if (v.length < 2 || catalog.length === 0) { setSuggestions([]); return; }
    const q = v.toLowerCase();
    const matches = catalog
      .filter(c => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStart - bStart || a.name.localeCompare(b.name);
      })
      .slice(0, 6);
    setSuggestions(matches);
  }, [catalog]);

  const handleCatalogPick = useCallback(async (c: CatalogClub) => {
    setClubName(c.name);
    setSuggestions([]);
    setSelectedCatalog(c);
    if (!logoBase64 && (c.logoBase64 || c.logoUrl)) {
      if (c.logoBase64) {
        setLogoBase64(c.logoBase64);
      } else if (c.logoUrl) {
        setLogoLoading(true);
        const b64 = await urlToBase64(c.logoUrl);
        if (b64) setLogoBase64(b64);
        setLogoLoading(false);
      }
    }
  }, [logoBase64]);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setLogoBase64(b64);
    } catch {
      showToast('error', t('clubs.imageError'));
    } finally {
      setLogoLoading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const toggleCategory = (cat: AgeCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat],
    );
  };

  const finish = useCallback(() => {
    if (user?.uid) markOnboarded(user.uid);
    onComplete();
  }, [user, onComplete]);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const handleCreateClub = async () => {
    if (!clubName.trim() || creating) return;
    setCreating(true);
    try {
      await createClub({
        name: clubName.trim(),
        color: clubColor,
        logoBase64,
        ageCategories: selectedCategories.length > 0 ? selectedCategories : undefined,
      });
      showToast('success', t('onboarding.clubCreated'));
      setStep('done');
    } catch (err) {
      logger.warn('[OnboardingWizard] createClub failed:', err);
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('limit')) {
        showToast('error', t('clubs.shared.createPersonalLimit'));
      } else {
        showToast('error', msg || 'Error');
      }
    } finally {
      setCreating(false);
    }
  };

  const goNext = (target: Page) => {
    finish();
    navigate(target);
  };

  // ─── Modal scaffolding ─────────────────────────────────────────────────
  // Mobile: full-screen sheet. Desktop: centered modal with max-width.
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0,
  };

  const modalStyle: React.CSSProperties = {
    background: 'var(--surface)',
    width: '100%',
    maxWidth: 520,
    height: '100dvh',
    maxHeight: '100dvh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  // Desktop variant — pomocí media query přes wrapping div není snadné
  // udělat čistě, takže používáme matchMedia jednou při mountu.
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 720px)').matches;
  });
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 720px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const desktopModalStyle: React.CSSProperties = isDesktop ? {
    height: 'auto',
    maxHeight: '92dvh',
    borderRadius: radius.xxl,
    boxShadow: '0 24px 64px rgba(0,0,0,.35)',
    margin: '20px',
  } : {};

  // ─── Common shared styles ──────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: radius.lg,
    border: '1.5px solid var(--border)', background: 'var(--bg)',
    fontSize: fontSize.md, fontWeight: fontWeight.medium, color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '14px', borderRadius: radius.lg,
    background: 'var(--primary)', color: '#fff',
    fontWeight: fontWeight.extrabold, fontSize: fontSize.md + 1, cursor: 'pointer',
    border: 'none',
  };

  const btnSecondary: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: radius.lg,
    background: 'transparent', color: 'var(--text-muted)',
    fontWeight: fontWeight.medium, fontSize: fontSize.base, cursor: 'pointer',
    border: 'none',
  };

  // ─── Step indicator (jen pro step "club") ──────────────────────────────
  const showProgress = step === 'club';
  const stepIndex = step === 'welcome' ? 0 : step === 'club' ? 1 : 2;

  // ─── Step rendering helpers ────────────────────────────────────────────

  const welcomeView = useMemo(() => (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: spacing.xl, textAlign: 'center', padding: `${spacing.xl}px ${spacing.lg}px`,
      animation: 'torq-onb-in .4s ease-out',
    }}>
      <div style={{
        fontSize: 72, lineHeight: 1, marginBottom: spacing.xs,
        animation: 'torq-onb-bounce .55s ease-out',
      }}>
        👋
      </div>
      <div>
        <h1 style={{
          margin: 0, fontWeight: 900, fontSize: 28, letterSpacing: -0.5,
          color: 'var(--text)',
        }}>
          {t('onboarding.welcome.title')}
        </h1>
        <p style={{
          margin: `${spacing.md}px auto 0`, color: 'var(--text-muted)',
          fontSize: fontSize.md, lineHeight: 1.55, maxWidth: 360,
        }}>
          {t('onboarding.welcome.subtitle')}
        </p>
      </div>
      <div style={{
        width: '100%', maxWidth: 320, display: 'flex',
        flexDirection: 'column', gap: spacing.sm + 2, marginTop: spacing.md,
      }}>
        <button onClick={() => setStep('club')} style={btnPrimary}>
          {t('onboarding.welcome.start')}
        </button>
        <button onClick={skip} style={btnSecondary}>
          {t('onboarding.welcome.skip')}
        </button>
      </div>
    </div>
  ), [t, btnPrimary, btnSecondary, skip]);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label={t('onboarding.welcome.title')}>
      <style>{`
        @keyframes torq-onb-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes torq-onb-bounce { 0% { transform: scale(.5); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      <div style={{ ...modalStyle, ...desktopModalStyle }}>
        {/* Progress bar */}
        {showProgress && (
          <div style={{ padding: `${spacing.md}px ${spacing.lg}px 0`, display: 'flex', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i <= stepIndex ? 'var(--primary)' : 'var(--border)',
                transition: 'background .3s',
              }} />
            ))}
          </div>
        )}

        {/* Step content (scroll inside) */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {step === 'welcome' && welcomeView}

          {/* ── Step 2: Create Club ── */}
          {step === 'club' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.lg,
              padding: `${spacing.xl}px ${spacing.lg}px ${spacing.lg}px`,
              animation: 'torq-onb-in .35s ease-out',
            }}>
              <div>
                <h2 style={{ margin: 0, fontWeight: 900, fontSize: 22, color: 'var(--text)' }}>
                  {t('onboarding.club.title')}
                </h2>
                <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: fontSize.sm + 1 }}>
                  {t('onboarding.club.subtitle')}
                </p>
              </div>

              {/* Logo + Name row */}
              <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-end' }}>
                <div>
                  <label style={{ fontSize: fontSize.sm + 1, fontWeight: fontWeight.bold, marginBottom: 6, display: 'block' }}>
                    {t('onboarding.club.logo')}
                  </label>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleLogoChange}
                  />
                  <button
                    onClick={() => logoRef.current?.click()}
                    disabled={logoLoading}
                    style={{
                      width: 64, height: 64, borderRadius: radius.lg, overflow: 'hidden',
                      border: '2px dashed var(--border)', flexShrink: 0, padding: 0,
                      background: logoBase64 ? 'transparent' : 'var(--surface-var)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                    title={t('clubs.uploadLogo')}
                  >
                    {logoBase64
                      ? <img src={logoBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 22, opacity: 0.55 }}>{logoLoading ? '⏳' : '📷'}</span>
                    }
                  </button>
                  {logoBase64 && (
                    <button
                      onClick={() => setLogoBase64(null)}
                      style={{
                        fontSize: fontSize.xs, color: 'var(--danger)', background: 'transparent',
                        border: 'none', padding: '4px 0', marginTop: 2, cursor: 'pointer',
                      }}
                    >
                      {t('clubs.removeLogo')}
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, position: 'relative' }} onBlur={() => setTimeout(() => setSuggestions([]), 200)}>
                  <label style={{ fontSize: fontSize.sm + 1, fontWeight: fontWeight.bold, marginBottom: 6, display: 'block' }}>
                    {t('onboarding.club.name')}
                  </label>
                  <input
                    value={clubName}
                    onChange={e => handleNameChange(e.target.value)}
                    placeholder={t('onboarding.club.namePlaceholder')}
                    style={inputStyle}
                    autoFocus
                    maxLength={40}
                  />
                  {/* Catalog autocomplete dropdown */}
                  {suggestions.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                      background: 'var(--surface)', borderRadius: radius.md,
                      border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
                      maxHeight: 220, overflowY: 'auto', marginTop: 4,
                    }}>
                      {suggestions.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={() => handleCatalogPick(c)}
                          style={{
                            width: '100%', padding: '8px 12px', textAlign: 'left',
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            borderBottom: '1px solid var(--border)',
                            fontSize: fontSize.base, fontWeight: fontWeight.medium,
                          }}
                        >
                          {(c.logoBase64 || c.logoUrl) ? (
                            <img src={c.logoBase64 || c.logoUrl} alt="" style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4, flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 24, height: 24, borderRadius: 4, background: 'var(--surface-var)', flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontWeight: fontWeight.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                              {c.torqClubId && (
                                <span style={{
                                  fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4,
                                  background: 'var(--success-light)', color: 'var(--success)',
                                }}>TORQ</span>
                              )}
                            </div>
                            {c.city && <div style={{ fontSize: fontSize.xs, color: 'var(--text-muted)' }}>{c.city}</div>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Klub už existuje v TORQ */}
                {selectedCatalog?.torqClubId && (
                  <div style={{
                    marginTop: spacing.sm,
                    padding: `${spacing.md}px`,
                    borderRadius: radius.md, background: 'var(--warning-light)',
                    fontSize: fontSize.sm, color: 'var(--warning)',
                  }}>
                    <div style={{ fontWeight: fontWeight.bold, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>⚠️</span>
                      <span>{t('onboarding.club.alreadyInTorq')}</span>
                    </div>
                    <div style={{ fontSize: fontSize.xs, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {t('onboarding.club.alreadyInTorqDesc')}
                    </div>
                  </div>
                )}
              </div>

              {/* Color picker */}
              <div>
                <label style={{ fontSize: fontSize.sm + 1, fontWeight: fontWeight.bold, marginBottom: 8, display: 'block' }}>
                  {t('onboarding.club.color')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {CLUB_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setClubColor(c)}
                      aria-label={`Barva ${c}`}
                      style={{
                        width: 32, height: 32, borderRadius: radius.md,
                        background: c, border: 'none', cursor: 'pointer',
                        outline: clubColor === c ? '3px solid var(--primary)' : '2px solid transparent',
                        outlineOffset: 2, transition: 'outline .15s',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Age categories */}
              <div>
                <label style={{ fontSize: fontSize.sm + 1, fontWeight: fontWeight.bold, marginBottom: 8, display: 'block' }}>
                  {t('onboarding.club.categories')}
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {AGE_CATEGORIES.map(cat => {
                    const isSelected = selectedCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        onClick={() => toggleCategory(cat)}
                        style={{
                          padding: '7px 14px', borderRadius: 20, fontSize: fontSize.sm + 1,
                          fontWeight: fontWeight.bold,
                          background: isSelected ? 'var(--primary)' : 'var(--surface-var)',
                          color: isSelected ? '#fff' : 'var(--text-muted)',
                          border: 'none', cursor: 'pointer', transition: 'all .15s',
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Footer buttons */}
              <div style={{
                marginTop: 'auto', display: 'flex', flexDirection: 'column',
                gap: spacing.sm + 2, paddingTop: spacing.lg,
              }}>
                <button
                  onClick={handleCreateClub}
                  disabled={!clubName.trim() || creating || !!selectedCatalog?.torqClubId}
                  style={{
                    ...btnPrimary,
                    opacity: (!clubName.trim() || creating || !!selectedCatalog?.torqClubId) ? 0.5 : 1,
                    cursor: (!clubName.trim() || creating || !!selectedCatalog?.torqClubId) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {creating ? '…' : t('onboarding.club.continue')}
                </button>
                <button onClick={skip} style={btnSecondary}>
                  {t('onboarding.welcome.skip')}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Done ── */}
          {step === 'done' && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              padding: `${spacing.xl}px ${spacing.lg}px`,
              animation: 'torq-onb-in .35s ease-out', gap: spacing.lg,
            }}>
              <div style={{ textAlign: 'center', marginBottom: spacing.xs }}>
                <div style={{
                  fontSize: 64, lineHeight: 1, marginBottom: spacing.md,
                  animation: 'torq-onb-bounce .55s ease-out',
                }}>
                  ✅
                </div>
                <h2 style={{ margin: 0, fontWeight: 900, fontSize: 24, color: 'var(--text)' }}>
                  {t('onboarding.done.title')}
                </h2>
                <p style={{
                  margin: '6px auto 0', color: 'var(--text-muted)',
                  fontSize: fontSize.base, lineHeight: 1.5, maxWidth: 360,
                }}>
                  {t('onboarding.done.subtitle')}
                </p>
              </div>

              <div style={{
                fontSize: fontSize.sm, fontWeight: fontWeight.extrabold,
                color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: 0.6, marginTop: spacing.sm,
              }}>
                {t('onboarding.done.whatsNext')}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm + 2 }}>
                <NextStepCard
                  emoji="📥"
                  label={t('onboarding.done.importPlayers')}
                  desc={t('onboarding.done.importPlayersDesc')}
                  onClick={() => goNext({ name: 'clubs' })}
                />
                <NextStepCard
                  emoji="⚽"
                  label={t('onboarding.done.createMatch')}
                  desc={t('onboarding.done.createMatchDesc')}
                  onClick={() => goNext({ name: 'match-create' })}
                />
                <NextStepCard
                  emoji="🏆"
                  label={t('onboarding.done.createTournament')}
                  desc={t('onboarding.done.createTournamentDesc')}
                  onClick={() => goNext({ name: 'tournament-create' })}
                />
              </div>

              <button onClick={finish} style={{ ...btnSecondary, marginTop: 'auto' }}>
                {t('onboarding.done.finish')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Next-step card ────────────────────────────────────────────────────────
function NextStepCard({
  emoji, label, desc, onClick,
}: {
  emoji: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: spacing.md,
        width: '100%', padding: `${spacing.md + 2}px ${spacing.md + 2}px`,
        background: 'var(--surface-var)', border: '1.5px solid var(--border)',
        borderRadius: radius.lg, cursor: 'pointer', textAlign: 'left',
        transition: 'transform .12s, border-color .12s',
      }}
      onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
      onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
    >
      <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: fontWeight.extrabold, fontSize: fontSize.base + 1, color: 'var(--text)' }}>
          {label}
        </div>
        <div style={{ fontSize: fontSize.sm, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
          {desc}
        </div>
      </div>
      <span style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0 }}>→</span>
    </button>
  );
}
