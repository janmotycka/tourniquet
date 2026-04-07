import { useState, useEffect, useRef } from 'react';
import type { ChatMessage, Team } from '../../../types/tournament.types';
import { sendChatMessage, subscribeToChatMessages, deleteChatMessage, subscribeChatPolls } from '../../../services/tournament.firebase';
import type { ChatPoll } from '../../../services/tournament.firebase';
import { useI18n, getDateLocale } from '../../../i18n';
import { chatRateLimiter } from '../../../utils/rate-limiter';
import { FanPollBanner } from './FanPollBanner';
import { ChatPollCard } from './ChatPollCard';
import { CreatePollForm } from './CreatePollForm';

export function PublicChat({ tournamentId, teams, isAdmin }: {
  tournamentId: string;
  teams?: Team[];
  isAdmin?: boolean;
}) {
  const { t, locale } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [authorName, setAuthorName] = useState(() => {
    try { return localStorage.getItem('torq_chat_name') ?? ''; } catch { return ''; }
  });
  const [showNameInput, setShowNameInput] = useState(() => {
    try { return !localStorage.getItem('torq_chat_name'); } catch { return true; }
  });
  const [sending, setSending] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null);
  const [showCreatePoll, setShowCreatePoll] = useState(false);
  const [polls, setPolls] = useState<ChatPoll[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToChatMessages(tournamentId, setMessages);
    return unsub;
  }, [tournamentId]);

  useEffect(() => {
    const unsub = subscribeChatPolls(tournamentId, setPolls);
    return unsub;
  }, [tournamentId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Only auto-scroll if user is near bottom (within 120px)
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Scroll to bottom on first render — only if there are messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0]);

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
      // Force scroll to bottom after sending
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch {
      // silent fail
    }
    setSending(false);
  };

  const handleSaveName = () => {
    if (!authorName.trim()) return;
    try { localStorage.setItem('torq_chat_name', authorName.trim()); } catch { /* blocked */ }
    setShowNameInput(false);
  };

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await deleteChatMessage(tournamentId, msgId);
    } catch {
      // silent fail
    }
    setMenuMsgId(null);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      minHeight: 0, overflow: 'hidden',
    }}>
      {/* Scrollable area: polls + messages */}
      <div
        ref={scrollContainerRef}
        style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Fan poll */}
        {teams && teams.length > 1 && (
          <FanPollBanner tournamentId={tournamentId} teams={teams} isAdmin={isAdmin} />
        )}

        {/* Admin polls */}
        {polls.map(poll => (
          <ChatPollCard key={poll.id} tournamentId={tournamentId} poll={poll} isAdmin={isAdmin} />
        ))}

        {/* Create poll form (admin only) */}
        {showCreatePoll && (
          <CreatePollForm tournamentId={tournamentId} onClose={() => setShowCreatePoll(false)} />
        )}

        {/* Empty state */}
        {messages.length === 0 && polls.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: 14 }}>
            💬 {t('tournament.chat.empty')}
          </div>
        )}

        {/* Messages */}
        {messages.map(msg => {
          const isMe = msg.authorName === authorName;
          const time = new Date(msg.createdAt);
          const timeStr = time.toLocaleTimeString(getDateLocale(locale), { hour: '2-digit', minute: '2-digit', hour12: false });
          const showMenu = menuMsgId === msg.id;
          return (
            <div key={msg.id} style={{
              display: 'flex', flexDirection: 'column',
              alignItems: isMe ? 'flex-end' : 'flex-start',
              position: 'relative',
            }}>
              <div
                onClick={() => isAdmin && setMenuMsgId(showMenu ? null : msg.id)}
                style={{
                  maxWidth: '80%', padding: '8px 12px', borderRadius: 14,
                  background: isMe ? 'var(--primary)' : 'var(--surface)',
                  color: isMe ? '#fff' : 'var(--text)',
                  boxShadow: '0 1px 3px rgba(0,0,0,.08)',
                  cursor: isAdmin ? 'pointer' : 'default',
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
              {/* Admin context menu — delete */}
              {isAdmin && showMenu && (
                <button
                  onClick={() => handleDeleteMessage(msg.id)}
                  style={{
                    marginTop: 4, padding: '6px 12px', borderRadius: 8,
                    background: '#FFEBEE', color: '#C62828', fontSize: 12, fontWeight: 700,
                    border: '1px solid #FFCDD2', cursor: 'pointer',
                  }}
                >
                  🗑 {t('tournament.chat.deleteMsg')}
                </button>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Fixed input bar at bottom */}
      <div style={{
        flexShrink: 0, padding: '8px 16px 12px',
        borderTop: '1px solid var(--border)', background: 'var(--bg)',
      }}>
        {showNameInput ? (
          <div style={{
            background: 'var(--surface)', borderRadius: 14, padding: '14px',
            boxShadow: '0 -1px 4px rgba(0,0,0,.05)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>💬</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t('tournament.chat.joinTitle')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('tournament.chat.joinDesc')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={authorName}
                onChange={e => setAuthorName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                maxLength={30}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 16,
                  background: 'var(--surface-var)', border: '1.5px solid var(--border)',
                }}
                placeholder={t('tournament.chat.namePlaceholder')}
              />
              <button onClick={handleSaveName} disabled={!authorName.trim()} style={{
                padding: '10px 16px', borderRadius: 12,
                background: authorName.trim() ? 'var(--primary)' : 'var(--surface-var)',
                color: authorName.trim() ? '#fff' : 'var(--text-muted)',
                fontWeight: 700, fontSize: 14, transition: 'background .15s',
              }}>{t('tournament.chat.joinBtn')}</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowNameInput(true)}
              style={{
                width: 36, height: 36, borderRadius: 10, background: 'var(--surface-var)',
                color: 'var(--text-muted)', fontSize: 14, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title={authorName}
            >👤</button>
            {isAdmin && (
              <button
                onClick={() => setShowCreatePoll(!showCreatePoll)}
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: showCreatePoll ? 'var(--primary)' : 'var(--surface-var)',
                  color: showCreatePoll ? '#fff' : 'var(--text-muted)',
                  fontSize: 14, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title={t('tournament.chat.createPoll')}
              >📊</button>
            )}
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              maxLength={500}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 16,
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
    </div>
  );
}
