export function RunningCartoon({ size = 88, label = 'Keep moving' }) {
  return (
    <div
      className="running-cartoon"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="running-cartoon-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#fef3c7" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="120" height="120" rx="24" fill="url(#running-cartoon-sky)" />
        <circle cx="92" cy="28" r="14" fill="rgba(251,191,36,0.55)" />
        <ellipse cx="28" cy="34" rx="18" ry="6" fill="rgba(255,255,255,0.55)" />
        <path
          className="running-cartoon-lane"
          d="M12 92 C 40 82, 80 82, 108 94"
          fill="none"
          stroke="rgba(148,163,184,0.55)"
          strokeWidth="3"
          strokeDasharray="6 8"
        />
        <ellipse
          className="running-cartoon-dust"
          cx="48"
          cy="90"
          rx="10"
          ry="3"
          fill="rgba(15,23,42,0.12)"
        />
        <g className="running-cartoon-runner">
          <circle cx="68" cy="42" r="8" fill="#0f172a" />
          <path d="M68 50 L58 72 L78 80 L92 64" fill="none" stroke="#0f172a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M58 72 L46 90" fill="none" stroke="#0f172a" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M78 80 L94 98" fill="none" stroke="#0f172a" strokeWidth="6.5" strokeLinecap="round" />
          <path d="M66 58 L52 50" fill="none" stroke="#0f172a" strokeWidth="5.5" strokeLinecap="round" />
          <path d="M78 58 L94 48" fill="none" stroke="#0f172a" strokeWidth="5.5" strokeLinecap="round" />
          <circle cx="94" cy="98" r="3.2" fill="#f97316" />
          <circle cx="46" cy="90" r="3.2" fill="#38bdf8" />
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
          color: '#334155',
        }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
