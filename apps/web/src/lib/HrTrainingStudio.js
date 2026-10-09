import { useMemo, useState } from 'react';
import {
  TRAINING_CATEGORIES,
  ZONE_META,
  buildHrTrainingModel,
  fmtTrainingPace,
  fmtTrainingSpeed,
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
      <text x="50" y="62" textAnchor="middle" fill="#94a3b8" fontSize="8" fontWeight="700">this goal</text>
    </svg>
  );
}

function ZoneStackChart({ history = [], theme, onOpenRun }) {
  const rows = (history || []).slice(-18);
  if (!rows.length) {
    return <div style={{ color: theme.textMuted, fontSize: 12 }}>Need a few HR-zone runs to draw this.</div>;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 3, minWidth: 0, width: '100%' }}>
      {rows.map((run, i) => (
        <button
          key={`${run.date}-${run.stravaId || i}`}
          type="button"
          onClick={() => run.stravaId && onOpenRun?.(run.stravaId)}
          title={`${fmtDate(run.date)} · ${run.categoryLabel || ''}`}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            padding: 0,
            flex: '1 1 0',
            minWidth: 0,
            height: 156,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            cursor: run.stravaId ? 'pointer' : 'default',
            gap: 4,
          }}
        >
          <div style={{
            flex: 1,
            width: '100%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column-reverse',
            borderRadius: 4,
            overflow: 'hidden',
            background: 'rgba(148,163,184,0.12)',
          }}
          >
            {run.shares.map((share) => (
              <div
                key={share.zone}
                style={{
                  height: `${Math.max(0, Number(share.percent || 0))}%`,
                  background: share.color,
                  minHeight: share.percent > 2 ? 2 : 0,
                }}
              />
            ))}
          </div>
          <div style={{
            width: '100%',
            height: 3,
            borderRadius: 99,
            background: run.categoryColor || theme.textMuted,
          }}
          />
          <div style={{
            fontSize: 8,
            fontWeight: 700,
            color: theme.textMuted,
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            height: 42,
            overflow: 'hidden',
            lineHeight: 1.1,
          }}
          >
            {fmtDate(run.date)}
          </div>
        </button>
      ))}
    </div>
  );
}

