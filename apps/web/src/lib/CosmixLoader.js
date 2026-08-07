import { useMemo } from 'react';

function resolveLoaderColors(theme = {}) {
  return {
    a: theme.orange || theme.green || '#34d399',
    b: theme.cyan || theme.blue || '#38bdf8',
    c: theme.orange || '#fbbf24',
    d: theme.blue || '#818cf8',
  };
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

  return (
    <div style={shellStyle} role="status" aria-live="polite" aria-busy="true">
      {!isCompact ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0.55,
        }}>
          <div className="cosmix-loader-shimmer-sweep" style={{
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
            }}
          >
            {title}
          </div>
          {sublabel && !isCompact ? (
            <div className="cosmix-loader-sub" style={{ fontSize: '13px', lineHeight: 1.45, fontWeight: 600 }}>
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
