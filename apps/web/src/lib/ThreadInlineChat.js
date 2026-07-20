import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeChatMessages, resolveChatSocketClient } from './chatSocket';

function getUserColor(name, theme) {
  const palette = [theme?.cyan, theme?.orange, theme?.purple, theme?.green, theme?.blue, '#f472b6'].filter(Boolean);
  const hash = String(name || 'user').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[hash % palette.length] || '#38bdf8';
}

export default function ThreadInlineChat({ groupId, groupName, username, theme }) {
  const [messages, setMessages] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const socketRef = useRef(null);
  const endRef = useRef(null);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message?.chat?.type === 'group' && message?.chat?.id === groupId),
    [messages, groupId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length]);

  useEffect(() => {
    if (!username || !groupId) return undefined;

    let active = true;
    let chatSocket = null;

    (async () => {
      const { default: io } = await import('socket.io-client');
      if (!active) return;
      const { url: socketUrl, options: socketOptions } = resolveChatSocketClient();
      chatSocket = io(socketUrl, socketOptions);
      socketRef.current = chatSocket;

      chatSocket.on('connect', () => {
        if (!active) return;
        setConnectionState('connected');
        chatSocket.emit('join', { username, userId: null, avatar: null });
      });

      chatSocket.on('disconnect', () => {
        if (!active) return;
        setConnectionState('offline');
      });

      chatSocket.on('history', (payload) => {
        setMessages((previous) => mergeChatMessages(previous, payload?.messages || []));
      });

      chatSocket.on('message', (payload) => {
        setMessages((previous) => mergeChatMessages(previous, [payload]));
      });
    })();

    return () => {
      active = false;
      if (chatSocket) chatSocket.disconnect();
      socketRef.current = null;
    };
  }, [username, groupId]);

  function handleSend(event) {
    event.preventDefault();
    const chatSocket = socketRef.current;
    const text = composerText.trim();
    if (!chatSocket?.connected || !text) return;
    chatSocket.emit('message', {
      type: 'text',
      text,
      chat: { type: 'group', id: groupId, name: groupName },
      timestamp: Date.now(),
    });
    setComposerText('');
  }

  return (
    <div className="thread-inline-chat">
      <style>{`
        .thread-inline-chat {
          display: grid;
          gap: 10px;
          border-radius: 18px;
          border: 1px solid rgba(56,189,248,0.18);
          background: rgba(2,6,23,0.35);
          overflow: hidden;
        }
        .thread-inline-chat-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(148,163,184,0.16);
        }
        .thread-inline-chat-status {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
        }
        .thread-inline-chat-feed {
          min-height: 220px;
          max-height: 340px;
          overflow-y: auto;
          padding: 12px 14px;
          display: grid;
          gap: 10px;
        }
        .thread-inline-chat-row {
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .thread-inline-chat-row.is-own {
          justify-content: flex-end;
        }
        .thread-inline-chat-bubble {
          max-width: min(78%, 520px);
          border-radius: 14px;
          padding: 9px 12px;
          font-size: 13px;
          line-height: 1.45;
        }
        .thread-inline-chat-bubble.is-own {
          background: linear-gradient(135deg, rgba(56,189,248,0.24), rgba(129,140,248,0.28));
          color: #f8fafc;
        }
        .thread-inline-chat-bubble.is-other {
          background: rgba(15,23,42,0.72);
          border: 1px solid rgba(148,163,184,0.18);
          color: #e2e8f0;
        }
        .thread-inline-chat-meta {
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          margin-bottom: 4px;
        }
        .thread-inline-chat-form {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          padding: 12px 14px;
          border-top: 1px solid rgba(148,163,184,0.16);
        }
        .thread-inline-chat-input {
          border: 1px solid rgba(148,163,184,0.24);
          background: rgba(2,6,23,0.55);
          color: #f8fafc;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-family: inherit;
        }
        .thread-inline-chat-send {
          border: none;
          border-radius: 12px;
          padding: 0 14px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          background: linear-gradient(135deg, #38bdf8, #818cf8);
          color: #fff;
        }
      `}</style>

      <div className="thread-inline-chat-head">
        <div style={{ fontSize: 14, fontWeight: 800, color: theme?.textHeading || '#f8fafc' }}>Conversation</div>
        <div className="thread-inline-chat-status">{connectionState === 'connected' ? 'Live' : 'Connecting…'}</div>
      </div>

      <div className="thread-inline-chat-feed">
        {!visibleMessages.length ? (
          <div style={{ fontSize: 13, color: theme?.textMuted || '#94a3b8', textAlign: 'center', padding: '24px 12px' }}>
            No messages yet. Say hello to the thread.
          </div>
        ) : visibleMessages.map((message) => {
          const isOwn = message.user === username;
          return (
            <div key={message.id || `${message.user}-${message.timestamp}`} className={`thread-inline-chat-row${isOwn ? ' is-own' : ''}`}>
              <div className={`thread-inline-chat-bubble${isOwn ? ' is-own' : ' is-other'}`}>
                {!isOwn ? (
                  <div className="thread-inline-chat-meta" style={{ color: getUserColor(message.user, theme) }}>
                    {message.user}
                  </div>
                ) : null}
                <div>{message.text || message.gif || ''}</div>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="thread-inline-chat-form" onSubmit={handleSend}>
        <input
          className="thread-inline-chat-input"
          value={composerText}
          onChange={(event) => setComposerText(event.target.value)}
          placeholder="Message this thread…"
        />
        <button type="submit" className="thread-inline-chat-send">Send</button>
      </form>
    </div>
  );
}
