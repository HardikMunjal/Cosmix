/** Standard 5-zone HR model vs estimated max HR. */
export const HR_ZONES = [
  { id: 1, key: 'recovery', label: 'Recovery', short: 'Z1', minPct: 0, maxPct: 0.6, color: '#94a3b8' },
  { id: 2, key: 'fat', label: 'Fat burning', short: 'Z2', minPct: 0.6, maxPct: 0.7, color: '#22c55e' },
  { id: 3, key: 'aerobic', label: 'Aerobic', short: 'Z3', minPct: 0.7, maxPct: 0.8, color: '#38bdf8' },
  { id: 4, key: 'threshold', label: 'Threshold', short: 'Z4', minPct: 0.8, maxPct: 0.9, color: '#f59e0b' },
  { id: 5, key: 'max', label: 'Max', short: 'Z5', minPct: 0.9, maxPct: 1.05, color: '#ef4444' },
];

/** Continuous effort spectrum — blends slowly green → cyan → amber → red. */
const EFFORT_STOPS = [
  { at: 0.50, color: '#86efac' },
  { at: 0.60, color: '#22c55e' },
  { at: 0.68, color: '#4ade80' },
  { at: 0.74, color: '#38bdf8' },
  { at: 0.80, color: '#60a5fa' },
  { at: 0.86, color: '#f59e0b' },
  { at: 0.92, color: '#f97316' },
  { at: 1.00, color: '#ef4444' },
];

export function resolveMaxHr(maxHr) {
  const n = Number(maxHr);
  return Number.isFinite(n) && n >= 120 ? n : 190;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return [148, 163, 184];
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb) {
  return `#${rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

export function lerpColor(a, b, t) {
  const u = clamp(Number(t) || 0, 0, 1);
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([
    A[0] + (B[0] - A[0]) * u,
    A[1] + (B[1] - A[1]) * u,
    A[2] + (B[2] - A[2]) * u,
  ]);
}

/** Smooth HR color from low (green) → high (red), not hard zone jumps. */
export function hrEffortColor(bpm, maxHr = 190, fallback = '#94a3b8') {
  const value = Number(bpm) || 0;
  if (value <= 0) return fallback;
  const ratio = clamp(value / resolveMaxHr(maxHr), EFFORT_STOPS[0].at, EFFORT_STOPS[EFFORT_STOPS.length - 1].at);
  for (let i = 1; i < EFFORT_STOPS.length; i += 1) {
    const prev = EFFORT_STOPS[i - 1];
    const next = EFFORT_STOPS[i];
    if (ratio <= next.at) {
      const t = (ratio - prev.at) / Math.max(0.0001, next.at - prev.at);
      return lerpColor(prev.color, next.color, t);
    }
  }
  return EFFORT_STOPS[EFFORT_STOPS.length - 1].color;
}

/**
 * Catmull-Rom sample so the pace line curves smoothly through points.
 */
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1)
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/** Dense points along a smooth curve through coords (with lerped colors). */
export function sampleSmoothCurve(coords = [], samplesPerEdge = 14) {
  if (!coords.length) return [];
  if (coords.length === 1) return [{ ...coords[0] }];
  const steps = Math.max(6, Math.round(samplesPerEdge));
  const out = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const c0 = coords[i - 1] || coords[i];
    const c1 = coords[i];
    const c2 = coords[i + 1];
    const c3 = coords[i + 2] || c2;
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps;
      out.push({
        x: catmullRom(c0.x, c1.x, c2.x, c3.x, t),
        y: catmullRom(c0.y, c1.y, c2.y, c3.y, t),
        color: lerpColor(c1.color || '#94a3b8', c2.color || '#94a3b8', t),
      });
    }
  }
  out.push({ ...coords[coords.length - 1] });
  return out;
}

export function smoothLinePath(coords = [], samplesPerEdge = 14) {
  const sampled = sampleSmoothCurve(coords, samplesPerEdge);
  if (!sampled.length) return '';
  return sampled.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
}

export function smoothAreaPath(coords = [], baseY, samplesPerEdge = 14) {
  const sampled = sampleSmoothCurve(coords, samplesPerEdge);
  if (!sampled.length) return '';
  const line = sampled.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
  return `${line} L${sampled[sampled.length - 1].x.toFixed(2)},${baseY} L${sampled[0].x.toFixed(2)},${baseY} Z`;
}

/**
 * Short strokes along a smooth curve with gradually blended colors.
 */
export function buildSmoothColorSegments(coords = [], stepsPerEdge = 14) {
  const sampled = sampleSmoothCurve(coords, stepsPerEdge);
  const segs = [];
  for (let i = 0; i < sampled.length - 1; i += 1) {
    const a = sampled[i];
    const b = sampled[i + 1];
    segs.push({
      d: `M${a.x.toFixed(2)},${a.y.toFixed(2)} L${b.x.toFixed(2)},${b.y.toFixed(2)}`,
      color: lerpColor(a.color || '#94a3b8', b.color || '#94a3b8', 0.5),
    });
  }
  return segs;
}

export function hrZoneForBpm(bpm, maxHr = 190) {
  const value = Number(bpm) || 0;
  if (value <= 0) {
    return { ...HR_ZONES[0], color: '#64748b', ratio: 0, bpm: 0 };
  }
  const ceiling = resolveMaxHr(maxHr);
  const ratio = value / ceiling;
  const zone = HR_ZONES.find((z) => ratio >= z.minPct && ratio < z.maxPct) || HR_ZONES[HR_ZONES.length - 1];
  return {
    ...zone,
    // Prefer continuous effort color for drawing; keep zone metadata for labels
    color: hrEffortColor(value, ceiling, zone.color),
    zoneColor: zone.color,
    ratio,
    bpm: value,
    ceiling,
  };
}

export function hrZoneColor(bpm, maxHr = 190) {
  return hrEffortColor(bpm, maxHr);
}

export function hrZoneLegend(maxHr = 190) {
  const ceiling = resolveMaxHr(maxHr);
  return HR_ZONES.map((zone) => ({
    ...zone,
    rangeLabel: zone.id === 5
      ? `${Math.round(ceiling * zone.minPct)}+ bpm`
      : `${Math.round(ceiling * zone.minPct)}–${Math.round(ceiling * zone.maxPct) - 1} bpm`,
  }));
}
