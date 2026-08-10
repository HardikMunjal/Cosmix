import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { markRecordsSeen } from './personalRecords';
import { fetchShareableRun, renderRunShareReel, shareOrDownloadRunReel, yieldToUi } from './runShareReel';
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

/** Preview the quick reel, then share when the user confirms. */
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
    setMsg('');
    try {
      const result = await shareOrDownloadRunReel(reel, {
        title: shareTitle,
        text: shareText,
        forceImage,
        preferPosterForShare: forceImage,
      });
      if (result.method === 'cancelled') {
        setMsg('');
        return;
      }
      if (result.method === 'share') {
        setMsg(result.sharedAs === 'video' ? 'Shared as video' : 'Shared as photo');
      } else {
        setMsg(result.sharedAs === 'video'
          ? 'Saved video — open WhatsApp or Instagram to post'
          : 'Saved photo — open WhatsApp or Instagram to post');
      }
      onShared?.(result);
      if (result.method === 'share') {
        setTimeout(() => onClose?.(), 500);
      }
    } catch (err) {
      setMsg(err?.message || 'Share failed');
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
              Run reel
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

        <div style={{ display: 'grid', gridTemplateColumns: reel.isImage ? '1fr 1.2fr' : '1fr 1fr 1fr', gap: 8 }}>
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
          {!reel.isImage ? (
            <button
              type="button"
              disabled={sending}
              onClick={() => handleConfirmShare({ forceImage: false })}
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
              {sending ? 'Opening…' : 'Share video'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={sending}
            onClick={() => handleConfirmShare({ forceImage: true })}
            style={{
              appearance: 'none',
              border: reel.isImage ? 'none' : '1px solid rgba(148,163,184,0.3)',
              borderRadius: 14,
              padding: '13px 10px',
              background: reel.isImage ? 'linear-gradient(120deg, #f97316, #22d3ee)' : 'rgba(15,23,42,0.7)',
              color: reel.isImage ? '#0f172a' : '#e2e8f0',
              fontWeight: 900,
              fontSize: 12,
              cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.8 : 1,
            }}
          >
            {sending ? 'Opening…' : (reel.isImage ? 'Share' : 'Share photo')}
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

  const list = useMemo(() => (Array.isArray(records) ? records : []), [records]);
  const record = list[index] || null;
  const accent = KIND_ACCENT[record?.kind] || theme?.orange || '#f97316';
  const recordsKey = list.map((r) => r.id).join('|');

  useEffect(() => {
    if (!open) return undefined;
    setIndex(0);
    setShareMsg('');
    setPreviewOpen(false);
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

  if (!open || !record) return null;

  async function handleClose() {
    if (userId) markRecordsSeen(userId, list.map((r) => r.id));
    onClose?.();
  }

  async function handleBuildPreview() {
    if (!userId || building) return;
    setBuilding(true);
    setShareMsg('');
    await yieldToUi();
    try {
      const run = await fetchShareableRun(userId, record.activityId, wellnessApiUrl);
      if (!run?.polyline?.length) {
        setShareMsg('Map not ready yet — open the run once, then share.');
        return;
      }
      await yieldToUi();
      const next = await renderRunShareReel({
        polyline: run.polyline,
        summary: run.summary,
        athleteName,
      });
      setReel((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        if (current?.poster?.url) URL.revokeObjectURL(current.poster.url);
        return next;
      });
      setPreviewOpen(true);
      setShareMsg('');
    } catch (err) {
      setShareMsg(err?.message || 'Could not build share video.');
    } finally {
      setBuilding(false);
    }
  }

  return (
    <>
      <PreparingOverlay open={building} label="Preparing your reel…" />
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
              onClick={handleBuildPreview}
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
  const [shareMeta, setShareMeta] = useState({ title: 'My Cosmix run', text: 'Check out my run on Cosmix' });

  useEffect(() => () => {
    if (reel?.url) URL.revokeObjectURL(reel.url);
    if (reel?.poster?.url) URL.revokeObjectURL(reel.poster.url);
  }, [reel]);

  async function handleBuildPreview() {
    if (!userId || busy) return;
    setBusy(true);
    setMsg('');
    await yieldToUi();
    try {
      let poly = polyline;
      let sum = summary;
      if (!poly?.length || !sum) {
        const run = await fetchShareableRun(userId, activityId, wellnessApiUrl);
        if (!run?.polyline?.length) {
          setMsg('Map not ready — open this run once, then share.');
          return;
        }
        poly = run.polyline;
        sum = run.summary;
      }
      await yieldToUi();
      const next = await renderRunShareReel({
        polyline: poly,
        summary: sum,
        athleteName,
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
      setPreviewOpen(true);
    } catch (err) {
      setMsg(err?.message || 'Share failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PreparingOverlay open={busy} label="Preparing your reel…" />
      {compact ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={handleBuildPreview}
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
            onClick={handleBuildPreview}
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
        title="Your run reel"
        shareTitle={shareMeta.title}
        shareText={shareMeta.text}
        onClose={() => setPreviewOpen(false)}
      />
    </>
  );
}
