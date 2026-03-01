/**
 * Firebase Realtime Database — Coach contacts service
 *
 * Cesta: /contacts/{ownerUid}/{contactId}
 * Kontakty trenérů přetrvávají mezi turnaji, provázané s kluby.
 */

import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';
import type { Contact } from '../types/contact.types';

const contactsRef = (uid: string) =>
  ref(db, `contacts/${uid}`);

const contactRef = (uid: string, contactId: string) =>
  ref(db, `contacts/${uid}/${contactId}`);

/** Uloží/aktualizuje kontakt */
export async function saveContact(uid: string, contact: Contact): Promise<void> {
  await set(contactRef(uid, contact.id), contact);
}

/** Smaže kontakt */
export async function deleteContact(uid: string, contactId: string): Promise<void> {
  await remove(contactRef(uid, contactId));
}

/** Načte všechny kontakty uživatele */
export async function loadContacts(uid: string): Promise<Contact[]> {
  const snapshot = await get(contactsRef(uid));
  if (!snapshot.exists()) return [];
  const data = snapshot.val() as Record<string, Contact>;
  return Object.values(data);
}
