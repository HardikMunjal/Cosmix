import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveAvatarPresentation } from './avatarProfile';

const JITSI_DOMAIN = 'meet.jit.si';

function loadJitsiScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Video calls are only available in the browser.'));
  }
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-cosmix-jitsi]');
    if (existing) {
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Could not load video call SDK.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `https://${JITSI_DOMAIN}/external_api.js`;
    script.async = true;
    script.dataset.cosmixJitsi = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load video call SDK.'));
    document.head.appendChild(script);
  });
}

function parseRoomName(callUrl) {
  try {
    const url = new URL(callUrl);
    return url.pathname.replace(/^\//, '');
  } catch {
    return String(callUrl || '').replace(/^https?:\/\/[^/]+\//, '');
  }
}

function CallParticipantAvatar({ participant, theme, getUserColor, size = 44, showName = true }) {
  const presentation = resolveAvatarPresentation(participant?.avatar || '');
  const label = participant?.name || participant?.username || 'User';
  const initials = String(label).slice(0, 2).toUpperCase();
  const color = getUserColor?.(participant?.username || label, theme) || theme?.blue || '#3b82f6';

  return (
    <div className="call-participant-chip" style={{ width: showName ? '72px' : `${size}px` }}>
      <div
        className="call-participant-avatar"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          border: `2px solid ${theme?.green || '#22c55e'}`,
          boxShadow: `0 0 0 2px ${theme?.cardBg || '#111'}`,
          background: color,
          display: 'grid',
          placeItems: 'center',
          color: '#fff',
          fontWeight: 800,
          fontSize: `${Math.max(11, Math.round(size * 0.32))}px`,
          flexShrink: 0,
        }}
      >
        {presentation.displaySrc ? (
          <img
            src={presentation.displaySrc}
            alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          initials
        )}
      </div>
      {showName ? (
        <div
          className="call-participant-name"
          style={{
            marginTop: '4px',
            fontSize: '10px',
            fontWeight: 700,
            color: theme?.textSecondary || '#cbd5e1',
            textAlign: 'center',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            width: '100%',
          }}
          title={label}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}

export function CallParticipantStrip({
  participants = [],
  theme,
  getUserColor,
  title = 'On call',
  compact = false,
}) {
  if (!participants.length) {
    return (
      <div className="call-participant-strip call-participant-strip--empty" style={{ color: theme?.textMuted, fontSize: '12px' }}>
        No one is in the call yet.
      </div>
    );
  }

  return (
    <div className={`call-participant-strip${compact ? ' call-participant-strip--compact' : ''}`}>
      <div style={{ fontSize: compact ? '11px' : '12px', fontWeight: 800, color: theme?.textHeading, marginBottom: compact ? '6px' : '8px' }}>
        {title} ({participants.length})
      </div>
      <div
        className="call-participant-strip-row"
        style={{
          display: 'flex',
          gap: compact ? '8px' : '10px',
          overflowX: 'auto',
          paddingBottom: '2px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {participants.map((participant) => (
          <CallParticipantAvatar
            key={`${participant.username}-${participant.joinedAt || ''}`}
            participant={participant}
            theme={theme}
            getUserColor={getUserColor}
            size={compact ? 36 : 44}
            showName={!compact}
          />
        ))}
      </div>
    </div>
  );
}

export function VideoCallPanel({
  callUrl,
  user,
  threadName,
  participants = [],
  onLeave,
  theme,
  getUserColor,
}) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avatarByUsername, setAvatarByUsername] = useState({});

  const enrichedParticipants = useMemo(() => (
    participants.map((participant) => {
      const username = String(participant?.username || '').trim();
      const lookup = avatarByUsername[username.toLowerCase()] || {};
      return {
        ...participant,
        name: lookup.name || participant?.name || username,
        avatar: participant?.avatar || lookup.avatar || '',
      };
    })
  ), [avatarByUsername, participants]);

  useEffect(() => {
    const missing = Array.from(new Set(
      participants
        .filter((participant) => participant?.username && !participant?.avatar)
        .map((participant) => participant.username),
    ));
    if (!missing.length) return undefined;

    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/chat/buddy-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ usernames: missing }),
        });
        const payload = await response.json();
        if (!active) return;
        const next = {};
        (Array.isArray(payload?.results) ? payload.results : []).forEach((entry) => {
          const key = String(entry?.username || '').trim().toLowerCase();
          if (!key) return;
          next[key] = {
            name: entry.name || entry.username,
            avatar: entry.avatar || '',
          };
        });
        setAvatarByUsername((previous) => ({ ...previous, ...next }));
      } catch (_) {
        // Avatar enrichment is best-effort.
      }
    })();

    return () => {
      active = false;
    };
  }, [participants]);

  const handleLeave = useCallback(() => {
    if (apiRef.current) {
      try {
        apiRef.current.dispose();
      } catch (_) {
        // ignore dispose errors
      }
      apiRef.current = null;
    }
    onLeave?.();
  }, [onLeave]);

  useEffect(() => {
    let disposed = false;
    const roomName = parseRoomName(callUrl);
    if (!roomName || !containerRef.current) return undefined;

    setLoading(true);
    setError('');

    loadJitsiScript()
      .then(() => {
        if (disposed || !containerRef.current) return;
        const displayName = String(user?.name || user?.username || 'Guest').trim();
        const email = String(user?.email || '').trim();

        const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          width: '100%',
          height: '100%',
          userInfo: {
            displayName,
            ...(email ? { email } : {}),
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            requireDisplayName: false,
            enableWelcomePage: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            subject: threadName || 'Cosmix group call',
            defaultLanguage: 'en',
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            MOBILE_APP_PROMO: false,
            DISPLAY_WELCOME_PAGE_CONTENT: false,
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'desktop',
              'fullscreen',
              'hangup',
              'chat',
              'raisehand',
              'tileview',
              'participants-pane',
              'settings',
            ],
          },
        });

        apiRef.current = api;
        api.addListener('readyToClose', handleLeave);
        api.addListener('videoConferenceLeft', handleLeave);
        if (!disposed) setLoading(false);
      })
      .catch((err) => {
        if (!disposed) {
          setError(err?.message || 'Could not load video call.');
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      if (apiRef.current) {
        try {
          apiRef.current.dispose();
        } catch (_) {
          // ignore dispose errors
        }
        apiRef.current = null;
      }
    };
  }, [callUrl, handleLeave, threadName, user?.email, user?.name, user?.username]);

  return (
    <div
      className="chat-video-call-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        flex: '1 1 auto',
        background: theme?.pageBg || '#0b1220',
        border: `1px solid ${theme?.cardBorder || 'rgba(255,255,255,0.08)'}`,
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        className="chat-video-call-header"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 14px',
          borderBottom: `1px solid ${theme?.cardBorder || 'rgba(255,255,255,0.08)'}`,
          background: theme?.panelBg || '#111827',
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: theme?.textHeading }}>{threadName || 'Group video call'}</div>
          <div style={{ fontSize: '11px', color: theme?.textMuted, marginTop: '2px' }}>
            Signed in as {user?.name || user?.username}
          </div>
          <div style={{ marginTop: '10px' }}>
            <CallParticipantStrip
              participants={enrichedParticipants}
              theme={theme}
              getUserColor={getUserColor}
              title="On call"
              compact={false}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleLeave}
          style={{
            border: 'none',
            borderRadius: '999px',
            padding: '8px 14px',
            background: '#ef4444',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 800,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Leave
        </button>
      </div>

      <div
        className="chat-video-call-stage"
        style={{
          position: 'relative',
          flex: '1 1 auto',
          minHeight: isNarrowViewport() ? '52vh' : '420px',
          background: '#000',
        }}
      >
        {loading ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', fontSize: '13px', fontWeight: 700 }}>
            Connecting to video room…
          </div>
        ) : null}
        {error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fecaca', fontSize: '13px', padding: '16px', textAlign: 'center' }}>
            {error}
          </div>
        ) : null}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

function isNarrowViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 720px)').matches;
}
