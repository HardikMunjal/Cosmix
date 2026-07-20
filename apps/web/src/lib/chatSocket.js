export function resolveChatSocketClient() {
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

export function mergeChatMessages(previous, incoming) {
  const map = new Map();
  [...(previous || []), ...(incoming || [])].forEach((message) => {
    const key = message?.id || `${message?.user || 'user'}-${message?.timestamp || ''}-${message?.text || ''}`;
    map.set(key, message);
  });
  return [...map.values()].sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
}
