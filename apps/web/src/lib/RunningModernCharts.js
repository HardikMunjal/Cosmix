import { useMemo } from 'react';
import { hrEffortColor, hrZoneForBpm, hrZoneLegend, buildSmoothColorSegments, smoothAreaPath, smoothLinePath } from './hrZones';
import { getShoeColor } from './runningShoes';

/** Soft legend colors — readable, not neon. */
const LEGEND_SOFT = {
  recovery: '#94a3b8',
  fat: '#6fbf8a',
  aerobic: '#6eb8c9',
  threshold: '#d4b86a',
  max: '#d48a96',
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
        const color = item.color || getShoeColor(item.shoeId, accent);
        return (
          <div key={`${item.label}-${index}`} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 11 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.textSecondary, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: color, flexShrink: 0 }} />
                {item.label}
              </span>
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
export function GlowTrend({
  title,
  subtitle,
  points = [],
  theme,
  accent,
  valueFmt,
  maxHr,
  showHrZones = false,
}) {
  const series = useMemo(() => points.filter((p) => Number(p.y) > 0), [points]);
  const hasHr = showHrZones || series.some((p) => Number(p.hr) > 0);
  const ceiling = Number(maxHr) || Math.max(...series.map((p) => Number(p.maxHr) || 0), 190);
  const legend = hasHr ? hrZoneLegend(ceiling) : [];

  if (series.length < 2) {
    return (
      <div style={{ padding: 14, borderRadius: 20, border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: not enough points yet
      </div>
    );
  }
  const w = 360;
  const h = 140;
  const pad = 14;
  const ys = series.map((p) => Number(p.y));
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(0.001, max - min);
  const baseY = h - pad;
  const coords = series.map((p, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((Number(p.y) - min) / span) * (h - pad * 2);
    const color = Number(p.hr) > 0
      ? hrEffortColor(p.hr, p.maxHr || ceiling, accent)
      : accent;
    return {
      x,
      y,
      color,
      zone: Number(p.hr) > 0 ? hrZoneForBpm(p.hr, p.maxHr || ceiling) : null,
      hr: Number(p.hr) || null,
    };
  });
  const line = smoothLinePath(coords, 14);
  const area = smoothAreaPath(coords, baseY, 14);
  const latest = series[series.length - 1];
  const first = series[0];
  const delta = Number(latest.y) - Number(first.y);
  const gid = `glow-${String(accent).replace('#', '')}-${title.replace(/\W/g, '').slice(0, 12)}`;
  const midColor = coords[Math.floor(coords.length / 2)]?.color || accent;
  const smoothSegs = hasHr ? buildSmoothColorSegments(coords, 14) : [];

  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
      display: 'grid',
      gap: 10,
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
          {subtitle ? (
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 1.4 }}>{subtitle}</div>
          ) : null}
        </div>
        <div style={{ fontSize: 11, color: delta <= 0 ? theme.green : theme.orange, fontWeight: 800, flexShrink: 0 }}>
          {delta > 0 ? '+' : ''}{valueFmt ? valueFmt(delta) : delta.toFixed(2)}
        </div>
      </div>
      {hasHr && !subtitle ? (
        <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
          Line color follows heart rate from easy to hard.
        </div>
      ) : null}
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 140, display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hasHr ? midColor : accent} stopOpacity="0.42" />
            <stop offset="100%" stopColor={hasHr ? midColor : accent} stopOpacity="0.02" />
          </linearGradient>
          {hasHr ? (
            <linearGradient id={`${gid}-h`} x1="0" y1="0" x2="1" y2="0">
              {coords.map((c, i) => (
                <stop
                  key={`hs-${i}`}
                  offset={`${(i / Math.max(1, coords.length - 1)) * 100}%`}
                  stopColor={c.color}
                  stopOpacity="0.2"
                />
              ))}
            </linearGradient>
          ) : null}
          <filter id={`${gid}-blur`}>
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        {hasHr ? <path d={area} fill={`url(#${gid}-h)`} /> : null}
        {hasHr ? (
          smoothSegs.map((seg, i) => (
            <path
              key={`seg-${i}`}
              d={seg.d}
              fill="none"
              stroke={seg.color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        ) : (
          <>
            <path d={line} fill="none" stroke={accent} strokeWidth="4" opacity="0.3" filter={`url(#${gid}-blur)`} />
            <path d={line} fill="none" stroke={accent} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          </>
        )}
      </svg>
      {hasHr ? (
        <HrEffortLegend theme={theme} legend={legend} />
      ) : null}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.textMuted }}>
        <span>{first.label || ''}</span>
        <span>{valueFmt ? valueFmt(latest.y) : latest.y} now</span>
        <span>{latest.label || ''}</span>
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
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = rows.map((row) => {
    const frac = Number(row.totalKm || 0) / total;
    const len = frac * c;
    const dash = `${len} ${c - len}`;
    const color = getShoeColor(row.shoeId, theme.orange);
    const item = { ...row, dash, offset, color, pct: Math.round(frac * 100) };
    offset += len;
    return item;
  });

  return (
    <div style={{ padding: 14, borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
        <svg viewBox="0 0 140 140" style={{ width: 140, height: 140 }}>
          <circle cx="70" cy="70" r={r} fill="none" stroke={theme.cardBorder} strokeWidth="16" />
          {arcs.map((arc) => (
            <circle
              key={arc.shoeId || arc.label}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={arc.color}
              strokeWidth="16"
              strokeDasharray={arc.dash}
              strokeDashoffset={-arc.offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            />
          ))}
          <text x="70" y="68" textAnchor="middle" fill={theme.textHeading} fontSize="16" fontWeight="800">{total.toFixed(0)}</text>
          <text x="70" y="86" textAnchor="middle" fill={theme.textMuted} fontSize="10">km</text>
        </svg>
        <div style={{ display: 'grid', gap: 8 }}>
          {arcs.map((arc) => (
            <div key={arc.shoeId || arc.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: theme.textSecondary, fontWeight: 700, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: arc.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{arc.label}</span>
              </span>
              <span style={{ color: arc.color, fontWeight: 800, flexShrink: 0, textAlign: 'right' }}>
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

/** Lollipop / stem chart — colored by shoe id (stable across all shoe charts) */
export function ShoeLollipopChart({
  title,
  items = [],
  theme,
  accent,
  valueFmt,
  invert = false,
}) {
  const rows = (items || []).slice(0, 8);
  if (!rows.length) {
    return (
      <div style={{ padding: 12, borderRadius: 14, border: `1px solid ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: not enough tagged runs yet.
      </div>
    );
  }
  const values = rows.map((r) => Math.abs(Number(r.value) || 0));
  const max = Math.max(...values, 0.01);
  const min = Math.min(...values);
  const w = 340;
  const rowH = 30;
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
    <div style={{ padding: 14, borderRadius: 20, background: theme.cardBg, border: `1px solid ${theme.cardBorder}`, display: 'grid', gap: 8 }}>
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
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }}>
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
              <text x={left} y={y - 9} fill={theme.textHeading} fontSize="10" fontWeight="700">
                {String(item.label || '').slice(0, 28)}
              </text>
              <text x={right + 8} y={y + 3} fill={color} fontSize="11" fontWeight="800">
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
