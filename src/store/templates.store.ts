/**
 * Zustand store pro šablony turnajů.
 * Šablony ukládají konfiguraci turnaje pro opakované použití.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '../utils/safe-storage';
import type { TournamentTemplate } from '../types/tournament.types';
import {
  saveTemplate as saveTemplateFb,
  loadTemplates as loadTemplatesFb,
  deleteTemplate as deleteTemplateFb,
} from '../services/template.firebase';
import { logger } from '../utils/logger';

interface TemplatesState {
  templates: TournamentTemplate[];

  loadFromFirebase: (uid: string) => Promise<void>;
  saveTemplate: (uid: string, template: TournamentTemplate) => Promise<void>;
  deleteTemplate: (uid: string, templateId: string) => Promise<void>;
}

export const useTemplatesStore = create<TemplatesState>()(
  persist(
    (set) => ({
      templates: [],

      loadFromFirebase: async (uid) => {
        try {
          const templates = await loadTemplatesFb(uid);
          set({ templates });
          logger.debug('[Templates] Loaded', templates.length, 'templates');
        } catch (err) {
          logger.warn('[Templates] Load failed:', err);
        }
      },

      saveTemplate: async (uid, template) => {
        set(s => ({ templates: [template, ...s.templates] }));
        try {
          await saveTemplateFb(uid, template);
        } catch (err) {
          logger.warn('[Templates] Save failed:', err);
        }
      },

      deleteTemplate: async (uid, templateId) => {
        set(s => ({ templates: s.templates.filter(t => t.id !== templateId) }));
        try {
          await deleteTemplateFb(uid, templateId);
        } catch (err) {
          logger.warn('[Templates] Delete failed:', err);
        }
      },
    }),
    { name: 'trenink-templates', storage: createJSONStorage(() => safeStorage) },
  ),
);
