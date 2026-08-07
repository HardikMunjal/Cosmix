import { useMemo } from 'react';

export const COSMIX_LOADER_CSS = `
  @keyframes cosmix-loader-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes cosmix-loader-spin-reverse {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }
  @keyframes cosmix-loader-tilt {
    0%, 100% { transform: rotateX(18deg) rotateY(-14deg) rotateZ(0deg); }
    50% { transform: rotateX(22deg) rotateY(16deg) rotateZ(4deg); }
  }
  @keyframes cosmix-loader-float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-7px); }
  }
  @keyframes cosmix-loader-pulse {
    0%, 100% { transform: scale(0.96); opacity: 0.88; }
    50% { transform: scale(1.05); opacity: 1; }
  }
  @keyframes cosmix-loader-shimmer {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(220%); }
  }
  @keyframes cosmix-loader-bar {
    0%, 100% { transform: scaleY(0.45); opacity: 0.45; }
    50% { transform: scaleY(1); opacity: 1; }
  }
  @keyframes cosmix-loader-sat {
    0% { transform: rotateY(0deg) translateX(var(--sat-r, 42px)) rotateY(0deg); }
    100% { transform: rotateY(360deg) translateX(var(--sat-r, 42px)) rotateY(-360deg); }
  }
  @keyframes cosmix-loader-glow {
    0%, 100% { opacity: 0.55; transform: scale(0.92); }
    50% { opacity: 0.95; transform: scale(1.08); }
  }
  .cosmix-loader-stage {
    position: relative;
    perspective: 900px;
    transform-style: preserve-3d;
  }
  .cosmix-loader-tilt {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    animation: cosmix-loader-tilt 4.2s ease-in-out infinite, cosmix-loader-float 2.8s ease-in-out infinite;
  }
  .cosmix-loader-ring {
    position: absolute;
    inset: -6%;
    border-radius: 999px;
    border: 1.5px solid transparent;
    border-top-color: #6ee7b7;
    border-right-color: #7dd3fc;
    box-shadow:
      0 0 18px rgba(56, 189, 248, 0.35),
      inset 0 0 12px rgba(52, 211, 153, 0.18);
    animation: cosmix-loader-spin 2.4s linear infinite;
    transform: rotateX(68deg);
  }
  .cosmix-loader-ring-b {
    inset: 8%;
    border-top-color: #fbbf24;
    border-right-color: transparent;
    border-bottom-color: #a78bfa;
    animation: cosmix-loader-spin-reverse 3.1s linear infinite;
    transform: rotateX(62deg) rotateZ(25deg);
  }
  .cosmix-loader-sphere {
    position: absolute;
    inset: 16%;
    border-radius: 999px;
    background:
      radial-gradient(circle at 32% 28%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.35) 18%, transparent 42%),
      radial-gradient(circle at 70% 78%, rgba(56,189,248,0.45), transparent 46%),
      linear-gradient(145deg, #34d399 0%, #38bdf8 48%, #6366f1 100%);
    box-shadow:
      0 22px 36px rgba(15, 23, 42, 0.28),
      0 0 0 1px rgba(255,255,255,0.35) inset,
      0 -10px 22px rgba(15, 23, 42, 0.22) inset;
    transform: translateZ(18px);
    animation: cosmix-loader-pulse 1.8s ease-in-out infinite;
    overflow: hidden;
  }
  .cosmix-loader-sphere::after {
    content: '';
    position: absolute;
    inset: 18% 22% auto;
    height: 28%;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255,255,255,0.7), transparent);
    filter: blur(1px);
    opacity: 0.85;
  }
  .cosmix-loader-sphere-label {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #f8fafc;
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 0.14em;
    text-shadow: 0 2px 10px rgba(15, 23, 42, 0.45);
  }
  .cosmix-loader-glow {
    position: absolute;
    inset: 22%;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(56,189,248,0.5), transparent 70%);
    filter: blur(10px);
    transform: translateZ(-8px);
    animation: cosmix-loader-glow 2.2s ease-in-out infinite;
  }
  .cosmix-loader-title {
    background: linear-gradient(105deg, #0891b2 0%, #2563eb 35%, #7c3aed 65%, #db2777 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
  }
  .cosmix-loader-sub {
    color: #475569;
  }
  .cosmix-loader-sat {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 999px;
    background:
      radial-gradient(circle at 30% 28%, #fff, transparent 42%),
      linear-gradient(145deg, var(--cosmix-loader-c, #f59e0b), var(--cosmix-loader-d, #3b82f6));
    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.28);
    transform-style: preserve-3d;
    animation: cosmix-loader-sat 3.4s linear infinite;
  }
  .cosmix-loader-sat-b {
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    --sat-r: 34px;
    animation-duration: 2.6s;
    animation-direction: reverse;
    background:
      radial-gradient(circle at 30% 28%, #fff, transparent 42%),
      linear-gradient(145deg, var(--cosmix-loader-a, #22c55e), var(--cosmix-loader-b, #06b6d4));
  }
  .cosmix-loader-bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 4px;
    height: 18px;
  }
  .cosmix-loader-bars span {
    width: 4px;
    border-radius: 999px;
    background: linear-gradient(180deg, var(--cosmix-loader-a, #22c55e), var(--cosmix-loader-b, #06b6d4));
    animation: cosmix-loader-bar 0.9s ease-in-out infinite;
  }
  .cosmix-loader-bars span:nth-child(2) { animation-delay: 0.12s; }
  .cosmix-loader-bars span:nth-child(3) { animation-delay: 0.24s; }
  .cosmix-loader-bars span:nth-child(4) { animation-delay: 0.36s; }
  @media (prefers-reduced-motion: reduce) {
    .cosmix-loader-tilt,
    .cosmix-loader-ring,
    .cosmix-loader-ring-b,
    .cosmix-loader-sphere,
    .cosmix-loader-glow,
    .cosmix-loader-sat,
    .cosmix-loader-bars span {
      animation: none !important;
    }
  }
`;

