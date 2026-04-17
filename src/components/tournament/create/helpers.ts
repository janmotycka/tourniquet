import { TEAM_COLORS } from '../../../utils/team-colors';
import type { TeamDraft } from './types';
import type { Club } from '../../../types/club.types';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function defaultTeams(t: (key: string, params?: Record<string, string | number>) => string, homeClub?: Club | null): TeamDraft[] {
  if (homeClub) {
    // Preferovaně použij plný roster (ClubPlayer s id) — propaguje clubPlayerId
    // pro spolehlivé matchování statistik. Fallback na defaultPlayers (legacy).
    const fullRoster = (homeClub.players ?? []).filter(p => p.active);
    const players = fullRoster.length > 0
      ? fullRoster.map(p => ({
          name: p.name,
          jerseyNumber: p.jerseyNumber,
          clubPlayerId: p.id,
        }))
      : (homeClub.defaultPlayers ?? []).map(p => ({ ...p }));
    return [
      {
        name: homeClub.name,
        color: homeClub.color,
        players,
        expanded: false,
        clubId: homeClub.id,
        logoBase64: homeClub.logoBase64,
      },
    ];
  }
  return [
    { name: t('tournament.create.homeTeam'), color: TEAM_COLORS[0], players: [], expanded: false, clubId: null, logoBase64: null },
  ];
}

export async function resizeLogoToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('canvas')); return; }
        // Crop to square center
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function rotateRight<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  if (len === 0) return arr;
  const shift = n % len;
  return [...arr.slice(len - shift), ...arr.slice(0, len - shift)];
}

export function generateDefaultMatchOrder(teamCount: number) {
  const indices = Array.from({ length: teamCount }, (_, i) => i);
  const hasBye = indices.length % 2 !== 0;
  if (hasBye) indices.push(-1); // -1 = BYE
  const n = indices.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;
  const order: Array<{ homeTeamIndex: number; awayTeamIndex: number; roundIndex: number }> = [];
  for (let round = 0; round < rounds; round++) {
    const rotated = [indices[0], ...rotateRight(indices.slice(1), round)];
    for (let i = 0; i < matchesPerRound; i++) {
      const home = rotated[i];
      const away = rotated[n - 1 - i];
      if (home === -1 || away === -1) continue;
      order.push({ homeTeamIndex: home, awayTeamIndex: away, roundIndex: round });
    }
  }
  return order;
}
