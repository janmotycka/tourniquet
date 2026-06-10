import { useState, useEffect, type ReactNode } from 'react';
import type { Page } from '../../App';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n';
import { useSubscriptionStore } from '../../store/subscription.store';
import { useUserPrefsStore } from '../../store/userPrefs.store';
import { ClubSwitcher } from '../clubs/ClubSwitcher';
import { ADMIN_UID } from '../../constants/admin';
import { TRAINING_ENABLED, PREMIUM_ENABLED } from '../../types/feature-flags';

// ─── DesktopShell ─────────────────────────────────────────────────────────────
// Persistent sidebar + topbar layout for the desktop mode.
// Mobile mode does NOT use this — see App.tsx for the routing branch.

const SIDEBAR_WIDTH = 240;
const TOPBAR_HEIGHT = 60;
const MODULE_ORDER_KEY = 'torq_sidebar_module_order';

interface NavItem {
  icon: string;
  labelKey: string;
  page: Page['name'];
  target: Page;
}

type NavModule =
  | {
      // Multi-item accordion module
      key: string;
      labelKey: string;
      icon: string;
      color: string;
      colorBg: string; // soft background for active state
      items: NavItem[];
    }
  | {
      // Single-item module (direct navigation, no expand)
      key: string;
      labelKey: string;
      icon: string;
      color: string;
      colorBg: string;
      single: NavItem;
    };

interface Props {
  currentPage: Page;
  navigate: (p: Page) => void;
  children: ReactNode;
}