function resolveLoaderColors(theme = {}) {
  return {
    a: theme.orange || theme.green || '#34d399',
    b: theme.cyan || theme.blue || '#38bdf8',
    c: theme.orange || '#fbbf24',
    d: theme.blue || '#818cf8',
  };
}

export function CosmixLoaderStyles() {
  return <style>{COSMIX_LOADER_CSS}</style>;
}

export function CosmixOrb({ size = 72, theme, showLabel = false }) {
  const colors = useMemo(() => resolveLoaderColors(theme), [theme]);
  const style = {
    '--cosmix-loader-a': colors.a,
    '--cosmix-loader-b': colors.b,
    '--cosmix-loader-c': colors.c,
    '--cosmix-loader-d': colors.d,
    '--sat-r': `${Math.round(size * 0.42)}px`,
    position: 'relative',
    width: size,
    height: size,
  };

  return (
    <div className="cosmix-loader-stage" style={style} aria-hidden="true">
      <div className="cosmix-loader-tilt">
        <div className="cosmix-loader-glow" />
        <div className="cosmix-loader-ring" />
        <div className="cosmix-loader-ring cosmix-loader-ring-b" />
        <div className="cosmix-loader-sphere">
          {showLabel ? <div className="cosmix-loader-sphere-label">CMX</div> : null}
        </div>
        <div className="cosmix-loader-sat" />
        <div className="cosmix-loader-sat cosmix-loader-sat-b" />
      </div>
    </div>
  );
}

