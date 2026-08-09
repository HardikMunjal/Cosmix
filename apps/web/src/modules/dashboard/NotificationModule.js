function formatRelativeTime(createdAt) {
  const created = createdAt ? new Date(createdAt) : null;
  if (!created || Number.isNaN(created.getTime())) return 'recently';
  const diffMs = Date.now() - created.getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return created.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function kindMeta(item, theme) {
  const kind = item.kind || (item.type === 'friend_request' ? 'friend' : item.type === 'fitstagram' ? 'highlight' : item.type);
  if (item.type === 'friend_request' || kind === 'friend') {
    return { label: 'Buddy request', accent: '#22c55e', icon: '🤝' };
  }
  if (kind === 'record') return { label: 'Distance PR', accent: '#f59e0b', icon: '🏅' };
  if (kind === 'pace') return { label: 'Best speed', accent: '#38bdf8', icon: '⚡' };
  if (kind === 'split') return { label: 'Best split', accent: '#a78bfa', icon: '🎯' };
  if (kind === 'comeback') return { label: 'Comeback', accent: '#34d399', icon: '👋' };
  if (item.type === 'fitstagram') return { label: 'Fitstagram', accent: theme.orange || '#f97316', icon: '📷' };
  if (item.type === 'chat_message') return { label: 'Chat', accent: '#38bdf8', icon: '💬' };
  return { label: 'Update', accent: '#94a3b8', icon: '🔔' };
}

export default function NotificationModule({
  theme,
  notifications = [],
  onOpenChat,
  onOpenProfile,
  onOpenFitstagram,
  onMarkAllRead,
  embedded = false,
}) {
  const hasItems = Array.isArray(notifications) && notifications.length > 0;
  const unreadCount = notifications.filter((item) => !item.viewed).length;

  const BellBadge = ({ color }) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.6a2 2 0 0 1-.5-1.3V10a6 6 0 1 0-12 0v4.1a2 2 0 0 1-.5 1.3L4 17h5" />
      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );

  const listBody = !hasItems ? (
    <div className="notif-empty">
      <div className="notif-empty-icon" aria-hidden="true">🔔</div>
      <div className="notif-empty-title">You&apos;re all caught up</div>
      <div className="notif-empty-copy">
        Alerts only appear for personal records, best splits, best speed, and comebacks after a long break.
      </div>
    </div>
  ) : (
    <div className="notif-list">
      {onMarkAllRead && unreadCount > 0 ? (
        <div className="notif-toolbar">
          <span className="notif-toolbar-count">{unreadCount} highlight{unreadCount === 1 ? '' : 's'}</span>
          <button type="button" className="notif-mark-all" onClick={onMarkAllRead}>
            Mark all read
          </button>
        </div>
      ) : null}
      {notifications.map((item) => {
        const meta = kindMeta(item, theme);
        const isFriend = item.type === 'friend_request';
        const isFitstagram = item.type === 'fitstagram';
        const onAction = isFriend ? onOpenProfile : (isFitstagram ? onOpenFitstagram : onOpenChat);
        const actionLabel = isFriend ? 'Open profile' : (isFitstagram ? 'Open Fitstagram' : 'Open chat');
        const timeLabel = item.timeLabel || formatRelativeTime(item.createdAt);

        return (
          <button
            key={item.id}
            type="button"
            className="notif-card"
            style={{ '--notif-accent': meta.accent }}
            onClick={() => onAction?.(item)}
          >
            <span className="notif-card-accent" aria-hidden="true" />
            <div className="notif-card-body">
              <div className="notif-card-top">
                <span className="notif-pill">
                  <span aria-hidden="true">{meta.icon}</span>
                  {meta.label}
                </span>
                <span className="notif-time">{timeLabel}</span>
              </div>
              <div className="notif-title">{item.title}</div>
              {item.description ? <div className="notif-desc">{item.description}</div> : null}
              <div className="notif-action">{actionLabel} →</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const styles = (
    <style>{`
      .notif-list { display: grid; gap: 10px; }
      .notif-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 2px 2px 4px;
      }
      .notif-toolbar-count {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: #94a3b8;
      }
      .notif-mark-all {
        appearance: none;
        border: 1px solid rgba(148,163,184,0.28);
        background: rgba(15,23,42,0.55);
        color: #e2e8f0;
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 800;
        cursor: pointer;
      }
      .notif-mark-all:hover { border-color: rgba(56,189,248,0.45); color: #bae6fd; }
      .notif-card {
        appearance: none;
        width: 100%;
        text-align: left;
        cursor: pointer;
        border-radius: 16px;
        border: 1px solid rgba(148,163,184,0.22);
        background: linear-gradient(135deg, rgba(15,23,42,0.95), rgba(30,41,59,0.88));
        padding: 0;
        display: grid;
        grid-template-columns: 4px minmax(0, 1fr);
        overflow: hidden;
        box-shadow: 0 10px 24px rgba(0,0,0,0.22);
        transition: transform 0.15s ease, border-color 0.15s ease;
        font: inherit;
        color: inherit;
      }
      .notif-card:hover {
        transform: translateY(-1px);
        border-color: rgba(148,163,184,0.42);
      }
      .notif-card-accent { background: var(--notif-accent); }
      .notif-card-body {
        min-width: 0;
        padding: 12px 14px 13px;
        display: grid;
        gap: 6px;
      }
      .notif-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .notif-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--notif-accent);
        background: rgba(148,163,184,0.1);
        border: 1px solid rgba(148,163,184,0.22);
        border-radius: 999px;
        padding: 4px 9px;
        max-width: 70%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .notif-time {
        font-size: 10px;
        font-weight: 700;
        color: #94a3b8;
        flex-shrink: 0;
      }
      .notif-title {
        font-size: 13px;
        font-weight: 800;
        color: #f8fafc;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      .notif-desc {
        font-size: 12px;
        color: #94a3b8;
        line-height: 1.45;
        overflow-wrap: anywhere;
      }
      .notif-action {
        margin-top: 2px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.04em;
        color: var(--notif-accent);
      }
      .notif-empty {
        border-radius: 16px;
        border: 1px dashed rgba(148,163,184,0.28);
        background: rgba(2,6,23,0.45);
        padding: 28px 18px;
        text-align: center;
        display: grid;
        gap: 8px;
        justify-items: center;
      }
      .notif-empty-icon { font-size: 22px; line-height: 1; opacity: 0.9; }
      .notif-empty-title { font-size: 14px; font-weight: 800; color: #e2e8f0; }
      .notif-empty-copy { font-size: 12px; color: #94a3b8; line-height: 1.5; max-width: 320px; }
    `}</style>
  );

  if (embedded) {
    return (
      <>
        {styles}
        {listBody}
      </>
    );
  }

  return (
    <section
      style={{
        borderRadius: '22px',
        border: `1px solid ${theme.cardBorder}`,
        background: theme.panelBg,
        padding: '14px',
        boxShadow: `0 16px 36px ${theme.shadow}`,
        display: 'grid',
        gap: '10px',
      }}
    >
      {styles}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '999px', background: `${theme.cyan}18`, border: `1px solid ${theme.cyan}44`, display: 'grid', placeItems: 'center' }}>
            <BellBadge color={theme.cyan} />
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Notifications</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading, marginTop: '3px' }}>Highlights only</div>
          </div>
        </div>
      </div>
      {listBody}
    </section>
  );
}
