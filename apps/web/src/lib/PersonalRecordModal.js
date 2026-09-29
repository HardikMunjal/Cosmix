import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { markRecordsSeen } from './personalRecords';
import { fetchShareableRun, renderRunShareReel, shareOrDownloadRunReel, yieldToUi, DEFAULT_SHARE_OPTIONS, normalizeShareOptions, SHARE_THEMES, MAP_STYLES, MAP_COLORS, SIZE_STEPS, friendlyShareError, drawRunShareFrame, loadRouteMapBackdrop, loadCosmixLogo, formatOverallClock } from './runShareReel';
import { wellnessApiUrl } from './runningShoes';

const KIND_ACCENT = {
  record: '#fbbf24',
  pace: '#22d3ee',
  split: '#a78bfa',
  comeback: '#34d399',
};

function ShareIcon({ size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="M8.2 13.1 15.8 17" />
      <path d="M15.8 7 8.2 10.9" />
    </svg>
  );
}

function PreparingOverlay({ open, label = 'Preparing your reel…' }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1600,
        background: 'rgba(2,6,23,0.55)',
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'all',
      }}
      role="status"
      aria-live="polite"
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 999,
          border: '1px solid rgba(148,163,184,0.28)',
          background: 'rgba(15,23,42,0.92)',
          padding: '10px 14px',
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            border: '2px solid rgba(148,163,184,0.35)',
            borderTopColor: '#67e8f9',
            display: 'block',
            animation: 'cosmix-share-spin 0.7s linear infinite',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>{label}</span>
      </div>
      <style>{`@keyframes cosmix-share-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function loadSavedShareOptions({ hasMap = true, splitCount = 0, hasAthlete = true } = {}) {
  if (typeof window === 'undefined') {
    return normalizeShareOptions({
      showMap: hasMap,
      showSplits: splitCount > 0,
      showAthlete: hasAthlete,
      showRunner: hasMap,
    });
  }
  let saved = {};
  try {
    const raw = window.localStorage.getItem('cosmixShareLayout.v2')
      || window.localStorage.getItem('cosmixShareLayout');
    saved = raw ? JSON.parse(raw) : {};
  } catch (_) {
    saved = {};
  }
  return normalizeShareOptions({
    ...saved,
    showHero: true,
    showStats: true,
    showMap: hasMap,
    showSplits: splitCount > 0,
    showRunner: hasMap,
    showPlace: saved.showPlace !== false,
    showTitle: saved.showTitle !== false,
    showLogo: saved.showLogo !== false,
    showAthlete: hasAthlete && saved.showAthlete !== false,
  });
}

function saveShareOptions(options) {
  try {
    const layout = normalizeShareOptions(options);
    delete layout.runName;
    delete layout.overallTime;
    window.localStorage.setItem('cosmixShareLayout.v2', JSON.stringify(layout));
  } catch (_) { /* ignore */ }
}

function studioPreview(summary = {}, athleteName = '') {
  const distance = Number(summary.distanceKm || summary.distance || 0);
  const minutes = Number(summary.minutes || 0);
  const pace = Number(summary.paceMinPerKm || (distance > 0 && minutes > 0 ? minutes / distance : 0));
  const paceText = pace > 0
    ? `${Math.floor(pace)}:${String(Math.round((pace - Math.floor(pace)) * 60)).padStart(2, '0')} /km`
    : '';
  const timeText = minutes > 0
    ? (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m` : `${Math.round(minutes)} min`)
    : '';
  return {
    name: summary.name,
    distanceKm: distance || undefined,
    place: summary.locationCity,
    athlete: athleteName,
    pace: paceText,
    minutes: timeText,
  };
}

