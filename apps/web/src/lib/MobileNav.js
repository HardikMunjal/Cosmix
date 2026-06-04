import Link from 'next/link';
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
    return paths.some((path) => {
      const base = String(path).split('?')[0];
      return router.pathname === base || router.asPath.startsWith(base);
    });
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
            const className = `cosmix-mobile-nav-btn${isActive ? ' is-active' : ''}`;

            if (item.href) {
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={className}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={(event) => {
                    const base = String(item.href).split('?')[0];
                    if (router.pathname === base && !String(item.href).includes('?')) {
                      event.preventDefault();
                    }
                  }}
                >
                  <span className="cosmix-mobile-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span className="cosmix-mobile-nav-label">{item.label}</span>
                </Link>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                className={className}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (item.onClick) item.onClick();
                }}
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
