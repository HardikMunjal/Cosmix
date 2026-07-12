export default function NotificationModule({
  theme,
  notifications = [],
  onOpenChat,
  onOpenProfile,
  onOpenFitstagram,
  embedded = false,
}) {
  const hasItems = Array.isArray(notifications) && notifications.length > 0;

  const BellBadge = ({ color }) => (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 17h5l-1.4-1.6a2 2 0 0 1-.5-1.3V10a6 6 0 1 0-12 0v4.1a2 2 0 0 1-.5 1.3L4 17h5" />
      <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
    </svg>
  );

  const listBody = !hasItems ? (
    <div style={{ borderRadius: '14px', border: `1px solid ${theme.cardBorder}`, padding: '12px', color: theme.textMuted, fontSize: '12px' }}>
      No new notifications right now.
    </div>
  ) : (
    <div style={{ display: 'grid', gap: '8px' }}>
      {notifications.map((item) => {
        const isFriend = item.type === 'friend_request';
        const isFitstagram = item.type === 'fitstagram';
        const accent = isFriend ? '#22c55e' : (isFitstagram ? theme.orange : '#38bdf8');
        const actionLabel = isFriend ? 'Open Profile' : (isFitstagram ? 'Open Fitstagram' : 'Open Chat');
        const onAction = isFriend ? onOpenProfile : (isFitstagram ? onOpenFitstagram : onOpenChat);
        const icon = isFriend ? '🤝' : (isFitstagram ? '📷' : '💬');
        const typeLabel = isFriend ? 'Friend Request' : (isFitstagram ? 'Fitstagram' : 'Chat Message');

        return (
          <div
            key={item.id}
            style={{
              borderRadius: '14px',
              border: `1px solid ${accent}44`,
              background: `linear-gradient(135deg, ${theme.cardBg}, ${accent}10)`,
              padding: '10px 12px',
              display: 'grid',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 800, color: accent, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span>{icon}</span>
                {typeLabel}
              </div>
              <div style={{ fontSize: '10px', color: theme.textMuted, fontWeight: 700 }}>{item.timeLabel}</div>
            </div>
            <div style={{ fontSize: '13px', color: theme.textHeading, fontWeight: 700 }}>{item.title}</div>
            <div style={{ fontSize: '11px', color: theme.textSecondary, lineHeight: 1.4 }}>{item.description}</div>
            <div>
              <button
                type="button"
                onClick={() => onAction(item)}
                style={{
                  borderRadius: '999px',
                  border: `1px solid ${accent}77`,
                  color: accent,
                  background: `${accent}12`,
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  padding: '7px 11px',
                  cursor: 'pointer',
                }}
              >
                {actionLabel}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return listBody;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '999px', background: `${theme.cyan}18`, border: `1px solid ${theme.cyan}44`, display: 'grid', placeItems: 'center' }}>
            <BellBadge color={theme.cyan} />
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: theme.textMuted, fontWeight: 800 }}>Notifications</div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: theme.textHeading, marginTop: '3px' }}>Alerts & Requests</div>
          </div>
        </div>
      </div>
      {listBody}
    </section>
  );
}
