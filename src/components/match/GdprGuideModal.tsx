/**
 * GdprGuideModal — informativní průvodce + šablona pro získání GDPR souhlasu
 * rodičů s pořizováním a zveřejňováním záznamů ze zápasů a turnajů.
 *
 * Audit 2026-05-25: po implementaci consent gate (J-2) trenéři ptali "jak to
 * vyřešit s rodiči?". Aplikace nedává právní radu, ale nabídne:
 * - Obecná doporučení (stanovy / informované oznámení / přihláška)
 * - Copy-paste šablonu textu
 * - Caveat: konzultuj právníka klubu
 *
 * Použití: otevírá se z GDPR consent dialogu (link "Jak vyřešit?") nebo
 * ze Settings → GDPR návod.
 */

import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';

interface Props {
  onClose: () => void;
  /**
   * Pokud uveden, modal funguje jako consent gate — zobrazí "Mám souhlas,
   * zveřejnit" + "Zrušit" tlačítka ve footeru. Pokud undefined, modal je
   * jen informativní (otevřeno ze Settings).
   */
  onConfirmPublish?: () => void;
}

export function GdprGuideModal({ onClose, onConfirmPublish }: Props) {
  const { t } = useI18n();
  const showToast = useToastStore(s => s.show);
  const [copied, setCopied] = useState(false);

  const templateText = t('gdprGuide.template');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(templateText);
      setCopied(true);
      showToast('success', t('gdprGuide.copiedToast'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', t('gdprGuide.copyFailed'));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.55)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--surface)', borderRadius: '20px 20px 0 0',
          width: '100%', maxWidth: 560,
          maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '4px 16px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
              🔒 {t('gdprGuide.title')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {t('gdprGuide.subtitle')}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            style={{
              width: 32, height: 32, borderRadius: 10, border: 'none',
              background: 'var(--surface-var)', color: 'var(--text-muted)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '0 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Caveat banner */}
          <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--warning-light)', border: '1px dashed var(--warning)',
            fontSize: 12, color: 'var(--text)', lineHeight: 1.5,
          }}>
            <strong>⚠️ {t('gdprGuide.disclaimerTitle')}</strong>
            <br />
            <span style={{ color: 'var(--text-muted)' }}>
              {t('gdprGuide.disclaimerBody')}
            </span>
          </div>

          {/* Section: Jak to obvykle dělají kluby */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              💡 {t('gdprGuide.howSectionTitle')}
            </h3>
            <ol style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>
              <li>{t('gdprGuide.howOption1')}</li>
              <li>{t('gdprGuide.howOption2')}</li>
              <li>{t('gdprGuide.howOption3')}</li>
              <li>{t('gdprGuide.howOption4')}</li>
            </ol>
          </section>

          {/* Section: Co aplikace TORQ dělá */}
          <section style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-var)', border: '1px solid var(--border)',
          }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
              🔐 {t('gdprGuide.appSectionTitle')}
            </h3>
            <ul style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              <li>{t('gdprGuide.appPoint1')}</li>
              <li>{t('gdprGuide.appPoint2')}</li>
              <li>{t('gdprGuide.appPoint3')}</li>
              <li>{t('gdprGuide.appPoint4')}</li>
            </ul>
          </section>

          {/* Section: Šablona */}
          <section>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 8, gap: 8, flexWrap: 'wrap',
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>
                📝 {t('gdprGuide.templateSectionTitle')}
              </h3>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  background: copied ? 'var(--success)' : 'var(--primary)',
                  color: '#fff', border: 'none',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'background .15s',
                }}
              >
                {copied ? '✓ ' + t('gdprGuide.copied') : '📋 ' + t('gdprGuide.copyBtn')}
              </button>
            </div>
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: 'var(--surface-var)', border: '1.5px solid var(--border)',
              fontSize: 12.5, lineHeight: 1.6, color: 'var(--text)',
              whiteSpace: 'pre-wrap', fontFamily: 'inherit',
            }}>
              {templateText}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              {t('gdprGuide.templateHint')}
            </div>
          </section>

          {/* Section: Best practices */}
          <section>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              ✅ {t('gdprGuide.bestPracticesTitle')}
            </h3>
            <ul style={{ paddingLeft: 18, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text)' }}>
              <li>{t('gdprGuide.bp1')}</li>
              <li>{t('gdprGuide.bp2')}</li>
              <li>{t('gdprGuide.bp3')}</li>
              <li>{t('gdprGuide.bp4')}</li>
            </ul>
          </section>
        </div>

        {/* Consent footer — jen pokud modal funguje jako consent gate. */}
        {onConfirmPublish && (
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8,
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 14px', borderRadius: 10,
                background: 'transparent', color: 'var(--text-muted)',
                border: '1px solid var(--border)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                minHeight: 44,
              }}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => { onConfirmPublish(); onClose(); }}
              style={{
                flex: 1, padding: '12px', borderRadius: 10,
                background: 'var(--primary)', color: '#fff',
                border: 'none', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                minHeight: 44,
              }}
            >
              ✓ {t('match.detail.gdprConsentConfirm')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
