/**
 * Design tokens — jediný zdroj pravdy pro rozměry, spacing, typografii.
 *
 * Barvy a stíny jsou v `src/index.css` jako CSS variables (`var(--primary)`,
 * `var(--danger)`, `var(--shadow-sm)`...), protože se potřebují přepínat podle
 * light/dark tématu. Rozměry/typografie zůstávají v TS, protože jsou statické.
 *
 * Používání:
 * ```ts
 * import { radius, spacing, fontSize, fontWeight } from '../theme/tokens';
 *
 * const style = {
 *   padding: spacing.md,
 *   borderRadius: radius.md,
 *   fontSize: fontSize.base,
 * };
 * ```
 *
 * NEPŘIDÁVAT do tohoto souboru: barvy, stíny, theme-dependent hodnoty —
 * ty patří do `index.css`.
 */

// ─── Spacing scale ──────────────────────────────────────────────────────────
// Krok po 4px, omezeno na 6 hodnot. Použití:
//   - xs: těsné gapy uvnitř řádků (ikonka + text)
//   - sm: gap mezi form fieldy
//   - md: padding card body, gap mezi sekcemi
//   - lg: padding page, gap mezi velkými bloky
//   - xl: hero / landing page
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// ─── Border radius ──────────────────────────────────────────────────────────
// Menší škála = konzistentnější vzhled. Bez radius.none, bez radius.full
// (buď 50% kolečka nebo hodnoty v scale).
export const radius = {
  sm: 8,   // malé prvky (chips, badges, stepper buttons)
  md: 10,  // inputy, secondary buttons, small cards
  lg: 12,  // primary buttons, cards
  xl: 14,  // velké cards (settings, club section)
  xxl: 20, // modal background (bottom sheet)
} as const;

// ─── Font sizes ─────────────────────────────────────────────────────────────
// 6 hodnot. Mapping na role:
//   - xs:   11  — labels, bullets, badges
//   - sm:   12  — subtitles, muted text
//   - base: 14  — body, inputs, buttons
//   - md:   15  — emphasized body, primary button label
//   - lg:   18  — h2, page subtitles
//   - xl:   22  — h1 (hero), dashboard tiles
export const fontSize = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 18,
  xl: 22,
} as const;

// ─── Font weights ───────────────────────────────────────────────────────────
// Používáme jen 3 hodnoty — podle toho, jak má stacked hierarchy fungovat.
// body = 600 (medium bold), emphasized = 700, heading = 800.
export const fontWeight = {
  medium: 600,
  bold: 700,
  extrabold: 800,
} as const;

// ─── Component sizing ───────────────────────────────────────────────────────
// Touch targets ≥ 36px (Apple doporučuje 44, ale 36 je OK pro secondary actions).
export const size = {
  /** Icon button (back ←, close ×, stepper ± atd.) */
  iconButton: 36,
  /** Small icon button (inline v řádku) */
  iconButtonSm: 30,
  /** Stepper button (+/-) uvnitř stepperu */
  stepperBtn: 30,
  /** Back button size v page headeru */
  backButton: 36,
} as const;

// ─── Modal dimensions ───────────────────────────────────────────────────────
export const modal = {
  /** Max width bottom sheetu / centered modalu na desktopu */
  maxWidth: 480,
  /** Max height bottom sheetu (dDynamic VH aby se vzal bar v Safari) */
  maxHeight: '90dvh',
  /** Border radius bottom sheetu (jen horní rohy) */
  borderRadius: '20px 20px 0 0' as const,
} as const;

// ─── Re-exports for ergonomics ──────────────────────────────────────────────
// Umožňuje `import { t } from '../theme/tokens'` a pak `t.spacing.md`.
export const t = {
  spacing,
  radius,
  fontSize,
  fontWeight,
  size,
  modal,
} as const;
