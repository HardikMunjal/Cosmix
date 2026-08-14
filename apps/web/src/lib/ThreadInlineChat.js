import { useEffect, useMemo, useRef, useState } from 'react';
import { mergeChatMessages, resolveChatSocketClient } from './chatSocket';
import { resolveAvatarPresentation } from './avatarProfile';
import { searchGifs, suggestGifQueries } from './gifCatalog';
import { subscribeToWebPush } from './webPush';

const USER_PALETTE = [
  '#7dd3fc', '#fdba74', '#c4b5fd', '#86efac', '#f9a8d4',
  '#67e8f9', '#fcd34d', '#a5b4fc', '#6ee7b7', '#fda4af',
];

function getUserColor(name) {
  const s = String(name || 'user');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return USER_PALETTE[h % USER_PALETTE.length];
}

function initials(name) {
  return String(name || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
}

function TinyAvatar({ name, avatar, size = 28 }) {
  const color = getUserColor(name);
  const presentation = resolveAvatarPresentation(avatar || '');
  const src = presentation.displaySrc || presentation.src;
  if (src) {
    return (
      <span
        className="cx-chat-avatar"
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `1.5px solid ${color}88`,
          flexShrink: 0,
          background: '#0f172a',
          display: 'inline-block',
        }}
      >
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </span>
    );
  }
  return (
    <span
      className="cx-chat-avatar"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
        background: `linear-gradient(145deg, ${color}55, ${color}22)`,
        border: `1.5px solid ${color}77`,
        color,
        fontSize: Math.max(10, size * 0.38),
        fontWeight: 800,
      }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * Thread chat — GIF / camera / gallery from one attach button.
 */
