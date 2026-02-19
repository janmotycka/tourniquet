export interface Club {
  id: string;
  name: string;
  color: string;          // hex barva
  logoBase64: string | null;  // null = bez loga
  defaultPlayers: Array<{ name: string; jerseyNumber: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClubInput {
  name: string;
  color: string;
  logoBase64?: string | null;
  defaultPlayers?: Array<{ name: string; jerseyNumber: number }>;
}