function OptionChip({ on, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: 'none',
        border: on && !disabled ? '1px solid transparent' : '1px solid rgba(148,163,184,0.22)',
        background: on && !disabled
          ? 'linear-gradient(120deg, #f97316, #22d3ee)'
          : 'rgba(15,23,42,0.72)',
        color: disabled ? '#64748b' : on ? '#0f172a' : '#e2e8f0',
        borderRadius: 999,
        padding: '9px 13px',
        fontWeight: 800,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <span style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        background: on && !disabled ? '#0f172a' : 'transparent',
        border: on && !disabled ? 'none' : '1.5px solid rgba(148,163,184,0.45)',
        color: on && !disabled ? '#67e8f9' : 'transparent',
        fontSize: 10,
        fontWeight: 900,
        display: 'grid',
        placeItems: 'center',
        lineHeight: 1,
      }}
      >
        {on && !disabled ? '✓' : ''}
      </span>
      {label}
    </button>
  );
}

function ChoicePills({ value, items, disabled, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item) => {
        const on = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.id)}
            style={{
              appearance: 'none',
              border: on ? '1px solid transparent' : '1px solid rgba(148,163,184,0.22)',
              background: on ? 'linear-gradient(120deg, #f97316, #22d3ee)' : 'rgba(15,23,42,0.72)',
              color: on ? '#0f172a' : '#e2e8f0',
              borderRadius: 999,
              padding: '8px 11px',
              fontWeight: 800,
              fontSize: 11,
              cursor: disabled ? 'wait' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {item.swatch ? (
              <span style={{ width: 10, height: 10, borderRadius: 999, background: item.swatch, boxShadow: '0 0 0 1px rgba(255,255,255,0.25)' }} />
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function LiveSharePreview({
  open,
  options,
  summary = {},
  polyline = [],
  splits = [],
  athleteName = '',
}) {
  const canvasRef = useRef(null);
  const [logoImage, setLogoImage] = useState(null);
  const [mapCanvas, setMapCanvas] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    loadCosmixLogo().then((img) => {
      if (!cancelled) setLogoImage(img);
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !options.showMap || !(polyline?.length >= 2)) {
      setMapCanvas(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      loadRouteMapBackdrop(polyline, 280, 500, 24, {
        style: options.mapStyle,
        color: options.mapColor,
      }).then((canvas) => {
        if (!cancelled) setMapCanvas(canvas);
      }).catch(() => {
        if (!cancelled) setMapCanvas(null);
      });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, options.showMap, options.mapStyle, options.mapColor, polyline]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const opt = normalizeShareOptions(options);
    drawRunShareFrame(ctx, {
      width: canvas.width,
      height: canvas.height,
      polyline,
      summary,
      splits,
      progress: opt.format === 'photo' ? 1 : 0.7,
      athleteName,
      logoImage,
      mapCanvas: opt.showMap ? mapCanvas : null,
      mode: opt.format,
      clockMs: 1600,
      options: opt,
    });
  }, [open, options, summary, polyline, splits, athleteName, logoImage, mapCanvas]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          borderRadius: 30,
          padding: 8,
          background: 'linear-gradient(160deg, rgba(226,232,240,0.28), rgba(15,23,42,0.95))',
          boxShadow: '0 24px 50px rgba(0,0,0,0.4)',
        }}
      >
        <canvas
          ref={canvasRef}
          width={270}
          height={480}
          style={{
            width: 168,
            height: 298,
            display: 'block',
            borderRadius: 22,
            background: '#020617',
          }}
        />
      </div>
    </div>
  );
}

function ShareStudio({
  open,
  theme,
  onClose,
  onCreate,
  splitCount = 0,
  hasMap = true,
  hasAthlete = true,
  preview = {},
  building = false,
  progressLabel = '',
  error = '',
  summary = {},
  polyline = [],
  splits = [],
  athleteName = '',
}) {
  const [options, setOptions] = useState(DEFAULT_SHARE_OPTIONS);

  useEffect(() => {
    if (!open) return;
    const saved = loadSavedShareOptions({ hasMap, splitCount, hasAthlete });
    setOptions(normalizeShareOptions({
      ...saved,
      runName: String(summary.name || '').trim() || 'Morning Run',
      overallTime: formatOverallClock(summary.minutes),
    }));
  }, [open, hasMap, splitCount, hasAthlete, summary.name, summary.minutes]);

  if (!open) return null;

  function patch(partial) {
    if (building) return;
    setOptions((current) => normalizeShareOptions({ ...current, ...partial }));
  }

  function handleCreate() {
    if (building) return;
    const next = normalizeShareOptions({
      ...options,
      showMap: options.showMap && hasMap,
      showSplits: options.showSplits && splitCount > 0,
      showAthlete: options.showAthlete && hasAthlete,
      showRunner: options.showRunner && options.showMap && hasMap,
    });
    saveShareOptions(next);
    onCreate?.(next);
  }

  const chips = [
    {
      key: 'showStats',
      label: 'Stats',
      on: options.showStats && options.showHero,
      onClick: () => {
        const nextOn = !(options.showStats && options.showHero);
        patch({ showStats: nextOn, showHero: nextOn });
      },
    },
    { key: 'showMap', label: 'Map', on: options.showMap, disabled: !hasMap },
    { key: 'showSplits', label: 'Splits', on: options.showSplits, disabled: !splitCount },
    { key: 'showRunner', label: 'Runner', on: options.showRunner, disabled: !hasMap || !options.showMap },
    { key: 'showPlace', label: 'Place', on: options.showPlace },
    { key: 'showAthlete', label: 'Name', on: options.showAthlete, disabled: !hasAthlete },
    { key: 'showTitle', label: 'Title', on: options.showTitle },
    { key: 'showLogo', label: 'Logo', on: options.showLogo },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1550,
        background: 'rgba(2,6,23,0.82)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Customize share"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(460px, 100%)',
          maxHeight: '94vh',
          overflow: 'auto',
          borderRadius: 28,
          border: `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.28)'}`,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,8,20,0.98))',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          padding: 16,
          display: 'grid',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#67e8f9' }}>
              Cosmix studio
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#f8fafc', marginTop: 4 }}>Share this run</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: theme?.textMuted || '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
              Stats and map are on. Tap anything you don’t want, then create.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              appearance: 'none',
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(15,23,42,0.7)',
              color: '#e2e8f0',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <LiveSharePreview
          open={open}
          options={options}
          summary={summary}
          polyline={polyline}
          splits={splits}
          athleteName={athleteName || preview.athlete || ''}
        />
        <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#67e8f9', marginTop: -4 }}>
          Preview updates as you tap
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            padding: 4,
            borderRadius: 16,
            background: 'rgba(2,6,23,0.65)',
            border: '1px solid rgba(148,163,184,0.18)',
          }}
        >
          {['photo', 'video'].map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => patch({ format: id })}
              disabled={building}
              style={{
                appearance: 'none',
                border: 'none',
                borderRadius: 12,
                padding: '11px 8px',
                fontWeight: 900,
                fontSize: 13,
                cursor: building ? 'wait' : 'pointer',
                background: options.format === id ? 'linear-gradient(120deg, #f97316, #22d3ee)' : 'transparent',
                color: options.format === id ? '#0f172a' : '#e2e8f0',
              }}
            >
              {id === 'photo' ? 'Photo' : 'Video'}
            </button>
          ))}
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Look
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {SHARE_THEMES.map((item) => {
              const on = options.theme === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => patch({ theme: item.id })}
                  disabled={building}
                  style={{
                    appearance: 'none',
                    border: on ? '1px solid rgba(125,211,252,0.7)' : '1px solid rgba(148,163,184,0.18)',
                    borderRadius: 16,
                    padding: 8,
                    cursor: building ? 'wait' : 'pointer',
                    background: `linear-gradient(180deg, ${item.from}, ${item.to})`,
                    color: '#f8fafc',
                    textAlign: 'left',
                    boxShadow: on ? '0 0 0 2px rgba(34,211,238,0.28)' : 'none',
                    opacity: building ? 0.7 : 1,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 900 }}>{item.label}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#cbd5e1', marginTop: 2 }}>{item.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 8 }}>
            Include
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {chips.map((chip) => (
              <OptionChip
                key={chip.key}
                on={chip.on}
                label={chip.label}
                disabled={building || chip.disabled}
                onClick={chip.onClick || (() => patch({ [chip.key]: !options[chip.key] }))}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Run name</span>
            <input
              type="text"
              value={options.runName || ''}
              maxLength={52}
              disabled={building}
              placeholder="Wipro Marathon 2026"
              onChange={(event) => patch({ runName: event.target.value })}
              style={{
                appearance: 'none',
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(2,6,23,0.72)',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: 14,
                padding: '11px 12px',
              }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>Overall time</span>
            <input
              type="text"
              inputMode="decimal"
              value={options.overallTime || ''}
              disabled={building}
              placeholder="3:45:12"
              onChange={(event) => patch({ overallTime: event.target.value })}
              style={{
                appearance: 'none',
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.28)',
                background: 'rgba(2,6,23,0.72)',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: 14,
                padding: '11px 12px',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>Use h:mm:ss or mm:ss. Pace updates in the preview.</span>
          </label>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#67e8f9', marginBottom: 8 }}>
            Advanced
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Map style</div>
              <ChoicePills
                value={options.mapStyle}
                items={MAP_STYLES}
                disabled={building || !hasMap || !options.showMap}
                onChange={(id) => patch({ mapStyle: id })}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Map color</div>
              <ChoicePills
                value={options.mapColor}
                items={MAP_COLORS}
                disabled={building || !hasMap || !options.showMap}
                onChange={(id) => patch({ mapColor: id })}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Logo size</div>
              <ChoicePills
                value={options.logoSize}
                items={SIZE_STEPS}
                disabled={building || !options.showLogo}
                onChange={(id) => patch({ logoSize: id })}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Text size</div>
              <ChoicePills
                value={options.textSize}
                items={SIZE_STEPS}
                disabled={building}
                onChange={(id) => patch({ textSize: id })}
              />
            </div>
          </div>
        </div>

        {error ? (
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fda4af', background: 'rgba(127,29,29,0.35)', border: '1px solid rgba(252,165,165,0.28)', borderRadius: 12, padding: '10px 12px' }}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleCreate}
          disabled={building}
          style={{
            appearance: 'none',
            border: 'none',
            borderRadius: 16,
            padding: '14px 12px',
            background: 'linear-gradient(120deg, #f97316, #22d3ee)',
            color: '#0f172a',
            fontWeight: 900,
            fontSize: 14,
            cursor: building ? 'wait' : 'pointer',
            opacity: building ? 0.85 : 1,
            boxShadow: '0 12px 28px rgba(249,115,22,0.28)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {building ? (
            <>
              <span style={{ width: 12, height: 12, borderRadius: 999, border: '2px solid rgba(15,23,42,0.28)', borderTopColor: '#0f172a', display: 'block', animation: 'cosmix-share-spin 0.7s linear infinite' }} />
              {progressLabel || 'Creating…'}
            </>
          ) : (
            `Create ${options.format === 'photo' ? 'photo' : 'video'}`
          )}
        </button>
        <style>{`@keyframes cosmix-share-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

export function RunSharePreviewModal({
  open,
  reel,
  theme,
  title = 'Preview',
  shareTitle = 'My Cosmix run',
  shareText = 'Check out my run on Cosmix',
  onClose,
  onShared,
}) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!open) {
      setSending(false);
      setMsg('');
    }
  }, [open]);

  if (!open || !reel?.url) return null;

  async function handleConfirmShare({ forceImage = false } = {}) {
    if (sending) return;
    setSending(true);
    setMsg(forceImage ? 'Opening share…' : 'Converting video for WhatsApp…');
    try {
      const result = await shareOrDownloadRunReel(reel, {
        title: shareTitle,
        text: shareText,
        forceImage,
        preferPosterForShare: forceImage,
        onProgress: (label) => setMsg(String(label || '')),
      });
      if (result.method === 'cancelled') {
        setMsg('');
        return;
      }
      if (result.method === 'share') {
        setMsg(result.sharedAs === 'video' ? 'Shared as video' : 'Shared as photo');
      } else {
        setMsg(result.sharedAs === 'video'
          ? 'Saved MP4 — open WhatsApp and attach the file'
          : 'Saved photo — open WhatsApp or Instagram to post');
      }
      onShared?.(result);
      if (result.method === 'share') {
        setTimeout(() => onClose?.(), 500);
      }
    } catch (err) {
      setMsg(friendlyShareError(err) || 'Share failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'rgba(2,6,23,0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Run share preview"
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(420px, 100%)',
          maxHeight: 'min(92vh, 760px)',
          overflow: 'auto',
          borderRadius: 22,
          border: `1px solid ${theme?.cardBorder || 'rgba(148,163,184,0.28)'}`,
          background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          padding: 14,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme?.textMuted || '#94a3b8' }}>
              {reel.isImage ? 'Run photo' : 'Run video'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc', marginTop: 2 }}>{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            style={{
              appearance: 'none',
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'rgba(15,23,42,0.7)',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(148,163,184,0.22)', background: '#020617' }}>
          {reel.isImage ? (
            <img src={reel.url} alt="Share preview" style={{ width: '100%', display: 'block', maxHeight: '58vh', objectFit: 'contain' }} />
          ) : (
            <video
              key={reel.url}
              src={reel.url}
              autoPlay
              muted
              loop
              playsInline
              controls
              style={{ width: '100%', display: 'block', maxHeight: '58vh', objectFit: 'contain', background: '#020617' }}
            />
          )}
        </div>

        {msg ? <div style={{ fontSize: 12, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{msg}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              appearance: 'none',
              borderRadius: 14,
              padding: '13px 10px',
              border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent',
              color: '#e2e8f0',
              fontWeight: 800,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => handleConfirmShare({ forceImage: Boolean(reel.isImage) })}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: 14,
              padding: '13px 10px',
              background: 'linear-gradient(120deg, #f97316, #22d3ee)',
              color: '#0f172a',
              fontWeight: 900,
              fontSize: 12,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.8 : 1,
            }}
          >
            {sending ? (reel.isImage ? 'Opening…' : 'Converting…') : (reel.isImage ? 'Share photo' : 'Share video')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PersonalRecordModal({
  open,
  records = [],
  userId,
  athleteName = '',
  theme,
  onClose,
  onShared,
}) {
  const [index, setIndex] = useState(0);
  const [building, setBuilding] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [reel, setReel] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState(null);

  const list = useMemo(() => (Array.isArray(records) ? records : []), [records]);
  const record = list[index] || null;
  const accent = KIND_ACCENT[record?.kind] || theme?.orange || '#f97316';
  const recordsKey = list.map((r) => r.id).join('|');

  useEffect(() => {
    if (!open) return undefined;
    setIndex(0);
    setShareMsg('');
    setPreviewOpen(false);
    setChooserOpen(false);
    setReel((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      if (current?.poster?.url) URL.revokeObjectURL(current.poster.url);
      return null;
    });
    return undefined;
  }, [open, recordsKey]);

  useEffect(() => () => {
    if (reel?.url) URL.revokeObjectURL(reel.url);
    if (reel?.poster?.url) URL.revokeObjectURL(reel.poster.url);
  }, [reel]);

  useEffect(() => {
    if (!chooserOpen || !userId || !record?.activityId) return undefined;
    let cancelled = false;
    fetchShareableRun(userId, record.activityId, wellnessApiUrl).then((run) => {
      if (!cancelled) setShareDraft(run);
    }).catch(() => {
      if (!cancelled) setShareDraft(null);
    });
    return () => { cancelled = true; };
  }, [chooserOpen, userId, record?.activityId]);

  if (!open || !record) return null;

  async function handleClose() {
    if (userId) markRecordsSeen(userId, list.map((r) => r.id));
    onClose?.();
  }

  async function handleBuildPreview(shareOptions = DEFAULT_SHARE_OPTIONS) {
    if (!userId || building) return;
    const opt = normalizeShareOptions(shareOptions);
    setBuilding(true);
    setShareMsg('Preparing your share…');
    await yieldToUi();
    try {
      const run = shareDraft?.summary
        ? shareDraft
        : await fetchShareableRun(userId, record.activityId, wellnessApiUrl);
      if (!run?.summary) {
        setShareMsg('Run stats not ready yet.');
        return;
      }
      if (opt.showMap && !(run.polyline || []).length) {
        opt.showMap = false;
      }
      await yieldToUi();
      const next = await renderRunShareReel({
        polyline: run.polyline,
        summary: run.summary,
        splits: run.splits || [],
        athleteName,
        mode: opt.format,
        options: opt,
        onProgress: (label) => setShareMsg(String(label || '')),
      });
      setReel((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        if (current?.poster?.url) URL.revokeObjectURL(current.poster.url);
        return next;
      });
      setChooserOpen(false);
      setPreviewOpen(true);
      setShareMsg('');
    } catch (err) {
      setShareMsg(friendlyShareError(err) || 'Could not build share.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <>
      <PreparingOverlay open={building && !chooserOpen} label={shareMsg || 'Preparing your share…'} />
      <ShareStudio
        open={chooserOpen && !previewOpen}
        theme={theme}
        onClose={() => { if (!building) setChooserOpen(false); }}
        onCreate={handleBuildPreview}
        splitCount={(shareDraft?.splits || []).length}
        hasMap={(shareDraft?.polyline || []).length >= 2}
        hasAthlete={Boolean(athleteName)}
        preview={studioPreview(shareDraft?.summary, athleteName)}
        building={building}
        progressLabel={shareMsg}
        error={!building ? shareMsg : ''}
        summary={shareDraft?.summary || {}}
        polyline={shareDraft?.polyline || []}
        splits={shareDraft?.splits || []}
        athleteName={athleteName}
      />
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1400,
          background: 'rgba(2,6,23,0.82)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          padding: 12,
        }}
        onClick={handleClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-label="Personal record"
          onClick={(event) => event.stopPropagation()}
          style={{
            width: 'min(440px, 100%)',
            borderRadius: 22,
            border: `1px solid ${theme?.cardBorder || '#334155'}`,
            background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))',
            boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
            padding: 16,
            display: 'grid',
            gap: 12,
            color: theme?.text || '#e2e8f0',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>
                {record.kind === 'record' ? 'Distance PR' : record.kind || 'Highlight'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', marginTop: 4 }}>{record.title}</div>
              {record.description ? (
                <div style={{ fontSize: 13, color: theme?.textMuted || '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
                  {record.description}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              style={{
                appearance: 'none',
                width: 34,
                height: 34,
                borderRadius: 999,
                border: '1px solid rgba(148,163,184,0.3)',
                background: 'rgba(15,23,42,0.7)',
                color: '#e2e8f0',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: record.previousValue ? '1fr 1fr' : '1fr', gap: 8 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 16,
                border: `1px solid ${theme?.cardBorder || '#334155'}`,
                background: 'rgba(2,6,23,0.35)',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme?.textMuted || '#94a3b8' }}>
                Now
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: theme?.textHeading || '#fff', marginTop: 8 }}>
                {record.metricValue}
              </div>
            </div>
            {record.previousValue ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: `1px solid ${theme?.cardBorder || '#334155'}`,
                  background: 'rgba(2,6,23,0.35)',
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme?.textMuted || '#94a3b8' }}>
                  Was
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: theme?.textHeading || '#fff', marginTop: 8 }}>
                  {record.previousValue}
                </div>
              </div>
            ) : null}
          </div>

          {shareMsg ? (
            <div style={{ fontSize: 12, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{shareMsg}</div>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              disabled={building}
              onClick={() => { setShareMsg(''); setChooserOpen(true); }}
              style={{
                border: 'none',
                borderRadius: 14,
                padding: '14px 12px',
                background: `linear-gradient(120deg, ${accent}, #f97316)`,
                color: '#0f172a',
                fontWeight: 900,
                fontSize: 13,
                cursor: building ? 'wait' : 'pointer',
                opacity: building ? 0.75 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <ShareIcon size={14} />
              {building ? 'Building…' : 'Preview & share'}
            </button>
            {record.activityId ? (
              <Link
                href={`/running/${encodeURIComponent(record.activityId)}`}
                onClick={handleClose}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  borderRadius: 14,
                  padding: '14px 12px',
                  border: `1px solid ${theme?.cardBorder || '#334155'}`,
                  color: theme?.textHeading || '#fff',
                  fontWeight: 800,
                  fontSize: 13,
                  textDecoration: 'none',
                }}
              >
                View run
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                style={{
                  borderRadius: 14,
                  padding: '14px 12px',
                  border: `1px solid ${theme?.cardBorder || '#334155'}`,
                  background: 'transparent',
                  color: theme?.textHeading || '#fff',
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Nice!
              </button>
            )}
          </div>

          {list.length > 1 ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
              {list.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Record ${i + 1}`}
                  onClick={() => setIndex(i)}
                  style={{
                    width: i === index ? 18 : 8,
                    height: 8,
                    borderRadius: 999,
                    border: 'none',
                    background: i === index ? accent : 'rgba(148,163,184,0.45)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <RunSharePreviewModal
        open={previewOpen}
        reel={reel}
        theme={theme}
        title={record.title}
        shareTitle={record.title}
        shareText={`${record.title} · ${record.metricValue} on Cosmix`}
        onClose={() => setPreviewOpen(false)}
        onShared={(result) => onShared?.(result)}
      />
    </>
  );
}

/** Standalone share control for last / current run. */
export function ShareRunButton({
  userId,
  activityId,
  athleteName = '',
  theme,
  label = 'Share',
  summary = null,
  polyline = null,
  compact = true,
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [reel, setReel] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [shareDraft, setShareDraft] = useState(null);
  const [shareMeta, setShareMeta] = useState({ title: 'My Cosmix run', text: 'Check out my run on Cosmix' });

  useEffect(() => () => {
    if (reel?.url) URL.revokeObjectURL(reel.url);
    if (reel?.poster?.url) URL.revokeObjectURL(reel.poster.url);
  }, [reel]);

  useEffect(() => {
    if (!chooserOpen || !userId) return undefined;
    let cancelled = false;
    fetchShareableRun(userId, activityId, wellnessApiUrl).then((run) => {
      if (!cancelled) setShareDraft(run);
    }).catch(() => {
      if (!cancelled) setShareDraft(null);
    });
    return () => { cancelled = true; };
  }, [chooserOpen, userId, activityId]);

  async function handleBuildPreview(shareOptions = DEFAULT_SHARE_OPTIONS) {
    if (!userId || busy) return;
    const opt = normalizeShareOptions(shareOptions);
    setBusy(true);
    setMsg('Preparing your share…');
    await yieldToUi();
    try {
      let poly = polyline || shareDraft?.polyline || [];
      let sum = summary || shareDraft?.summary;
      let splitRows = shareDraft?.splits || [];
      if (!sum || (opt.showMap && !(poly?.length >= 2)) || (opt.showSplits && !splitRows.length)) {
        const run = shareDraft?.summary
          ? shareDraft
          : await fetchShareableRun(userId, activityId, wellnessApiUrl);
        if (run?.summary) {
          poly = poly?.length ? poly : (run.polyline || []);
          sum = sum || run.summary;
          splitRows = run.splits?.length ? run.splits : splitRows;
        }
      }
      if (!sum) {
        setMsg('Run stats not ready yet.');
        return;
      }
      if (opt.showMap && !(poly?.length >= 2)) {
        opt.showMap = false;
      }
      await yieldToUi();
      const next = await renderRunShareReel({
        polyline: poly,
        summary: sum,
        splits: splitRows,
        athleteName,
        mode: opt.format,
        options: opt,
        onProgress: (label) => setMsg(String(label || '')),
      });
      setShareMeta({
        title: 'My Cosmix run',
        text: `${Number(sum.distanceKm || 0).toFixed(1)} km · Cosmix run`,
      });
      setReel((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        if (current?.poster?.url) URL.revokeObjectURL(current.poster.url);
        return next;
      });
      setChooserOpen(false);
      setPreviewOpen(true);
      setMsg('');
    } catch (err) {
      setMsg(friendlyShareError(err) || 'Could not build share.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PreparingOverlay open={busy && !chooserOpen} label={msg || 'Preparing your share…'} />
      <ShareStudio
        open={chooserOpen && !previewOpen}
        theme={theme}
        onClose={() => { if (!busy) setChooserOpen(false); }}
        onCreate={handleBuildPreview}
        splitCount={(shareDraft?.splits || []).length}
        hasMap={(polyline || shareDraft?.polyline || []).length >= 2}
        hasAthlete={Boolean(athleteName)}
        preview={studioPreview(summary || shareDraft?.summary, athleteName)}
        building={busy}
        progressLabel={msg}
        error={!busy ? msg : ''}
        summary={summary || shareDraft?.summary || {}}
        polyline={polyline || shareDraft?.polyline || []}
        splits={shareDraft?.splits || []}
        athleteName={athleteName}
      />
      {compact ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => { setMsg(''); setChooserOpen(true); }}
            disabled={busy}
            title={label}
            aria-label={busy ? 'Building preview…' : 'Preview and share run'}
            style={{
              appearance: 'none',
              width: 36,
              height: 36,
              borderRadius: 999,
              border: '1px solid rgba(148,163,184,0.35)',
              background: busy
                ? 'rgba(15,23,42,0.7)'
                : 'linear-gradient(145deg, rgba(249,115,22,0.95), rgba(34,211,238,0.88))',
              color: '#0f172a',
              display: 'inline-grid',
              placeItems: 'center',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.75 : 1,
              padding: 0,
              boxShadow: '0 6px 16px rgba(2,6,23,0.28)',
            }}
          >
            {busy ? (
              <span style={{ width: 12, height: 12, borderRadius: 999, border: '2px solid rgba(15,23,42,0.35)', borderTopColor: '#0f172a', display: 'block', animation: 'cosmix-share-spin 0.7s linear infinite' }} />
            ) : (
              <ShareIcon size={16} />
            )}
          </button>
          {msg ? <span style={{ fontSize: 11, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{msg}</span> : null}
          <style>{`@keyframes cosmix-share-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <button
            type="button"
            onClick={() => { setMsg(''); setChooserOpen(true); }}
            disabled={busy}
            style={{
              appearance: 'none',
              border: 'none',
              borderRadius: 14,
              padding: '12px 14px',
              background: 'linear-gradient(120deg, #f97316, #22d3ee)',
              color: '#0f172a',
              fontWeight: 900,
              fontSize: 13,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.8 : 1,
              boxShadow: '0 10px 28px rgba(249,115,22,0.28)',
            }}
          >
            {busy ? 'Building preview…' : label}
          </button>
          {msg ? <div style={{ fontSize: 11, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{msg}</div> : null}
        </div>
      )}

      <RunSharePreviewModal
        open={previewOpen}
        reel={reel}
        theme={theme}
        title={reel?.isImage ? 'Run photo' : 'Your run video'}
        shareTitle={shareMeta.title}
        shareText={shareMeta.text}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
