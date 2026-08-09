export function RunningCartoon({ size = 88, label = 'Keep moving', variant = 'default' }) {
  const isBot = variant === 'bot';
  return (
    <div
      className="running-cartoon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: 'relative',
        perspective: 600,
      }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: 'block', filter: 'drop-shadow(0 12px 18px rgba(15,23,42,0.28))' }}>
        <defs>
          <linearGradient id="running-cartoon-sky" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={isBot ? '#0f172a' : '#dbeafe'} />
            <stop offset="55%" stopColor={isBot ? '#1e293b' : '#e0f2fe'} />
            <stop offset="100%" stopColor={isBot ? '#312e81' : '#fef3c7'} />
          </linearGradient>
          <linearGradient id="running-cartoon-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isBot ? '#67e8f9' : '#0f172a'} />
            <stop offset="100%" stopColor={isBot ? '#6366f1' : '#1e293b'} />
          </linearGradient>
          <radialGradient id="running-cartoon-glow" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="rgba(56,189,248,0.45)" />
            <stop offset="100%" stopColor="rgba(56,189,248,0)" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="120" height="120" rx="28" fill="url(#running-cartoon-sky)" />
        <ellipse cx="60" cy="58" rx="42" ry="34" fill="url(#running-cartoon-glow)" />
        {!isBot ? <circle cx="92" cy="28" r="14" fill="rgba(251,191,36,0.55)" /> : null}
        {!isBot ? <ellipse cx="28" cy="34" rx="18" ry="6" fill="rgba(255,255,255,0.55)" /> : (
          <>
            <circle cx="28" cy="30" r="3" fill="#38bdf8" opacity="0.8" />
            <circle cx="95" cy="26" r="2" fill="#a78bfa" opacity="0.8" />
            <circle cx="104" cy="48" r="1.5" fill="#67e8f9" opacity="0.7" />
          </>
        )}
        <path
          className="running-cartoon-lane"
          d="M12 92 C 40 82, 80 82, 108 94"
          fill="none"
          stroke={isBot ? 'rgba(125,211,252,0.35)' : 'rgba(148,163,184,0.55)'}
          strokeWidth="3"
          strokeDasharray="6 8"
        />
        <ellipse className="running-cartoon-dust" cx="48" cy="90" rx="10" ry="3" fill="rgba(15,23,42,0.16)" />
        <g className="running-cartoon-runner">
          <circle cx="68" cy="42" r={isBot ? 9 : 8} fill="url(#running-cartoon-body)" />
          {isBot ? (
            <>
              <rect x="62" y="38" width="5" height="4" rx="1" fill="#0f172a" />
              <rect x="70" y="38" width="5" height="4" rx="1" fill="#0f172a" />
              <circle cx="64.5" cy="40" r="1.2" fill="#22d3ee" />
              <circle cx="72.5" cy="40" r="1.2" fill="#22d3ee" />
            </>
          ) : null}
          <path d="M68 50 L58 72 L78 80 L92 64" fill="none" stroke="url(#running-cartoon-body)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M58 72 L46 90" fill="none" stroke="url(#running-cartoon-body)" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M78 80 L94 98" fill="none" stroke="url(#running-cartoon-body)" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M66 58 L52 50" fill="none" stroke="url(#running-cartoon-body)" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M78 58 L94 48" fill="none" stroke="url(#running-cartoon-body)" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="94" cy="98" r="3.4" fill="#f97316" />
          <circle cx="46" cy="90" r="3.4" fill="#38bdf8" />
        </g>
      </svg>
      {label ? (
        <div style={{
          position: 'absolute',
          left: 6,
          right: 6,
          bottom: 6,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          textAlign: 'center',
          color: isBot ? '#bae6fd' : '#334155',
        }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
