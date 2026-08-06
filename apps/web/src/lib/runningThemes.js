/** Running Analytics page themes — two very different looks. */
export const RUNNING_THEME_KEY = 'cosmix-running-surface';

export const runningSurfaces = {
  night: {
    id: 'night',
    label: 'Night track',
    pageBg: 'radial-gradient(1200px 600px at 10% -10%, #1e293b 0%, transparent 55%), linear-gradient(165deg, #020617 0%, #0b1224 45%, #111827 100%)',
    pageBgSolid: '#020617',
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textHeading: '#f8fafc',
    cardBg: 'rgba(15, 23, 42, 0.92)',
    cardBorder: 'rgba(148, 163, 184, 0.18)',
    panelBg: 'rgba(8, 15, 30, 0.94)',
    orange: '#fb923c',
    blue: '#38bdf8',
    cyan: '#22d3ee',
    green: '#4ade80',
    purple: '#c084fc',
    emerald: '#34d399',
    red: '#fb7185',
    yellow: '#facc15',
    chartDepth: '0 22px 50px rgba(0,0,0,0.45)',
    accentGlow: 'rgba(251, 146, 60, 0.35)',
    inputBg: '#0f172a',
    inputBorder: 'rgba(148, 163, 184, 0.35)',
    font: "'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
  },
  trail: {
    id: 'trail',
    label: 'Trail light',
    pageBg: 'radial-gradient(900px 480px at 90% -5%, rgba(34,197,94,0.18), transparent 50%), linear-gradient(180deg, #f7faf5 0%, #eef6ea 38%, #f8f5ef 100%)',
    pageBgSolid: '#f7faf5',
    textPrimary: '#1a2e1c',
    textSecondary: '#3f5c44',
    textMuted: '#6b7f6e',
    textHeading: '#0f2414',
    cardBg: 'rgba(255, 255, 255, 0.88)',
    cardBorder: 'rgba(22, 101, 52, 0.14)',
    panelBg: '#ffffff',
    orange: '#c2410c',
    blue: '#0f766e',
    cyan: '#0d9488',
    green: '#166534',
    purple: '#5b21b6',
    emerald: '#047857',
    red: '#be123c',
    yellow: '#a16207',
    chartDepth: '0 20px 44px rgba(22, 101, 52, 0.12)',
    accentGlow: 'rgba(22, 101, 52, 0.2)',
    inputBg: '#ffffff',
    inputBorder: 'rgba(22, 101, 52, 0.25)',
    font: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
  },
};

export function loadRunningSurfaceId() {
  if (typeof window === 'undefined') return 'night';
  const saved = localStorage.getItem(RUNNING_THEME_KEY);
  return runningSurfaces[saved] ? saved : 'night';
}

export function saveRunningSurfaceId(id) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RUNNING_THEME_KEY, id);
}

/** Merge running surface tokens onto the active app theme. */
export function mergeRunningSurface(baseTheme, surfaceId) {
  const surface = runningSurfaces[surfaceId] || runningSurfaces.night;
  return {
    ...baseTheme,
    ...surface,
    // keep semantic aliases used across running page
    pageBg: surface.pageBg,
    pageBgSolid: surface.pageBgSolid,
  };
}
