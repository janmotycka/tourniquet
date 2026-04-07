import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged, signInWithPopup, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInAnonymously as firebaseSignInAnonymously,
  updateProfile, sendPasswordResetEmail, sendEmailVerification,
  type User,
} from 'firebase/auth';
import { ref as dbRef, get as dbGet } from 'firebase/database';
import { auth, db, googleProvider } from '../firebase';
import { logger } from '../utils/logger';
import { useI18n } from '../i18n';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  blocked: boolean;
  blockReason: string | null;
  signInWithGoogle: () => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  signInAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Dev auth bypass — povoleno POUZE v development mode + explicitní env flag.
 * V production buildu (npx vite build) je import.meta.env.DEV === false,
 * takže bypass nikdy neproběhne, i kdyby .env.local soubor existoval.
 */
const DEV_AUTH_BYPASS = import.meta.env.DEV === true && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  // Sleduj stav přihlášení + kontrola block flagu
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u && !u.isAnonymous) {
        try {
          const flagsSnap = await dbGet(dbRef(db, `users/${u.uid}/flags`));
          const flags = flagsSnap.val() as { blocked?: boolean; reason?: string } | null;
          if (flags?.blocked === true) {
            logger.warn('[Auth] user is blocked, signing out');
            setBlocked(true);
            setBlockReason(flags.reason || null);
            setUser(null);
            await signOut(auth);
            setLoading(false);
            return;
          }
        } catch (err) {
          logger.error('[Auth] failed to read flags:', err);
        }
      }
      setBlocked(false);
      setBlockReason(null);
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // (redirect result handler odstraněn — používáme popup)

  const signInWithGoogle = () => {
    setAuthError(null);

    // DEV BYPASS: pouze pokud je VITE_DEV_AUTH_BYPASS=true v .env.local
    if (DEV_AUTH_BYPASS) {
      setUser({
        uid: 'dev-user-local',
        displayName: 'Dev Trenér',
        email: 'dev@localhost',
        photoURL: null,
      } as unknown as User);
      setLoading(false);
      return;
    }

    // Popup — authDomain je na stejné doméně, takže popup funguje bez cookie problémů
    signInWithPopup(auth, googleProvider)
      .then((result) => {
        setUser(result.user);
      })
      .catch((err) => {
        const code = (err as { code?: string }).code ?? 'unknown';
        logger.error('[Auth] popup error:', code);
        // Generická chyba — neleakujeme Firebase error kódy uživateli
        if (code === 'auth/popup-closed-by-user') return; // uživatel zavřel popup, není chyba
        if (code === 'auth/too-many-requests') {
          setAuthError(t('auth.tooManyAttempts'));
        } else {
          setAuthError(t('auth.googleFailed'));
        }
      });
  };

  const signInWithEmail = async (email: string, password: string): Promise<string | null> => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        return t('auth.invalidCredentials');
      }
      if (code === 'auth/invalid-email') return t('auth.invalidEmail');
      if (code === 'auth/too-many-requests') return t('auth.tooManyAttempts');
      if (code === 'auth/operation-not-allowed') return t('auth.emailAuthDisabled');
      return t('auth.signInFailed');
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string): Promise<string | null> => {
    setAuthError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: displayName.trim() || 'Trenér' });
      // Pošli ověřovací email (fire-and-forget — i kdyby selhal, uživatel se může přihlásit)
      sendEmailVerification(credential.user).catch((err) => {
        logger.error('[Auth] sendEmailVerification failed:', err);
      });
      return null;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/email-already-in-use') return t('auth.emailInUse');
      if (code === 'auth/invalid-email') return t('auth.invalidEmail');
      if (code === 'auth/weak-password') return t('auth.weakPassword');
      if (code === 'auth/operation-not-allowed') return t('auth.emailAuthDisabled');
      return t('auth.registrationFailed');
    }
  };

  const resetPassword = async (email: string): Promise<string | null> => {
    try {
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      return null;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      logger.error('[Auth] resetPassword error:', code);
      // Bezpečnost: nesdělujeme zda účet existuje (prevence user enumeration)
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        return null; // tváříme se že email byl odeslán
      }
      if (code === 'auth/invalid-email') return t('auth.invalidEmail');
      if (code === 'auth/too-many-requests') return t('auth.tooManyAttempts');
      return t('auth.resetFailed');
    }
  };

  const signInAnonymously = async () => {
    try {
      await firebaseSignInAnonymously(auth);
    } catch (err) {
      logger.error('[Auth] anonymous sign-in error:', err);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, blocked, blockReason, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, signInAnonymously, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
