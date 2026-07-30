import { useEffect, useRef, useState } from 'react';

/**
 * Draggable circular + button, default bottom-center above mobile nav.
 */
export function FloatingCreateFab({
  onClick,
  theme,
  storageKey = 'nifty-create-fab-pos',
  hidden = false,
}) {
  const fabRef = useRef(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pointerId: null,
  });
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
          setPos({ x: parsed.x, y: parsed.y });
          return;
        }
      }
    } catch (_) { /* ignore */ }

    const width = 58;
    const x = Math.max(12, Math.round((window.innerWidth - width) / 2));
    const y = Math.max(12, window.innerHeight - 118);
    setPos({ x, y });
  }, [storageKey]);

  useEffect(() => {
    if (!pos || typeof window === 'undefined') return undefined;
    const onResize = () => {
      setPos((current) => {
        if (!current) return current;
        const maxX = window.innerWidth - 70;
        const maxY = window.innerHeight - 70;
        return {
          x: Math.min(Math.max(8, current.x), maxX),
          y: Math.min(Math.max(8, current.y), maxY),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos]);

  if (hidden || !pos) return null;

  const onPointerDown = (event) => {
    if (event.button != null && event.button !== 0) return;
    const node = fabRef.current;
    if (!node) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos.x,
      originY: pos.y,
      pointerId: event.pointerId,
    };
    try { node.setPointerCapture(event.pointerId); } catch (_) { /* ignore */ }
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
    const maxX = window.innerWidth - 70;
    const maxY = window.innerHeight - 70;
    setPos({
      x: Math.min(Math.max(8, drag.originX + dx), maxX),
      y: Math.min(Math.max(8, drag.originY + dy), maxY),
    });
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag.active) return;
    drag.active = false;
    const node = fabRef.current;
    try { node?.releasePointerCapture(drag.pointerId); } catch (_) { /* ignore */ }

    setPos((current) => {
      if (!current) return current;
      try { sessionStorage.setItem(storageKey, JSON.stringify(current)); } catch (_) { /* ignore */ }
      return current;
    });

    if (!drag.moved && typeof onClick === 'function') {
      onClick(event);
    }
  };

  return (
    <button
      ref={fabRef}
      type="button"
      className="nifty-create-fab"
      aria-label="New strategy"
      title="New strategy (drag to move)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        background: theme?.blue || '#2563eb',
        boxShadow: `0 14px 34px ${theme?.shadow || 'rgba(37,99,235,0.35)'}`,
      }}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default FloatingCreateFab;
