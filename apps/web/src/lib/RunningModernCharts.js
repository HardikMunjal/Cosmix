import { useMemo } from 'react';
import { hrZoneForBpm } from './hrZones';
import { getShoeColor } from './runningShoes';

/** Soft chart palette — matches shoe graph tones, not neon. */
export const CHART_SOFT = {
  blue: '#6eb8c9',
  green: '#6fbf8a',
  cyan: '#7ab8c4',
  hr: '#d48a96',
  hrAlt: '#c9a0a8',
  orange: '#d4b86a',
  muted: '#94a3b8',
};

const LEGEND_SOFT = {
  recovery: CHART_SOFT.muted,
  fat: CHART_SOFT.green,
  aerobic: CHART_SOFT.blue,
  threshold: CHART_SOFT.orange,
  max: CHART_SOFT.hr,
};

/**
 * Quiet HR legend for pace charts — gradient scale + text rows, no loud pills.
 * counts: optional { fat: 2, aerobic: 3, ... } km (or run) counts
 */
export function HrEffortLegend({ theme, legend = [], counts = null, unit = 'km' }) {
  const zones = (legend || []).filter((z) => z.id >= 2 && z.id <= 5);
  const withCount = counts
    ? zones.filter((z) => Number(counts[z.key] || 0) > 0)
    : zones;
  const rows = withCount.length ? withCount : zones;
  const total = rows.reduce((sum, z) => sum + Number(counts?.[z.key] || 0), 0);

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 2 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: theme.textMuted,
      }}
      >
        <span>Easy</span>
        <span style={{ opacity: 0.8 }}>Heart rate</span>
        <span>Hard</span>
      </div>
      <div style={{
        height: 7,
        borderRadius: 999,
        background: 'linear-gradient(90deg, #6fbf8a 0%, #6eb8c9 34%, #d4b86a 68%, #d48a96 100%)',
        opacity: 0.85,
      }}
      />
      {total > 0 ? (
        <div style={{
          display: 'flex',
          height: 5,
          borderRadius: 999,
          overflow: 'hidden',
          background: 'rgba(148,163,184,0.12)',
        }}
        >
          {rows.map((zone) => {
            const n = Number(counts[zone.key] || 0);
            if (n <= 0) return null;
            return (
              <div
                key={`bar-${zone.key}`}
                title={`${zone.label}: ${n} ${unit}`}
                style={{
                  width: `${(n / total) * 100}%`,
                  background: LEGEND_SOFT[zone.key] || zone.color,
                  opacity: 0.8,
                }}
              />
            );
          })}
        </div>
      ) : null}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px 16px',
        rowGap: 6,
      }}
      >
        {rows.map((zone) => {
          const soft = LEGEND_SOFT[zone.key] || zone.color;
          const n = counts ? Number(counts[zone.key] || 0) : null;
          return (
            <div
              key={zone.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                fontSize: 11,
                minWidth: 0,
              }}
            >
              <span style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                background: soft,
                flexShrink: 0,
                opacity: 0.9,
              }}
              />
              <span style={{ color: theme.textMuted, fontWeight: 560 }}>{zone.short || zone.label}</span>
              {n != null && n > 0 ? (
                <span style={{ color: theme.textSecondary || theme.textHeading, fontWeight: 700 }}>
                  {n} {unit}
                </span>
              ) : (
                <span style={{ color: theme.textMuted, fontWeight: 500, opacity: 0.85 }}>
                  {zone.rangeLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DepthMetric({ label, value, sub, accent, theme }) {
  return (
    <div style={{
      position: 'relative',
      padding: '14px 12px 12px',
      borderRadius: 18,
      background: `linear-gradient(155deg, ${accent}28 0%, ${theme.cardBg} 48%)`,
      border: `1px solid ${accent}40`,
      boxShadow: theme.chartDepth || `0 16px 36px ${accent}18`,
      overflow: 'hidden',
      minWidth: 0,
    }}
    >
      <div style={{
        position: 'absolute', inset: 'auto -20% -40% auto', width: 90, height: 90,
        borderRadius: '50%', background: `${accent}22`, filter: 'blur(2px)',
      }}
      />
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: theme.textMuted }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, marginTop: 6, letterSpacing: '-0.03em' }}>{value}</div>
      {sub ? <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

/** Contained 3D-style bars — no skew overflow */
export function DepthBars({ title, items = [], theme, accent, unit = '' }) {
  const rows = (items || []).slice(0, 8);
  const max = Math.max(...rows.map((i) => Number(i.value) || 0), 1);
  const barCount = Math.max(rows.length, 1);
  const svgW = Math.max(280, barCount * 48);
  const svgH = 150;
  const padX = 12;
  const padTop = 22;
  const padBottom = 36;
  const chartH = svgH - padTop - padBottom;
  const slot = (svgW - padX * 2) / barCount;
  const barW = Math.min(28, slot * 0.55);

  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      width: '100%',
    }}
    >
      {title ? <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, marginBottom: 8 }}>{title}</div> : null}
      {!rows.length ? (
        <div style={{ fontSize: 12, color: theme.textMuted }}>No data yet</div>
      ) : (
        <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: Math.min(svgW, 320), height: 150, display: 'block' }}>
            <defs>
              <linearGradient id={`depth-${String(accent).replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity="1" />
                <stop offset="100%" stopColor={accent} stopOpacity="0.45" />
              </linearGradient>
            </defs>
            {rows.map((item, index) => {
              const value = Number(item.value) || 0;
              const h = Math.max(6, (value / max) * chartH);
              const cx = padX + slot * index + slot / 2;
              const x = cx - barW / 2;
              const y = padTop + chartH - h;
              return (
                <g key={`${item.label}-${index}`}>
                  {/* depth face */}
                  <polygon
                    points={`${x + barW},${y} ${x + barW + 6},${y - 5} ${x + barW + 6},${y + h - 5} ${x + barW},${y + h}`}
                    fill={accent}
                    opacity="0.35"
                  />
                  <rect x={x} y={y} width={barW} height={h} rx="6" fill={`url(#depth-${String(accent).replace('#', '')})`} />
                  <text x={cx} y={y - 8} textAnchor="middle" fill={accent} fontSize="10" fontWeight="800">
                    {item.value}{unit}
                  </text>
                  <text x={cx} y={svgH - 10} textAnchor="middle" fill={theme.textMuted} fontSize="9">
                    {String(item.label || '').slice(0, 8)}
                  </text>
                </g>
              );
            })}
            <line x1={padX} x2={svgW - padX} y1={padTop + chartH} y2={padTop + chartH} stroke={theme.cardBorder} strokeWidth="1" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Horizontal depth bars — safer for crowded shoe lists */
