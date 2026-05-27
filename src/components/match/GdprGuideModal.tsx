/**
 * GdprGuideModal — jednoduchý consent dialog s WhatsApp šablonou pro rodiče.
 *
 * Audit 2026-05-25 v2: zjednodušeno — kluby nebudou kvůli betě měnit stanovy.
 * Praktická cesta: trenér ve WhatsApp skupině s rodiči pošle krátkou zprávu,
 * která je informuje o sdílení + nabízí opt-out. Trenér si zprávu zkopíruje
 * jedním klikem.
 */

import { useState } from 'react';
import { useI18n } from '../../i18n';
import { useToastStore } from '../../store/toast.store';

interface Props {
  onClose: () => void;
  /** Pokud uveden, modal je consent gate (footer s Zveřejnit/Zrušit). */
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
          width: '100%', maxWidth: 520,
          maxHeight: '85dvh', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 2px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>

        {/* Header */}
        <div style={{
          padding: '4px 16px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>
            🔒 {t('gdprGuide.title')}
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
          flex: 1, overflowY: 'auto', padding: '0 16px 12px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Krátký intro */}
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)' }}>
            {t('gdprGuide.intro')}
          </div>

          {/* Šablona — primární akce */}
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6, gap: 8,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                💬 {t('gdprGuide.templateLabel')}
              </div>
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
              padding: '10px 12px', borderRadius: 10,
              background: 'var(--surface-var)', border: '1.5px solid var(--border)',
              fontSize: 13, lineHeight: 1.55, color: 'var(--text)',
              whiteSpace: 'pre-wrap',
            }}>
              {templateText}
            </div>
          </div>

          {/* Co aplikace dělá — krátké info */}
          <div style={{
            padding: '10px 12px', borderRadius: 10,
            background: 'var(--surface-var)',
            fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            <strong style={{ color: 'var(--text)' }}>🔐 {t('gdprGuide.appSafetyTitle')}</strong>
            <br />
            {t('gdprGuide.appSafetyBody')}
          </div>
        </div>

        {/* Footer */}
        {onConfirmPublish && (
          <div style={{
            padding: '10px 16px 14px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 8,
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '12px 16px', borderRadius: 10,
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
              ✓ {t('gdprGuide.confirmPublish')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
