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
  @keyframes cosmix-loader-pulse {
    0%, 100% { transform: scale(0.92); opacity: 0.82; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes cosmix-loader-shimmer {
    0% { transform: translateX(-120%); }
    100% { transform: translateX(220%); }
  }
  @keyframes cosmix-loader-bar {
    0%, 100% { transform: scaleY(0.45); opacity: 0.45; }
    50% { transform: scaleY(1); opacity: 1; }
  }
  .cosmix-loader-orbit-a {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    border: 2px solid transparent;
    border-top-color: var(--cosmix-loader-a, #22c55e);
    border-right-color: var(--cosmix-loader-b, #06b6d4);
    animation: cosmix-loader-spin 1.15s linear infinite;
  }
  .cosmix-loader-orbit-b {
    position: absolute;
    inset: 12px;
    border-radius: 999px;
    border: 2px solid transparent;
    border-bottom-color: var(--cosmix-loader-c, #f59e0b);
    border-left-color: var(--cosmix-loader-d, #3b82f6);
    animation: cosmix-loader-spin-reverse 1.35s linear infinite;
  }
  .cosmix-loader-core {
    position: absolute;
    inset: 22px;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--cosmix-loader-a, #22c55e), var(--cosmix-loader-b, #06b6d4));
    box-shadow: 0 0 24px color-mix(in srgb, var(--cosmix-loader-b, #06b6d4) 55%, transparent);
    animation: cosmix-loader-pulse 1.4s ease-in-out infinite;
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
`;

function resolveLoaderColors(theme = {}) {
  return {
    a: theme.orange || theme.green || '#22c55e',
    b: theme.cyan || theme.blue || '#06b6d4',
    c: theme.orange || '#f59e0b',
    d: theme.blue || '#3b82f6',
  };
}

export function CosmixLoaderStyles() {
  return <style>{COSMIX_LOADER_CSS}</style>;
}

export function CosmixOrb({ size = 72, theme }) {
  const colors = useMemo(() => resolveLoaderColors(theme), [theme]);
  const style = {
    '--cosmix-loader-a': colors.a,
    '--cosmix-loader-b': colors.b,
    '--cosmix-loader-c': colors.c,
    '--cosmix-loader-d': colors.d,
    position: 'relative',
    width: size,
    height: size,
  };

  return (
    <div style={style} aria-hidden="true">
      <div className="cosmix-loader-orbit-a" />
      <div className="cosmix-loader-orbit-b" />
      <div className="cosmix-loader-core" />
    </div>
  );
}

export function CosmixLoader({
  label = 'Loading...',
  sublabel,
  theme,
  variant = 'panel',
  minHeight,
}) {
  const colors = useMemo(() => resolveLoaderColors(theme), [theme]);
  const isFull = variant === 'full';
  const isCompact = variant === 'compact';
  const orbSize = isFull ? 96 : isCompact ? 44 : 72;

  const shellStyle = isFull
    ? {
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: '24px',
      background: theme?.pageBgSolid || theme?.pageBg || 'rgba(2,6,23,0.96)',
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
        : `radial-gradient(circle at 50% 20%, ${colors.b}18, transparent 55%), ${theme?.cardBg || theme?.panelBg || 'rgba(15,23,42,0.6)'}`,
      border: isCompact ? 'none' : `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.2)'}`,
    };

  return (
    <div style={shellStyle} role="status" aria-live="polite" aria-busy="true">
      <CosmixLoaderStyles />
      {!isCompact ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          opacity: 0.5,
        }}>
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '40%',
            height: '100%',
            background: `linear-gradient(90deg, transparent, ${colors.b}22, transparent)`,
            animation: 'cosmix-loader-shimmer 2.2s ease-in-out infinite',
          }} />
        </div>
      ) : null}
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'grid',
        gap: isCompact ? '8px' : '14px',
        justifyItems: 'center',
        textAlign: 'center',
        maxWidth: '320px',
      }}>
        <CosmixOrb size={orbSize} theme={theme} />
        <div style={{ display: 'grid', gap: '4px' }}>
          <div style={{
            fontSize: isCompact ? '11px' : '13px',
            fontWeight: 800,
            letterSpacing: isCompact ? '0.04em' : '0.12em',
            textTransform: isCompact ? 'none' : 'uppercase',
            color: theme?.textHeading || '#f8fafc',
          }}>
            {label}
          </div>
          {sublabel && !isCompact ? (
            <div style={{ fontSize: '12px', color: theme?.textMuted || 'rgba(148,163,184,0.9)', lineHeight: 1.45 }}>
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
          background: `${theme?.panelBg || theme?.cardBg || 'rgba(15,23,42,0.9)'}e6`,
          backdropFilter: 'blur(8px)',
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
