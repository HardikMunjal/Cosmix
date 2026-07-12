import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

/**
 * Sticky bottom navigation for mobile-first pages.
 * items: { id, label, icon, href?, onClick?, matchPaths? }
 */
function navigateToHref(router, href) {
  const raw = String(href || '').trim();
  if (!raw) return;

  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const url = new URL(raw, baseOrigin);
    const pathname = url.pathname;
    const query = Object.fromEntries(url.searchParams.entries());
    const hasQuery = Object.keys(query).length > 0;

    if (!hasQuery && router.pathname === pathname) return;

    if (hasQuery) {
      const samePath = router.pathname === pathname;
      const sameQuery = Object.entries(query).every(([key, value]) => String(router.query[key] || '') === String(value));
      if (samePath && sameQuery) return;
      void router.push({ pathname, query });
      return;
    }

    void router.push(pathname);
  } catch {
    void router.push(raw);
  }
}

export function MobileBottomNav({ theme, items = [], activeId, hideSpacer = false }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const resolveIsActive = useCallback((item) => {
    if (activeId) return item.id === activeId;
    if (!hydrated) return false;
    const paths = item.matchPaths || (item.href ? [item.href] : []);
    return paths.some((path) => {
      const base = String(path).split('?')[0];
      return router.pathname === base || router.asPath.startsWith(base);
    });
  }, [activeId, hydrated, router.asPath, router.pathname]);

  const handleNavClick = useCallback((item) => {
    if (item.onClick) {
      item.onClick();
      return;
    }
    if (item.href) {
      navigateToHref(router, item.href);
    }
  }, [router]);

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
            const className = `cosmix-mobile-nav-btn${isActive ? ' is-active' : ''}`;

            return (
              <button
                key={item.id}
                type="button"
                className={className}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleNavClick(item)}
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
