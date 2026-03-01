/**
 * Zustand store pro databázi kontaktů trenérů.
 * Kontakty přetrvávají mezi turnaji, provázané s kluby.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Contact } from '../types/contact.types';
import { generateId } from '../utils/id';
import {
  saveContact as saveContactFb,
  loadContacts as loadContactsFb,
  deleteContact as deleteContactFb,
} from '../services/contact.firebase';
import { logger } from '../utils/logger';

interface ContactsState {
  contacts: Contact[];

  loadFromFirebase: (uid: string) => Promise<void>;

  /** Vytvoří nebo aktualizuje kontakt (match na phone) */
  createOrUpdateContact: (
    uid: string,
    input: { name: string; phone: string; email?: string; clubId?: string | null; clubName?: string | null },
  ) => Promise<Contact>;

  deleteContact: (uid: string, contactId: string) => Promise<void>;

  getByPhone: (phone: string) => Contact | undefined;
  getByClub: (clubId: string) => Contact[];
}

export const useContactsStore = create<ContactsState>()(
  persist(
    (set, get) => ({
      contacts: [],

      loadFromFirebase: async (uid) => {
        try {
          const contacts = await loadContactsFb(uid);
          set({ contacts });
          logger.debug('[Contacts] Loaded', contacts.length, 'contacts');
        } catch (err) {
          logger.warn('[Contacts] Load failed:', err);
        }
      },

      createOrUpdateContact: async (uid, input) => {
        const existing = get().contacts.find(
          c => c.phone === input.phone && c.phone.length > 0,
        );
        const now = new Date().toISOString();

        if (existing) {
          // Aktualizovat existující
          const updated: Contact = {
            ...existing,
            name: input.name || existing.name,
            email: input.email || existing.email,
            clubId: input.clubId ?? existing.clubId,
            clubName: input.clubName ?? existing.clubName,
            lastUsedAt: now,
          };
          set(s => ({
            contacts: s.contacts.map(c => c.id === existing.id ? updated : c),
          }));
          await saveContactFb(uid, updated);
          return updated;
        }

        // Vytvořit nový
        const contact: Contact = {
          id: generateId(),
          name: input.name,
          phone: input.phone,
          email: input.email ?? '',
          clubId: input.clubId ?? null,
          clubName: input.clubName ?? null,
          lastUsedAt: now,
          createdAt: now,
        };
        set(s => ({ contacts: [...s.contacts, contact] }));
        await saveContactFb(uid, contact);
        return contact;
      },

      deleteContact: async (uid, contactId) => {
        set(s => ({ contacts: s.contacts.filter(c => c.id !== contactId) }));
        await deleteContactFb(uid, contactId);
      },

      getByPhone: (phone) => get().contacts.find(c => c.phone === phone),
      getByClub: (clubId) => get().contacts.filter(c => c.clubId === clubId),
    }),
    { name: 'trenink-contacts' },
  ),
);