function Spark({ points = [], color = '#fb7185', invert = false, valueFmt, onSelect }) {
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
    return { ...p, x, y, i };
  });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: 90, cursor: onSelect ? 'pointer' : 'default' }}
      onClick={() => onSelect?.(points)}
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.6"
        strokeLinejoin="round"
        points={coords.map((p) => `${p.x},${p.y}`).join(' ')}
      />
      {onSelect ? coords.map((p) => (
        <circle key={`${p.date}-${p.i}`} cx={p.x} cy={p.y} r="3.4" fill={color} />
      )) : null}
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
  const [easyOpen, setEasyOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [catFilter, setCatFilter] = useState('easy');
  const model = useMemo(
    () => buildHrTrainingModel({ runRows, insights, overrides }),
    [runRows, insights, overrides],
  );
  const last = model.lastRun;
  const listed = useMemo(() => {
    const rows = model.grouped.find((group) => group.id === catFilter)?.rows
      || model.runs.filter((run) => run.category === catFilter);
    return rows;
  }, [model, catFilter]);

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
        No runs in this goal window yet. Pick another goal or sync Strava.
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
            Graphs follow the goal dropdown. Edit a run category from the section at the bottom.
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fda4af' }}>
            My zones{model.personalZones?.ceiling ? ` · peak ${model.personalZones.ceiling} bpm` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#fecdd3', marginTop: 3 }}>
            {model.personalZones?.source || 'Need more HR runs to pin your bands — not a generic 190 max.'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {(model.personalZones?.bands || ZONE_META).map((zone) => (
              <span
                key={zone.zone}
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: zone.color,
                  background: `${zone.color}18`,
                  border: `1px solid ${zone.color}44`,
                  borderRadius: 999,
                  padding: '4px 8px',
                }}
              >
                {zone.short} {zone.range || '--'}
              </span>
            ))}
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
            <div>
              <div style={{ fontSize: 11, color: '#fda4af', fontWeight: 800 }}>Last run · {fmtDate(last.date)}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last.name}</div>
              <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 2 }}>
                {last.distance?.toFixed?.(1) || last.distance} km
                {last.avgHeartrate ? ` · ${last.avgHeartrate} bpm` : ''}
                {last.paceMinPerKm ? ` · ${fmtTrainingPace(last.paceMinPerKm)} /km` : ''}
                {` · ${last.label}`}
              </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
          <div style={{ padding: '10px 8px', borderRadius: 14, background: 'rgba(2,6,23,0.4)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#fda4af', textTransform: 'uppercase' }}>Total km</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff7ed' }}>{model.totalKm}</div>
          </div>
          <div style={{ padding: '10px 8px', borderRadius: 14, background: 'rgba(2,6,23,0.4)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#fda4af', textTransform: 'uppercase' }}>Runs</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff7ed' }}>{model.runCount}</div>
          </div>
          <div style={{ padding: '10px 8px', borderRadius: 14, background: 'rgba(2,6,23,0.4)' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#fda4af', textTransform: 'uppercase' }}>Avg speed</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#fff7ed' }}>{fmtTrainingSpeed(model.avgSpeed)}</div>
          </div>
        </div>
      </section>

      <section style={{
        borderRadius: 24,
        padding: 16,
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.96))',
        border: '1px solid rgba(56,189,248,0.22)',
        minWidth: 0,
      }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dd3fc' }}>
          Time in each zone · past runs
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', margin: '6px 0 10px' }}>
          Last {Math.min(18, model.zoneHistory.length)} HR runs in this goal. Tap a bar to open it.
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
          <div style={{ fontSize: 13, fontWeight: 800, color: '#bbf7d0', marginTop: 4 }}>
            Easy avg speed {fmtTrainingSpeed(model.easyAvgSpeed)}
          </div>
          <div style={{ fontSize: 12, color: '#bbf7d0', marginTop: 4 }}>
            Tap the graph to open those easy / recovery / long runs.
          </div>
        </div>
        <Spark
          points={model.easyHrSeries}
          color="#4ade80"
          valueFmt={(v) => `${Math.round(v)} bpm`}
          onSelect={() => setEasyOpen(true)}
        />
        {easyOpen ? (
          <div style={{
            display: 'grid',
            gap: 6,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 10,
            borderRadius: 14,
            background: 'rgba(2,6,23,0.45)',
            border: '1px solid rgba(74,222,128,0.28)',
          }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#86efac' }}>
                Easy runs · {model.easyHrSeries.length}
              </div>
              <button
                type="button"
                onClick={() => setEasyOpen(false)}
                style={{ border: 'none', background: 'transparent', color: '#94a3b8', fontWeight: 800, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
            {[...model.easyHrSeries].reverse().map((run) => (
              <button
                key={`${run.stravaId || run.date}-${run.label}`}
                type="button"
                onClick={() => run.stravaId && onOpenRun?.(run.stravaId)}
                style={{
                  appearance: 'none',
                  border: 'none',
                  textAlign: 'left',
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: 'rgba(15,23,42,0.7)',
                  color: '#f0fdf4',
                  cursor: run.stravaId ? 'pointer' : 'default',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  {fmtDate(run.date)} · {Number(run.distance || 0).toFixed(1)} km
                </div>
                <div style={{ fontSize: 11, color: '#bbf7d0' }}>
                  {Math.round(run.y)} bpm
                  {run.speedKmh ? ` · ${fmtTrainingSpeed(run.speedKmh)}` : ''}
                  {run.paceMinPerKm ? ` · ${fmtTrainingPace(run.paceMinPerKm)} /km` : ''}
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section style={{ display: 'grid', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fdba74' }}>
            Average speed in each zone
          </div>
          <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.45 }}>
            How fast you move while the heart stays in that band. This is the number to watch.
          </div>
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
                {fmtTrainingSpeed(zone.currentSpeed)}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: theme.textSecondary }}>
                {fmtTrainingPace(zone.currentPace)} /km · 5 km ≈ {zone.fiveKmNow}
              </div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>
                {zone.previousPace ? `Was ${fmtTrainingPace(zone.previousPace)} /km` : `${zone.sampleCount} samples`}
                {zone.deltaSecPerKm != null ? ` · ${zone.deltaSecPerKm < 0 ? `${Math.abs(zone.deltaSecPerKm)}s faster` : `${zone.deltaSecPerKm}s slower`}` : ''}
              </div>
              <Spark points={zone.series} color={zone.color} invert />
            </div>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7dd3fc' }}>
          Average speed by category
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
          {model.grouped.map((group) => (
            <div
              key={group.id}
              style={{
                padding: 12,
                borderRadius: 16,
                background: `${group.color}14`,
                border: `1px solid ${group.color}44`,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 800, color: group.color }}>{group.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: theme.textHeading }}>{fmtTrainingSpeed(group.avgSpeed)}</div>
              <div style={{ fontSize: 11, color: theme.textMuted }}>{group.count} runs · {group.km} km</div>
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
        <button
          type="button"
          onClick={() => setCatsOpen((open) => {
            const next = !open;
            if (next && model.grouped[0]) setCatFilter(model.grouped[0].id);
            return next;
          })}
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: '#d8b4fe',
            textAlign: 'left',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Edit categories {catsOpen ? '▾' : '▸'}
          </div>
          <div style={{ fontSize: 12, color: '#c4b5fd', marginTop: 3 }}>
            Closed by default. Pick one category, then change those runs.
          </div>
        </button>
        {catsOpen ? (
          <>
            <CategoryPicker
              theme={theme}
              value={catFilter}
              ariaLabel="Filter category"
              onChange={setCatFilter}
            />
            <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {listed.map((run) => (
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
                      {fmtTrainingSpeed(run.avgSpeedKmh || (run.paceMinPerKm ? 60 / run.paceMinPerKm : null))}
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
          </>
        ) : null}
      </section>
    </div>
  );
}