export function DesktopShell({ currentPage, navigate, children }: Props) {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const isPremium = useSubscriptionStore(s => s.isPremium);
  const preferredSport = useUserPrefsStore(s => s.preferredSport);
  const tennisUserType = useUserPrefsStore(s => s.tennisUserType);
  const appMode = useUserPrefsStore(s => s.appMode);
  const isTennis = preferredSport === 'tennis';
  const isTennisIndividual = isTennis && tennisUserType === 'individual';
  const isSimpleMode = appMode === 'simple';
  // Audit 2026-04-25: Florbal je vždy Simple-only — žádný training/klub/stats.
  const isFloorball = preferredSport === 'floorball';

  // Dashboard is standalone at the top (not a module).
  const dashboardItem: NavItem = { icon: '🏠', labelKey: 'sidebar.dashboard', page: 'home', target: { name: 'home' } };

  // 4 brand-colored modules matching mobile HomePage.
  // Training modul je zatím jen pro fotbal — v tenis módu se skrývá.
  // Simple mode: jen zápasy + (optionally) rychlý turnaj; bez klubu, bez treninku, bez statistik.
  const baseModules: NavModule[] = [
    // Training — skryt v tenisu, ve florbalu, v simple módu A pre-release
    // (TRAINING_ENABLED=false). Až ověříme core flow s reálnými trenéry,
    // postupně otevřeme — viz feature-flags.ts.
    ...(!TRAINING_ENABLED || isTennis || isFloorball || isSimpleMode ? [] : [{
      key: 'training',
      labelKey: 'home.training',
      icon: '⚽',
      color: '#1B5E20',
      colorBg: 'rgba(27, 94, 32, 0.10)',
      items: [
        { icon: '⚽', labelKey: 'sidebar.training', page: 'training-home' as Page['name'], target: { name: 'training-home' } as Page },
        { icon: '📚', labelKey: 'sidebar.library',  page: 'library' as Page['name'],       target: { name: 'library' } as Page },
        { icon: '💾', labelKey: 'sidebar.saved',    page: 'saved' as Page['name'],         target: { name: 'saved' } as Page },
        { icon: '📅', labelKey: 'sidebar.calendar', page: 'calendar' as Page['name'],      target: { name: 'calendar' } as Page },
      ],
    } as NavModule]),
    // Tournament — v individuálním tenisovém módu skryto (user turnaje neorganizuje).
    // V simple módu jde rovnou na rychlý turnaj z HomePage, sidebar ho nezobrazuje (držíme minimalismus).
    // Florbal: jen Quick Tournament, žádný full tournament-list v sidebaru.
    ...(isTennisIndividual || isSimpleMode || isFloorball ? [] : [{
      key: 'tournament',
      labelKey: 'home.tournament',
      icon: '🏆',
      color: 'var(--warning)',
      colorBg: 'rgba(230, 81, 0, 0.10)',
      single: { icon: '🏆', labelKey: 'sidebar.tournaments', page: 'tournament-list' as Page['name'], target: { name: 'tournament-list' } as Page },
    } as NavModule]),
    {
      key: 'match',
      labelKey: 'home.match',
      icon: isTennis ? '🎾' : isFloorball ? '🏑' : '📋',
      color: isFloorball ? '#00897B' : 'var(--info)',
      colorBg: isFloorball ? 'rgba(0,137,123,0.10)' : 'rgba(21, 101, 192, 0.10)',
      // Tenis module: jen match-list (statistiky mají jiné metriky, zatím neimplementováno).
      // Simple mode: jen match-list (žádné agregované statistiky).
      // Florbal: jen match-list (Simple-only modul).
      items: (isTennis || isSimpleMode || isFloorball) ? [
        { icon: isTennis ? '🎾' : isFloorball ? '🏑' : '📋', labelKey: 'sidebar.matches', page: 'match-list' as Page['name'], target: { name: 'match-list' } as Page },
      ] : [
        { icon: '📋', labelKey: 'sidebar.matches',    page: 'match-list',  target: { name: 'match-list' } },
        { icon: '📊', labelKey: 'sidebar.matchStats', page: 'match-stats', target: { name: 'match-stats' } },
      ],
    },
    // Klub / Moji hráči — v individuálním módu má jinou ikonu + label.
    // V simple módu i ve florbalu se úplně skrývá (nemá klub).
    ...(isSimpleMode || isFloorball ? [] : [{
      key: 'club',
      labelKey: isTennisIndividual ? 'tennisIndividual.home.myPlayers' : 'home.club',
      icon: isTennisIndividual ? '👤' : '🏟',
      color: '#4A148C',
      colorBg: 'rgba(74, 20, 140, 0.10)',
      single: {
        icon: isTennisIndividual ? '👤' : '🏟',
        labelKey: isTennisIndividual ? 'tennisIndividual.home.myPlayers' : 'sidebar.clubs',
        page: 'clubs' as Page['name'],
        target: { name: 'clubs' } as Page,
      },
    } as NavModule]),
  ];

  // User-customizable module order, persisted to localStorage
  const [moduleOrder, setModuleOrder] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(MODULE_ORDER_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.every(k => typeof k === 'string')) {
          return parsed;
        }
      }
    } catch { /* ignore */ }
    return baseModules.map(m => m.key);
  });

  // Reconcile: keep user order, append any new modules not in saved order
  const modules: NavModule[] = (() => {
    const byKey = new Map(baseModules.map(m => [m.key, m]));
    const ordered: NavModule[] = [];
    const seen = new Set<string>();
    for (const key of moduleOrder) {
      const mod = byKey.get(key);
      if (mod) { ordered.push(mod); seen.add(key); }
    }
    for (const mod of baseModules) {
      if (!seen.has(mod.key)) ordered.push(mod);
    }
    return ordered;
  })();

  // Drag & drop state
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const handleDrop = (targetKey: string) => {
    if (!draggingKey || draggingKey === targetKey) {
      setDraggingKey(null);
      setDragOverKey(null);
      return;
    }
    const current = modules.map(m => m.key);
    const from = current.indexOf(draggingKey);
    const to = current.indexOf(targetKey);
    if (from === -1 || to === -1) return;
    const next = [...current];
    next.splice(from, 1);
    next.splice(to, 0, draggingKey);
    setModuleOrder(next);
    try { localStorage.setItem(MODULE_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setDraggingKey(null);
    setDragOverKey(null);
  };

  // Determine which module contains the current page (for auto-expand)
  const currentModuleKey = findModuleForPage(modules, currentPage.name);

  // Accordion state — starts on current module, user can toggle
  const [expandedKey, setExpandedKey] = useState<string | null>(currentModuleKey);

  // Highlighted module = the LAST one the user interacted with.
  // Updated by either: (a) navigation (useEffect on currentModuleKey)
  // or (b) clicking to expand a multi-item module.
  // Only one module is ever highlighted at a time.
  const [highlightedKey, setHighlightedKey] = useState<string | null>(currentModuleKey);

  // When user navigates to a page in another module, auto-expand & highlight it
  useEffect(() => {
    if (currentModuleKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpandedKey(currentModuleKey); // sync expanded/highlighted to current route
      setHighlightedKey(currentModuleKey);
    }
  }, [currentModuleKey]);

  const isAdmin = user?.uid === ADMIN_UID;

  // Build breadcrumb from current page name
  const breadcrumb = buildBreadcrumb(currentPage, t);

  return (
    <div style={{
      display: 'flex',
      minHeight: '100dvh',
      width: '100%',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      {/* ─── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
        height: '100dvh',
        overflowY: 'auto',
      }}>
        {/* Logo */}
        <div style={{
          height: TOPBAR_HEIGHT,
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: isTennis ? '#1565C0' : 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 20,
          }}>{isTennis ? '🎾' : '⚽'}</div>
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: 0.5 }}>
            TORQ{isTennis && <span style={{ fontSize: 10, opacity: 0.65, marginLeft: 4, fontWeight: 600 }}>· TENNIS</span>}
          </span>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* Dashboard — standalone at top */}
          <button
            onClick={() => navigate(dashboardItem.target)}
            style={navItemStyle(currentPage.name === 'home')}
          >
            <span style={{ fontSize: 17, width: 22, textAlign: 'center' }}>{dashboardItem.icon}</span>
            <span>{t(dashboardItem.labelKey)}</span>
          </button>

          <div style={{ height: 8 }} />

          {/* Colored module accordions — draggable for reordering */}
          {modules.map(mod => {
            const isDragging = draggingKey === mod.key;
            const isDragOver = dragOverKey === mod.key && draggingKey !== mod.key;

            const wrapperProps = {
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                setDraggingKey(mod.key);
                e.dataTransfer.effectAllowed = 'move';
                try { e.dataTransfer.setData('text/plain', mod.key); } catch { /* ignore */ }
              },
              onDragEnd: () => { setDraggingKey(null); setDragOverKey(null); },
              onDragOver: (e: React.DragEvent) => {
                if (!draggingKey || draggingKey === mod.key) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverKey !== mod.key) setDragOverKey(mod.key);
              },
              onDragLeave: () => { if (dragOverKey === mod.key) setDragOverKey(null); },
              onDrop: (e: React.DragEvent) => { e.preventDefault(); handleDrop(mod.key); },
              style: {
                opacity: isDragging ? 0.4 : 1,
                borderTop: isDragOver ? `2px solid ${mod.color}` : '2px solid transparent',
                transition: 'border-color .15s, opacity .15s',
              } as React.CSSProperties,
            };

            // Single-item module — direct nav button styled with color
            if ('single' in mod) {
              const highlighted = highlightedKey === mod.key;
              return (
                <div key={mod.key} {...wrapperProps}>
                  <button
                    onClick={() => {
                      setHighlightedKey(mod.key);
                      navigate(mod.single.target);
                    }}
                    style={moduleHeaderStyle(mod, highlighted)}
                  >
                    <span style={dragHandleStyle} aria-hidden>⋮⋮</span>
                    <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{mod.icon}</span>
                    <span style={{ flex: 1, textAlign: 'left' }}>{t(mod.labelKey)}</span>
                  </button>
                </div>
              );
            }
            // Multi-item accordion
            const expanded = expandedKey === mod.key;
            // Highlight follows the user's last interaction (highlightedKey).
            // Clicking to expand sets it; navigating to a page also sets it.
            // Only one module is ever highlighted at a time.
            const headerHighlighted = highlightedKey === mod.key;
            // Is the user currently viewing a page inside this module?
            const isActiveModule = currentModuleKey === mod.key;
            return (
              <div key={mod.key} {...wrapperProps}>
                <button
                  onClick={() => {
                    setHighlightedKey(mod.key);
                    // If switching to a different module, navigate to its first
                    // sub-item (and expand it). If clicking the already-active
                    // module, just toggle expansion.
                    if (!isActiveModule && mod.items.length > 0) {
                      setExpandedKey(mod.key);
                      navigate(mod.items[0].target);
                    } else {
                      setExpandedKey(expanded ? null : mod.key);
                    }
                  }}
                  style={moduleHeaderStyle(mod, headerHighlighted)}
                  aria-expanded={expanded}
                >
                  <span style={dragHandleStyle} aria-hidden>⋮⋮</span>
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{mod.icon}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>{t(mod.labelKey)}</span>
                  <span style={{
                    fontSize: 11, opacity: 0.7,
                    transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform .18s',
                  }}>
                    ▶
                  </span>
                </button>
                {expanded && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 1,
                    marginTop: 4, marginBottom: 4,
                    paddingLeft: 10,
                    borderLeft: `2px solid ${mod.color}33`,
                    marginLeft: 28,
                  }}>
                    {mod.items.map(item => {
                      const active = currentPage.name === item.page;
                      return (
                        <button
                          key={item.page}
                          onClick={() => navigate(item.target)}
                          style={subItemStyle(mod, active)}
                        >
                          <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{item.icon}</span>
                          <span>{t(item.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div style={{ height: 8 }} />
              <div style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: 0.6,
                padding: '0 12px 6px',
              }}>Admin</div>
              <button
                onClick={() => navigate({ name: 'admin' })}
                style={navItemStyle(currentPage.name === 'admin')}
              >
                <span style={{ fontSize: 17, width: 22, textAlign: 'center' }}>🛡</span>
                <span>{t('sidebar.admin')}</span>
              </button>
            </>
          )}
        </nav>

        {/* Upgrade CTA (PREMIUM_ENABLED) / Podpora projektu (beta).
            Audit 2026-06-10: bez Premium prodeje — sidebar nabízí jen decentní
            "Podpořit TORQ" link do Settings (kde je donate + kontakt). */}
        {PREMIUM_ENABLED && !isPremium() ? (
          <div style={{ padding: '0 12px 12px' }}>
            <button
              onClick={() => navigate({ name: 'settings' })}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #FFF8E1 0%, #FFE082 100%)',
                border: '1.5px solid #FFD54F',
                borderRadius: 12, padding: '12px 14px', textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: 22 }}>⭐</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--warning)', lineHeight: 1.3 }}>
                {t('sidebar.upgrade')}
              </span>
            </button>
          </div>
        ) : !PREMIUM_ENABLED ? (
          <div style={{ padding: '0 12px 12px' }}>
            <button
              onClick={() => navigate({ name: 'settings' })}
              style={{
                width: '100%',
                background: 'var(--surface-var)',
                border: '1px solid var(--border)',
                borderRadius: 12, padding: '10px 14px', textAlign: 'left',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: 18 }}>☕</span>
              <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.3 }}>
                {t('sidebar.support')}
              </span>
            </button>
          </div>
        ) : null}

        {/* User footer */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '12px',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate({ name: 'settings' })}
            style={{
              flex: 1,
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'transparent', border: 'none',
              padding: '6px 8px', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left', minWidth: 0,
            }}
            title={t('sidebar.settings')}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'var(--primary-light)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14, flexShrink: 0,
            }}>
              {(user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user?.displayName ?? t('home.loggedIn')}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--text-muted)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user?.email}
              </div>
            </div>
          </button>
          <button
            onClick={() => { void logout(); }}
            title={t('sidebar.logout')}
            aria-label={t('sidebar.logout')}
            style={{
              background: 'var(--surface-var)', border: 'none',
              borderRadius: 10, padding: '8px 10px',
              cursor: 'pointer', color: 'var(--text-muted)', fontSize: 15,
              flexShrink: 0,
            }}
          >
            ⎋
          </button>
        </div>
      </aside>

      {/* ─── MAIN COLUMN (topbar + content) ──────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <header style={{
          height: TOPBAR_HEIGHT,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 28px', gap: 16,
          position: 'sticky', top: 0, zIndex: 20,
          flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
            fontSize: 14, color: 'var(--text-muted)', fontWeight: 600,
          }}>
            {breadcrumb.map((seg, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ opacity: 0.5 }}>/</span>}
                <span style={{
                  color: i === breadcrumb.length - 1 ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: i === breadcrumb.length - 1 ? 800 : 600,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: 280,
                }}>
                  {seg}
                </span>
              </span>
            ))}
          </div>

          {/* Active club switcher (shared workspaces) — skryt v simple módu (žádný klub) */}
          {!isSimpleMode && !isFloorball && <ClubSwitcher navigate={navigate} />}
        </header>

        {/* Content area — pages render here */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          minWidth: 0,
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

const dragHandleStyle: React.CSSProperties = {
  cursor: 'grab',
  color: 'var(--text-muted)',
  opacity: 0.35,
  fontSize: 11,
  letterSpacing: -1,
  width: 10,
  flexShrink: 0,
  userSelect: 'none',
};

function navItemStyle(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px',
    borderRadius: 10,
    border: 'none',
    background: active ? 'var(--primary-light)' : 'transparent',
    color: active ? 'var(--primary)' : 'var(--text-sub)',
    fontSize: 14, fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background .15s',
  };
}

