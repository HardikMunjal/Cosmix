import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { useTheme } from '../lib/ThemePicker';

let socket = null;

function sameChat(left, right) {
  if (!left || !right) return false;
  return left.type === right.type && left.id === right.id && left.name === right.name;
}

function getChatKey(chat) {
  if (!chat?.type || !chat?.id) return '';
  return `${chat.type}:${chat.id}`;
}

function getDefaultChat(bootstrap, currentUsername) {
  const firstFriend = bootstrap?.friends?.[0];
  if (firstFriend && currentUsername) {
    return {
      type: 'dm',
      id: buildDmId(currentUsername, firstFriend),
      name: firstFriend,
      label: firstFriend,
    };
  }

  const firstGroup = bootstrap?.groups?.[0];
  if (firstGroup) {
    return { type: 'group', id: firstGroup.id, name: firstGroup.name, label: firstGroup.name };
  }

  return null;
}

function buildDmId(left, right) {
  return ['' + left, '' + right]
    .map((value) => value.trim().toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join('::');
}

function parseCommaList(value) {
  return Array.from(
    new Set(
      String(value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function getUserColor(username, theme) {
  const colors = [theme.green, theme.blue, theme.orange, theme.purple, theme.cyan, theme.red];
  let hash = 0;
  for (let index = 0; index < username.length; index += 1) {
    hash = username.charCodeAt(index) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function mergeMessages(previous, incoming) {
  const next = [...previous];
  const seen = new Set(previous.map((message) => message.id || `${message.user}-${message.timestamp}-${message.text || message.gif || ''}`));
  incoming.forEach((message) => {
    const key = message.id || `${message.user}-${message.timestamp}-${message.text || message.gif || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      next.push(message);
    }
  });
  return next.sort((left, right) => new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime());
}

function flattenGroups(groups, parentGroupId = null, depth = 0) {
  const directChildren = groups
    .filter((group) => (group.parentGroupId || null) === parentGroupId)
    .sort((left, right) => left.name.localeCompare(right.name));

  return directChildren.flatMap((group) => [
    { group, depth },
    ...flattenGroups(groups, group.id, depth + 1),
  ]);
}

function parseReplyEnvelope(text) {
  const raw = String(text || '');
  const match = raw.match(/^\[reply:([^:\]]+):([^\]]+)\]\n?([\s\S]*)$/);
  if (!match) {
    return { replyToMessageId: '', replyToUser: '', body: raw };
  }
  return {
    replyToMessageId: match[1] || '',
    replyToUser: match[2] || '',
    body: match[3] || '',
  };
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
      maxWidth: '1480px',
      margin: '0 auto',
      display: 'grid',
      gap: '16px',
    },
    layout: {
      display: 'grid',
      gridTemplateColumns: '340px minmax(0, 1fr)',
      gap: '16px',
      minHeight: 'calc(100vh - 48px)',
    },
    panel: {
      borderRadius: '28px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      boxShadow: `0 24px 64px ${theme.shadow}`,
    },
    sidebar: {
      padding: '18px',
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
      minHeight: 0,
      overflowY: 'auto',
    },
    block: {
      display: 'grid',
      gap: '10px',
      padding: '14px',
      borderRadius: '22px',
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
    },
    sectionTitle: {
      margin: 0,
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      fontWeight: 800,
      color: theme.textMuted,
    },
    textInput: {
      width: '100%',
      borderRadius: '16px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '12px 14px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
    },
    textarea: {
      width: '100%',
      minHeight: '88px',
      resize: 'vertical',
      borderRadius: '18px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '12px 14px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
    },
    select: {
      width: '100%',
      borderRadius: '16px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '12px 14px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
    },
    primaryButton: {
      border: 'none',
      borderRadius: '16px',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.orange})`,
      color: '#fff',
      padding: '12px 14px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 800,
    },
    secondaryButton: {
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      color: theme.textPrimary,
      padding: '12px 14px',
      cursor: 'pointer',
      fontSize: '13px',
      fontWeight: 800,
    },
    listButton: {
      width: '100%',
      textAlign: 'left',
      display: 'grid',
      gap: '4px',
      padding: '12px 14px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      cursor: 'pointer',
      color: theme.textPrimary,
    },
    listTitle: {
      fontSize: '14px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    listMeta: {
      fontSize: '12px',
      color: theme.textSecondary,
      fontWeight: 700,
    },
    actionsRow: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
    },
    searchCard: {
      display: 'grid',
      gap: '8px',
      padding: '12px 14px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
    },
    searchMetaRow: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: '10px',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    main: {
      display: 'grid',
      gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
      minHeight: 0,
      overflow: 'hidden',
    },
    topBar: {
      padding: '18px 20px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '14px',
      alignItems: 'center',
      background: `linear-gradient(180deg, ${theme.panelBg}, ${theme.cardBg})`,
    },
    connectionPill: {
      padding: '10px 14px',
      borderRadius: '999px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    threadName: {
      margin: 0,
      fontSize: '26px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    threadMeta: {
      margin: '8px 0 0',
      color: theme.textSecondary,
      fontSize: '13px',
      lineHeight: 1.6,
    },
    insightGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '14px',
      padding: '16px 20px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      overflowY: 'auto',
      maxHeight: '360px',
    },
    insightCard: {
      display: 'grid',
      gap: '12px',
      padding: '16px',
      borderRadius: '22px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
    },
    badgeRow: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
    },
    badge: {
      padding: '8px 10px',
      borderRadius: '999px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    unreadBadge: {
      minWidth: '24px',
      height: '24px',
      padding: '0 8px',
      borderRadius: '999px',
      background: theme.orange,
      color: '#fff',
      display: 'grid',
      placeItems: 'center',
      fontSize: '11px',
      fontWeight: 800,
      justifySelf: 'start',
    },
    imageGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '12px',
    },
    imageCard: {
      borderRadius: '20px',
      overflow: 'hidden',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
    },
    imageFrame: {
      width: '100%',
      aspectRatio: '4 / 3',
      objectFit: 'cover',
      background: theme.panelDarkBg,
    },
    imageMeta: {
      padding: '12px',
      display: 'grid',
      gap: '10px',
    },
    messages: {
      minHeight: 0,
      overflowY: 'auto',
      padding: '18px 20px',
      display: 'grid',
      gap: '12px',
      background: `linear-gradient(180deg, ${theme.panelDarkBg}, ${theme.cardBg})`,
    },
    empty: {
      minHeight: '220px',
      display: 'grid',
      placeItems: 'center',
      textAlign: 'center',
      color: theme.textSecondary,
      lineHeight: 1.8,
      padding: '20px',
    },
    messageRow: {
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-start',
    },
    avatar: {
      width: '42px',
      height: '42px',
      borderRadius: '16px',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontWeight: 800,
      fontSize: '14px',
      flexShrink: 0,
    },
    messageCard: {
      maxWidth: 'min(82%, 760px)',
      padding: '12px 14px',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      display: 'grid',
      gap: '6px',
      wordBreak: 'break-word',
    },
    messageMeta: {
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      alignItems: 'center',
      color: theme.textMuted,
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    messageMetaSpacer: {
      marginLeft: 'auto',
      display: 'flex',
      gap: '6px',
      alignItems: 'center',
    },
    tinyIconButton: {
      width: '24px',
      height: '24px',
      padding: 0,
      borderRadius: '8px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      fontSize: '12px',
      cursor: 'pointer',
      display: 'grid',
      placeItems: 'center',
      lineHeight: 1,
    },
    replyQuote: {
      borderLeft: `3px solid ${theme.blue}`,
      borderRadius: '10px',
      padding: '6px 8px',
      background: theme.cardBg,
      color: theme.textSecondary,
      fontSize: '12px',
      lineHeight: 1.4,
      marginBottom: '2px',
    },
    inlineReplyComposer: {
      marginTop: '8px',
      display: 'grid',
      gap: '8px',
      padding: '8px',
      borderRadius: '12px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
    },
    tinyInput: {
      width: '100%',
      borderRadius: '10px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '8px 10px',
      fontSize: '12px',
      outline: 'none',
      fontFamily: theme.font,
      resize: 'vertical',
      minHeight: '54px',
    },
    tinyActionRow: {
      display: 'flex',
      gap: '8px',
      justifyContent: 'flex-end',
    },
    tinyButton: {
      borderRadius: '10px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      color: theme.textPrimary,
      padding: '6px 10px',
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 800,
    },
    messageText: {
      fontSize: '15px',
      lineHeight: 1.6,
      color: theme.textPrimary,
      whiteSpace: 'pre-wrap',
    },
    typingBar: {
      padding: '0 20px 12px',
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 700,
    },
    composer: {
      borderTop: `1px solid ${theme.cardBorder}`,
      padding: '16px 20px 20px',
      background: theme.cardBg,
      display: 'grid',
      gap: '10px',
    },
    composerRow: {
      display: 'flex',
      gap: '10px',
      alignItems: 'flex-end',
    },
    helperText: {
      fontSize: '12px',
      color: theme.textSecondary,
      lineHeight: 1.6,
      margin: 0,
    },
    toastStack: {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      display: 'grid',
      gap: '10px',
      zIndex: 40,
      width: 'min(360px, calc(100vw - 32px))',
    },
    toast: {
      padding: '14px 16px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      boxShadow: `0 18px 44px ${theme.shadow}`,
      display: 'grid',
      gap: '6px',
    },
    toastTitle: {
      margin: 0,
      fontSize: '13px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    toastBody: {
      margin: 0,
      fontSize: '12px',
      lineHeight: 1.5,
      color: theme.textSecondary,
    },
  };
}

async function readJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || payload.message || 'Request failed.');
  }
  return payload;
}

export default function ChatPage() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [user, setUser] = useState(null);
  const [bootstrap, setBootstrap] = useState({ friends: [], incomingRequests: [], outgoingRequests: [], groups: [] });
  const [messages, setMessages] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [buddySearch, setBuddySearch] = useState('');
  const [buddyResults, setBuddyResults] = useState([]);
  const [buddySearchState, setBuddySearchState] = useState('idle');
  const [buddySearchError, setBuddySearchError] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading chat workspace...');
  const [connectionState, setConnectionState] = useState('connecting');
  const [groupForm, setGroupForm] = useState({ name: '', description: '', parentGroupId: '', members: '', viewers: '' });
  const [visibilityForm, setVisibilityForm] = useState({ members: '', viewers: '' });
  const [imageCaption, setImageCaption] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [toasts, setToasts] = useState([]);
  const [groupSettingsForm, setGroupSettingsForm] = useState({
    allowJoinByLink: true,
    clearMessagesAfterHours: '',
    onlyAdminsCreateFolders: false,
    onlyAdminsBookmarkMessages: false,
  });
  const [folderForm, setFolderForm] = useState({ name: '', description: '' });
  const [folderSelections, setFolderSelections] = useState({});
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [memberSecurityForm, setMemberSecurityForm] = useState({ username: '', role: 'member', canView: true, canPost: true, canComment: true, canInvite: false });
  const [activeReplyMessageId, setActiveReplyMessageId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inviteHandledRef = useRef(false);
  const activeChatRef = useRef(null);
  const incomingRequestsRef = useRef([]);
  const permissionAskedRef = useRef(false);

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

  const flattenedGroups = useMemo(() => flattenGroups(bootstrap.groups), [bootstrap.groups]);
  const selectedGroup = useMemo(
    () => (activeChat?.id ? bootstrap.groups.find((group) => group.id === activeChat.id) || null : null),
    [bootstrap.groups, activeChat?.id],
  );
  const selectedMembership = useMemo(
    () => selectedGroup?.memberships.find((membership) => membership.username === user?.username) || null,
    [selectedGroup, user?.username],
  );
  const bookmarkedMessageIds = useMemo(
    () => new Set((selectedGroup?.bookmarks || []).map((bookmark) => bookmark.messageId)),
    [selectedGroup?.bookmarks],
  );
  const visibleMessages = useMemo(
    () => {
      if (!activeChat) return [];
      const scoped = messages.filter((message) => message.chat?.type === activeChat.type && (message.chat?.id || message.chat?.name) === activeChat.id);
      if (!showBookmarkedOnly || activeChat.type !== 'group') return scoped;
      return scoped.filter((message) => bookmarkedMessageIds.has(message.id));
    },
    [messages, activeChat, showBookmarkedOnly, bookmarkedMessageIds],
  );
  const childGroups = useMemo(
    () => bootstrap.groups.filter((group) => group.parentGroupId === selectedGroup?.id),
    [bootstrap.groups, selectedGroup?.id],
  );

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    incomingRequestsRef.current = bootstrap.incomingRequests || [];
  }, [bootstrap.incomingRequests]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.username || permissionAskedRef.current) return;
    if (!('Notification' in window) || window.Notification.permission !== 'default') return;
    permissionAskedRef.current = true;
    window.Notification.requestPermission().catch(() => {});
  }, [user?.username]);

  function pushToast(title, body = '') {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((previous) => [...previous.slice(-3), { id, title, body }]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4200);
  }

  function notifyUser(title, body = '', tag = '') {
    pushToast(title, body);

    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission !== 'granted' || !document.hidden) return;

    try {
      new window.Notification(title, { body, tag: tag || title });
    } catch (_) {
      // Ignore notification API failures.
    }
  }

  function applyBootstrap(nextBootstrap, nextChat = null) {
    setBootstrap(nextBootstrap);
    const fallbackChat = getDefaultChat(nextBootstrap, user?.username);

    if (nextChat) {
      setActiveChat(nextChat);
      return;
    }

    if (!activeChat) {
      setActiveChat(fallbackChat);
      return;
    }

    if (activeChat.type === 'dm') {
      if (!nextBootstrap.friends.includes(activeChat.name)) {
        setActiveChat(fallbackChat);
      }
      return;
    }

    const matchingGroup = nextBootstrap.groups.find((group) => group.id === activeChat.id);
    if (!matchingGroup) {
      setActiveChat(fallbackChat);
    }
  }

  function reportStatus(message, detail = '') {
    setStatusMessage(message);
    pushToast(message, detail);
  }

  function reportError(message) {
    setStatusMessage(message);
    pushToast('Action failed', message);
  }

  function describeChat(chat) {
    if (!chat) return 'conversation';
    return chat.type === 'dm' ? `@${chat.name}` : `#${chat.name}`;
  }

  function isChatOpen(chat) {
    return sameChat(activeChatRef.current, chat);
  }

  function buildIncomingChat(payload) {
    const chat = payload?.chat;
    if (!chat?.type) return null;
    return {
      type: chat.type,
      id: chat.id || chat.name,
      name: chat.name,
      label: chat.name,
    };
  }

  function summarizeMessage(payload) {
    const text = String(payload?.text || payload?.gif || '').trim();
    return text.length > 96 ? `${text.slice(0, 93)}...` : text;
  }

  function selectChat(nextChat) {
    setActiveChat(nextChat);
    setTypingUsers([]);
    const chatKey = getChatKey(nextChat);
    if (!chatKey) return;
    setUnreadCounts((previous) => {
      if (!previous[chatKey]) return previous;
      const next = { ...previous };
      delete next[chatKey];
      return next;
    });
  }

  function incrementUnread(chat) {
    const chatKey = getChatKey(chat);
    if (!chatKey) return;
    setUnreadCounts((previous) => ({
      ...previous,
      [chatKey]: (previous[chatKey] || 0) + 1,
    }));
  }

  async function loadBootstrapSnapshot() {
    if (!user?.username) return null;
    const response = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(user.username)}`);
    return readJsonResponse(response);
  }

  async function fetchBootstrap(preferredChat = null) {
    const payload = await loadBootstrapSnapshot();
    if (!payload) return null;
    applyBootstrap(payload, preferredChat);
    return payload;
  }

  useEffect(() => {
    if (!user?.username) return undefined;

    const interval = window.setInterval(async () => {
      try {
        const payload = await loadBootstrapSnapshot();
        if (!payload) return;

        const previousIncoming = new Set(incomingRequestsRef.current || []);
        (payload.incomingRequests || []).forEach((requester) => {
          if (!previousIncoming.has(requester)) {
            notifyUser('New buddy request', `${requester} sent you a buddy request.`, `buddy-request-${requester}`);
          }
        });

        applyBootstrap(payload);
      } catch (_) {
        // Background refresh failures should not interrupt the UI.
      }
    }, 10000);

    return () => window.clearInterval(interval);
  }, [chatApiBase, user?.username]);

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && payload.user) {
          setUser(payload.user);
          setStatusMessage('Loading groups, friendships, and media...');
          return;
        }
        const token = typeof router.query.groupInvite === 'string' ? router.query.groupInvite : '';
        if (token) {
          router.replace(`/join-group/${encodeURIComponent(token)}`);
          return;
        }
        router.push('/');
      })
      .catch(() => {
        if (!active) return;
        router.push('/');
      });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user?.username) return;
    fetchBootstrap().then(() => {
      setStatusMessage('Ready');
    }).catch((error) => {
      reportError(error.message);
    });
  }, [user?.username]);

  useEffect(() => {
    if (!user?.username) return undefined;

    const socketUrl = isLocalHost ? `http://${host}:3002` : undefined;
    const socketOptions = isLocalHost
      ? { transports: ['websocket', 'polling'] }
      : { path: '/chat-socket/socket.io', transports: ['websocket', 'polling'] };

    socket = io(socketUrl, socketOptions);

    socket.on('connect', () => {
      setConnectionState('connected');
      socket.emit('join', { username: user.username, userId: user.id || null, avatar: user.avatar || null });
    });

    socket.on('disconnect', () => {
      setConnectionState('offline');
    });

    socket.on('history', (payload) => {
      setMessages((previous) => mergeMessages(previous, payload.messages || []));
    });

    socket.on('message', (payload) => {
      setMessages((previous) => mergeMessages(previous, [payload]));

      if (!payload?.user || payload.user === user.username) return;
      const incomingChat = buildIncomingChat(payload);
      if (!incomingChat) return;

      const title = incomingChat.type === 'dm'
        ? `New message from ${payload.user}`
        : `${payload.user} in ${describeChat(incomingChat)}`;
      const body = summarizeMessage(payload) || 'Sent you a message.';
      if (!isChatOpen(incomingChat)) {
        incrementUnread(incomingChat);
      }
      if (!isChatOpen(incomingChat) || document.hidden) {
        notifyUser(title, body, payload.id || `${incomingChat.id}-${payload.timestamp}`);
      }
    });

    socket.on('online_users', (list) => {
      setOnlineUsers(Array.from(new Set((list || []).filter(Boolean))));
    });

    socket.on('typing', (payload) => {
      if (!payload?.user || payload.user === user.username) return;
      setTypingUsers((previous) => (previous.includes(payload.user) ? previous : [...previous, payload.user]));
      window.clearTimeout(socket.__typingTimer);
      socket.__typingTimer = window.setTimeout(() => {
        setTypingUsers((previous) => previous.filter((name) => name !== payload.user));
      }, 1500);
    });

    socket.on('chat_error', (payload) => {
      reportError(payload?.message || 'Chat request failed.');
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [host, isLocalHost, user?.avatar, user?.id, user?.username]);

  useEffect(() => {
    if (!socket || connectionState !== 'connected') return;
    bootstrap.groups.forEach((group) => {
      socket.emit('join_room', { room: group.id });
    });
  }, [bootstrap.groups, connectionState]);

  useEffect(() => {
    if (!socket || connectionState !== 'connected' || !user?.username || !activeChat) return;
    socket.emit('open_chat', { chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name } });
  }, [activeChat, connectionState, user?.username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMessages]);

  useEffect(() => {
    if (!selectedGroup) return;
    const members = selectedGroup.memberships.filter((membership) => membership.role === 'member').map((membership) => membership.username).join(', ');
    const viewers = selectedGroup.memberships.filter((membership) => membership.role === 'viewer').map((membership) => membership.username).join(', ');
    setVisibilityForm({ members, viewers });
    setGroupSettingsForm({
      allowJoinByLink: selectedGroup.settings?.allowJoinByLink !== false,
      clearMessagesAfterHours: selectedGroup.settings?.clearMessagesAfterHours == null ? '' : String(selectedGroup.settings.clearMessagesAfterHours),
      onlyAdminsCreateFolders: selectedGroup.settings?.onlyAdminsCreateFolders === true,
      onlyAdminsBookmarkMessages: selectedGroup.settings?.onlyAdminsBookmarkMessages === true,
    });
    setShowBookmarkedOnly(false);
  }, [selectedGroup]);

  useEffect(() => {
    if (!router.isReady || !user?.username || inviteHandledRef.current) return;
    const token = typeof router.query.groupInvite === 'string' ? router.query.groupInvite : '';
    if (!token) return;

    inviteHandledRef.current = true;
    fetch(`${chatApiBase}/groups/join-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsername: user.username, shareToken: token }),
    })
      .then(readJsonResponse)
      .then((payload) => {
        const joinedGroup = payload.groups.find((group) => group.shareToken === token);
        applyBootstrap(
          payload,
          joinedGroup ? { type: 'group', id: joinedGroup.id, name: joinedGroup.name, label: joinedGroup.name } : getDefaultChat(payload, user?.username),
        );
        router.replace('/chat', undefined, { shallow: true });
        reportStatus(joinedGroup ? `Joined ${joinedGroup.name}` : 'Invite processed.');
      })
      .catch((error) => {
        reportError(error.message);
      });
  }, [chatApiBase, router, user?.username]);

  async function submitJson(path, method, body, nextChatFactory = null) {
    const response = await fetch(`${chatApiBase}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await readJsonResponse(response);
    applyBootstrap(payload, nextChatFactory ? nextChatFactory(payload) : null);
    return payload;
  }

  async function handleBuddyRequest(targetUsername) {
    if (!String(targetUsername || '').trim() || !user?.username) return;
    try {
      await submitJson('/friends/request', 'POST', {
        actorUsername: user.username,
        targetUsername: String(targetUsername || '').trim(),
      });
      setBuddySearch('');
      setBuddyResults([]);
      setBuddySearchState('idle');
      setBuddySearchError('');
      reportStatus('Buddy request sent.', `Request sent to ${targetUsername}.`);
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleAcceptBuddy(requesterUsername) {
    try {
      await submitJson('/friends/accept', 'POST', {
        actorUsername: user.username,
        requesterUsername,
      });
      reportStatus(`You are now connected with ${requesterUsername}.`);
    } catch (error) {
      reportError(error.message);
    }
  }

  useEffect(() => {
    if (!user?.username) return;

    const query = buddySearch.trim();
    if (!query) {
      setBuddyResults([]);
      setBuddySearchState('idle');
      setBuddySearchError('');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setBuddySearchState('loading');
        setBuddySearchError('');
        const response = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = await readJsonResponse(response);
        setBuddyResults(payload.results || []);
        setBuddySearchState('done');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setBuddySearchState('error');
        setBuddySearchError(error.message || 'Unable to search buddies.');
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [buddySearch, user?.username]);

  async function handleCreateGroup(event) {
    event.preventDefault();
    if (!groupForm.name.trim() || !user?.username) return;

    try {
      await submitJson(
        '/groups',
        'POST',
        {
          actorUsername: user.username,
          name: groupForm.name.trim(),
          description: groupForm.description.trim(),
          parentGroupId: groupForm.parentGroupId || null,
          memberUsernames: parseCommaList(groupForm.members),
          viewerUsernames: parseCommaList(groupForm.viewers),
        },
        (payload) => {
          const createdGroup = payload.groups.find((group) => group.name === groupForm.name.trim());
          return createdGroup
            ? { type: 'group', id: createdGroup.id, name: createdGroup.name, label: createdGroup.name }
            : null;
        },
      );
      setGroupForm({ name: '', description: '', parentGroupId: '', members: '', viewers: '' });
      reportStatus('Group created.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleUpdateVisibility(event) {
    event.preventDefault();
    if (!selectedGroup || !user?.username) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/access`, 'PUT', {
        actorUsername: user.username,
        memberUsernames: parseCommaList(visibilityForm.members),
        viewerUsernames: parseCommaList(visibilityForm.viewers),
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      reportStatus('Group visibility updated.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleJoinByToken(event) {
    event.preventDefault();
    if (!inviteToken.trim() || !user?.username) return;

    try {
      const payload = await submitJson('/groups/join-link', 'POST', {
        actorUsername: user.username,
        shareToken: inviteToken.trim(),
      });
      const joinedGroup = payload.groups.find((group) => group.shareToken === inviteToken.trim());
      if (joinedGroup) {
        selectChat({ type: 'group', id: joinedGroup.id, name: joinedGroup.name, label: joinedGroup.name });
      }
      setInviteToken('');
      reportStatus('Invite link accepted.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleGroupImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !selectedGroup || !user?.username) return;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('username', user.username);
      formData.append('groupId', selectedGroup.id);
      const uploadResponse = await fetch('/api/chat/group-image-upload', { method: 'POST', body: formData });
      const uploadPayload = await readJsonResponse(uploadResponse);

      await submitJson(`/groups/${selectedGroup.id}/images`, 'POST', {
        actorUsername: user.username,
        imageUrl: uploadPayload.url,
        s3Key: uploadPayload.key,
        caption: imageCaption.trim(),
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });

      setImageCaption('');
      event.target.value = '';
      reportStatus('Group image uploaded.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleImageComment(imageId) {
    const body = String(commentDrafts[imageId] || '').trim();
    if (!body || !selectedGroup || !user?.username) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/images/${imageId}/comments`, 'POST', {
        actorUsername: user.username,
        body,
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      setCommentDrafts((previous) => ({ ...previous, [imageId]: '' }));
      reportStatus('Comment added.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleSaveGroupSettings(event) {
    event.preventDefault();
    if (!selectedGroup || !user?.username) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/settings`, 'PUT', {
        actorUsername: user.username,
        allowJoinByLink: groupSettingsForm.allowJoinByLink,
        clearMessagesAfterHours: groupSettingsForm.clearMessagesAfterHours === '' ? null : Number(groupSettingsForm.clearMessagesAfterHours),
        onlyAdminsCreateFolders: groupSettingsForm.onlyAdminsCreateFolders,
        onlyAdminsBookmarkMessages: groupSettingsForm.onlyAdminsBookmarkMessages,
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      reportStatus('Group security settings saved.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleUpdateMemberSecurity(event) {
    event.preventDefault();
    if (!selectedGroup || !user?.username || !memberSecurityForm.username.trim()) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/members/${encodeURIComponent(memberSecurityForm.username.trim())}/security`, 'PUT', {
        actorUsername: user.username,
        role: memberSecurityForm.role,
        canView: Boolean(memberSecurityForm.canView),
        canPost: Boolean(memberSecurityForm.canPost),
        canComment: Boolean(memberSecurityForm.canComment),
        canInvite: Boolean(memberSecurityForm.canInvite),
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      reportStatus('Member security updated.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleCreateFolder(event) {
    event.preventDefault();
    if (!selectedGroup || !user?.username || !folderForm.name.trim()) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/folders`, 'POST', {
        actorUsername: user.username,
        name: folderForm.name.trim(),
        description: folderForm.description.trim(),
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      setFolderForm({ name: '', description: '' });
      reportStatus('Folder created.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleSaveMessageToFolder(messageId) {
    if (!selectedGroup || !user?.username || !messageId) return;
    const folderId = folderSelections[messageId] || selectedGroup.folders?.[0]?.id;
    if (!folderId) {
      reportError('Create a folder first.');
      return;
    }

    try {
      await submitJson(`/groups/${selectedGroup.id}/folders/${folderId}/items`, 'POST', {
        actorUsername: user.username,
        messageId,
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      reportStatus('Message saved to folder.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleBookmarkMessage(messageId) {
    if (!selectedGroup || !user?.username || !messageId) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/bookmarks`, 'POST', {
        actorUsername: user.username,
        messageId,
        note: '',
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      reportStatus('Message bookmarked.');
    } catch (error) {
      reportError(error.message);
    }
  }

  function toggleReplyBox(messageId) {
    setActiveReplyMessageId((previous) => (previous === messageId ? '' : messageId));
  }

  function handleReplyDraftChange(messageId, value) {
    setReplyDrafts((previous) => ({ ...previous, [messageId]: value }));
  }

  function handleSendInlineReply(targetMessage) {
    if (!socket || connectionState !== 'connected' || !activeChat) return;
    const draft = String(replyDrafts[targetMessage.id] || '').trim();
    if (!draft) return;

    const replyEnvelope = `[reply:${targetMessage.id}:${targetMessage.user || 'user'}]\n${draft}`;
    socket.emit('message', {
      type: 'text',
      text: replyEnvelope,
      chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name },
      timestamp: new Date().toISOString(),
    });

    setReplyDrafts((previous) => ({ ...previous, [targetMessage.id]: '' }));
    setActiveReplyMessageId('');
  }

  function selectFriend(friendName) {
    selectChat({
      type: 'dm',
      id: buildDmId(user.username, friendName),
      name: friendName,
      label: friendName,
    });
  }

  function selectGroup(group) {
    selectChat({ type: 'group', id: group.id, name: group.name, label: group.name });
  }

  function emitTyping() {
    if (!socket || connectionState !== 'connected' || !user?.username || !activeChat) return;
    socket.emit('typing', { user: user.username, chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name } });
  }

  function handleComposerChange(event) {
    setComposerText(event.target.value);
    emitTyping();
  }

  function handleSendMessage(event) {
    event.preventDefault();
    if (!socket || !activeChat || !composerText.trim() || connectionState !== 'connected') return;
    socket.emit('message', {
      type: 'text',
      text: composerText.trim(),
      chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name },
      timestamp: new Date().toISOString(),
    });
    setComposerText('');
  }

  function openWhatsAppShare() {
    if (!selectedGroup || typeof window === 'undefined') return;
    const inviteUrl = `${window.location.origin}/join-group/${encodeURIComponent(selectedGroup.shareToken)}`;
    const message = `Join ${selectedGroup.name} on Cosmix: ${inviteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  const canPostToGroup = selectedMembership?.canPost;
  const canInviteToGroup = selectedMembership?.canInvite;
  const canCommentInGroup = selectedMembership?.canComment;
  const isGroupOwner = selectedMembership?.role === 'owner';
  const canManageFolders = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsCreateFolders;
  const canBookmarkMessages = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsBookmarkMessages;

  return (
    <div className="chat-page" style={styles.page}>
      <div style={styles.shell}>
        <div className="chat-layout" style={styles.layout}>
          <aside style={{ ...styles.panel, ...styles.sidebar }}>
            <form style={styles.block} onSubmit={handleJoinByToken}>
              <p style={styles.sectionTitle}>Join By Share Token</p>
              <input
                style={styles.textInput}
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
                placeholder="Paste a group token"
              />
              <button type="submit" style={styles.primaryButton}>Join Shared Group</button>
            </form>

            <section style={styles.block}>
              <p style={styles.sectionTitle}>Add Buddy</p>
              <input
                style={styles.textInput}
                value={buddySearch}
                onChange={(event) => setBuddySearch(event.target.value)}
              />
              {buddySearchState === 'loading' ? <p style={styles.helperText}>Searching users...</p> : null}
              {buddySearchError ? <p style={styles.helperText}>{buddySearchError}</p> : null}
              {buddySearch.trim() && buddySearchState === 'done' && buddyResults.length === 0 ? <p style={styles.helperText}>No matching users found.</p> : null}
              {buddyResults.map((result) => {
                const isBuddy = bootstrap.friends.includes(result.username);
                const isPending = bootstrap.outgoingRequests.includes(result.username);
                const hasIncoming = bootstrap.incomingRequests.includes(result.username);
                return (
                  <div key={result.id} style={styles.searchCard}>
                    <div style={styles.searchMetaRow}>
                      <div>
                        <div style={styles.listTitle}>{result.name || result.username}</div>
                        <div style={styles.listMeta}>@{result.username}</div>
                      </div>
                      {isBuddy ? <span style={styles.badge}>Buddy</span> : null}
                      {isPending ? <span style={styles.badge}>Pending</span> : null}
                      {hasIncoming ? <span style={styles.badge}>Requested you</span> : null}
                    </div>
                    <div style={styles.actionsRow}>
                      <button
                        type="button"
                        style={styles.secondaryButton}
                        onClick={() => selectFriend(result.username)}
                        disabled={!isBuddy}
                      >
                        Open Chat
                      </button>
                      <button
                        type="button"
                        style={styles.primaryButton}
                        onClick={() => handleBuddyRequest(result.username)}
                        disabled={isBuddy || isPending}
                      >
                        {isBuddy ? 'Connected' : isPending ? 'Requested' : 'Send Request'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section style={styles.block}>
              <p style={styles.sectionTitle}>Buddy Requests</p>
              {bootstrap.incomingRequests.length ? bootstrap.incomingRequests.map((entry) => (
                <div key={entry} style={styles.actionsRow}>
                  <button type="button" style={{ ...styles.listButton, flex: 1 }} onClick={() => handleAcceptBuddy(entry)}>
                    <span style={styles.listTitle}>{entry}</span>
                    <span style={styles.listMeta}>Accept buddy request</span>
                  </button>
                </div>
              )) : <p style={styles.helperText}>No pending requests.</p>}
            </section>

            <section style={styles.block}>
              <p style={styles.sectionTitle}>Buddies</p>
              {bootstrap.friends.length ? bootstrap.friends.map((friendName) => (
                <button key={friendName} type="button" style={styles.listButton} onClick={() => selectFriend(friendName)}>
                  <span style={styles.listTitle}>@{friendName}</span>
                  <span style={styles.listMeta}>{onlineUsers.includes(friendName) ? 'Online now' : 'Offline'}</span>
                  {unreadCounts[getChatKey({ type: 'dm', id: buildDmId(user?.username || '', friendName) })] ? (
                    <span style={styles.unreadBadge}>
                      {unreadCounts[getChatKey({ type: 'dm', id: buildDmId(user?.username || '', friendName) })]}
                    </span>
                  ) : null}
                </button>
              )) : <p style={styles.helperText}>Accepted buddies will appear here for direct messaging.</p>}
            </section>

            <section style={styles.block}>
              <p style={styles.sectionTitle}>Groups And Subgroups</p>
              {flattenedGroups.length ? flattenedGroups.map(({ group, depth }) => (
                <button
                  key={group.id}
                  type="button"
                  style={{ ...styles.listButton, marginLeft: depth * 14 }}
                  onClick={() => selectGroup(group)}
                >
                  <span style={styles.listTitle}>{depth ? 'Subgroup' : 'Group'}: {group.name}</span>
                  <span style={styles.listMeta}>{group.memberships.length} visible members</span>
                  {unreadCounts[getChatKey({ type: 'group', id: group.id })] ? (
                    <span style={styles.unreadBadge}>{unreadCounts[getChatKey({ type: 'group', id: group.id })]}</span>
                  ) : null}
                </button>
              )) : <p style={styles.helperText}>No custom groups yet.</p>}
            </section>

            <form style={styles.block} onSubmit={handleCreateGroup}>
              <p style={styles.sectionTitle}>Create Group</p>
              <input
                style={styles.textInput}
                value={groupForm.name}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Group name"
              />
              <textarea
                style={styles.textarea}
                value={groupForm.description}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="What is this group for?"
              />
              <select
                style={styles.select}
                value={groupForm.parentGroupId}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, parentGroupId: event.target.value }))}
              >
                <option value="">Top-level group</option>
                {bootstrap.groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <input
                style={styles.textInput}
                value={groupForm.members}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, members: event.target.value }))}
                placeholder="Members who can post, comma separated"
              />
              <input
                style={styles.textInput}
                value={groupForm.viewers}
                onChange={(event) => setGroupForm((previous) => ({ ...previous, viewers: event.target.value }))}
                placeholder="View-only users, comma separated"
              />
              <button type="submit" style={styles.primaryButton}>Create Group</button>
            </form>
          </aside>

          <section style={{ ...styles.panel, ...styles.main }}>
            <div style={styles.topBar}>
              <div>
                <h2 style={styles.threadName}>
                  {activeChat
                    ? activeChat.type === 'dm'
                      ? `@${activeChat.label || activeChat.name}`
                      : `#${activeChat.label || activeChat.name}`
                    : 'No conversation selected'}
                </h2>
                <p style={styles.threadMeta}>
                  {!activeChat
                    ? 'Start by connecting with a buddy or joining a group.'
                    : activeChat.type === 'dm'
                    ? 'Direct messaging is available for connected buddies.'
                    : selectedGroup?.description || 'Only members of this group can view and post here.'}
                </p>
              </div>

              <div style={styles.actionsRow}>
                <span style={styles.connectionPill}>{connectionState}</span>
                {selectedGroup ? (
                <div style={styles.actionsRow}>
                  <button type="button" style={styles.secondaryButton} onClick={openWhatsAppShare}>Share To WhatsApp</button>
                  <button type="button" style={styles.secondaryButton} onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/join-group/${encodeURIComponent(selectedGroup.shareToken)}`)}>Copy Invite Link</button>
                </div>
                ) : null}
              </div>
            </div>

            {selectedGroup ? (
              <div style={styles.insightGrid}>
                <section style={styles.insightCard}>
                  <p style={styles.sectionTitle}>Visibility</p>
                  <div style={styles.badgeRow}>
                    {selectedGroup.memberships.map((membership) => (
                      <span key={`${selectedGroup.id}-${membership.username}`} style={styles.badge}>
                        {membership.username} · {membership.role}
                      </span>
                    ))}
                  </div>
                  {canInviteToGroup ? (
                    <form style={{ display: 'grid', gap: '10px' }} onSubmit={handleUpdateVisibility}>
                      <input
                        style={styles.textInput}
                        value={visibilityForm.members}
                        onChange={(event) => setVisibilityForm((previous) => ({ ...previous, members: event.target.value }))}
                        placeholder="Members who can post"
                      />
                      <input
                        style={styles.textInput}
                        value={visibilityForm.viewers}
                        onChange={(event) => setVisibilityForm((previous) => ({ ...previous, viewers: event.target.value }))}
                        placeholder="View-only usernames"
                      />
                      <button type="submit" style={styles.primaryButton}>Save Visibility</button>
                    </form>
                  ) : <p style={styles.helperText}>Only users with invite permission can change visibility.</p>}
                </section>

                <section style={styles.insightCard}>
                  <p style={styles.sectionTitle}>Group Security And Retention</p>
                  {isGroupOwner ? (
                    <form style={{ display: 'grid', gap: '10px' }} onSubmit={handleSaveGroupSettings}>
                      <label style={styles.helperText}>
                        <input
                          type="checkbox"
                          checked={groupSettingsForm.allowJoinByLink}
                          onChange={(event) => setGroupSettingsForm((previous) => ({ ...previous, allowJoinByLink: event.target.checked }))}
                        />
                        {' '}Allow users to join through shared link
                      </label>
                      <input
                        style={styles.textInput}
                        value={groupSettingsForm.clearMessagesAfterHours}
                        onChange={(event) => setGroupSettingsForm((previous) => ({ ...previous, clearMessagesAfterHours: event.target.value }))}
                        placeholder="Clear group messages after hours (leave empty to keep forever)"
                      />
                      <label style={styles.helperText}>
                        <input
                          type="checkbox"
                          checked={groupSettingsForm.onlyAdminsCreateFolders}
                          onChange={(event) => setGroupSettingsForm((previous) => ({ ...previous, onlyAdminsCreateFolders: event.target.checked }))}
                        />
                        {' '}Only admins/owner can create folders
                      </label>
                      <label style={styles.helperText}>
                        <input
                          type="checkbox"
                          checked={groupSettingsForm.onlyAdminsBookmarkMessages}
                          onChange={(event) => setGroupSettingsForm((previous) => ({ ...previous, onlyAdminsBookmarkMessages: event.target.checked }))}
                        />
                        {' '}Only admins/owner can bookmark messages
                      </label>
                      <button type="submit" style={styles.primaryButton}>Save Group Security</button>
                    </form>
                  ) : <p style={styles.helperText}>Only group owner can manage security and auto-clear settings.</p>}

                  {isGroupOwner ? (
                    <form style={{ display: 'grid', gap: '10px' }} onSubmit={handleUpdateMemberSecurity}>
                      <input
                        style={styles.textInput}
                        value={memberSecurityForm.username}
                        onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, username: event.target.value }))}
                        placeholder="Member username to update"
                      />
                      <select
                        style={styles.select}
                        value={memberSecurityForm.role}
                        onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, role: event.target.value }))}
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                      <div style={styles.badgeRow}>
                        <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canView} onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, canView: event.target.checked }))} /> View</label>
                        <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canPost} onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, canPost: event.target.checked }))} /> Post</label>
                        <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canComment} onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, canComment: event.target.checked }))} /> Comment</label>
                        <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canInvite} onChange={(event) => setMemberSecurityForm((previous) => ({ ...previous, canInvite: event.target.checked }))} /> Invite</label>
                      </div>
                      <button type="submit" style={styles.secondaryButton}>Update Member Security</button>
                    </form>
                  ) : null}
                </section>

                <section style={styles.insightCard}>
                  <p style={styles.sectionTitle}>Folders For Important Items</p>
                  {canManageFolders ? (
                    <form style={{ display: 'grid', gap: '10px' }} onSubmit={handleCreateFolder}>
                      <input
                        style={styles.textInput}
                        value={folderForm.name}
                        onChange={(event) => setFolderForm((previous) => ({ ...previous, name: event.target.value }))}
                        placeholder="Folder name"
                      />
                      <input
                        style={styles.textInput}
                        value={folderForm.description}
                        onChange={(event) => setFolderForm((previous) => ({ ...previous, description: event.target.value }))}
                        placeholder="Folder description"
                      />
                      <button type="submit" style={styles.primaryButton}>Create Folder</button>
                    </form>
                  ) : <p style={styles.helperText}>Only admins/owner can create folders in this group.</p>}
                  {(selectedGroup.folders || []).length ? (
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {selectedGroup.folders.map((folder) => (
                        <div key={folder.id} style={{ ...styles.block, padding: '10px' }}>
                          <div style={styles.listTitle}>{folder.name}</div>
                          <div style={styles.listMeta}>{folder.description || 'No description'} · {folder.items.length} saved items</div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={styles.helperText}>No folders yet.</p>}
                </section>

                <section style={styles.insightCard}>
                  <p style={styles.sectionTitle}>Bookmarks</p>
                  <button type="button" style={styles.secondaryButton} onClick={() => setShowBookmarkedOnly((value) => !value)}>
                    {showBookmarkedOnly ? 'Show All Messages' : 'Show Only Bookmarked Messages'}
                  </button>
                  {(selectedGroup.bookmarks || []).length ? (
                    <div style={{ display: 'grid', gap: '8px', maxHeight: 220, overflowY: 'auto' }}>
                      {selectedGroup.bookmarks.map((bookmark) => (
                        <div key={bookmark.id} style={{ ...styles.block, padding: '10px' }}>
                          <div style={styles.listMeta}>{bookmark.bookmarkedBy} bookmarked message {bookmark.messageId}</div>
                          <div style={styles.helperText}>{bookmark.note || 'No note'}</div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={styles.helperText}>No bookmarks in this group yet.</p>}
                </section>

                <section style={styles.insightCard}>
                  <p style={styles.sectionTitle}>Media Board</p>
                  <input
                    style={styles.textInput}
                    value={imageCaption}
                    onChange={(event) => setImageCaption(event.target.value)}
                    placeholder="Optional image caption"
                  />
                  <div style={styles.actionsRow}>
                    <button
                      type="button"
                      style={styles.secondaryButton}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!canPostToGroup}
                    >
                      Upload Group Image
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleGroupImageUpload}
                    />
                    <span style={styles.badge}>{selectedGroup.images.length} images</span>
                  </div>
                  <p style={styles.helperText}>Images upload to a dedicated chat folder in S3 and stay attached to this group with threaded comments.</p>
                </section>

                <section style={{ ...styles.insightCard, gridColumn: '1 / -1' }}>
                  <p style={styles.sectionTitle}>Subgroups And Image Threads</p>
                  {childGroups.length ? (
                    <div style={styles.badgeRow}>
                      {childGroups.map((group) => (
                        <button key={group.id} type="button" style={styles.secondaryButton} onClick={() => selectGroup(group)}>
                          Open {group.name}
                        </button>
                      ))}
                    </div>
                  ) : <p style={styles.helperText}>No subgroups below this group yet.</p>}

                  {selectedGroup.images.length ? (
                    <div style={styles.imageGrid}>
                      {selectedGroup.images.map((image) => (
                        <article key={image.id} style={styles.imageCard}>
                          <img src={image.imageUrl} alt={image.caption || selectedGroup.name} style={styles.imageFrame} />
                          <div style={styles.imageMeta}>
                            <div>
                              <div style={styles.listTitle}>{image.caption || 'Untitled image'}</div>
                              <div style={styles.listMeta}>Uploaded by {image.uploadedBy}</div>
                            </div>
                            {(selectedGroup.folders || []).length && canManageFolders ? (
                              <button
                                type="button"
                                style={styles.secondaryButton}
                                onClick={() => {
                                  const folderId = selectedGroup.folders[0].id;
                                  submitJson(`/groups/${selectedGroup.id}/folders/${folderId}/items`, 'POST', {
                                    actorUsername: user.username,
                                    imageId: image.id,
                                  }, (payload) => {
                                    const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
                                    return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
                                  }).then(() => reportStatus('Image saved to folder.')).catch((error) => reportError(error.message));
                                }}
                              >
                                Save Image To Folder
                              </button>
                            ) : null}
                            <div style={{ display: 'grid', gap: '8px' }}>
                              {image.comments.map((comment) => (
                                <div key={comment.id} style={{ ...styles.block, padding: '10px' }}>
                                  <div style={styles.listMeta}>{comment.commentedBy}</div>
                                  <div style={styles.helperText}>{comment.body}</div>
                                </div>
                              ))}
                            </div>
                            {canCommentInGroup ? (
                              <div style={{ display: 'grid', gap: '8px' }}>
                                <input
                                  style={styles.textInput}
                                  value={commentDrafts[image.id] || ''}
                                  onChange={(event) => setCommentDrafts((previous) => ({ ...previous, [image.id]: event.target.value }))}
                                  placeholder="Comment on this image"
                                />
                                <button type="button" style={styles.primaryButton} onClick={() => handleImageComment(image.id)}>Post Comment</button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <p style={styles.helperText}>No images in this group yet.</p>}
                </section>
              </div>
            ) : null}

            <div style={styles.messages}>
              {visibleMessages.length ? visibleMessages.map((message) => (
                <div key={message.id || `${message.user}-${message.timestamp}`} style={styles.messageRow}>
                  <div style={{ ...styles.avatar, background: getUserColor(message.user || 'user', theme) }}>
                    {(message.user || 'U').slice(0, 2).toUpperCase()}
                  </div>
                  <div style={styles.messageCard}>
                    {(() => {
                      const parsed = parseReplyEnvelope(message.text || message.gif || '');
                      return (
                        <>
                    <div style={styles.messageMeta}>
                      <span>{message.user}</span>
                      <span>{new Date(message.timestamp || Date.now()).toLocaleString()}</span>
                      <span>{message.chat?.type === 'dm' ? 'Direct' : 'Group'}</span>
                      <span style={styles.messageMetaSpacer}>
                        <button
                          type="button"
                          style={styles.tinyIconButton}
                          title="Reply"
                          onClick={() => toggleReplyBox(message.id)}
                        >
                          ↩
                        </button>
                        {selectedGroup && canBookmarkMessages ? (
                          <button
                            type="button"
                            style={{
                              ...styles.tinyIconButton,
                              color: bookmarkedMessageIds.has(message.id) ? theme.orange : styles.tinyIconButton.color,
                              border: bookmarkedMessageIds.has(message.id) ? `1px solid ${theme.orange}` : styles.tinyIconButton.border,
                            }}
                            title={bookmarkedMessageIds.has(message.id) ? 'Bookmarked' : 'Bookmark'}
                            onClick={() => handleBookmarkMessage(message.id)}
                          >
                            🔖
                          </button>
                        ) : null}
                      </span>
                    </div>
                    {parsed.replyToMessageId ? (
                      <div style={styles.replyQuote}>
                        Reply to {parsed.replyToUser || 'message'}
                      </div>
                    ) : null}
                    <div style={styles.messageText}>{parsed.body || (message.text || message.gif || '')}</div>
                    {activeReplyMessageId === message.id ? (
                      <div style={styles.inlineReplyComposer}>
                        <div style={styles.replyQuote}>Replying to {message.user}</div>
                        <textarea
                          style={styles.tinyInput}
                          value={replyDrafts[message.id] || ''}
                          onChange={(event) => handleReplyDraftChange(message.id, event.target.value)}
                          placeholder="Write a quick reply"
                        />
                        <div style={styles.tinyActionRow}>
                          <button type="button" style={styles.tinyButton} onClick={() => setActiveReplyMessageId('')}>Cancel</button>
                          <button type="button" style={styles.tinyButton} onClick={() => handleSendInlineReply(message)}>Reply</button>
                        </div>
                      </div>
                    ) : null}
                    {selectedGroup && message.chat?.type === 'group' ? (
                      <div style={styles.actionsRow}>
                        {(selectedGroup.folders || []).length ? (
                          <>
                            <select
                              style={{ ...styles.select, maxWidth: 220, padding: '8px 10px' }}
                              value={folderSelections[message.id] || selectedGroup.folders[0].id}
                              onChange={(event) => setFolderSelections((previous) => ({ ...previous, [message.id]: event.target.value }))}
                            >
                              {selectedGroup.folders.map((folder) => (
                                <option key={folder.id} value={folder.id}>{folder.name}</option>
                              ))}
                            </select>
                            <button type="button" style={styles.secondaryButton} onClick={() => handleSaveMessageToFolder(message.id)}>
                              Save To Folder
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )) : (
                <div style={styles.empty}>
                  {activeChat
                    ? 'No messages yet in this conversation.'
                    : 'No buddy or group conversation is available yet.'}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div style={styles.typingBar}>
              {typingUsers.length ? `${typingUsers.join(', ')} typing...` : ' '}
            </div>

            <form style={styles.composer} onSubmit={handleSendMessage}>
              <div style={styles.composerRow}>
                <textarea
                  style={styles.textarea}
                  value={composerText}
                  onChange={handleComposerChange}
                  placeholder={activeChat ? `Message ${activeChat.name}` : 'Select a buddy or group'}
                  disabled={!activeChat}
                />
                <button type="submit" style={styles.primaryButton} disabled={!activeChat}>Send</button>
              </div>
              <p style={styles.helperText}>
                {!activeChat
                  ? 'Messaging is available only with accepted buddies or members of your groups.'
                  : activeChat.type === 'dm'
                  ? 'Direct messages require an accepted buddy connection.'
                  : selectedGroup
                    ? 'Posting inside custom groups follows the group visibility and posting rules.'
                    : 'Messaging is available only inside your allowed conversations.'}
              </p>
            </form>
          </section>
        </div>
      </div>

      {toasts.length ? (
        <div style={styles.toastStack}>
          {toasts.map((toast) => (
            <div key={toast.id} style={styles.toast}>
              <p style={styles.toastTitle}>{toast.title}</p>
              {toast.body ? <p style={styles.toastBody}>{toast.body}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <style jsx>{`
        @media (max-width: 980px) {
          .chat-layout {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 760px) {
          .chat-page {
            padding: 14px;
          }

          .chat-layout {
            gap: 12px;
          }
        }
      `}</style>
    </div>
  );
}