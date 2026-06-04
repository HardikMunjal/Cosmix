import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCachedClientUser, logoutClientSession, persistClientUser } from '../lib/auth-client';
import { ChatAlbumGallery } from '../lib/ChatAlbumGallery';
import { MobileBottomNav } from '../lib/MobileNav';
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

function base64UrlToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
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
  const [callParticipants, setCallParticipants] = useState([]);
  const [joinedCallRoom, setJoinedCallRoom] = useState('');
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
  const pushSubscribedRef = useRef(false);
  const callRoomRef = useRef('');
  const socketRef = useRef(null);
  const socketConnectErrorShownRef = useRef(false);
  const userRef = useRef(null);

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

  const mobilePanelOpen = isNarrowScreen && Boolean(activePanelTab && selectedGroup);
  const mobileShowThreadFolder = isNarrowScreen && !activeChat;

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
    if (typeof window === 'undefined' || !user?.username || pushSubscribedRef.current) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;

    let cancelled = false;
    (async () => {
      try {
        const permission = window.Notification.permission === 'default'
          ? await window.Notification.requestPermission()
          : window.Notification.permission;
        if (permission !== 'granted') return;

        const registration = await navigator.serviceWorker.register('/push-sw.js');
        const readyRegistration = await navigator.serviceWorker.ready;
        const keyResponse = await fetch(`${chatApiBase}/push/public-key`);
        const keyPayload = await readJsonResponse(keyResponse);
        const publicKey = String(keyPayload?.publicKey || '').trim();
        if (!publicKey) return;

        const existingSubscription = await readyRegistration.pushManager.getSubscription();
        const subscription = existingSubscription || await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey),
        });

        await fetch(`${chatApiBase}/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actorUsername: user.username, subscription }),
        }).then(readJsonResponse);

        if (!cancelled) {
          pushSubscribedRef.current = true;
          reportStatus('Web push notifications enabled.');
        }
      } catch (_) {
        // Push setup is best-effort and should not break chat.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatApiBase, user?.username]);

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
    fetchBootstrap().then(() => {
      setStatusMessage('Ready');
    }).catch((error) => {
      const message = String(error?.message || 'Could not load chat data.');
      if (/ECONNREFUSED|fetch failed|502|503|504/i.test(message)) {
        reportError('Chat API is offline. Start chat-service on port 3002 (run npm run dev from Cosmix/).');
      } else {
        reportError(message);
      }
    });
  }, [user?.username]);

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
          memberUsernames: parseCommaList(groupForm.members),
          viewerUsernames: parseCommaList(groupForm.viewers),
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

      setGroupForm({ name: '', description: '', parentGroupId: '', members: '', viewers: '' });
      setThreadCoverFile(null);
      setThreadCoverPreview('');
      setSidebarPanel('');
      const createdGroup = payload.groups?.find((group) => group.id === createdGroupId);
      if (createdGroup) {
        openThread(createdGroup);
        setActivePanelTab('invite');
      } else {
        setShowSidebar(false);
        setActivePanelTab('');
      }
      reportStatus('Thread created. Copy or share the invite link!');
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

  function openThreadPanel(tab) {
    setActivePanelTab(tab);
    if (isNarrowScreen) setShowSidebar(false);
  }

  function leaveActiveThread() {
    setActivePanelTab('');
    setActiveChat(null);
    setShowSidebar(false);
  }

  function openThread(group) {
    selectChat({ type: 'group', id: group.id, name: group.name, label: group.name });
    setActivePanelTab('');
    setShowSidebar(false);
  }

  function selectGroup(group) {
    openThread(group);
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
    const message = `${selectedGroup.name}${selectedGroup.description ? ` — ${selectedGroup.description}` : ''}\nJoin our thread on Cosmix:\n${inviteUrl}`;
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
    const chatSocket = socketRef.current;
    if (!callPresenceRoom || !chatSocket?.connected) {
      if (callUrl) {
        window.open(callUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    chatSocket.emit('call_join', { room: callPresenceRoom });
    setJoinedCallRoom(callPresenceRoom);
    if (callUrl) {
      window.open(callUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function handleLeaveCall() {
    const chatSocket = socketRef.current;
    if (!joinedCallRoom || !chatSocket?.connected) return;
    chatSocket.emit('call_leave', { room: joinedCallRoom });
    setJoinedCallRoom('');
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

  // ── panel render helpers ────────────────────────────────────────────────
  function renderThreadFolderLibrary() {
    const childCountFor = (groupId) => bootstrap.groups.filter((g) => g.parentGroupId === groupId).length;

    return (
      <div className="chat-thread-folder" style={styles.threadFolderScroll}>
        <div style={styles.threadFolderHeader}>
          <div>
            <h2 style={styles.threadFolderTitle}>Your threads</h2>
            <p style={styles.threadFolderSubtitle}>
              Each thread has its own chat, photo albums, and share link. Tap a folder to open it.
            </p>
          </div>
          <button
            type="button"
            style={{ ...styles.btn, width: 'auto', padding: '10px 12px', flexShrink: 0 }}
            onClick={() => { setShowSidebar(true); setSidebarPanel('group'); }}
          >
            + New
          </button>
        </div>

        {filteredTopLevelThreads.length ? (
          <div className="chat-thread-folder-grid" style={styles.threadFolderGrid}>
            {filteredTopLevelThreads.map((group) => {
              const albumCount = (group.folders || []).length;
              const mediaCount = (group.images || []).length;
              const subs = childCountFor(group.id);
              const chatKey = getChatKey({ type: 'group', id: group.id });
              return (
                <button key={group.id} type="button" style={styles.threadFolderCard} onClick={() => openThread(group)}>
                  <div style={styles.threadFolderCover}>
                    {group.coverImageUrl ? (
                      group.coverMediaType === 'video' ? (
                        <video src={group.coverImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                      ) : (
                        <img src={group.coverImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: '28px', opacity: 0.9 }}>🧵</div>
                    )}
                    {unreadCounts[chatKey] ? (
                      <span style={{ position: 'absolute', top: '8px', right: '8px', ...styles.sidebarUnread }}>{unreadCounts[chatKey]}</span>
                    ) : null}
                  </div>
                  <div style={styles.threadFolderBody}>
                    <div style={styles.threadFolderName}>{group.name}</div>
                    <div style={styles.threadFolderMeta}>
                      {group.memberships?.length || 0} members · {albumCount} album{albumCount === 1 ? '' : 's'} · {mediaCount} media
                      {subs > 0 ? ` · ${subs} sub-thread${subs === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '44px', marginBottom: '6px' }}>📁</div>
            <p style={{ fontSize: '15px', fontWeight: 800, color: theme.textHeading, margin: 0 }}>No threads yet</p>
            <p style={{ fontSize: '13px', lineHeight: 1.6, margin: '8px 0 0', maxWidth: '300px' }}>
              Create a thread for family, trips, or teams. Each thread keeps separate chat and albums.
            </p>
            <button type="button" style={{ ...styles.btn, width: 'auto', padding: '10px 16px', marginTop: '12px' }} onClick={() => { setShowSidebar(true); setSidebarPanel('group'); }}>
              Create first thread
            </button>
          </div>
        )}

        {filteredFriends.length > 0 ? (
          <div style={{ marginTop: '20px' }}>
            <p style={styles.sidebarSectionLabel}>Direct messages</p>
            <div style={{ display: 'grid', gap: '6px' }}>
              {filteredFriends.map((friendName) => (
                <button
                  key={friendName}
                  type="button"
                  style={{ ...styles.sidebarItem, borderRadius: '14px', background: theme.cardBg, border: `1px solid ${theme.cardBorder}` }}
                  onClick={() => selectFriend(friendName)}
                >
                  <div style={{ ...styles.sidebarItemAvatar, background: getUserColor(friendName, theme) }}>{friendName.slice(0, 2).toUpperCase()}</div>
                  <div style={styles.sidebarItemText}>
                    <div style={styles.sidebarItemName}>{friendName}</div>
                    <div style={styles.sidebarItemMeta}>{isUserOnline(friendName) ? 'Online' : 'Offline'}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

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
            <button
              type="button"
              style={styles.btn}
              onClick={async () => {
                try {
                  await copyText(inviteUrl);
                  reportStatus('Invite URL copied.');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              📋 Copy URL Only
            </button>
            <button type="button" style={{ ...styles.btn, background: '#25D366', border: 'none', color: '#fff' }} onClick={openWhatsAppShare}>
              💬 Share URL on WhatsApp
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
                      {' '}Enable daily wellness reminder push
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
                  <p style={styles.label}>In Call ({callParticipants.length})</p>
                  {callParticipants.length ? callParticipants.map((participant) => (
                    <div key={`${participant.username}-${participant.joinedAt}`} style={styles.listItem}>
                      <div style={styles.listItemText}>
                        <div style={styles.listItemTitle}>{participant.username}</div>
                        <div style={styles.listItemMeta}>Joined call</div>
                      </div>
                    </div>
                  )) : <p style={styles.helperText}>No one is in the thread call yet.</p>}
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

          {filteredGroups.length > 0 && (
            <>
              <p style={styles.sidebarSectionLabel}>Thread folders</p>
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

          {filteredFriends.length === 0 && filteredGroups.length === 0 && bootstrap.incomingRequests.length === 0 && (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: theme.textMuted, fontSize: '12px', lineHeight: 1.7 }}>
              {sidebarFilter ? 'No matches.' : 'No conversations yet.\nUse the buttons below to get started.'}
            </div>
          )}
        </div>

        <div style={styles.sidebarActions}>
          <button type="button" title="Add Buddy" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'buddy' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'buddy' ? '' : 'buddy')}>👤</button>
          <button type="button" title="Create Thread" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'group' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'group' ? '' : 'group')}>💬</button>
          <button type="button" title="Join Thread Link" style={{ ...styles.sidebarActionBtn, ...(sidebarPanel === 'token' ? styles.sidebarActionBtnActive : {}) }} onClick={() => setSidebarPanel(sidebarPanel === 'token' ? '' : 'token')}>🔗</button>
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
          <form className="expansion-panel-mobile" style={styles.expansionPanel} onSubmit={handleCreateGroup}>
            <p style={styles.sectionTitle}>Create Thread</p>
            <button type="button" style={{ ...styles.btn, ...styles.btnSecondary, width: 'auto', padding: '10px 12px' }} onClick={() => threadCoverInputRef.current?.click()}>
              {threadCoverPreview ? 'Change cover photo/video' : '📷 Add cover photo/video'}
            </button>
            <input ref={threadCoverInputRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={handleThreadCoverPick} />
            {threadCoverPreview ? (
              <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${theme.cardBorder}` }}>
                {threadCoverFile && threadCoverFile.type.startsWith('video/') ? (
                  <video src={threadCoverPreview} style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', display: 'block' }} muted playsInline />
                ) : (
                  <img src={threadCoverPreview} alt="Thread cover preview" style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', display: 'block' }} />
                )}
              </div>
            ) : (
              <p style={styles.helperText}>Cover appears on the invite link when you share on WhatsApp.</p>
            )}
            <input style={styles.input} value={groupForm.name} onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))} placeholder="Thread name (e.g. Family trips)" />
            <textarea style={{ ...styles.input, minHeight: '52px', resize: 'vertical' }} value={groupForm.description} onChange={(e) => setGroupForm((p) => ({ ...p, description: e.target.value }))} placeholder="What is this thread about?" />
            <select style={styles.select} value={groupForm.parentGroupId} onChange={(e) => setGroupForm((p) => ({ ...p, parentGroupId: e.target.value }))}>
              <option value="">Top-level thread</option>
              {bootstrap.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input style={styles.input} value={groupForm.members} onChange={(e) => setGroupForm((p) => ({ ...p, members: e.target.value }))} placeholder="Members (comma separated)" />
            <input style={styles.input} value={groupForm.viewers} onChange={(e) => setGroupForm((p) => ({ ...p, viewers: e.target.value }))} placeholder="Viewers (comma separated)" />
            <button type="submit" style={styles.btn} disabled={creatingThread}>{creatingThread ? 'Creating…' : 'Create Thread'}</button>
          </form>
        )}

        {sidebarPanel === 'token' && (
          <form style={styles.expansionPanel} onSubmit={handleJoinByToken}>
            <p style={styles.sectionTitle}>Join Thread</p>
            <input style={styles.input} value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Paste thread invite token" />
            <button type="submit" style={styles.btn}>Join Thread</button>
          </form>
        )}
      </aside>

      {/* Main chat area */}
      <main className="chat-main-area" style={styles.main}>
        {/* Top bar */}
        <div style={styles.topBar}>
          {isNarrowScreen && activeChat ? (
            <button type="button" className="chat-back-btn" style={styles.hamburger} onClick={leaveActiveThread} aria-label="Back to threads">←</button>
          ) : (
            <button type="button" className="hamburger-btn" style={styles.hamburger} onClick={() => setShowSidebar(true)}>☰</button>
          )}
          <div style={styles.topBarTitle}>
            <h2 style={styles.chatName}>
              {activeChat
                ? activeChat.type === 'dm'
                  ? `@${activeChat.label || activeChat.name}`
                  : `#${activeChat.label || activeChat.name}`
                : 'Cosmix Threads'}
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
            <button type="button" title="Dashboard" className="chat-top-icon chat-top-icon--desktop" style={styles.iconBtn} onClick={() => router.push('/dashboard')}>🏠</button>
            <button type="button" title="Logout" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, padding: '0 10px', minWidth: '70px', fontSize: '11px', fontWeight: 800 }} onClick={handleLogout}>Logout</button>
            {activeChat?.type === 'dm' ? (
              <button
                type="button"
                title={isCurrentDmMuted ? 'Unmute DM push' : 'Mute DM push'}
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
            <div style={{ ...styles.connDot, background: connectionState === 'connected' ? theme.green : connectionState === 'connecting' ? theme.orange : theme.red }} title={connectionState} />
            {selectedGroup && (
              <>
                <button type="button" title="Members" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'members' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'members' ? '' : 'members')}>👥</button>
                <button type="button" title="Albums" className="chat-top-icon" style={{ ...styles.iconBtn, ...(activePanelTab === 'albums' ? styles.iconBtnActive : {}) }} onClick={() => openThreadPanel(activePanelTab === 'albums' ? '' : 'albums')}>📸</button>
                <button type="button" title="Bookmarks" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'bookmarks' ? styles.iconBtnActive : {}) }} onClick={() => openThreadPanel(activePanelTab === 'bookmarks' ? '' : 'bookmarks')}>🔖</button>
                <button type="button" title="Invite" className="chat-top-icon" style={{ ...styles.iconBtn, ...(activePanelTab === 'invite' ? styles.iconBtnActive : {}) }} onClick={() => openThreadPanel(activePanelTab === 'invite' ? '' : 'invite')}>🔗</button>
                {isGroupOwner && <button type="button" title="Settings" className="chat-top-icon chat-top-icon--desktop" style={{ ...styles.iconBtn, ...(activePanelTab === 'settings' ? styles.iconBtnActive : {}) }} onClick={() => setActivePanelTab(activePanelTab === 'settings' ? '' : 'settings')}>⚙️</button>}
              </>
            )}
          </div>
        </div>

        {selectedGroup?.shareToken && (
          <div className="chat-thread-strip">
            <span className="chat-thread-strip-label">Thread link ready</span>
            <button
              type="button"
              className="chat-thread-strip-btn"
              onClick={async () => {
                try {
                  const inviteUrl = new URL(`/j/${encodeURIComponent(String(selectedGroup.shareToken || '').trim())}`, window.location.origin).toString();
                  await copyText(inviteUrl);
                  reportStatus('Thread invite link copied.');
                } catch (error) {
                  reportError(error.message || 'Copy failed.');
                }
              }}
            >
              Copy join link
            </button>
          </div>
        )}

        {selectedGroup && childGroups.length > 0 && !mobilePanelOpen ? (
          <div className="chat-thread-substrip" style={styles.threadSubStrip}>
            {childGroups.map((g) => (
              <button key={g.id} type="button" style={styles.threadSubChip} onClick={() => openThread(g)}>↳ {g.name}</button>
            ))}
          </div>
        ) : null}

        {/* Body: thread folder, messages, or full-screen panel */}
        <div className={`chat-body${mobilePanelOpen ? ' chat-body--panel-open' : ''}`} style={styles.body}>
          {mobileShowThreadFolder ? (
            renderThreadFolderLibrary()
          ) : null}

          {!mobileShowThreadFolder && !mobilePanelOpen ? (
          <div ref={messagesContainerRef} className="chat-messages" style={styles.messages}>
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
                      <button type="button" style={{ ...styles.btn, width: 'auto', padding: '10px 16px' }} onClick={() => { setShowSidebar(true); setSidebarPanel('group'); }}>+ New Thread</button>
                      <button type="button" style={{ ...styles.btn, ...styles.btnSecondary, width: 'auto', padding: '10px 16px' }} onClick={() => { setShowSidebar(true); setSidebarPanel('token'); }}>Join Link</button>
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
          ) : null}

          {activePanelTab && selectedGroup ? (
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
                {activePanelTab === 'invite' && renderInvitePanel()}
                {activePanelTab === 'settings' && renderSettingsPanel()}
              </div>
            </div>
          ) : null}
        </div>

        <div className="chat-bottom-stack">
          {/* Typing bar */}
          <div style={styles.typingBar}>
            {typingUsers.length ? `${typingUsers.join(', ')} is typing…` : ''}
          </div>

          {selectedGroup && activeChat?.type === 'group' ? (
            <div className="chat-thread-dock">
              {[
                { id: '', icon: '💬', label: 'Chat' },
                { id: 'albums', icon: '📸', label: 'Albums' },
                { id: 'invite', icon: '🔗', label: 'Share' },
                { id: 'members', icon: '👥', label: 'People' },
                { id: 'bookmarks', icon: '🔖', label: 'Saved' },
                ...(isGroupOwner ? [{ id: 'settings', icon: '⚙️', label: 'Admin' }] : []),
              ].map((item) => {
                const isAlbums = item.id === 'albums' && (activePanelTab === 'albums' || activePanelTab === 'folders' || activePanelTab === 'media');
                const isActive = item.id === '' ? !activePanelTab : (item.id === 'albums' ? isAlbums : activePanelTab === item.id);
                return (
                  <button
                    key={item.id || 'chat'}
                    type="button"
                    className={`chat-thread-dock-btn${isActive ? ' chat-thread-dock-btn--active' : ''}`}
                    onClick={() => openThreadPanel(item.id)}
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
            <button type="submit" style={styles.sendBtn} disabled={!activeChat || !composerText.trim()}>➤</button>
          </form>
          ) : null}
        </div>
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

      <MobileBottomNav
        theme={theme}
        activeId="chat"
        hideSpacer
        items={[
          { id: 'home', label: 'Home', icon: '🏠', href: '/dashboard' },
          { id: 'chat', label: 'Chat', icon: '💬', href: '/chat' },
          { id: 'posts', label: 'Posts', icon: '📷', href: '/dashboard?tab=posts' },
          { id: 'nifty', label: 'Nifty', icon: '📊', href: '/nifty-strategies' },
          { id: 'wellness', label: 'Well', icon: '💪', href: '/wellness' },
        ]}
      />

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
        /* Side panel: overlay on mobile */
        @media (max-width: 720px) {
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
          .side-panel--albums.side-panel--mobile-full .side-panel-content {
            flex: 1 1 auto;
            min-height: 0;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px));
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
          .chat-thread-dock {
            display: flex;
            gap: 6px;
            padding: 8px 10px;
            border-top: 1px solid ${theme.cardBorder};
            background: ${theme.panelBg};
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          .chat-thread-dock-btn {
            border: 1px solid ${theme.cardBorder};
            background: ${theme.cardBg};
            color: ${theme.textSecondary};
            border-radius: 12px;
            padding: 8px 10px;
            font-size: 10px;
            font-weight: 800;
            font-family: ${theme.font};
            cursor: pointer;
            flex: 1 0 auto;
            min-width: 64px;
            display: grid;
            gap: 2px;
            justify-items: center;
          }
          .expansion-panel-mobile {
            max-height: min(52vh, 420px) !important;
          }
          .chat-thread-dock-btn--active {
            background: ${theme.blue}22;
            border-color: ${theme.blue};
            color: ${theme.blue};
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
        @media (max-width: 720px) {
          .chat-thread-dock { display: flex; }
        }
        @media (min-width: 721px) {
          .chat-back-btn { display: none !important; }
        }
        /* Keep composer + send above fixed mobile bottom nav */
        @media (max-width: 720px) {
          .chat-bottom-stack {
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