function moduleHeaderStyle(mod: { color: string; colorBg: string }, active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '11px 12px',
    borderRadius: 10,
    border: 'none',
    background: active ? mod.colorBg : 'transparent',
    color: active ? mod.color : 'var(--text-sub)',
    borderLeft: `3px solid ${active ? mod.color : 'transparent'}`,
    paddingLeft: 9, // 12 - 3 to keep content aligned
    fontSize: 14, fontWeight: 700,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background .15s, color .15s, border-color .15s',
  };
}

function subItemStyle(mod: { color: string; colorBg: string }, active: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px',
    borderRadius: 8,
    border: 'none',
    background: active ? mod.colorBg : 'transparent',
    color: active ? mod.color : 'var(--text-sub)',
    fontSize: 13, fontWeight: active ? 700 : 600,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background .15s, color .15s',
  };
}

function findModuleForPage(modules: NavModule[], pageName: Page['name']): string | null {
  for (const mod of modules) {
    if ('single' in mod) {
      if (mod.single.page === pageName) return mod.key;
    } else {
      if (mod.items.some(it => it.page === pageName)) return mod.key;
    }
  }
  // Additional mapping for detail/create pages that aren't in the nav items
  const extraMap: Record<string, string> = {
    'generator': 'training',
    'training': 'training',
    'manual-builder': 'training',
    'tournament-create': 'tournament',
    'tournament-create-choice': 'tournament',
    'tournament-planner': 'tournament',
    'tournament-detail': 'tournament',
    'match-create': 'match',
    'match-detail': 'match',
  };
  return extraMap[pageName] ?? null;
}

