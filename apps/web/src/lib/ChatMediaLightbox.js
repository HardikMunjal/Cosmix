import { useCallback, useEffect, useRef, useState } from 'react';

function isVideoMedia(item) {
  if (!item) return false;
  if (item.mediaType === 'video') return true;
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(item.imageUrl || item.s3Key || ''));
}

function formatCommentTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Phone-style album viewer: swipe left/right between photos, comment on each.
 */
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
  postingComment = false,
}) {
  const [index, setIndex] = useState(startIndex);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const touchStartRef = useRef(null);
  const stageRef = useRef(null);
  const current = items[index] || null;
  const comments = Array.isArray(current?.comments) ? current.comments : [];

  const goPrev = useCallback(() => {
    if (items.length < 2) return;
    setAnimating(true);
    setIndex((value) => (value > 0 ? value - 1 : items.length - 1));
    setDragX(0);
  }, [items.length]);

  const goNext = useCallback(() => {
    if (items.length < 2) return;
    setAnimating(true);
    setIndex((value) => (value < items.length - 1 ? value + 1 : 0));
    setDragX(0);
  }, [items.length]);

  useEffect(() => {
    setIndex(startIndex);
    setDragX(0);
  }, [startIndex]);

  useEffect(() => {
    if (!animating) return undefined;
    const timer = window.setTimeout(() => setAnimating(false), 280);
    return () => window.clearTimeout(timer);
  }, [animating, index]);

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
    if (items.length < 2) return;
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, t: Date.now() };
    setDragging(true);
    setAnimating(false);
  };

  const handleTouchMove = (event) => {
    if (!touchStartRef.current || items.length < 2) return;
    const touch = event.touches?.[0] || event.changedTouches?.[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (event.cancelable) event.preventDefault();
      setDragX(dx);
    }
  };

  const handleTouchEnd = (event) => {
    if (!touchStartRef.current || items.length < 2) {
      setDragging(false);
      setDragX(0);
      return;
    }
    const touch = event.changedTouches?.[0];
    const endX = touch?.clientX ?? touchStartRef.current.x;
    const delta = endX - touchStartRef.current.x;
    const elapsed = Date.now() - touchStartRef.current.t;
    const width = stageRef.current?.clientWidth || window.innerWidth || 360;
    const threshold = Math.min(88, width * 0.22);
    const velocity = Math.abs(delta) / Math.max(1, elapsed);
    const shouldFlip = Math.abs(delta) > threshold || (Math.abs(delta) > 28 && velocity > 0.45);

    setDragging(false);
    touchStartRef.current = null;

    if (shouldFlip) {
      if (delta > 0) goPrev();
      else goNext();
    } else {
      setAnimating(true);
      setDragX(0);
    }
  };

  if (!current) return null;

  const video = isVideoMedia(current);
  const accent = theme?.blue || '#38bdf8';

  return (
    <>
      <style>{`
        .chat-lightbox {
          position: fixed;
          inset: 0;
          z-index: 1200;
          background: #000;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          color: #f8fafc;
          font-family: "SF Pro Text", "Segoe UI", system-ui, sans-serif;
        }
        .chat-lightbox-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px calc(10px + env(safe-area-inset-top, 0px));
          background: linear-gradient(180deg, rgba(0,0,0,0.72), transparent);
        }
        .chat-lightbox-stage {
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
          touch-action: pan-y;
          min-height: 0;
          background: #000;
        }
        .chat-lightbox-track {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          will-change: transform;
        }
        .chat-lightbox-track.is-animating {
          transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .chat-lightbox-media {
          max-width: 100vw;
          max-height: 100%;
          width: auto;
          height: auto;
          object-fit: contain;
          user-select: none;
          -webkit-user-drag: none;
          pointer-events: auto;
        }
        .chat-lightbox-icon-btn {
          width: 36px;
          height: 36px;
          border: none;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          color: #fff;
          font-size: 16px;
          line-height: 1;
          display: grid;
          place-items: center;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
        }
        .chat-lightbox-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: none;
          background: rgba(15,23,42,0.55);
          color: #fff;
          font-size: 22px;
          cursor: pointer;
          z-index: 2;
        }
        .chat-lightbox-nav--left { left: 8px; }
        .chat-lightbox-nav--right { right: 8px; }
        .chat-lightbox-footer {
          padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
          display: grid;
          gap: 10px;
          background: linear-gradient(0deg, rgba(0,0,0,0.92), rgba(0,0,0,0.78));
          border-top: 1px solid rgba(255,255,255,0.08);
          max-height: min(42vh, 360px);
        }
        .chat-lightbox-comments {
          display: grid;
          gap: 8px;
          overflow-y: auto;
          max-height: 140px;
          padding-right: 2px;
        }
        .chat-lightbox-comment {
          display: grid;
          gap: 2px;
          font-size: 13px;
          line-height: 1.35;
        }
        .chat-lightbox-comment strong {
          font-size: 12px;
          color: ${accent};
        }
        .chat-lightbox-comment span {
          color: rgba(226,232,240,0.55);
          font-size: 10px;
        }
        .chat-lightbox-empty-comments {
          font-size: 12px;
          color: rgba(148,163,184,0.85);
        }
        .chat-lightbox-thumbs {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .chat-lightbox-thumb {
          flex: 0 0 52px;
          width: 52px;
          height: 52px;
          border-radius: 10px;
          overflow: hidden;
          border: 2px solid transparent;
          padding: 0;
          cursor: pointer;
          scroll-snap-align: start;
          background: rgba(255,255,255,0.06);
        }
        .chat-lightbox-thumb--active {
          border-color: ${accent};
        }
        .chat-lightbox-thumb img,
        .chat-lightbox-thumb video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .chat-lightbox-composer {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }
        .chat-lightbox-composer input {
          border-radius: 999px;
          border: 1px solid rgba(148,163,184,0.28);
          background: rgba(15,23,42,0.85);
          color: #f8fafc;
          padding: 11px 14px;
          font-size: 14px;
          font-family: inherit;
          outline: none;
        }
        .chat-lightbox-composer button {
          border: none;
          border-radius: 999px;
          padding: 0 16px;
          background: ${accent};
          color: #0b1220;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
        }
        .chat-lightbox-composer button:disabled {
          opacity: 0.5;
          cursor: default;
        }
        @media (min-width: 900px) {
          .chat-lightbox-media {
            max-width: min(92vw, 1100px);
            max-height: min(72vh, 820px);
            border-radius: 8px;
          }
          .chat-lightbox-nav { display: grid; }
        }
        @media (max-width: 899px) {
          .chat-lightbox-nav { display: none; }
        }
      `}</style>
      <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">
        <div className="chat-lightbox-toolbar">
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current.caption || 'Photo'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.9)' }}>
              {index + 1} / {items.length}
              {current.uploadedBy ? ` · ${current.uploadedBy}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {onDownload ? (
              <button type="button" className="chat-lightbox-icon-btn" onClick={() => onDownload?.(current)} aria-label="Download" title="Download">
                ⬇
              </button>
            ) : null}
            <button type="button" className="chat-lightbox-icon-btn" onClick={onClose} aria-label="Close" title="Close">
              ✕
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className="chat-lightbox-stage"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {items.length > 1 ? (
            <>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--left" onClick={(event) => { event.stopPropagation(); goPrev(); }} aria-label="Previous">‹</button>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--right" onClick={(event) => { event.stopPropagation(); goNext(); }} aria-label="Next">›</button>
            </>
          ) : null}
          <div
            className={`chat-lightbox-track${animating && !dragging ? ' is-animating' : ''}`}
            style={{ transform: `translate3d(${dragX}px, 0, 0)` }}
          >
            {video ? (
              <video
                key={current.id}
                className="chat-lightbox-media"
                src={current.imageUrl}
                controls
                playsInline
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.id}
                className="chat-lightbox-media"
                src={current.imageUrl}
                alt={current.caption || 'Album media'}
                draggable={false}
                onClick={(event) => event.stopPropagation()}
              />
            )}
          </div>
        </div>

        <div className="chat-lightbox-footer">
          <div className="chat-lightbox-comments">
            {comments.length ? comments.map((comment) => (
              <div key={comment.id} className="chat-lightbox-comment">
                <div>
                  <strong>{comment.commentedBy}</strong>
                  {' '}
                  {comment.body}
                </div>
                <span>{formatCommentTime(comment.createdAt)}</span>
              </div>
            )) : (
              <div className="chat-lightbox-empty-comments">No comments yet — be the first.</div>
            )}
          </div>

          {items.length > 1 ? (
            <div className="chat-lightbox-thumbs">
              {items.map((item, itemIndex) => {
                const thumbVideo = isVideoMedia(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`chat-lightbox-thumb${itemIndex === index ? ' chat-lightbox-thumb--active' : ''}`}
                    onClick={() => {
                      setAnimating(true);
                      setIndex(itemIndex);
                      setDragX(0);
                    }}
                  >
                    {thumbVideo ? (
                      <video src={item.imageUrl} muted playsInline preload="metadata" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt="" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : null}

          {canComment ? (
            <form
              className="chat-lightbox-composer"
              onSubmit={(event) => {
                event.preventDefault();
                onPostComment?.(current.id);
              }}
            >
              <input
                value={commentDrafts[current.id] || ''}
                onChange={(event) => onCommentDraftChange?.(current.id, event.target.value)}
                placeholder="Add a comment…"
                disabled={postingComment}
              />
              <button type="submit" disabled={postingComment || !String(commentDrafts[current.id] || '').trim()}>
                {postingComment ? '…' : 'Post'}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
