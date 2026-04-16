import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { useTheme } from '../lib/ThemePicker';

let socket = null;

const ROOMS = [
  {
    name: 'general',
    title: 'General lounge',
    description: 'Fast-moving team updates, shipping notes, and casual check-ins.',
    accent: '#22c55e',
    prompts: ['Morning sync in 3 bullets', 'What is blocked?', 'Ship it today'],
  },
  {
    name: 'dev',
    title: 'Build room',
    description: 'Debugging, implementation details, and release coordination.',
    accent: '#38bdf8',
    prompts: ['Post logs here', 'Share reproduction steps', 'What changed in this build?'],
  },
  {
    name: 'ideas',
    title: 'Ideas deck',
    description: 'Rough concepts, experiments, and product sparks worth testing.',
    accent: '#f59e0b',
    prompts: ['Pitch the idea in one line', 'What is the smallest experiment?', 'Who owns next step?'],
  },
];

const QUICK_TEMPLATES = ['On it', 'Need 10 minutes', 'Ship the diff', 'Can you clarify?', 'Looks good'];

function getUserColor(username, theme) {
  const colors = [theme.green, theme.blue, theme.orange, theme.purple, theme.cyan, theme.red];
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function ensureAvatar(message, theme) {
  return message.avatar || `linear-gradient(135deg, ${getUserColor(message.user || 'user', theme)}, ${theme.cardBorderHover})`;
}

function buildSmartReplies(text) {
  const replies = [];
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length > 18) {
    replies.push('Summarize that');
    replies.push('What is the next action?');
  }
  if (/bug|issue|error|fail/i.test(normalized)) {
    replies.push('Share the logs');
    replies.push('What changed recently?');
  }
  replies.push('Looks good');
  replies.push('Working on it');
  return replies.slice(0, 4);
}

