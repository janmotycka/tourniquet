/**
 * OfficialLinkButton — univerzální tlačítko „Otevřít na <kde>".
 *
 * Pro zápas / turnaj které mají `officialResultsUrl` odkaz na externí
 * autoritativní systém (např. ČTenis). Automaticky detekuje hostname
 * a nabídne správný label ("Otevřít na ČTenis" / "Open external link").
 *
 * Bezpečnost: otevírá v novém tabu s noopener+noreferrer. URL nezobrazuje
 * surově ale jen jako ikona + přátelský text — pokud URL není https nebo
 * neparsovatelná, tlačítko se skryje (nic nevykreslí).
 */

import { useI18n } from '../../i18n';

interface Props {
  url?: string | null;
  /** Inline (v textu) vs full-width tlačítko. Default 'full'. */
  variant?: 'inline' | 'full';
}

/** Detekce známého externího zdroje podle hostname. */
function detectSource(hostname: string): { label: string; icon: string } {
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (h.endsWith('cztenis.cz')) return { label: 'ČTenis', icon: '🎾' };
  if (h.endsWith('facr.fotbal.cz') || h.endsWith('fotbal.cz')) return { label: 'FAČR', icon: '⚽' };
  // Generic fallback — ukáže jen hostname.
  return { label: h, icon: '🔗' };
}

export function OfficialLinkButton({ url, variant = 'full' }: Props) {
  const { t } = useI18n();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const { label, icon } = detectSource(parsed.hostname);
  const text = t('common.openOn', { source: label });

  if (variant === 'inline') {
    return (
      <a
        href={parsed.toString()}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 10,
          background: 'var(--surface-var)', color: 'var(--primary)',
          border: '1px solid var(--border)',
          fontSize: 12, fontWeight: 700, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{icon}</span>
        <span>{text}</span>
        <span style={{ fontSize: 10, opacity: 0.6 }}>↗</span>
      </a>
    );
  }

  return (
    <a
      href={parsed.toString()}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 16px', borderRadius: 12,
        background: 'var(--primary)', color: '#fff',
        fontSize: 14, fontWeight: 700, textDecoration: 'none',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{text}</span>
      <span style={{ fontSize: 12, opacity: 0.85 }}>↗</span>
    </a>
  );
}
