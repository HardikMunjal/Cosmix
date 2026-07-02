import { useCallback, useEffect, useRef, useState } from 'react';

export function BuddySafetyStyles() {
  return (
    <style>{`
      @keyframes bs-float {
        0%, 100% { transform: translateY(0px) rotateX(0deg); }
        50% { transform: translateY(-6px) rotateX(2deg); }
      }
      @keyframes bs-pulse-ring {
        0% { transform: scale(0.85); opacity: 0.9; }
        70% { transform: scale(1.35); opacity: 0; }
        100% { transform: scale(1.35); opacity: 0; }
      }
      @keyframes bs-shimmer {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
      @keyframes bs-live-dot {
        0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
        50% { box-shadow: 0 0 0 10px rgba(34,197,94,0); }
      }
      @keyframes bs-alert-glow {
        0%, 100% { box-shadow: 0 0 20px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.08); }
        50% { box-shadow: 0 0 36px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.12); }
      }
      @keyframes bs-orbit {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes bs-slide-up {
        from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .bs-page {
        min-height: 100vh;
        color: #e2e8f0;
        padding: 24px 16px 100px;
        background:
          radial-gradient(ellipse 80% 50% at 20% -10%, rgba(244,63,94,0.18), transparent 55%),
          radial-gradient(ellipse 60% 40% at 90% 10%, rgba(56,189,248,0.14), transparent 50%),
          radial-gradient(ellipse 50% 30% at 50% 100%, rgba(124,58,237,0.12), transparent 55%),
          linear-gradient(180deg, #060a14 0%, #0b1220 40%, #111827 100%);
        perspective: 1200px;
      }
      .bs-container { max-width: 1100px; margin: 0 auto; position: relative; z-index: 1; }
      .bs-grid-bg {
        position: fixed; inset: 0; pointer-events: none; opacity: 0.35;
        background-image:
          linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px),
          linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px);
        background-size: 48px 48px;
        mask-image: radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent);
      }
      .bs-hero-title {
        font-size: clamp(28px, 5vw, 38px);
        font-weight: 900;
        letter-spacing: -0.03em;
        background: linear-gradient(135deg, #fff 0%, #fda4af 45%, #38bdf8 100%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .bs-card {
        position: relative;
        border-radius: 24px;
        padding: 22px;
        margin-bottom: 18px;
        background: linear-gradient(145deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02));
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow:
          0 24px 48px rgba(0,0,0,0.35),
          0 1px 0 rgba(255,255,255,0.06) inset,
          0 -1px 0 rgba(0,0,0,0.2) inset;
        backdrop-filter: blur(18px);
        transform-style: preserve-3d;
        transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease;
        animation: bs-slide-up 0.5s ease both;
      }
      .bs-card::before {
        content: '';
        position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
        background: linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 42%, transparent 58%, rgba(255,255,255,0.04) 100%);
        opacity: 0.6;
      }
      .bs-card:hover {
        box-shadow:
          0 32px 64px rgba(0,0,0,0.42),
          0 0 0 1px rgba(251,113,133,0.15),
          0 1px 0 rgba(255,255,255,0.1) inset;
      }
      .bs-card-tilt { will-change: transform; }
      .bs-eyebrow {
        font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
        color: #94a3b8; margin-bottom: 6px; font-weight: 800;
      }
      .bs-metric {
        position: relative; border-radius: 18px; padding: 14px 16px; overflow: hidden;
        background: linear-gradient(160deg, rgba(15,23,42,0.85), rgba(2,6,23,0.65));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 12px 24px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.05);
        transform: translateZ(12px);
        transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
      }
      .bs-metric:hover {
        transform: translateY(-4px) translateZ(20px);
        border-color: rgba(56,189,248,0.35);
        box-shadow: 0 18px 32px rgba(0,0,0,0.35), 0 0 24px rgba(56,189,248,0.08);
      }
      .bs-metric-label {
        font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; font-weight: 700;
      }
      .bs-metric-value {
        font-size: 22px; font-weight: 900; margin-top: 6px; letter-spacing: -0.02em;
      }
      .bs-tab {
        padding: 10px 18px; border-radius: 999px; cursor: pointer; font-weight: 700; font-size: 13px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(15,23,42,0.55);
        color: #cbd5e1;
        transition: all 0.25s ease;
        box-shadow: 0 8px 16px rgba(0,0,0,0.2);
      }
      .bs-tab:hover { transform: translateY(-2px); border-color: rgba(251,113,133,0.4); }
      .bs-tab.is-active {
        color: #fff;
        border-color: rgba(251,113,133,0.65);
        background: linear-gradient(135deg, rgba(225,29,72,0.35), rgba(249,115,22,0.25));
        box-shadow: 0 12px 28px rgba(225,29,72,0.25), inset 0 1px 0 rgba(255,255,255,0.12);
      }
      .bs-btn-primary {
        padding: 12px 20px; border-radius: 14px; border: none; cursor: pointer; font-weight: 800; font-size: 14px;
        color: #fff;
        background: linear-gradient(135deg, #e11d48 0%, #f97316 50%, #fb7185 100%);
        background-size: 200% auto;
        box-shadow: 0 14px 28px rgba(225,29,72,0.35), inset 0 1px 0 rgba(255,255,255,0.2);
        transition: transform 0.2s ease, box-shadow 0.2s ease, background-position 0.4s ease;
      }
      .bs-btn-primary:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.02);
        background-position: right center;
        box-shadow: 0 18px 36px rgba(225,29,72,0.45);
      }
      .bs-btn-primary:disabled { opacity: 0.55; cursor: not-allowed; }
      .bs-btn-ghost {
        padding: 12px 18px; border-radius: 14px; cursor: pointer; font-weight: 700; font-size: 13px;
        color: #e2e8f0;
        background: rgba(15,23,42,0.5);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 8px 20px rgba(0,0,0,0.22);
        transition: transform 0.2s ease, border-color 0.2s ease;
      }
      .bs-btn-ghost:hover { transform: translateY(-2px); border-color: rgba(56,189,248,0.45); }
      .bs-btn-danger {
        padding: 12px 18px; border-radius: 14px; border: none; cursor: pointer; font-weight: 800;
        color: #fff; background: linear-gradient(135deg, #991b1b, #dc2626);
        box-shadow: 0 12px 24px rgba(220,38,38,0.35);
      }
      .bs-input {
        width: 100%; padding: 12px 14px; border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(2,6,23,0.75);
        color: #f1f5f9;
        box-shadow: inset 0 2px 8px rgba(0,0,0,0.25);
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
      }
      .bs-input:focus {
        outline: none;
        border-color: rgba(56,189,248,0.5);
        box-shadow: 0 0 0 3px rgba(56,189,248,0.12), inset 0 2px 8px rgba(0,0,0,0.25);
      }
      .bs-trip-row {
        display: flex; justify-content: space-between; gap: 10px; align-items: center;
        padding: 14px 16px; border-radius: 16px; cursor: pointer; text-align: left;
        background: linear-gradient(145deg, rgba(15,23,42,0.7), rgba(2,6,23,0.5));
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 10px 20px rgba(0,0,0,0.22);
        color: #f1f5f9;
        transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
      }
      .bs-search-results {
        display: grid;
        gap: 8px;
        max-height: min(280px, 42vh);
        overflow-y: auto;
        padding: 4px 2px;
        margin-top: 4px;
        position: relative;
        z-index: 5;
        -webkit-overflow-scrolling: touch;
      }
      .bs-search-result {
        display: block;
        width: 100%;
        text-align: left;
        padding: 12px 14px;
        border-radius: 14px;
        cursor: pointer;
        border: 1px solid rgba(56,189,248,0.28);
        background: rgba(15, 23, 42, 0.98);
        color: #f8fafc;
        box-shadow: 0 8px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
        transition: border-color 0.2s ease, background 0.2s ease;
      }
      .bs-search-result:hover,
      .bs-search-result:focus {
        outline: none;
        border-color: rgba(56,189,248,0.65);
        background: rgba(30, 41, 59, 0.98);
      }
      .bs-search-result-title {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #f8fafc;
        line-height: 1.35;
      }
      .bs-search-result-sub {
        display: block;
        margin-top: 5px;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
      }
      .bs-search-hint {
        font-size: 13px;
        color: #94a3b8;
        padding: 8px 2px;
      }
      .bs-search-error {
        font-size: 13px;
        color: #fca5a5;
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(127, 29, 29, 0.2);
        border: 1px solid rgba(248, 113, 113, 0.25);
        line-height: 1.45;
      }
      .bs-current-loc {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(2,6,23,0.45);
        position: relative;
        z-index: 4;
      }
      .bs-current-loc.is-active {
        border-color: rgba(34,197,94,0.45);
        background: rgba(6,78,59,0.15);
        box-shadow: 0 0 0 1px rgba(34,197,94,0.12);
      }
      .bs-current-loc-label {
        padding: 8px 10px;
        border-radius: 10px;
        background: rgba(15,23,42,0.85);
        border: 1px solid rgba(56,189,248,0.2);
      }
      .bs-place-divider {
        font-size: 11px;
        color: #64748b;
        text-align: center;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin: 4px 0;
      }
      .bs-trip-row:hover {
        transform: translateX(4px) translateY(-2px);
        border-color: rgba(56,189,248,0.4);
        box-shadow: 0 16px 28px rgba(0,0,0,0.3), 0 0 20px rgba(56,189,248,0.08);
      }
      .bs-trip-row.is-selected {
        border-color: rgba(56,189,248,0.65);
        box-shadow: 0 0 0 1px rgba(56,189,248,0.2), 0 16px 32px rgba(56,189,248,0.12);
      }
      .bs-map-frame {
        position: relative; border-radius: 20px; overflow: hidden; margin-top: 14px;
        transform: rotateX(6deg) scale(0.98);
        transform-style: preserve-3d;
        box-shadow:
          0 40px 80px rgba(0,0,0,0.5),
          0 0 0 1px rgba(255,255,255,0.08),
          0 0 60px rgba(56,189,248,0.08);
        transition: transform 0.45s cubic-bezier(0.22,1,0.36,1);
      }
      .bs-map-frame:hover { transform: rotateX(2deg) scale(1); }
      .bs-map-frame::after {
        content: ''; position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(180deg, rgba(56,189,248,0.08) 0%, transparent 30%, transparent 70%, rgba(225,29,72,0.06) 100%);
      }
      .bs-live-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 800;
        background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.35);
        color: #86efac; text-transform: uppercase; letter-spacing: 0.08em;
      }
      .bs-live-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #22c55e;
        animation: bs-live-dot 1.8s ease infinite;
      }
      .bs-progress-wrap {
        position: relative; width: 110px; height: 110px;
        filter: drop-shadow(0 0 18px rgba(34,197,94,0.35));
      }
      .bs-progress-orbit {
        position: absolute; inset: -8px; border-radius: 50%;
        border: 1px dashed rgba(56,189,248,0.25);
        animation: bs-orbit 12s linear infinite;
      }
      .bs-alert-banner {
        padding: 14px 16px; border-radius: 16px; font-size: 13px;
        border: 1px solid rgba(239,68,68,0.45);
        background: linear-gradient(135deg, rgba(239,68,68,0.18), rgba(127,29,29,0.12));
        color: #fecaca;
        animation: bs-alert-glow 2s ease infinite;
      }
      .bs-success-banner {
        padding: 14px 16px; border-radius: 16px; font-size: 13px;
        border: 1px solid rgba(34,197,94,0.4);
        background: linear-gradient(135deg, rgba(34,197,94,0.14), rgba(6,78,59,0.1));
        color: #bbf7d0;
      }
      .bs-timeline-item {
        padding: 12px 14px; border-radius: 14px; font-size: 13px;
        background: rgba(2,6,23,0.55);
        border: 1px solid rgba(255,255,255,0.08);
        animation: bs-slide-up 0.4s ease both;
        transition: transform 0.2s ease;
      }
      .bs-timeline-item:hover { transform: translateX(4px); }
      .bs-timeline-item.is-stall {
        border-color: rgba(239,68,68,0.5);
        background: linear-gradient(135deg, rgba(239,68,68,0.12), rgba(2,6,23,0.55));
      }

      /* ── Layout helpers ── */
      .bs-page-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 20px;
        align-items: flex-start;
      }
      .bs-header-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .bs-tab-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-bottom: 16px;
        width: 100%;
      }
      .bs-tab-row .bs-tab {
        width: 100%;
        text-align: center;
        min-height: 48px;
      }
      .bs-form-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
      }
      .bs-btn-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .bs-cockpit-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        align-items: center;
      }
      .bs-metric-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 12px;
        margin-top: 20px;
      }
      .bs-map-canvas {
        height: clamp(260px, 52vh, 420px);
        min-height: 260px;
      }
        .bs-check-row {
        display: flex;
        gap: 10px;
        align-items: center;
        min-height: 44px;
        font-size: 14px;
        -webkit-tap-highlight-color: transparent;
        cursor: pointer;
      }
      .bs-check-row input[type="checkbox"] {
        width: 20px;
        height: 20px;
        accent-color: #f97316;
      }
      .bs-settings-header {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .bs-sticky-cta {
        display: none;
      }
      button, .bs-tab, .bs-trip-row {
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
      }

      /* ── Mobile-first (priority) ── */
      @media (max-width: 768px) {
        .bs-page {
          padding:
            max(10px, env(safe-area-inset-top))
            max(12px, env(safe-area-inset-right))
            calc(96px + env(safe-area-inset-bottom))
            max(12px, env(safe-area-inset-left));
          perspective: none;
        }
        .bs-container { width: 100%; }
        .bs-card {
          padding: 16px;
          border-radius: 20px;
          margin-bottom: 14px;
        }
        .bs-hero-title { font-size: 1.65rem; line-height: 1.15; }
        .bs-page-header { margin-bottom: 14px; }
        .bs-header-actions {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .bs-header-actions .bs-btn-ghost {
          width: 100%;
          min-height: 44px;
          justify-content: center;
        }
        .bs-settings-header .bs-btn-ghost {
          min-width: 72px;
          min-height: 44px;
          padding: 10px 14px;
        }
        .bs-input, .bs-btn-primary, .bs-btn-ghost, .bs-btn-danger {
          font-size: 16px;
          min-height: 48px;
        }
        .bs-btn-row {
          display: grid;
          grid-template-columns: 1fr;
          width: 100%;
        }
        .bs-btn-row .bs-btn-primary,
        .bs-btn-row .bs-btn-ghost,
        .bs-btn-row .bs-btn-danger {
          width: 100%;
        }
        .bs-form-grid {
          grid-template-columns: 1fr;
        }
        .bs-metric-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 16px;
        }
        .bs-metric { padding: 12px 14px; }
        .bs-metric-value { font-size: 1.15rem; }
        .bs-metric:hover { transform: none; }
        .bs-trip-row {
          flex-direction: row;
          align-items: center;
          min-height: 56px;
          padding: 14px;
        }
        .bs-trip-row:hover { transform: none; }
        .bs-trip-row > div:last-child {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .bs-cockpit-header {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .bs-cockpit-header > div:first-child { width: 100%; }
        .bs-progress-wrap {
          width: 96px !important;
          height: 96px !important;
        }
        .bs-map-frame {
          transform: none;
          margin-top: 12px;
          border-radius: 16px;
        }
        .bs-map-frame:hover { transform: none; }
        .bs-map-canvas { height: clamp(240px, 48vh, 360px); }
        .bs-live-badge { font-size: 10px; padding: 6px 10px; }
        .bs-sticky-cta {
          display: block;
          position: fixed;
          left: max(12px, env(safe-area-inset-left));
          right: max(12px, env(safe-area-inset-right));
          bottom: calc(68px + env(safe-area-inset-bottom));
          z-index: 90;
          padding: 10px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(6,10,20,0.2), rgba(6,10,20,0.92) 30%);
          backdrop-filter: blur(12px);
        }
        .bs-sticky-cta .bs-btn-primary {
          width: 100%;
          min-height: 52px;
          font-size: 16px;
          box-shadow: 0 16px 40px rgba(225,29,72,0.45);
        }
        .bs-inline-cta { display: none; }
        .bs-alert-banner, .bs-success-banner {
          font-size: 14px;
          line-height: 1.45;
        }
        .bs-timeline-item:hover { transform: none; }
      }

      @media (max-width: 380px) {
        .bs-metric-grid { grid-template-columns: 1fr; }
        .bs-header-actions { grid-template-columns: 1fr; }
      }

      @media (pointer: coarse) {
        .bs-card:hover {
          box-shadow:
            0 24px 48px rgba(0,0,0,0.35),
            0 1px 0 rgba(255,255,255,0.06) inset;
        }
        .bs-tab:hover { transform: none; }
        .bs-btn-primary:hover:not(:disabled),
        .bs-btn-ghost:hover { transform: none; }
      }
    `}</style>
  );
}

