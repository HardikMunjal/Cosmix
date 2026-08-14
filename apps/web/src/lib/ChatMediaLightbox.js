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

function MediaSlide({ item }) {
  if (!item) return <div className="chat-lightbox-slide is-empty" />;
  if (isVideoMedia(item)) {
    return (
      <div className="chat-lightbox-slide">
        <video
          className="chat-lightbox-media"
          src={item.imageUrl}
          controls
          playsInline
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    );
  }
  return (
    <div className="chat-lightbox-slide">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="chat-lightbox-media"
        src={item.imageUrl}
        alt={item.caption || 'Album media'}
        draggable={false}
      />
    </div>
  );
}

/**
 * Phone-style album viewer: swipe left/right between photos, swipe down to close.
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
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const touchStartRef = useRef(null);
  const stageRef = useRef(null);
  const current = items[index] || null;
  const comments = Array.isArray(current?.comments) ? current.comments : [];
  const prevItem = items.length > 1 ? items[(index - 1 + items.length) % items.length] : null;
  const nextItem = items.length > 1 ? items[(index + 1) % items.length] : null;

  const goPrev = useCallback(() => {
    if (items.length < 2) return;
    setAnimating(false);
    setIndex((value) => (value > 0 ? value - 1 : items.length - 1));
    setDragX(0);
    setDragY(0);
  }, [items.length]);

  const goNext = useCallback(() => {
    if (items.length < 2) return;
    setAnimating(false);
    setIndex((value) => (value < items.length - 1 ? value + 1 : 0));
    setDragX(0);
    setDragY(0);
  }, [items.length]);

  useEffect(() => {
    setIndex(startIndex);
    setDragX(0);
    setDragY(0);
  }, [startIndex]);

  useEffect(() => {
    if (!animating) return undefined;
    const timer = window.setTimeout(() => setAnimating(false), 240);
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

  const beginDrag = (x, y) => {
    touchStartRef.current = { x, y, t: Date.now(), axis: null };
    setDragging(true);
    setAnimating(false);
  };

  const moveDrag = (x, y, event) => {
    if (!touchStartRef.current) return;
    const dx = x - touchStartRef.current.x;
    const dy = y - touchStartRef.current.y;
    if (!touchStartRef.current.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      touchStartRef.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (touchStartRef.current.axis === 'x') {
      if (items.length < 2) return;
      if (event?.cancelable) event.preventDefault();
      setDragX(dx);
      setDragY(0);
      return;
    }
    if (dy > 0) {
      if (event?.cancelable) event.preventDefault();
      setDragY(dy);
      setDragX(0);
    }
  };

  const endDrag = (x, y) => {
    if (!touchStartRef.current) {
      setDragging(false);
      setDragX(0);
      setDragY(0);
      return;
    }
    const dx = x - touchStartRef.current.x;
    const dy = y - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.t;
    const axis = touchStartRef.current.axis;
    const width = stageRef.current?.clientWidth || window.innerWidth || 360;
    const height = stageRef.current?.clientHeight || window.innerHeight || 640;
    const velocity = Math.abs(axis === 'y' ? dy : dx) / Math.max(1, elapsed);
    touchStartRef.current = null;
    setDragging(false);

    if (axis === 'y' && (dy > Math.min(110, height * 0.18) || (dy > 48 && velocity > 0.55))) {
      onClose?.();
      return;
    }
    if (axis === 'x' && items.length > 1) {
      const threshold = Math.min(56, width * 0.12);
      const shouldFlip = Math.abs(dx) > threshold || (Math.abs(dx) > 24 && velocity > 0.35);
      if (shouldFlip) {
        if (dx > 0) goPrev();
        else goNext();
        return;
      }
    }
    setAnimating(true);
    setDragX(0);
    setDragY(0);
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target?.closest?.('video, input, button, textarea, a')) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginDrag(event.clientX, event.clientY);
  };

  const handlePointerMove = (event) => {
    if (!touchStartRef.current) return;
    moveDrag(event.clientX, event.clientY, event);
  };

  const handlePointerUp = (event) => {
    endDrag(event.clientX, event.clientY);
  };

  if (!current) return null;

  const accent = theme?.blue || '#38bdf8';
  const closing = dragY > 0;
  const dim = closing ? Math.max(0.35, 1 - dragY / 420) : 1;
  const trackX = items.length > 1
    ? `calc(-33.333% + ${dragX}px)`
    : `${dragX}px`;

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
          padding: calc(10px + env(safe-area-inset-top, 0px)) 10px 10px;
          background: linear-gradient(180deg, rgba(0,0,0,0.78), transparent);
          z-index: 3;
        }
        .chat-lightbox-back {
          appearance: none;
          border: none;
          background: rgba(255,255,255,0.14);
          color: #fff;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 15px;
          font-weight: 800;
          cursor: pointer;
          font-family: inherit;
          flex-shrink: 0;
        }
        .chat-lightbox-stage {
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
          touch-action: none;
          min-height: 0;
          background: #000;
          cursor: grab;
        }
        .chat-lightbox-stage:active { cursor: grabbing; }
        .chat-lightbox-track {
          width: ${items.length > 1 ? '300%' : '100%'};
          height: 100%;
          display: flex;
          will-change: transform;
        }
        .chat-lightbox-track.is-animating {
          transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .chat-lightbox-slide {
          flex: 0 0 ${items.length > 1 ? '33.333%' : '100%'};
          width: ${items.length > 1 ? '33.333%' : '100%'};
          height: 100%;
          display: grid;
          place-items: center;
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
          width: 40px;
          height: 40px;
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
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: none;
          background: rgba(15,23,42,0.45);
          color: #fff;
          font-size: 26px;
          cursor: pointer;
          z-index: 2;
        }
        .chat-lightbox-nav--left { left: 6px; }
        .chat-lightbox-nav--right { right: 6px; }
        .chat-lightbox-hint {
          position: absolute;
          bottom: 12px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 11px;
          font-weight: 700;
          color: rgba(248,250,252,0.62);
          pointer-events: none;
          z-index: 2;
        }
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
          flex: 0 0 56px;
          width: 56px;
          height: 56px;
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
        }
      `}</style>
      <div className="chat-lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" style={{ opacity: dim }}>
        <div className="chat-lightbox-toolbar">
          <button type="button" className="chat-lightbox-back" onClick={onClose}>
            ← Back
          </button>
          <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {current.caption || 'Photo'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(148,163,184,0.9)' }}>
              {index + 1} / {items.length}
              {current.uploadedBy ? ` · ${current.uploadedBy}` : ''}
            </div>
          </div>
          {onDownload ? (
            <button type="button" className="chat-lightbox-icon-btn" onClick={() => onDownload?.(current)} aria-label="Download" title="Download">
              ⬇
            </button>
          ) : null}
        </div>

        <div
          ref={stageRef}
          className="chat-lightbox-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {items.length > 1 ? (
            <>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--left" onClick={(event) => { event.stopPropagation(); goPrev(); }} aria-label="Previous">‹</button>
              <button type="button" className="chat-lightbox-nav chat-lightbox-nav--right" onClick={(event) => { event.stopPropagation(); goNext(); }} aria-label="Next">›</button>
            </>
          ) : null}
          <div
            className={`chat-lightbox-track${animating && !dragging ? ' is-animating' : ''}`}
            style={{ transform: `translate3d(${trackX}, ${dragY}px, 0)` }}
          >
            {items.length > 1 ? <MediaSlide item={prevItem} /> : null}
            <MediaSlide item={current} />
            {items.length > 1 ? <MediaSlide item={nextItem} /> : null}
          </div>
          {items.length > 1 && !dragging ? (
            <div className="chat-lightbox-hint">Swipe photos · swipe down to close</div>
          ) : null}
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
                      setDragY(0);
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
