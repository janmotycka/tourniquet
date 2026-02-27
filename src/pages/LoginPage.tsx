import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

type Mode = 'login' | 'register' | 'reset';

export function LoginPage() {
  const { signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword, authError } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) { setError(t('login.emailRequired')); return; }
    if (mode !== 'reset' && password.length < 6) { setError(t('login.passwordMin')); return; }

    setLoading(true);
    let err: string | null = null;

    if (mode === 'login') {
      err = await signInWithEmail(email.trim(), password);
    } else if (mode === 'register') {
      if (!name.trim()) { setError(t('login.nameRequired')); setLoading(false); return; }
      err = await signUpWithEmail(email.trim(), password, name.trim());
    } else {
      err = await resetPassword(email.trim());
      if (!err) setResetSent(true);
    }

    if (err) setError(err);
    setLoading(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: '1.5px solid var(--border)', fontSize: 15,
    background: 'var(--bg)', color: 'var(--text)', boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', gap: 28, minHeight: '100dvh',
      background: 'var(--bg)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 44, boxShadow: '0 8px 32px rgba(0,0,0,.10)',
        }}>⚽</div>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>TORQ</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
            {t('login.subtitle')}
          </p>
        </div>
      </div>

      {/* Login card */}
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--surface)', borderRadius: 24, padding: '28px 24px',
        boxShadow: '0 4px 24px rgba(0,0,0,.08)', border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>
            {mode === 'login' ? t('login.tabLogin') : mode === 'register' ? t('login.tabRegister') : t('login.tabForgot')}
          </h2>
        </div>

        {/* Login / Register toggle */}
        {mode !== 'reset' && (
          <div style={{ display: 'flex', background: 'var(--surface-var)', borderRadius: 12, padding: 3 }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: 10, fontWeight: 700, fontSize: 14,
                  background: mode === m ? 'var(--surface)' : 'transparent',
                  color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                }}
              >
                {m === 'login' ? t('login.submitLogin') : t('login.submitRegister')}
              </button>
            ))}
          </div>
        )}

        {/* Reset success */}
        {mode === 'reset' && resetSent && (
          <div style={{
            background: '#E8F5E9', borderRadius: 12, padding: '12px 14px',
            fontSize: 14, color: '#2E7D32', fontWeight: 600, lineHeight: 1.5,
          }}>
            ✅ {t('login.resetSent', { email })}
          </div>
        )}

        {/* Form */}
        {!(mode === 'reset' && resetSent) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'register' && (
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError(''); }}
                placeholder={t('login.name')}
                style={inputStyle}
                autoComplete="name"
              />
            )}
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder={t('login.email')}
              style={inputStyle}
              autoComplete="email"
            />
            {mode !== 'reset' && (
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                placeholder={t('login.password')}
                style={inputStyle}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            )}
          </div>
        )}

        {/* Error */}
        {(error || authError) && (
          <div style={{
            background: '#FFEBEE', borderRadius: 10, padding: '10px 14px',
            fontSize: 13, color: '#C62828', fontWeight: 600,
          }}>
            {error || authError}
          </div>
        )}

        {/* Submit */}
        {!(mode === 'reset' && resetSent) && (
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '13px', borderRadius: 14, fontWeight: 800, fontSize: 15,
              background: 'var(--primary)', color: '#fff',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading
              ? t('common.loading')
              : mode === 'login' ? t('login.submitLogin')
              : mode === 'register' ? t('login.submitRegister')
              : t('login.submitForgot')}
          </button>
        )}

        {/* Forgot / Back links */}
        {mode === 'login' && (
          <button
            onClick={() => { setMode('reset'); setError(''); setResetSent(false); }}
            style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}
          >
            {t('login.forgotLink')}
          </button>
        )}
        {mode === 'reset' && (
          <button
            onClick={() => { setMode('login'); setError(''); setResetSent(false); }}
            style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}
          >
            {t('login.backToLogin')}
          </button>
        )}

        {/* Separator */}
        {mode !== 'reset' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{t('common.or')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
        )}

        {/* Google button */}
        {mode !== 'reset' && (
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              padding: '12px 20px', borderRadius: 14, width: '100%',
              background: '#fff', border: '2px solid var(--border)',
              fontWeight: 700, fontSize: 14, color: '#333',
              boxShadow: '0 2px 8px rgba(0,0,0,.08)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {t('login.google')}
          </button>
        )}
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        {t('login.guestNote')}
      </p>
    </div>
  );
}
