import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { signInWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Přihlášení selhalo';
      // Ignorujeme cancelled popup (uživatel zavřel okno)
      if (!msg.includes('popup-closed') && !msg.includes('cancelled')) {
        setError('Přihlášení se nezdařilo. Zkus to prosím znovu.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', gap: 32, minHeight: '100dvh',
      background: 'var(--bg)',
    }}>

      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 88, height: 88, borderRadius: 28,
          background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 48,
          boxShadow: '0 8px 32px rgba(0,0,0,.10)',
        }}>
          ⚽
        </div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
            Tourniquet
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 15, marginTop: 6, lineHeight: 1.5 }}>
            Turnaje a tréninky pro fotbalové trenéry
          </p>
        </div>
      </div>

      {/* Přihlašovací karta */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--surface)',
        borderRadius: 24, padding: '32px 24px',
        boxShadow: '0 4px 24px rgba(0,0,0,.08)',
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>Přihlášení</h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Pro přístup k aplikaci se přihlas svým Google účtem
          </p>
        </div>

        {error && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 12, padding: '12px 14px',
            fontSize: 13, color: '#DC2626', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            padding: '14px 20px', borderRadius: 14, width: '100%',
            background: loading ? 'var(--border)' : '#fff',
            border: '2px solid var(--border)',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 700, fontSize: 15, color: 'var(--text)',
            boxShadow: '0 2px 8px rgba(0,0,0,.08)',
            transition: 'all .15s',
          }}
        >
          {loading ? (
            <>
              <span style={{ fontSize: 18 }}>⏳</span>
              Přihlašování…
            </>
          ) : (
            <>
              {/* Google logo */}
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Přihlásit se přes Google
            </>
          )}
        </button>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
          Přihlášením souhlasíš s tím, že tvá data budou uložena v bezpečném cloudu a přístupná pouze tobě.
        </p>
      </div>

      {/* Footer */}
      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Diváci a rodiče nepotřebují účet — stačí odkaz nebo QR kód
      </p>

    </div>
  );
}
