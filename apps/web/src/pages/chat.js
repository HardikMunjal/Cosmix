import { useRouter } from 'next/router';
import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

let socket = null;

/* 🎨 User Color */
const getUserColor = (username) => {
  const colors = [
    '#00ff9f', '#00e5ff', '#ff00ff', '#ffcc00',
    '#ff4d4d', '#7cff00', '#00ffd5', '#ff7a00'
  ];

  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
};

/* 🌌 Background */
function MatrixBackground() {
  return (
    <div style={{
      position: 'absolute',
      width: '100%',
      height: '100%',
      background: 'radial-gradient(circle at 20% 20%, rgba(0,255,159,0.08), transparent)',
      pointerEvents: 'none',
      zIndex: 0,
    }} />
  );
}

export default function Chat() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [gifSearch, setGifSearch] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [smartReplies, setSmartReplies] = useState([]);

  const [groups] = useState([{ name: 'general' }, { name: 'dev' }]);

  const [activeChat, setActiveChat] = useState({
    type: 'group',
    name: 'general',
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const quickTemplates = ['On it', 'Sounds good', 'Can you share more?', 'Nice!'];

  /* 🔌 SOCKET INIT */
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

    socket = socketUrl ? io(socketUrl, socketOptions) : io(socketOptions);

    socket.on('connect', () => {
      console.log('Connected to chat server', socket.id, 'at', socketUrl);
      socket.emit('join', { username: userData.username });
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error', err);
    });

    socket.on('message', (data) => {
      console.log('Incoming message', data);
      setMessages((prev) => [...prev, data]);

      // Generate quick smart replies based on incoming message
      try {
        const text = (data.text || '').toString();
        const replies = [];

        if (text.length > 8) {
          replies.push('Summarize');
          replies.push('Explain');
        }

        replies.push('Sounds good');
        replies.push('Haha 😂');
        replies.push('On it');

        setSmartReplies(replies);
      } catch (e) {
        setSmartReplies([]);
      }
    });

    socket.on('online_users', (users) => {
      setOnlineUsers(users);
    });

    socket.on('typing', (data) => {
      setTypingUsers((prev) => {
        if (!prev.includes(data.user)) return [...prev, data.user];
        return prev;
      });

      setTimeout(() => {
        setTypingUsers((prev) => prev.filter(u => u !== data.user));
      }, 1500);
    });

    return () => socket?.disconnect();
  }, [router]);

  /* 📜 SCROLL */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* 🎯 AUTO FOCUS */
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* 🔍 AUTO GIF SEARCH (Debounce) */
  useEffect(() => {
    if (!gifSearch.trim()) {
      setGifResults([]);
      return;
    }

    const delay = setTimeout(async () => {
      const res = await fetch(
        `https://g.tenor.com/v1/search?q=${gifSearch}&key=LIVDSRZULELA&limit=8`
      );
      const data = await res.json();
      setGifResults(data.results);
    }, 400);

    return () => clearTimeout(delay);
  }, [gifSearch]);

  /* 💬 SEND */
  const sendMessage = (type = 'text', gifUrl = '', overrideText = '') => {
    if (!socket || !user) return;

    const textToSend = overrideText !== '' ? overrideText : input;

    if (type === 'text' && !textToSend.trim()) return;

    socket.emit('message', {
      type,
      text: textToSend,
      gif: gifUrl,
      user: user.username,
      avatar: user.avatar || (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')).avatar : null),
      chat: activeChat,
      timestamp: new Date().toLocaleTimeString(),
    });

    // clear input only when we used the input field
    if (overrideText === '') setInput('');
  };

  /* 👤 DM */
  const startDM = (username) => {
    setActiveChat({ type: 'dm', name: username });
  };

  /* ⌨️ TYPING */
  const handleTyping = () => {
    socket.emit('typing', {
      user: user.username,
      chat: activeChat,
    });
  };

  if (!user) return <div style={styles.loading}>Initializing...</div>;

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow-x: hidden; }
        @media (max-width: 768px) {
          h2 { font-size: 14px !important; margin: 0 !important; }
          p { margin: 2px 0 !important; }
          button { padding: 6px 10px !important; font-size: 11px !important; }
        }
      `}</style>
      <div style={styles.container}>
      <MatrixBackground />

      {/* HEADER */}
      <div style={styles.header}>
        <h2>⚡ NINJA CHAT</h2>
        <button onClick={() => router.push('/dashboard')} style={styles.back}>
          ← Dashboard
        </button>
      </div>

      <div style={styles.main}>
        {/* SIDEBAR */}
        <div style={styles.sidebar}>
          <h3>⚡ Groups</h3>
          {groups.map((g, i) => (
            <div
              key={i}
              onClick={() => setActiveChat({ type: 'group', name: g.name })}
              style={styles.sidebarItem}
            >
              #{g.name}
            </div>
          ))}

          <h3>👤 Direct</h3>
          {onlineUsers.map((u, i) => (
            <div key={i} onClick={() => startDM(u)} style={styles.userItem}>
              <span style={styles.pulse}></span> @{u}
            </div>
          ))}
        </div>

        {/* CHAT */}
        <div style={styles.chatArea}>
          <div style={styles.chatHeader}>
            {activeChat.type === 'group'
              ? `#${activeChat.name}`
              : `@${activeChat.name}`}
          </div>

          {/* MESSAGES */}
          <div style={styles.messages}>
            {messages
              .filter(
                (msg) =>
                  msg.chat?.name === activeChat.name &&
                  msg.chat?.type === activeChat.type
              )
              .map((msg, i) => {
                const isMe = msg.user === user.username;
                const userColor = getUserColor(msg.user);

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: isMe ? 'row-reverse' : 'row',
                      alignSelf: isMe ? 'flex-end' : 'flex-start',
                      gap: 6,
                      alignItems: 'flex-start',
                    }}
                  >
                    {/* avatar */}
                    <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', border: `1px solid ${userColor}`, flexShrink: 0 }}>
                      {msg.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={msg.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ background: userColor, width: '100%', height: '100%' }} />
                      )}
                    </div>

                    <div
                      style={{
                        ...styles.message,
                        border: `1px solid ${userColor}`,
                        boxShadow: `0 0 10px ${userColor}`,
                        background: isMe ? `${userColor}22` : 'rgba(255,255,255,0.05)',
                        maxWidth: '70%',
                      }}
                    >
                      <div style={{ ...styles.meta, color: userColor }}>
                        {msg.user} • {msg.timestamp}
                      </div>

                      {msg.type === 'gif' ? (
                        <img src={msg.gif} style={styles.gif} />
                      ) : (
                        <div>{msg.text}</div>
                      )}
                    </div>
                  </div>
                );
              })}

            <div ref={messagesEndRef} />
          </div>

          {/* SMART REPLIES */}
          {smartReplies.length > 0 && (
            <div style={{ padding: '6px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap', overflowX: 'auto' }}>
              {smartReplies.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    // handle special suggestions
                    const last = messages
                      .filter(m => m.chat?.name === activeChat.name && m.chat?.type === activeChat.type)
                      .slice(-1)[0];

                    const lastText = last?.text || '';

                    if (s === 'Summarize') {
                      sendMessage('text', '', `/summarize ${lastText}`);
                    } else if (s === 'Explain') {
                      sendMessage('text', '', `/explain ${lastText}`);
                    } else {
                      // default: insert and send as plain reply
                      sendMessage('text', '', s);
                    }
                  }}
                  style={{ ...styles.send, padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* QUICK TEMPLATES */}
          <div style={{ padding: '6px 8px', display: 'flex', gap: '6px', flexWrap: 'wrap', overflowX: 'auto' }}>
            {quickTemplates.map((t, i) => (
              <button
                key={i}
                onClick={() => {
                  // short template: set input and send
                  setInput(t);
                  setTimeout(() => sendMessage('text'), 50);
                }}
                style={{ ...styles.send, padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}
              >
                {t}
              </button>
            ))}
            <button
              onClick={() => {
                // Ask AI for a suggestion about the last message
                const last = messages
                  .filter(m => m.chat?.name === activeChat.name && m.chat?.type === activeChat.type)
                  .slice(-1)[0];

                const lastText = last?.text || '';
                if (lastText) sendMessage('text', '', `@ai Suggest a reply for: ${lastText}`);
              }}
              style={{ ...styles.send, padding: '5px 8px', fontSize: '10px', whiteSpace: 'nowrap' }}
            >
              AI Suggest
            </button>
          </div>
          {/* TYPING */}
          {typingUsers.length > 0 && (
            <div style={styles.typing}>
              {typingUsers.join(', ')} typing...
            </div>
          )}

          {/* INPUT */}
          <div style={styles.inputBar}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type message..."
              style={styles.input}
            />
            <button onClick={() => sendMessage()} style={styles.send}>
              SEND
            </button>
          </div>

          {/* GIF SEARCH */}
          <div style={styles.gifBar}>
            <input
              value={gifSearch}
              onChange={(e) => setGifSearch(e.target.value)}
              placeholder="Search funny GIF..."
              style={styles.input}
            />
          </div>

          {/* GIF RESULTS */}
          {gifResults.length > 0 && (
            <div style={styles.gifResults}>
              {gifResults.map((g, i) => (
                <img
                  key={i}
                  src={g.media[0].tinygif.url}
                  style={styles.gifPreview}
                  onClick={() => {
                    sendMessage('gif', g.media[0].gif.url);
                    setGifResults([]);
                    setGifSearch('');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </>
  );
}

/* 🎨 STYLES */
const styles = {
  container: {
    background: '#000',
    color: '#00ff9f',
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Fira Code', monospace",
    position: 'relative',
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },

  loading: {
    height: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    padding: '10px',
    borderBottom: '1px solid rgba(0,255,159,0.2)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },

  back: {
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    padding: '6px 10px',
    cursor: 'pointer',
    fontSize: '12px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },

  main: {
    display: 'flex',
    flex: 1,
    zIndex: 1,
    width: '100%',
    overflowX: 'hidden',
  },

  sidebar: {
    display: 'none',
    width: '200px',
    borderRight: '1px solid rgba(0,255,159,0.2)',
    padding: '10px',
    background: 'rgba(0,0,0,0.7)',
    overflowY: 'auto',
    fontSize: '12px',
    '@media (min-width: 900px)': {
      display: 'block',
    },
  },

  sidebarItem: {
    padding: '8px',
    marginBottom: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    borderRadius: '4px',
    transition: '0.2s',
  },

  userItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '6px',
    cursor: 'pointer',
    fontSize: '11px',
  },

  pulse: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#00ff9f',
    boxShadow: '0 0 8px #00ff9f',
    flexShrink: 0,
  },

  chatArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    overflowX: 'hidden',
  },

  chatHeader: {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(0,255,159,0.2)',
    fontSize: '13px',
  },

  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    boxSizing: 'border-box',
  },

  message: {
    padding: '10px',
    borderRadius: '8px',
    maxWidth: '85%',
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
  },

  meta: {
    fontSize: '9px',
    marginBottom: '3px',
  },

  gif: {
    maxWidth: '120px',
    borderRadius: '6px',
    maxHeight: '150px',
  },

  typing: {
    fontSize: '11px',
    color: '#00ff9f99',
    padding: '3px 8px',
  },

  inputBar: {
    display: 'flex',
    gap: '6px',
    padding: '8px',
    width: '100%',
    boxSizing: 'border-box',
  },

  gifBar: {
    padding: '8px',
  },

  gifResults: {
    display: 'flex',
    gap: '6px',
    overflowX: 'auto',
    padding: '8px',
  },

  gifPreview: {
    width: '70px',
    height: '70px',
    borderRadius: '4px',
    cursor: 'pointer',
    border: '1px solid #00ff9f',
    flexShrink: 0,
    objectFit: 'cover',
  },

  input: {
    flex: 1,
    padding: '8px',
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    fontSize: '12px',
    fontFamily: 'monospace',
    minWidth: '0',
  },

  send: {
    background: 'black',
    border: '1px solid #00ff9f',
    color: '#00ff9f',
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: '11px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
};