/**
 * Firebase CRUD pro fakturační profil organizátora.
 * Cesta: /users/{uid}/billingProfile
 */

import { ref, set, get } from 'firebase/database';
import { db } from '../firebase';
import type { BillingProfile } from '../types/tournament.types';
import { safeClone } from '../utils/clone';

const profileRef = (uid: string) => ref(db, `users/${uid}/billingProfile`);

/** Uloží fakturační profil */
export async function saveBillingProfile(uid: string, profile: BillingProfile): Promise<void> {
  await set(profileRef(uid), safeClone(profile));
}

/** Načte fakturační profil (nebo null pokud neexistuje) */
export async function loadBillingProfile(uid: string): Promise<BillingProfile | null> {
  const snapshot = await get(profileRef(uid));
  if (!snapshot.exists()) return null;
  return snapshot.val() as BillingProfile;
}
