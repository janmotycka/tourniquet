import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged, signInWithPopup, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, sendEmailVerification,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => void;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<string | null>;
  resetPassword: (email: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** True pouze pokud je explicitně nastaven VITE_DEV_AUTH_BYPASS=true v .env */
const DEV_AUTH_BYPASS = import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Sleduj stav přihlášení
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
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
        const msg = (err as { message?: string }).message ?? '';
        logger.error('[Auth] popup error:', code, msg);
        setAuthError(`Google přihlášení selhalo (${code}). ${msg}`);
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
        return 'Nesprávný email nebo heslo.';
      }
      if (code === 'auth/invalid-email') return 'Neplatná emailová adresa.';
      if (code === 'auth/too-many-requests') return 'Příliš mnoho pokusů. Zkuste to za chvíli.';
      if (code === 'auth/operation-not-allowed') return 'Přihlašování emailem není povoleno. Kontaktujte správce.';
      return 'Přihlášení se nezdařilo. Zkuste to znovu.';
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
      if (code === 'auth/email-already-in-use') return 'Tento email je již zaregistrován.';
      if (code === 'auth/invalid-email') return 'Neplatná emailová adresa.';
      if (code === 'auth/weak-password') return 'Heslo musí mít alespoň 6 znaků.';
      if (code === 'auth/operation-not-allowed') return 'Přihlašování emailem není povoleno. Kontaktujte správce.';
      return 'Registrace se nezdařila. Zkuste to znovu.';
    }
  };

  const resetPassword = async (email: string): Promise<string | null> => {
    try {
      // actionCodeSettings říká Firebase, kam přesměrovat po resetu hesla
      const actionCodeSettings = {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: false,
      };
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      return null;
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      const msg = (err as { message?: string }).message ?? '';
      logger.error('[Auth] resetPassword error:', code, msg);
      if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        return 'Účet s tímto emailem neexistuje.';
      }
      if (code === 'auth/invalid-email') return 'Neplatná emailová adresa.';
      if (code === 'auth/too-many-requests') return 'Příliš mnoho pokusů. Zkuste to za chvíli.';
      return `Nepodařilo se odeslat reset hesla. (${code || msg})`;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
