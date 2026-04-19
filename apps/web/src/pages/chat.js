import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { readKnownChatContacts, rememberChatContacts } from '../lib/chatPresence';

let socket = null;

const GENERAL_CHAT = { type: 'group', name: 'general' };

function getUserColor(username, theme) {
  const colors = [theme.green, theme.blue, theme.orange, theme.purple, theme.cyan, theme.red];
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function resolveDmPartner(message, currentUsername) {
  if (message?.chat?.type !== 'dm') return message?.chat?.name || '';
  return message.user === currentUsername ? message.chat?.name : message.user;
}

function messageMatchesChat(message, activeChat, currentUsername) {
  if (activeChat.type === 'group') {
    return message.chat?.type === 'group' && message.chat?.name === activeChat.name;
  }
  return message.chat?.type === 'dm' && resolveDmPartner(message, currentUsername) === activeChat.name;
}

function createStyles(theme) {
  return {
    page: {
      minHeight: '100vh',
      background: theme.pageBg,
      color: theme.textPrimary,
      fontFamily: theme.font,
      padding: '24px',
    },
    shell: {
      maxWidth: '1280px',
      margin: '0 auto',
      display: 'grid',
      gap: '14px',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      flexWrap: 'wrap',
      borderRadius: '22px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      padding: '16px 18px',
      boxShadow: `0 20px 56px ${theme.shadow}`,
    },
    eyebrow: {
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      fontWeight: 800,
      color: theme.textMuted,
      marginBottom: '8px',
    },
    title: {
      margin: 0,
      fontSize: '28px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    subtitle: {
      margin: '8px 0 0',
      maxWidth: '520px',
      color: theme.textSecondary,
      lineHeight: 1.6,
      fontSize: '14px',
    },
    ghostButton: {
      borderRadius: '14px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.btnSecondaryBg,
      color: theme.btnSecondaryText,
      padding: '12px 16px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 700,
    },
    layout: {
      display: 'grid',
      gridTemplateColumns: '280px minmax(0, 1fr)',
      gap: '14px',
      minHeight: 'calc(100vh - 160px)',
    },
    panel: {
      borderRadius: '24px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      boxShadow: `0 20px 56px ${theme.shadow}`,
    },
    sidebar: {
      padding: '16px',
      display: 'grid',
      gap: '14px',
      alignContent: 'start',
    },
    sidebarGroup: {
      display: 'grid',
      gap: '10px',
    },
    sectionTitle: {
      margin: 0,
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      fontWeight: 800,
      color: theme.textMuted,
    },
    laneButton: {
      width: '100%',
      textAlign: 'left',
      padding: '14px 15px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      cursor: 'pointer',
      color: theme.textPrimary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
    },
    laneTitle: {
      fontSize: '15px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    compactMeta: {
      fontSize: '11px',
      color: theme.textMuted,
      fontWeight: 700,
    },
    onlineDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: theme.green,
      boxShadow: `0 0 12px ${theme.green}`,
      flexShrink: 0,
    },
    contactButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      padding: '12px 14px',
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textPrimary,
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 700,
    },
    main: {
      display: 'grid',
      gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
      minHeight: 0,
      overflow: 'hidden',
    },
    topBar: {
      padding: '16px 18px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      justifyContent: 'space-between',
      gap: '12px',
      flexWrap: 'wrap',
      alignItems: 'center',
      background: `linear-gradient(180deg, ${theme.panelBg}, ${theme.cardBg})`,
    },
    threadIdentity: {
      display: 'grid',
      gap: '4px',
    },
    threadName: {
      fontSize: '22px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    threadMeta: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 700,
    },
    mobileConversations: {
      display: 'none',
      gap: '10px',
      padding: '12px 18px 0',
      overflowX: 'auto',
      borderBottom: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
    },
    mobileConversationButton: {
      borderRadius: '999px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textPrimary,
      padding: '10px 14px',
      fontSize: '13px',
      fontWeight: 700,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
    },
    messages: {
      minHeight: 0,
      overflowY: 'auto',
      padding: '16px 18px',
      display: 'grid',
      gap: '12px',
      background: `linear-gradient(180deg, ${theme.panelDarkBg}, ${theme.cardBg})`,
    },
    empty: {
      minHeight: '320px',
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      color: theme.textSecondary,
      lineHeight: 1.7,
      padding: '20px',
    },
    messageRow: {
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-start',
      maxWidth: '100%',
    },
    avatar: {
      width: '40px',
      height: '40px',
      borderRadius: '14px',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontSize: '14px',
      fontWeight: 800,
      border: `1px solid ${theme.cardBorder}`,
      overflow: 'hidden',
      flexShrink: 0,
    },
    messageCard: {
      maxWidth: 'min(78%, 720px)',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      padding: '12px 14px',
      display: 'grid',
      gap: '6px',
      wordBreak: 'break-word',
      boxShadow: `0 12px 32px ${theme.shadow}`,
    },
    messageMeta: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 800,
      color: theme.textMuted,
    },
    messageText: {
      fontSize: '15px',
      lineHeight: 1.55,
      color: theme.textPrimary,
      whiteSpace: 'pre-wrap',
    },
    typingBar: {
      padding: '0 18px 10px',
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 700,
    },
    composer: {
      padding: '14px 18px 18px',
      borderTop: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-end',
    },
    input: {
      width: '100%',
      borderRadius: '22px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '14px 16px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
      flex: 1,
    },
    sendButton: {
      border: 'none',
      borderRadius: '18px',
      padding: '14px 18px',
      cursor: 'pointer',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.orange})`,
      color: '#fff',
      fontSize: '13px',
      fontWeight: 800,
      boxShadow: `0 14px 28px ${theme.shadow}`,
    },
  };
}

export default function Chat() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [activeChat, setActiveChat] = useState(GENERAL_CHAT);
  const [connectionState, setConnectionState] = useState('connecting');

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const visibleMessages = useMemo(
    () => messages.filter((message) => messageMatchesChat(message, activeChat, user?.username)),
    [messages, activeChat, user?.username],
  );

  const laneLabel = activeChat.type === 'dm' ? `@${activeChat.name}` : '#general';

  useEffect(() => {
    let active = true;

    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!active || !sessionUser) return;

      setContacts(readKnownChatContacts(sessionUser.id));

      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      const isLocalHost = host === 'localhost' || host === '127.0.0.1';
      const socketUrl = isLocalHost ? `http://${host}:3002` : undefined;
      const socketOptions = isLocalHost
        ? { transports: ['websocket', 'polling'] }
        : { path: '/chat-socket/socket.io', transports: ['websocket', 'polling'] };

      socket = io(socketUrl, socketOptions);

      socket.on('connect', () => {
        setConnectionState('connected');
        socket.emit('join', { username: sessionUser.username });
      });

      socket.on('disconnect', () => {
        setConnectionState('offline');
      });

      socket.on('message', (data) => {
        setMessages((previous) => [...previous, data]);
        const partner = data.chat?.type === 'dm'
          ? resolveDmPartner(data, sessionUser.username)
          : null;
        const nextContacts = rememberChatContacts(
          sessionUser.id,
          [data.user, partner],
          sessionUser.username,
        );
        setContacts(nextContacts);
      });

      socket.on('online_users', (users) => {
        const cleaned = Array.from(new Set((users || []).filter(Boolean)));
        setOnlineUsers(cleaned);
        const nextContacts = rememberChatContacts(sessionUser.id, cleaned, sessionUser.username);
        setContacts(nextContacts);
      });

      socket.on('typing', (data) => {
        if (!data?.user || data.user === sessionUser.username) return;
        setTypingUsers((previous) => (previous.includes(data.user) ? previous : [...previous, data.user]));
        setTimeout(() => {
          setTypingUsers((previous) => previous.filter((name) => name !== data.user));
        }, 1500);
      });

      socket.on('connect_error', (error) => {
        console.error('Socket connect error', error);
        setConnectionState('offline');
      });
    });

    return () => {
      active = false;
      socket?.disconnect();
      socket = null;
    };
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeChat]);

  const sendMessage = () => {
    if (!socket || !user || !String(input || '').trim()) return;

    socket.emit('message', {
      type: 'text',
      text: input,
      user: user.username,
      avatar: user.avatar || null,
      chat: activeChat,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    if (activeChat.type === 'dm') {
      setContacts(rememberChatContacts(user.id, [activeChat.name], user.username));
    }

    setInput('');
  };

  const handleTyping = () => {
    if (!socket || !user) return;
    socket.emit('typing', { user: user.username, chat: activeChat });
  };

  const contactRows = useMemo(() => {
    if (!user) return [];
    const merged = Array.from(new Set([...contacts, ...onlineUsers])).filter((name) => name && name !== user.username);
    return merged.map((name) => ({ name, live: onlineUsers.includes(name) }));
  }, [contacts, onlineUsers, user]);

  if (!user) {
    return <div style={styles.page} />;
  }

  return (
    <div style={styles.page} className="chat-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 980px) {
          .chat-layout { grid-template-columns: 1fr !important; }
          .chat-sidebar { display: none !important; }
          .chat-mobile-conversations { display: flex !important; }
        }
        @media (max-width: 720px) {
          .chat-page { padding: 14px !important; }
          .chat-header { flex-direction: column !important; align-items: flex-start !important; }
          .chat-topbar { padding: 14px !important; }
          .chat-thread-name { font-size: 20px !important; }
          .chat-messages { padding: 14px !important; }
          .chat-message-card { max-width: 88% !important; }
          .chat-composer { padding: 12px 14px 14px !important; }
          .chat-send { width: 48px !important; padding-left: 0 !important; padding-right: 0 !important; }
          .chat-send-label { display: none !important; }
        }
      `}</style>

      <div style={styles.shell}>
        <header style={styles.header} className="chat-header">
          <div>
            <div style={styles.eyebrow}>Cosmix chat</div>
            <h1 style={styles.title}>Chat</h1>
            <p style={styles.subtitle}>A clean conversation view with direct messages and a simple general thread.</p>
          </div>
          <button type="button" onClick={() => router.push('/dashboard')} style={styles.ghostButton}>Back to dashboard</button>
        </header>

        <div style={styles.layout} className="chat-layout">
          <aside style={{ ...styles.panel, ...styles.sidebar }} className="chat-sidebar">
            <div style={styles.sidebarGroup}>
              <h2 style={styles.sectionTitle}>Conversations</h2>
              <button
                type="button"
                onClick={() => setActiveChat(GENERAL_CHAT)}
                style={{
                  ...styles.laneButton,
                  borderColor: activeChat.type === 'group' ? theme.blue : theme.cardBorder,
                  boxShadow: activeChat.type === 'group' ? `0 0 0 1px ${theme.blue}` : 'none',
                }}
              >
                <span style={styles.laneTitle}>General</span>
                <span style={styles.compactMeta}>{onlineUsers.length || 1} online</span>
              </button>
            </div>

            <div style={styles.sidebarGroup}>
              <h2 style={styles.sectionTitle}>People</h2>
              {contactRows.length === 0 ? (
                <div style={styles.compactMeta}>Direct chats appear here when someone messages you.</div>
              ) : contactRows.map((contact) => (
                <button
                  key={contact.name}
                  type="button"
                  onClick={() => setActiveChat({ type: 'dm', name: contact.name })}
                  style={{
                    ...styles.contactButton,
                    borderColor: activeChat.type === 'dm' && activeChat.name === contact.name ? theme.orange : theme.cardBorder,
                    boxShadow: activeChat.type === 'dm' && activeChat.name === contact.name ? `0 0 0 1px ${theme.orange}` : 'none',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {contact.live ? <span style={styles.onlineDot} /> : <span style={{ ...styles.onlineDot, background: theme.textMuted, boxShadow: 'none' }} />}
                    @{contact.name}
                  </span>
                  <span style={{ fontSize: '11px', color: contact.live ? theme.green : theme.textMuted }}>{contact.live ? 'live' : 'saved'}</span>
                </button>
              ))}
            </div>
          </aside>

          <section style={{ ...styles.panel, ...styles.main }}>
            <div style={styles.mobileConversations} className="chat-mobile-conversations">
              <button
                type="button"
                onClick={() => setActiveChat(GENERAL_CHAT)}
                style={{
                  ...styles.mobileConversationButton,
                  borderColor: activeChat.type === 'group' ? theme.blue : theme.cardBorder,
                  boxShadow: activeChat.type === 'group' ? `0 0 0 1px ${theme.blue}` : 'none',
                }}
              >
                <span>General</span>
              </button>
              {contactRows.map((contact) => (
                <button
                  key={contact.name}
                  type="button"
                  onClick={() => setActiveChat({ type: 'dm', name: contact.name })}
                  style={{
                    ...styles.mobileConversationButton,
                    borderColor: activeChat.type === 'dm' && activeChat.name === contact.name ? theme.orange : theme.cardBorder,
                    boxShadow: activeChat.type === 'dm' && activeChat.name === contact.name ? `0 0 0 1px ${theme.orange}` : 'none',
                  }}
                >
                  {contact.live ? <span style={styles.onlineDot} /> : null}
                  <span>@{contact.name}</span>
                </button>
              ))}
            </div>

            <div style={styles.topBar} className="chat-topbar">
              <div style={styles.threadIdentity}>
                <div style={styles.threadName} className="chat-thread-name">{activeChat.type === 'dm' ? `@${activeChat.name}` : 'General'}</div>
                <div style={styles.threadMeta}>
                  <span style={{ ...styles.onlineDot, background: connectionState === 'connected' ? theme.green : theme.red, boxShadow: connectionState === 'connected' ? `0 0 12px ${theme.green}` : 'none' }} />
                  <span>{connectionState === 'connected' ? 'Online' : 'Reconnecting'}</span>
                </div>
              </div>
              <div style={styles.compactMeta}>{visibleMessages.length} messages</div>
            </div>

            <div style={styles.messages} className="chat-messages">
              {visibleMessages.length === 0 ? (
                <div style={styles.empty}>No messages yet.</div>
              ) : visibleMessages.map((message, index) => {
                const mine = message.user === user.username;
                const accent = getUserColor(message.user || 'user', theme);
                return (
                  <div
                    key={`${message.user || 'user'}-${message.timestamp || index}-${index}`}
                    style={{
                      ...styles.messageRow,
                      justifyContent: mine ? 'flex-end' : 'flex-start',
                      flexDirection: mine ? 'row-reverse' : 'row',
                    }}
                  >
                    <div style={{ ...styles.avatar, background: message.avatar ? undefined : `linear-gradient(135deg, ${accent}, ${theme.cardBorderHover})` }}>
                      {message.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={message.avatar} alt={`${message.user || 'user'} avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <span>{String(message.user || '?').slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>

                    <div className="chat-message-card" style={{ ...styles.messageCard, background: mine ? `${accent}18` : theme.cardBg, borderColor: mine ? `${accent}77` : theme.cardBorder }}>
                      <div style={{ ...styles.messageMeta, color: mine ? accent : theme.textMuted }}>
                        <span>{message.user}</span>
                        <span>{message.timestamp || ''}</span>
                      </div>
                      <div style={styles.messageText}>{message.text}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {typingUsers.length > 0 ? <div style={styles.typingBar}>{typingUsers.join(', ')} typing...</div> : null}

            <div style={styles.composer} className="chat-composer">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  handleTyping();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Type a message"
                style={styles.input}
              />
              <button type="button" onClick={sendMessage} style={styles.sendButton} className="chat-send"><span className="chat-send-label">Send</span></button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}