function buildBreadcrumb(page: Page, t: (k: string) => string): string[] {
  switch (page.name) {
    case 'home':              return [t('sidebar.dashboard')];
    case 'training-home':     return [t('home.training')];
    case 'generator':         return [t('home.training'), 'Generátor'];
    case 'training':          return [t('home.training'), 'Detail'];
    case 'saved':             return [t('home.training'), t('sidebar.saved')];
    case 'library':           return [t('home.training'), t('sidebar.library')];
    case 'manual-builder':    return [t('home.training'), 'Builder'];
    case 'calendar':          return [t('sidebar.calendar')];
    case 'tournament-list':          return [t('home.tournament')];
    case 'tournament-create-choice': return [t('home.tournament'), 'Nový'];
    case 'tournament-create':        return [t('home.tournament'), 'Nový ručně'];
    case 'tournament-planner':       return [t('home.tournament'), 'Navrhnout formát'];
    case 'tournament-detail':        return [t('home.tournament'), 'Detail'];
    case 'clubs':             return [t('sidebar.clubs')];
    case 'match-list':        return [t('home.match')];
    case 'match-create':      return [t('home.match'), 'Nový'];
    case 'match-detail':      return [t('home.match'), 'Detail'];
    case 'match-stats':       return [t('home.match'), t('sidebar.matchStats')];
    case 'settings':          return [t('sidebar.settings')];
    case 'admin':             return [t('sidebar.admin')];
    case 'privacy-policy':    return ['Privacy'];
    case 'terms-of-service':  return ['Terms'];
    default:                  return [t('sidebar.dashboard')];
  }
}
