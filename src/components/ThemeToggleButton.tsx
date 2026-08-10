import { useTheme } from '../theme/ThemeContext';
import { useI18n } from '../i18n';

/**
 * Malý přepínač světlý/tmavý pro stránky dostupné BEZ přihlášení
 * (landing, veřejný turnaj, veřejný zápas). Plný výběr včetně „Systém"
 * zůstává v Nastavení — to je ale až po přihlášení, takže rodič, který
 * přijde přes QR kód, by jinak neměl vzhled jak změnit.
 *
 * Klik přepíná mezi light/dark podle toho, co je právě vykreslené
 * (tzn. i když je uložené „auto", první klik ho zafixuje na opak).
 *
 * `variant`:
 *  - 'onDark'  — na barevném hero pruhu (světlá ikona, průhledné pozadí)
 *  - 'surface' — na běžném pozadí stránky (respektuje CSS proměnné)
 * `size` — 32 v hlavičkách vedle ostatních tlačítek, 36 samostatně.
 */
export function ThemeToggleButton({
  variant = 'surface',
  size = 36,
}: { variant?: 'onDark' | 'surface'; size?: number }) {
  const { resolved, setTheme } = useTheme();
  const { t } = useI18n();

  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? t('settings.themeDark') : t('settings.themeLight');

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`${t('settings.theme')}: ${label}`}
      title={label}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 10,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 17,
        lineHeight: 1,
        cursor: 'pointer',
        transition: 'background .15s',
        ...(variant === 'onDark'
          ? { background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.25)', color: '#fff' }
          : { background: 'var(--surface-var)', border: '1.5px solid var(--border)', color: 'var(--text)' }),
      }}
    >
      {resolved === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
