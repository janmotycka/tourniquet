/**
 * useMatchLock — soft lock pro multi-trainer koordinaci na zápasu.
 *
 * Vždy jeden trenér "spravuje" zápas naráz. Ostatní vidí banner a mohou
 * převzít řízení. Lock má heartbeat (15s) a auto-expiruje po 45s stale.
 *
 * Použití (v MatchDetailPage):
 *   const { status, editor, isMine, claim, release } = useMatchLock(match);
 *
 *   - status: 'idle' (nikdo needituje) | 'mine' (já edituji) | 'other' (někdo jiný)
 *              | 'stale' (byl editor ale dávno nepingoval)
 *   - editor: { uid, name, startedAt, heartbeatAt } | null
 *   - isMine: true pokud já držím lock
 *   - claim(): pokusí se získat lock (vrátí true/false)
 *   - release(): uvolní lock (pokud ho držím)
 */

import { useEffect, useMemo, useCallback } from 'react';
import { useMatchesStore } from '../store/matches.store';
import { useAuth } from '../context/AuthContext';
import type { SeasonMatch } from '../types/match.types';

const HEARTBEAT_INTERVAL_MS = 15_000;   // jak často refreshneme heartbeat
const STALE_THRESHOLD_MS = 45_000;      // po této době od posledního pingu je lock stale

export type MatchLockStatus = 'idle' | 'mine' | 'other' | 'stale';

export interface MatchLockState {
  status: MatchLockStatus;
  editor: SeasonMatch['activeEditor'] | null;
  isMine: boolean;
  /** Sekundy od posledního heartbeatu (pro UI „před X s"). null pokud nikdo needituje. */
  ageSeconds: number | null;
  claim: () => Promise<boolean>;
  release: () => Promise<void>;
}

export function useMatchLock(match: SeasonMatch | null | undefined): MatchLockState {
  const { user } = useAuth();
  const claimMatchLock = useMatchesStore(s => s.claimMatchLock);
  const releaseMatchLock = useMatchesStore(s => s.releaseMatchLock);
  const refreshMatchLock = useMatchesStore(s => s.refreshMatchLock);

  const editor = match?.activeEditor ?? null;
  const myUid = user?.uid ?? null;

  // Vypočítej status
  const { status, ageSeconds, isMine } = useMemo(() => {
    if (!editor || !editor.uid) {
      return { status: 'idle' as MatchLockStatus, ageSeconds: null, isMine: false };
    }
    const mine = editor.uid === myUid;
    const age = Date.now() - new Date(editor.heartbeatAt).getTime();
    if (age >= STALE_THRESHOLD_MS) {
      return { status: 'stale' as MatchLockStatus, ageSeconds: Math.floor(age / 1000), isMine: mine };
    }
    return {
      status: (mine ? 'mine' : 'other') as MatchLockStatus,
      ageSeconds: Math.floor(age / 1000),
      isMine: mine,
    };
  }, [editor, myUid]);

  const userName = user?.displayName || user?.email?.split('@')[0] || 'Trenér';

  const claim = useCallback(async () => {
    if (!match) return false;
    return await claimMatchLock(match.id, userName);
  }, [match, claimMatchLock, userName]);

  const release = useCallback(async () => {
    if (!match) return;
    await releaseMatchLock(match.id);
  }, [match, releaseMatchLock]);

  // Heartbeat — pokud držím lock, refreshuj každých 15s
  useEffect(() => {
    if (!match || status !== 'mine') return;
    const interval = setInterval(() => {
      void refreshMatchLock(match.id);
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [match, status, refreshMatchLock]);

  // Auto-release když odejdu ze stránky / zavřu kartu
  useEffect(() => {
    if (!match || status !== 'mine') return;
    const handler = () => {
      // Best-effort release — nemusí stihnout odejít do Firebase, ale heartbeat
      // stejně expiruje za 45s a další trenér může převzít.
      void releaseMatchLock(match.id);
    };
    window.addEventListener('pagehide', handler);
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('pagehide', handler);
      window.removeEventListener('beforeunload', handler);
    };
  }, [match, status, releaseMatchLock]);

  // Release při unmount (když trenér přejde z detailu na seznam)
  useEffect(() => {
    return () => {
      if (match && status === 'mine') {
        void releaseMatchLock(match.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { status, editor, isMine, ageSeconds, claim, release };
}