export function DepthHBars({ title, items = [], theme, accent, unit = '' }) {
  const rows = (items || []).slice(0, 8);
  const max = Math.max(...rows.map((i) => Number(i.value) || 0), 1);
  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      width: '100%',
      display: 'grid',
      gap: 10,
    }}
    >
      {title ? <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div> : null}
      {!rows.length ? (
        <div style={{ fontSize: 12, color: theme.textMuted }}>No data yet</div>
      ) : rows.map((item, index) => {
        const pct = Math.max(4, (Number(item.value) || 0) / max * 100);
        const color = item.color || getShoeColor({ id: item.shoeId, name: item.label, label: item.label }, accent);
        return (
          <div key={`${item.label}-${index}`} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 11, alignItems: 'center' }}>
              <ShoeBadge label={item.label} color={color} theme={theme} />
              <span style={{ color, fontWeight: 800, flexShrink: 0 }}>{item.value}{unit}</span>
            </div>
            <div style={{ height: 14, borderRadius: 8, background: theme.cardBorder, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 8,
                background: `linear-gradient(90deg, ${color}, ${color}88)`,
                boxShadow: `inset 0 -3px 0 ${color}55, 0 4px 10px ${color}33`,
              }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Smooth area polyline with glow. Pass point.hr for gradual green→red effort color. */
/** Build time-bucketed trend points from run rows. */
export function buildRunTrendBuckets(rows = [], valueFn) {
  const valid = (rows || [])
    .map((row) => ({
      date: String(row.date || '').slice(0, 10),
      value: Number(valueFn(row)),
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!valid.length) {
    return { points: [], overallAvg: null, last10Avg: null, bucketUnit: 'run', spanDays: 0 };
  }

  const spanMs = new Date(`${valid[valid.length - 1].date}T12:00:00`).getTime()
    - new Date(`${valid[0].date}T12:00:00`).getTime();
  const spanDays = Math.max(1, Math.round(spanMs / 86400000) + 1);

  let points = [];
  let bucketUnit = 'run';

  if (spanDays > 31) {
    bucketUnit = 'week';
    const weekMap = new Map();
    valid.forEach((row) => {
      const d = new Date(`${row.date}T12:00:00`);
      const day = d.getDay();
      const monday = new Date(d);
      monday.setDate(d.getDate() - ((day + 6) % 7));
      const key = monday.toISOString().slice(0, 10);
      if (!weekMap.has(key)) weekMap.set(key, []);
      weekMap.get(key).push(row.value);
    });
    points = [...weekMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, vals]) => ({
        date: week,
        label: week.slice(5),
        y: vals.reduce((sum, v) => sum + v, 0) / vals.length,
      }));
  } else if (valid.length > 10) {
    bucketUnit = 'day';
    const dayMap = new Map();
    valid.forEach((row) => {
      if (!dayMap.has(row.date)) dayMap.set(row.date, []);
      dayMap.get(row.date).push(row.value);
    });
    points = [...dayMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, vals]) => ({
        date,
        label: date.slice(5),
        y: vals.reduce((sum, v) => sum + v, 0) / vals.length,
      }));
  } else {
    points = valid.map((row) => ({
      date: row.date,
      label: row.date.slice(5),
      y: row.value,
    }));
  }

  const maxPoints = 24;
  if (points.length > maxPoints) points = points.slice(-maxPoints);

  const overallAvg = valid.reduce((sum, row) => sum + row.value, 0) / valid.length;

  const today = new Date();
  const start10 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9);
  const start10Str = start10.toISOString().slice(0, 10);
  const last10Vals = valid.filter((row) => row.date >= start10Str).map((row) => row.value);
  const last10Avg = last10Vals.length
    ? last10Vals.reduce((sum, v) => sum + v, 0) / last10Vals.length
    : null;

  return { points, overallAvg, last10Avg, bucketUnit, spanDays };
}

/**
 * Fixed-size run trend — smooth line + area, no dots.
 * Shows overall average and last-10-day average as reference lines.
 */
