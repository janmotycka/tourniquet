/**
 * Globální Toast notifikace — přístupné odkudkoli v aplikaci.
 *
 * Použití:
 *   import { useToastStore } from '../store/toast.store';
 *   const { show } = useToastStore();
 *   show('success', 'Turnaj uložen!');
 *   show('error', 'Synchronizace selhala.', 6000);
 *
 * Nebo mimo React komponent (např. ze Zustand store):
 *   useToastStore.getState().show('error', 'Firebase chyba');
 */

import { create } from 'zustand';
import { generateId } from '../utils/id';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastEntry {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: ToastEntry[];
  show: (type: ToastType, message: string, durationMs?: number) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  show: (type, message, durationMs = 4000) => {
    const id = generateId();
    set(s => ({ toasts: [...s.toasts, { id, type, message }] }));
    setTimeout(() => get().dismiss(id), durationMs);
  },

  dismiss: (id) => {
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
  },
}));
