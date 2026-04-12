// ─── Věkové kategorie ──────────────────────────────────────────────────────
export const AGE_CATEGORIES = [
  'U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12',
  'U13', 'U14', 'U15', 'U17', 'U19',
  'Dorost', 'Muži', 'Muži B', 'Ženy',
] as const;

export type AgeCategory = typeof AGE_CATEGORIES[number];

// ─── Historie kategorií ────────────────────────────────────────────────────
// Sleduje, kdy hráč přešel z jedné kategorie do druhé. Otevřený interval
// (bez `to`) označuje aktuální kategorii. Při přesunu se uzavře předchozí
// záznam (`to = today`) a otevře se nový.
export interface CategoryHistoryEntry {
  category: AgeCategory;
  from: string;       // ISO YYYY-MM-DD
  to?: string;        // ISO YYYY-MM-DD; chybí = otevřený (současný) interval
  season?: string;    // např. "2025/26" (volitelné, hodí se pro zobrazení)
}

// ─── Hráč v klubovém rosteru ───────────────────────────────────────────────
export interface ClubPlayer {
  id: string;
  // Externí ID z importované platformy (EOS, XPS…) — pro deduplikaci při re-importu
  externalId?: string;
  externalSource?: 'eos' | 'xps' | 'manual' | string;

  // Jméno — `name` zůstává canonical (full name) kvůli zpětné kompatibilitě
  // s existujícím rosterem; firstName/lastName jsou volitelné, použijí se
  // pokud je import dodá.
  name: string;
  firstName?: string;
  lastName?: string;

  jerseyNumber: number;
  birthYear: number | null;
  birthDate?: string;          // ISO YYYY-MM-DD (přesné datum, pokud máme)

  position?: string;           // brankář / obránce / záložník / útočník (volný text)
  phone?: string;
  email?: string;

  ageCategory: AgeCategory;    // aktuální kategorie
  categoryHistory?: CategoryHistoryEntry[];  // historie přesunů

  active: boolean;             // soft-delete
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Klub ──────────────────────────────────────────────────────────────────
export interface Club {
  id: string;
  name: string;             // zkrácený zobrazovaný název (pro tabulky, rozpis)
  officialName?: string;    // plný oficiální název (pro PDF, dokumenty). Pokud chybí = name.
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

// ─── Shared Club Workspaces ───────────────────────────────────────────────
// Nový model — více trenérů může sdílet jeden klub přes členství.
// Uložené na /clubs/{clubId} (nikoli /users/{uid}/clubs/ jako legacy).

export type ClubRole = 'owner' | 'coach' | 'viewer';
export type ClubOwnership = 'personal' | 'verified';

export interface ClubMember {
  role: ClubRole;
  joinedAt: string;       // ISO
  invitedBy?: string;     // uid
}

/**
 * Sdílený klub (shared workspace). Rozšiřuje legacy `Club` o členství,
 * ownership flag a catalog link. Backward-compatible: pokud `members` chybí,
 * jde o legacy per-user klub.
 */
export interface SharedClub extends Club {
  ownership: ClubOwnership;
  createdBy: string;              // uid zakladatele
  catalogId?: string;             // 'wd-Q12345' pro verified kluby
  members: Record<string, ClubMember>;
}

/**
 * Žádost o ověřený klub z katalogu (verified ownership).
 * Admin schvaluje přes adminApproveClubRequest.
 */
export interface ClubRequest {
  id: string;
  catalogId: string;
  catalogName: string;
  requesterUid: string;
  requesterName: string;
  requesterRole: string;          // např. "Trenér U11", "Sekretář"
  evidenceUrl?: string | null;
  facrId?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string | null;
  clubId?: string;                // vyplněno po approval
}

/**
 * PIN pozvánka do klubu (reuse patternu z tournaments).
 * Vytváří owner klubu přes createClubInvite Cloud Function.
 */
export interface ClubInvite {
  id: string;
  clubId: string;
  role: ClubRole;                 // 'coach' | 'viewer' (owner se řeší transferem)
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
  usedBy?: string;
  usedAt?: string;
}

/**
 * Mapa klubů, kterých je uživatel členem — uložená na /users/{uid}/memberOfClubs.
 * Hodnota = role. Pointery spravuje server (Cloud Functions).
 */
export type MemberOfClubs = Record<string, ClubRole>;

