/** ─── Design Tokens ─────────────────────────────────────────────────────────
 *
 * Single source of truth for visual design constants.
 * Import and use these instead of hardcoded values.
 */

// ─── Border Radius ─────────────────────────────────────────────────────────
export const radius = {
  /** Tiny elements: tags, badges, thin dividers */
  xs: 6,
  /** Small: secondary buttons, icon buttons, chips */
  sm: 8,
  /** Medium: inputs, primary buttons, small cards */
  md: 12,
  /** Large: cards, panels, dropdowns, sections */
  lg: 14,
  /** Full: bottom sheets (top corners only) */
  sheet: '20px 20px 0 0',
  /** Circle */
  full: '50%',
} as const;

// ─── Box Shadow ────────────────────────────────────────────────────────────
export const shadow = {
  /** Subtle card shadow */
  sm: '0 1px 4px rgba(0,0,0,.06)',
  /** Medium elevation: dropdowns, popovers */
  md: '0 4px 16px rgba(0,0,0,.12)',
  /** High elevation: modals, bottom sheets */
  lg: '0 8px 32px rgba(0,0,0,.18)',
  /** Toast notifications */
  toast: '0 4px 20px rgba(0,0,0,.25)',
} as const;

// ─── Backdrop ──────────────────────────────────────────────────────────────
export const backdrop = {
  /** Standard overlay for modals, sheets, dropdowns */
  color: 'rgba(0,0,0,.5)',
} as const;

// ─── Spacing ───────────────────────────────────────────────────────────────
export const space = {
  /** 4px — tight spacing, inline elements */
  xs: 4,
  /** 6px — compact list items */
  sm: 6,
  /** 8px — default gap between small elements */
  md: 8,
  /** 12px — gap between cards, sections */
  lg: 12,
  /** 16px — page-level padding, section gaps */
  xl: 16,
  /** 20px — large section spacing */
  '2xl': 20,
  /** 24px — modal padding */
  '3xl': 24,
} as const;

// ─── Font Sizes ────────────────────────────────────────────────────────────
export const font = {
  /** 11px — timestamps, tiny labels */
  xs: 11,
  /** 12px — captions, secondary text */
  sm: 12,
  /** 13px — compact body, card text */
  md: 13,
  /** 14px — standard body text, buttons */
  base: 14,
  /** 16px — subheadings, emphasized text */
  lg: 16,
  /** 18px — section titles */
  xl: 18,
  /** 20px — page titles */
  '2xl': 20,
  /** 24px+ — hero text */
  '3xl': 24,
} as const;

// ─── Font Weights ──────────────────────────────────────────────────────────
export const weight = {
  /** Normal body text */
  normal: 400,
  /** Slightly emphasized */
  medium: 500,
  /** Labels, buttons, nav items */
  semibold: 600,
  /** Headings, important text */
  bold: 700,
  /** Hero text, scores, strong emphasis */
  extrabold: 800,
} as const;

// ─── Semantic Colors ───────────────────────────────────────────────────────
export const color = {
  success: {
    bg: '#E8F5E9',
    text: '#2E7D32',
    border: '#C8E6C9',
  },
  danger: {
    bg: '#FFEBEE',
    text: '#C62828',
    border: '#FFCDD2',
    dark: '#B71C1C',
  },
  warning: {
    bg: '#FFF3E0',
    text: '#E65100',
    border: '#FFB74D',
  },
  info: {
    bg: '#E3F2FD',
    text: '#0D47A1',
    border: '#90CAF9',
  },
  gold: {
    bg: 'linear-gradient(135deg, #FFF8E1 0%, #FFFDE7 100%)',
    text: '#F57F17',
    border: '#FFD54F',
  },
} as const;

// ─── Common Padding Patterns ───────────────────────────────────────────────
export const padding = {
  /** Card/section internal padding */
  card: '12px 14px',
  /** Page-level horizontal padding */
  page: '0 16px',
  /** Compact button padding */
  buttonSm: '6px 12px',
  /** Standard button padding */
  button: '10px 16px',
  /** Input field padding */
  input: '10px 12px',
  /** Modal/sheet body padding */
  sheet: '20px 16px 32px',
} as const;
