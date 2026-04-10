import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ref as dbRef, get as dbGet } from 'firebase/database';
import type { Page } from '../../App';
import { db } from '../../firebase';
import { useI18n } from '../../i18n';
import { useClubsStore } from '../../store/clubs.store';
import { AGE_CATEGORIES, type AgeCategory } from '../../types/club.types';
import { resizeLogoToBase64 } from '../clubs/resize-logo';
import { useToastStore } from '../../store/toast.store';
import { logger } from '../../utils/logger';
import { requestOfficialClub } from '../../services/club-functions';
import { useAuth } from '../../context/AuthContext';

interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
  source: string;
}

// Fetch logo URL → base64 (so we can persist it offline-first like manual uploads).
// Wikimedia Commons sends Access-Control-Allow-Origin: * so CORS works in browser.
async function urlToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors', headers: { Accept: 'image/*' } });
    if (!res.ok) {
      logger.warn('[OnboardingWizard] Logo fetch failed:', res.status, url);
      return null;
    }
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(typeof r.result === 'string' ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch (err) {
    logger.warn('[OnboardingWizard] Logo fetch threw:', err);
    return null;
  }
}

const STORAGE_KEY = 'torq_onboarded';

interface Props {
  navigate: (p: Page) => void;
  onComplete: () => void;
}

type Step = 'welcome' | 'club' | 'players' | 'done';

// ─── Color palette for club picker ──────────────────────────────────────────

const CLUB_COLORS = [
  '#1565C0', '#0D47A1', '#2E7D32', '#1B5E20',
  '#C62828', '#E65100', '#6A1B9A', '#283593',
  '#00695C', '#4E342E', '#37474F', '#F9A825',
];

// ─── Component ──────────────────────────────────────────────────────────────

export function OnboardingWizard({ navigate, onComplete }: Props) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createClub = useClubsStore(s => s.createClub);
  const addPlayer = useClubsStore(s => s.addPlayer);

  const [step, setStep] = useState<Step>('welcome');

  // Club state
  const [clubName, setClubName] = useState('');
  const [clubColor, setClubColor] = useState(CLUB_COLORS[0]);
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<AgeCategory[]>([]);
  const [createdClubId, setCreatedClubId] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Catalog autocomplete
  const [catalog, setCatalog] = useState<CatalogClub[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogPickedFrom, setCatalogPickedFrom] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    dbGet(dbRef(db, 'clubsCatalog'))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.val() as Record<string, CatalogClub> | null;
        setCatalog(data ? Object.values(data) : []);
      })
      .catch(() => {
        /* catalog optional — fail silently */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogResults = useMemo(() => {
    const q = catalogQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [catalog, catalogQuery]);

  const pickCatalogClub = async (c: CatalogClub) => {
    setClubName(c.name);
    setCatalogPickedFrom(c.id);
    setSearchOpen(false);
    setCatalogQuery('');
    if (c.logoUrl) {
      setLogoLoading(true);
      const b64 = await urlToBase64(c.logoUrl);
      if (b64) setLogoBase64(b64);
      setLogoLoading(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoLoading(true);
    try {
      const b64 = await resizeLogoToBase64(file);
      setLogoBase64(b64);
    } catch {
      useToastStore.getState().show('error', t('clubs.imageError'));
    } finally {
      setLogoLoading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  // Players state
  const [players, setPlayers] = useState<Array<{ name: string; jersey: string }>>([
    { name: '', jersey: '' },
  ]);

  const finish = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* blocked */ }
    onComplete();
  }, [onComplete]);

  const [creatingClub, setCreatingClub] = useState(false);

  const handleCreateClub = async () => {
    if (!clubName.trim() || creatingClub) return;
    setCreatingClub(true);
    try {
      if (catalogPickedFrom) {
        // Verified club — žádost schvaluje admin. Nevytváří se klub hned,
        // wizard v tomto případě končí po potvrzení podaného requestu.
        await requestOfficialClub({
          catalogId: catalogPickedFrom,
          catalogName: clubName.trim(),
          requesterName: user?.displayName || user?.email || 'Unknown',
          requesterRole: 'Coach',
        });
        useToastStore.getState().show('info', t('clubs.shared.requestForm.sent'));
        setStep('done');
        return;
      }

      // Personal club — vytvoří se přes createClub() (CF createPersonalClub)
      // a vrátí plný Club, který rovnou použijeme pro navazující player step.
      const newClub = await createClub({
        name: clubName.trim(),
        color: clubColor,
        logoBase64,
        ageCategories: selectedCategories.length > 0 ? selectedCategories : ['U10'],
      });
      logger.debug('[Onboarding] Created personal club:', newClub.id);
      setCreatedClubId(newClub.id);

      setStep('players');
    } catch (err) {
      logger.warn('[Onboarding] handleCreateClub failed:', err);
      const msg = (err as Error).message || '';
      if (msg.toLowerCase().includes('limit')) {
        useToastStore.getState().show('error', t('clubs.shared.createPersonalLimit'));
      } else if (msg.toLowerCase().includes('already')) {
        useToastStore.getState().show('error', t('clubs.shared.requestForm.errorAlreadyClaimed'));
      } else {
        useToastStore.getState().show('error', msg || 'Error');
      }
    } finally {
      setCreatingClub(false);
    }
  };

  const handleSavePlayers = async () => {
    if (!createdClubId) { setStep('done'); return; }
    const category = selectedCategories[0] ?? 'U10';
    for (const p of players) {
      if (p.name.trim()) {
        await addPlayer(createdClubId, {
          name: p.name.trim(),
          jerseyNumber: parseInt(p.jersey) || 0,
          birthYear: null,
          ageCategory: category,
          active: true,
        });
      }
    }
    setStep('done');
  };

  const addPlayerRow = () => {
    setPlayers(prev => [...prev, { name: '', jersey: '' }]);
  };

  const updatePlayerRow = (idx: number, field: 'name' | 'jersey', value: string) => {
    setPlayers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const toggleCategory = (cat: AgeCategory) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  // ─── Styles ────────────────────────────────────────────────────────────────

  const pageStyle: React.CSSProperties = {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    background: 'var(--bg)', padding: '0 20px',
  };

  // Centered content wrapper — drží wizard v rozumné šířce na desktopu
  const contentWrapStyle: React.CSSProperties = {
    width: '100%', maxWidth: 560, margin: '0 auto',
    flex: 1, display: 'flex', flexDirection: 'column',
  };

  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '14px', borderRadius: 14,
    background: 'var(--primary)', color: '#fff',
    fontWeight: 800, fontSize: 16, cursor: 'pointer',
    border: 'none',
  };

  const btnSecondary: React.CSSProperties = {
    width: '100%', padding: '12px', borderRadius: 14,
    background: 'var(--surface-var)', color: 'var(--text-muted)',
    fontWeight: 600, fontSize: 14, cursor: 'pointer',
    border: 'none',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    fontSize: 15, fontWeight: 600, color: 'var(--text)',
    outline: 'none', boxSizing: 'border-box',
  };

  // ─── Progress bar ──────────────────────────────────────────────────────────

  const stepIndex = step === 'welcome' ? 0 : step === 'club' ? 1 : step === 'players' ? 2 : 3;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes confettiBounce { 0% { transform: scale(0.3); opacity: 0; } 50% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      <div style={contentWrapStyle}>
      {/* Progress bar */}
      {step !== 'welcome' && step !== 'done' && (
        <div style={{ padding: '16px 0 0', display: 'flex', gap: 6 }}>
          {[1, 2].map(i => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= stepIndex ? 'var(--primary)' : 'var(--border)',
              transition: 'background .3s',
            }} />
          ))}
        </div>
      )}

      {/* ── Welcome ── */}
      {step === 'welcome' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 24,
          animation: 'fadeSlideIn .4s ease-out',
          textAlign: 'center', padding: '40px 0',
        }}>
          <div style={{ fontSize: 64 }}>⚽</div>
          <h1 style={{ fontWeight: 900, fontSize: 28, letterSpacing: -0.5, margin: 0 }}>
            {t('onboarding.welcome')}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, lineHeight: 1.6, maxWidth: 320 }}>
            {t('wizard.welcomeDesc')}
          </p>

          <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <button onClick={() => setStep('club')} style={btnPrimary}>
              {t('wizard.letsStart')}
            </button>
            <button onClick={finish} style={btnSecondary}>
              {t('wizard.skipAll')}
            </button>
          </div>
        </div>
      )}

      {/* ── Create Club ── */}
      {step === 'club' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 20,
          animation: 'fadeSlideIn .4s ease-out', padding: '24px 0',
        }}>
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{t('wizard.createClub')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{t('wizard.createClubDesc')}</p>
          </div>

          {/* Logo + Club name vedle sebe */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
            {/* Logo */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block' }}>
                {t('clubs.logoLabel')}
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
                  width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
                  border: '2px dashed var(--border)', flexShrink: 0, padding: 0,
                  background: logoBase64 ? 'transparent' : 'var(--surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title={t('clubs.uploadLogo')}
              >
                {logoBase64
                  ? <img src={logoBase64} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <span style={{ fontSize: 22, opacity: 0.5 }}>{logoLoading ? '⏳' : '📷'}</span>
                }
              </button>
              {logoBase64 && (
                <button
                  onClick={() => setLogoBase64(null)}
                  style={{
                    fontSize: 11, color: 'var(--danger)', background: 'transparent',
                    border: 'none', padding: '4px 0', marginTop: 2, cursor: 'pointer',
                  }}
                >
                  {t('clubs.removeLogo')}
                </button>
              )}
            </div>

            {/* Club name */}
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, display: 'block' }}>
                {t('wizard.clubName')}
              </label>
              <input
                value={clubName}
                onChange={e => setClubName(e.target.value)}
                placeholder={t('wizard.clubNamePlaceholder')}
                style={inputStyle}
                autoFocus
              />
            </div>
          </div>

          {/* Catalog autocomplete */}
          {catalog.length > 0 && (
            <div>
              <button
                onClick={() => setSearchOpen((v) => !v)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 10,
                  background: 'var(--primary-light)', color: 'var(--primary)',
                  border: '1px dashed var(--primary)', fontWeight: 700, fontSize: 13,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                🔍 {t('wizard.clubSearch')}
                {catalogPickedFrom && <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.7 }}>· {t('wizard.clubFromCatalog')}</span>}
              </button>
              {searchOpen && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="search"
                    value={catalogQuery}
                    onChange={(e) => setCatalogQuery(e.target.value)}
                    placeholder={t('wizard.clubSearchPlaceholder')}
                    autoFocus
                    style={inputStyle}
                  />
                  {catalogQuery.trim().length >= 2 && (
                    <div style={{
                      marginTop: 6, maxHeight: 240, overflowY: 'auto',
                      border: '1px solid var(--border)', borderRadius: 10,
                      background: 'var(--surface)',
                    }}>
                      {catalogResults.length === 0 ? (
                        <div style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                          {t('wizard.clubNotFound')}
                        </div>
                      ) : (
                        catalogResults.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => pickCatalogClub(c)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              width: '100%', padding: '10px 12px',
                              background: 'transparent', border: 'none',
                              borderBottom: '1px solid var(--border)',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            {c.logoUrl ? (
                              <img src={c.logoUrl} alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface-var)', flexShrink: 0 }} />
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.name}</div>
                              {c.city && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.city}</div>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    {t('wizard.clubSearchHint')}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* FAČR poznámka */}
          <div style={{
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
            background: 'var(--primary-light)', padding: '10px 12px', borderRadius: 10,
          }}>
            ℹ️ {t('wizard.facrNote')}
          </div>

          {/* Color picker */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'block' }}>
              {t('wizard.clubColor')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CLUB_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setClubColor(c)}
                  style={{
                    width: 36, height: 36, borderRadius: 10, border: 'none',
                    background: c, cursor: 'pointer',
                    outline: clubColor === c ? '3px solid var(--primary)' : '2px solid transparent',
                    outlineOffset: 2, transition: 'outline .15s',
                  }}
                />
              ))}
            </div>
          </div>

          {/* Age categories */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'block' }}>
              {t('wizard.ageCategories')}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {AGE_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                    background: selectedCategories.includes(cat) ? 'var(--primary)' : 'var(--surface-var)',
                    color: selectedCategories.includes(cat) ? '#fff' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
            <button
              onClick={handleCreateClub}
              disabled={!clubName.trim()}
              style={{
                ...btnPrimary,
                opacity: clubName.trim() ? 1 : 0.5,
              }}
            >
              {t('wizard.createAndContinue')}
            </button>
            <button onClick={finish} style={btnSecondary}>
              {t('wizard.skipAll')}
            </button>
          </div>
        </div>
      )}

      {/* ── Add Players ── */}
      {step === 'players' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', gap: 16,
          animation: 'fadeSlideIn .4s ease-out', padding: '24px 0',
        }}>
          <div>
            <h2 style={{ fontWeight: 900, fontSize: 22, margin: 0 }}>{t('wizard.addPlayers')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>{t('wizard.addPlayersDesc')}</p>
          </div>

          {/* Player rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto' }}>
            {players.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input
                  value={p.name}
                  onChange={e => updatePlayerRow(i, 'name', e.target.value)}
                  placeholder={t('wizard.playerName')}
                  style={{ ...inputStyle, flex: 3 }}
                  autoFocus={i === 0}
                />
                <input
                  value={p.jersey}
                  onChange={e => updatePlayerRow(i, 'jersey', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="#"
                  inputMode="numeric"
                  style={{ ...inputStyle, flex: 1, textAlign: 'center' }}
                />
              </div>
            ))}
            <button
              onClick={addPlayerRow}
              style={{
                padding: '10px', borderRadius: 12,
                border: '1.5px dashed var(--border)', background: 'transparent',
                color: 'var(--text-muted)', fontWeight: 600, fontSize: 13,
                cursor: 'pointer',
              }}
            >
              + {t('wizard.addAnother')}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 24 }}>
            <button onClick={handleSavePlayers} style={btnPrimary}>
              {players.some(p => p.name.trim()) ? t('wizard.saveAndFinish') : t('wizard.skipAndFinish')}
            </button>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20,
          animation: 'fadeSlideIn .4s ease-out',
          textAlign: 'center', padding: '40px 0',
        }}>
          <div style={{ fontSize: 64, animation: 'confettiBounce .5s ease-out' }}>🎉</div>
          <h2 style={{ fontWeight: 900, fontSize: 24, margin: 0 }}>{t('wizard.allDone')}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.5, maxWidth: 300 }}>
            {t('wizard.allDoneDesc')}
          </p>

          <div style={{ width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            <button
              onClick={() => { finish(); navigate({ name: 'match-list' }); }}
              style={btnPrimary}
            >
              {t('wizard.goToMatches')}
            </button>
            <button
              onClick={() => { finish(); navigate({ name: 'home' }); }}
              style={btnSecondary}
            >
              {t('wizard.goToHome')}
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
