import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedClientUser, logoutClientSession, persistClientUser } from '../lib/auth-client';
import { ChatAlbumGallery, buildFolderTree } from '../lib/ChatAlbumGallery';
import { ChatHomeHub } from '../lib/ChatHomeHub';
import { MobileBottomNav } from '../lib/MobileNav';
import { subscribeToWebPush } from '../lib/webPush';
import { CallParticipantStrip, VideoCallPanel } from '../lib/VideoCallPanel';
import { useTheme } from '../lib/ThemePicker';

function resolveChatSocketClient() {
  const sharedOptions = {
    transports: ['polling', 'websocket'],
    reconnectionAttempts: 12,
    reconnectionDelay: 1000,
    timeout: 20000,
  };

  const explicitUrl = String(process.env.NEXT_PUBLIC_CHAT_SOCKET_URL || '').trim();
  if (explicitUrl) {
    return { url: explicitUrl, options: sharedOptions };
  }

  if (typeof window === 'undefined') {
    return {
      url: undefined,
      options: { ...sharedOptions, path: '/chat-socket/socket.io' },
    };
  }

  const { hostname, port, protocol } = window.location;
  const isDevWeb = port === '3005' || port === '';
  const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';
  const isLanIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

  // Local dev: connect straight to chat-service (Next /chat-socket rewrite returns 308 and breaks WS).
  if (isDevWeb && (isLoopback || isLanIp)) {
    const scheme = protocol === 'https:' ? 'https' : 'http';
    return {
      url: `${scheme}://${hostname}:3002`,
      options: sharedOptions,
    };
  }

  return {
    url: undefined,
    options: { ...sharedOptions, path: '/chat-socket/socket.io' },
  };
}

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
  const pair = ['' + left, '' + right]
    .map((value) => value.trim().toLowerCase())
    .sort((a, b) => a.localeCompare(b));
  return `dm:${pair[0]}::${pair[1]}`;
}

function normalizeDmId(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.startsWith('dm:') ? raw : `dm:${raw.replace(/^dm:/, '')}`;
}