export function RunTrendChart({
  title,
  subtitle,
  points = [],
  overallAvg = null,
  last10Avg = null,
  theme,
  accent,
  valueFmt,
  invertY = false,
  lowerIsBetter = false,
  unitLabel = '',
}) {
  const series = useMemo(() => (points || []).filter((p) => Number(p.y) > 0), [points]);
  const fmt = (v) => (valueFmt ? valueFmt(v) : Number(v).toFixed(1));

  const cardStyle = {
    padding: 14,
    borderRadius: 20,
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.chartDepth,
    overflow: 'hidden',
    minWidth: 0,
    display: 'grid',
    gap: 8,
  };

  if (series.length < 2) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
        ) : null}
        <div style={{ fontSize: 12, color: theme.textMuted }}>Need at least 2 data points.</div>
      </div>
    );
  }

  const w = 360;
  const h = 132;
  const pad = { t: 12, r: 10, b: 22, l: 10 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const refLines = [overallAvg, last10Avg].filter((v) => Number(v) > 0);
  const ys = [...series.map((p) => Number(p.y)), ...refLines];
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(0.001, max - min);
  const yPad = span * 0.12;
  const yMin = min - yPad;
  const yMax = max + yPad;
  const ySpan = Math.max(0.001, yMax - yMin);

  const yFor = (v) => {
    const ratio = (Number(v) - yMin) / ySpan;
    return invertY
      ? pad.t + ratio * plotH
      : pad.t + plotH - ratio * plotH;
  };

  const coords = series.map((p, i) => ({
    x: pad.l + (i / (series.length - 1)) * plotW,
    y: yFor(p.y),
    label: p.label,
    yVal: p.y,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${(pad.t + plotH).toFixed(1)} L${coords[0].x.toFixed(1)},${(pad.t + plotH).toFixed(1)} Z`;
  const gid = `run-trend-${String(accent).replace('#', '')}-${title.replace(/\W/g, '').slice(0, 8)}`;

  const compareNote = (() => {
    if (overallAvg == null || last10Avg == null) return null;
    const delta = last10Avg - overallAvg;
    if (Math.abs(delta) < 0.02) return 'Last 10 days matches your overall average';
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    const size = fmt(Math.abs(delta));
    if (lowerIsBetter) return better ? `Last 10 days ${size} faster than overall` : `Last 10 days ${size} slower than overall`;
    return better ? `Last 10 days ${size} lower than overall` : `Last 10 days ${size} higher than overall`;
  })();

  const compareColor = (() => {
    if (overallAvg == null || last10Avg == null) return theme.textMuted;
    const delta = last10Avg - overallAvg;
    if (Math.abs(delta) < 0.02) return theme.textMuted;
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    return better ? theme.green : theme.orange;
  })();

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
          ) : null}
        </div>
      </div>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px 14px',
        fontSize: 11,
        color: theme.textSecondary || theme.textHeading,
      }}
      >
        {overallAvg != null ? (
          <span>
            <span style={{ color: theme.textMuted }}>All runs avg </span>
            <strong style={{ color: accent }}>{fmt(overallAvg)}{unitLabel}</strong>
          </span>
        ) : null}
        {last10Avg != null ? (
          <span>
            <span style={{ color: theme.textMuted }}>Last 10 days </span>
            <strong style={{ color: accent }}>{fmt(last10Avg)}{unitLabel}</strong>
          </span>
        ) : null}
      </div>
      {compareNote ? (
        <div style={{ fontSize: 10, color: compareColor, fontWeight: 700, lineHeight: 1.35 }}>{compareNote}</div>
      ) : null}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 132, display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {overallAvg != null ? (
          <line
            x1={pad.l}
            y1={yFor(overallAvg)}
            x2={w - pad.r}
            y2={yFor(overallAvg)}
            stroke={theme.textMuted || '#64748b'}
            strokeWidth="1"
            strokeDasharray="5 4"
            opacity={0.55}
          />
        ) : null}
        {last10Avg != null ? (
          <line
            x1={pad.l}
            y1={yFor(last10Avg)}
            x2={w - pad.r}
            y2={yFor(last10Avg)}
            stroke={accent}
            strokeWidth="1.2"
            strokeDasharray="3 3"
            opacity={0.75}
          />
        ) : null}
        <path d={areaPath} fill={`url(#${gid})`} />
        <path
          d={linePath}
          fill="none"
          stroke={accent}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        color: theme.textMuted,
        flexWrap: 'wrap',
        gap: 6,
      }}
      >
        <span>{series[0]?.label || ''}</span>
        <span style={{ display: 'inline-flex', gap: 10, flexWrap: 'wrap' }}>
          <span>— all runs avg</span>
          <span style={{ color: accent }}>- - last 10 days</span>
        </span>
        <span>{series[series.length - 1]?.label || ''}</span>
      </div>
    </div>
  );
}

export function ShoeBadge({ label, color, shoeId, theme, align = 'left' }) {
  const resolved = color
    || getShoeColor({ id: shoeId, name: label, label })
    || theme?.textSecondary
    || theme?.textMuted;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      gap: 7,
      minWidth: 0,
      maxWidth: '100%',
      color: resolved,
      fontWeight: 700,
      textAlign: align === 'right' ? 'right' : 'left',
    }}
    >
      <span style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: resolved || '#94a3b8',
        flexShrink: 0,
      }}
      />
      <span style={{
        minWidth: 0,
        lineHeight: 1.25,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
      >
        {label || 'Untagged'}
      </span>
    </span>
  );
}

