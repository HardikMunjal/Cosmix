import { useMemo, useState } from 'react';
import {
  TRAINING_CATEGORIES,
  ZONE_META,
  buildHrTrainingModel,
  fmtTrainingPace,
  persistTrainingCategory,
  trainingCategoryMeta,
} from './hrTraining';

function fmtDate(dateStr) {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function CategoryPicker({
  value,
  onChange,
  disabled,
  theme,
  compact = false,
  ariaLabel = 'Training category',
}) {
  const meta = trainingCategoryMeta(value);
  const bg = theme?.inputBg || theme?.cardBg || 'rgba(2,6,23,0.72)';
  const fg = theme?.textHeading || '#f8fafc';
  const border = meta?.color || theme?.cardBorder || 'rgba(148,163,184,0.28)';
  return (
    <select
      value={value || 'easy'}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      style={{
        flex: '1 1 132px',
        width: compact ? 132 : 'auto',
        minWidth: compact ? 118 : 132,
        maxWidth: '100%',
        padding: compact ? '8px 10px' : '10px 12px',
        borderRadius: 12,
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        colorScheme: 'dark',
      }}
    >
      {TRAINING_CATEGORIES.map((item) => (
        <option key={item.id} value={item.id} style={{ background: bg, color: fg }}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

function ZoneDonut({ zones = [] }) {
  const total = zones.reduce((sum, z) => sum + Number(z.percent || 0), 0) || 1;
  let acc = 0;
  const segs = zones.filter((z) => z.percent > 0).map((z) => {
    const start = acc;
    acc += (z.percent / total) * 100;
    return { ...z, start, end: acc };
  });
  const toCoord = (pct, r) => {
    const a = (pct / 100) * Math.PI * 2 - Math.PI / 2;
    return [50 + Math.cos(a) * r, 50 + Math.sin(a) * r];
  };
  const arc = (start, end) => {
    const large = end - start > 50 ? 1 : 0;
    const [sx, sy] = toCoord(start, 36);
    const [ex, ey] = toCoord(end, 36);
    return `M ${sx} ${sy} A 36 36 0 ${large} 1 ${ex} ${ey}`;
  };
  return (
    <svg viewBox="0 0 100 100" style={{ width: 112, height: 112, flexShrink: 0 }}>
      <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="12" />
      {segs.map((seg) => (
        <path
          key={seg.zone}
          d={arc(seg.start, Math.min(99.99, seg.end))}
          fill="none"
          stroke={seg.color}
          strokeWidth="12"
          strokeLinecap="butt"
        />
      ))}
      <text x="50" y="48" textAnchor="middle" fill="#f8fafc" fontSize="13" fontWeight="800">Zones</text>
      <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">all HR runs</text>
    </svg>
  );
}

function ZoneStackChart({ history = [], theme, onOpenRun }) {
  if (!history.length) {
    return <div style={{ color: theme.textMuted, fontSize: 12 }}>Need a few HR-zone runs to draw this.</div>;
  }
  const W = Math.max(280, history.length * 18);
  const H = 136;
  const pad = { t: 8, r: 6, b: 24, l: 6 };
  const slot = (W - pad.l - pad.r) / history.length;
  return (
    <div style={{ overflowX: 'auto', maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: 148, display: 'block' }}>
        {history.map((run, i) => {
          const x = pad.l + i * slot + slot * 0.18;
          const barW = slot * 0.64;
          let y = pad.t;
          const hAvail = H - pad.t - pad.b;
          return (
            <g
              key={`${run.date}-${i}`}
              style={{ cursor: run.stravaId ? 'pointer' : 'default' }}
              onClick={() => run.stravaId && onOpenRun?.(run.stravaId)}
            >
              {run.shares.map((share) => {
                const h = (Number(share.percent || 0) / 100) * hAvail;
                const rect = (
                  <rect
                    key={share.zone}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    rx="2"
                    fill={share.color}
                    opacity="0.92"
                  />
                );
                y += h;
                return rect;
              })}
              <rect
                x={x}
                y={H - 22}
                width={barW}
                height="4"
                rx="2"
                fill={run.categoryColor || theme.textMuted}
              />
              <text
                x={x + barW / 2}
                y={H - 8}
                textAnchor="middle"
                fill={theme.textMuted}
                fontSize="8"
              >
                {fmtDate(run.date).slice(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Spark({ points = [], color = '#fb7185', invert = false, valueFmt }) {
  if (points.length < 2) return null;
  const values = points.map((p) => Number(p.y || 0)).filter((n) => n > 0);
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const W = 280;
  const H = 86;
  const span = Math.max(0.2, max - min);
  const coords = points.map((p, i) => {
    const x = (i / Math.max(1, points.length - 1)) * W;
    const t = (Number(p.y) - min) / span;
    const y = invert ? 8 + t * (H - 16) : H - 8 - t * (H - 16);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 90 }}>
      <polyline fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" points={coords} />
      <text x="0" y={H - 2} fill="#64748b" fontSize="9">{fmtDate(points[0].date)}</text>
      <text x={W} y={H - 2} textAnchor="end" fill="#64748b" fontSize="9">
        {valueFmt ? valueFmt(points[points.length - 1].y) : fmtDate(points[points.length - 1].date)}
      </text>
    </svg>
  );
}

export function HrTrainingStudio({
  runRows,
  insights,
  overrides,
  userId,
  theme,
  onOpenRun,
  onOverridesChange,
  goalKicker = 'set next race goal',
}) {
  const [savingId, setSavingId] = useState(null);
  const model = useMemo(
    () => buildHrTrainingModel({ runRows, insights, overrides }),
    [runRows, insights, overrides],
  );
  const last = model.lastRun;

  async function setCategory(activityId, category) {
    if (!activityId || !category) return;
    onOverridesChange?.({ ...overrides, [String(activityId)]: category });
    setSavingId(activityId);
    await persistTrainingCategory(userId, activityId, category);
    setSavingId(null);
  }

  if (!model.runCount) {
    return (
      <div style={{
        padding: 18,
        borderRadius: 24,
        background: 'linear-gradient(160deg, #1c1917, #0f172a)',
        border: '1px solid rgba(251,113,133,0.25)',
        color: '#fda4af',
        fontSize: 13,
      }}
      >
        Sync Strava runs with heart rate to unlock zone training.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0, maxWidth: '100%' }}>
      <section style={{
        borderRadius: 24,
        padding: 14,
        background: 'radial-gradient(900px 280px at 10% -20%, rgba(251,113,133,0.22), transparent 50%), linear-gradient(165deg, #1c0b14 0%, #0b1220 55%, #042f2e 130%)',
        border: '1px solid rgba(251,113,133,0.28)',
        display: 'grid',
        gap: 12,
        minWidth: 0,
      }}
      >
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fda4af' }}>
            Pulse studio · {goalKicker}
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#fff7ed', marginTop: 4 }}>Heart training</div>
          <div style={{ fontSize: 12, color: '#fecdd3', marginTop: 4, lineHeight: 1.4 }}>
            Slow for you = easy. Change category with the dropdown, same as shoes.
          </div>
        </div>

        {last ? (
          <div style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            borderRadius: 16,
            background: 'rgba(2,6,23,0.42)',
            border: '1px solid rgba(255,255,255,0.08)',
            minWidth: 0,
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: '#fda4af', fontWeight: 800 }}>Last run · {fmtDate(last.date)}</div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last.name}</div>
                <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                  {last.distance?.toFixed?.(1) || last.distance} km
                  {last.avgHeartrate ? ` · ${last.avgHeartrate} bpm` : ''}
                  {last.paceMinPerKm ? ` · ${fmtTrainingPace(last.paceMinPerKm)} /km` : ''}
                </div>
              </div>
              {last.stravaId ? (
                <CategoryPicker
                  compact
                  theme={theme}
                  value={last.category}
                  disabled={savingId === last.stravaId}
                  onChange={(id) => setCategory(last.stravaId, id)}
                />
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {last.source === 'user' ? 'You set this.' : last.reason}
            </div>
          </div>
        ) : null}

        <div className="hr-pulse-zones" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <ZoneDonut zones={model.seasonZonePercents} />
          <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
            {model.seasonZonePercents.map((zone) => (
              <div key={zone.zone} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) 40px', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: zone.color }}>{zone.short}</span>
                <div style={{ height: 8, borderRadius: 999, background: 'rgba(148,163,184,0.18)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, zone.percent)}%`, height: '100%', background: zone.color }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#f8fafc', textAlign: 'right' }}>{zone.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{
        borderRadius: 24,
        padding: 16,
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))',
        border: '1px solid rgba(56,189,248,0.22)',
      }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dd3fc' }}>
          Time in each zone · past runs
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 10px' }}>
          Each bar is one run. The tick under the bar is its category. Tap a bar to open it.
        </div>
        <ZoneStackChart history={model.zoneHistory} theme={theme} onOpenRun={onOpenRun} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          {ZONE_META.map((z) => (
            <span key={z.zone} style={{ fontSize: 11, color: z.color, fontWeight: 800 }}>{z.short} {z.label}</span>
          ))}
        </div>
      </section>

      <section style={{
        borderRadius: 24,
        padding: 16,
        background: 'linear-gradient(160deg, rgba(6,78,59,0.35), rgba(15,23,42,0.96))',
        border: '1px solid rgba(74,222,128,0.25)',
        display: 'grid',
        gap: 10,
      }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#86efac' }}>
            Easy-run heart rate
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#f0fdf4', marginTop: 4 }}>
            {model.easyHrNow ? `${Math.round(model.easyHrNow)} bpm` : '--'}
            {model.easyHrDelta != null ? (
              <span style={{ fontSize: 14, marginLeft: 8, color: model.easyHrDelta < 0 ? '#86efac' : '#fdba74' }}>
                {model.easyHrDelta > 0 ? '+' : ''}{model.easyHrDelta} vs earlier easy runs
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 12, color: '#bbf7d0', marginTop: 4 }}>
            Only runs Cosmix tagged easy / recovery / long. Falling HR at the same easy effort is fitness.
          </div>
        </div>
        <Spark points={model.easyHrSeries} color="#4ade80" valueFmt={(v) => `${Math.round(v)} bpm`} />
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fdba74' }}>
          Your zone speeds
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.45 }}>
          Pace while your heart stays in that zone. If 5 km in Z1 used to take 60 min and now takes 50, Z1 speed has moved.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 148px), 1fr))', gap: 8, minWidth: 0 }}>
          {model.zoneSpeeds.map((zone) => (
            <div
              key={zone.zone}
              style={{
                padding: 12,
                borderRadius: 20,
                background: `${zone.color}14`,
                border: `1px solid ${zone.color}55`,
                display: 'grid',
                gap: 4,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: zone.color }}>{zone.short} · {zone.label}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: theme.textHeading }}>
                {fmtTrainingPace(zone.currentPace)} <span style={{ fontSize: 12, color: theme.textMuted }}>/km</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary }}>
                5 km ≈ {zone.fiveKmNow}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>
                {zone.previousPace
                  ? `Was ${fmtTrainingPace(zone.previousPace)} · ${zone.fiveKmThen}`
                  : `${zone.sampleCount} samples`}
                {zone.deltaSecPerKm != null ? ` · ${zone.deltaSecPerKm < 0 ? `${Math.abs(zone.deltaSecPerKm)}s faster` : `${zone.deltaSecPerKm}s slower`}` : ''}
              </div>
              <Spark points={zone.series} color={zone.color} invert />
            </div>
          ))}
        </div>
      </section>

      <section style={{
        borderRadius: 20,
        padding: 14,
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))',
        border: '1px solid rgba(192,132,252,0.22)',
        display: 'grid',
        gap: 8,
        minWidth: 0,
      }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#d8b4fe' }}>
            All past runs · {model.runCount}
          </div>
          <div style={{ fontSize: 12, color: '#c4b5fd', marginTop: 3 }}>
            Pick a category from the list — same control as shoes.
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {model.grouped.map((group) => (
            <span key={group.id} style={{ fontSize: 11, fontWeight: 800, color: group.color }}>
              {group.label} {group.count}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
          {model.runs.map((run) => (
            <div
              key={`${run.stravaId || run.date}-${run.name}`}
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: '8px 10px',
                borderRadius: 12,
                background: 'rgba(2,6,23,0.45)',
                border: `1px solid ${run.color}33`,
                minWidth: 0,
              }}
            >
              <button
                type="button"
                onClick={() => run.stravaId && onOpenRun?.(run.stravaId)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  color: theme.textHeading,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: run.stravaId ? 'pointer' : 'default',
                  padding: 0,
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fmtDate(run.date)} · {Number(run.distance || 0).toFixed(1)} km
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.paceMinPerKm ? `${fmtTrainingPace(run.paceMinPerKm)} /km` : ''}
                  {run.avgHeartrate ? ` · ${run.avgHeartrate} bpm` : ''}
                </div>
              </button>
              {run.stravaId ? (
                <CategoryPicker
                  compact
                  theme={theme}
                  value={run.category}
                  disabled={savingId === run.stravaId}
                  ariaLabel={`Category for ${fmtDate(run.date)}`}
                  onChange={(id) => setCategory(run.stravaId, id)}
                />
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
