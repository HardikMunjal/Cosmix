import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

/**
 * Sticky bottom navigation for mobile-first pages.
 * items: { id, label, icon, href?, onClick?, matchPaths? }
 */
export function MobileBottomNav({ theme, items = [], activeId, hideSpacer = false }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const resolveIsActive = (item) => {
    if (activeId) return item.id === activeId;
    if (!hydrated) return false;
    const paths = item.matchPaths || (item.href ? [item.href] : []);
    return paths.some((path) => router.pathname === path || router.asPath.startsWith(path));
  };

  const navStyle = hydrated && theme
    ? {
        '--cosmix-nav-active': theme.blue || '#38bdf8',
        '--cosmix-nav-muted': theme.textMuted || '#94a3b8',
      }
    : undefined;

  return (
    <>
      {!hideSpacer ? <div className="cosmix-mobile-nav-spacer" aria-hidden="true" /> : null}
      <nav
        className="cosmix-mobile-nav"
        aria-label="Main navigation"
        style={navStyle}
        suppressHydrationWarning
      >
        <div className="cosmix-mobile-nav-inner">
          {items.map((item) => {
            const isActive = resolveIsActive(item);
            const handleClick = () => {
              if (item.onClick) {
                item.onClick();
                return;
              }
              if (item.href) router.push(item.href);
            };
            return (
              <button
                key={item.id}
                type="button"
                className={`cosmix-mobile-nav-btn${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                onClick={handleClick}
              >
                <span className="cosmix-mobile-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="cosmix-mobile-nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
