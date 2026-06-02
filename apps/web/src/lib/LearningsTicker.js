import { useMemo } from 'react';

const DESKTOP_SCROLL_SECONDS = 110;

export function LearningsTicker({ items = [], theme, styles = {} }) {
  const learnings = useMemo(
    () => (Array.isArray(items) ? items : []).filter((item) => String(item?.learning || '').trim()),
    [items],
  );

  if (!learnings.length) return null;

  const loopItems = [...learnings, ...learnings];
  const duration = learnings.length > 2 ? DESKTOP_SCROLL_SECONDS : DESKTOP_SCROLL_SECONDS * 0.75;

  return (
    <>
      <style>{`
        @keyframes cosmix-learnings-marquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }
        .cosmix-learnings-desktop {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow: hidden;
        }
        .cosmix-learnings-marquee-track {
          flex: 1;
          overflow: hidden;
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .cosmix-learnings-marquee-inner {
          display: inline-flex;
          align-items: center;
          width: max-content;
          animation: cosmix-learnings-marquee ${duration}s linear infinite;
        }
        .cosmix-learnings-marquee-inner:hover {
          animation-play-state: paused;
        }
        .cosmix-learnings-mobile-list {
          display: none;
          gap: 8px;
          max-height: 132px;
          overflow-y: auto;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding-right: 2px;
        }
        .cosmix-learnings-mobile-card {
          border-radius: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(148,163,184,0.2);
          background: rgba(15,23,42,0.55);
        }
        @media (max-width: 720px) {
          .nifty-learnings-ticker {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .cosmix-learnings-desktop { display: none !important; }
          .cosmix-learnings-mobile-list {
            display: grid !important;
            width: 100% !important;
          }
        }
      `}</style>

      <div style={{ ...styles.learningsTicker, flexWrap: 'wrap' }} className="nifty-learnings-ticker">
        <span style={styles.learningsTickerLabel}>💡 Lessons</span>

        <div className="cosmix-learnings-desktop" style={{ flex: 1, minWidth: 0 }}>
          <div className="cosmix-learnings-marquee-track">
            <div className="cosmix-learnings-marquee-inner">
              {loopItems.map((item, index) => (
                <span key={`${item.id}-desktop-${index}`} style={styles.learningsTickerItem}>
                  <span style={styles.learningsTickerName}>{item.name}:</span>
                  &nbsp;{item.learning}
                  <span style={styles.learningsTickerSep}>•</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="cosmix-learnings-mobile-list" aria-label="Trade lessons">
          {learnings.map((item) => (
            <div key={`${item.id}-mobile`} className="cosmix-learnings-mobile-card">
              <div style={{ fontSize: '11px', fontWeight: 800, color: theme?.orange || '#fbbf24', marginBottom: '4px' }}>
                {item.name}
              </div>
              <div style={{ fontSize: '12px', color: theme?.textSecondary || '#cbd5e1', lineHeight: 1.45 }}>
                {item.learning}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
