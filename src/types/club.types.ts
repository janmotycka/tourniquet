// ─── Věkové kategorie ──────────────────────────────────────────────────────
export const AGE_CATEGORIES = [
  'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12',
  'U13', 'U14', 'U15', 'U17', 'U19',
] as const;

export type AgeCategory = typeof AGE_CATEGORIES[number];

// ─── Hráč v klubovém rosteru ───────────────────────────────────────────────
export interface ClubPlayer {
  id: string;
  name: string;
  jerseyNumber: number;
  birthYear: number | null;
  ageCategory: AgeCategory;
  active: boolean;          // soft-delete
}

// ─── Klub ──────────────────────────────────────────────────────────────────
export interface Club {
  id: string;
  name: string;
  color: string;            // hex barva
  logoBase64: string | null; // null = bez loga
  defaultPlayers: Array<{ name: string; jerseyNumber: number }>; // zpětná kompatibilita
  players: ClubPlayer[];     // plný roster s kategoriemi
  ageCategories: AgeCategory[]; // aktivní kategorie klubu
  createdAt: string;
  updatedAt: string;
}

export interface CreateClubInput {
  name: string;
  color: string;
  logoBase64?: string | null;
  defaultPlayers?: Array<{ name: string; jerseyNumber: number }>;
  ageCategories?: AgeCategory[];
}