function fmtRunDate(dateStr) {
  const raw = String(dateStr || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || '--';
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw.slice(5);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** 70 → "1h 10m"; 45 → "45m". */
export function fmtRunDuration(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return '--';
  if (total < 60) return `${total}m`;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (mins <= 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function rankBarColor(index) {
  if (index === 0) return '#38bdf8';
  if (index === 1) return '#f59e0b';
  if (index === 2) return '#fb7185';
  return '#64748b';
}

function MetricCell({
  label,
  value,
  unit,
  color,
  theme,
  align = 'center',
  valueSize = 13,
}) {
  const textAlign = align;
  return (
    <div style={{
      minWidth: 0,
      textAlign,
      display: 'flex',
      flexDirection: 'column',
      alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
      gap: 3,
      padding: '0 2px',
    }}
    >
      {label ? (
        <div style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: theme.textMuted,
          lineHeight: 1,
          width: '100%',
          textAlign,
        }}
        >
          {label}
        </div>
      ) : null}
      <div style={{
        fontSize: valueSize,
        fontWeight: 800,
        lineHeight: 1.15,
        color: color || theme.textHeading,
        width: '100%',
        textAlign,
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
      }}
      >
        {value}
      </div>
      {unit != null ? (
        <div style={{
          fontSize: 9,
          color: theme.textMuted,
          lineHeight: 1,
          width: '100%',
          textAlign,
          fontWeight: 600,
        }}
        >
          {unit}
        </div>
      ) : null}
    </div>
  );
}

/** Clean leaderboard with equal metric spacing: Score · Dist · Time · Speed · HR · Shoe. */
export function RunLeaderboard({
  title,
  subtitle,
  rows = [],
  theme,
  accent,
  metricKey,
  metricFmt,
  emptyText = 'No runs yet.',
  limit = 5,
}) {
  const list = (rows || []).slice(0, limit);
  const values = list.map((row) => Math.abs(Number(row[metricKey]) || 0));
  const max = Math.max(...values, 0.01);

  if (!list.length) {
    return (
      <div style={{
        padding: 14,
        borderRadius: 16,
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        color: theme.textMuted,
        fontSize: 12,
      }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: theme.textHeading, marginBottom: 4 }}>{title}</div>
        {emptyText}
      </div>
    );
  }

  // Rank | 5 equal metric cols | shoe — constant gap, symmetric metrics.
  const gridCols = '22px repeat(5, minmax(0, 1fr)) minmax(0, 1.05fr)';
  const colGap = 8;
  const rowPad = '10px 10px';

  const headerStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 1,
  };

  return (
    <div style={{
      padding: 12,
      borderRadius: 16,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      display: 'grid',
      gap: 8,
      width: '100%',
    }}
    >
      <div style={{ padding: '2px 4px 4px' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
        ) : null}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: colGap,
        padding: '0 10px 2px',
        alignItems: 'end',
      }}
      >
        <span />
        <span style={{ ...headerStyle, color: theme.textSecondary || theme.textHeading, fontWeight: 800 }}>Score</span>
        <span style={headerStyle}>Dist</span>
        <span style={headerStyle}>Time</span>
        <span style={headerStyle}>Speed</span>
        <span style={headerStyle}>HR</span>
        <span style={{ ...headerStyle, textAlign: 'left' }}>Shoe</span>
      </div>

      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((row, index) => {
          const metric = Number(row[metricKey]) || 0;
          const barW = Math.max(10, (Math.abs(metric) / max) * 100);
          const barColor = accent || rankBarColor(index);
          const scoreText = metricFmt ? metricFmt(metric) : String(metric);
          const shoeColor = getShoeColor(
            { id: row.shoeId, name: row.shoeLabel, label: row.shoeLabel },
            row.shoeColor || '#64748b',
          );

          return (
            <div
              key={row.id || `${row.date}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: colGap,
                alignItems: 'center',
                padding: rowPad,
                borderRadius: 12,
                background: 'rgba(148,163,184,0.06)',
                border: `1px solid ${theme.cardBorder}`,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted }}>
                  {index + 1}
                </span>
                <span style={{ width: 3, height: 22, borderRadius: 99, background: rankBarColor(index), flexShrink: 0 }} />
              </div>

              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, lineHeight: 1.15 }}>
                  {scoreText}
                </div>
                <div style={{
                  width: '70%',
                  maxWidth: 36,
                  height: 2,
                  borderRadius: 99,
                  background: 'rgba(148,163,184,0.15)',
                  overflow: 'hidden',
                }}
                >
                  <div style={{ width: `${barW}%`, height: '100%', borderRadius: 99, background: barColor }} />
                </div>
                <div style={{ fontSize: 9, color: theme.textMuted, fontWeight: 600, lineHeight: 1 }}>
                  {fmtRunDate(row.date)}
                </div>
              </div>

              <MetricCell
                theme={theme}
                value={row.distance != null ? Number(row.distance).toFixed(1) : '--'}
                unit="km"
                color={theme.textHeading}
              />
              <MetricCell
                theme={theme}
                value={fmtRunDuration(row.minutes)}
                unit={'\u00A0'}
                color={CHART_SOFT.cyan}
                valueSize={11}
              />
              <MetricCell
                theme={theme}
                value={row.speed != null ? Number(row.speed).toFixed(1) : '--'}
                unit="km/h"
                color={CHART_SOFT.green}
              />
              <MetricCell
                theme={theme}
                value={row.avgHeartrate != null
                  ? `${row.hrEstimated ? '~' : ''}${Math.round(row.avgHeartrate)}`
                  : '--'}
                unit="bpm"
                color={CHART_SOFT.hr}
              />

              <div style={{
                minWidth: 0,
                textAlign: 'left',
                fontSize: 7.5,
                fontWeight: 700,
                color: shoeColor,
                lineHeight: 1.15,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
                paddingLeft: 2,
              }}
              >
                {row.shoeLabel || 'Untagged'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GlowTrend({
  title,
  subtitle,
  points = [],
  theme,
  accent,
  valueFmt,
  maxHr,
  showHrZones = false,
  lowerIsBetter = false,
  unitLabel = '',
}) {
  const series = useMemo(() => points.filter((p) => Number(p.y) > 0), [points]);
  const hasHr = showHrZones || series.some((p) => Number(p.hr) > 0);
  const ceiling = Number(maxHr) || Math.max(...series.map((p) => Number(p.maxHr) || 0), 190);

  const cardStyle = {
    padding: 14,
    borderRadius: 20,
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.chartDepth,
    overflow: 'hidden',
    minWidth: 0,
    display: 'grid',
    gap: 10,
  };

  if (series.length < 2) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
        ) : null}
        <div style={{ fontSize: 12, color: theme.textMuted }}>Need at least 2 runs to show a trend.</div>
      </div>
    );
  }

  const w = 360;
  const h = 128;
  const pad = { t: 10, r: 12, b: 22, l: 12 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;

  const ys = series.map((p) => Number(p.y));
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(0.001, max - min);
  const yPad = span * 0.14;
  const yMin = min - yPad;
  const yMax = max + yPad;
  const ySpan = Math.max(0.001, yMax - yMin);
  const yFor = (v) => pad.t + plotH - ((v - yMin) / ySpan) * plotH;

  const coords = series.map((p, i) => {
    const x = pad.l + (i / (series.length - 1)) * plotW;
    const y = yFor(Number(p.y));
    const zone = Number(p.hr) > 0 ? hrZoneForBpm(p.hr, p.maxHr || ceiling) : null;
    const color = zone ? (LEGEND_SOFT[zone.key] || zone.zoneColor || accent) : accent;
    return {
      x,
      y,
      color,
      zone,
      hr: Number(p.hr) || null,
      label: p.label,
      yVal: Number(p.y),
      isLatest: i === series.length - 1,
    };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const latest = series[series.length - 1];
  const first = series[0];
  const delta = Number(latest.y) - Number(first.y);
  const fmt = (v) => (valueFmt ? valueFmt(v) : Number(v).toFixed(2));

  const trendNote = (() => {
    if (Math.abs(delta) < 0.02) return 'Steady vs oldest';
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    const size = fmt(Math.abs(delta));
    if (lowerIsBetter) return better ? `${size} faster vs oldest` : `${size} slower vs oldest`;
    return better ? `${size} faster vs oldest` : `${size} slower vs oldest`;
  })();

  const trendColor = (() => {
    if (Math.abs(delta) < 0.02) return theme.textMuted;
    const better = lowerIsBetter ? delta < 0 : delta > 0;
    return better ? theme.green : theme.orange;
  })();

  const zoneKeys = new Set(coords.filter((c) => c.zone).map((c) => c.zone.key));
  const zoneShort = { fat: 'Z2', aerobic: 'Z3', threshold: 'Z4', max: 'Z5', recovery: 'Z1' };

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
          ) : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: accent, lineHeight: 1.1 }}>
            {fmt(latest.y)}{unitLabel}
          </div>
          <div style={{ fontSize: 10, color: trendColor, fontWeight: 700, marginTop: 3, maxWidth: 120, lineHeight: 1.3 }}>
            {trendNote}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 128, display: 'block' }}>
        <line
          x1={pad.l}
          y1={pad.t + plotH}
          x2={w - pad.r}
          y2={pad.t + plotH}
          stroke={theme.cardBorder || 'rgba(148,163,184,0.25)'}
          strokeWidth="1"
        />
        <path
          d={linePath}
          fill="none"
          stroke={theme.textMuted || '#64748b'}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
        {coords.map((c, i) => (
          <g key={`pt-${i}`}>
            <circle
              cx={c.x}
              cy={c.y}
              r={c.isLatest ? 6.5 : 5}
              fill={c.color}
              opacity={c.isLatest ? 1 : 0.88}
            />
            {c.isLatest ? (
              <circle
                cx={c.x}
                cy={c.y}
                r={6.5}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth="1.2"
              />
            ) : null}
            <title>
              {`${c.label || `Run ${i + 1}`} · ${fmt(c.yVal)}${unitLabel}${c.hr ? ` · ${c.hr} bpm` : ''}${c.zone ? ` · ${c.zone.short}` : ''}`}
            </title>
          </g>
        ))}
      </svg>
      {hasHr && zoneKeys.size ? (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 12px',
          fontSize: 10,
          color: theme.textMuted,
          alignItems: 'center',
        }}
        >
          <span>Each dot = avg HR zone for that run</span>
          {[...zoneKeys].map((key) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: LEGEND_SOFT[key] || accent,
                flexShrink: 0,
              }}
              />
              {zoneShort[key] || key}
            </span>
          ))}
        </div>
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.textMuted }}>
        <span>{first.label || 'Oldest'}</span>
        <span style={{ opacity: 0.85 }}>Latest run →</span>
        <span>{latest.label || 'Newest'}</span>
      </div>
    </div>
  );
}

export function ShoeDonutShare({ shoeStats = [], theme, title = 'Distance share' }) {
  const rows = (shoeStats || []).filter((s) => s.shoeId && Number(s.totalKm) > 0).slice(0, 5);
  const total = rows.reduce((s, r) => s + Number(r.totalKm || 0), 0) || 1;
  if (!rows.length) {
    return <div style={{ padding: 14, color: theme.textMuted, fontSize: 12 }}>Tag runs with shoes to unlock wear charts.</div>;
  }
  const r = 48;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = rows.map((row) => {
    const frac = Number(row.totalKm || 0) / total;
    const len = frac * c;
    const dash = `${len} ${c - len}`;
    const color = getShoeColor({ id: row.shoeId, name: row.label, label: row.label }, theme.orange);
    const item = { ...row, dash, offset, color, pct: Math.round(frac * 100) };
    offset += len;
    return item;
  });

  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      display: 'grid',
      gap: 12,
      overflow: 'hidden',
      minWidth: 0,
    }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        minWidth: 0,
        width: '100%',
      }}
      >
        <svg viewBox="0 0 120 120" style={{ width: 120, height: 120, flexShrink: 0, display: 'block' }}>
          <circle cx="60" cy="60" r={r} fill="none" stroke={theme.cardBorder} strokeWidth="14" />
          {arcs.map((arc) => (
            <circle
              key={arc.shoeId || arc.label}
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth="14"
              strokeDasharray={arc.dash}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 60 60)"
              strokeLinecap="butt"
            />
          ))}
          <text x="60" y="58" textAnchor="middle" fill={theme.textHeading} fontSize="15" fontWeight="800">{total.toFixed(0)}</text>
          <text x="60" y="74" textAnchor="middle" fill={theme.textMuted} fontSize="9">km</text>
        </svg>
        <div style={{ display: 'grid', gap: 8, width: '100%', minWidth: 0 }}>
          {arcs.map((arc) => (
            <div key={arc.shoeId || arc.label} style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) auto',
              gap: 8,
              alignItems: 'center',
              fontSize: 12,
              minWidth: 0,
            }}
            >
              <ShoeBadge label={arc.label} color={arc.color} theme={theme} />
              <span style={{ color: arc.color, fontWeight: 800, flexShrink: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {arc.pct}%
                <span style={{ display: 'block', fontSize: 10, color: theme.textMuted, fontWeight: 700 }}>
                  {Number(arc.totalKm).toFixed(1)} km
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TopDistanceRuns({ title, rows = [], theme, limit = 5 }) {
  const list = (rows || []).slice(0, limit);
  if (!list.length) {
    return (
      <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: no runs yet.
      </div>
    );
  }
  const maxKm = Math.max(...list.map((r) => Number(r.distance) || 0), 0.01);
  const gridCols = '22px repeat(4, minmax(0, 1fr)) minmax(0, 1.05fr)';
  const colGap = 8;
  const headerStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 1,
  };

  return (
    <div style={{
      padding: 12,
      borderRadius: 16,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      display: 'grid',
      gap: 8,
      width: '100%',
    }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 4px' }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: colGap,
        padding: '0 10px 2px',
        alignItems: 'end',
      }}
      >
        <span />
        <span style={{ ...headerStyle, color: theme.textSecondary || theme.textHeading, fontWeight: 800 }}>Dist</span>
        <span style={headerStyle}>Time</span>
        <span style={headerStyle}>Speed</span>
        <span style={headerStyle}>HR</span>
        <span style={{ ...headerStyle, textAlign: 'left' }}>Shoe</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((row, index) => {
          const km = Number(row.distance) || 0;
          const barW = Math.max(10, (km / maxKm) * 100);
          const shoeColor = getShoeColor(
            { id: row.shoeId, name: row.shoeLabel, label: row.shoeLabel },
            row.shoeColor || '#64748b',
          );
          return (
            <div
              key={row.id || `${row.date}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: colGap,
                alignItems: 'center',
                padding: '10px 10px',
                borderRadius: 12,
                background: 'rgba(148,163,184,0.06)',
                border: `1px solid ${theme.cardBorder}`,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted }}>{index + 1}</span>
                <span style={{ width: 3, height: 22, borderRadius: 99, background: rankBarColor(index), flexShrink: 0 }} />
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, lineHeight: 1.15 }}>
                  {km.toFixed(1)}
                </div>
                <div style={{
                  width: '70%',
                  maxWidth: 36,
                  height: 2,
                  borderRadius: 99,
                  background: 'rgba(148,163,184,0.15)',
                  overflow: 'hidden',
                }}
                >
                  <div style={{ width: `${barW}%`, height: '100%', borderRadius: 99, background: CHART_SOFT.blue }} />
                </div>
                <div style={{ fontSize: 9, color: theme.textMuted, fontWeight: 600, lineHeight: 1 }}>
                  {fmtRunDate(row.date)} · km
                </div>
              </div>
              <MetricCell theme={theme} value={fmtRunDuration(row.minutes)} unit={'\u00A0'} color={CHART_SOFT.cyan} valueSize={11} />
              <MetricCell
                theme={theme}
                value={row.speed != null ? Number(row.speed).toFixed(1) : '--'}
                unit="km/h"
                color={CHART_SOFT.green}
              />
              <MetricCell
                theme={theme}
                value={row.avgHeartrate != null
                  ? `${row.hrEstimated ? '~' : ''}${Math.round(row.avgHeartrate)}`
                  : '--'}
                unit="bpm"
                color={CHART_SOFT.hr}
              />
              <div style={{
                minWidth: 0,
                textAlign: 'left',
                fontSize: 7.5,
                fontWeight: 700,
                color: shoeColor,
                lineHeight: 1.15,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
                paddingLeft: 2,
              }}
              >
                {row.shoeLabel || 'Untagged'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtSplitPace(minPerKm, seconds = null) {
  const sec = Number(seconds);
  if (Number.isFinite(sec) && sec > 0) {
    const mins = Math.floor(sec / 60);
    const rest = Math.round(sec % 60);
    return `${mins}:${String(rest).padStart(2, '0')}`;
  }
  const n = Number(minPerKm);
  if (!(n > 0)) return '--';
  const mins = Math.floor(n);
  const rest = Math.round((n - mins) * 60);
  return `${mins}:${String(rest).padStart(2, '0')}`;
}

export function TopFastestSplits({ title = 'Fastest 1 km splits', rows = [], theme, limit = 10 }) {
  const list = (rows || []).slice(0, limit);
  if (!list.length) {
    return (
      <div style={{ padding: 14, borderRadius: 16, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: no stored 1 km splits yet. After GPS sync, each run’s fastest kilometre ranks here.
      </div>
    );
  }
  const gridCols = '22px repeat(4, minmax(0, 1fr)) minmax(0, 1.05fr)';
  const colGap = 8;
  const headerStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: theme.textMuted,
    textAlign: 'center',
    lineHeight: 1,
  };

  return (
    <div style={{
      padding: 12,
      borderRadius: 16,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      display: 'grid',
      gap: 8,
      width: '100%',
    }}
    >
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 4px' }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        gap: colGap,
        padding: '0 10px 2px',
        alignItems: 'end',
      }}
      >
        <span />
        <span style={{ ...headerStyle, color: theme.textSecondary || theme.textHeading, fontWeight: 800 }}>Pace</span>
        <span style={headerStyle}>Km</span>
        <span style={headerStyle}>Date</span>
        <span style={headerStyle}>HR</span>
        <span style={{ ...headerStyle, textAlign: 'left' }}>Shoe</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((row, index) => {
          const shoeColor = getShoeColor(
            { id: row.shoeId, name: row.shoeLabel, label: row.shoeLabel },
            row.shoeColor || '#64748b',
          );
          const kmLabel = Number(row.splitKm) > 0 ? `Km ${row.splitKm}` : '1 km';
          return (
            <div
              key={row.id || `${row.date}-${row.splitKm}-${index}`}
              style={{
                display: 'grid',
                gridTemplateColumns: gridCols,
                gap: colGap,
                alignItems: 'center',
                padding: '10px 10px',
                borderRadius: 12,
                background: 'rgba(148,163,184,0.06)',
                border: `1px solid ${theme.cardBorder}`,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: theme.textMuted }}>{index + 1}</span>
                <span style={{ width: 3, height: 22, borderRadius: 99, background: rankBarColor(index), flexShrink: 0 }} />
              </div>
              <MetricCell
                theme={theme}
                value={fmtSplitPace(row.splitPace, row.splitSeconds)}
                unit="/km"
                color={CHART_SOFT.green}
              />
              <MetricCell theme={theme} value={kmLabel} unit={'\u00A0'} color={CHART_SOFT.cyan} valueSize={11} />
              <MetricCell theme={theme} value={fmtRunDate(row.date)} unit={'\u00A0'} color={theme.textSecondary} valueSize={11} />
              <MetricCell
                theme={theme}
                value={row.splitHr != null
                  ? `${row.splitHrEstimated ? '~' : ''}${Math.round(row.splitHr)}`
                  : '--'}
                unit="bpm"
                color={CHART_SOFT.hr}
              />
              <div style={{
                minWidth: 0,
                textAlign: 'left',
                fontSize: 7.5,
                fontWeight: 700,
                color: shoeColor,
                lineHeight: 1.15,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                wordBreak: 'break-word',
                paddingLeft: 2,
              }}
              >
                {row.shoeLabel || 'Untagged'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SplitRankBars({ title = 'Fastest 1 km ranking', rows = [], theme, limit = 10 }) {
  const list = (rows || []).slice(0, limit);
  const cardStyle = {
    padding: 14,
    borderRadius: 18,
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.chartDepth,
    display: 'grid',
    gap: 10,
    minWidth: 0,
  };
  if (!list.length) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        <div style={{ fontSize: 12, color: theme.textMuted }}>Stored GPS splits will rank here after sync.</div>
      </div>
    );
  }
  const speeds = list.map((row) => Number(row.splitSpeedKmh || (row.splitPace > 0 ? 60 / row.splitPace : 0)));
  const maxSpeed = Math.max(...speeds, 0.01);
  const fmtPace = (minPerKm, seconds) => {
    const sec = Number(seconds);
    if (Number.isFinite(sec) && sec > 0) {
      return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
    }
    const n = Number(minPerKm);
    if (!(n > 0)) return '--';
    return `${Math.floor(n)}:${String(Math.round((n - Math.floor(n)) * 60)).padStart(2, '0')}`;
  };

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>
      <div style={{ fontSize: 11, color: theme.textMuted }}>Bar length is split speed. #1 is your fastest stored kilometre.</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {list.map((row, index) => {
          const speed = speeds[index];
          const width = Math.max(8, (speed / maxSpeed) * 100);
          return (
            <div key={row.id || `${row.date}-${row.splitKm}-${index}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 72px', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: index === 0 ? CHART_SOFT.green : theme.textMuted }}>#{index + 1}</span>
              <div>
                <div style={{ height: 10, borderRadius: 99, background: theme.cardBorder, overflow: 'hidden' }}>
                  <div style={{ width: `${width}%`, height: '100%', background: index === 0 ? CHART_SOFT.green : CHART_SOFT.cyan, borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 10, color: theme.textMuted, marginTop: 3 }}>
                  {row.date ? String(row.date).slice(0, 10) : ''}
                  {row.splitKm ? ` · Km ${row.splitKm}` : ''}
                  {speed ? ` · ${speed.toFixed(1)} km/h` : ''}
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading, textAlign: 'right' }}>
                {fmtPace(row.splitPace, row.splitSeconds)}
                <span style={{ fontSize: 10, color: theme.textMuted, fontWeight: 700 }}>/km</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Last activity: km-wise heart rate + speed. */
export function KmHrSpeedChart({
  title = 'Last walk · km splits',
  subtitle = '',
  splits = [],
  theme,
}) {
  const rows = (splits || []).filter((row) => Number(row.km) > 0 && (Number(row.hr) > 0 || Number(row.speed) > 0));
  const cardStyle = {
    padding: 14,
    borderRadius: 18,
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    boxShadow: theme.chartDepth,
    display: 'grid',
    gap: 8,
    minWidth: 0,
  };
  if (rows.length < 1) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 11, color: theme.textMuted }}>{subtitle}</div> : null}
        <div style={{ fontSize: 12, color: theme.textMuted }}>Need GPS splits for this walk.</div>
      </div>
    );
  }

  const w = 360;
  const h = 148;
  const pad = { t: 14, r: 36, b: 24, l: 32 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const hrs = rows.map((r) => Number(r.hr) || 0).filter((v) => v > 0);
  const speeds = rows.map((r) => Number(r.speed) || 0).filter((v) => v > 0);
  const hrMin = hrs.length ? Math.min(...hrs) - 4 : 80;
  const hrMax = hrs.length ? Math.max(...hrs) + 4 : 140;
  const spMin = speeds.length ? Math.max(0, Math.min(...speeds) - 0.4) : 0;
  const spMax = speeds.length ? Math.max(...speeds) + 0.4 : 8;
  const xFor = (i) => pad.l + (rows.length === 1 ? plotW / 2 : (i / (rows.length - 1)) * plotW);
  const yHr = (v) => pad.t + plotH - ((Number(v) - hrMin) / Math.max(0.001, hrMax - hrMin)) * plotH;
  const ySp = (v) => pad.t + plotH - ((Number(v) - spMin) / Math.max(0.001, spMax - spMin)) * plotH;
  const hrCoords = rows.map((r, i) => (Number(r.hr) > 0 ? { x: xFor(i), y: yHr(r.hr) } : null)).filter(Boolean);
  const spCoords = rows.map((r, i) => (Number(r.speed) > 0 ? { x: xFor(i), y: ySp(r.speed) } : null)).filter(Boolean);
  const pathFor = (coords) => coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>{subtitle}</div> : null}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="168" role="img" aria-label={title}>
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + plotH} stroke={CHART_SOFT.hr} strokeWidth="1.4" opacity="0.7" />
        <line x1={pad.l + plotW} y1={pad.t} x2={pad.l + plotW} y2={pad.t + plotH} stroke={CHART_SOFT.cyan} strokeWidth="1.4" opacity="0.7" />
        <line x1={pad.l} y1={pad.t + plotH} x2={pad.l + plotW} y2={pad.t + plotH} stroke={theme.cardBorder} strokeWidth="1" />
        {hrCoords.length > 1 ? <path d={pathFor(hrCoords)} fill="none" stroke={CHART_SOFT.hr} strokeWidth="2.4" strokeLinejoin="round" /> : null}
        {spCoords.length > 1 ? <path d={pathFor(spCoords)} fill="none" stroke={CHART_SOFT.cyan} strokeWidth="2.4" strokeLinejoin="round" /> : null}
        {hrCoords.map((c, i) => <circle key={`hr-${i}`} cx={c.x} cy={c.y} r="3.2" fill={CHART_SOFT.hr} />)}
        {spCoords.map((c, i) => <circle key={`sp-${i}`} cx={c.x} cy={c.y} r="3.2" fill={CHART_SOFT.cyan} />)}
        {rows.map((row, i) => (
          <text key={`km-${row.km}`} x={xFor(i)} y={h - 6} textAnchor="middle" fontSize="9" fill={theme.textMuted}>{`Km ${row.km}`}</text>
        ))}
        <text x={4} y={pad.t + 4} fontSize="9" fill={CHART_SOFT.hr}>bpm</text>
        <text x={w - 4} y={pad.t + 4} fontSize="9" fill={CHART_SOFT.cyan} textAnchor="end">km/h</text>
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, fontWeight: 700 }}>
        <span style={{ color: CHART_SOFT.hr }}>● Heart rate</span>
        <span style={{ color: CHART_SOFT.cyan }}>● Speed</span>
      </div>
    </div>
  );
}

/** Lollipop / stem chart — colored by shoe id (stable across all shoe charts) */
export function ShoeLollipopChart({
  title,
  items = [],
  theme,
  accent,
  valueFmt,
  invert = false,
}) {
  const rows = (items || []).slice(0, 10);
  if (!rows.length) {
    return (
      <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: not enough runs yet.
      </div>
    );
  }
  const values = rows.map((r) => Math.abs(Number(r.value) || 0));
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values);
  const w = 340;
  const hasMeta = rows.some((item) => item.sub);
  const rowH = hasMeta ? 38 : 30;
  const h = rows.length * rowH + 28;
  const left = 8;
  const right = w - 78;
  const legendShoes = [];
  const seen = new Set();
  rows.forEach((item) => {
    const id = item.shoeId || item.id;
    if (!id || seen.has(id)) return;
    seen.add(id);
    legendShoes.push({
      id,
      label: item.shoeLabel || String(item.label || '').split('·').pop()?.trim() || 'Shoe',
      color: getShoeColor(id, accent || theme.blue),
    });
  });

  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      display: 'grid',
      gap: 8,
      overflow: 'hidden',
      minWidth: 0,
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        {legendShoes.length ? (
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', fontSize: 10, fontWeight: 700, color: theme.textMuted }}>
            {legendShoes.slice(0, 5).map((shoe) => (
              <span key={shoe.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: shoe.color }} />
                {String(shoe.label).slice(0, 14)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block', maxWidth: '100%' }}>
        {rows.map((item, i) => {
          const color = getShoeColor(item.shoeId, accent || theme.blue);
          const y = 18 + i * rowH;
          const raw = Math.abs(Number(item.value) || 0);
          const t = invert && max !== min
            ? (max - raw) / Math.max(0.001, max - min)
            : raw / max;
          const x = left + t * (right - left);
          return (
            <g key={`${title}-${item.id || item.label}-${i}`}>
              <line x1={left} x2={right} y1={y} y2={y} stroke={theme.cardBorder} strokeWidth="2" />
              <line x1={left} x2={x} y1={y} y2={y} stroke={color} strokeWidth="2.8" />
              <circle cx={x} cy={y} r="6.5" fill={color} stroke={theme.cardBg} strokeWidth="2" />
              <text x={left} y={y - (item.sub ? 10 : 9)} fill={theme.textHeading} fontSize="10" fontWeight="700">
                {String(item.label || '').slice(0, 32)}
              </text>
              {item.sub ? (
                <text x={left} y={y + 2} fill={theme.textMuted} fontSize="9" fontWeight="600">
                  {String(item.sub).slice(0, 36)}
                </text>
              ) : null}
              <text x={right + 8} y={y + (item.sub ? 2 : 3)} fill={color} fontSize="11" fontWeight="800">
                {valueFmt ? valueFmt(item.value) : item.value}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Heat ladder for HR efforts — bar tinted by shoe, value heat as text cue */
export function ShoeHrLadder({ title, items = [], theme, valueFmt }) {
  const rows = (items || []).slice(0, 8);
  if (!rows.length) {
    return (
      <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: no tagged race-band runs yet.
      </div>
    );
  }
  const max = Math.max(...rows.map((r) => Number(r.value) || 0), 1);

  return (
    <div style={{ padding: 14, borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map((item, i) => {
          const value = Number(item.value) || 0;
          const width = Math.max(8, (value / max) * 100);
          const color = getShoeColor(item.shoeId, '#fb7185');
          return (
            <div key={`${item.id || item.label}-${i}`} style={{ display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.textHeading, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                  #{i + 1} {item.label}
                </span>
                <span style={{ color, fontWeight: 800, flexShrink: 0 }}>{valueFmt ? valueFmt(value) : value}</span>
              </div>
              <div style={{ height: 14, borderRadius: 8, background: 'rgba(148,163,184,0.12)', overflow: 'hidden' }}>
                <div style={{
                  width: `${width}%`,
                  height: '100%',
                  borderRadius: 8,
                  background: `linear-gradient(90deg, ${color}66, ${color})`,
                }}
                />
              </div>
              {item.sub ? <div style={{ fontSize: 10, color: theme.textMuted }}>{item.sub}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Grouped columns for race-band avg speeds — fill by shoe color */
export function ShoeSpeedColumns({ title, bands = [], theme }) {
  const series = (bands || []).filter((b) => Array.isArray(b.items) && b.items.length);
  if (!series.length) {
    return (
      <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: tag more 5 / 10 / 20 km runs.
      </div>
    );
  }

  const flat = series.flatMap((band, bi) => band.items.slice(0, 3).map((item, ii) => ({
    ...item,
    bandLabel: band.label,
    color: getShoeColor(item.shoeId, theme.orange || '#f97316'),
    key: `${band.label}-${item.shoeId || item.id || ii}-${bi}`,
  })));
  const max = Math.max(...flat.map((r) => Number(r.value) || 0), 0.01);
  const w = Math.max(300, flat.length * 42);
  const h = 150;
  const pad = { t: 22, r: 8, b: 36, l: 8 };
  const slot = (w - pad.l - pad.r) / flat.length;
  const barW = Math.min(26, slot * 0.55);

  const legendShoes = [];
  const seen = new Set();
  flat.forEach((item) => {
    if (!item.shoeId || seen.has(item.shoeId)) return;
    seen.add(item.shoeId);
    legendShoes.push({
      id: item.shoeId,
      label: item.shoeLabel || String(item.label || '').split('·').pop()?.trim() || 'Shoe',
      color: item.color,
    });
  });

  return (
    <div style={{ padding: 14, borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {legendShoes.slice(0, 6).map((shoe) => (
            <span key={shoe.id} style={{ fontSize: 10, fontWeight: 700, color: shoe.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: shoe.color }} />
              {String(shoe.label).slice(0, 12)}
            </span>
          ))}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', minWidth: 280, height: h, display: 'block' }}>
          {flat.map((item, i) => {
            const value = Number(item.value) || 0;
            const barH = Math.max(6, (value / max) * (h - pad.t - pad.b));
            const x = pad.l + i * slot + (slot - barW) / 2;
            const y = h - pad.b - barH;
            return (
              <g key={item.key}>
                <rect x={x} y={y} width={barW} height={barH} rx="6" fill={item.color} opacity={0.92} />
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fill={item.color} fontSize="9" fontWeight="800">
                  {value}
                </text>
                <text x={x + barW / 2} y={h - 18} textAnchor="middle" fill={theme.textMuted} fontSize="8">
                  {String(item.shoeLabel || item.label || '').slice(0, 8)}
                </text>
                <text x={x + barW / 2} y={h - 6} textAnchor="middle" fill={theme.textMuted} fontSize="8" fontWeight="700">
                  {item.bandLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function ShoeMixChart({ shoeStats = [], theme }) {
  return <ShoeDonutShare shoeStats={shoeStats} theme={theme} title="Distance share by shoe" />;
}
