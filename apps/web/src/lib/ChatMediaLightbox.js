import { useCallback, useEffect, useRef, useState } from 'react';

function isVideoMedia(item) {
  if (!item) return false;
  if (item.mediaType === 'video') return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(item.imageUrl || item.s3Key || ''));
}

export function ChatMediaLightbox({
  theme,
  items = [],
  startIndex = 0,
  onClose,
  onDownload,
  commentDrafts = {},
  onCommentDraftChange,
  onPostComment,
  canComment = false,
}) {
  const [index, setIndex] = useState(startIndex);
  const touchStartRef = useRef(null);
  const current = items[index] || null;

  const goPrev = useCallback(() => {
    setIndex((value) => (value > 0 ? value - 1 : items.length - 1));
  }, [items.length]);

  const goNext = useCallback(() => {
    setIndex((value) => (value < items.length - 1 ? value + 1 : 0));
  }, [items.length]);

  useEffect(() => {
    setIndex(startIndex);
  }, [startIndex]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'ArrowRight') goNext();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, onClose]);

  const handleTouchStart = (event) => {
    touchStartRef.current = event.changedTouches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    if (touchStartRef.current == null || items.length < 2) return;
    const endX = event.changedTouches?.[0]?.clientX;
    if (endX == null) return;
    const delta = endX - touchStartRef.current;
    if (Math.abs(delta) < 48) return;
    if (delta > 0) goPrev();
    else goNext();
    touchStartRef.current = null;
  };

  if (!current) return null;

  const video = isVideoMedia(current);

  return (
    <>
      <style>{`
        .chat-lightbox {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: rgba(2, 6, 23, 0.94);
          display: grid;
          grid-template-rows: auto 1fr auto;
        }
        .chat-lightbox-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(148,163,184,0.18);
        }
        .chat-lightbox-stage {
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
          touch-action: pan-y;
        }
        .chat-lightbox-media {
          max-width: min(96vw, 980px);
          max-height: min(68vh, 760px);
          width: auto;
          height: auto;
          object-fit: contain;
          border-radius: 16px;
          box-shadow: 0 24px 60px rgba(0,0,0,0.45);
        }
        .chat-lightbox-icon-btn {
          width: 36px;
          height: 36px;
          border: 1px solid rgba(148,163,184,0.35);
          border-radius: 10px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          font-size: 16px;
          line-height: 1;
          display: grid;
          place-items: center;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
        }
        .chat-lightbox-icon-btn--primary {
          background: ${theme?.blue || '#2563eb'};
          border-color: ${theme?.blue || '#2563eb'};
        }
        .chat-lightbox-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 42px;
          height: 42px;
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.35);
          background: rgba(15,23,42,0.82);
          color: #fff;
          font-size: 20px;
          cursor: pointer;
        }
        .chat-lightbox-nav--left { left: 10px; }
        .chat-lightbox-nav--right { right: 10px; }
        .chat-lightbox-dots {
          display: flex;
          justify-content: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .chat-lightbox-dot {
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: rgba(148,163,184,0.45);
        }
        .chat-lightbox-dot--active {
          background: ${theme?.blue || '#38bdf8'};
          width: 18px;
        }
        @media (max-width: 720px) {
          .chat-lightbox-toolbar {
            padding: 10px 12px;
          }
          .chat-lightbox-media {
            max-width: 100vw;
            max-height: min(82vh, 900px);
            border-radius: 0;
            box-shadow: none;
          }
          .chat-lightbox-stage {
            padding: 0 4px;
          }
          .chat-lightbox-nav {
            width: 36px;
            height: 36px;
            font-size: 18px;
          }
          .chat-lightbox-nav--left { left: 4px; }
          .chat-lightbox-nav--right { right: 4px; }
          .chat-lightbox-thumb {
            flex: 0 0 56px;
            width: 56px;
            height: 56px;
          }
        }
        .chat-lightbox-footer {
          padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
          display: grid;
          gap: 10px;
          border-top: 1px solid rgba(148,163,184,0.18);
          background: rgba(15,23,42,0.88);
        }
        .chat-lightbox-thumbs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
          scroll-snap-type: x mandatory;
        }
        .chat-lightbox-thumb {
          flex: 0 0 64px;
          width: 64px;
          height: 64px;
          border-radius: 12px;
          overflow: hidden;
          border: 2px solid transparent;
          padding: 0;
          cursor: pointer;
          scroll-snap-align: start;
          background: rgba(255,255,255,0.06);
        }
        .chat-lightbox-thumb--active {
          border-color: ${theme?.blue || '#38bdf8'};
        }
        .chat-lightbox-thumb img,
        .chat-lightbox-thumb video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
      `}</style>
      <div className="chat-lightbox" role="dialog" aria-modal="true">
        <div className="chat-lightbox-toolbar">
          <div style={{ display: 'grid', gap: 2 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: theme?.textHeading || '#f8fafc' }}>
              {current.caption || 'Untitled'}
            </div>
            <div style={{ fontSize: 11, color: theme?.textMuted || '#94a3b8' }}>
              {index + 1} / {items.length} · by {current.uploadedBy || 'member'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="chat-lightbox-icon-btn chat-lightbox-icon-btn--primary" onClick={() => onDownload?.(current)} aria-label="Download" title="Download">
              ⬇
            </button>
            <button type="button" className="chat-lightbox-icon-btn" onClick={onClose} aria-label="Close" title="Close">
              ✕
            </button>
          </div>
        </div>

        <div
          className="chat-lightbox-stage"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {items.length > 1 ? (
            <>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--left" onClick={(event) => { event.stopPropagation(); goPrev(); }} aria-label="Previous">‹</button>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--right" onClick={(event) => { event.stopPropagation(); goNext(); }} aria-label="Next">›</button>
            </>
          ) : null}
          {video ? (
            <video
              key={current.id}
              className="chat-lightbox-media"
              src={current.imageUrl}
              controls
              autoPlay
              playsInline
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <img
              key={current.id}
              className="chat-lightbox-media"
              src={current.imageUrl}
              alt={current.caption || 'Album media'}
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </div>

        <div className="chat-lightbox-footer">
          {items.length > 1 && items.length <= 12 ? (
            <div className="chat-lightbox-dots" aria-hidden="true">
              {items.map((item, itemIndex) => (
                <span key={item.id} className={`chat-lightbox-dot${itemIndex === index ? ' chat-lightbox-dot--active' : ''}`} />
              ))}
            </div>
          ) : null}
          {items.length > 1 ? (
            <div className="chat-lightbox-thumbs">
              {items.map((item, itemIndex) => {
                const thumbVideo = isVideoMedia(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-lightbox-thumb${itemIndex === index ? ' chat-lightbox-thumb--active' : ''}`}
                    onClick={() => setIndex(itemIndex)}
                  >
                    {thumbVideo ? (
                      <video src={item.imageUrl} muted playsInline preload="metadata" />
                    ) : (
                      <img src={item.imageUrl} alt="" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}
          {canComment ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
              <input
                style={{ borderRadius: 12, border: `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.35)'}`, background: theme?.inputBg || '#020617', color: theme?.textPrimary || '#e2e8f0', padding: '10px 12px', fontSize: 13 }}
                value={commentDrafts[current.id] || ''}
                onChange={(event) => onCommentDraftChange?.(current.id, event.target.value)}
                placeholder="Add a comment…"
              />
              <button type="button" onClick={() => onPostComment?.(current.id)} style={{ border: 'none', borderRadius: 12, padding: '10px 14px', background: theme?.purple || '#a855f7', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                Post
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