function chatMatchesActive(activeChat, messageChat) {
  if (!activeChat || !messageChat || activeChat.type !== messageChat.type) return false;
  if (activeChat.type === 'dm') {
    const activeId = normalizeDmId(activeChat.id);
    const messageId = normalizeDmId(messageChat.id);
    if (activeId && messageId && activeId === messageId) return true;
    return normalizeUsername(activeChat.name) === normalizeUsername(messageChat.name);
  }
  const activeKey = activeChat.id || activeChat.name;
  const messageKey = messageChat.id || messageChat.name;
  return activeKey === messageKey;
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

function createClientMessageId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mergeMessages(previous, incoming) {
  let next = [...previous];
  incoming.forEach((message) => {
    const clientMessageId = String(message?.clientMessageId || '').trim();
    if (clientMessageId) {
      next = next.filter((entry) => entry.id !== clientMessageId && entry.clientMessageId !== clientMessageId);
    }
    const key = message.id || `${message.user}-${message.timestamp}-${message.text || message.gif || ''}`;
    const existingIndex = next.findIndex((entry) => (
      (entry.id || `${entry.user}-${entry.timestamp}-${entry.text || entry.gif || ''}`) === key
    ));
    const normalized = { ...message, pending: false };
    if (existingIndex >= 0) {
      next[existingIndex] = { ...next[existingIndex], ...normalized };
      return;
    }
    next.push(normalized);
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

function buildChatQuery({ chat, panelTab, hubTab, inviteModalOpen }) {
  const query = {};
  if (chat?.type === 'group' && chat.id) {
    query.thread = chat.id;
    if (inviteModalOpen) query.view = 'invite';
    else if (panelTab) query.view = panelTab;
  } else if (chat?.type === 'dm' && chat.name) {
    query.dm = chat.name;
  } else if (hubTab === 'friends') {
    query.tab = 'friends';
  }
  return query;
}

function chatQueriesMatch(left, right) {
  const keys = new Set([...Object.keys(left || {}), ...Object.keys(right || {})]);
  for (const key of keys) {
    if (String(left?.[key] || '') !== String(right?.[key] || '')) return false;
  }
  return true;
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
    threadFolderScroll: {
      flex: 1,
      overflowY: 'auto',
      padding: '14px 12px 20px',
      WebkitOverflowScrolling: 'touch',
    },
    threadFolderHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '10px',
      marginBottom: '14px',
    },
    threadFolderTitle: {
      margin: 0,
      fontSize: '20px',
      fontWeight: 900,
      color: theme.textHeading,
      lineHeight: 1.15,
    },
    threadFolderSubtitle: {
      margin: '6px 0 0',
      fontSize: '12px',
      color: theme.textSecondary,
      lineHeight: 1.5,
    },
    threadFolderGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '12px',
    },
    threadFolderCard: {
      appearance: 'none',
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '18px',
      background: theme.cardBg,
      padding: 0,
      overflow: 'hidden',
      cursor: 'pointer',
      textAlign: 'left',
      color: 'inherit',
      fontFamily: theme.font,
      display: 'grid',
      gridTemplateRows: '88px auto',
      boxShadow: `0 10px 28px ${theme.shadow}`,
    },
    threadFolderCover: {
      minHeight: '88px',
      background: `linear-gradient(135deg, ${theme.blue}, ${theme.purple})`,
      position: 'relative',
      overflow: 'hidden',
    },
    threadFolderBody: {
      padding: '10px 12px 12px',
      display: 'grid',
      gap: '4px',
    },
    threadFolderName: {
      fontSize: '13px',
      fontWeight: 800,
      color: theme.textHeading,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    threadFolderMeta: {
      fontSize: '10px',
      color: theme.textMuted,
      lineHeight: 1.4,
    },
    threadSubStrip: {
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      padding: '8px 12px',
      borderBottom: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      WebkitOverflowScrolling: 'touch',
    },
    threadSubChip: {
      flexShrink: 0,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '999px',
      padding: '7px 12px',
      background: theme.cardBg,
      color: theme.textPrimary,
      fontSize: '11px',
      fontWeight: 700,
      cursor: 'pointer',
      fontFamily: theme.font,
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
    modalBackdrop: {
      position: 'fixed',
      inset: 0,
      zIndex: 1100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      background: 'rgba(8,4,16,0.72)',
      backdropFilter: 'blur(6px)',
    },
    modalPanel: {
      width: 'min(520px, 100%)',
      maxHeight: 'min(88vh, 720px)',
      overflowY: 'auto',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.panelBg,
      padding: '18px 16px',
      boxShadow: `0 24px 48px ${theme.shadow}`,
    },
    modalHead: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '12px',
      marginBottom: '14px',
    },
    modalTitle: {
      margin: 0,
      fontSize: '18px',
      fontWeight: 900,
      color: theme.textHeading,
    },
    modalCloseBtn: {
      width: '34px',
      height: '34px',
      borderRadius: '10px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      color: theme.textSecondary,
      fontWeight: 800,
      cursor: 'pointer',
      flexShrink: 0,
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
  const [joinPasswordInput, setJoinPasswordInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('Loading chat workspace...');
  const [connectionState, setConnectionState] = useState('connecting');
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    parentGroupId: '',
    friendRoles: {},
  });
  const [threadCoverFile, setThreadCoverFile] = useState(null);
  const [threadCoverPreview, setThreadCoverPreview] = useState('');
  const [creatingThread, setCreatingThread] = useState(false);
  const [visibilityForm, setVisibilityForm] = useState({ members: '', viewers: '' });
  const [imageCaption, setImageCaption] = useState('');
  const [commentDrafts, setCommentDrafts] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({});
  const [toasts, setToasts] = useState([]);
  const [groupSettingsForm, setGroupSettingsForm] = useState({
    allowJoinByLink: true,
    joinPassword: '',
    clearMessagesAfterHours: '',
    onlyAdminsCreateFolders: false,
    onlyAdminsBookmarkMessages: false,
  });
  const [folderForm, setFolderForm] = useState({ name: '', description: '' });
  const [folderSelections, setFolderSelections] = useState({});
  const [selectedUploadFolderId, setSelectedUploadFolderId] = useState('');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [memberSecurityForm, setMemberSecurityForm] = useState({ username: '', role: 'member', canView: true, canPost: true, canComment: true, canInvite: false });
  const [activeReplyMessageId, setActiveReplyMessageId] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [isNarrowScreen, setIsNarrowScreen] = useState(false);
  const [activePanelTab, setActivePanelTab] = useState('');
  const [sidebarPanel, setSidebarPanel] = useState('');
  const [sidebarFilter, setSidebarFilter] = useState('');
  const [hubTab, setHubTab] = useState('threads');
  const [showCreateThreadModal, setShowCreateThreadModal] = useState(false);
  const [showJoinThreadModal, setShowJoinThreadModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [callParticipants, setCallParticipants] = useState([]);
  const [joinedCallRoom, setJoinedCallRoom] = useState('');
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [callStatusByGroup, setCallStatusByGroup] = useState({});
  const [pushPreferences, setPushPreferences] = useState({
    muteAll: false,
    mutedGroupIds: [],
    mutedUsernames: [],
    wellnessReminderEnabled: true,
  });

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const threadCoverInputRef = useRef(null);
  const composerRef = useRef(null);
  const inviteHandledRef = useRef(false);
  const activeChatRef = useRef(null);
  const previousChatKeyRef = useRef('');
  const previousMessageCountRef = useRef(0);
  const incomingRequestsRef = useRef([]);
  const permissionAskedRef = useRef(false);
  const [pushSetupStatus, setPushSetupStatus] = useState('pending');
  const callRoomRef = useRef('');
  const socketRef = useRef(null);
  const socketConnectErrorShownRef = useRef(false);
  const userRef = useRef(null);
  const urlHydratedRef = useRef(false);
  const skipUrlSyncRef = useRef(false);

  const chatApiBase = '/chat-api/chat';

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
      const scoped = messages.filter((message) => chatMatchesActive(activeChat, message.chat));
      if (!showBookmarkedOnly || activeChat.type !== 'group') return scoped;
      return scoped.filter((message) => bookmarkedMessageIds.has(message.id));
    },
    [messages, activeChat, showBookmarkedOnly, bookmarkedMessageIds],
  );
  const childGroups = useMemo(
    () => bootstrap.groups.filter((group) => group.parentGroupId === selectedGroup?.id),
    [bootstrap.groups, selectedGroup?.id],
  );
  const callPresenceRoom = useMemo(
    () => (selectedGroup?.id ? `group:${selectedGroup.id}` : ''),
    [selectedGroup?.id],
  );

  useEffect(() => {
    if (!selectedGroup?.id) {
      setSelectedUploadFolderId('');
      return;
    }
    const firstFolderId = selectedGroup.folders?.[0]?.id || '';
    setSelectedUploadFolderId((previous) => {
      if (previous && (selectedGroup.folders || []).some((folder) => folder.id === previous)) {
        return previous;
      }
      return firstFolderId;
    });
  }, [selectedGroup?.id, selectedGroup?.folders]);

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

  const topLevelThreads = useMemo(
    () => bootstrap.groups.filter((group) => !group.parentGroupId),
    [bootstrap.groups],
  );

  const filteredTopLevelThreads = useMemo(() => {
    if (!sidebarFilter.trim()) return topLevelThreads;
    const q = sidebarFilter.toLowerCase();
    return topLevelThreads.filter((group) => {
      const haystack = `${group.name} ${group.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [topLevelThreads, sidebarFilter]);

  const filteredThreadRows = useMemo(() => {
    if (!sidebarFilter.trim()) return flattenedGroups;
    const q = sidebarFilter.toLowerCase();
    return flattenedGroups.filter(({ group }) => {
      const haystack = `${group.name} ${group.description || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [flattenedGroups, sidebarFilter]);

  const mobilePanelOpen = isNarrowScreen && Boolean(activePanelTab && selectedGroup);
  const showChatHub = !activeChat;

  const recentThreadMedia = useMemo(() => {
    const rows = [];
    topLevelThreads.forEach((group) => {
      (group.images || []).forEach((image) => {
        const imageUrl = String(image?.imageUrl || '').trim();
        if (!imageUrl || imageUrl === 'null' || imageUrl === 'undefined') return;
        if (!/^(https?:\/\/|\/|blob:)/i.test(imageUrl)) return;
        rows.push({
          id: image.id || `${group.id}-${imageUrl}`,
          imageUrl,
          mediaType: image.mediaType,
          thread: group,
          ts: Number(image.createdAt || image.uploadedAt || 0),
        });
      });
    });
    return rows.sort((a, b) => b.ts - a.ts);
  }, [topLevelThreads]);

  const onlineUserSet = useMemo(
    () => new Set((onlineUsers || []).map((name) => normalizeUsername(name)).filter(Boolean)),
    [onlineUsers],
  );

  const isUserOnline = useCallback((username) => onlineUserSet.has(normalizeUsername(username)), [onlineUserSet]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncViewport = () => {
      const narrow = window.innerWidth <= 720;
      setIsNarrowScreen(narrow);
      if (narrow) setShowSidebar(false);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

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

  useEffect(() => {
    callRoomRef.current = callPresenceRoom;
  }, [callPresenceRoom]);

  useEffect(() => {
    if (!user?.username) return undefined;
    let cancelled = false;
    (async () => {
      const result = await subscribeToWebPush(user.username);
      if (!cancelled) {
        setPushSetupStatus(result.ok ? 'ready' : (result.reason || 'error'));
      }
    })();
    return () => { cancelled = true; };
  }, [user?.username]);

  async function enablePushNotifications() {
    if (!user?.username) return;
    const result = await subscribeToWebPush(user.username, { force: true });
    setPushSetupStatus(result.ok ? 'ready' : (result.reason || 'error'));
    if (result.ok) {
      reportStatus('Push notifications enabled.');
      return;
    }
    if (result.reason === 'permission-denied') {
      reportError('Allow notifications in browser settings to get message alerts.');
      return;
    }
    if (result.reason === 'no-vapid-key') {
      reportError('Push is not configured on the server yet.');
      return;
    }
    reportError('Could not enable push on this device. Use Chrome/Safari with HTTPS.');
  }

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
    if (nextBootstrap?.pushPreferences) {
      setPushPreferences({
        muteAll: Boolean(nextBootstrap.pushPreferences.muteAll),
        mutedGroupIds: Array.isArray(nextBootstrap.pushPreferences.mutedGroupIds) ? nextBootstrap.pushPreferences.mutedGroupIds : [],
        mutedUsernames: Array.isArray(nextBootstrap.pushPreferences.mutedUsernames) ? nextBootstrap.pushPreferences.mutedUsernames : [],
        wellnessReminderEnabled: nextBootstrap.pushPreferences.wellnessReminderEnabled !== false,
      });
    }
    const activeChatCandidate = nextChat || activeChatRef.current;

    if (nextChat) {
      activeChatRef.current = nextChat;
      setActiveChat(nextChat);
      return;
    }

    if (!activeChatCandidate) {
      // Keep the trip-thread hub visible until the user explicitly opens a chat.
      return;
    }

    if (activeChatCandidate.type === 'dm') {
      if (!nextBootstrap.friends.includes(activeChatCandidate.name)) {
        setActiveChat(null);
      }
      return;
    }

    const matchingGroup = nextBootstrap.groups.find((group) => (
      group.id === activeChatCandidate.id || group.name === activeChatCandidate.name
    ));
    if (!matchingGroup) {
      setActiveChat(null);
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

  async function handleLogout() {
    try {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    } catch (_) {
      // Ignore socket teardown failures.
    }
    await logoutClientSession(router);
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
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
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
    }, 120000);

    return () => window.clearInterval(interval);
  }, [chatApiBase, user?.username]);

  useEffect(() => {
    let active = true;
    const cached = getCachedClientUser();
    if (cached) {
      setUser(cached);
      setStatusMessage('Loading groups, friendships, and media...');
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok && payload.user) {
          persistClientUser(payload.user);
          setUser(payload.user);
          setStatusMessage('Loading groups, friendships, and media...');
          return;
        }
        if (cached) {
          setStatusMessage('Using saved session — reconnecting to chat…');
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
        if (cached) {
          setStatusMessage('Using saved session — chat server may be slow to respond.');
          return;
        }
        router.push('/');
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!user?.username) return;
    setBootstrapReady(false);
    fetchBootstrap().then(() => {
      setBootstrapReady(true);
      setStatusMessage('Ready');
    }).catch((error) => {
      setBootstrapReady(true);
      const message = String(error?.message || 'Could not load chat data.');
      if (/ECONNREFUSED|fetch failed|502|503|504/i.test(message)) {
        reportError('Chat API is offline. Start chat-service on port 3002 (run npm run dev from Cosmix/).');
      } else {
        reportError(message);
      }
    });
  }, [user?.username]);

  useEffect(() => {
    if (!router.isReady || !bootstrapReady || !user?.username || urlHydratedRef.current) return;

    skipUrlSyncRef.current = true;
    const threadId = typeof router.query.thread === 'string' ? router.query.thread.trim() : '';
    const dmUser = typeof router.query.dm === 'string' ? router.query.dm.trim() : '';
    const view = typeof router.query.view === 'string' ? router.query.view.trim() : '';
    const tab = typeof router.query.tab === 'string' ? router.query.tab.trim() : '';

    if (tab === 'friends') setHubTab('friends');

    if (threadId) {
      const group = bootstrap.groups.find((entry) => entry.id === threadId);
      if (group) {
        const nextChat = { type: 'group', id: group.id, name: group.name, label: group.name };
        activeChatRef.current = nextChat;
        setActiveChat(nextChat);
        if (view === 'invite') setShowInviteModal(true);
        else if (view) setActivePanelTab(view);
      }
    } else if (dmUser) {
      const friend = bootstrap.friends.find((entry) => normalizeUsername(entry) === normalizeUsername(dmUser));
      if (friend) {
        const nextChat = {
          type: 'dm',
          id: buildDmId(user.username, friend),
          name: friend,
          label: friend,
        };
        activeChatRef.current = nextChat;
        setActiveChat(nextChat);
      }
    } else if (view === 'create') {
      setShowCreateThreadModal(true);
    } else if (view === 'join') {
      setShowJoinThreadModal(true);
    }

    urlHydratedRef.current = true;
    window.setTimeout(() => {
      skipUrlSyncRef.current = false;
    }, 0);
  }, [bootstrap.groups, bootstrap.friends, bootstrapReady, router.isReady, router.query.dm, router.query.tab, router.query.thread, router.query.view, user?.username]);

  useEffect(() => {
    if (!router.isReady || !urlHydratedRef.current || skipUrlSyncRef.current) return;
    const nextQuery = buildChatQuery({ chat: activeChat, panelTab: activePanelTab, hubTab, inviteModalOpen: showInviteModal });
    if (chatQueriesMatch(router.query, nextQuery)) return;
    router.replace({ pathname: '/chat', query: nextQuery }, undefined, { shallow: true });
  }, [activeChat, activePanelTab, hubTab, router.isReady, showInviteModal]);

  useEffect(() => {
    if (!user?.username) return undefined;

    let active = true;
    let chatSocket = null;
    setConnectionState('connecting');
    socketConnectErrorShownRef.current = false;

    (async () => {
      const { default: io } = await import('socket.io-client');
      if (!active) return;
      const { url: socketUrl, options: socketOptions } = resolveChatSocketClient();
      chatSocket = io(socketUrl, socketOptions);
      socketRef.current = chatSocket;

      chatSocket.on('connect', () => {
      if (!active) return;
      socketConnectErrorShownRef.current = false;
      setConnectionState('connected');
      const currentUser = userRef.current;
      chatSocket.emit('join', {
        username: currentUser?.username || user.username,
        userId: currentUser?.id || user.id || null,
        avatar: currentUser?.avatar || null,
      });
      chatSocket.emit('call_status_snapshot');
    });

    chatSocket.on('disconnect', () => {
      if (!active) return;
      setConnectionState('offline');
    });

    chatSocket.on('connect_error', (error) => {
      if (!active) return;
      setConnectionState('offline');
      if (!socketConnectErrorShownRef.current) {
        socketConnectErrorShownRef.current = true;
        reportError(error?.message || 'Could not connect to chat server. Is chat-service running on port 3002?');
      }
    });

    chatSocket.on('history', (payload) => {
      setMessages((previous) => mergeMessages(previous, payload.messages || []));
    });

    chatSocket.on('message', (payload) => {
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

    chatSocket.on('online_users', (list) => {
      setOnlineUsers(Array.from(new Set((list || []).filter(Boolean))));
    });

    chatSocket.on('typing', (payload) => {
      if (!payload?.user || payload.user === user.username) return;
      setTypingUsers((previous) => (previous.includes(payload.user) ? previous : [...previous, payload.user]));
      window.clearTimeout(chatSocket.__typingTimer);
      chatSocket.__typingTimer = window.setTimeout(() => {
        setTypingUsers((previous) => previous.filter((name) => name !== payload.user));
      }, 1500);
    });

    chatSocket.on('call_presence', (payload) => {
      if (!payload?.room || payload.room !== callRoomRef.current) return;
      setCallParticipants(Array.isArray(payload.participants) ? payload.participants : []);
    });

    chatSocket.on('call_status', (payload) => {
      const room = String(payload?.room || '').trim();
      if (!room.startsWith('group:')) return;
      const groupId = room.slice('group:'.length);
      const count = Math.max(0, Number(payload?.count || 0));
      setCallStatusByGroup((previous) => ({
        ...previous,
        [groupId]: count,
      }));
    });

    chatSocket.on('call_status_snapshot', (list) => {
      const next = {};
      (Array.isArray(list) ? list : []).forEach((entry) => {
        const room = String(entry?.room || '').trim();
        if (!room.startsWith('group:')) return;
        const groupId = room.slice('group:'.length);
        const count = Math.max(0, Number(entry?.count || 0));
        next[groupId] = count;
      });
      setCallStatusByGroup(next);
    });

      chatSocket.on('chat_error', (payload) => {
        setMessages((previous) => previous.filter((message) => !message.pending));
        reportError(payload?.message || 'Chat request failed.');
      });
    })().catch((error) => {
      if (!active) return;
      setConnectionState('offline');
      reportError(error?.message || 'Could not load chat client.');
    });

    return () => {
      active = false;
      if (chatSocket) {
        chatSocket.removeAllListeners();
        chatSocket.disconnect();
        if (socketRef.current === chatSocket) {
          socketRef.current = null;
        }
      }
    };
  }, [user?.username]);

  useEffect(() => {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || connectionState !== 'connected') return;
    bootstrap.groups.forEach((group) => {
      chatSocket.emit('join_room', { room: group.id });
    });
  }, [bootstrap.groups, connectionState]);

  useEffect(() => {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || connectionState !== 'connected' || !user?.username || !activeChat) return;
    chatSocket.emit('open_chat', { chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name } });
  }, [activeChat, connectionState, user?.username]);

  useEffect(() => {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || connectionState !== 'connected') return undefined;
    if (!callPresenceRoom) {
      setCallParticipants([]);
      return undefined;
    }
    chatSocket.emit('call_presence_watch', { room: callPresenceRoom });
    return () => {
      chatSocket.emit('call_presence_unwatch', { room: callPresenceRoom });
    };
  }, [callPresenceRoom, connectionState]);

  useEffect(() => {
    if (!joinedCallRoom) return;
    if (joinedCallRoom === callPresenceRoom) return;
    const chatSocket = socketRef.current;
    if (chatSocket?.connected && connectionState === 'connected') {
      chatSocket.emit('call_leave', { room: joinedCallRoom });
    }
    setJoinedCallRoom('');
    setShowVideoCall(false);
  }, [callPresenceRoom, connectionState, joinedCallRoom]);

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
    const memberships = selectedGroup?.memberships || [];
    const members = memberships.filter((membership) => membership.role === 'member').map((membership) => membership.username).join(', ');
    const viewers = memberships.filter((membership) => membership.role === 'viewer').map((membership) => membership.username).join(', ');
    setVisibilityForm({ members, viewers });
    setGroupSettingsForm({
      allowJoinByLink: selectedGroup.settings?.allowJoinByLink !== false,
      joinPassword: selectedGroup.settings?.joinPassword || '',
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

    const password = typeof router.query.joinPassword === 'string'
      ? router.query.joinPassword
      : (typeof window !== 'undefined' ? (sessionStorage.getItem(`cosmix-join-pw-${token}`) || '') : '');

    inviteHandledRef.current = true;
    fetch(`${chatApiBase}/groups/join-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorUsername: user.username, shareToken: token, joinPassword: password }),
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

  async function uploadThreadMedia(file, groupId, purpose = '') {
    const formData = new FormData();
    formData.append('files', file);
    formData.append('username', user.username);
    formData.append('groupId', groupId);
    if (purpose) formData.append('purpose', purpose);
    const uploadResponse = await fetch('/api/chat/group-image-upload', { method: 'POST', body: formData });
    const uploadPayload = await readJsonResponse(uploadResponse);
    const uploads = Array.isArray(uploadPayload?.uploads) ? uploadPayload.uploads : [];
    if (!uploads.length) throw new Error('Cover upload failed.');
    return uploads[0];
  }

  function openCreateThreadModal(parentGroupId = '') {
    setGroupForm({
      name: '',
      description: '',
      parentGroupId: parentGroupId || '',
      friendRoles: {},
    });
    setThreadCoverFile(null);
    setThreadCoverPreview('');
    setShowCreateThreadModal(true);
    setShowSidebar(false);
    setSidebarPanel('');
  }

  function openJoinThreadModal() {
    setShowJoinThreadModal(true);
    setShowSidebar(false);
    setSidebarPanel('');
  }

  async function handleMoveThread(threadId, parentGroupId) {
    if (!user?.username || !threadId) return;
    try {
      await submitJson(`/groups/${threadId}/parent`, 'PUT', {
        actorUsername: user.username,
        parentGroupId: parentGroupId || null,
      });
      reportStatus(parentGroupId ? 'Thread nested inside parent.' : 'Thread moved to top level.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleMoveFolder(folderId, parentFolderId) {
    if (!selectedGroup || !user?.username || !folderId) return;
    try {
      await submitJson(`/groups/${selectedGroup.id}/folders/${folderId}/parent`, 'PUT', {
        actorUsername: user.username,
        parentFolderId: parentFolderId || null,
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : null;
      });
      reportStatus(parentFolderId ? 'Album nested inside folder.' : 'Album moved to top level.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    if (!groupForm.name.trim() || !user?.username) {
      reportError('Enter a thread name and make sure you are logged in.');
      return;
    }

    setCreatingThread(true);
    try {
      const payload = await submitJson(
        '/groups',
        'POST',
        {
          actorUsername: user.username,
          name: groupForm.name.trim(),
          description: groupForm.description.trim(),
          parentGroupId: groupForm.parentGroupId || null,
          memberUsernames: Object.entries(groupForm.friendRoles || {})
            .filter(([, role]) => role === 'member')
            .map(([username]) => username),
          adminUsernames: Object.entries(groupForm.friendRoles || {})
            .filter(([, role]) => role === 'admin')
            .map(([username]) => username),
          viewerUsernames: Object.entries(groupForm.friendRoles || {})
            .filter(([, role]) => role === 'viewer')
            .map(([username]) => username),
        },
        (nextPayload) => {
          const createdGroupId = nextPayload.createdGroupId
            || nextPayload.groups
              ?.filter((group) => group.name === groupForm.name.trim())
              ?.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())?.[0]?.id;
          const createdGroup = nextPayload.groups.find((group) => group.id === createdGroupId);
          return createdGroup
            ? { type: 'group', id: createdGroup.id, name: createdGroup.name, label: createdGroup.name }
            : null;
        },
      );

      const createdGroupId = payload.createdGroupId
        || payload.groups
          ?.filter((group) => group.name === groupForm.name.trim())
          ?.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())?.[0]?.id;

      if (!createdGroupId) {
        throw new Error('Thread was created but could not be opened.');
      }

      if (threadCoverFile) {
        const uploaded = await uploadThreadMedia(threadCoverFile, createdGroupId, 'cover');
        await submitJson(`/groups/${createdGroupId}/cover`, 'PUT', {
          actorUsername: user.username,
          coverImageUrl: uploaded.url,
          coverS3Key: uploaded.key,
          coverMediaType: uploaded.mediaType || 'image',
        }, (nextPayload) => {
          const createdGroup = nextPayload.groups.find((group) => group.id === createdGroupId);
          return createdGroup
            ? { type: 'group', id: createdGroup.id, name: createdGroup.name, label: createdGroup.name }
            : null;
        });
      }

      setGroupForm({
        name: '',
        description: '',
        parentGroupId: '',
        friendRoles: {},
      });
      setThreadCoverFile(null);
      setThreadCoverPreview('');
      setSidebarPanel('');
      setShowCreateThreadModal(false);
      const createdGroup = payload.groups?.find((group) => group.id === createdGroupId);
      if (createdGroup) {
        enterThread(createdGroup, 'chat');
        setActivePanelTab('invite');
      } else {
        setShowSidebar(false);
        setActivePanelTab('');
      }
      reportStatus('Thread created. Share the invite link and password from Invite.');
    } catch (error) {
      reportError(error.message || 'Unable to create thread.');
    } finally {
      setCreatingThread(false);
    }
  }

  function handleThreadCoverPick(event) {
    const file = Array.from(event.target.files || [])[0];
    if (!file) return;
    setThreadCoverFile(file);
    const previewUrl = URL.createObjectURL(file);
    setThreadCoverPreview(previewUrl);
    event.target.value = '';
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
        joinPassword: joinPasswordInput.trim(),
      });
      const joinedGroup = payload.groups.find((group) => group.shareToken === inviteToken.trim());
      if (joinedGroup) {
        selectChat({ type: 'group', id: joinedGroup.id, name: joinedGroup.name, label: joinedGroup.name });
      }
      setInviteToken('');
      setJoinPasswordInput('');
      setShowJoinThreadModal(false);
      reportStatus('Invite link accepted.');
    } catch (error) {
      reportError(error.message);
    }
  }

  async function handleGroupImageUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || !selectedGroup || !user?.username) return;

    const folderId = selectedUploadFolderId || '';

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      formData.append('username', user.username);
      formData.append('groupId', selectedGroup.id);
      if (folderId) {
        const folderName = (selectedGroup.folders || []).find((entry) => entry.id === folderId)?.name || '';
        if (folderName) formData.append('folderName', folderName);
      }
      const uploadResponse = await fetch('/api/chat/group-image-upload', { method: 'POST', body: formData });
      const uploadPayload = await readJsonResponse(uploadResponse);

      const uploads = Array.isArray(uploadPayload?.uploads)
        ? uploadPayload.uploads
        : (uploadPayload?.url && uploadPayload?.key ? [{ url: uploadPayload.url, key: uploadPayload.key }] : []);
      if (!uploads.length) {
        throw new Error('No files were uploaded.');
      }

      for (const uploaded of uploads) {
        const payload = await submitJson(`/groups/${selectedGroup.id}/images`, 'POST', {
          actorUsername: user.username,
          imageUrl: uploaded.url,
          s3Key: uploaded.key,
          caption: imageCaption.trim(),
          mediaType: uploaded.mediaType || 'image',
        }, (nextPayload) => {
          const refreshed = nextPayload.groups.find((group) => group.id === selectedGroup.id);
          return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(nextPayload, user?.username);
        });

        if (folderId) {
          const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
          const image = (refreshed?.images || []).find((entry) => entry.s3Key === uploaded.key);
          if (image?.id) {
            await submitJson(`/groups/${selectedGroup.id}/folders/${folderId}/items`, 'POST', {
              actorUsername: user.username,
              imageId: image.id,
            }, (nextPayload) => {
              const nextGroup = nextPayload.groups.find((group) => group.id === selectedGroup.id);
              return nextGroup ? { type: 'group', id: nextGroup.id, name: nextGroup.name, label: nextGroup.name } : getDefaultChat(nextPayload, user?.username);
            });
          }
        }
      }

      setImageCaption('');
      event.target.value = '';
      reportStatus(`${uploads.length} file${uploads.length === 1 ? '' : 's'} uploaded.`);
    } catch (error) {
      event.target.value = '';
      reportError(error.message);
    }
  }

  async function handleDownloadGroupImage(image) {
    if (!image?.s3Key) {
      reportError('Image key is missing.');
      return;
    }
    try {
      const response = await fetch(`/api/chat/group-image-download?s3Key=${encodeURIComponent(image.s3Key)}`);
      const payload = await readJsonResponse(response);
      if (!payload?.url) throw new Error('Unable to generate download link.');
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      reportError(error.message || 'Download failed.');
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
        joinPassword: groupSettingsForm.joinPassword,
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

  async function handleCreateFolder(event, parentFolderId = null) {
    event.preventDefault();
    if (!selectedGroup || !user?.username || !folderForm.name.trim()) return;

    try {
      await submitJson(`/groups/${selectedGroup.id}/folders`, 'POST', {
        actorUsername: user.username,
        name: folderForm.name.trim(),
        description: folderForm.description.trim(),
        parentFolderId: parentFolderId || null,
      }, (payload) => {
        const refreshed = payload.groups.find((group) => group.id === selectedGroup.id);
        return refreshed ? { type: 'group', id: refreshed.id, name: refreshed.name, label: refreshed.name } : getDefaultChat(payload, user?.username);
      });
      setFolderForm({ name: '', description: '' });
      reportStatus(parentFolderId ? 'Sub-album created.' : 'Album folder created.');
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

  function queueOutboundMessage({ type = 'text', text = '', gif = '' }) {
    if (!user?.username || !activeChat) return null;
    const clientMessageId = createClientMessageId();
    const timestamp = new Date().toISOString();
    const optimistic = {
      id: clientMessageId,
      clientMessageId,
      pending: true,
      type,
      text,
      gif,
      user: user.username,
      userId: user.id || null,
      avatar: user.avatar || null,
      timestamp,
      chat: {
        type: activeChat.type,
        id: activeChat.id,
        name: activeChat.name,
      },
    };
    setMessages((previous) => mergeMessages(previous, [optimistic]));
    return { clientMessageId, timestamp };
  }

  function handleSendInlineReply(targetMessage) {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || !activeChat) return;
    const draft = String(replyDrafts[targetMessage.id] || '').trim();
    if (!draft) return;

    const replyEnvelope = `[reply:${targetMessage.id}:${targetMessage.user || 'user'}]\n${draft}`;
    const outbound = queueOutboundMessage({ type: 'text', text: replyEnvelope });
    if (!outbound) return;

    chatSocket.emit('message', {
      type: 'text',
      text: replyEnvelope,
      chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name },
      timestamp: outbound.timestamp,
      clientMessageId: outbound.clientMessageId,
    });

    setReplyDrafts((previous) => ({ ...previous, [targetMessage.id]: '' }));
    setActiveReplyMessageId('');
  }

  function openInviteModal() {
    setShowInviteModal(true);
    if (isNarrowScreen) setActivePanelTab('');
  }

  function closeInviteModal() {
    setShowInviteModal(false);
  }

  function openThreadPanel(tab) {
    if (tab === 'invite') {
      openInviteModal();
      return;
    }
    setShowInviteModal(false);
    setActivePanelTab(tab);
    if (isNarrowScreen) setShowSidebar(false);
  }

  function leaveActiveThread() {
    if (joinedCallRoom) {
      const chatSocket = socketRef.current;
      if (chatSocket?.connected) {
        chatSocket.emit('call_leave', { room: joinedCallRoom });
      }
      setJoinedCallRoom('');
    }
    setShowVideoCall(false);
    setActivePanelTab('');
    setShowInviteModal(false);
    activeChatRef.current = null;
    setActiveChat(null);
    setShowSidebar(false);
  }

  function enterThread(group, mode = 'chat') {
    setShowThreadModeModal(false);
    setThreadModePickerGroup(null);
    selectChat({ type: 'group', id: group.id, name: group.name, label: group.name });
    setShowInviteModal(false);
    setActivePanelTab(mode === 'albums' ? 'albums' : '');
    setShowSidebar(false);
  }

  function openThread(group, mode = null) {
    enterThread(group, mode === 'albums' ? 'albums' : 'chat');
  }

  function renderThreadBrowseStrip() {
    if (!selectedGroup || activeChat?.type !== 'group' || showChatHub) return null;
    const rootFolders = buildFolderTree(selectedGroup.folders || []).get(null) || [];
    if (!childGroups.length && !rootFolders.length) return null;

    return (
      <div className="chat-thread-browse" style={{ padding: '12px 14px', borderBottom: `1px solid ${theme.cardBorder}`, background: theme.panelBg, display: 'grid', gap: '12px' }}>
        {childGroups.length ? (
          <div style={styles.threadFolderScroll}>
            <div style={styles.threadFolderHeader}>
              <div style={styles.threadFolderTitle}>Sub-threads</div>
              <div style={styles.threadFolderSubtitle}>Open a nested thread without leaving this space</div>
            </div>
            <div style={styles.threadFolderGrid}>
              {childGroups.map((group) => (
                <button key={group.id} type="button" style={styles.threadFolderCard} onClick={() => selectGroup(group)}>
                  <div style={styles.threadFolderCover}>🧵</div>
                  <div style={styles.threadFolderBody}>
                    <div style={styles.threadFolderName}>{group.name}</div>
                    <div style={styles.threadFolderMeta}>{(group.memberships || []).length} members</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {rootFolders.length ? (
          <div style={styles.threadFolderScroll}>
            <div style={styles.threadFolderHeader}>
              <div style={styles.threadFolderTitle}>Album folders</div>
              <div style={styles.threadFolderSubtitle}>Browse photos and create nested folders from Albums</div>
            </div>
            <div style={styles.threadFolderGrid}>
              {rootFolders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  style={styles.threadFolderCard}
                  onClick={() => {
                    setActivePanelTab('albums');
                    setSelectedUploadFolderId(folder.id);
                  }}
                >
                  <div style={styles.threadFolderCover}>📁</div>
                  <div style={styles.threadFolderBody}>
                    <div style={styles.threadFolderName}>{folder.name}</div>
                    <div style={styles.threadFolderMeta}>{(folder.items || []).length} items</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function selectGroup(group) {
    enterThread(group, 'chat');
  }

  function selectFriend(friendName) {
    if (!user?.username) return;
    selectChat({
      type: 'dm',
      id: buildDmId(user.username, friendName),
      name: friendName,
      label: friendName,
    });
    setActivePanelTab('');
    setShowSidebar(false);
  }

  function emitTyping() {
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected || !user?.username || !activeChat) return;
    chatSocket.emit('typing', { user: user.username, chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name } });
  }

  function handleComposerChange(event) {
    setComposerText(event.target.value);
    emitTyping();
  }

  function handleSendMessage(event) {
    event.preventDefault();
    const chatSocket = socketRef.current;
    if (!chatSocket?.connected) {
      reportError('Not connected to chat. Please wait while reconnecting...');
      return;
    }
    if (!activeChat || !composerText.trim()) return;
    const text = composerText.trim();
    const outbound = queueOutboundMessage({ type: 'text', text });
    if (!outbound) return;

    chatSocket.emit('message', {
      type: 'text',
      text,
      chat: { type: activeChat.type, id: activeChat.id, name: activeChat.name },
      timestamp: outbound.timestamp,
      clientMessageId: outbound.clientMessageId,
    });
    setComposerText('');
  }

  function openWhatsAppShare() {
    if (!selectedGroup || typeof window === 'undefined') return;
    const inviteUrl = new URL(`/j/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString();
    const password = String(selectedGroup.settings?.joinPassword || '').trim();
    const passwordLine = password ? `\nThread password: ${password}` : '';
    const message = `${selectedGroup.name}${selectedGroup.description ? ` — ${selectedGroup.description}` : ''}\nJoin our thread on Cosmix:\n${inviteUrl}${passwordLine}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  }

  async function updatePushPreferences(nextPartial) {
    if (!user?.username) return;
    const next = {
      ...pushPreferences,
      ...nextPartial,
    };
    try {
      const response = await fetch(`${chatApiBase}/push/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorUsername: user.username,
          muteAll: Boolean(next.muteAll),
          mutedGroupIds: Array.from(new Set(next.mutedGroupIds || [])),
          mutedUsernames: Array.from(new Set((next.mutedUsernames || []).map((entry) => normalizeUsername(entry)).filter(Boolean))),
          wellnessReminderEnabled: next.wellnessReminderEnabled !== false,
        }),
      });
      const payload = await readJsonResponse(response);
      setPushPreferences({
        muteAll: Boolean(payload.muteAll),
        mutedGroupIds: Array.isArray(payload.mutedGroupIds) ? payload.mutedGroupIds : [],
        mutedUsernames: Array.isArray(payload.mutedUsernames) ? payload.mutedUsernames : [],
        wellnessReminderEnabled: payload.wellnessReminderEnabled !== false,
      });
    } catch (error) {
      reportError(error.message || 'Unable to save push preferences.');
    }
  }

  function handleJoinCall(callUrl) {
    if (!callUrl) return;
    const chatSocket = socketRef.current;
    if (callPresenceRoom && chatSocket?.connected) {
      chatSocket.emit('call_join', { room: callPresenceRoom });
      setJoinedCallRoom(callPresenceRoom);
    }
    setShowVideoCall(true);
  }

  function handleLeaveCall() {
    const chatSocket = socketRef.current;
    if (joinedCallRoom && chatSocket?.connected) {
      chatSocket.emit('call_leave', { room: joinedCallRoom });
    }
    setJoinedCallRoom('');
    setShowVideoCall(false);
  }

  const canPostToGroup = selectedMembership?.canPost;
  const canInviteToGroup = selectedMembership?.canInvite;
  const canCommentInGroup = selectedMembership?.canComment;
  const isGroupOwner = selectedMembership?.role === 'owner';
  const canManageFolders = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsCreateFolders;
  const canBookmarkMessages = selectedMembership?.role === 'owner' || selectedMembership?.role === 'admin' || !selectedGroup?.settings?.onlyAdminsBookmarkMessages;
  const isInCurrentCall = Boolean(callPresenceRoom && joinedCallRoom === callPresenceRoom);
  const isCurrentGroupMuted = Boolean(selectedGroup?.id && pushPreferences.mutedGroupIds.includes(selectedGroup.id));
  const isCurrentDmMuted = Boolean(activeChat?.type === 'dm' && pushPreferences.mutedUsernames.includes(normalizeUsername(activeChat.name)));
  const threadCallUrl = selectedGroup?.id
    ? `https://meet.jit.si/cosmix-thread-${String(selectedGroup.id).replace(/[^a-zA-Z0-9-]/g, '-')}`
    : '';
  const isAlbumsPanelOpen = activePanelTab === 'albums' || activePanelTab === 'folders' || activePanelTab === 'media';
  const onMobileThreadChatView = !activePanelTab && !showInviteModal;
  const showMobileChatTool = selectedGroup && isNarrowScreen && !onMobileThreadChatView;
  const showMobileAlbumsTool = selectedGroup && isNarrowScreen && !isAlbumsPanelOpen;
  const showMobileInviteTool = selectedGroup && isNarrowScreen && !showInviteModal;

  // ── panel render helpers ────────────────────────────────────────────────
  function renderMembersPanel() {
    return (
      <>
        <div style={styles.badgeRow}>
          {(selectedGroup?.memberships || []).map((m) => (
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

  function renderAlbumsPanel() {
    const threadInviteUrl = selectedGroup?.shareToken && typeof window !== 'undefined'
      ? new URL(`/j/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString()
      : '';

    return (
      <>
        {threadInviteUrl && !isNarrowScreen ? (
          <div style={{ display: 'grid', gap: '8px', padding: '12px', borderRadius: '14px', background: `linear-gradient(135deg, ${theme.blue}22, ${theme.purple}18)`, border: `1px solid ${theme.cardBorder}` }}>
            <div style={{ fontSize: '12px', fontWeight: 800, color: theme.textHeading }}>Share this thread</div>
            <button
              type="button"
              style={{ ...styles.btn, marginTop: '2px' }}
              onClick={async () => {
                try {
                  await copyText(threadInviteUrl);
                  reportStatus('Thread invite link copied.');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              Copy join link
            </button>
          </div>
        ) : null}
        <ChatAlbumGallery
          key={selectedGroup?.id || 'albums'}
          theme={theme}
          compact={isNarrowScreen}
          folders={selectedGroup?.folders || []}
          images={selectedGroup?.images || []}
          canManage={canManageFolders}
          folderForm={folderForm}
          onFolderFormChange={setFolderForm}
          onCreateFolder={handleCreateFolder}
          selectedUploadFolderId={selectedUploadFolderId}
          onSelectUploadFolder={setSelectedUploadFolderId}
          imageCaption={imageCaption}
          onImageCaptionChange={setImageCaption}
          onPickFiles={() => fileInputRef.current?.click()}
          onDownloadImage={handleDownloadGroupImage}
          onShareFolder={async (folder) => {
            const label = folder?.name ? `Album: ${folder.name}` : 'Thread albums';
            try {
              if (threadInviteUrl) {
                await copyText(`${label}\n${threadInviteUrl}`);
              } else {
                await copyText(label);
              }
              reportStatus('Album share text copied.');
            } catch (error) {
              reportError(error.message || 'Copy failed.');
            }
          }}
          commentDrafts={commentDrafts}
          onCommentDraftChange={(imageId, value) => setCommentDrafts((previous) => ({ ...previous, [imageId]: value }))}
          onPostComment={handleImageComment}
          canComment={canCommentInGroup}
          onMoveFolder={canManageFolders ? handleMoveFolder : null}
        />
        <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" style={{ display: 'none' }} onChange={handleGroupImageUpload} />
      </>
    );
  }

  function renderFoldersPanel() {
    return renderAlbumsPanel();
  }

  function renderMediaPanel() {
    return renderAlbumsPanel();
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

  function renderInvitePanel() {
    const inviteUrl = selectedGroup?.shareToken && typeof window !== 'undefined'
      ? new URL(`/j/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString()
      : '';
    const callUrl = selectedGroup?.id
      ? `https://meet.jit.si/cosmix-thread-${String(selectedGroup.id).replace(/[^a-zA-Z0-9-]/g, '-')}`
      : '';
    return (
      <>
        {selectedGroup?.coverImageUrl ? (
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
            {selectedGroup.coverMediaType === 'video' ? (
              <video src={selectedGroup.coverImageUrl} style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} controls playsInline />
            ) : (
              <img src={selectedGroup.coverImageUrl} alt={selectedGroup.name} style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', display: 'block' }} />
            )}
            <div style={{ padding: '10px 12px', fontSize: '12px', color: theme.textSecondary }}>This cover shows when you share the thread link on WhatsApp.</div>
          </div>
        ) : null}
        {inviteUrl && (
          <div style={styles.formRow}>
            <p style={styles.label}>Invite Link</p>
            <input
              style={{ ...styles.input, fontSize: '12px' }}
              value={inviteUrl}
              readOnly
              onFocus={(event) => event.target.select()}
            />
            {selectedGroup.settings?.joinPassword ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <p style={styles.label}>Thread password (share with invite)</p>
                <input
                  style={{ ...styles.input, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.08em' }}
                  value={selectedGroup.settings.joinPassword}
                  readOnly
                  onFocus={(event) => event.target.select()}
                />
              </div>
            ) : (
              <p style={styles.helperText}>Set a join password in Security so only invited people can enter.</p>
            )}
            <button
              type="button"
              style={styles.btn}
              onClick={async () => {
                try {
                  const password = String(selectedGroup.settings?.joinPassword || '').trim();
                  const text = password ? `${inviteUrl}\nPassword: ${password}` : inviteUrl;
                  await copyText(text);
                  reportStatus(password ? 'Invite URL + password copied.' : 'Invite URL copied.');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              📋 Copy invite{selectedGroup.settings?.joinPassword ? ' + password' : ''}
            </button>
            <button type="button" style={{ ...styles.btn, background: '#25D366', border: 'none', color: '#fff' }} onClick={openWhatsAppShare}>
              💬 Share on WhatsApp
            </button>
            {callUrl ? (
              <>
                    <label style={styles.helperText}>
                      <input
                        type="checkbox"
                        checked={isCurrentGroupMuted}
                        onChange={(event) => {
                          const groupId = selectedGroup?.id;
                          if (!groupId) return;
                          const nextSet = new Set(pushPreferences.mutedGroupIds || []);
                          if (event.target.checked) nextSet.add(groupId);
                          else nextSet.delete(groupId);
                          void updatePushPreferences({ mutedGroupIds: Array.from(nextSet) });
                        }}
                      />
                      {' '}Mute push for this group
                    </label>
                    <label style={styles.helperText}>
                      <input
                        type="checkbox"
                        checked={Boolean(pushPreferences.muteAll)}
                        onChange={(event) => {
                          void updatePushPreferences({ muteAll: event.target.checked });
                        }}
                      />
                      {' '}Mute all push notifications
                    </label>
                    <label style={styles.helperText}>
                      <input
                        type="checkbox"
                        checked={pushPreferences.wellnessReminderEnabled !== false}
                        onChange={(event) => {
                          void updatePushPreferences({ wellnessReminderEnabled: event.target.checked });
                        }}
                      />
                      {' '}Notify once daily if yesterday's activity is missing
                    </label>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnSecondary }}
                  onClick={async () => {
                    try {
                      await copyText(callUrl);
                      reportStatus('Call room link copied.');
                    } catch (error) {
                      reportError(error.message || 'Copy failed.');
                    }
                  }}
                >
                  📞 Copy Video Call Link
                </button>
                <button
                  type="button"
                  style={styles.btn}
                  onClick={() => handleJoinCall(callUrl)}
                >
                  🎥 Join Thread Video Call
                </button>
                {isInCurrentCall ? (
                  <button
                    type="button"
                    style={{ ...styles.btn, ...styles.btnSecondary }}
                    onClick={handleLeaveCall}
                  >
                    ⛔ Leave Call Presence
                  </button>
                ) : null}
                <div style={styles.formRow}>
                  <CallParticipantStrip
                    participants={callParticipants}
                    theme={theme}
                    getUserColor={getUserColor}
                    title="In call"
                  />
                </div>
              </>
            ) : null}
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
          <p style={styles.label}>Join password</p>
          <input
            style={styles.input}
            type="text"
            value={groupSettingsForm.joinPassword}
            onChange={(e) => setGroupSettingsForm((p) => ({ ...p, joinPassword: e.target.value }))}
            placeholder="Required password for invite link"
          />
          <p style={styles.helperText}>Share this password with the invite link. Clear the field and save to remove password protection.</p>
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
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBg, color: theme.textPrimary, fontFamily: theme.font, padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '320px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>💬</div>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: theme.textHeading }}>Loading chat…</p>
          <p style={{ margin: '8px 0 0', fontSize: '13px', color: theme.textMuted, lineHeight: 1.5 }}>{statusMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-root" style={styles.root}>
      {/* Mobile backdrop */}
      {isNarrowScreen && showSidebar ? <div style={styles.backdrop} className="sidebar-backdrop" onClick={() => setShowSidebar(false)} /> : null}

      {/* Sidebar */}
      <aside className={`chat-sidebar${showSidebar ? ' chat-sidebar--open' : ''}`} style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarAvatar}>{(user?.username || '?').slice(0, 2).toUpperCase()}</div>
          <span style={styles.sidebarUsername}>{user?.username || 'Loading…'}</span>
          <button type="button" title="Logout" style={{ ...styles.iconBtn, padding: '0 10px', minWidth: '70px', height: '28px', fontSize: '11px', fontWeight: 800 }} onClick={handleLogout}>Logout</button>
          <div style={{ ...styles.connDot, background: connectionState === 'connected' ? theme.green : connectionState === 'connecting' ? theme.orange : theme.red }} title={connectionState} />
        </div>

        <div style={styles.sidebarSearch}>
          <input style={styles.sidebarSearchInput} placeholder="Search threads & DMs…" value={sidebarFilter} onChange={(e) => setSidebarFilter(e.target.value)} />
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

          {activeChat && filteredGroups.length > 0 && (
            <>
              <p style={styles.sidebarSectionLabel}>In this thread tree</p>
              {filteredGroups.map(({ group, depth }) => {
                const chatKey = getChatKey({ type: 'group', id: group.id });
                const isActive = activeChat?.type === 'group' && activeChat?.id === group.id;
                const activeCallCount = Number(callStatusByGroup[group.id] || 0);
                return (
                  <button key={group.id} type="button" className="sidebar-item" style={{ ...styles.sidebarItem, paddingLeft: `${14 + depth * 12}px`, ...(isActive ? styles.sidebarItemActive : {}) }} onClick={() => { selectGroup(group); setShowSidebar(false); }}>
                    {group.coverImageUrl ? (
                      <img src={group.coverImageUrl} alt="" style={{ width: '34px', height: '34px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, border: `1px solid ${theme.cardBorder}` }} />
                    ) : (
                      <div style={{ ...styles.sidebarItemAvatar, background: getUserColor(group.name, theme), fontSize: '15px' }}>{depth ? '↳' : '#'}</div>
                    )}
                    <div style={styles.sidebarItemText}>
                      <div style={styles.sidebarItemName}>{group.name}</div>
                      <div style={styles.sidebarItemMeta}>{(group.memberships || []).length} members</div>
                    </div>
                    {activeCallCount > 0 ? <span style={{ ...styles.sidebarUnread, background: theme.green }}>{activeCallCount}📞</span> : null}
                    {unreadCounts[chatKey] ? <span style={styles.sidebarUnread}>{unreadCounts[chatKey]}</span> : null}
                  </button>
                );
              })}
            </>
          )}

          {!activeChat && (
            <div style={{ padding: '12px 14px', fontSize: 11, color: theme.textMuted, lineHeight: 1.5 }}>
              Trip threads live in the main panel →
            </div>
          )}

          {filteredFriends.length === 0 && !activeChat && bootstrap.incomingRequests.length === 0 && (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: '12px', lineHeight: 1.7 }}>
              {sidebarFilter ? 'No matches.' : 'No conversations yet.\nUse the buttons below to get started.'}
            </div>
          )}
        </div>

        <div style={styles.sidebarActions}>
          <button type="button" title="Add Buddy" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'buddy' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'buddy' ? '' : 'buddy')}>👤</button>
          <button type="button" title="Create Thread" style={{ ...styles.sidebarActionBtn, ...(showCreateThreadModal ? styles.sidebarActionBtnActive : {}) }} onClick={() => openCreateThreadModal()}>💬</button>
          <button type="button" title="Join Thread Link" style={{ ...styles.sidebarActionBtn, ...(showJoinThreadModal ? styles.sidebarActionBtnActive : {}) }} onClick={() => openJoinThreadModal()}>🔗</button>
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

      </aside>

      {/* Main chat area */}
      <main className={`chat-main-area${activeChat ? ' chat-main-area--thread' : ''}${activeChat && isNarrowScreen ? ' chat-main-area--thread-mobile' : ''}`} style={styles.main}>
        <div className={`chat-top-shell${activeChat ? ' chat-top-shell--thread' : ''}`}>
          <div style={styles.topBar} className="chat-top-bar">
            {activeChat ? (
              <button type="button" className="chat-back-btn" style={styles.hamburger} onClick={leaveActiveThread} aria-label="Back to threads">←</button>
            ) : (
              <button type="button" className="hamburger-btn" style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
            )}
            <div style={styles.topBarTitle}>
              <h2 style={styles.chatName}>
                {activeChat
                  ? activeChat.type === 'dm'
                    ? `@${activeChat.label || activeChat.name}`
                    : selectedGroup?.name || activeChat.label || activeChat.name
                  : hubTab === 'friends' ? 'Friends' : 'Threads & trips'}
              </h2>
              {activeChat && !isNarrowScreen ? (
                <p className="chat-top-meta-desktop" style={styles.chatMeta}>
                  {activeChat.type === 'dm'
                    ? (isUserOnline(activeChat.name) ? 'Online' : 'Offline')
                    : (selectedGroup?.description || `${selectedGroup?.memberships?.length || 0} members`)}
                </p>
              ) : !activeChat ? (
                <p style={styles.chatMeta}>
                  {!bootstrapReady
                    ? 'Loading…'
                    : hubTab === 'friends'
                      ? 'Tap a friend to chat'
                      : 'Pick a thread to start'}
                </p>
              ) : null}
            </div>
            <div style={styles.topBarIcons} className="chat-top-bar-icons">
              {selectedGroup && activeChat?.type === 'group' && isNarrowScreen ? (
                <div className="chat-mobile-tools">
                  {showMobileChatTool ? (
                    <button type="button" title="Chat" className="chat-mobile-tool" onClick={() => { setActivePanelTab(''); setShowInviteModal(false); }}>💬</button>
                  ) : null}
                  {showMobileAlbumsTool ? (
                    <button type="button" title="Albums" className="chat-mobile-tool" onClick={() => openThreadPanel('albums')}>📸</button>
                  ) : null}
                  {showMobileInviteTool ? (
                    <button type="button" title="Invite" className="chat-mobile-tool" onClick={() => openInviteModal()}>🔗</button>
                  ) : null}
                  <button type="button" title="Video call" className="chat-mobile-tool chat-mobile-tool--call" onClick={() => handleJoinCall(threadCallUrl)}>📞</button>
                </div>
              ) : null}
              <button type="button" title="Dashboard" className="chat-top-icon chat-top-icon--desktop" style={styles.iconBtn} onClick={() => router.push('/dashboard')}>🏠</button>
              <button type="button" title="Logout" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, padding: '0 10px', minWidth: '70px', fontSize: '11px', fontWeight: 800 }} onClick={handleLogout}>Logout</button>
              {activeChat?.type === 'dm' ? (
                <button
                  type="button"
                  title={isCurrentDmMuted ? 'Unmute DM push' : 'Mute DM push'}
                  className="chat-top-icon chat-top-icon--desktop"
                  style={{ ...styles.iconBtn, ...(isCurrentDmMuted ? styles.iconBtnActive : {}) }}
                  onClick={() => {
                    const target = normalizeUsername(activeChat.name);
                    const nextSet = new Set(pushPreferences.mutedUsernames || []);
                    if (nextSet.has(target)) nextSet.delete(target);
                    else nextSet.add(target);
                    void updatePushPreferences({ mutedUsernames: Array.from(nextSet) });
                  }}
                >
                  {isCurrentDmMuted ? '🔕' : '🔔'}
                </button>
              ) : null}
              <div className="chat-conn-dot" style={{ ...styles.connDot, background: connectionState === 'connected' ? theme.green : connectionState === 'connecting' ? theme.orange : theme.red }} title={connectionState} />
              {selectedGroup && !isNarrowScreen && (
                <>
                  <button type="button" title="Members" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'members' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'members' ? '' : 'members')}>👥</button>
                  <button type="button" title="Albums" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'albums' ? styles.iconBtnActive : {}) }} onClick={() => openThreadPanel(activePanelTab === 'albums' ? '' : 'albums')}>📸</button>
                  <button type="button" title="Bookmarks" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'bookmarks' ? styles.iconBtnActive : {}) }} onClick={() => openThreadPanel(activePanelTab === 'bookmarks' ? '' : 'bookmarks')}>🔖</button>
                  <button type="button" title="Invite" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(showInviteModal ? styles.iconBtnActive : {}) }} onClick={() => (showInviteModal ? closeInviteModal() : openInviteModal())}>🔗</button>
                  {isGroupOwner && <button type="button" title="Settings" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'settings' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'settings' ? '' : 'settings')}>⚙️</button>}
                </>
              )}
            </div>
          </div>
        </div>

        {selectedGroup?.shareToken && !isNarrowScreen ? (
          <div className="chat-thread-strip">
            <span className="chat-thread-strip-label">Thread link ready</span>
            <button
              type="button"
              className="chat-thread-strip-btn"
              onClick={async () => {
                try {
                  const inviteUrl = new URL(`/j/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString();
                  const password = String(selectedGroup.settings?.joinPassword || '').trim();
                  await copyText(password ? `${inviteUrl}\nPassword: ${password}` : inviteUrl);
                  reportStatus(password ? 'Invite link + password copied.' : 'Thread invite link copied.');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              Copy join link{selectedGroup.settings?.joinPassword ? ' + password' : ''}
            </button>
          </div>
        ) : null}

        {/* Body: thread folder, messages, or full-screen panel */}
        <div className={`chat-body${showChatHub ? ' chat-body--hub' : ''}${mobilePanelOpen ? ' chat-body--panel-open' : ''}${showVideoCall ? ' chat-body--in-call' : ''}`} style={styles.body}>
          {showChatHub ? (
            <>
              {pushSetupStatus !== 'ready' && pushSetupStatus !== 'pending' && user?.username ? (
                <div className="chat-push-banner">
                  <span className="chat-push-banner-text">
                    {pushSetupStatus === 'permission-denied'
                      ? 'Notifications are blocked — allow them to get message alerts when the app is closed.'
                      : pushSetupStatus === 'unsupported'
                        ? 'This browser does not support background push notifications.'
                        : 'Enable push notifications to get DM and group message alerts.'}
                  </span>
                  {pushSetupStatus !== 'unsupported' ? (
                    <button type="button" className="chat-push-banner-btn" onClick={() => void enablePushNotifications()}>
                      Enable alerts
                    </button>
                  ) : null}
                </div>
              ) : null}
            <ChatHomeHub
              theme={theme}
              user={user}
              threadRows={filteredThreadRows}
              allGroups={bootstrap.groups}
              friends={filteredFriends}
              recentMedia={recentThreadMedia}
              unreadCounts={unreadCounts}
              getChatKey={getChatKey}
              isUserOnline={isUserOnline}
              getUserColor={getUserColor}
              incomingRequests={bootstrap.incomingRequests}
              hubTab={hubTab}
              onHubTabChange={setHubTab}
              connectionState={connectionState}
              onOpenThread={(group) => openThread(group)}
              onOpenFriend={(friendName) => { selectFriend(friendName); setShowSidebar(false); }}
              onCreateThread={() => openCreateThreadModal()}
              onJoinThread={() => openJoinThreadModal()}
              onAcceptBuddy={handleAcceptBuddy}
              onMoveThread={handleMoveThread}
              isBootstrapLoading={!bootstrapReady}
            />
            </>
          ) : null}

          {selectedGroup && activeChat?.type === 'group' && !showChatHub && !mobilePanelOpen && !isNarrowScreen && threadCallUrl && !showVideoCall ? (
            <div className="chat-call-banner">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chat-call-banner-title">Thread video call</div>
                <div className="chat-call-banner-meta">
                  {callParticipants.length ? `${callParticipants.length} in call now` : 'Start or join the group video room'}
                </div>
                {callParticipants.length ? (
                  <div style={{ marginTop: '8px' }}>
                    <CallParticipantStrip
                      participants={callParticipants}
                      theme={theme}
                      getUserColor={getUserColor}
                      compact
                      title="On call"
                    />
                  </div>
                ) : null}
              </div>
              <button type="button" className="chat-call-banner-btn" onClick={() => handleJoinCall(threadCallUrl)}>
                {isInCurrentCall ? 'Open call' : 'Join call'}
              </button>
            </div>
          ) : null}

          {showVideoCall && threadCallUrl && selectedGroup && activeChat?.type === 'group' && !showChatHub && !mobilePanelOpen ? (
            <div className="chat-video-call-shell">
              <VideoCallPanel
                callUrl={threadCallUrl}
                user={user}
                threadName={selectedGroup?.name || activeChat?.name}
                participants={callParticipants}
                onLeave={handleLeaveCall}
                theme={theme}
                getUserColor={getUserColor}
              />
            </div>
          ) : null}

          {!showVideoCall && !showChatHub && !mobilePanelOpen && (!isAlbumsPanelOpen || !isNarrowScreen) ? (
          <>
          {renderThreadBrowseStrip()}
          <div ref={messagesContainerRef} className={`chat-messages${activeChat ? ' chat-messages--thread' : ''}`} style={styles.messages}>
            {visibleMessages.length ? visibleMessages.map((message) => {
              const isOwn = message.user === user?.username;
              const parsed = parseReplyEnvelope(message.text || message.gif || '');
              return (
                <div key={message.id || `${message.user}-${message.timestamp}`} className="msg-group" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className={isOwn ? 'msg-row-own' : 'msg-row-other'} style={{ ...styles.msgRow, ...(isOwn ? styles.msgRowOwn : styles.msgRowOther) }}>
                    {!isOwn && (
                      <div style={{ ...styles.msgAvatar, background: getUserColor(message.user || 'user', theme) }}>
                        {(message.user || 'U').slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', ...(isOwn ? { alignItems: 'flex-end' } : {}) }}>
                      {!isOwn && <span style={{ fontSize: '11px', fontWeight: 800, color: getUserColor(message.user || 'user', theme), paddingLeft: '2px' }}>{message.user}</span>}
                      <div style={{
                        ...(isOwn ? styles.msgBubbleOwn : styles.msgBubbleOther),
                        ...(message.pending ? { opacity: 0.72 } : {}),
                      }}>
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
                {!activeChat ? (
                  <>
                    <div style={{ fontSize: '48px', marginBottom: '4px' }}>🧵</div>
                    <p style={{ fontSize: '16px', fontWeight: 800, color: theme.textHeading, margin: 0 }}>Start a thread adventure</p>
                    <p style={{ fontSize: '13px', lineHeight: 1.65, margin: '6px 0 0', maxWidth: '320px' }}>
                      Create threads, share join links, and build nested photo albums — Family → Ooty → Day 2 hikes.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '14px' }}>
                      <button type="button" style={{ ...styles.btn, width: 'auto', padding: '10px 16px' }} onClick={() => openCreateThreadModal()}>+ New Thread</button>
                      <button type="button" style={{ ...styles.btn, ...styles.btnSecondary, width: 'auto', padding: '10px 16px' }} onClick={() => openJoinThreadModal()}>Join Link</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '40px', opacity: 0.35 }}>💬</div>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                      {activeChat.type === 'group' ? 'Thread is quiet — say hello or open Albums to share memories 👋' : 'No messages yet — say hello! 👋'}
                    </p>
                    {activeChat.type === 'group' ? (
                      <button type="button" style={{ ...styles.btn, width: 'auto', padding: '10px 16px', marginTop: '8px' }} onClick={() => setActivePanelTab('albums')}>Open Albums</button>
                    ) : null}
                  </>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          </>
          ) : null}

          {activePanelTab && selectedGroup && activePanelTab !== 'invite' ? (
            <div className={`side-panel${activePanelTab === 'albums' || activePanelTab === 'folders' || activePanelTab === 'media' ? ' side-panel--albums' : ''}${mobilePanelOpen ? ' side-panel--mobile-full' : ''}`} style={mobilePanelOpen ? { ...styles.sidePanel, width: '100%', borderLeft: 'none' } : styles.sidePanel}>
              <div className="side-panel-header-wrap" style={styles.sidePanelHeader}>
                <p style={styles.sidePanelTitle}>
                  {activePanelTab === 'members' ? '👥 Members' : activePanelTab === 'albums' || activePanelTab === 'folders' || activePanelTab === 'media' ? '📸 Albums' : activePanelTab === 'bookmarks' ? '🔖 Bookmarks' : activePanelTab === 'invite' ? '🔗 Share' : '⚙️ Settings'}
                </p>
                <button type="button" style={styles.sidePanelClose} onClick={() => setActivePanelTab('')} aria-label="Close panel">{isNarrowScreen ? '← Back' : '✕'}</button>
              </div>
              <div className="side-panel-content" style={styles.sidePanelContent}>
                {activePanelTab === 'members' && renderMembersPanel()}
                {(activePanelTab === 'albums' || activePanelTab === 'folders' || activePanelTab === 'media') && renderAlbumsPanel()}
                {activePanelTab === 'bookmarks' && renderBookmarksPanel()}
                {activePanelTab === 'settings' && renderSettingsPanel()}
              </div>
            </div>
          ) : null}
        </div>

        <div className={`chat-bottom-stack${activeChat && isNarrowScreen ? ' chat-bottom-stack--thread-mobile' : ''}${showVideoCall ? ' chat-bottom-stack--hidden' : ''}`}>
          {/* Typing bar */}
          {typingUsers.length > 0 ? (
            <div className="chat-typing-bar" style={styles.typingBar}>
              {`${typingUsers.join(', ')} is typing…`}
            </div>
          ) : null}

          {selectedGroup && activeChat?.type === 'group' && !isNarrowScreen ? (
            <div className="chat-thread-dock">
              {[
                { id: '', icon: '💬', label: 'Chat' },
                { id: 'albums', icon: '📸', label: 'Albums' },
                { id: 'invite', icon: '🔗', label: 'Invite' },
                { id: 'members', icon: '👥', label: 'People' },
                { id: 'bookmarks', icon: '🔖', label: 'Saved' },
                ...(isGroupOwner ? [{ id: 'settings', icon: '⚙️', label: 'Admin' }] : []),
              ].map((item) => {
                const isAlbums = item.id === 'albums' && isAlbumsPanelOpen;
                const isActive = item.id === '' ? !activePanelTab && !showInviteModal : (item.id === 'albums' ? isAlbums : item.id === 'invite' ? showInviteModal : activePanelTab === item.id);
                return (
                  <button
                    key={item.id || 'chat'}
                    type="button"
                    className={`chat-thread-dock-btn${isActive ? ' chat-thread-dock-btn--active' : ''}`}
                    onClick={() => (item.id === 'invite' ? (showInviteModal ? closeInviteModal() : openInviteModal()) : openThreadPanel(item.id))}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {activeChat && (!isNarrowScreen || !mobilePanelOpen) ? (
          <form className="chat-composer" style={styles.composer} onSubmit={handleSendMessage}>
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
            <button type="submit" className="chat-send-btn" style={styles.sendBtn} disabled={!activeChat || !composerText.trim()}>➤</button>
          </form>
          ) : null}
        </div>
      </main>

      {showCreateThreadModal ? (
        <div style={styles.modalBackdrop} onClick={() => setShowCreateThreadModal(false)} role="presentation">
          <form
            style={styles.modalPanel}
            onSubmit={handleCreateGroup}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-thread-title"
          >
            <div style={styles.modalHead}>
              <div>
                <h2 id="create-thread-title" style={styles.modalTitle}>Create trip thread</h2>
                <p style={{ ...styles.helperText, margin: '6px 0 0' }}>Example: Goa with family — then nest Day 1 albums inside.</p>
              </div>
              <button type="button" style={styles.modalCloseBtn} aria-label="Close" onClick={() => setShowCreateThreadModal(false)}>✕</button>
            </div>
            <button type="button" style={{ ...styles.btn, ...styles.btnSecondary, width: 'auto', padding: '10px 12px', marginBottom: '10px' }} onClick={() => threadCoverInputRef.current?.click()}>
              {threadCoverPreview ? 'Change cover photo/video' : '📷 Add cover photo/video'}
            </button>
            <input ref={threadCoverInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleThreadCoverPick} />
            {threadCoverPreview ? (
              <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}`, marginBottom: '10px' }}>
                {threadCoverFile && threadCoverFile.type.startsWith('video/') ? (
                  <video src={threadCoverPreview} style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block' }} muted playsInline />
                ) : (
                  <img src={threadCoverPreview} alt="Thread cover preview" style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', display: 'block' }} />
                )}
              </div>
            ) : (
              <p style={styles.helperText}>Cover appears on the invite link when you share on WhatsApp.</p>
            )}
            <input style={styles.input} value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} placeholder="Thread name (e.g. Goa family 2026)" autoFocus />
            <textarea style={{ ...styles.input, minHeight: '72px', resize: 'vertical' }} value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} placeholder="What is this thread about?" />
            <select style={styles.select} value={groupForm.parentGroupId} onChange={(e) => setGroupForm((p) => ({ ...p, parentGroupId: e.target.value }))}>
              <option value="">Top-level thread</option>
              {flattenedGroups.map(({ group, depth }) => (
                <option key={group.id} value={group.id}>{`${'— '.repeat(depth)}${group.name}`}</option>
              ))}
            </select>
            <details style={{
              border: `1px solid ${theme.inputBorder}`,
              borderRadius: '12px',
              background: theme.inputBg,
              overflow: 'hidden',
            }}>
              <summary style={{
                padding: '10px 12px',
                color: theme.textPrimary,
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                listStylePosition: 'inside',
              }}>
                Select friends ({Object.keys(groupForm.friendRoles || {}).length} selected)
              </summary>
              <div style={{
                display: 'grid',
                gap: '8px',
                maxHeight: '240px',
                overflowY: 'auto',
                padding: '4px 10px 10px',
              }}>
                {bootstrap.friends.length ? bootstrap.friends.map((friend) => {
                  const role = groupForm.friendRoles?.[friend] || '';
                  const selected = Boolean(role);
                  const setFriendRole = (nextRole) => {
                    setGroupForm((previous) => {
                      const friendRoles = { ...(previous.friendRoles || {}) };
                      if (nextRole) friendRoles[friend] = nextRole;
                      else delete friendRoles[friend];
                      return { ...previous, friendRoles };
                    });
                  };
                  return (
                    <div
                      key={friend}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: '10px',
                        alignItems: 'center',
                        padding: '9px 10px',
                        borderRadius: '10px',
                        border: `1px solid ${selected ? theme.blue : theme.cardBorder}`,
                        background: selected ? `${theme.blue}12` : theme.cardBg,
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => setFriendRole(event.target.checked ? 'member' : '')}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px', fontWeight: 700, color: theme.textPrimary }}>
                          @{friend}
                        </span>
                      </label>
                      {selected ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <label style={{ display: 'flex', gap: '4px', alignItems: 'center', color: theme.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={role === 'admin'}
                              onChange={(event) => setFriendRole(event.target.checked ? 'admin' : 'member')}
                            />
                            Admin
                          </label>
                          <label style={{ display: 'flex', gap: '4px', alignItems: 'center', color: theme.textMuted, fontSize: '11px', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={role === 'viewer'}
                              onChange={(event) => setFriendRole(event.target.checked ? 'viewer' : 'member')}
                            />
                            Viewer only
                          </label>
                        </div>
                      ) : null}
                    </div>
                  );
                }) : (
                  <p style={styles.helperText}>Add friends first, then select them for this thread.</p>
                )}
              </div>
            </details>
            <p style={{ ...styles.helperText, margin: '2px 0 0' }}>
              Selected friends are members by default. Admin can manage the thread; Viewer only cannot post.
            </p>
            <button type="submit" style={{ ...styles.btn, marginTop: '4px' }} disabled={creatingThread}>{creatingThread ? 'Creating…' : 'Create Thread'}</button>
          </form>
        </div>
      ) : null}

      {showInviteModal && selectedGroup ? (
        <div style={styles.modalBackdrop} onClick={closeInviteModal} role="presentation">
          <div
            style={styles.modalPanel}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-thread-title"
          >
            <div style={styles.modalHead}>
              <div>
                <h2 id="invite-thread-title" style={styles.modalTitle}>Invite & video call</h2>
                <p style={{ ...styles.helperText, margin: '6px 0 0' }}>Share {selectedGroup.name} or join the group video room.</p>
              </div>
              <button type="button" style={styles.modalCloseBtn} aria-label="Close" onClick={closeInviteModal}>✕</button>
            </div>
            {renderInvitePanel()}
          </div>
        </div>
      ) : null}

      {showJoinThreadModal ? (
        <div style={styles.modalBackdrop} onClick={() => setShowJoinThreadModal(false)} role="presentation">
          <form
            style={styles.modalPanel}
            onSubmit={handleJoinByToken}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-thread-title"
          >
            <div style={styles.modalHead}>
              <div>
                <h2 id="join-thread-title" style={styles.modalTitle}>Join thread with link</h2>
                <p style={{ ...styles.helperText, margin: '6px 0 0' }}>Paste the invite token from a friend.</p>
              </div>
              <button type="button" style={styles.modalCloseBtn} aria-label="Close" onClick={() => setShowJoinThreadModal(false)}>✕</button>
            </div>
            <input style={styles.input} value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Paste thread invite token" autoFocus />
            <input
              style={styles.input}
              type="password"
              value={joinPasswordInput}
              onChange={(e) => setJoinPasswordInput(e.target.value)}
              placeholder="Thread password (if required)"
            />
            <button type="submit" style={styles.btn}>Join Thread</button>
          </form>
        </div>
      ) : null}

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

      {!(activeChat && isNarrowScreen) ? (
      <MobileBottomNav
        theme={theme}
        activeId={showChatHub ? (hubTab === 'friends' ? 'friends' : 'threads') : 'chat'}
        hideSpacer
        items={showChatHub ? [
          { id: 'threads', label: 'Threads', icon: '🧵', onClick: () => setHubTab('threads') },
          { id: 'friends', label: 'Friends', icon: '👋', onClick: () => setHubTab('friends') },
          { id: 'create', label: 'New', icon: '➕', onClick: () => openCreateThreadModal() },
          { id: 'join', label: 'Join', icon: '🔗', onClick: () => openJoinThreadModal() },
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
        ] : [
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
          { id: 'chat', label: 'Threads', icon: '🧵', href: '/chat' },
          { id: 'posts', label: 'Posts', icon: '📷', href: '/dashboard?tab=posts' },
          { id: 'nifty', label: 'Nifty', icon: '📊', href: '/nifty-strategies' },
          { id: 'wellness', label: 'Well', icon: '💪', href: '/wellness' },
        ]}
      />
      ) : null}

      <style jsx>{`
        /* Mobile: sidebar is an overlay drawer; main fills the screen */
        @media (max-width: 720px) {
          .chat-root {
            position: relative;
            width: 100%;
          }
          .chat-main-area {
            width: 100%;
            flex: 1 1 auto;
            min-width: 0;
          }
          .chat-sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: min(92vw, 320px) !important;
            max-width: 320px;
            z-index: 40;
            transform: translateX(-105%);
            transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: none;
            pointer-events: none;
          }
          .chat-sidebar--open {
            transform: translateX(0);
            box-shadow: 4px 0 28px rgba(0,0,0,0.35);
            pointer-events: auto;
          }
          .sidebar-backdrop {
            z-index: 35;
          }
        }
        /* Desktop: sidebar always visible, hamburger hidden */
        @media (min-width: 721px) {
          .chat-sidebar {
            position: relative;
            transform: none !important;
            top: auto;
            left: auto;
            bottom: auto;
            box-shadow: none !important;
            pointer-events: auto;
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
        .chat-body--hub {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
        }
        .chat-push-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin: 10px 14px 0;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid ${theme.cardBorder};
          background: ${theme.blue}14;
          flex-shrink: 0;
        }
        .chat-push-banner-text {
          font-size: 12px;
          color: ${theme.textSecondary};
          line-height: 1.45;
          flex: 1;
          min-width: 200px;
        }
        .chat-push-banner-btn {
          border: none;
          border-radius: 999px;
          padding: 8px 14px;
          background: ${theme.blue};
          color: #fff;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          font-family: ${theme.font};
          flex-shrink: 0;
        }
        .chat-thread-mode-picker {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .chat-thread-mode-picker-btn {
          border: 1px solid ${theme.cardBorder};
          background: ${theme.cardBg};
          border-radius: 16px;
          padding: 16px 12px;
          cursor: pointer;
          text-align: center;
          font-family: inherit;
          color: inherit;
          display: grid;
          gap: 6px;
          justify-items: center;
        }
        .chat-thread-mode-picker-icon { font-size: 28px; }
        .chat-thread-mode-picker-label { font-size: 15px; font-weight: 900; color: ${theme.textHeading}; }
        .chat-thread-mode-picker-hint { font-size: 11px; color: ${theme.textMuted}; }
        @media (min-width: 721px) {
          .chat-push-banner {
            max-width: 920px;
            margin-left: auto;
            margin-right: auto;
            width: calc(100% - 28px);
          }
        }
        /* Side panel: overlay on mobile */
        @media (max-width: 720px) {
          .chat-main-area--thread-mobile .chat-top-bar {
            padding: 6px 10px;
            min-height: 48px;
            border-bottom: 1px solid ${theme.cardBorder};
            background: ${theme.panelBg};
          }
          .chat-main-area--thread-mobile .chat-top-bar-icons {
            gap: 2px;
          }
          .chat-mobile-tools {
            display: flex;
            align-items: center;
            gap: 2px;
            flex-shrink: 0;
          }
          .chat-mobile-tool {
            width: 32px;
            height: 32px;
            border: none;
            border-radius: 10px;
            background: transparent;
            color: ${theme.textSecondary};
            font-size: 15px;
            line-height: 1;
            display: grid;
            place-items: center;
            cursor: pointer;
            padding: 0;
            font-family: ${theme.font};
          }
          .chat-mobile-tool--active {
            background: ${theme.blue}22;
            color: ${theme.blue};
          }
          .chat-mobile-tool--call {
            background: ${theme.green}18;
            color: ${theme.green};
          }
          .chat-conn-dot { display: none; }
          .chat-call-banner {
            display: none;
          }
          .chat-messages--thread {
            padding: 10px 10px 6px !important;
            gap: 8px !important;
            background: ${theme.pageBg};
          }
          .chat-messages--thread .msg-row-own,
          .chat-messages--thread .msg-row-other {
            max-width: 86% !important;
          }
          .chat-body--panel-open {
            position: relative;
          }
          .chat-body--panel-open .chat-messages {
            display: none !important;
          }
          .side-panel--mobile-full {
            position: absolute !important;
            inset: 0 !important;
            z-index: 20 !important;
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          .side-panel--albums.side-panel--mobile-full .side-panel-header-wrap {
            display: none;
          }
          .side-panel--albums.side-panel--mobile-full .side-panel-content {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            padding: 8px 10px max(10px, env(safe-area-inset-bottom, 0px));
          }
          .side-panel--mobile-full .side-panel-header-wrap {
            flex-shrink: 0;
          }
          .chat-thread-folder {
            flex: 1;
            min-height: 0;
          }
          .chat-thread-folder-grid {
            grid-template-columns: 1fr !important;
          }
          .chat-top-icon--desktop { display: none !important; }
          .chat-back-btn { display: grid !important; }
          .chat-thread-dock { display: none !important; }
          .chat-bottom-stack--thread-mobile {
            padding-bottom: max(8px, env(safe-area-inset-bottom, 0px)) !important;
            background: ${theme.panelBg};
            border-top: 1px solid ${theme.cardBorder};
            box-shadow: 0 -2px 12px ${theme.shadow};
          }
          .chat-bottom-stack--thread-mobile .chat-typing-bar {
            min-height: 0;
            padding: 0 12px;
          }
          .chat-bottom-stack--thread-mobile .chat-typing-bar:empty {
            display: none;
          }
          .chat-main-area--thread-mobile .chat-composer {
            padding: 6px 10px max(8px, env(safe-area-inset-bottom, 0px));
            border-top: none;
            gap: 6px;
          }
          .chat-main-area--thread-mobile .chat-composer textarea {
            min-height: 38px !important;
            max-height: 96px;
            padding: 8px 14px !important;
            font-size: 15px !important;
            border-radius: 20px !important;
          }
          .chat-main-area--thread-mobile .chat-send-btn {
            width: 38px !important;
            height: 38px !important;
            border-radius: 12px !important;
            font-size: 16px !important;
          }
          .chat-main-area--thread-mobile {
            min-height: 0;
          }
          .chat-main-area--thread-mobile .chat-body {
            flex: 1;
            min-height: 0;
          }
          .expansion-panel-mobile {
            max-height: min(52vh, 420px) !important;
          }
          .chat-thread-strip {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 8px 12px;
            border-bottom: 1px solid ${theme.cardBorder};
            background: linear-gradient(90deg, ${theme.blue}18, ${theme.purple}12);
          }
          .chat-thread-strip-label {
            font-size: 11px;
            font-weight: 800;
            color: ${theme.textHeading};
          }
          .chat-thread-strip-btn {
            border: none;
            border-radius: 999px;
            padding: 7px 12px;
            background: ${theme.blue};
            color: #fff;
            font-size: 10px;
            font-weight: 800;
            cursor: pointer;
            font-family: ${theme.font};
          }
        }
        @media (min-width: 681px) {
          .chat-thread-dock { display: none; }
          .chat-thread-strip { display: none; }
        }
        @media (min-width: 721px) {
          .chat-back-btn { display: grid !important; }
          .chat-mobile-tool { display: none; }
          .chat-call-banner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin: 0 12px 8px;
            padding: 10px 12px;
            border-radius: 14px;
            border: 1px solid ${theme.cardBorder};
            background: ${theme.cardBg};
            flex-shrink: 0;
          }
          .chat-call-banner-title { font-size: 13px; font-weight: 800; color: ${theme.textHeading}; }
          .chat-call-banner-meta { font-size: 11px; color: ${theme.textMuted}; margin-top: 2px; }
          .chat-call-banner-btn {
            border: none;
            border-radius: 999px;
            padding: 8px 14px;
            background: ${theme.green};
            color: #fff;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
            font-family: ${theme.font};
            white-space: nowrap;
          }
        }
        /* Keep composer above fixed mobile bottom nav (hub only) */
        @media (max-width: 720px) {
          .chat-bottom-stack:not(.chat-bottom-stack--thread-mobile) {
            flex-shrink: 0;
            position: relative;
            z-index: 50;
            padding-bottom: calc(84px + env(safe-area-inset-bottom, 0px));
            background: ${theme.panelBg};
          }
          .chat-composer {
            padding-bottom: max(10px, env(safe-area-inset-bottom, 0px));
          }
          .chat-messages {
            padding-bottom: 12px;
          }
        }
      `}</style>
    </div>
  );
}
