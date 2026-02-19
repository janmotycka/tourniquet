import type { Page } from '../App';
import { useAuth } from '../context/AuthContext';

interface Props { navigate: (p: Page) => void; }

export function HomePage({ navigate }: Props) {
  const { user, logout } = useAuth();

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '24px 20px', gap: 20, overflowY: 'auto', paddingBottom: 40,
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0,
        }}>
          ⚽
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.2 }}>Ahoj, trenére!</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.displayName ?? user?.email ?? 'Přihlášený uživatel'}
          </p>
        </div>
        <button
          onClick={logout}
          title="Odhlásit se"
          style={{
            flexShrink: 0, padding: '8px 14px', borderRadius: 12,
            background: 'var(--surface)', border: '1.5px solid var(--border)',
            color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Odhlásit
        </button>
      </div>

      {/* Module cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ⚽ Trénink */}
        <button
          onClick={() => navigate({ name: 'training-home' })}
          style={{
            background: 'var(--primary)', borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(var(--primary-rgb, 0,100,0),.20)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>⚽</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>Trénink</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              Generátor tréninků, knihovna cvičení, plánování a kalendář
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            Otevřít →
          </div>
        </button>

        {/* 🏆 Turnaj */}
        <button
          onClick={() => navigate({ name: 'tournament-list' })}
          style={{
            background: 'linear-gradient(135deg, #E65100 0%, #FF6F00 100%)',
            borderRadius: 22, padding: '24px',
            display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left',
            boxShadow: '0 4px 16px rgba(230,81,0,.25)', width: '100%',
            color: '#fff',
          }}
        >
          <div style={{ fontSize: 44 }}>🏆</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 22, lineHeight: 1.2 }}>Turnaj</div>
            <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
              Organizace turnaje, živá tabulka, výsledky a QR pro hosty
            </div>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 16px',
            fontWeight: 700, fontSize: 15, textAlign: 'center',
          }}>
            Otevřít →
          </div>
        </button>

      </div>

      {/* Disabled club module chip */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'var(--surface)', borderRadius: 20, padding: '10px 18px',
          boxShadow: '0 1px 3px rgba(0,0,0,.06)', opacity: 0.55,
          border: '1.5px dashed var(--border)',
        }}>
          <span style={{ fontSize: 18 }}>🏟</span>
          <div>
            <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>Klub</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 6 }}>— brzy k dispozici</span>
          </div>
        </div>
      </div>

    </div>
  );
}
