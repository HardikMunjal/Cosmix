import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';

let socket = null;

const GENERAL_CHAT = { type: 'group', id: 'general', name: 'general', label: 'General' };

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
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '16px',
      borderRadius: '28px',
      padding: '18px 20px',
      border: `1px solid ${theme.cardBorder}`,
      background: `linear-gradient(135deg, ${theme.panelBg}, ${theme.cardBg})`,
      boxShadow: `0 24px 64px ${theme.shadow}`,
    },
    eyebrow: {
      margin: 0,
      fontSize: '11px',
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      fontWeight: 800,
      color: theme.textMuted,
    },
    title: {
      margin: '6px 0 0',
      fontSize: '30px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    subtitle: {
      margin: '10px 0 0',
      maxWidth: '720px',
      color: theme.textSecondary,
      lineHeight: 1.7,
      fontSize: '14px',
    },
    statusPill: {
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
    layout: {
      display: 'grid',
      gridTemplateColumns: '340px minmax(0, 1fr)',
      gap: '16px',
      minHeight: 'calc(100vh - 170px)',
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
      color: theme.textMuted,
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
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
  const [activeChat, setActiveChat] = useState(GENERAL_CHAT);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [composerText, setComposerText] = useState('');
  const [buddySearch, setBuddySearch] = useState('');
  const [buddyResults, setBuddyResults] = useState([]);
  const [buddySearchState, setBuddySearchState] = useState('idle');
  const [inviteToken, setInviteToken] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading chat workspace...');
  const [connectionState, setConnectionState] = useState('connecting');
  const [groupForm, setGroupForm] = useState({ name: '', description: '', parentGroupId: '', members: '', viewers: '' });
  const [visibilityForm, setVisibilityForm] = useState({ members: '', viewers: '' });
  const [imageCaption, setImageCaption] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inviteHandledRef = useRef(false);

  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  const chatApiBase = isLocalHost ? `http://${host}:3002/chat` : '/chat-api/chat';

  const flattenedGroups = useMemo(() => flattenGroups(bootstrap.groups), [bootstrap.groups]);
  const selectedGroup = useMemo(
    () => bootstrap.groups.find((group) => group.id === activeChat.id) || null,
    [bootstrap.groups, activeChat.id],
  );
  const selectedMembership = useMemo(
    () => selectedGroup?.memberships.find((membership) => membership.username === user?.username) || null,
    [selectedGroup, user?.username],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => message.chat?.type === activeChat.type && (message.chat?.id || message.chat?.name) === activeChat.id),
    [messages, activeChat],
  );
  const childGroups = useMemo(
    () => bootstrap.groups.filter((group) => group.parentGroupId === selectedGroup?.id),
    [bootstrap.groups, selectedGroup?.id],
  );

  function applyBootstrap(nextBootstrap, nextChat = null) {
    setBootstrap(nextBootstrap);
    if (nextChat) {
      setActiveChat(nextChat);
      return;
    }

    if (activeChat.type === 'group' && activeChat.id !== GENERAL_CHAT.id) {
      const matchingGroup = nextBootstrap.groups.find((group) => group.id === activeChat.id);
      if (!matchingGroup) {
        setActiveChat(GENERAL_CHAT);
      }
    }
  }

  async function fetchBootstrap(preferredChat = null) {
    if (!user?.username) return;
    const response = await fetch(`${chatApiBase}/bootstrap?username=${encodeURIComponent(user.username)}`);
    const payload = await readJsonResponse(response);
    applyBootstrap(payload, preferredChat);
  }

  useEffect(() => {
    let active = true;

    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!active || !sessionUser) return;
      setStatusMessage('Loading groups, friendships, and media...');
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
      setStatusMessage(error.message);
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
      setStatusMessage(payload?.message || 'Chat request failed.');
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
    if (!socket || connectionState !== 'connected' || !user?.username) return;
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
          joinedGroup ? { type: 'group', id: joinedGroup.id, name: joinedGroup.name, label: joinedGroup.name } : GENERAL_CHAT,
        );
        router.replace('/chat', undefined, { shallow: true });
        setStatusMessage(joinedGroup ? `Joined ${joinedGroup.name}` : 'Invite processed.');
      })
      .catch((error) => {
        setStatusMessage(error.message);
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
      setStatusMessage('Buddy request sent.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleAcceptBuddy(requesterUsername) {
    try {
      await submitJson('/friends/accept', 'POST', {
        actorUsername: user.username,
        requesterUsername,
      });
      setStatusMessage(`You are now connected with ${requesterUsername}.`);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  useEffect(() => {
    if (!user?.id) return;

    const query = buddySearch.trim();
    if (!query) {
      setBuddyResults([]);
      setBuddySearchState('idle');
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setBuddySearchState('loading');
        const response = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        const payload = await readJsonResponse(response);
        setBuddyResults(payload.results || []);
        setBuddySearchState('done');
      } catch (error) {
        if (error.name === 'AbortError') return;
        setBuddySearchState('error');
        setStatusMessage(error.message || 'Unable to search buddies.');
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [buddySearch, user?.id]);

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
      setStatusMessage('Group created.');
    } catch (error) {
      setStatusMessage(error.message);
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
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : GENERAL_CHAT;
      });
      setStatusMessage('Group visibility updated.');
    } catch (error) {
      setStatusMessage(error.message);
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
        setActiveChat({ type: 'group', id: joinedGroup.id, name: joinedGroup.name, label: joinedGroup.name });
      }
      setInviteToken('');
      setStatusMessage('Invite link accepted.');
    } catch (error) {
      setStatusMessage(error.message);
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
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : GENERAL_CHAT;
      });

      setImageCaption('');
      event.target.value = '';
      setStatusMessage('Group image uploaded.');
    } catch (error) {
      setStatusMessage(error.message);
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
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : GENERAL_CHAT;
      });
      setCommentDrafts((previous) => ({ ...previous, [imageId]: '' }));
      setStatusMessage('Comment added.');
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  function selectFriend(friendName) {
    setActiveChat({
      type: 'dm',
      id: buildDmId(user.username, friendName),
      name: friendName,
      label: friendName,
    });
  }

  function selectGroup(group) {
    setActiveChat({ type: 'group', id: group.id, name: group.name, label: group.name });
  }

  function emitTyping() {
    if (!socket || connectionState !== 'connected' || !user?.username) return;
    socket.emit('typing', { user: user.username, chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name } });
  }

  function handleComposerChange(event) {
    setComposerText(event.target.value);
    emitTyping();
  }

  function handleSendMessage(event) {
    event.preventDefault();
    if (!socket || !composerText.trim() || connectionState !== 'connected') return;
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
    const inviteUrl = `${window.location.origin}/chat?groupInvite=${encodeURIComponent(selectedGroup.shareToken)}`;
    const message = `Join ${selectedGroup.name} on Cosmix: ${inviteUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  const canPostToGroup = selectedMembership?.canPost;
  const canInviteToGroup = selectedMembership?.canInvite;
  const canCommentInGroup = selectedMembership?.canComment;

  return (
    <div className="chat-page" style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>Messaging</p>
            <h1 style={styles.title}>Messaging Workspace</h1>
          </div>
          <div style={styles.statusPill}>{connectionState}</div>
        </header>

        <div className="chat-layout" style={styles.layout}>
          <aside style={{ ...styles.panel, ...styles.sidebar }}>
            <section style={styles.block}>
              <p style={styles.sectionTitle}>Workspace</p>
              <div style={styles.badgeRow}>
                <span style={styles.badge}>{user?.username || 'anonymous'}</span>
                <span style={styles.badge}>{statusMessage}</span>
              </div>
            </section>

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
                placeholder="Search by username or name"
              />
              {buddySearchState === 'loading' ? <p style={styles.helperText}>Searching users...</p> : null}
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
                        <div style={styles.listMeta}>@ {result.username}</div>
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
              <button type="button" style={styles.listButton} onClick={() => setActiveChat(GENERAL_CHAT)}>
                <span style={styles.listTitle}># General</span>
                <span style={styles.listMeta}>Always available</span>
              </button>
              {bootstrap.friends.length ? bootstrap.friends.map((friendName) => (
                <button key={friendName} type="button" style={styles.listButton} onClick={() => selectFriend(friendName)}>
                  <span style={styles.listTitle}>@ {friendName}</span>
                  <span style={styles.listMeta}>{onlineUsers.includes(friendName) ? 'Online now' : 'Offline'}</span>
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
                <h2 style={styles.threadName}>{activeChat.type === 'dm' ? `@ ${activeChat.label || activeChat.name}` : `# ${activeChat.label || activeChat.name}`}</h2>
                <p style={styles.threadMeta}>
                  {activeChat.type === 'dm'
                    ? 'Direct messaging is available for connected buddies.'
                    : selectedGroup?.description || 'General channel for everyone in the workspace.'}
                </p>
              </div>

              {selectedGroup ? (
                <div style={styles.actionsRow}>
                  <button type="button" style={styles.secondaryButton} onClick={openWhatsAppShare}>Share To WhatsApp</button>
                  <button type="button" style={styles.secondaryButton} onClick={() => navigator.clipboard?.writeText(selectedGroup.shareToken)}>Copy Token</button>
                </div>
              ) : null}
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
                    <div style={styles.messageMeta}>
                      <span>{message.user}</span>
                      <span>{new Date(message.timestamp || Date.now()).toLocaleString()}</span>
                      <span>{message.chat?.type === 'dm' ? 'Direct' : 'Group'}</span>
                    </div>
                    <div style={styles.messageText}>{message.text || message.gif || ''}</div>
                  </div>
                </div>
              )) : (
                <div style={styles.empty}>
                  Start the thread. Group access, subgroup visibility, and image discussions all feed into this timeline.
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
                  placeholder={activeChat.type === 'dm' ? `Message ${activeChat.name}` : `Message ${activeChat.name}`}
                />
                <button type="submit" style={styles.primaryButton}>Send</button>
              </div>
              <p style={styles.helperText}>
                {activeChat.type === 'dm'
                  ? 'Direct messages require an accepted buddy connection.'
                  : selectedGroup
                    ? 'Posting inside custom groups follows the group visibility and posting rules.'
                    : 'General chat is open to everyone.'}
              </p>
            </form>
          </section>
        </div>
      </div>

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