export default function ThreadInlineChat({
  groupId,
  groupName,
  username,
  userId = null,
  avatar = null,
  theme,
  focusMode = false,
  embedded = false,
  onClose,
}) {
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [composerText, setComposerText] = useState('');
  const [connectionState, setConnectionState] = useState('connecting');
  const [roomReady, setRoomReady] = useState(false);
  const [error, setError] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQuery, setGifQuery] = useState('');
  const [gifResults, setGifResults] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const socketRef = useRef(null);
  const endRef = useRef(null);
  const typingClearRef = useRef(null);
  const lastTypingEmit = useRef(0);
  const inputRef = useRef(null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const groupIdRef = useRef(groupId);
  groupIdRef.current = groupId;

  const visibleMessages = useMemo(
    () => messages
      .filter((message) => message?.chat?.type === 'group' && String(message?.chat?.id) === String(groupId))
      .sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()),
    [messages, groupId],
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages.length, typingUsers.join('|')]);

  useEffect(() => {
    if (!username) return;
    void subscribeToWebPush(username, { requestPermission: false });
  }, [username]);

  useEffect(() => {
    if (!username || !groupId) return undefined;

    let active = true;
    let chatSocket = null;
    setRoomReady(false);
    setMessages([]);
    setMessagesLoading(true);
    setError('');

    const historyTimeout = window.setTimeout(() => {
      if (active) setMessagesLoading(false);
    }, 12000);

    const requestJoin = () => {
      if (!chatSocket || !active) return;
      setRoomReady(false);
      chatSocket.emit('join', {
        username,
        userId: userId || null,
        avatar: avatar || null,
      });
    };

    const enterRoomAfterJoin = () => {
      if (!chatSocket || !active) return;
      const id = groupIdRef.current;
      chatSocket.emit('join_room', { room: id });
      chatSocket.emit('open_chat', {
        chat: { type: 'group', id, name: groupName || id },
      });
    };

    (async () => {
      const { default: io } = await import('socket.io-client');
      if (!active) return;
      const { url: socketUrl, options: socketOptions } = resolveChatSocketClient();
      chatSocket = io(socketUrl, socketOptions);
      socketRef.current = chatSocket;

      chatSocket.on('connect', () => {
        if (!active) return;
        setConnectionState('connected');
        setError('');
        requestJoin();
      });

      chatSocket.on('joined', () => {
        if (!active) return;
        enterRoomAfterJoin();
      });

      chatSocket.on('room_joined', (payload) => {
        if (!active) return;
        if (String(payload?.room || '') !== String(groupIdRef.current)) return;
        setRoomReady(true);
      });

      chatSocket.on('disconnect', () => {
        if (!active) return;
        setConnectionState('offline');
        setRoomReady(false);
      });

      chatSocket.on('connect_error', () => {
        if (!active) return;
        setConnectionState('offline');
        setRoomReady(false);
        setError('Chat service offline — start chat-service (port 3002).');
      });

      chatSocket.on('chat_error', (payload) => {
        if (!active) return;
        const failId = String(payload?.clientMessageId || '').trim();
        if (failId) {
          setMessages((previous) => previous.filter((message) => (
            String(message.clientMessageId || '') !== failId
            && String(message.id || '') !== failId
          )));
        }
        setError(String(payload?.message || 'Could not send message.'));
      });

      chatSocket.on('history', (payload) => {
        if (!active) return;
        setMessages((previous) => mergeChatMessages(previous, payload?.messages || []));
        setMessagesLoading(false);
        setRoomReady(true);
      });

      chatSocket.on('message', (payload) => {
        if (!active) return;
        setMessagesLoading(false);
        setMessages((previous) => mergeChatMessages(previous, [payload]));
        setTypingUsers((prev) => prev.filter((u) => u !== payload?.user));
      });

      chatSocket.on('typing', (payload) => {
        if (!active) return;
        const who = String(payload?.user || '').trim();
        if (!who || who === username) return;
        setTypingUsers((prev) => (prev.includes(who) ? prev : [...prev, who]));
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== who));
        }, 1800);
      });
    })();

    return () => {
      active = false;
      window.clearTimeout(historyTimeout);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
      if (chatSocket) chatSocket.disconnect();
      socketRef.current = null;
    };
  }, [username, groupId, groupName, userId, avatar]);

  useEffect(() => {
    if (!gifOpen) return undefined;
    let cancelled = false;
    setGifLoading(true);
    const handle = window.setTimeout(() => {
      searchGifs(gifQuery, 96)
        .then((list) => {
          if (!cancelled) setGifResults(list);
        })
        .finally(() => {
          if (!cancelled) setGifLoading(false);
        });
    }, gifQuery.trim() ? 280 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [gifOpen, gifQuery]);

  function emitTyping() {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || !username) return;
    const now = Date.now();
    if (now - lastTypingEmit.current < 700) return;
    lastTypingEmit.current = now;
    chatSocket.emit('typing', {
      user: username,
      chat: { type: 'group', id: groupId, name: groupName || groupId },
    });
  }

  function sendPayload(payload) {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected) {
      setError('Not connected yet — wait for Live.');
      return false;
    }
    if (!roomReady) {
      setError('Joining thread… try again in a second.');
      chatSocket.emit('join', {
        username,
        userId: userId || null,
        avatar: avatar || null,
      });
      return false;
    }
    const clientMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      ...payload,
      id: clientMessageId,
      clientMessageId,
      user: username,
      userId: userId || null,
      avatar: avatar || null,
      chat: { type: 'group', id: groupId, name: groupName || groupId },
      timestamp: new Date().toISOString(),
      pending: true,
    };
    setMessages((previous) => mergeChatMessages(previous, [optimistic]));
    chatSocket.emit('message', {
      ...payload,
      chat: { type: 'group', id: groupId, name: groupName || groupId },
      timestamp: optimistic.timestamp,
      clientMessageId,
    });
    setError('');
    return true;
  }

  function handleSend(event) {
    event?.preventDefault?.();
    const text = composerText.trim();
    if (!text) return;
    if (!sendPayload({ type: 'text', text })) return;
    setComposerText('');
    inputRef.current?.focus();
  }

  function handleSendGif(gif) {
    if (!gif?.url) return;
    if (!sendPayload({ type: 'gif', gif: gif.url, text: '' })) return;
    setGifOpen(false);
    setGifQuery('');
    setAttachOpen(false);
  }

  async function uploadAndSendImage(file) {
    if (!file || !username || !groupId) return;
    setUploadingMedia(true);
    setAttachOpen(false);
    setError('');
    try {
      let imageUrl = '';
      const formData = new FormData();
      formData.append('files', file);
      formData.append('username', username);
      formData.append('groupId', groupId);
      formData.append('purpose', 'chat');

      const response = await fetch('/api/chat/group-image-upload', {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const uploads = Array.isArray(payload?.uploads) ? payload.uploads : [];
        imageUrl = String(uploads[0]?.url || '').trim();
      }

      if (!imageUrl) {
        if (file.size > 1.8 * 1024 * 1024) {
          throw new Error(payload?.error || 'Upload failed. Try a smaller photo.');
        }
        imageUrl = await fileToDataUrl(file);
      }

      if (!sendPayload({ type: 'image', image: imageUrl, text: '' })) {
        throw new Error('Could not send photo.');
      }
    } catch (err) {
      setError(err?.message || 'Could not send photo.');
    } finally {
      setUploadingMedia(false);
    }
  }

  function handlePickedFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void uploadAndSendImage(file);
  }

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing…`
    : typingUsers.length > 1
      ? `${typingUsers.length} people typing…`
      : '';

  const shellClass = [
    'cx-chat',
    focusMode ? 'cx-chat--focus' : '',
    embedded ? 'cx-chat--embedded' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={shellClass} role={focusMode ? 'dialog' : undefined} aria-label={`${groupName || 'Thread'} chat`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@500;700;800&family=Space+Grotesk:wght@500;600;700&display=swap');
        .cx-chat {
          --cx-ink: #fafafa;
          --cx-muted: #a1a1aa;
          --cx-line: rgba(255,255,255,0.08);
          --cx-cyan: #e4e4e7;
          --cx-pink: #d4d4d8;
          --cx-amber: #fafafa;
          --cx-violet: #a1a1aa;
          display: grid;
          grid-template-rows: auto 1fr auto auto auto;
          gap: 0;
          border-radius: 22px;
          border: 1px solid var(--cx-line);
          background: #050505;
          overflow: hidden;
          min-height: 360px;
          font-family: "Outfit", "Space Grotesk", "Segoe UI", sans-serif;
          color: var(--cx-ink);
        }
        .cx-chat--embedded {
          border: none;
          border-radius: 0;
          min-height: 0;
          height: 100%;
          grid-template-rows: 1fr auto auto auto;
          background: transparent;
        }
        .cx-chat--focus {
          position: fixed;
          inset: 0;
          z-index: 1600;
          border-radius: 0;
          min-height: 100dvh;
          height: 100dvh;
        }
        .cx-chat-head {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--cx-line);
          background: #0a0a0a;
        }
        .cx-chat-title {
          font-size: 17px;
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #fafafa;
        }
        .cx-chat-sub {
          font-size: 11px;
          color: var(--cx-muted);
          margin-top: 2px;
          font-family: "Space Grotesk", sans-serif;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .cx-chat-live {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          color: var(--cx-muted);
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #64748b;
        }
        .cx-chat-live.is-on .cx-chat-live-dot {
          background: #34d399;
          box-shadow: 0 0 10px #34d399aa;
        }
        .cx-chat-close {
          border: 1px solid var(--cx-line);
          background: rgba(15,23,42,0.8);
          color: #e2e8f0;
          border-radius: 12px;
          width: 38px;
          height: 38px;
          font-weight: 800;
          cursor: pointer;
        }
        .cx-chat-feed {
          overflow-y: auto;
          padding: 16px 14px 10px;
          display: grid;
          gap: 12px;
          align-content: start;
          min-height: 0;
        }
        .cx-chat-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
          max-width: 100%;
        }
        .cx-chat-row.is-own { flex-direction: row-reverse; }
        .cx-chat-bubble {
          max-width: min(78%, 560px);
          padding: 10px 13px;
          border-radius: 18px;
          position: relative;
        }
        .cx-chat-bubble.is-own {
          border-bottom-right-radius: 6px;
          background: #fafafa;
          border: 1px solid #fafafa;
          color: #09090b;
          box-shadow: none;
        }
        .cx-chat-bubble.is-other {
          border-bottom-left-radius: 6px;
          background: #171717;
          border: 1px solid rgba(255,255,255,0.08);
          color: var(--cx-ink);
        }
        .cx-chat-meta {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          margin-bottom: 4px;
          text-transform: uppercase;
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-text {
          font-size: 14.5px;
          line-height: 1.45;
          font-weight: 500;
          letter-spacing: 0.01em;
          word-break: break-word;
        }
        .cx-chat-gif,
        .cx-chat-image {
          display: block;
          max-width: min(260px, 72vw);
          border-radius: 14px;
          margin-top: 2px;
        }
        .cx-chat-time {
          margin-top: 5px;
          font-size: 10px;
          color: #64748b;
          text-align: right;
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-typing {
          min-height: 18px;
          padding: 0 16px 6px;
          font-size: 12px;
          color: #a1a1aa;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .cx-chat-error {
          padding: 0 16px 6px;
          font-size: 12px;
          color: #fda4af;
          font-weight: 600;
        }
        .cx-chat-composer {
          display: grid;
          gap: 10px;
          padding: 12px 14px calc(14px + env(safe-area-inset-bottom, 0px));
          border-top: 1px solid var(--cx-line);
          background: #0a0a0a;
          flex-shrink: 0;
        }
        .cx-attach-wrap {
          position: relative;
        }
        .cx-attach-btn {
          width: 46px;
          height: 46px;
          border: none;
          border-radius: 16px;
          cursor: pointer;
          font-size: 22px;
          font-weight: 800;
          color: #09090b;
          background: #fafafa;
          box-shadow: none;
          display: grid;
          place-items: center;
          transition: transform 0.15s ease, filter 0.15s ease;
          font-family: "Outfit", sans-serif;
        }
        .cx-attach-btn.is-open,
        .cx-attach-btn:hover {
          transform: scale(1.05) rotate(90deg);
          filter: brightness(1.08);
        }
        .cx-attach-menu {
          position: absolute;
          left: 0;
          bottom: calc(100% + 10px);
          min-width: 210px;
          display: grid;
          gap: 6px;
          padding: 8px;
          border-radius: 18px;
          border: 1px solid rgba(148,163,184,0.22);
          background: linear-gradient(160deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98));
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          z-index: 5;
        }
        .cx-attach-option {
          appearance: none;
          border: none;
          border-radius: 14px;
          padding: 12px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          text-align: left;
          font-family: "Outfit", sans-serif;
          background: rgba(255,255,255,0.03);
          color: #f8fafc;
        }
        .cx-attach-option:hover { background: rgba(255,255,255,0.07); }
        .cx-attach-icon {
          width: 36px;
          height: 36px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          font-size: 16px;
          font-weight: 800;
          flex-shrink: 0;
        }
        .cx-attach-icon--gif {
          background: linear-gradient(135deg, #f472b6, #c084fc);
          color: #fff;
        }
        .cx-attach-icon--cam {
          background: linear-gradient(135deg, #22d3ee, #38bdf8);
          color: #041018;
        }
        .cx-attach-icon--gal {
          background: linear-gradient(135deg, #fbbf24, #fb7185);
          color: #1c0a05;
        }
        .cx-attach-label {
          display: grid;
          gap: 1px;
        }
        .cx-attach-label strong {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }
        .cx-attach-label span {
          font-size: 11px;
          color: #94a3b8;
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-form {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 8px;
          align-items: end;
        }
        .cx-chat-input {
          border: 1px solid rgba(255,255,255,0.12);
          background: #111111;
          color: #fafafa;
          border-radius: 16px;
          padding: 13px 14px;
          font-size: 14px;
          font-family: "Outfit", sans-serif;
          outline: none;
        }
        .cx-chat-input:focus {
          border-color: rgba(255,255,255,0.28);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.08);
        }
        .cx-chat-send {
          border: none;
          border-radius: 16px;
          padding: 0 18px;
          min-height: 46px;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          background: #fafafa;
          color: #09090b;
          letter-spacing: 0.03em;
          font-family: "Space Grotesk", sans-serif;
          text-transform: uppercase;
        }
        .cx-chat-send:disabled {
          opacity: 0.45;
          cursor: default;
        }
        .cx-gif-panel {
          max-height: 240px;
          overflow: auto;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.1);
          background: #0a0a0a;
          padding: 10px;
          display: grid;
          gap: 8px;
        }
        .cx-gif-search {
          width: 100%;
          border: 1px solid rgba(255,255,255,0.12);
          background: #111111;
          color: #fafafa;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-family: "Outfit", sans-serif;
        }
        .cx-gif-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .cx-gif-chip {
          border: 1px solid rgba(167,139,250,0.28);
          background: rgba(167,139,250,0.12);
          color: #ddd6fe;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 700;
          cursor: pointer;
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-gif-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
          gap: 6px;
        }
        .cx-gif-cell {
          border: none;
          padding: 0;
          border-radius: 10px;
          overflow: hidden;
          cursor: pointer;
          background: #0f172a;
          aspect-ratio: 1;
        }
        .cx-gif-cell img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .cx-chat-uploading {
          font-size: 12px;
          color: #67e8f9;
          font-weight: 700;
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-loading {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 28px 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: rgba(148,163,184,0.92);
          font-family: "Space Grotesk", sans-serif;
        }
        .cx-chat-loading-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          border: 1.5px solid rgba(148,163,184,0.35);
          border-top-color: #67e8f9;
          animation: cx-chat-spin 0.7s linear infinite;
        }
        @keyframes cx-chat-spin { to { transform: rotate(360deg); } }
      `}</style>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={handlePickedFile}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handlePickedFile}
      />

      {embedded ? null : (
        <div className="cx-chat-head">
          {focusMode && onClose ? (
            <button type="button" className="cx-chat-close" onClick={onClose} aria-label="Close chat">✕</button>
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div className="cx-chat-title">{groupName || 'Thread chat'}</div>
            <div className="cx-chat-sub">Cosmix Link · realtime</div>
          </div>
          <div className={`cx-chat-live${connectionState === 'connected' && roomReady ? ' is-on' : ''}`}>
            <span className="cx-chat-live-dot" />
            {connectionState === 'offline'
              ? 'Offline'
              : connectionState !== 'connected'
                ? 'Connecting…'
                : roomReady
                  ? 'Live'
                  : 'Joining…'}
          </div>
        </div>
      )}

      <div className="cx-chat-feed">
        {messagesLoading && !visibleMessages.length ? (
          <div className="cx-chat-loading" role="status" aria-live="polite">
            <span className="cx-chat-loading-dot" aria-hidden="true" />
            Loading messages…
          </div>
        ) : !visibleMessages.length ? (
          <div style={{ textAlign: 'center', color: 'var(--cx-muted)', padding: '40px 16px', fontSize: 13, fontFamily: '"Space Grotesk", sans-serif' }}>
            Say hello — or tap + for GIF, camera, or photos.
          </div>
        ) : visibleMessages.map((message) => {
          const isOwn = message.user === username;
          const color = getUserColor(message.user);
          const mediaUrl = message.image || ((message.type === 'gif' || message.gif) ? message.gif : '');
          const isMedia = Boolean(mediaUrl);
          return (
            <div key={message.id || `${message.user}-${message.timestamp}-${message.clientMessageId || ''}`} className={`cx-chat-row${isOwn ? ' is-own' : ''}`}>
              {!isOwn ? <TinyAvatar name={message.user} avatar={message.avatar} size={26} /> : null}
              <div className={`cx-chat-bubble${isOwn ? ' is-own' : ' is-other'}`}>
                {!isOwn ? (
                  <div className="cx-chat-meta" style={{ color }}>{message.user}</div>
                ) : null}
                {isMedia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={message.type === 'image' || message.image ? 'cx-chat-image' : 'cx-chat-gif'}
                    src={mediaUrl}
                    alt={message.type === 'image' ? 'Photo' : 'GIF'}
                    loading="lazy"
                  />
                ) : (
                  <div className="cx-chat-text">{message.text || ''}</div>
                )}
                <div className="cx-chat-time">
                  {formatTime(message.timestamp)}
                  {message.pending ? ' · sending' : ''}
                </div>
              </div>
              {isOwn ? <TinyAvatar name={username} avatar={avatar} size={26} /> : null}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="cx-chat-typing">{typingLabel || '\u00a0'}</div>
      {error ? <div className="cx-chat-error">{error}</div> : null}
      {uploadingMedia ? <div className="cx-chat-uploading">Uploading photo…</div> : null}

      <div className="cx-chat-composer">
        {gifOpen ? (
          <div className="cx-gif-panel">
            <input
              className="cx-gif-search"
              value={gifQuery}
              onChange={(e) => setGifQuery(e.target.value)}
              placeholder="Search GIFs — love, run, lol, fire…"
              autoFocus
            />
            <div className="cx-gif-chips">
              {suggestGifQueries(gifQuery).slice(0, 16).map((q) => (
                <button key={q} type="button" className="cx-gif-chip" onClick={() => setGifQuery(q)}>
                  {q}
                </button>
              ))}
            </div>
            {gifLoading ? (
              <div style={{ fontSize: 12, color: 'var(--cx-muted)', padding: 8 }}>Searching lots of GIFs…</div>
            ) : gifResults.length ? (
              <div className="cx-gif-grid">
                {gifResults.map((gif) => (
                  <button key={gif.id} type="button" className="cx-gif-cell" onClick={() => handleSendGif(gif)}>
                    <img src={gif.preview || gif.url} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--cx-muted)', padding: 8 }}>
                No GIFs for that yet — try a chip like “baby crying” or “baby airplane”.
              </div>
            )}
          </div>
        ) : null}

        <form className="cx-chat-form" onSubmit={handleSend}>
          <div className="cx-attach-wrap">
            {attachOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Close attach menu"
                  onClick={() => setAttachOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 4, border: 'none', background: 'transparent' }}
                />
                <div className="cx-attach-menu" role="menu">
                  <button
                    type="button"
                    className="cx-attach-option"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      setGifOpen(true);
                    }}
                  >
                    <span className="cx-attach-icon cx-attach-icon--gif">GIF</span>
                    <span className="cx-attach-label">
                      <strong>GIF</strong>
                      <span>Reactions & loops</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cx-attach-option"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      setGifOpen(false);
                      cameraRef.current?.click();
                    }}
                  >
                    <span className="cx-attach-icon cx-attach-icon--cam">📷</span>
                    <span className="cx-attach-label">
                      <strong>Camera</strong>
                      <span>Snap & send now</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="cx-attach-option"
                    role="menuitem"
                    onClick={() => {
                      setAttachOpen(false);
                      setGifOpen(false);
                      galleryRef.current?.click();
                    }}
                  >
                    <span className="cx-attach-icon cx-attach-icon--gal">🖼</span>
                    <span className="cx-attach-label">
                      <strong>Gallery</strong>
                      <span>Pick from phone</span>
                    </span>
                  </button>
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={`cx-attach-btn${attachOpen ? ' is-open' : ''}`}
              aria-label="Attach GIF, camera, or photo"
              aria-expanded={attachOpen}
              disabled={uploadingMedia}
              onClick={() => {
                setAttachOpen((open) => !open);
                if (gifOpen) setGifOpen(false);
              }}
            >
              +
            </button>
          </div>

          <input
            ref={inputRef}
            className="cx-chat-input"
            value={composerText}
            onChange={(event) => {
              setComposerText(event.target.value);
              emitTyping();
            }}
            placeholder="Write something vivid…"
            autoComplete="off"
          />
          <button type="submit" className="cx-chat-send" disabled={!roomReady || connectionState !== 'connected' || uploadingMedia}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
