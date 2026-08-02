import { useMemo } from 'react';

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
        return (
          <div key={`${item.label}-${index}`} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4, fontSize: 11 }}>
              <span style={{ color: theme.textSecondary, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              <span style={{ color: accent, fontWeight: 800, flexShrink: 0 }}>{item.value}{unit}</span>
            </div>
            <div style={{ height: 14, borderRadius: 8, background: theme.cardBorder, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${pct}%`,
                height: '100%',
                borderRadius: 8,
                background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
                boxShadow: `inset 0 -3px 0 ${accent}55, 0 4px 10px ${accent}33`,
              }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Smooth area polyline with glow */
export function GlowTrend({ title, points = [], theme, accent, valueFmt }) {
  const series = useMemo(() => points.filter((p) => Number(p.y) > 0), [points]);
  if (series.length < 2) {
    return (
      <div style={{ padding: 14, borderRadius: 20, border: `1px dashed ${theme.cardBorder}`, color: theme.textMuted, fontSize: 12 }}>
        {title}: not enough points yet
      </div>
    );
  }
  const w = 360;
  const h = 130;
  const pad = 14;
  const ys = series.map((p) => Number(p.y));
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = Math.max(0.001, max - min);
  const coords = series.map((p, i) => {
    const x = pad + (i / (series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((Number(p.y) - min) / span) * (h - pad * 2);
    return [x, y];
  });
  const line = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0]},${c[1]}`).join(' ');
  const area = `${line} L${coords[coords.length - 1][0]},${h - pad} L${coords[0][0]},${h - pad} Z`;
  const latest = series[series.length - 1];
  const first = series[0];
  const delta = Number(latest.y) - Number(first.y);
  const gid = `glow-${String(accent).replace('#', '')}-${title.replace(/\W/g, '').slice(0, 12)}`;

  return (
    <div style={{
      padding: 14,
      borderRadius: 20,
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: theme.chartDepth,
      overflow: 'hidden',
      minWidth: 0,
    }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>{title}</div>
        <div style={{ fontSize: 11, color: delta <= 0 ? theme.green : theme.orange, fontWeight: 800 }}>
          {delta > 0 ? '+' : ''}{valueFmt ? valueFmt(delta) : delta.toFixed(2)}
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 130, display: 'block' }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
          <filter id={`${gid}-blur`}>
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={accent} strokeWidth="4" opacity="0.35" filter={`url(#${gid}-blur)`} />
        <path d={line} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c[0]} cy={c[1]} r="3" fill={theme.cardBg} stroke={accent} strokeWidth="2" />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: theme.textMuted }}>
        <span>{first.label || ''}</span>
        <span>{valueFmt ? valueFmt(latest.y) : latest.y} now</span>
        <span>{latest.label || ''}</span>
      </div>
    </div>
  );
}

export function ShoeMixChart({ shoeStats = [], theme }) {
  const rows = (shoeStats || []).filter((s) => s.runs > 0 || s.totalKm > 0).slice(0, 6);
  const max = Math.max(...rows.map((r) => Number(r.totalKm) || 0), 1);
  const colors = [theme.orange, theme.blue, theme.cyan, theme.green, theme.purple, theme.emerald];
  if (!rows.length) {
    return <div style={{ padding: 14, color: theme.textMuted, fontSize: 12 }}>Tag runs with shoes to unlock wear charts.</div>;
  }
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <DepthHBars
        title="Distance by shoe (km)"
        theme={theme}
        accent={theme.orange}
        items={rows.map((r) => ({ label: String(r.label || r.name || 'Shoe').slice(0, 18), value: Number(r.totalKm || 0).toFixed(1) }))}
      />
      <div style={{
        padding: 14,
        borderRadius: 20,
        background: theme.cardBg,
        border: `1px solid ${theme.cardBorder}`,
        boxShadow: theme.chartDepth,
        display: 'grid',
        gap: 10,
        overflow: 'hidden',
        minWidth: 0,
      }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, color: theme.textHeading }}>Wear share</div>
        {rows.map((row, i) => {
          const pct = Math.round((Number(row.totalKm || 0) / max) * 100);
          return (
            <div key={row.shoeId || row.label} style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: theme.textSecondary, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                <span style={{ color: colors[i % colors.length], fontWeight: 800, flexShrink: 0 }}>{row.totalKm} km · {row.runs} runs</span>
              </div>
              <div style={{ height: 12, borderRadius: 8, background: theme.cardBorder, overflow: 'hidden' }}>
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: 8,
                  background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}88)`,
                }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
