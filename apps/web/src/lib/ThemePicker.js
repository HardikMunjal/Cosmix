import { useState, useEffect, useRef } from 'react';
import { themes, getThemeId, setThemeId, getTheme } from './themes';

/**
 * useTheme hook — returns { theme, themeId, setTheme }
 * Pages call this to get the active theme and a setter.
 */
export function useTheme() {
  const [themeId, setId] = useState('dark');
  useEffect(() => { setId(getThemeId()); }, []);
  const setTheme = (id) => { setThemeId(id); setId(id); };
  return { theme: getTheme(themeId), themeId, setTheme };
}

/**
 * ThemePicker — floating dropdown button.
 * Usage: <ThemePicker theme={theme} themeId={themeId} setTheme={setTheme} />
 */
export function ThemePicker({ theme, themeId, setTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const ids = Object.keys(themes);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: theme.cardBg,
          border: `1px solid ${theme.cardBorder}`,
          color: theme.textPrimary,
          borderRadius: 8,
          padding: '6px 14px',
          cursor: 'pointer',
          fontSize: 13,
          fontFamily: theme.font,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 16 }}>{themes[themeId].label.split(' ')[0]}</span>
        <span>Theme</span>
        <span style={{ fontSize: 10, marginLeft: 2, opacity: 0.5 }}>▼</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            background: theme.cardBg,
            border: `1px solid ${theme.cardBorder}`,
            borderRadius: 10,
            boxShadow: `0 8px 24px ${theme.shadow}`,
            zIndex: 9999,
            minWidth: 180,
            overflow: 'hidden',
          }}
        >
          {ids.map((id) => (
            <button
              key={id}
              onClick={() => { setTheme(id); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                background: themeId === id ? theme.sectionBg : 'transparent',
                border: 'none',
                borderBottom: `1px solid ${theme.divider}`,
                padding: '10px 16px',
                cursor: 'pointer',
                color: theme.textPrimary,
                fontSize: 14,
                fontFamily: theme.font,
              }}
            >
              <span style={{ fontSize: 18 }}>{themes[id].label.split(' ')[0]}</span>
              <span>{themes[id].label.slice(themes[id].label.indexOf(' ') + 1)}</span>
              {themeId === id && <span style={{ marginLeft: 'auto', color: theme.green }}>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
