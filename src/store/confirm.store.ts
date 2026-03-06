/**
 * Globální potvrzovací dialog — nahrazuje browser confirm().
 *
 * Použití:
 *   const ask = useConfirmStore(s => s.ask);
 *   const ok = await ask({ title: 'Smazat?', message: 'Tato akce je nevratná.' });
 *   if (ok) { // smazat }
 *
 * Nebo mimo React:
 *   const ok = await useConfirmStore.getState().ask({ ... });
 */

import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolve: ((ok: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,

  ask: (opts) => {
    return new Promise<boolean>((resolve) => {
      // Pokud je už otevřený, uzavřít předchozí
      const prev = get().resolve;
      if (prev) prev(false);

      set({ open: true, options: opts, resolve });
    });
  },

  close: (result) => {
    const { resolve } = get();
    if (resolve) resolve(result);
    set({ open: false, options: null, resolve: null });
  },
}));
