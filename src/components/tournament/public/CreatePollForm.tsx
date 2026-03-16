import { useState, useEffect } from 'react';
import { createChatPoll } from '../../../services/tournament.firebase';
import { useI18n } from '../../../i18n';

interface PollTemplate {
  question: string;
  options: string[];
}

const STORAGE_KEY = 'torq_poll_templates';

function loadTemplates(): PollTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveTemplate(tmpl: PollTemplate) {
  try {
    const all = loadTemplates();
    // Deduplikace — pokud stejná otázka existuje, nahraď ji
    const filtered = all.filter(t => t.question !== tmpl.question);
    filtered.unshift(tmpl); // Nejnovější nahoře
    // Max 20 šablon
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, 20)));
  } catch { /* */ }
}

function deleteTemplate(question: string) {
  try {
    const all = loadTemplates();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.filter(t => t.question !== question)));
  } catch { /* */ }
}

interface Props {
  tournamentId: string;
  onClose: () => void;
}

export function CreatePollForm({ tournamentId, onClose }: Props) {
  const { t } = useI18n();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<PollTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    setTemplates(loadTemplates());
  }, []);

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (i: number) => {
    if (options.length > 2) setOptions(options.filter((_, idx) => idx !== i));
  };

  const updateOption = (i: number, val: string) => {
    const next = [...options];
    next[i] = val;
    setOptions(next);
  };

  const loadFromTemplate = (tmpl: PollTemplate) => {
    setQuestion(tmpl.question);
    setOptions([...tmpl.options]);
    setShowTemplates(false);
  };

  const handleDeleteTemplate = (q: string) => {
    deleteTemplate(q);
    setTemplates(loadTemplates());
  };

  const validOptions = options.filter(o => o.trim());
  const canSubmit = question.trim() && validOptions.length >= 2 && !sending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSending(true);
    try {
      const trimmedQ = question.trim();
      const trimmedOpts = validOptions.map(o => o.trim());
      await createChatPoll(tournamentId, trimmedQ, trimmedOpts);
      // Ulož jako šablonu pro příště
      saveTemplate({ question: trimmedQ, options: trimmedOpts });
      onClose();
    } catch { /* */ }
    setSending(false);
  };

  return (
    <div style={{
      background: 'var(--surface)', borderRadius: 14, padding: '14px',
      boxShadow: '0 2px 12px rgba(0,0,0,.12)', marginBottom: 8,
      border: '1.5px solid var(--primary)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>📊</span>
        <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{t('tournament.chat.createPoll')}</span>
        {templates.length > 0 && (
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            style={{
              padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: showTemplates ? 'var(--primary)' : 'var(--surface-var)',
              color: showTemplates ? '#fff' : 'var(--text-muted)',
              border: '1px solid var(--border)', cursor: 'pointer',
            }}
          >📋 {t('tournament.chat.pollTemplates')}</button>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', fontSize: 16, cursor: 'pointer',
            color: 'var(--text-muted)', padding: '2px 6px',
          }}
        >✕</button>
      </div>

      {/* Templates list */}
      {showTemplates && (
        <div style={{
          marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 160, overflowY: 'auto',
        }}>
          {templates.map((tmpl, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--surface-var)', cursor: 'pointer',
              }}
            >
              <div
                onClick={() => loadFromTemplate(tmpl)}
                style={{ flex: 1, minWidth: 0 }}
              >
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {tmpl.question}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  {tmpl.options.join(' · ')}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.question); }}
                title={t('tournament.chat.pollDeleteTemplate')}
                style={{
                  background: 'none', border: 'none', fontSize: 12, cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '2px 4px', flexShrink: 0,
                }}
              >🗑</button>
            </div>
          ))}
        </div>
      )}

      {/* Question */}
      <input
        value={question}
        onChange={e => setQuestion(e.target.value)}
        maxLength={200}
        placeholder={t('tournament.chat.pollQuestion')}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 16,
          background: 'var(--surface-var)', border: '1.5px solid var(--border)',
          marginBottom: 8, boxSizing: 'border-box', fontWeight: 600,
        }}
        autoFocus
      />

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={opt}
              onChange={e => updateOption(i, e.target.value)}
              maxLength={100}
              placeholder={`${t('tournament.chat.pollOption')} ${i + 1}`}
              style={{
                flex: 1, padding: '8px 10px', borderRadius: 8, fontSize: 16,
                background: 'var(--surface-var)', border: '1px solid var(--border)',
                boxSizing: 'border-box',
              }}
            />
            {options.length > 2 && (
              <button
                onClick={() => removeOption(i)}
                style={{
                  background: 'none', border: 'none', fontSize: 14, cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '2px 6px', flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>
        ))}

        {options.length < 6 && (
          <button
            onClick={addOption}
            style={{
              padding: '6px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: 'var(--surface-var)', color: 'var(--primary)',
              border: '1px dashed var(--border)', cursor: 'pointer',
            }}
          >+ {t('tournament.chat.addOption')}</button>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '10px', borderRadius: 10, fontSize: 14, fontWeight: 700,
          background: canSubmit ? 'var(--primary)' : 'var(--surface-var)',
          color: canSubmit ? '#fff' : 'var(--text-muted)',
          cursor: canSubmit ? 'pointer' : 'default',
          transition: 'background .15s',
        }}
      >{t('tournament.chat.publishPoll')}</button>
    </div>
  );
}
