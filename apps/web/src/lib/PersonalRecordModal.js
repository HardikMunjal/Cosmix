import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { markRecordsSeen } from './personalRecords';
import { fetchShareableRun, renderRunShareReel, shareOrDownloadRunReel } from './runShareReel';
import { wellnessApiUrl } from './runningShoes';

const KIND_ACCENT = {
  record: '#fbbf24',
  pace: '#22d3ee',
  split: '#a78bfa',
  comeback: '#34d399',
};

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
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewIsImage, setPreviewIsImage] = useState(false);

  const list = useMemo(() => (Array.isArray(records) ? records : []), [records]);
  const record = list[index] || null;
  const accent = KIND_ACCENT[record?.kind] || theme?.orange || '#f97316';
  const recordsKey = list.map((r) => r.id).join('|');

  useEffect(() => {
    if (!open) return undefined;
    setIndex(0);
    setShareMsg('');
    setPreviewUrl('');
    setPreviewIsImage(false);
    return undefined;
  }, [open, recordsKey]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!open || !record) return null;

  async function handleClose() {
    if (userId) markRecordsSeen(userId, list.map((r) => r.id));
    onClose?.();
  }

  async function handleShare() {
    if (!userId || sharing) return;
    setSharing(true);
    setShareMsg('Crafting your Cosmix reel…');
    try {
      const run = await fetchShareableRun(userId, record.activityId, wellnessApiUrl);
      if (!run?.polyline?.length) {
        setShareMsg('Map not ready yet — open the run once, then share.');
        return;
      }
      const reel = await renderRunShareReel({
        polyline: run.polyline,
        summary: run.summary,
        athleteName,
      });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(reel.url);
      setPreviewIsImage(Boolean(reel.isImage));
      setShareMsg(reel.isImage ? 'Poster ready — sharing…' : 'Video ready — opening share…');
      const result = await shareOrDownloadRunReel(reel, {
        title: record.title,
        text: `${record.title} · ${record.metricValue} on Cosmix`,
      });
      setShareMsg(result.method === 'share' ? 'Shared!' : 'Saved to your device — post to Instagram or WhatsApp.');
      onShared?.(reel);
    } catch (err) {
      setShareMsg(err?.message || 'Could not build share video.');
    } finally {
      setSharing(false);
    }
  }

  return (
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
        style={{
          width: 'min(440px, 100%)',
          borderRadius: 24,
          border: `1px solid ${accent}55`,
          background: `linear-gradient(165deg, ${accent}22 0%, ${theme?.cardBg || '#0f172a'} 42%)`,
          color: theme?.textHeading || '#f8fafc',
          padding: '18px 16px 20px',
          boxShadow: `0 24px 60px ${accent}33`,
          display: 'grid',
          gap: 14,
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={record.title}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{
              fontFamily: '"DM Mono", ui-monospace, monospace',
              fontSize: 11,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: accent,
              fontWeight: 800,
            }}
            >
              New personal record
              {list.length > 1 ? ` · ${index + 1}/${list.length}` : ''}
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
              {record.emoji} {record.title}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              border: `1px solid ${theme?.cardBorder || '#334155'}`,
              background: 'transparent',
              color: theme?.textHeading || '#fff',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: theme?.textSecondary || '#cbd5e1' }}>
          {record.body}
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: record.previousValue ? '1fr 1fr' : '1fr',
          gap: 10,
        }}
        >
          <div style={{
            padding: 14,
            borderRadius: 16,
            border: `1px solid ${accent}44`,
            background: 'rgba(2,6,23,0.45)',
          }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: theme?.textMuted || '#94a3b8' }}>
              {record.metricLabel}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: accent, marginTop: 6 }}>{record.metricValue}</div>
          </div>
          {record.previousValue ? (
            <div style={{
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

        {previewUrl ? (
          <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${theme?.cardBorder || '#334155'}` }}>
            {previewIsImage ? (
              <img src={previewUrl} alt="Share preview" style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover' }} />
            ) : (
              <video src={previewUrl} autoPlay muted loop playsInline style={{ width: '100%', display: 'block', maxHeight: 280, objectFit: 'cover', background: '#020617' }} />
            )}
          </div>
        ) : null}

        {shareMsg ? (
          <div style={{ fontSize: 12, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{shareMsg}</div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            disabled={sharing}
            onClick={handleShare}
            style={{
              border: 'none',
              borderRadius: 14,
              padding: '14px 12px',
              background: `linear-gradient(120deg, ${accent}, #f97316)`,
              color: '#0f172a',
              fontWeight: 900,
              fontSize: 13,
              cursor: sharing ? 'wait' : 'pointer',
              opacity: sharing ? 0.75 : 1,
            }}
          >
            {sharing ? 'Building…' : 'Share reel'}
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
  );
}

/** Standalone share control for last / current run. */
export function ShareRunButton({
  userId,
  activityId,
  athleteName = '',
  theme,
  label = 'Share to IG / WhatsApp',
  summary = null,
  polyline = null,
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleShare() {
    if (!userId || busy) return;
    setBusy(true);
    setMsg('Building Cosmix reel…');
    try {
      let poly = polyline;
      let sum = summary;
      if (!poly?.length || !sum) {
        const run = await fetchShareableRun(userId, activityId, wellnessApiUrl);
        if (!run?.polyline?.length) {
          setMsg('Map not ready — enrich this run first.');
          return;
        }
        poly = run.polyline;
        sum = run.summary;
      }
      const reel = await renderRunShareReel({
        polyline: poly,
        summary: sum,
        athleteName,
      });
      const result = await shareOrDownloadRunReel(reel, {
        title: 'My Cosmix run',
        text: `${Number(sum.distanceKm || 0).toFixed(1)} km · Cosmix run reel`,
      });
      setMsg(result.method === 'share' ? 'Shared!' : 'Downloaded — open Instagram or WhatsApp to post.');
    } catch (err) {
      setMsg(err?.message || 'Share failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <button
        type="button"
        onClick={handleShare}
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
        {busy ? 'Crafting reel…' : label}
      </button>
      {msg ? <div style={{ fontSize: 11, color: theme?.textMuted || '#94a3b8', fontWeight: 600 }}>{msg}</div> : null}
    </div>
  );
}
