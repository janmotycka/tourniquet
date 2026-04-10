/**
 * OpponentAutocomplete — textový input s našeptáváním z /clubsCatalog.
 *
 * Použití:
 * - CreateMatchPage → pole "Soupeř"
 * - CreateTournamentPage → názvy týmů (volitelně)
 *
 * Co zpřístupňuje:
 * - Pokud uživatel píše ≥2 znaky, ukáže dropdown z katalogu (max 8 výsledků)
 * - Po výběru klubu z katalogu zavolá `onSelect` s {name, logoUrl, city}
 * - Pokud uživatel nepoužije katalog (ignoruje dropdown a napíše svoje), bere
 *   se jeho volný text — žádný blocking UX
 *
 * Katalog se načítá jednou při prvním mountu komponenty a cachuje v
 * module-level Map<lowerName, CatalogClub> pro rychlé fuzzy matche.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ref as dbRef, get as dbGet } from 'firebase/database';
import { db } from '../../firebase';
import { logger } from '../../utils/logger';

export interface CatalogClub {
  id: string;
  name: string;
  city?: string;
  logoUrl?: string;
  logoBase64?: string;
  source?: string;
}

// Module-level cache — shared napříč všemi instancemi
let cachedCatalog: CatalogClub[] | null = null;
let catalogLoading: Promise<CatalogClub[]> | null = null;

async function loadCatalog(): Promise<CatalogClub[]> {
  if (cachedCatalog) return cachedCatalog;
  if (catalogLoading) return catalogLoading;

  catalogLoading = dbGet(dbRef(db, 'clubsCatalog'))
    .then(snap => {
      const data = snap.val() as Record<string, CatalogClub> | null;
      cachedCatalog = data ? Object.values(data) : [];
      return cachedCatalog;
    })
    .catch(err => {
      logger.warn('[OpponentAutocomplete] Catalog load failed:', err);
      cachedCatalog = [];
      return cachedCatalog;
    })
    .finally(() => {
      catalogLoading = null;
    });

  return catalogLoading;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Volá se, když si uživatel vybere klub z našeptávače. */
  onSelect?: (club: CatalogClub) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  autoFocus?: boolean;
  /** Reference na wrapping label pro accessibility */
  label?: string;
}

export function OpponentAutocomplete({
  value, onChange, onSelect, placeholder, style, inputStyle, autoFocus, label,
}: Props) {
  const [catalog, setCatalog] = useState<CatalogClub[]>([]);
  const [focused, setFocused] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Lazy-load katalog
  useEffect(() => {
    let cancelled = false;
    loadCatalog().then(list => {
      if (!cancelled) setCatalog(list);
    });
    return () => { cancelled = true; };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!focused) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setFocused(false);
        setHighlightedIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [focused]);

  const results = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (q.length < 2) return [];
    return catalog
      .filter(c => c.name.toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefix match first, then alphabetical
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [catalog, value]);

  const pick = (club: CatalogClub) => {
    onChange(club.name);
    onSelect?.(club);
    setFocused(false);
    setHighlightedIdx(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!focused || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && highlightedIdx >= 0) {
      e.preventDefault();
      pick(results[highlightedIdx]);
    } else if (e.key === 'Escape') {
      setFocused(false);
      setHighlightedIdx(-1);
    }
  };

  const showDropdown = focused && results.length > 0;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setFocused(true); setHighlightedIdx(-1); }}
        onFocus={() => setFocused(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1.5px solid var(--border)',
          background: 'var(--bg)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text)',
          outline: 'none',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />

      {showDropdown && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderRadius: 10,
            maxHeight: 280,
            overflowY: 'auto',
            boxShadow: 'var(--shadow-md)',
            zIndex: 100,
          }}
        >
          {results.map((club, idx) => {
            const isHighlighted = idx === highlightedIdx;
            return (
              <button
                key={club.id}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={e => { e.preventDefault(); pick(club); }}
                onMouseEnter={() => setHighlightedIdx(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  background: isHighlighted ? 'var(--surface-var)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {(club.logoBase64 || club.logoUrl) ? (
                  <img
                    src={club.logoBase64 || club.logoUrl}
                    alt=""
                    style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0, borderRadius: 6 }}
                  />
                ) : (
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: 'var(--surface-var)', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14,
                  }}>
                    🏟
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {club.name}
                  </div>
                  {club.city && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{club.city}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