function createStyles(theme) {
  return {
    page: {
      minHeight: '100vh',
      background: theme.pageBg,
      color: theme.textPrimary,
      fontFamily: theme.font,
      position: 'relative',
      overflow: 'hidden',
    },
    backgroundGlow: {
      position: 'absolute',
      inset: 0,
      background: `radial-gradient(circle at 10% 10%, ${theme.cyan}18, transparent 28%), radial-gradient(circle at 80% 0%, ${theme.orange}14, transparent 25%), radial-gradient(circle at 50% 100%, ${theme.purple}16, transparent 30%)`,
      pointerEvents: 'none',
    },
    shell: {
      position: 'relative',
      zIndex: 1,
      padding: '24px',
      display: 'grid',
      gap: '18px',
      minHeight: '100vh',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '14px',
      flexWrap: 'wrap',
      padding: '18px 20px',
      borderRadius: '22px',
      border: `1px solid ${theme.cardBorder}`,
      background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cardBorder}55)`,
      boxShadow: `0 18px 60px ${theme.shadow}`,
    },
    eyebrow: {
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: theme.textMuted,
      marginBottom: '8px',
    },
    title: {
      margin: 0,
      fontSize: '30px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    subtitle: {
      margin: '6px 0 0',
      color: theme.textSecondary,
      fontSize: '14px',
      maxWidth: '640px',
      lineHeight: 1.5,
    },
    headerControls: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
    },
    ghostButton: {
      background: theme.btnSecondaryBg,
      color: theme.btnSecondaryText,
      border: `1px solid ${theme.btnSecondaryBorder}`,
      borderRadius: '12px',
      padding: '10px 14px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 700,
    },
    layout: {
      display: 'grid',
      gridTemplateColumns: '280px minmax(0, 1fr) 280px',
      gap: '18px',
      alignItems: 'stretch',
      minHeight: 'calc(100vh - 168px)',
    },
    panel: {
      background: theme.panelBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '22px',
      boxShadow: `0 18px 60px ${theme.shadow}`,
      backdropFilter: 'blur(18px)',
    },
    sidePanel: {
      padding: '18px',
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
    },
    panelTitle: {
      margin: 0,
      fontSize: '12px',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: theme.textMuted,
      fontWeight: 800,
    },
    roomCard: {
      padding: '14px',
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      cursor: 'pointer',
      display: 'grid',
      gap: '6px',
    },
    roomTitle: {
      fontSize: '15px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    roomDesc: {
      fontSize: '12px',
      lineHeight: 1.5,
      color: theme.textSecondary,
    },
    onlineDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: theme.green,
      boxShadow: `0 0 14px ${theme.green}`,
      flexShrink: 0,
    },
    userRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '12px 14px',
      borderRadius: '14px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 700,
      color: theme.textPrimary,
    },
    chipRow: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
    },
    chip: {
      borderRadius: '999px',
      padding: '8px 12px',
      border: `1px solid ${theme.cardBorderHover}`,
      background: theme.btnSecondaryBg,
      color: theme.btnSecondaryText,
      fontSize: '12px',
      cursor: 'pointer',
      fontWeight: 700,
    },
    centerPanel: {
      display: 'grid',
      gridTemplateRows: 'auto minmax(0, 1fr) auto auto',
      minHeight: 0,
      overflow: 'hidden',
    },
    conversationHero: {
      padding: '20px 22px 14px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      display: 'grid',
      gap: '12px',
      background: `linear-gradient(135deg, ${theme.cardBg}, ${theme.cardBorder}45)`,
    },
    heroTop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '12px',
      flexWrap: 'wrap',
    },
    heroTitle: {
      margin: 0,
      fontSize: '24px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    heroMeta: {
      color: theme.textSecondary,
      fontSize: '13px',
      lineHeight: 1.6,
    },
    statusPill: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      borderRadius: '999px',
      padding: '8px 12px',
      background: `${theme.green}18`,
      border: `1px solid ${theme.green}66`,
      color: theme.green,
      fontWeight: 800,
      fontSize: '12px',
    },
    metricsRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '10px',
    },
    metricCard: {
      padding: '12px 14px',
      borderRadius: '16px',
      background: theme.inputBg,
      border: `1px solid ${theme.cardBorder}`,
    },
    metricLabel: {
      fontSize: '11px',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: '8px',
    },
    metricValue: {
      fontSize: '20px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    messages: {
      minHeight: 0,
      overflowY: 'auto',
      padding: '18px 22px',
      display: 'grid',
      gap: '14px',
      background: `linear-gradient(180deg, ${theme.panelDarkBg}, ${theme.cardBg})`,
    },
    emptyState: {
      minHeight: '320px',
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      padding: '20px',
      color: theme.textSecondary,
    },
    emptyCard: {
      maxWidth: '420px',
      padding: '28px',
      borderRadius: '22px',
      border: `1px dashed ${theme.cardBorderHover}`,
      background: `${theme.cardBg}aa`,
    },
    messageRow: {
      display: 'flex',
      gap: '12px',
      alignItems: 'flex-start',
      maxWidth: '100%',
    },
    avatar: {
      width: '40px',
      height: '40px',
      borderRadius: '14px',
      overflow: 'hidden',
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontSize: '14px',
      fontWeight: 800,
      border: `1px solid ${theme.cardBorder}`,
    },
    messageCard: {
      maxWidth: 'min(78%, 680px)',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      padding: '14px 16px',
      display: 'grid',
      gap: '8px',
      wordBreak: 'break-word',
      boxShadow: `0 10px 30px ${theme.shadow}`,
    },
    messageMeta: {
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexWrap: 'wrap',
      fontSize: '11px',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 800,
    },
    messageText: {
      fontSize: '14px',
      lineHeight: 1.65,
      color: theme.textPrimary,
      whiteSpace: 'pre-wrap',
    },
    gif: {
      width: 'min(260px, 100%)',
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      display: 'block',
    },
    typingBar: {
      padding: '0 22px 12px',
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 700,
    },
    replyRow: {
      padding: '0 22px 14px',
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      borderTop: `1px solid ${theme.cardBorder}`,
      paddingTop: '14px',
      background: theme.cardBg,
    },
    composerShell: {
      padding: '0 22px 22px',
      background: theme.cardBg,
      display: 'grid',
      gap: '12px',
    },
    composer: {
      display: 'grid',
      gap: '12px',
      padding: '16px',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.inputBg,
    },
    input: {
      width: '100%',
      borderRadius: '16px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.pageBgSolid,
      color: theme.textPrimary,
      padding: '14px 16px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
    },
    composerRow: {
      display: 'flex',
      gap: '10px',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
    },
    sendButton: {
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      color: '#fff',
      border: 'none',
      borderRadius: '14px',
      padding: '12px 18px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 800,
      letterSpacing: '0.04em',
      boxShadow: `0 12px 28px ${theme.shadow}`,
    },
    rightPanelStat: {
      padding: '14px',
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: '6px',
    },
    statLabel: {
      fontSize: '11px',
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 800,
    },
    statValue: {
      fontSize: '18px',
      color: theme.textHeading,
      fontWeight: 800,
    },
    gifGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
    },
    gifPreview: {
      width: '100%',
      height: '88px',
      objectFit: 'cover',
      borderRadius: '14px',
      border: `1px solid ${theme.cardBorder}`,
      cursor: 'pointer',
      display: 'block',
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
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [smartReplies, setSmartReplies] = useState([]);
  const [activeChat, setActiveChat] = useState({ type: 'group', name: 'general' });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const visibleMessages = useMemo(
    () => messages.filter((message) => message.chat?.name === activeChat.name && message.chat?.type === activeChat.type),
    [messages, activeChat],
  );

  const roomMeta = useMemo(() => {
    if (activeChat.type === 'dm') {
      return {
        title: `Direct with ${activeChat.name}`,
        description: 'Private lane for decisions, handoffs, and focused back-and-forth.',
        accent: theme.orange,
        prompts: ['Give me the short version', 'Need anything from me?', 'Send the final answer'],
      };
    }
    return ROOMS.find((room) => room.name === activeChat.name) || ROOMS[0];
  }, [activeChat, theme.orange]);

  const conversationStats = useMemo(() => {
    const gifs = visibleMessages.filter((message) => message.type === 'gif').length;
    const uniquePeople = new Set(visibleMessages.map((message) => message.user).filter(Boolean)).size;
    return {
      totalMessages: visibleMessages.length,
      gifDrops: gifs,
      participants: uniquePeople || (activeChat.type === 'dm' ? 2 : 1),
    };
  }, [visibleMessages, activeChat.type]);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }

    const userData = JSON.parse(storedUser);
    setUser(userData);

    const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const socketUrl = isLocalHost ? `http://${host}:3002` : undefined;
    const socketOptions = isLocalHost
      ? { transports: ['websocket', 'polling'] }
      : { path: '/chat-socket/socket.io', transports: ['websocket', 'polling'] };

    socket = io(socketUrl, socketOptions);

    socket.on('connect', () => {
      socket.emit('join', { username: userData.username });
    });

    socket.on('message', (data) => {
      setMessages((previous) => [...previous, data]);
      setSmartReplies(buildSmartReplies(data.text));
    });

    socket.on('online_users', (users) => {
      const cleaned = Array.from(new Set((users || []).filter(Boolean)));
      setOnlineUsers(cleaned);
    });

    socket.on('typing', (data) => {
      if (!data?.user) return;
      setTypingUsers((previous) => (previous.includes(data.user) ? previous : [...previous, data.user]));
      setTimeout(() => {
        setTypingUsers((previous) => previous.filter((item) => item !== data.user));
      }, 1500);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connect error', error);
    });

    return () => {
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

  useEffect(() => {
    if (!gifSearch.trim()) {
      setGifResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(gifSearch)}&key=LIVDSRZULELA&limit=6`);
        const data = await response.json();
        setGifResults(Array.isArray(data.results) ? data.results : []);
      } catch (error) {
        console.error('gif search failed', error);
        setGifResults([]);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [gifSearch]);

  const sendMessage = (type = 'text', gifUrl = '', overrideText = '') => {
    if (!socket || !user) return;

    const textToSend = overrideText !== '' ? overrideText : input;
    if (type === 'text' && !String(textToSend || '').trim()) return;

    socket.emit('message', {
      type,
      text: textToSend,
      gif: gifUrl,
      user: user.username,
      avatar: user.avatar || null,
      chat: activeChat,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    if (overrideText === '') {
      setInput('');
    }
  };

  const handleTyping = () => {
    if (!socket || !user) return;
    socket.emit('typing', { user: user.username, chat: activeChat });
  };

  if (!user) {
    return <div style={styles.page} />;
  }

  return (
    <div style={styles.page}>
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        .chat-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
        .chat-scroll::-webkit-scrollbar-thumb { background: ${theme.cardBorderHover}; border-radius: 999px; }
        .chat-scroll::-webkit-scrollbar-track { background: transparent; }
        @keyframes chatFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .chat-accent-card { animation: chatFloat 7s ease-in-out infinite; }
        @media (max-width: 1180px) {
          .chat-layout { grid-template-columns: 240px minmax(0, 1fr); }
          .chat-right-rail { grid-column: 1 / -1; }
        }
        @media (max-width: 820px) {
          .chat-page-shell { padding: 14px !important; }
          .chat-header { padding: 16px !important; }
          .chat-layout { grid-template-columns: 1fr; min-height: auto; }
          .chat-left-rail, .chat-right-rail { order: 2; }
          .chat-center { order: 1; min-height: 70vh; }
          .chat-metrics { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .chat-page-shell { padding: 10px !important; }
          .chat-header { padding: 14px !important; }
          .chat-message-row { gap: 8px !important; }
          .chat-message-card { max-width: calc(100% - 52px) !important; padding: 12px !important; }
          .chat-composer { padding: 12px !important; }
          .chat-composer-row { flex-direction: column !important; align-items: stretch !important; }
        }
        @media (max-width: 400px) {
          .chat-message-card { max-width: 100% !important; }
        }
      `}</style>
      <div style={styles.backgroundGlow} />

      <div style={styles.shell} className="chat-page-shell">
        <div style={styles.header} className="chat-header">
          <div>
            <div style={styles.eyebrow}>Cosmix realtime</div>
            <h1 style={styles.title}>Conversation deck</h1>
            <p style={styles.subtitle}>Theme-aware chat with stronger room identity, faster reply actions, and a cleaner message flow.</p>
          </div>
          <div style={styles.headerControls}>
            <button onClick={() => router.push('/dashboard')} style={styles.ghostButton}>Back to dashboard</button>
          </div>
        </div>

        <div style={styles.layout} className="chat-layout">
          <aside style={{ ...styles.panel, ...styles.sidePanel }} className="chat-left-rail">
            <div>
              <h3 style={styles.panelTitle}>Rooms</h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                {ROOMS.map((room) => {
                  const active = activeChat.type === 'group' && activeChat.name === room.name;
                  return (
                    <button
                      key={room.name}
                      type="button"
                      onClick={() => setActiveChat({ type: 'group', name: room.name })}
                      style={{
                        ...styles.roomCard,
                        borderColor: active ? room.accent : theme.cardBorder,
                        boxShadow: active ? `0 0 0 1px ${room.accent}` : 'none',
                      }}
                    >
                      <div style={{ ...styles.roomTitle, color: active ? room.accent : theme.textHeading }}>{room.title}</div>
                      <div style={styles.roomDesc}>{room.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={styles.panelTitle}>Direct line</h3>
              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                {onlineUsers.filter((name) => name !== user.username).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setActiveChat({ type: 'dm', name })}
                    style={{
                      ...styles.userRow,
                      borderColor: activeChat.type === 'dm' && activeChat.name === name ? theme.orange : theme.cardBorder,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={styles.onlineDot} />
                      @{name}
                    </span>
                    <span style={{ color: theme.textMuted, fontSize: '11px' }}>live</span>
                  </button>
                ))}
                {onlineUsers.filter((name) => name !== user.username).length === 0 && (
                  <div style={{ ...styles.roomDesc, marginTop: '4px' }}>No other live users yet.</div>
                )}
              </div>
            </div>

            <div>
              <h3 style={styles.panelTitle}>Prompt sparks</h3>
              <div style={{ ...styles.chipRow, marginTop: '12px' }}>
                {roomMeta.prompts.map((prompt) => (
                  <button key={prompt} type="button" style={styles.chip} onClick={() => setInput(prompt)}>{prompt}</button>
                ))}
              </div>
            </div>
          </aside>

          <section style={{ ...styles.panel, ...styles.centerPanel }} className="chat-center">
            <div style={styles.conversationHero}>
              <div style={styles.heroTop}>
                <div>
                  <h2 style={styles.heroTitle}>{roomMeta.title}</h2>
                  <div style={styles.heroMeta}>{roomMeta.description}</div>
                </div>
                <div style={styles.statusPill}>
                  <span style={styles.onlineDot} />
                  Live now
                </div>
              </div>

              <div style={styles.metricsRow} className="chat-metrics">
                <div style={styles.metricCard} className="chat-accent-card">
                  <div style={styles.metricLabel}>Messages in view</div>
                  <div style={styles.metricValue}>{conversationStats.totalMessages}</div>
                </div>
                <div style={styles.metricCard} className="chat-accent-card">
                  <div style={styles.metricLabel}>Participants</div>
                  <div style={styles.metricValue}>{conversationStats.participants}</div>
                </div>
                <div style={styles.metricCard} className="chat-accent-card">
                  <div style={styles.metricLabel}>GIF drops</div>
                  <div style={styles.metricValue}>{conversationStats.gifDrops}</div>
                </div>
              </div>
            </div>

            <div style={styles.messages} className="chat-scroll">
              {visibleMessages.length === 0 ? (
                <div style={styles.emptyState}>
                  <div style={styles.emptyCard}>
                    <div style={{ ...styles.panelTitle, marginBottom: '10px' }}>Start the thread</div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: theme.textHeading, marginBottom: '10px' }}>{roomMeta.title}</div>
                    <div style={{ lineHeight: 1.7 }}>{roomMeta.description} Drop a short opener, use a room prompt, or send a GIF to set the tone.</div>
                  </div>
                </div>
              ) : (
                visibleMessages.map((message, index) => {
                  const mine = message.user === user.username;
                  const accent = getUserColor(message.user || 'user', theme);
                  return (
                    <div
                      className="chat-message-row"
                      key={`${message.user || 'user'}-${message.timestamp || index}-${index}`}
                      style={{
                        ...styles.messageRow,
                        justifyContent: mine ? 'flex-end' : 'flex-start',
                        flexDirection: mine ? 'row-reverse' : 'row',
                      }}
                    >
                      <div
                        style={{
                          ...styles.avatar,
                          background: ensureAvatar(message, theme).startsWith('linear-gradient') ? ensureAvatar(message, theme) : undefined,
                        }}
                      >
                        {message.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={message.avatar} alt={`${message.user || 'user'} avatar`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span>{String(message.user || '?').slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>

                      <div
                        className="chat-message-card"
                        style={{
                          ...styles.messageCard,
                          background: mine ? `${accent}18` : theme.cardBg,
                          borderColor: mine ? `${accent}77` : theme.cardBorder,
                        }}
                      >
                        <div style={{ ...styles.messageMeta, color: mine ? accent : theme.textMuted }}>
                          <span>{message.user}</span>
                          <span>{message.timestamp || ''}</span>
                          <span>{message.type === 'gif' ? 'gif' : activeChat.type}</span>
                        </div>
                        {message.type === 'gif' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={message.gif} alt="shared gif" style={styles.gif} />
                        ) : (
                          <div style={styles.messageText}>{message.text}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {typingUsers.length > 0 && (
              <div style={styles.typingBar}>{typingUsers.join(', ')} typing...</div>
            )}

            {smartReplies.length > 0 && (
              <div style={styles.replyRow}>
                {smartReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    style={styles.chip}
                    onClick={() => {
                      const last = visibleMessages[visibleMessages.length - 1];
                      if (reply === 'Summarize that' && last?.text) {
                        sendMessage('text', '', `/summarize ${last.text}`);
                        return;
                      }
                      if (reply === 'What is the next action?' && last?.text) {
                        sendMessage('text', '', `/next-step ${last.text}`);
                        return;
                      }
                      sendMessage('text', '', reply);
                    }}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}

            <div style={styles.composerShell}>
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
                  placeholder={`Message ${activeChat.type === 'group' ? `#${activeChat.name}` : `@${activeChat.name}`}`}
                  style={styles.input}
                />

                <div style={styles.composerRow} className="chat-composer-row">
                  <div style={styles.chipRow}>
                    {QUICK_TEMPLATES.map((template) => (
                      <button key={template} type="button" style={styles.chip} onClick={() => sendMessage('text', '', template)}>{template}</button>
                    ))}
                  </div>
                  <button type="button" style={styles.sendButton} onClick={() => sendMessage()}>Send message</button>
                </div>
              </div>
            </div>
          </section>

          <aside style={{ ...styles.panel, ...styles.sidePanel }} className="chat-right-rail">
            <div>
              <h3 style={styles.panelTitle}>Active room</h3>
              <div style={{ ...styles.rightPanelStat, marginTop: '12px' }}>
                <div style={styles.statLabel}>Current lane</div>
                <div style={{ ...styles.statValue, color: roomMeta.accent }}>{activeChat.type === 'group' ? `#${activeChat.name}` : `@${activeChat.name}`}</div>
              </div>
              <div style={{ ...styles.rightPanelStat, marginTop: '10px' }}>
                <div style={styles.statLabel}>Online now</div>
                <div style={styles.statValue}>{onlineUsers.length || 1}</div>
              </div>
            </div>

            <div>
              <h3 style={styles.panelTitle}>Fast actions</h3>
              <div style={{ ...styles.chipRow, marginTop: '12px' }}>
                <button type="button" style={styles.chip} onClick={() => sendMessage('text', '', '@ai Draft a reply')}>AI suggest</button>
                <button type="button" style={styles.chip} onClick={() => sendMessage('text', '', 'Recap the thread so far')}>Recap</button>
                <button type="button" style={styles.chip} onClick={() => sendMessage('text', '', 'Who owns the next step?')}>Ownership</button>
              </div>
            </div>

            <div>
              <h3 style={styles.panelTitle}>GIF drawer</h3>
              <div style={{ display: 'grid', gap: '10px', marginTop: '12px' }}>
                <input
                  value={gifSearch}
                  onChange={(event) => setGifSearch(event.target.value)}
                  placeholder="Search a reaction GIF"
                  style={styles.input}
                />
                {gifResults.length > 0 ? (
                  <div style={styles.gifGrid}>
                    {gifResults.map((gif, index) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${gif.id || 'gif'}-${index}`}
                        src={gif.media[0].tinygif.url}
                        alt="gif preview"
                        style={styles.gifPreview}
                        onClick={() => {
                          sendMessage('gif', gif.media[0].gif.url);
                          setGifSearch('');
                          setGifResults([]);
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={styles.roomDesc}>Search for a quick reaction and drop it straight into the thread.</div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}