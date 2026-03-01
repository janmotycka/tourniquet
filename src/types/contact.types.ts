// ─── Coach contacts database ──────────────────────────────────────────────────

export interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string;
  clubId: string | null;
  clubName: string | null;
  lastUsedAt: string;   // ISO timestamp
  createdAt: string;    // ISO timestamp
}
