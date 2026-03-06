import React, { useState, useEffect } from 'react';
import type { ChatMessage } from '../../../types/tournament.types';
import { sendChatMessage, subscribeToChatMessages } from '../../../services/tournament.firebase';
import { useI18n } from '../../../i18n';
import { chatRateLimiter } from '../../../utils/rate-limiter';

export function PublicChat({ tournamentId }: { tournamentId: string }) {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [authorName, setAuthorName] = useState(() =>
    localStorage.getItem('torq_chat_name') ?? '',
  );
  const [showNameInput, setShowNameInput] = useState(!localStorage.getItem('torq_chat_name'));
  const [sending, setSending] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToChatMessages(tournamentId, setMessages);
    return unsub;
  }, [tournamentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    if (!text.trim() || !authorName.trim() || sending) return;

    // Klientský rate limit — max 5 zpráv / 30 sekund (sliding window)
    if (!chatRateLimiter.check()) {
      setRateLimited(true);
      const retryAfter = chatRateLimiter.getRetryAfterSeconds();
      setTimeout(() => setRateLimited(false), retryAfter * 1000);
      return;
    }

    setSending(true);
    try {
      chatRateLimiter.record();
      await sendChatMessage(tournamentId, authorName.trim(), text.trim());
      setText('');
    } catch {
      // silent fail
    }
    setSending(false);
  };

  const handleSaveName = () => {
    if (!authorName.trim()) return;
    localStorage.setItem('torq_chat_name', authorName.trim());
    setShowNameInput(false);
  };

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      {/* Name input (first time) */}
      {showNameInput && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('tournament.chat.namePrompt')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={authorName}
              onChange={e => setAuthorName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              maxLength={30}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14,
                background: 'var(--surface-var)', border: '1.5px solid var(--border)',
              }}
              placeholder="Jan"
              autoFocus
            />
            <button onClick={handleSaveName} style={{
              padding: '10px 16px', borderRadius: 10, background: 'var(--primary)',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }}>OK</button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6,
        minHeight: 0,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: 14 }}>
            💬 {t('tournament.chat.empty')}
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.authorName === authorName;
          const time = new Date(msg.createdAt);
          const timeStr = time.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', hour12: false });
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%', padding: '8px 12px', borderRadius: 14,
                background: isMe ? 'var(--primary)' : 'var(--surface)',
                color: isMe ? '#fff' : 'var(--text)',
                boxShadow: '0 1px 3px rgba(0,0,0,.08)',
              }}>
                {!isMe && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: isMe ? 'rgba(255,255,255,.7)' : 'var(--primary)', marginBottom: 2 }}>
                    {msg.authorName}
                  </div>
                )}
                <div style={{ fontSize: 14, lineHeight: 1.4, wordBreak: 'break-word' }}>{msg.text}</div>
                <div style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,.6)' : 'var(--text-muted)', textAlign: 'right', marginTop: 2 }}>
                  {timeStr}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!showNameInput && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setShowNameInput(true)}
            style={{
              width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
              color: 'var(--text-muted)', fontSize: 14, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title={authorName}
          >👤</button>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            maxLength={500}
            style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14,
              background: 'var(--surface)', border: '1.5px solid var(--border)',
            }}
            placeholder={t('tournament.chat.placeholder')}
          />
          <button
            onClick={handleSend}
            disabled={!text.trim() || sending || rateLimited}
            style={{
              padding: '10px 14px', borderRadius: 10, background: text.trim() && !rateLimited ? 'var(--primary)' : 'var(--surface-var)',
              color: text.trim() && !rateLimited ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: 14,
              flexShrink: 0, transition: 'background .15s',
            }}
          >{rateLimited ? '⏳' : '➤'}</button>
        </div>
      )}
    </div>
  );
}
