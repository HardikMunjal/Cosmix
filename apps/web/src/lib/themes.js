// ── Theme Definitions ──
// Each theme defines color tokens used across all Nifty-related pages.

export const THEME_KEY = 'cosmix-theme';

export const themes = {
  dark: {
    id: 'dark',
    label: '🌙 Dark',
    // Page
    pageBg: 'linear-gradient(180deg, #020617, #0f172a)',
    pageBgSolid: '#020617',
    textPrimary: '#e2e8f0',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textHeading: '#f8fafc',
    // Cards & surfaces
    cardBg: '#0f172a',
    cardBgGradient: 'linear-gradient(135deg, #0f172a, #1e293b40)',
    cardBorder: '#1e293b',
    cardBorderHover: '#334155',
    panelBg: 'rgba(15, 23, 42, 0.88)',
    inputBg: '#020617',
    inputBorder: '#334155',
    // Ticker
    tickerBg: '#0f172a',
    tickerBorder: '#1e293b',
    tickerNameColor: '#94a3b8',
    tickerPriceColor: '#f8fafc',
    // Buttons
    btnPrimaryBg: '#1e293b',
    btnPrimaryBorder: '#334155',
    btnPrimaryText: '#f8fafc',
    btnSecondaryBg: '#111827',
    btnSecondaryBorder: '#334155',
    btnSecondaryText: '#e2e8f0',
    btnDangerBg: '#450a0a',
    btnDangerBorder: '#7f1d1d',
    btnDangerText: '#fecaca',
    btnSuccessBg: '#14532d',
    btnSuccessBorder: '#22c55e',
    btnSuccessText: '#bbf7d0',
    // Metrics / analysis
    analyzerCardBg: 'linear-gradient(135deg, #0f172a, #1e293b30)',
    analyzerCardBorder: '#1e293b',
    gaugeBg: '#1e293b',
    // Graphs
    graphBg: '#020617',
    graphGridLine: '#1e293b',
    // Section
    sectionBg: 'linear-gradient(90deg, #1e293b40, transparent)',
    // Misc
    divider: '#1e293b',
    badgeBg: '#0f172a',
    shadow: 'rgba(0,0,0,0.35)',
    // Semantic
    green: '#22c55e',
    red: '#f87171',
    yellow: '#eab308',
    orange: '#f97316',
    blue: '#60a5fa',
    purple: '#a78bfa',
    cyan: '#38bdf8',
    emerald: '#34d399',
    greenDim: '#166534',
    redDim: '#7f1d1d',
    textMid: '#cbd5e1',
    panelDarkBg: '#08111f',
    infoText: '#bfdbfe',
    font: "'Inter', system-ui, -apple-system, sans-serif",
  },

  light: {
    id: 'light',
    label: '☀️ Sunlit',
    // Page
    pageBg: 'linear-gradient(180deg, #fff8ef, #fff1e6)',
    pageBgSolid: '#fff8ef',
    textPrimary: '#1f2937',
    textSecondary: '#5b6472',
    textMuted: '#8b98ab',
    textHeading: '#0f172a',
    // Cards & surfaces
    cardBg: '#fffdf8',
    cardBgGradient: 'linear-gradient(135deg, #fffdf8, #fff2dd)',
    cardBorder: '#f3d2b1',
    cardBorderHover: '#f59e0b',
    panelBg: 'rgba(255, 253, 248, 0.94)',
    inputBg: '#fff7ed',
    inputBorder: '#fdba74',
    // Ticker
    tickerBg: '#fffdf8',
    tickerBorder: '#f3d2b1',
    tickerNameColor: '#7c5b3b',
    tickerPriceColor: '#0f172a',
    // Buttons
    btnPrimaryBg: '#fff1e6',
    btnPrimaryBorder: '#fdba74',
    btnPrimaryText: '#0f172a',
    btnSecondaryBg: '#fff7ed',
    btnSecondaryBorder: '#f3d2b1',
    btnSecondaryText: '#334155',
    btnDangerBg: '#fef2f2',
    btnDangerBorder: '#fca5a5',
    btnDangerText: '#991b1b',
    btnSuccessBg: '#ecfdf5',
    btnSuccessBorder: '#4ade80',
    btnSuccessText: '#166534',
    // Metrics / analysis
    analyzerCardBg: 'linear-gradient(135deg, #fffdf8, #eef6ff)',
    analyzerCardBorder: '#f3d2b1',
    gaugeBg: '#fde7cf',
    // Graphs
    graphBg: '#fffaf5',
    graphGridLine: '#f3d2b1',
    // Section
    sectionBg: 'linear-gradient(90deg, #fde7cf, transparent)',
    // Misc
    divider: '#f3d2b1',
    badgeBg: '#fff1e6',
    shadow: 'rgba(249, 115, 22, 0.12)',
    // Semantic — keep vibrant for contrast
    green: '#16a34a',
    red: '#dc2626',
    yellow: '#ca8a04',
    orange: '#ea580c',
    blue: '#2563eb',
    purple: '#7c3aed',
    cyan: '#0891b2',
    emerald: '#059669',
    greenDim: '#bbf7d0',
    redDim: '#fecaca',
    textMid: '#334155',
    panelDarkBg: '#fff1e6',
    infoText: '#2563eb',
    font: "'Inter', system-ui, -apple-system, sans-serif",
  },

  ocean: {
    id: 'ocean',
    label: '🌊 Ocean Depth',
    pageBg: 'linear-gradient(180deg, #042f2e, #0c4a6e)',
    pageBgSolid: '#042f2e',
    textPrimary: '#ccfbf1',
    textSecondary: '#5eead4',
    textMuted: '#2dd4bf',
    textHeading: '#f0fdfa',
    cardBg: '#0f766e',
    cardBgGradient: 'linear-gradient(135deg, #0f766e, #115e5940)',
    cardBorder: '#115e59',
    cardBorderHover: '#14b8a6',
    panelBg: 'rgba(15, 118, 110, 0.85)',
    inputBg: '#042f2e',
    inputBorder: '#14b8a6',
    tickerBg: '#0f766e',
    tickerBorder: '#115e59',
    tickerNameColor: '#5eead4',
    tickerPriceColor: '#f0fdfa',
    btnPrimaryBg: '#115e59',
    btnPrimaryBorder: '#14b8a6',
    btnPrimaryText: '#f0fdfa',
    btnSecondaryBg: '#0d5550',
    btnSecondaryBorder: '#14b8a6',
    btnSecondaryText: '#ccfbf1',
    btnDangerBg: '#7f1d1d',
    btnDangerBorder: '#dc2626',
    btnDangerText: '#fecaca',
    btnSuccessBg: '#064e3b',
    btnSuccessBorder: '#34d399',
    btnSuccessText: '#a7f3d0',
    analyzerCardBg: 'linear-gradient(135deg, #0f766e, #115e5930)',
    analyzerCardBorder: '#115e59',
    gaugeBg: '#115e59',
    graphBg: '#042f2e',
    graphGridLine: '#115e59',
    sectionBg: 'linear-gradient(90deg, #115e5940, transparent)',
    divider: '#115e59',
    badgeBg: '#0f766e',
    shadow: 'rgba(0,0,0,0.4)',
    green: '#4ade80',
    red: '#fb7185',
    yellow: '#fbbf24',
    orange: '#fb923c',
    blue: '#38bdf8',
    purple: '#c084fc',
    cyan: '#22d3ee',
    emerald: '#6ee7b7',
    greenDim: '#065f46',
    redDim: '#9f1239',
    textMid: '#99f6e4',
    panelDarkBg: '#064e3b',
    infoText: '#67e8f9',
    font: "'Inter', system-ui, -apple-system, sans-serif",
  },

  sunset: {
    id: 'sunset',
    label: '🌅 Sunset Warm',
    pageBg: 'linear-gradient(180deg, #1c1917, #292524)',
    pageBgSolid: '#1c1917',
    textPrimary: '#fef3c7',
    textSecondary: '#fbbf24',
    textMuted: '#d97706',
    textHeading: '#fffbeb',
    cardBg: '#292524',
    cardBgGradient: 'linear-gradient(135deg, #292524, #44403c40)',
    cardBorder: '#44403c',
    cardBorderHover: '#78716c',
    panelBg: 'rgba(41, 37, 36, 0.9)',
    inputBg: '#1c1917',
    inputBorder: '#78716c',
    tickerBg: '#292524',
    tickerBorder: '#44403c',
    tickerNameColor: '#fbbf24',
    tickerPriceColor: '#fffbeb',
    btnPrimaryBg: '#44403c',
    btnPrimaryBorder: '#78716c',
    btnPrimaryText: '#fffbeb',
    btnSecondaryBg: '#292524',
    btnSecondaryBorder: '#78716c',
    btnSecondaryText: '#fef3c7',
    btnDangerBg: '#7f1d1d',
    btnDangerBorder: '#ef4444',
    btnDangerText: '#fecaca',
    btnSuccessBg: '#14532d',
    btnSuccessBorder: '#22c55e',
    btnSuccessText: '#bbf7d0',
    analyzerCardBg: 'linear-gradient(135deg, #292524, #44403c30)',
    analyzerCardBorder: '#44403c',
    gaugeBg: '#44403c',
    graphBg: '#1c1917',
    graphGridLine: '#44403c',
    sectionBg: 'linear-gradient(90deg, #44403c40, transparent)',
    divider: '#44403c',
    badgeBg: '#292524',
    shadow: 'rgba(0,0,0,0.4)',
    green: '#a3e635',
    red: '#fb923c',
    yellow: '#facc15',
    orange: '#f97316',
    blue: '#38bdf8',
    purple: '#e879f9',
    cyan: '#22d3ee',
    emerald: '#6ee7b7',
    greenDim: '#365314',
    redDim: '#9a3412',
    textMid: '#fed7aa',
    panelDarkBg: '#1c1917',
    infoText: '#fde68a',
    font: "'Inter', system-ui, -apple-system, sans-serif",
  },

  neon: {
    id: 'neon',
    label: '💜 Neon Cyber',
    pageBg: 'linear-gradient(180deg, #0a0a1a, #1a0a2e)',
    pageBgSolid: '#0a0a1a',
    textPrimary: '#e0e7ff',
    textSecondary: '#a78bfa',
    textMuted: '#7c3aed',
    textHeading: '#f5f3ff',
    cardBg: '#1e1b4b',
    cardBgGradient: 'linear-gradient(135deg, #1e1b4b, #312e8140)',
    cardBorder: '#312e81',
    cardBorderHover: '#6366f1',
    panelBg: 'rgba(30, 27, 75, 0.9)',
    inputBg: '#0a0a1a',
    inputBorder: '#6366f1',
    tickerBg: '#1e1b4b',
    tickerBorder: '#312e81',
    tickerNameColor: '#a78bfa',
    tickerPriceColor: '#f5f3ff',
    btnPrimaryBg: '#312e81',
    btnPrimaryBorder: '#6366f1',
    btnPrimaryText: '#f5f3ff',
    btnSecondaryBg: '#1e1b4b',
    btnSecondaryBorder: '#6366f1',
    btnSecondaryText: '#e0e7ff',
    btnDangerBg: '#500724',
    btnDangerBorder: '#f43f5e',
    btnDangerText: '#fecdd3',
    btnSuccessBg: '#064e3b',
    btnSuccessBorder: '#10b981',
    btnSuccessText: '#a7f3d0',
    analyzerCardBg: 'linear-gradient(135deg, #1e1b4b, #312e8130)',
    analyzerCardBorder: '#312e81',
    gaugeBg: '#312e81',
    graphBg: '#0a0a1a',
    graphGridLine: '#312e81',
    sectionBg: 'linear-gradient(90deg, #312e8140, transparent)',
    divider: '#312e81',
    badgeBg: '#1e1b4b',
    shadow: 'rgba(99,102,241,0.15)',
    green: '#10b981',
    red: '#f43f5e',
    yellow: '#fbbf24',
    orange: '#f97316',
    blue: '#818cf8',
    purple: '#c084fc',
    cyan: '#22d3ee',
    emerald: '#34d399',
    greenDim: '#064e3b',
    redDim: '#881337',
    textMid: '#c7d2fe',
    panelDarkBg: '#0f0d26',
    infoText: '#818cf8',
    font: "'Inter', system-ui, -apple-system, sans-serif",
  },
};

