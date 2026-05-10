import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import io from 'socket.io-client';
import { useTheme } from '../lib/ThemePicker';

let socket = null;

function sameChat(left, right) {
  if (!left || !right) return false;
  if (left.type !== right.type) return false;
  if (left.id && right.id) return left.id === right.id;
  return left.name === right.name;
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

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function createStyles(theme) {
  return {
    root: {
      height: '100vh',
      display: 'flex',
      background: theme.pageBg,
      color: theme.textPrimary,
      fontFamily: theme.font,
      overflow: 'hidden',
    },
    sidebar: {
      width: '244px',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: theme.panelBg,
      borderRight: `1px solid ${theme.cardBorder}`,
      overflow: 'hidden',
      zIndex: 30,
    },
    sidebarHeader: {
      padding: '10px 12px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      flexShrink: 0,
    },
    sidebarAvatar: {
      width: '30px',
      height: '30px',
      borderRadius: '10px',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      color: '#fff',
      fontWeight: 800,
      fontSize: '12px',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    },
    sidebarUsername: {
      flex: 1,
      fontSize: '12px',
      fontWeight: 800,
      color: theme.textHeading,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    sidebarSearch: {
      padding: '7px 10px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      flexShrink: 0,
    },
    sidebarSearchInput: {
      width: '100%',
      borderRadius: '16px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '6px 10px',
      fontSize: '12px',
      outline: 'none',
      fontFamily: theme.font,
      boxSizing: 'border-box',
    },
    sidebarScroll: {
      flex: 1,
      overflowY: 'auto',
      paddingBottom: '4px',
    },
    sidebarSectionLabel: {
      padding: '7px 12px 4px',
      fontSize: '10px',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      fontWeight: 800,
      color: theme.textMuted,
    },
    sidebarItem: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '7px 12px',
      border: 'none',
      background: 'none',
      cursor: 'pointer',
      textAlign: 'left',
      color: theme.textPrimary,
      fontFamily: theme.font,
    },
    sidebarItemActive: {
      background: theme.cardBg,
    },
    sidebarItemAvatar: {
      width: '30px',
      height: '30px',
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontWeight: 800,
      fontSize: '11px',
      flexShrink: 0,
    },
    sidebarItemText: {
      flex: 1,
      minWidth: 0,
    },
    sidebarItemName: {
      fontSize: '12px',
      fontWeight: 700,
      color: theme.textHeading,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    sidebarItemMeta: {
      fontSize: '10px',
      color: theme.textMuted,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    sidebarUnread: {
      minWidth: '18px',
      height: '18px',
      padding: '0 5px',
      borderRadius: '999px',
      background: theme.orange,
      color: '#fff',
      fontSize: '10px',
      fontWeight: 800,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    },
    onlineDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: theme.green,
      flexShrink: 0,
    },
    offlineDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: theme.textMuted,
      flexShrink: 0,
    },
    sidebarActions: {
      padding: '8px 10px',
      borderTop: `1px solid ${theme.cardBorder}`,
      display: 'flex',
      gap: '8px',
      flexShrink: 0,
    },
    sidebarActionBtn: {
      flex: 1,
      padding: '7px',
      borderRadius: '10px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: '15px',
      display: 'grid',
      placeItems: 'center',
      fontFamily: theme.font,
    },
    sidebarActionBtnActive: {
      background: `${theme.blue}22`,
      border: `1px solid ${theme.blue}`,
    },
    expansionPanel: {
      padding: '12px 14px',
      borderTop: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: '8px',
      maxHeight: '280px',
      overflowY: 'auto',
    },
    main: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      overflow: 'hidden',
    },
    topBar: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '9px 12px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      flexShrink: 0,
    },
    hamburger: {
      width: '30px',
      height: '30px',
      borderRadius: '10px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textPrimary,
      cursor: 'pointer',
      fontSize: '14px',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    },
    topBarTitle: {
      flex: 1,
      minWidth: 0,
    },
    chatName: {
      fontSize: '14px',
      fontWeight: 800,
      color: theme.textHeading,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      margin: 0,
    },
    chatMeta: {
      fontSize: '10px',
      color: theme.textMuted,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      margin: 0,
    },
    topBarIcons: {
      display: 'flex',
      gap: '3px',
      alignItems: 'center',
      flexShrink: 0,
    },
    iconBtn: {
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: '12px',
      display: 'grid',
      placeItems: 'center',
      fontFamily: theme.font,
    },
    iconBtnActive: {
      background: theme.blue,
      color: '#fff',
      border: `1px solid ${theme.blue}`,
    },
    connDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      flexShrink: 0,
    },
    body: {
      flex: 1,
      display: 'flex',
      minHeight: 0,
      overflow: 'hidden',
    },
    messages: {
      flex: 1,
      overflowY: 'auto',
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    msgRow: {
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-end',
    },
    msgRowOwn: {
      flexDirection: 'row-reverse',
      alignSelf: 'flex-end',
      maxWidth: '76%',
    },
    msgRowOther: {
      alignSelf: 'flex-start',
      maxWidth: '76%',
    },
    msgAvatar: {
      width: '28px',
      height: '28px',
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      color: '#fff',
      fontWeight: 800,
      fontSize: '11px',
      flexShrink: 0,
      marginBottom: '20px',
    },
    msgBubbleOwn: {
      padding: '9px 13px',
      borderRadius: '18px 18px 4px 18px',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      color: '#fff',
      wordBreak: 'break-word',
    },
    msgBubbleOther: {
      padding: '9px 13px',
      borderRadius: '18px 18px 18px 4px',
      background: theme.cardBg,
      color: theme.textPrimary,
      border: `1px solid ${theme.cardBorder}`,
      wordBreak: 'break-word',
    },
    msgText: {
      fontSize: '14px',
      lineHeight: 1.5,
      whiteSpace: 'pre-wrap',
    },
    replyQuote: {
      borderLeft: `3px solid rgba(255,255,255,0.5)`,
      padding: '4px 8px',
      marginBottom: '6px',
      fontSize: '11px',
      opacity: 0.8,
      borderRadius: '0 6px 6px 0',
    },
    replyQuoteOther: {
      borderLeft: `3px solid ${theme.blue}`,
      padding: '4px 8px',
      marginBottom: '6px',
      fontSize: '11px',
      color: theme.textMuted,
      background: `${theme.blue}11`,
      borderRadius: '0 6px 6px 0',
    },
    inlineReplyBox: {
      marginTop: '8px',
      padding: '8px',
      borderRadius: '12px',
      border: `1px solid ${theme.cardBorder}`,
      background: `${theme.blue}11`,
      display: 'grid',
      gap: '7px',
    },
    tinyTextarea: {
      width: '100%',
      borderRadius: '10px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '7px 10px',
      fontSize: '12px',
      outline: 'none',
      fontFamily: theme.font,
      resize: 'vertical',
      minHeight: '52px',
      boxSizing: 'border-box',
    },
    tinyBtnRow: {
      display: 'flex',
      gap: '6px',
      justifyContent: 'flex-end',
    },
    tinyBtn: {
      padding: '5px 10px',
      borderRadius: '8px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: theme.font,
    },
    tinyBtnPrimary: {
      background: theme.blue,
      color: '#fff',
      border: `1px solid ${theme.blue}`,
    },
    typingBar: {
      padding: '0 14px 4px',
      color: theme.textMuted,
      fontSize: '11px',
      flexShrink: 0,
      minHeight: '20px',
    },
    composer: {
      borderTop: `1px solid ${theme.cardBorder}`,
      padding: '10px 12px',
      background: theme.panelBg,
      display: 'flex',
      gap: '8px',
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    composerInput: {
      flex: 1,
      borderRadius: '20px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '10px 16px',
      fontSize: '14px',
      outline: 'none',
      fontFamily: theme.font,
      resize: 'none',
      lineHeight: 1.5,
      overflowY: 'auto',
    },
    sendBtn: {
      width: '42px',
      height: '42px',
      borderRadius: '14px',
      border: 'none',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      color: '#fff',
      cursor: 'pointer',
      fontSize: '18px',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    },
    sidePanel: {
      width: '280px',
      flexShrink: 0,
      borderLeft: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    sidePanelHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      flexShrink: 0,
    },
    sidePanelTitle: {
      fontSize: '12px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: theme.textMuted,
      margin: 0,
    },
    sidePanelClose: {
      width: '26px',
      height: '26px',
      borderRadius: '8px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      cursor: 'pointer',
      fontSize: '14px',
      display: 'grid',
      placeItems: 'center',
      fontFamily: theme.font,
    },
    sidePanelContent: {
      flex: 1,
      overflowY: 'auto',
      padding: '12px 14px',
      display: 'grid',
      gap: '12px',
      alignContent: 'start',
    },
    formRow: {
      display: 'grid',
      gap: '8px',
    },
    label: {
      fontSize: '11px',
      fontWeight: 700,
      color: theme.textMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    },
    input: {
      width: '100%',
      borderRadius: '12px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '8px 12px',
      fontSize: '13px',
      outline: 'none',
      fontFamily: theme.font,
      boxSizing: 'border-box',
    },
    panelTextarea: {
      width: '100%',
      borderRadius: '12px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '8px 12px',
      fontSize: '13px',
      outline: 'none',
      fontFamily: theme.font,
      resize: 'vertical',
      minHeight: '72px',
      boxSizing: 'border-box',
    },
    select: {
      width: '100%',
      borderRadius: '12px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      color: theme.textPrimary,
      padding: '8px 12px',
      fontSize: '13px',
      outline: 'none',
      fontFamily: theme.font,
    },
    btn: {
      width: '100%',
      padding: '9px 12px',
      borderRadius: '12px',
      border: 'none',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      color: '#fff',
      cursor: 'pointer',
      fontSize: '12px',
      fontWeight: 800,
      fontFamily: theme.font,
    },
    btnSecondary: {
      background: theme.cardBg,
      color: theme.textPrimary,
      border: `1px solid ${theme.cardBorder}`,
    },
    helperText: {
      fontSize: '11px',
      color: theme.textMuted,
      lineHeight: 1.5,
      margin: 0,
    },
    sectionTitle: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: theme.textMuted,
      margin: 0,
    },
    badge: {
      padding: '3px 7px',
      borderRadius: '999px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textMuted,
      fontSize: '10px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    },
    badgeRow: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
    },
    listItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 10px',
      borderRadius: '12px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
    },
    listItemText: {
      flex: 1,
      minWidth: 0,
    },
    listItemTitle: {
      fontSize: '13px',
      fontWeight: 700,
      color: theme.textHeading,
    },
    listItemMeta: {
      fontSize: '11px',
      color: theme.textMuted,
    },
    emptyState: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      textAlign: 'center',
      padding: '24px',
      color: theme.textMuted,
    },
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      zIndex: 20,
    },
    toastStack: {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      display: 'grid',
      gap: '8px',
      zIndex: 100,
      width: 'min(320px, calc(100vw - 24px))',
    },
    toast: {
      padding: '12px 14px',
      borderRadius: '16px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      boxShadow: `0 8px 24px ${theme.shadow}`,
    },
    toastTitle: {
      fontSize: '12px',
      fontWeight: 800,
      color: theme.textHeading,
      margin: 0,
    },
    toastBody: {
      fontSize: '11px',
      color: theme.textMuted,
      margin: '3px 0 0',
      lineHeight: 1.4,
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
  const [showSidebar, setShowSidebar] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState('');
  const [sidebarPanel, setSidebarPanel] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState('');

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const inviteHandledRef = useRef(false);
  const activeChatRef = useRef(null);
  const previousChatKeyRef = useRef('');
  const previousMessageCountRef = useRef(0);
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

  const filteredFriends = useMemo(() => {
    if (!sidebarFilter.trim()) return bootstrap.friends;
    const q = sidebarFilter.toLowerCase();
    return bootstrap.friends.filter((f) => f.toLowerCase().includes(q));
  }, [bootstrap.friends, sidebarFilter]);

  const filteredGroups = useMemo(() => {
    if (!sidebarFilter.trim()) return flattenedGroups;
    const q = sidebarFilter.toLowerCase();
    return flattenedGroups.filter(({ group }) => group.name.toLowerCase().includes(q));
  }, [flattenedGroups, sidebarFilter]);

  const onlineUserSet = useMemo(
    () => new Set((onlineUsers || []).map((name) => normalizeUsername(name)).filter(Boolean)),
    [onlineUsers],
  );

  const isUserOnline = useCallback((username) => onlineUserSet.has(normalizeUsername(username)), [onlineUserSet]);

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
    const activeChatCandidate = nextChat || activeChatRef.current;

    if (nextChat) {
      activeChatRef.current = nextChat;
      setActiveChat(nextChat);
      return;
    }

    if (!activeChatCandidate) {
      setActiveChat(fallbackChat);
      return;
    }

    if (activeChatCandidate.type === 'dm') {
      if (!nextBootstrap.friends.includes(activeChatCandidate.name)) {
        setActiveChat(fallbackChat);
      }
      return;
    }

    const matchingGroup = nextBootstrap.groups.find((group) => (
      group.id === activeChatCandidate.id || group.name === activeChatCandidate.name
    ));
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

  async function copyText(text) {
    const value = String(text || '').trim();
    if (!value) throw new Error('Nothing to copy.');

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) {
        // Fallback to legacy copy below.
      }
    }

    if (typeof document === 'undefined') {
      throw new Error('Clipboard is unavailable in this environment.');
    }

    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.setAttribute('readonly', 'readonly');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (!copied) {
      throw new Error('Copy failed. Please copy manually.');
    }
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
    activeChatRef.current = nextChat;
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
    const chatKey = getChatKey(activeChat);
    const nextCount = visibleMessages.length;
    const chatChanged = previousChatKeyRef.current !== chatKey;

    if (chatChanged) {
      previousChatKeyRef.current = chatKey;
      previousMessageCountRef.current = nextCount;
      return;
    }

    const previousCount = previousMessageCountRef.current;
    previousMessageCountRef.current = nextCount;
    if (nextCount <= previousCount) return;

    const container = messagesContainerRef.current;
    if (!container) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom <= 120;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat, visibleMessages]);

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
    const inviteUrl = new URL(`/join-group/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString();
    const message = `${inviteUrl}\n\nJoin ${selectedGroup.name} on Cosmix`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  const canPostToGroup = selectedMembership?.canPost;
  const canInviteToGroup = selectedMembership?.canInvite;
  const canCommentInGroup = selectedMembership?.canComment;
  const isGroupOwner = selectedMembership?.role === 'owner';
  const canManageFolders = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsCreateFolders;
  const canBookmarkMessages = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsBookmarkMessages;

  // ── panel render helpers ────────────────────────────────────────────────
  function renderMembersPanel() {
    return (
      <>
        <div style={styles.badgeRow}>
          {selectedGroup.memberships.map((m) => (
            <span key={`${selectedGroup.id}-${m.username}`} style={styles.badge}>
              {m.username} · {m.role}
            </span>
          ))}
        </div>
        {canInviteToGroup ? (
          <form style={styles.formRow} onSubmit={handleUpdateVisibility}>
            <p style={styles.label}>Update Members</p>
            <input style={styles.input} value={visibilityForm.members} onChange={(e) => setVisibilityForm((p) => ({ ...p, members: e.target.value }))} placeholder="Members (comma separated)" />
            <input style={styles.input} value={visibilityForm.viewers} onChange={(e) => setVisibilityForm((p) => ({ ...p, viewers: e.target.value }))} placeholder="Viewers (comma separated)" />
            <button type="submit" style={styles.btn}>Save</button>
          </form>
        ) : <p style={styles.helperText}>Only users with invite permission can change visibility.</p>}
        {childGroups.length > 0 && (
          <div style={styles.formRow}>
            <p style={styles.label}>Subgroups</p>
            {childGroups.map((g) => (
              <button key={g.id} type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => { selectGroup(g); setActivePanelTab(''); }}>
                ↳ {g.name}
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderFoldersPanel() {
    return (
      <>
        {canManageFolders ? (
          <form style={styles.formRow} onSubmit={handleCreateFolder}>
            <p style={styles.label}>Create Folder</p>
            <input style={styles.input} value={folderForm.name} onChange={(e) => setFolderForm((p) => ({ ...p, name: e.target.value }))} placeholder="Folder name" />
            <input style={styles.input} value={folderForm.description} onChange={(e) => setFolderForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" />
            <button type="submit" style={styles.btn}>Create</button>
          </form>
        ) : <p style={styles.helperText}>Only admins/owner can create folders.</p>}
        {(selectedGroup.folders || []).length ? (
          <div style={styles.formRow}>
            <p style={styles.label}>Folders ({selectedGroup.folders.length})</p>
            {selectedGroup.folders.map((folder) => (
              <div key={folder.id} style={styles.listItem}>
                <div style={styles.listItemText}>
                  <div style={styles.listItemTitle}>📁 {folder.name}</div>
                  <div style={styles.listItemMeta}>{folder.description || 'No description'} · {folder.items.length} items</div>
                </div>
              </div>
            ))}
          </div>
        ) : <p style={styles.helperText}>No folders yet.</p>}
      </>
    );
  }

  function renderBookmarksPanel() {
    return (
      <>
        <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => setShowBookmarkedOnly((v) => !v)}>
          {showBookmarkedOnly ? '📨 Show All Messages' : '🔖 Show Bookmarked Only'}
        </button>
        {(selectedGroup.bookmarks || []).length ? (
          <div style={styles.formRow}>
            <p style={styles.label}>Bookmarks ({selectedGroup.bookmarks.length})</p>
            {selectedGroup.bookmarks.map((bookmark) => (
              <div key={bookmark.id} style={styles.listItem}>
                <div style={styles.listItemText}>
                  <div style={styles.listItemMeta}>by {bookmark.bookmarkedBy}</div>
                  <div style={styles.listItemTitle}>Msg {String(bookmark.messageId || '').slice(0, 8)}…</div>
                  {bookmark.note ? <div style={styles.helperText}>{bookmark.note}</div> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p style={styles.helperText}>No bookmarks yet. Tap 🔖 on a message.</p>}
      </>
    );
  }

  function renderMediaPanel() {
    return (
      <>
        <div style={styles.formRow}>
          <p style={styles.label}>Upload Image</p>
          <input style={styles.input} value={imageCaption} onChange={(e) => setImageCaption(e.target.value)} placeholder="Optional caption" />
          <button type="button" style={{ ...styles.btn, ...styles.btnSecondary }} onClick={() => fileInputRef.current?.click()} disabled={!canPostToGroup}>
            📎 Choose Image
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGroupImageUpload} />
          <p style={styles.helperText}>{selectedGroup.images.length} images in this group</p>
        </div>
        {selectedGroup.images.length > 0 && (
          <div style={{ display: 'grid', gap: '10px' }}>
            {selectedGroup.images.map((image) => (
              <div key={image.id} style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
                <img src={image.imageUrl} alt={image.caption || ''} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '8px 10px' }}>
                  <div style={styles.listItemTitle}>{image.caption || 'Untitled'}</div>
                  <div style={styles.listItemMeta}>by {image.uploadedBy}</div>
                  {canCommentInGroup ? (
                    <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                      <input style={styles.input} value={commentDrafts[image.id] || ''} onChange={(e) => setCommentDrafts((p) => ({ ...p, [image.id]: e.target.value }))} placeholder="Add comment…" />
                      <button type="button" style={styles.btn} onClick={() => handleImageComment(image.id)}>Post</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  function renderInvitePanel() {
    const inviteUrl = selectedGroup?.shareToken && typeof window !== 'undefined'
      ? new URL(`/join-group/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString()
      : '';
    return (
      <>
        {inviteUrl && (
          <div style={styles.formRow}>
            <p style={styles.label}>Invite Link</p>
            <div style={{ ...styles.listItem, wordBreak: 'break-all' }}>
              <a href={inviteUrl} target="_blank" rel="noreferrer" style={{ ...styles.listItemMeta, fontSize: '11px', color: theme.blue }}>
                {inviteUrl}
              </a>
            </div>
            <button
              type="button"
              style={styles.btn}
              onClick={async () => {
                try {
                  await copyText(inviteUrl);
                  reportStatus('Link copied!');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              📋 Copy Link
            </button>
            <button type="button" style={{ ...styles.btn, background: '#25D366', border: 'none', color: '#fff' }} onClick={openWhatsAppShare}>
              💬 Share on WhatsApp
            </button>
          </div>
        )}
      </>
    );
  }

  function renderSettingsPanel() {
    return isGroupOwner ? (
      <>
        <form style={styles.formRow} onSubmit={handleSaveGroupSettings}>
          <p style={styles.label}>Group Settings</p>
          <label style={styles.helperText}>
            <input type="checkbox" checked={groupSettingsForm.allowJoinByLink} onChange={(e) => setGroupSettingsForm((p) => ({ ...p, allowJoinByLink: e.target.checked }))} />
            {' '}Allow join by link
          </label>
          <input style={styles.input} type="number" value={groupSettingsForm.clearMessagesAfterHours} onChange={(e) => setGroupSettingsForm((p) => ({ ...p, clearMessagesAfterHours: e.target.value }))} placeholder="Auto-clear after N hours (empty = never)" />
          <label style={styles.helperText}>
            <input type="checkbox" checked={groupSettingsForm.onlyAdminsCreateFolders} onChange={(e) => setGroupSettingsForm((p) => ({ ...p, onlyAdminsCreateFolders: e.target.checked }))} />
            {' '}Only admins create folders
          </label>
          <label style={styles.helperText}>
            <input type="checkbox" checked={groupSettingsForm.onlyAdminsBookmarkMessages} onChange={(e) => setGroupSettingsForm((p) => ({ ...p, onlyAdminsBookmarkMessages: e.target.checked }))} />
            {' '}Only admins bookmark
          </label>
          <button type="submit" style={styles.btn}>Save Settings</button>
        </form>
        <form style={styles.formRow} onSubmit={handleUpdateMemberSecurity}>
          <p style={styles.label}>Member Permissions</p>
          <input style={styles.input} value={memberSecurityForm.username} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, username: e.target.value }))} placeholder="Username to update" />
          <select style={styles.select} value={memberSecurityForm.role} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, role: e.target.value }))}>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canView} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, canView: e.target.checked }))} /> View</label>
            <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canPost} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, canPost: e.target.checked }))} /> Post</label>
            <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canComment} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, canComment: e.target.checked }))} /> Comment</label>
            <label style={styles.helperText}><input type="checkbox" checked={memberSecurityForm.canInvite} onChange={(e) => setMemberSecurityForm((p) => ({ ...p, canInvite: e.target.checked }))} /> Invite</label>
          </div>
          <button type="submit" style={{ ...styles.btn, ...styles.btnSecondary }}>Update Member</button>
        </form>
      </>
    ) : <p style={styles.helperText}>Only the group owner can manage settings.</p>;
  }

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div style={styles.root}>
      {/* Mobile backdrop */}
      {showSidebar && <div style={styles.backdrop} className="sidebar-backdrop" onClick={() => setShowSidebar(false)} />}

      {/* Sidebar */}
      <aside className={`chat-sidebar${showSidebar ? ' chat-sidebar--open' : ''}`} style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarAvatar}>{(user?.username || '?').slice(0, 2).toUpperCase()}</div>
          <span style={styles.sidebarUsername}>{user?.username || 'Loading…'}</span>
          <div style={{ ...styles.connDot, background: connectionState === 'connected' ? theme.green : connectionState === 'connecting' ? theme.orange : theme.red }} title={connectionState} />
        </div>

        <div style={styles.sidebarSearch}>
          <input style={styles.sidebarSearchInput} placeholder="Search chats…" value={sidebarFilter} onChange={(e) => setSidebarFilter(e.target.value)} />
        </div>

        <div style={styles.sidebarScroll}>
          {bootstrap.incomingRequests.length > 0 && (
            <>
              <p style={styles.sidebarSectionLabel}>Requests ({bootstrap.incomingRequests.length})</p>
              {bootstrap.incomingRequests.map((entry) => (
                <div key={entry} style={{ ...styles.sidebarItem, gap: '8px' }}>
                  <div style={{ ...styles.sidebarItemAvatar, background: getUserColor(entry, theme) }}>{entry.slice(0, 2).toUpperCase()}</div>
                  <div style={styles.sidebarItemText}>
                    <div style={styles.sidebarItemName}>{entry}</div>
                    <div style={styles.sidebarItemMeta}>Buddy request</div>
                  </div>
                  <button type="button" style={{ ...styles.tinyBtn, ...styles.tinyBtnPrimary }} onClick={() => handleAcceptBuddy(entry)}>✓</button>
                </div>
              ))}
            </>
          )}

          {filteredFriends.length > 0 && (
            <>
              <p style={styles.sidebarSectionLabel}>Direct Messages</p>
              {filteredFriends.map((friendName) => {
                const chatKey = getChatKey({ type: 'dm', id: buildDmId(user?.username || '', friendName) });
                const isActive = activeChat?.type === 'dm' && activeChat?.name === friendName;
                return (
                  <button key={friendName} type="button" className="sidebar-item" style={{ ...styles.sidebarItem, ...(isActive ? styles.sidebarItemActive : {}) }} onClick={() => { selectFriend(friendName); setShowSidebar(false); }}>
                    <div style={{ ...styles.sidebarItemAvatar, background: getUserColor(friendName, theme) }}>{friendName.slice(0, 2).toUpperCase()}</div>
                    <div style={styles.sidebarItemText}>
                      <div style={styles.sidebarItemName}>{friendName}</div>
                      <div style={styles.sidebarItemMeta}>{isUserOnline(friendName) ? 'Online' : 'Offline'}</div>
                    </div>
                    <div style={isUserOnline(friendName) ? styles.onlineDot : styles.offlineDot} />
                    {unreadCounts[chatKey] ? <span style={styles.sidebarUnread}>{unreadCounts[chatKey]}</span> : null}
                  </button>
                );
              })}
            </>
          )}

          {filteredGroups.length > 0 && (
            <>
              <p style={styles.sidebarSectionLabel}>Groups</p>
              {filteredGroups.map(({ group, depth }) => {
                const chatKey = getChatKey({ type: 'group', id: group.id });
                const isActive = activeChat?.type === 'group' && activeChat?.id === group.id;
                return (
                  <button key={group.id} type="button" className="sidebar-item" style={{ ...styles.sidebarItem, paddingLeft: `${14 + depth * 12}px`, ...(isActive ? styles.sidebarItemActive : {}) }} onClick={() => { selectGroup(group); setShowSidebar(false); }}>
                    <div style={{ ...styles.sidebarItemAvatar, background: getUserColor(group.name, theme), fontSize: '15px' }}>{depth ? '↳' : '#'}</div>
                    <div style={styles.sidebarItemText}>
                      <div style={styles.sidebarItemName}>{group.name}</div>
                      <div style={styles.sidebarItemMeta}>{group.memberships.length} members</div>
                    </div>
                    {unreadCounts[chatKey] ? <span style={styles.sidebarUnread}>{unreadCounts[chatKey]}</span> : null}
                  </button>
                );
              })}
            </>
          )}

          {filteredFriends.length === 0 && filteredGroups.length === 0 && bootstrap.incomingRequests.length === 0 && (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: '12px', lineHeight: 1.7 }}>
              {sidebarFilter ? 'No matches.' : 'No conversations yet.\nUse the buttons below to get started.'}
            </div>
          )}
        </div>

        <div style={styles.sidebarActions}>
          <button type="button" title="Add Buddy" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'buddy' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'buddy' ? '' : 'buddy')}>👤</button>
          <button type="button" title="Create Group" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'group' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'group' ? '' : 'group')}>💬</button>
          <button type="button" title="Join by Token" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'token' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'token' ? '' : 'token')}>🔗</button>
        </div>

        {sidebarPanel === 'buddy' && (
          <div style={styles.expansionPanel}>
            <p style={styles.sectionTitle}>Find & Add Buddy</p>
            <input style={styles.input} value={buddySearch} onChange={(e) => setBuddySearch(e.target.value)} placeholder="Search username…" />
            {buddySearchState === 'loading' && <p style={styles.helperText}>Searching…</p>}
            {buddySearchError && <p style={styles.helperText}>{buddySearchError}</p>}
            {buddySearch.trim() && buddySearchState === 'done' && buddyResults.length === 0 && <p style={styles.helperText}>No users found.</p>}
            {buddyResults.map((result) => {
              const isBuddy = bootstrap.friends.includes(result.username);
              const isPending = bootstrap.outgoingRequests.includes(result.username);
              return (
                <div key={result.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: theme.textHeading }}>{result.name || result.username}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>@{result.username}</div>
                  </div>
                  <button type="button" style={{ ...styles.tinyBtn, ...(isBuddy || isPending ? {} : styles.tinyBtnPrimary) }} disabled={isBuddy || isPending} onClick={() => handleBuddyRequest(result.username)}>
                    {isBuddy ? '✓' : isPending ? '⏳' : '+Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {sidebarPanel === 'group' && (
          <form style={styles.expansionPanel} onSubmit={handleCreateGroup}>
            <p style={styles.sectionTitle}>Create Group</p>
            <input style={styles.input} value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} placeholder="Group name" />
            <textarea style={{ ...styles.input, minHeight: '52px', resize: 'vertical' }} value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description (optional)" />
            <select style={styles.select} value={groupForm.parentGroupId} onChange={(e) => setGroupForm((p) => ({ ...p, parentGroupId: e.target.value }))}>
              <option value="">Top-level group</option>
              {bootstrap.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input style={styles.input} value={groupForm.members} onChange={(e) => setGroupForm((p) => ({ ...p, members: e.target.value }))} placeholder="Members (comma separated)" />
            <input style={styles.input} value={groupForm.viewers} onChange={(e) => setGroupForm((p) => ({ ...p, viewers: e.target.value }))} placeholder="Viewers (comma separated)" />
            <button type="submit" style={styles.btn}>Create Group</button>
          </form>
        )}

        {sidebarPanel === 'token' && (
          <form style={styles.expansionPanel} onSubmit={handleJoinByToken}>
            <p style={styles.sectionTitle}>Join by Token</p>
            <input style={styles.input} value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Paste group token" />
            <button type="submit" style={styles.btn}>Join Group</button>
          </form>
        )}
      </aside>

      {/* Main chat area */}
      <main style={styles.main}>
        {/* Top bar */}
        <div style={styles.topBar}>
          <button type="button" className="hamburger-btn" style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
          <div style={styles.topBarTitle}>
            <h2 style={styles.chatName}>
              {activeChat
                ? activeChat.type === 'dm'
                  ? `@${activeChat.label || activeChat.name}`
                  : `#${activeChat.label || activeChat.name}`
                : 'Cosmix Chat'}
            </h2>
            {activeChat && (
              <p style={styles.chatMeta}>
                {activeChat.type === 'dm'
                  ? (isUserOnline(activeChat.name) ? 'Online' : 'Offline')
                  : (selectedGroup?.description || `${selectedGroup?.memberships?.length || 0} members`)}
              </p>
            )}
          </div>
          <div style={styles.topBarIcons}>
            <button type="button" title="Dashboard" style={styles.iconBtn} onClick={() => router.push('/dashboard')}>🏠</button>
            <div style={{ ...styles.connDot, background: connectionState === 'connected' ? theme.green : connectionState === 'connecting' ? theme.orange : theme.red }} title={connectionState} />
            {selectedGroup && (
              <>
                <button type="button" title="Members" style={{ ...styles.iconBtn, ...(activePanelTab === 'members' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'members' ? '' : 'members')}>👥</button>
                <button type="button" title="Folders" style={{ ...styles.iconBtn, ...(activePanelTab === 'folders' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'folders' ? '' : 'folders')}>📁</button>
                <button type="button" title="Bookmarks" style={{ ...styles.iconBtn, ...(activePanelTab === 'bookmarks' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'bookmarks' ? '' : 'bookmarks')}>🔖</button>
                <button type="button" title="Media" style={{ ...styles.iconBtn, ...(activePanelTab === 'media' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'media' ? '' : 'media')}>🖼️</button>
                <button type="button" title="Invite" style={{ ...styles.iconBtn, ...(activePanelTab === 'invite' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'invite' ? '' : 'invite')}>🔗</button>
                {isGroupOwner && <button type="button" title="Settings" style={{ ...styles.iconBtn, ...(activePanelTab === 'settings' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'settings' ? '' : 'settings')}>⚙️</button>}
              </>
            )}
          </div>
        </div>

        {/* Body: messages + optional side panel */}
        <div style={styles.body}>
          {/* Messages */}
          <div ref={messagesContainerRef} style={styles.messages}>
            {visibleMessages.length ? visibleMessages.map((message) => {
              const isOwn = message.user === user?.username;
              const parsed = parseReplyEnvelope(message.text || message.gif || '');
              return (
                <div key={message.id || `${message.user}-${message.timestamp}`} className="msg-group" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ ...styles.msgRow, ...(isOwn ? styles.msgRowOwn : styles.msgRowOther) }}>
                    {!isOwn && (
                      <div style={{ ...styles.msgAvatar, background: getUserColor(message.user || 'user', theme) }}>
                        {(message.user || 'U').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', ...(isOwn ? { alignItems: 'flex-end' } : {}) }}>
                      {!isOwn && <span style={{ fontSize: '11px', fontWeight: 800, color: getUserColor(message.user || 'user', theme), paddingLeft: '2px' }}>{message.user}</span>}
                      <div style={isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther}>
                        {parsed.replyToMessageId && (
                          <div style={isOwn ? styles.replyQuote : styles.replyQuoteOther}>↩ Reply to {parsed.replyToUser}</div>
                        )}
                        <div style={styles.msgText}>{parsed.body || (message.text || message.gif || '')}</div>
                        {activeReplyMessageId === message.id && (
                          <div style={styles.inlineReplyBox}>
                            <div style={styles.replyQuoteOther}>Replying to {message.user}</div>
                            <textarea style={styles.tinyTextarea} value={replyDrafts[message.id] || ''} onChange={(e) => handleReplyDraftChange(message.id, e.target.value)} placeholder="Write reply…" autoFocus />
                            <div style={styles.tinyBtnRow}>
                              <button type="button" style={styles.tinyBtn} onClick={() => setActiveReplyMessageId('')}>Cancel</button>
                              <button type="button" style={{ ...styles.tinyBtn, ...styles.tinyBtnPrimary }} onClick={() => handleSendInlineReply(message)}>Send</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', ...(isOwn ? { justifyContent: 'flex-end' } : {}) }}>
                        <span style={{ fontSize: '10px', color: theme.textMuted }}>
                          {new Date(message.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="msg-actions" style={{ display: 'flex', gap: '3px' }}>
                          <button type="button" className="msg-action-btn" style={{ width: '22px', height: '22px', borderRadius: '7px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px', display: 'grid', placeItems: 'center', fontFamily: theme.font }} title="Reply" onClick={() => toggleReplyBox(message.id)}>↩</button>
                          {selectedGroup && canBookmarkMessages && (
                            <button type="button" className="msg-action-btn" style={{ width: '22px', height: '22px', borderRadius: '7px', border: `1px solid ${bookmarkedMessageIds.has(message.id) ? theme.orange : theme.cardBorder}`, background: theme.panelBg, color: bookmarkedMessageIds.has(message.id) ? theme.orange : theme.textSecondary, cursor: 'pointer', fontSize: '11px', display: 'grid', placeItems: 'center', fontFamily: theme.font }} title={bookmarkedMessageIds.has(message.id) ? 'Bookmarked' : 'Bookmark'} onClick={() => handleBookmarkMessage(message.id)}>🔖</button>
                          )}
                          {selectedGroup && (selectedGroup.folders || []).length > 0 && (
                            <button type="button" className="msg-action-btn" style={{ width: '22px', height: '22px', borderRadius: '7px', border: `1px solid ${theme.cardBorder}`, background: theme.panelBg, color: theme.textSecondary, cursor: 'pointer', fontSize: '11px', display: 'grid', placeItems: 'center', fontFamily: theme.font }} title="Save to folder" onClick={() => handleSaveMessageToFolder(message.id)}>📁</button>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div style={styles.emptyState}>
                <div style={{ fontSize: '40px', opacity: 0.35 }}>{activeChat ? '💬' : '🌐'}</div>
                <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                  {activeChat ? 'No messages yet — say hello! 👋' : 'Select a buddy or group to start chatting'}
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Side panel */}
          {activePanelTab && selectedGroup && (
            <div className="side-panel" style={styles.sidePanel}>
              <div style={styles.sidePanelHeader}>
                <p style={styles.sidePanelTitle}>
                  {activePanelTab === 'members' ? '👥 Members' : activePanelTab === 'folders' ? '📁 Folders' : activePanelTab === 'bookmarks' ? '🔖 Bookmarks' : activePanelTab === 'media' ? '🖼️ Media' : activePanelTab === 'invite' ? '🔗 Invite' : '⚙️ Settings'}
                </p>
                <button type="button" style={styles.sidePanelClose} onClick={() => setActivePanelTab('')}>✕</button>
              </div>
              <div style={styles.sidePanelContent}>
                {activePanelTab === 'members' && renderMembersPanel()}
                {activePanelTab === 'folders' && renderFoldersPanel()}
                {activePanelTab === 'bookmarks' && renderBookmarksPanel()}
                {activePanelTab === 'media' && renderMediaPanel()}
                {activePanelTab === 'invite' && renderInvitePanel()}
                {activePanelTab === 'settings' && renderSettingsPanel()}
              </div>
            </div>
          )}
        </div>

        {/* Typing bar */}
        <div style={styles.typingBar}>
          {typingUsers.length ? `${typingUsers.join(', ')} is typing…` : ''}
        </div>

        {/* Composer */}
        <form style={styles.composer} onSubmit={handleSendMessage}>
          <textarea
            ref={composerRef}
            style={styles.composerInput}
            value={composerText}
            onChange={handleComposerChange}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
            placeholder={activeChat ? `Message ${activeChat.name}…` : 'Select a chat to start messaging'}
            disabled={!activeChat}
            rows={1}
          />
          <button type="submit" style={styles.sendBtn} disabled={!activeChat || !composerText.trim()}>➤</button>
        </form>
      </main>

      {/* Toasts */}
      {toasts.length > 0 && (
        <div style={styles.toastStack}>
          {toasts.map((toast) => (
            <div key={toast.id} style={styles.toast}>
              <p style={styles.toastTitle}>{toast.title}</p>
              {toast.body && <p style={styles.toastBody}>{toast.body}</p>}
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        /* Mobile: sidebar slides in from left */
        .chat-sidebar {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          z-index: 30;
          transform: translateX(-260px);
          transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .chat-sidebar--open {
          transform: translateX(0);
          box-shadow: 4px 0 28px rgba(0,0,0,0.28);
        }
        /* Desktop: sidebar always visible, hamburger hidden */
        @media (min-width: 680px) {
          .chat-sidebar {
            position: relative;
            transform: none !important;
            top: auto; left: auto; bottom: auto;
            box-shadow: none !important;
          }
          .sidebar-backdrop { display: none !important; }
          .hamburger-btn { display: none !important; }
        }
        /* Hover effects */
        .sidebar-item:hover {
          background: ${theme.cardBg};
        }
        /* Message action buttons: hidden until hover on desktop, always visible on touch */
        .msg-actions {
          opacity: 0;
          transition: opacity 0.15s;
        }
        .msg-group:hover .msg-actions {
          opacity: 1;
        }
        @media (hover: none) {
          .msg-actions { opacity: 1 !important; }
        }
        /* Side panel: overlay on mobile */
        @media (max-width: 680px) {
          .side-panel {
            position: fixed !important;
            top: 0; right: 0; bottom: 0;
            z-index: 25;
            width: min(300px, 88vw) !important;
            box-shadow: -4px 0 28px rgba(0,0,0,0.25);
          }
        }
      `}</style>
    </div>
  );
}