function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return fine;
}

export function TiltCard({ children, className = '', style = {} }) {
  const ref = useRef(null);
  const [transform, setTransform] = useState('');
  const finePointer = useFinePointer();

  const onMove = useCallback((e) => {
    if (!finePointer) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTransform(`rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateZ(6px)`);
  }, [finePointer]);

  const onLeave = useCallback(() => setTransform(''), []);

  return (
    <div
      ref={ref}
      className={`bs-card bs-card-tilt ${className}`.trim()}
      style={{ ...style, transform: transform || undefined }}
      onMouseMove={finePointer ? onMove : undefined}
      onMouseLeave={finePointer ? onLeave : undefined}
    >
      {children}
    </div>
  );
}

export function ProgressRing3D({ pct = 0, size = 110, accent = '#22c55e', accent2 = '#38bdf8' }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c - (clamped / 100) * c;
  const gradId = `bs-ring-${Math.round(clamped)}`;

  return (
    <div className="bs-progress-wrap" style={{ width: size, height: size }}>
      <div className="bs-progress-orbit" />
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={accent} />
            <stop offset="100%" stopColor={accent2} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontWeight: 900, fontSize: 20, letterSpacing: '-0.03em',
        textShadow: '0 0 20px rgba(34,197,94,0.4)',
      }}
      >
        {Math.round(clamped)}%
      </div>
    </div>
  );
}

export function LiveBadge({ label = 'Live' }) {
  return (
    <span className="bs-live-badge">
      <span className="bs-live-dot" />
      {label}
    </span>
  );
}

export function MetricTile3D({ label, value, color = '#f8fafc', icon = null }) {
  return (
    <div className="bs-metric">
      {icon ? <div style={{ fontSize: 18, marginBottom: 4, opacity: 0.85 }}>{icon}</div> : null}
      <div className="bs-metric-label">{label}</div>
      <div className="bs-metric-value" style={{ color }}>{value}</div>
    </div>
  );
}

export function MapFrame3D({ children }) {
  return <div className="bs-map-frame">{children}</div>;
}

export function MobileStickyCTA({ visible, children }) {
  if (!visible) return null;
  return <div className="bs-sticky-cta">{children}</div>;
}

export function PageBackdrop() {
  return <div className="bs-grid-bg" aria-hidden="true" />;
}