export function CosmixLoader({
  label = 'Loading...',
  message,
  sublabel,
  theme,
  variant = 'panel',
  minHeight,
}) {
  const colors = useMemo(() => resolveLoaderColors(theme), [theme]);
  const isFull = variant === 'full';
  const isOverlay = variant === 'overlay';
  const isCompact = variant === 'compact';
  const orbSize = isFull || isOverlay ? 112 : isCompact ? 52 : 84;
  const title = message || label;

  const shellStyle = isFull || isOverlay
    ? {
      position: 'relative',
      overflow: 'hidden',
      minHeight: isFull ? '100vh' : undefined,
      width: isOverlay ? '100%' : undefined,
      height: isOverlay ? '100%' : undefined,
      display: 'grid',
      placeItems: 'center',
      padding: '24px',
      background:
        'radial-gradient(circle at 18% 12%, rgba(125,211,252,0.42), transparent 34%),'
        + 'radial-gradient(circle at 84% 18%, rgba(167,139,250,0.32), transparent 30%),'
        + 'radial-gradient(circle at 50% 88%, rgba(52,211,153,0.22), transparent 36%),'
        + 'linear-gradient(165deg, #e0f2fe 0%, #f8fafc 42%, #ede9fe 100%)',
      fontFamily: theme?.font,
    }
    : {
      minHeight: minHeight || (isCompact ? 'auto' : '220px'),
      display: 'grid',
      placeItems: 'center',
      padding: isCompact ? '12px 10px' : '28px 20px',
      borderRadius: isCompact ? '14px' : '18px',
      position: 'relative',
      overflow: 'hidden',
      background: isCompact
        ? 'transparent'
        : `radial-gradient(circle at 50% 18%, ${colors.b}28, transparent 55%),`
          + 'linear-gradient(160deg, rgba(248,250,252,0.92), rgba(224,242,254,0.88) 55%, rgba(237,233,254,0.9))',
      border: isCompact ? 'none' : `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.28)'}`,
      boxShadow: isCompact ? undefined : '0 18px 40px rgba(15,23,42,0.08)',
    };

  const headingColor = '#0f172a';
  const mutedColor = '#475569';

  return (
    <div style={shellStyle} role="status" aria-live="polite" aria-busy="true">
      <CosmixLoaderStyles />
      {!isCompact ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0.55,
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '42%',
            height: '100%',
            background: `linear-gradient(90deg, transparent, ${colors.b}33, transparent)`,
            animation: 'cosmix-loader-shimmer 2.2s ease-in-out infinite',
          }} />
        </div>
      ) : null}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'grid',
        gap: isCompact ? '8px' : '16px',
        justifyItems: 'center',
        textAlign: 'center',
        maxWidth: '340px',
      }}>
        <CosmixOrb size={orbSize} theme={theme} showLabel={isFull || isOverlay} />
        <div style={{ display: 'grid', gap: '4px' }}>
          <div
            className="cosmix-loader-title"
            style={{
              fontSize: isCompact ? '12px' : '14px',
              fontWeight: 800,
              letterSpacing: isCompact ? '0.04em' : '0.14em',
              textTransform: isCompact ? 'none' : 'uppercase',
              color: headingColor,
            }}
          >
            {title}
          </div>
          {sublabel && !isCompact ? (
            <div className="cosmix-loader-sub" style={{ fontSize: '13px', color: mutedColor, lineHeight: 1.45, fontWeight: 600 }}>
              {sublabel}
            </div>
          ) : null}
        </div>
        <div
          className="cosmix-loader-bars"
          style={{ '--cosmix-loader-a': colors.a, '--cosmix-loader-b': colors.b }}
        >
          <span style={{ height: isCompact ? '8px' : '10px' }} />
          <span style={{ height: isCompact ? '12px' : '16px' }} />
          <span style={{ height: isCompact ? '10px' : '12px' }} />
          {!isCompact ? <span style={{ height: '18px' }} /> : null}
        </div>
      </div>
    </div>
  );
}

export function SectionLoadingShell({
  loading,
  label = 'Loading...',
  theme,
  height = 156,
  children,
}) {
  return (
    <div style={{ position: 'relative', minHeight: height }}>
      {loading ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 3,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '14px',
          background: 'linear-gradient(160deg, rgba(248,250,252,0.88), rgba(224,242,254,0.84) 55%, rgba(237,233,254,0.86))',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(148,163,184,0.22)',
        }}>
          <CosmixLoader variant="compact" label={label} theme={theme} />
        </div>
      ) : null}
      <div style={{
        opacity: loading ? 0.2 : 1,
        transition: 'opacity 0.28s ease',
        pointerEvents: loading ? 'none' : 'auto',
      }}>
        {children}
      </div>
    </div>
  );
}