export function getThemeId() {
  if (typeof window === 'undefined') return 'light';
  return localStorage.getItem(THEME_KEY) || 'light';
}

export function setThemeId(id) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(THEME_KEY, id);
  }
}

export function getTheme(id) {
  return themes[id] || themes.light;
}

// ── Runtime theme applicator ──
// Takes a styles object authored with dark-theme hex codes and replaces
// them with the active theme's values using a single-pass regex.
// For dark theme it returns the original object untouched.
export function applyTheme(stylesObj, themeId, theme) {
  if (themeId === 'dark') return stylesObj;

  const darkToTheme = {
    '#020617': theme.pageBgSolid,
    '#0f172a': theme.cardBg,
    '#1e293b': theme.cardBorder,
    '#334155': theme.cardBorderHover,
    '#111827': theme.btnSecondaryBg,
    '#08111f': theme.panelDarkBg,
    '#e2e8f0': theme.textPrimary,
    '#94a3b8': theme.textSecondary,
    '#64748b': theme.textMuted,
    '#f8fafc': theme.textHeading,
    '#cbd5e1': theme.textMid,
    '#bfdbfe': theme.infoText,
    '#22c55e': theme.green,
    '#f87171': theme.red,
    '#eab308': theme.yellow,
    '#f97316': theme.orange,
    '#60a5fa': theme.blue,
    '#a78bfa': theme.purple,
    '#38bdf8': theme.cyan,
    '#34d399': theme.emerald,
    '#166534': theme.greenDim,
    '#7f1d1d': theme.redDim,
    '#14532d': theme.btnSuccessBg,
    '#bbf7d0': theme.btnSuccessText,
    '#450a0a': theme.btnDangerBg,
    '#fecaca': theme.btnDangerText,
    '#ef4444': theme.red,
    '#f59e0b': theme.yellow,
    '#3b82f6': theme.blue,
    '#fca5a5': theme.red,
    '#475569': theme.textMuted,
    '#1e3a5f': theme.id === 'dark' ? '#1e3a5f' : (theme.id === 'light' ? '#dbeafe' : `${theme.blue}20`),
    '#3b1c1c': theme.id === 'dark' ? '#3b1c1c' : (theme.id === 'light' ? '#fee2e2' : `${theme.red}20`),
    'rgba(15, 23, 42, 0.88)': theme.panelBg,
    'rgba(15, 23, 42, 0.95)': theme.panelBg,
    'rgba(15, 23, 42, 0.85)': theme.panelBg,
    'rgba(30, 41, 59, 0.7)': theme.id === 'dark' ? 'rgba(30, 41, 59, 0.7)' : `${theme.cardBorder}90`,
    'rgba(0,0,0,0.3)': theme.shadow,
    'rgba(0,0,0,0.35)': theme.shadow,
  };

  // Build a single-pass regex from all source patterns
  const escaped = Object.keys(darkToTheme).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'g');

  function replaceInValue(val) {
    if (typeof val !== 'string') return val;
    return val.replace(pattern, (match) => darkToTheme[match] || match);
  }

  function replaceInObj(obj) {
    const result = {};
    for (const [key, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        result[key] = replaceInObj(val);
      } else {
        result[key] = replaceInValue(val);
      }
    }
    return result;
  }

  return replaceInObj(stylesObj);
}
