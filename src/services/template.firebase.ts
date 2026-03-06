/**
 * Firebase Realtime Database — Tournament templates service
 *
 * Cesta: /templates/{ownerUid}/{templateId}
 */

import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';
import type { TournamentTemplate } from '../types/tournament.types';

const templatesRef = (uid: string) =>
  ref(db, `templates/${uid}`);

const templateRef = (uid: string, templateId: string) =>
  ref(db, `templates/${uid}/${templateId}`);

/** Uloží/aktualizuje šablonu */
export async function saveTemplate(uid: string, template: TournamentTemplate): Promise<void> {
  await set(templateRef(uid, template.id), template);
}

/** Smaže šablonu */
export async function deleteTemplate(uid: string, templateId: string): Promise<void> {
  await remove(templateRef(uid, templateId));
}

/** Načte všechny šablony uživatele */
export async function loadTemplates(uid: string): Promise<TournamentTemplate[]> {
  const snapshot = await get(templatesRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, TournamentTemplate>;
  return Object.values(data);
}
