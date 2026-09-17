/**
 * Cosmix branded run share reel — canvas animation of route + moving marker + analytics.
 * Outputs WebM (or mp4 where supported) for Instagram / WhatsApp share.
 */

export const SHARE_THEMES = [
  { id: 'cosmos', label: 'Cosmos', hint: 'Night sky', from: '#082f49', to: '#020617' },
  { id: 'dusk', label: 'Dusk', hint: 'Sunset glow', from: '#4c0519', to: '#1c0b16' },
  { id: 'midnight', label: 'Midnight', hint: 'Quiet dark', from: '#020617', to: '#0b1220' },
];

export const MAP_STYLES = [
  { id: 'satellite3d', label: '3D satellite', hint: 'Tilted earth' },
  { id: 'satellite', label: 'Satellite', hint: 'Flat photo' },
  { id: 'streets', label: 'Streets', hint: 'Normal map' },
  { id: 'space', label: 'Space roads', hint: 'Neon cosmos' },
];

export const MAP_COLORS = [
  { id: 'original', label: 'Natural', swatch: '#64748b' },
  { id: 'ember', label: 'Ember', swatch: '#f97316' },
  { id: 'cyan', label: 'Cyan', swatch: '#22d3ee' },
  { id: 'violet', label: 'Violet', swatch: '#a78bfa' },
  { id: 'lime', label: 'Lime', swatch: '#a3e635' },
];

export const SIZE_STEPS = [
  { id: 'small', label: 'S' },
  { id: 'medium', label: 'M' },
  { id: 'large', label: 'L' },
];

export const LOGO_PLACES = [
  { id: 'top', label: 'Top' },
  { id: 'background', label: 'Background' },
  { id: 'both', label: 'Both' },
];

export const SHARE_PRESETS = {
  story: {
    format: 'video',
    showLogo: true,
    showHero: true,
    showStats: true,
    showSplits: true,
    showMap: true,
    showPlace: true,
    showAthlete: true,
    showRunner: true,
    showTitle: true,
  },
  map: {
    format: 'video',
    showLogo: true,
    showHero: true,
    showStats: false,
    showSplits: false,
    showMap: true,
    showPlace: true,
    showAthlete: false,
    showRunner: true,
    showTitle: true,
  },
  stats: {
    format: 'photo',
    showLogo: true,
    showHero: true,
    showStats: true,
    showSplits: true,
    showMap: false,
    showPlace: true,
    showAthlete: true,
    showRunner: false,
    showTitle: true,
  },
};

export const DEFAULT_SHARE_OPTIONS = {
  format: 'video',
  theme: 'cosmos',
  showLogo: true,
  showHero: true,
  showStats: true,
  showSplits: false,
  showMap: true,
  showPlace: true,
  showAthlete: true,
  showRunner: true,
  showTitle: true,
  logoSize: 'large',
  textSize: 'medium',
  mapStyle: 'satellite3d',
  mapColor: 'original',
  logoPlace: 'top',
};

const SHARE_BOOL_KEYS = [
  'showLogo', 'showHero', 'showStats', 'showSplits', 'showMap',
  'showPlace', 'showAthlete', 'showRunner', 'showTitle',
];

function pickEnum(value, list, fallback) {
  return list.some((item) => item.id === value) ? value : fallback;
}

export function normalizeShareOptions(options = {}) {
  const next = { ...DEFAULT_SHARE_OPTIONS, ...(options || {}) };
  next.format = next.format === 'photo' ? 'photo' : 'video';
  next.theme = pickEnum(next.theme, SHARE_THEMES, 'cosmos');
  next.mapStyle = pickEnum(next.mapStyle, MAP_STYLES, 'satellite3d');
  next.mapColor = pickEnum(next.mapColor, MAP_COLORS, 'original');
  next.logoSize = pickEnum(next.logoSize, SIZE_STEPS, 'large');
  next.textSize = pickEnum(next.textSize, SIZE_STEPS, 'medium');
  next.logoPlace = pickEnum(next.logoPlace, LOGO_PLACES, 'top');
  SHARE_BOOL_KEYS.forEach((key) => {
    next[key] = Boolean(next[key]);
  });
  return next;
}

export function sizeMultiplier(step, { small = 0.78, medium = 1, large = 1.28 } = {}) {
  if (step === 'small') return small;
  if (step === 'large') return large;
  return medium;
}

export function friendlyShareError(error) {
  const msg = String(error?.message || error || '');
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Could not reach Cosmix. Try again in a moment.';
  }
  return msg || 'Share failed';
}

function shareFetch(url, extra = {}) {
  const opts = { ...(extra || {}) };
  if (typeof window !== 'undefined') {
    try {
      const target = new URL(url, window.location.origin);
      opts.credentials = target.origin === window.location.origin ? 'include' : 'omit';
    } catch (_) {
      opts.credentials = 'omit';
    }
  }
  return fetch(url, opts);
}

function fmtPace(minPerKm) {
  if (!minPerKm || !Number.isFinite(minPerKm) || minPerKm <= 0) return '--';
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function fmtMins(mins) {
  const total = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function easeOutCubic(t) {
  return 1 - ((1 - t) ** 3);
}

function latLngToMercator(lat, lng) {
  const mx = (lng + 180) / 360;
  const sinLat = Math.sin((clamp(lat, -85.05, 85.05) * Math.PI) / 180);
  const my = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return { mx, my };
}

function downsamplePoints(points) {
  if (points.length <= 600) return points;
  const step = Math.ceil(points.length / 500);
  return points.filter((_, i) => i % step === 0 || i === points.length - 1);
}

/**
 * Web-Mercator projection so satellite tiles line up with the GPS track.
 */
export function buildRouteProjection(polyline = [], width, height, pad = 48) {
  const points = (polyline || [])
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null))
    .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (points.length < 2) {
    return { coords: [], width, height, pad, scale: 1, originMX: 0, originMY: 0, spanMX: 1, spanMY: 1, offsetX: 0, offsetY: 0 };
  }

  const pts = downsamplePoints(points);
  const merc = pts.map(([lat, lng]) => ({ lat, lng, ...latLngToMercator(lat, lng) }));
  const mxs = merc.map((p) => p.mx);
  const mys = merc.map((p) => p.my);
  const minMX = Math.min(...mxs);
  const maxMX = Math.max(...mxs);
  const minMY = Math.min(...mys);
  const maxMY = Math.max(...mys);
  const mxPad = Math.max(8e-8, (maxMX - minMX) * 0.22);
  const myPad = Math.max(8e-8, (maxMY - minMY) * 0.22);
  const originMX = minMX - mxPad;
  const originMY = minMY - myPad;
  const spanMX = Math.max(1e-8, (maxMX - minMX) + mxPad * 2);
  const spanMY = Math.max(1e-8, (maxMY - minMY) + myPad * 2);
  const usableW = Math.max(40, width - pad * 2);
  const usableH = Math.max(40, height - pad * 2);
  const scale = Math.min(usableW / spanMX, usableH / spanMY);
  const offsetX = (width - spanMX * scale) / 2;
  const offsetY = (height - spanMY * scale) / 2;

  const coords = merc.map((p) => ({
    x: offsetX + (p.mx - originMX) * scale,
    y: offsetY + (p.my - originMY) * scale,
    lat: p.lat,
    lng: p.lng,
  }));

  return {
    coords, width, height, pad, scale, originMX, originMY, spanMX, spanMY, offsetX, offsetY,
  };
}

/**
 * Fit [[lat,lng]] fully inside a box, centered on the run bounds.
 */
export function projectPolyline(polyline = [], width, height, pad = 48) {
  return buildRouteProjection(polyline, width, height, pad).coords;
}

function loadTileImage(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

const MAP_TILT = 0.24;

function pickTileZoom(proj) {
  const world = 256;
  const zx = Math.log2(proj.width / (proj.spanMX * world));
  const zy = Math.log2(proj.height / (proj.spanMY * world));
  return Math.round(clamp(Math.min(zx, zy), 13, 16));
}

function projectPointPerspective(x, y, w, h, tilt = MAP_TILT) {
  const u = w ? x / w : 0;
  const v = h ? y / h : 0;
  const topW = w * (1 - tilt);
  const rowW = topW + (w - topW) * v;
  return {
    x: (w - rowW) / 2 + u * rowW,
    y,
  };
}

function warpMapToPerspective(src, tilt = MAP_TILT) {
  if (!src || typeof document === 'undefined') return src;
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, w, h);
  const slices = Math.min(200, Math.max(90, Math.round(h / 3)));
  for (let i = 0; i < slices; i += 1) {
    const t = i / slices;
    const srcY = t * h;
    const srcH = h / slices + 1.6;
    const rowW = w * (1 - tilt) + w * tilt * t;
    const dx = (w - rowW) / 2;
    ctx.drawImage(src, 0, srcY, w, srcH, dx, t * h, rowW, h / slices + 1.1);
  }
  return out;
}

function drawProceduralTerrain(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#7eb6d9');
  sky.addColorStop(0.28, '#cfe8c6');
  sky.addColorStop(0.62, '#8fbc6b');
  sky.addColorStop(1, '#c4a574');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 18; i += 1) {
    const seed = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const n = seed - Math.floor(seed);
    const x = (n * 0.84 + 0.08) * width;
    const y = (0.34 + ((n * 7) % 1) * 0.52) * height;
    const rx = 28 + n * 90;
    const ry = 16 + n * 40;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, n * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = n > 0.55 ? 'rgba(56, 140, 196, 0.42)' : 'rgba(62, 120, 58, 0.28)';
    ctx.fill();
  }
}

function applyMapColor(ctx, width, height, color = 'original') {
  if (!color || color === 'original') return;
  const tint = {
    ember: 'rgba(249,115,22,0.34)',
    cyan: 'rgba(34,211,238,0.32)',
    violet: 'rgba(167,139,250,0.36)',
    lime: 'rgba(163,230,53,0.28)',
  }[color];
  if (!tint) return;
  ctx.save();
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawSpaceGrid(ctx, width, height) {
  drawStarfield(ctx, width, height, 0, { density: 96, nebula: true, theme: 'cosmos' });
  const vanishY = height * 0.18;
  ctx.strokeStyle = 'rgba(103,232,249,0.2)';
  ctx.lineWidth = 1.1;
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    const y = vanishY + (height - vanishY) * (t * t);
    const inset = (1 - t) * width * 0.32;
    ctx.beginPath();
    ctx.moveTo(inset, y);
    ctx.lineTo(width - inset, y);
    ctx.stroke();
  }
  for (let i = -10; i <= 10; i += 1) {
    ctx.beginPath();
    ctx.moveTo(width / 2 + i * 38, height);
    ctx.lineTo(width / 2 + i * 7, vanishY);
    ctx.stroke();
  }
}

function finishMapCanvas(canvas, { tilt = true, color = 'original', space = false } = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  applyMapColor(ctx, w, h, color);
  if (space) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createLinearGradient(0, 0, w, h);
    glow.addColorStop(0, 'rgba(56,189,248,0.18)');
    glow.addColorStop(1, 'rgba(249,115,22,0.12)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  return tilt ? warpMapToPerspective(canvas) : canvas;
}

/**
 * Satellite, streets, or space-roads backdrop aligned to the route.
 */
export async function loadRouteMapBackdrop(polyline, width, height, pad = 48, mapOptions = {}) {
  if (typeof document === 'undefined') return null;
  const style = mapOptions.style || 'satellite3d';
  const color = mapOptions.color || 'original';
  const tilt = style === 'satellite3d' || style === 'space';
  const space = style === 'space';
  const tileSrc = style === 'streets' ? 'carto' : space ? 'dark' : 'esri';
  const proj = buildRouteProjection(polyline, width, height, pad);
  if (proj.coords.length < 2) return null;

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (space) drawSpaceGrid(ctx, canvas.width, canvas.height);
  else drawProceduralTerrain(ctx, canvas.width, canvas.height);

  let z = pickTileZoom(proj);
  const tileList = (zoom) => {
    const world = 2 ** zoom;
    const x0 = clamp(Math.floor(proj.originMX * world) - 1, 0, world - 1);
    const x1 = clamp(Math.floor((proj.originMX + proj.spanMX) * world) + 1, 0, world - 1);
    const y0 = clamp(Math.floor(proj.originMY * world) - 1, 0, world - 1);
    const y1 = clamp(Math.floor((proj.originMY + proj.spanMY) * world) + 1, 0, world - 1);
    const list = [];
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        list.push({ x, y, z: zoom });
      }
    }
    return list;
  };
  let tiles = tileList(z);
  while (tiles.length > 24 && z > 12) {
    z -= 1;
    tiles = tileList(z);
  }
  const n = 2 ** z;
  const done = (c) => finishMapCanvas(c, { tilt, color, space });
  if (tiles.length > 36) {
    return done(canvas);
  }

  const trySrc = async (src) => {
    const loaded = [];
    const batchSize = 6;
    for (let i = 0; i < tiles.length; i += batchSize) {
      const batch = tiles.slice(i, i + batchSize);
      const part = await Promise.all(batch.map(async (tile) => {
        const img = await loadTileImage(`/api/map-tile?src=${src}&z=${tile.z}&x=${tile.x}&y=${tile.y}`);
        return img ? { ...tile, img } : null;
      }));
      loaded.push(...part.filter(Boolean));
    }
    return loaded;
  };

  let ready = await trySrc(tileSrc);
  if (ready.length < Math.max(1, Math.floor(tiles.length * 0.35)) && tileSrc !== 'esri') {
    ready = await trySrc('esri');
  }
  if (!ready.length) return done(canvas);

  if (space) ctx.globalAlpha = 0.46;
  ready.forEach((tile) => {
    const mx0 = tile.x / n;
    const my0 = tile.y / n;
    const mx1 = (tile.x + 1) / n;
    const my1 = (tile.y + 1) / n;
    const dx = proj.offsetX + (mx0 - proj.originMX) * proj.scale;
    const dy = proj.offsetY + (my0 - proj.originMY) * proj.scale;
    const dw = (mx1 - mx0) * proj.scale;
    const dh = (my1 - my0) * proj.scale;
    ctx.drawImage(tile.img, dx - 0.6, dy - 0.6, dw + 1.2, dh + 1.2);
  });
  ctx.globalAlpha = 1;

  if (!space) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const sun = ctx.createLinearGradient(0, 0, w, h);
    sun.addColorStop(0, 'rgba(255, 236, 200, 0.42)');
    sun.addColorStop(0.4, 'rgba(255,255,255,0.08)');
    sun.addColorStop(1, 'rgba(12, 28, 56, 0.28)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.save();
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.12, w * 0.5, h * 0.5, w * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(2, 8, 20, 0.38)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  return done(canvas);
}

function hash01(i) {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function themePalette(theme = 'cosmos') {
  if (theme === 'dusk') {
    return {
      bg: '#1c0b16',
      nebulaA: 'rgba(244, 63, 94, 0.26)',
      nebulaB: 'rgba(251, 146, 60, 0.2)',
      nebula: true,
    };
  }
  if (theme === 'midnight') {
    return {
      bg: '#020617',
      nebulaA: 'rgba(51, 65, 85, 0.22)',
      nebulaB: 'rgba(15, 23, 42, 0.18)',
      nebula: true,
    };
  }
  return {
    bg: '#020617',
    nebulaA: 'rgba(14, 116, 144, 0.28)',
    nebulaB: 'rgba(194, 65, 12, 0.2)',
    nebula: true,
  };
}

function drawStarfield(ctx, width, height, clockMs, { density = 72, nebula = true, theme = 'cosmos' } = {}) {
  const t = clockMs / 1000;
  const palette = themePalette(theme);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  if (nebula && palette.nebula) {
    const a = ctx.createRadialGradient(width * 0.18, height * 0.12, 8, width * 0.18, height * 0.12, width * 0.55);
    a.addColorStop(0, palette.nebulaA);
    a.addColorStop(1, 'rgba(14, 116, 144, 0)');
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, width, height);
    const b = ctx.createRadialGradient(width * 0.88, height * 0.78, 8, width * 0.88, height * 0.78, width * 0.5);
    b.addColorStop(0, palette.nebulaB);
    b.addColorStop(1, 'rgba(194, 65, 12, 0)');
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, width, height);
  }

  for (let i = 0; i < density; i += 1) {
    const x = hash01(i + 1) * width;
    const y = hash01(i + 40) * height;
    const twinkle = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * (1.6 + hash01(i + 7) * 2.2) + i));
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = i % 8 === 0 ? '#67e8f9' : i % 6 === 0 ? '#fdba74' : '#e2e8f0';
    const sz = i % 13 === 0 ? 2.1 : 1.15;
    ctx.beginPath();
    ctx.arc(x, y, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRunnerFigure(ctx, runner, phase, s) {
  if (!runner) return;
  const swing = Math.sin(phase * Math.PI * 2);
  const u = clamp(Number(s) || 1.8, 1.1, 3.4);
  const bounce = Math.abs(Math.sin(phase * Math.PI * 2)) * 1.6 * u;
  ctx.save();
  ctx.translate(runner.x, runner.y - bounce - 10);
  ctx.rotate(runner.angle + Math.PI / 2);

  ctx.beginPath();
  ctx.arc(0, 3.2 * u, 5.4 * u, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(251,146,60,0.28)';
  ctx.fill();

  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.1 * u;
  ctx.beginPath();
  ctx.moveTo(0, 1.6 * u);
  ctx.lineTo(-2.8 * u * swing, 6.6 * u);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 1.6 * u);
  ctx.lineTo(2.8 * u * swing, 6.6 * u);
  ctx.stroke();

  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 2.6 * u;
  ctx.beginPath();
  ctx.moveTo(0, -2.8 * u);
  ctx.lineTo(0, 1.8 * u);
  ctx.stroke();

  ctx.lineWidth = 2.1 * u;
  ctx.beginPath();
  ctx.moveTo(0, -2 * u);
  ctx.lineTo(-2.9 * u * swing, 0.7 * u);
  ctx.moveTo(0, -2 * u);
  ctx.lineTo(2.9 * u * swing, 0.7 * u);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, -4.3 * u, 1.7 * u, 0, Math.PI * 2);
  ctx.fillStyle = '#fde68a';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 0.7 * u;
  ctx.stroke();
  ctx.restore();
}

function drawCosmixBrand(ctx, x, y, size, {
  spin = 0,
  pulse = 1,
  logoImage = null,
  wordmark = false,
  s = 1,
} = {}) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.translate(cx, cy);

  const glow = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r * 1.45 * pulse);
  glow.addColorStop(0, 'rgba(56,189,248,0.35)');
  glow.addColorStop(0.55, 'rgba(249,115,22,0.16)');
  glow.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.45 * pulse, 0, Math.PI * 2);
  ctx.fill();

  if (logoImage) {
    ctx.save();
    ctx.rotate(spin * 0.08);
    drawRoundedRect(ctx, -r, -r, size, size, size * 0.22);
    ctx.clip();
    ctx.drawImage(logoImage, -r, -r, size, size);
    ctx.restore();
  } else {
    drawUniverseMark(ctx, -r, -r, size, spin);
  }

  ctx.rotate(spin);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.78, r * 0.28, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(103,232,249,0.95)';
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r * 0.2, Math.PI / 3, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(253,186,116,0.85)';
  ctx.lineWidth = Math.max(1.4, size * 0.03);
  ctx.stroke();
  ctx.restore();

  if (wordmark) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.max(18, size * 0.42)}px system-ui, sans-serif`;
    ctx.fillText('COSMIX', x + size + 14 * s, y + size * 0.68);
  }
}

function drawCircleLogo(ctx, cx, cy, size, { logoImage = null } = {}) {
  const r = Math.max(8, size / 2);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (logoImage) {
    ctx.drawImage(logoImage, cx - r, cy - r, r * 2, r * 2);
  } else {
    drawUniverseMark(ctx, cx - r, cy - r, r * 2, 0);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 0.6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(125,211,252,0.7)';
  ctx.lineWidth = Math.max(1.2, size * 0.055);
  ctx.stroke();
  ctx.restore();
}

function drawRevolvingLogo(ctx, cx, cy, size, extras = {}) {
  drawCircleLogo(ctx, cx, cy, size, extras);
}

function pathLength(coords) {
  let len = 0;
  for (let i = 1; i < coords.length; i += 1) {
    const dx = coords[i].x - coords[i - 1].x;
    const dy = coords[i].y - coords[i - 1].y;
    len += Math.hypot(dx, dy);
  }
  return len || 1;
}

function pointAlong(coords, t) {
  if (!coords.length) return null;
  if (coords.length === 1 || t <= 0) return { ...coords[0], angle: 0 };
  if (t >= 1) {
    const a = coords[coords.length - 2];
    const b = coords[coords.length - 1];
    return { ...b, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  const total = pathLength(coords);
  let target = t * total;
  for (let i = 1; i < coords.length; i += 1) {
    const a = coords[i - 1];
    const b = coords[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
    if (target <= seg) {
      const u = target / seg;
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    target -= seg;
  }
  return { ...coords[coords.length - 1], angle: 0 };
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  // Prefer MP4 when available — WhatsApp / Instagram reject most WebM shares.
  const candidates = [
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
}

function isLikelyShareableVideo(mimeType = '') {
  const type = String(mimeType || '').toLowerCase();
  return type.includes('mp4') || type.includes('quicktime');
}

async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create share image'));
    }, 'image/png');
  });
}

async function tryShareFiles(files, { title, text } = {}) {
  if (typeof navigator === 'undefined' || !navigator.share) return { ok: false, reason: 'no-share' };
  const list = (files || []).filter(Boolean);
  if (!list.length) return { ok: false, reason: 'no-files' };
  try {
    if (navigator.canShare && !navigator.canShare({ files: list })) {
      return { ok: false, reason: 'cannot-share-files' };
    }
    await navigator.share({ files: list, title, text });
    return { ok: true, reason: 'shared' };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { ok: false, reason: 'cancelled', cancelled: true };
    }
    return { ok: false, reason: 'share-failed', detail: String(error?.message || error) };
  }
}

let ffmpegInstance = null;
let ffmpegLoadPromise = null;

async function getFfmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;
  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();
  try {
    return await ffmpegLoadPromise;
  } catch (error) {
    ffmpegLoadPromise = null;
    throw error;
  }
}

/**
 * WhatsApp / Instagram need MP4. Browsers usually record WebM — convert before share.
 */
export async function convertReelToMp4(blob, { onProgress } = {}) {
  if (!blob) throw new Error('No video to convert');
  onProgress?.('Preparing WhatsApp video…');
  const { fetchFile } = await import('@ffmpeg/util');
  const ffmpeg = await getFfmpeg();
  onProgress?.('Converting to MP4…');
  await ffmpeg.writeFile('input.webm', await fetchFile(blob));
  // ultrafast keeps mobile conversion quick for short reels
  await ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',
    'output.mp4',
  ]);
  const data = await ffmpeg.readFile('output.mp4');
  try { await ffmpeg.deleteFile('input.webm'); } catch (_) { /* ignore */ }
  try { await ffmpeg.deleteFile('output.mp4'); } catch (_) { /* ignore */ }
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const mp4Blob = new Blob([bytes.buffer], { type: 'video/mp4' });
  if (!mp4Blob.size) throw new Error('MP4 conversion failed');
  return mp4Blob;
}

let logoImagePromise = null;

export async function loadCosmixLogo() {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (logoImagePromise) return logoImagePromise;
  logoImagePromise = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => {
      // SVG fallback
      const fallback = new Image();
      fallback.onload = () => resolve(fallback);
      fallback.onerror = () => resolve(null);
      fallback.src = '/icons/cosmix-universe-logo.svg';
    };
    img.src = '/icons/cosmix-universe-logo.png';
  });
  return logoImagePromise;
}

function drawUniverseMark(ctx, x, y, size, spin = 0) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  const space = ctx.createRadialGradient(cx, cy - r * 0.15, r * 0.1, cx, cy, r);
  space.addColorStop(0, '#1e293b');
  space.addColorStop(0.55, '#0b1226');
  space.addColorStop(1, '#020617');
  drawRoundedRect(ctx, x, y, size, size, size * 0.22);
  ctx.fillStyle = space;
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45 + spin);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r * 0.22, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = Math.max(2, size * 0.045);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.62, r * 0.22, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#fdba74';
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1.5, size * 0.025);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  const star = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.12, 1, cx, cy, r * 0.28);
  star.addColorStop(0, '#ffffff');
  star.addColorStop(0.45, '#e0f2fe');
  star.addColorStop(1, '#38bdf8');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = star;
  ctx.fill();
}

function buildAnalytics(summary = {}, reveal = 1) {
  const distance = Number(summary.distanceKm || summary.distance || 0);
  const minutes = Number(summary.minutes || 0);
  const pace = Number(summary.paceMinPerKm || (distance > 0 && minutes > 0 ? minutes / distance : 0));
  const hr = Number(summary.avgHeartrate || summary.avgHeartRate || 0);
  const maxHr = Number(summary.maxHeartrate || summary.maxHeartRate || 0);
  const elev = Number(summary.elevationGainM || summary.elevation || 0);
  const cadence = Number(summary.avgCadence || 0);
  const split = Number(summary.bestSplitPaceMinPerKm || 0);
  const calories = Number(summary.calories || 0);
  const stride = Number(summary.avgStrideM || 0);
  const vo2 = Number(summary.vo2Max || 0);
  const speed = distance > 0 && minutes > 0 ? distance / (minutes / 60) : 0;

  const cards = [
    { label: 'DISTANCE', value: distance ? (distance * reveal).toFixed(2) : '--', unit: 'km', color: '#fdba74' },
    { label: 'AVG PACE', value: pace ? fmtPace(pace) : '--', unit: '/km', color: '#7dd3fc' },
    { label: 'TIME', value: minutes ? fmtMins(minutes * reveal) : '--', unit: '', color: '#c4b5fd' },
  ];

  if (hr > 0) cards.push({ label: 'AVG HR', value: String(Math.round(hr * reveal)), unit: 'bpm', color: '#fda4af' });
  if (split > 0) cards.push({ label: 'BEST 1 KM', value: fmtPace(split), unit: '/km', color: '#86efac' });
  else if (speed > 0) cards.push({ label: 'AVG SPEED', value: (speed * reveal).toFixed(1), unit: 'km/h', color: '#86efac' });
  if (elev > 0) cards.push({ label: 'ELEVATION', value: `↑${Math.round(elev * reveal)}`, unit: 'm', color: '#a5b4fc' });
  if (cadence > 0) cards.push({ label: 'CADENCE', value: String(Math.round(cadence * reveal)), unit: 'spm', color: '#f9a8d4' });
  if (stride > 0) cards.push({ label: 'STRIDE', value: (stride * reveal).toFixed(2), unit: 'm', color: '#67e8f9' });
  if (maxHr > 0) cards.push({ label: 'MAX HR', value: String(Math.round(maxHr * reveal)), unit: 'bpm', color: '#fb7185' });
  if (vo2 > 0) cards.push({ label: 'VO2 MAX', value: (vo2 * reveal).toFixed(1), unit: summary.vo2Estimated ? 'est' : '', color: '#34d399' });
  if (calories > 0) cards.push({ label: 'CALORIES', value: String(Math.round(calories * reveal)), unit: 'kcal', color: '#fb923c' });

  return cards.slice(0, 9);
}

function fmtRunDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 12);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function drawShareBackground(ctx, width, height, clockMs = 0, theme = 'cosmos') {
  drawStarfield(ctx, width, height, clockMs, { density: 86, nebula: true, theme });
}

function drawCosmixOrbitStage(ctx, x, y, w, h, {
  clockMs = 0, logoImage = null, s = 1,
} = {}) {
  const t = clockMs / 1000;
  ctx.save();
  drawRoundedRect(ctx, x, y, w, h, 24 * s);
  ctx.clip();
  ctx.translate(x, y);
  drawStarfield(ctx, w, h, clockMs, { density: 36, nebula: true });

  const cx = w * 0.26;
  const cy = h * 0.52;
  const size = Math.min(h * 0.72, w * 0.34);

  ctx.save();
  ctx.translate(cx, cy);
  const halo = ctx.createRadialGradient(0, 0, size * 0.08, 0, 0, size * 0.72);
  halo.addColorStop(0, 'rgba(56,189,248,0.28)');
  halo.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.72, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(t * 0.42);
  ctx.strokeStyle = 'rgba(103,232,249,0.9)';
  ctx.lineWidth = Math.max(2, size * 0.028);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.58, size * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  const moonA = t * 1.55;
  ctx.beginPath();
  ctx.arc(Math.cos(moonA) * size * 0.58, Math.sin(moonA) * size * 0.2, Math.max(3, size * 0.045), 0, Math.PI * 2);
  ctx.fillStyle = '#fdba74';
  ctx.fill();

  ctx.rotate(0.9 + t * 0.55);
  ctx.strokeStyle = 'rgba(251,146,60,0.82)';
  ctx.lineWidth = Math.max(1.5, size * 0.022);
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.46, size * 0.16, 0, 0, Math.PI * 2);
  ctx.stroke();

  if (logoImage) {
    const mark = size * 0.42;
    ctx.save();
    ctx.rotate(-t * 0.2);
    drawRoundedRect(ctx, -mark / 2, -mark / 2, mark, mark, mark * 0.22);
    ctx.clip();
    ctx.drawImage(logoImage, -mark / 2, -mark / 2, mark, mark);
    ctx.restore();
  } else {
    const planet = ctx.createRadialGradient(-size * 0.06, -size * 0.08, 1, 0, 0, size * 0.18);
    planet.addColorStop(0, '#ffffff');
    planet.addColorStop(0.4, '#7dd3fc');
    planet.addColorStop(1, '#075985');
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = planet;
    ctx.fill();
  }

  const moonB = t * 1.85;
  ctx.beginPath();
  ctx.arc(Math.cos(moonB) * size * 0.46, Math.sin(moonB) * size * 0.16, Math.max(2, size * 0.032), 0, Math.PI * 2);
  ctx.fillStyle = '#67e8f9';
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${Math.max(24, h * 0.22)}px system-ui, sans-serif`;
  ctx.fillText('COSMIX', w * 0.46, h * 0.46);
  ctx.fillStyle = 'rgba(125,211,252,0.92)';
  ctx.font = `700 ${Math.max(11, h * 0.1)}px system-ui, sans-serif`;
  ctx.fillText('FROM EARTH  ·  TO THE COSMOS', w * 0.46, h * 0.64);
  ctx.restore();
  drawRoundedRect(ctx, x, y, w, h, 24 * s);
  ctx.strokeStyle = 'rgba(103,232,249,0.28)';
  ctx.lineWidth = 1.6 * s;
  ctx.stroke();
}

function drawStatGrid(ctx, stats, {
  gridX, gridY, width, s, reveal = 1, cols = 3, boxH = 92, maxRows = 3,
}) {
  const gap = Math.max(8, 10 * s);
  const boxW = (width - 48 - gap * (cols - 1)) / cols;
  const boxHeight = Math.max(78, boxH * Math.max(s, 0.85));
  const labelPx = Math.max(11, 13 * Math.max(s, 0.85));
  const valuePx = Math.max(22, 28 * Math.max(s, 0.9));
  stats.slice(0, cols * maxRows).forEach((stat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (boxW + gap);
    const y = gridY + row * (boxHeight + gap);
    const lift = (1 - reveal) * 16 * s;
    ctx.save();
    ctx.globalAlpha = 0.5 + reveal * 0.5;
    drawRoundedRect(ctx, x, y + lift, boxW, boxHeight, 16);
    ctx.fillStyle = 'rgba(15,23,42,0.9)';
    ctx.fill();
    ctx.strokeStyle = `${stat.color}55`;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(186,198,214,0.98)';
    ctx.font = `700 ${labelPx}px system-ui, sans-serif`;
    ctx.fillText(stat.label, x + 12, y + lift + labelPx + 10);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${valuePx}px system-ui, sans-serif`;
    ctx.fillText(stat.value, x + 12, y + lift + boxHeight - 14);
    if (stat.unit) {
      const vw = ctx.measureText(stat.value).width;
      ctx.fillStyle = stat.color;
      ctx.font = `700 ${Math.max(12, valuePx * 0.48)}px system-ui, sans-serif`;
      ctx.fillText(stat.unit, x + 12 + vw + 6, y + lift + boxHeight - 14);
    }
    ctx.restore();
  });
}

function drawPhotoStatsCard(ctx, {
  width, height, summary = {}, athleteName = '', logoImage = null, clockMs = 0,
}) {
  const s = Math.max(0.45, width / 1080);
  const distance = Number(summary.distanceKm || summary.distance || 0);
  const minutes = Number(summary.minutes || 0);
  const pace = Number(summary.paceMinPerKm || (distance > 0 && minutes > 0 ? minutes / distance : 0));
  const runName = String(summary.name || 'Morning Run').slice(0, 42);
  const place = String(summary.locationCity || '').slice(0, 28);
  const dateLabel = fmtRunDate(summary.date || summary.startDate);
  const athlete = String(athleteName || '').trim();
  const spin = clockMs / 900;
  const pulse = 1 + Math.sin(clockMs / 420) * 0.06;

  drawShareBackground(ctx, width, height, clockMs);

  const logoSize = 132 * s;
  drawCosmixBrand(ctx, (width - logoSize) / 2, 52 * s, logoSize, {
    spin, pulse, logoImage, s,
  });
  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${36 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('COSMIX', width / 2, 52 * s + logoSize + 44 * s);
  ctx.fillStyle = 'rgba(125,211,252,0.9)';
  ctx.font = `700 ${16 * s}px system-ui, sans-serif`;
  ctx.fillText('RUN STATS', width / 2, 52 * s + logoSize + 70 * s);
  ctx.textAlign = 'left';

  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = `700 ${18 * s}px system-ui, sans-serif`;
  ctx.fillText([dateLabel, place].filter(Boolean).join('  ·  ') || 'Outdoor run', 48 * s, 310 * s);

  if (athlete) {
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = `600 ${22 * s}px system-ui, sans-serif`;
    ctx.fillText(athlete, 48 * s, 348 * s);
  }
  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${40 * s}px system-ui, sans-serif`;
  ctx.fillText(runName, 48 * s, athlete ? 400 * s : 368 * s);

  const heroY = athlete ? 430 * s : 400 * s;
  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${120 * s}px system-ui, sans-serif`;
  const distText = distance ? distance.toFixed(2) : '--';
  ctx.fillText(distText, 48 * s, heroY + 110 * s);
  const distWidth = ctx.measureText(distText).width;
  ctx.fillStyle = '#fdba74';
  ctx.font = `800 ${36 * s}px system-ui, sans-serif`;
  ctx.fillText('km', 48 * s + distWidth + 14 * s, heroY + 110 * s);

  const chips = [
    { label: 'PACE', value: pace ? `${fmtPace(pace)} /km` : '--' },
    { label: 'TIME', value: minutes ? fmtMins(minutes) : '--' },
  ];
  let chipX = 48 * s;
  const chipY = heroY + 142 * s;
  chips.forEach((chip) => {
    drawRoundedRect(ctx, chipX, chipY, 300 * s, 72 * s, 18 * s);
    ctx.fillStyle = 'rgba(15,23,42,0.76)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.font = `800 ${14 * s}px system-ui, sans-serif`;
    ctx.fillText(chip.label, chipX + 20 * s, chipY + 26 * s);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `800 ${28 * s}px system-ui, sans-serif`;
    ctx.fillText(chip.value, chipX + 20 * s, chipY + 56 * s);
    chipX += 320 * s;
  });

  const extra = buildAnalytics(summary, 1).filter((item) => !['DISTANCE', 'AVG PACE', 'TIME'].includes(item.label));
  drawStatGrid(ctx, extra, {
    gridX: 40 * s,
    gridY: chipY + 100 * s,
    width,
    s,
    reveal: 1,
    cols: 3,
    boxH: 100,
    maxRows: 3,
  });
}

function drawSplitsPanel(ctx, splits = [], {
  x, y, w, h, s, overlay = false,
}) {
  const rows = (splits || [])
    .map((row, i) => ({
      km: Number(row.km || i + 1),
      pace: Number(row.paceMinPerKm || 0),
      hr: Number(row.avgHeartrate || 0),
    }))
    .filter((row) => row.pace > 0)
    .slice(0, 10);
  if (!rows.length || h < 36 * s) return;

  if (overlay) {
    const fade = ctx.createLinearGradient(x, y, x, y + h);
    fade.addColorStop(0, 'rgba(2,6,23,0)');
    fade.addColorStop(0.28, 'rgba(2,6,23,0.72)');
    fade.addColorStop(1, 'rgba(2,6,23,0.88)');
    ctx.fillStyle = fade;
    ctx.fillRect(x, y, w, h);
  } else {
    drawRoundedRect(ctx, x, y, w, h, 16 * s);
    ctx.fillStyle = 'rgba(15,23,42,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(125,211,252,0.2)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = `800 ${11 * s}px system-ui, sans-serif`;
  ctx.fillText('KM SPLITS', x + 14 * s, y + 20 * s);

  const paces = rows.map((row) => row.pace);
  const best = Math.min(...paces);
  const worst = Math.max(...paces);
  const gap = 6 * s;
  const colW = (w - 28 * s - gap * (rows.length - 1)) / rows.length;
  const barMax = Math.max(28 * s, h - 52 * s);

  rows.forEach((row, i) => {
    const bx = x + 14 * s + i * (colW + gap);
    const t = worst === best ? 1 : (worst - row.pace) / (worst - best);
    const bh = Math.max(6 * s, 10 * s + t * (barMax - 10 * s));
    const by = y + h - 22 * s - bh;
    const isBest = row.pace === best;
    drawRoundedRect(ctx, bx, by, colW, bh, 6 * s);
    ctx.fillStyle = isBest ? 'rgba(251,146,60,0.92)' : 'rgba(56,189,248,0.55)';
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${10 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(fmtPace(row.pace), bx + colW / 2, y + h - 8 * s);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = `700 ${9 * s}px system-ui, sans-serif`;
    ctx.fillText(String(row.km), bx + colW / 2, by - 4 * s);
    ctx.textAlign = 'left';
  });
}

function traveledPath(route, mapReveal) {
  const fullLen = pathLength(route);
  const target = mapReveal * fullLen;
  const out = [{ x: route[0].x, y: route[0].y }];
  let drawn = 0;
  for (let i = 1; i < route.length; i += 1) {
    const a = route[i - 1];
    const b = route[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
    if (drawn + seg <= target) {
      out.push({ x: b.x, y: b.y });
      drawn += seg;
    } else {
      const u = (target - drawn) / seg;
      out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
      break;
    }
  }
  return out;
}

function strokePath(ctx, pts) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function drawRouteOnMap(ctx, route, mapReveal, clockMs, showRunner = true, distanceKm = 0) {
  if (route.length < 2) return;
  const traveled = traveledPath(route, mapReveal);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  route.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = 'rgba(248,250,252,0.42)';
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(15,23,42,0.55)';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.save();
  ctx.translate(3, 5);
  ctx.strokeStyle = 'rgba(0,0,0,0.38)';
  ctx.lineWidth = 8;
  strokePath(ctx, traveled);
  ctx.restore();

  ctx.shadowColor = 'rgba(251,146,60,0.85)';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 7;
  strokePath(ctx, traveled);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fdba74';
  ctx.lineWidth = 3.2;
  strokePath(ctx, traveled);
  ctx.strokeStyle = '#fff7ed';
  ctx.lineWidth = 1.15;
  strokePath(ctx, traveled);

  const runner = pointAlong(route, mapReveal);
  if (!runner) return;

  const pulse = (clockMs / 650) % 1;
  ctx.beginPath();
  ctx.arc(runner.x, runner.y, 11 + pulse * 22, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(251,146,60,${0.62 * (1 - pulse)})`;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(runner.x, runner.y, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(runner.x, runner.y, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = '#f97316';
  ctx.fill();

  if (showRunner) {
    const gait = (clockMs / 1000) * 3.15;
    drawRunnerFigure(ctx, runner, gait, 2.15);
  }

  if (distanceKm > 0 && mapReveal > 0.02) {
    const label = `${(distanceKm * mapReveal).toFixed(2)} km`;
    ctx.font = '800 14px system-ui, sans-serif';
    const tw = ctx.measureText(label).width;
    const bx = runner.x + 14;
    const by = runner.y - 28;
    drawRoundedRect(ctx, bx, by, tw + 16, 22, 11);
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.fill();
    ctx.fillStyle = '#fff7ed';
    ctx.textAlign = 'left';
    ctx.fillText(label, bx + 8, by + 16);
  }
}

function drawMapHud(ctx, {
  x, y, w, h, distance, pace, minutes, extraStats = [], splitRows = [],
  showHero, showStats, showSplits, showLogo, showPlace, showAthlete, showTitle,
  runName, place, dateLabel, athlete, logoImage, clockMs, s,
  logoSize = 'large', textSize = 'medium', logoPlace = 'both',
}) {
  const textMul = sizeMultiplier(textSize);
  const logoMul = sizeMultiplier(logoSize, { small: 0.85, medium: 1, large: 1.18 });
  const u = Math.max(0.82, s * 1.55) * textMul;
  const showTopLogo = Boolean(showLogo);
  const mark = Math.max(22, 24 * logoMul);
  const headerY = y + 18 + mark / 2;

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(248,250,252,0.92)';
  ctx.font = `700 ${Math.max(12, 13 * u)}px system-ui, sans-serif`;
  if (showPlace) {
    ctx.fillText([dateLabel, place].filter(Boolean).join('  ·  ') || 'Outdoor run', x + 18, headerY + 4);
  }

  if (showTopLogo) {
    const lx = x + w - 16 - mark / 2;
    drawCircleLogo(ctx, lx, headerY, mark, { logoImage });
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(186,230,253,0.9)';
    ctx.font = `800 ${Math.max(8, 9 * u)}px system-ui, sans-serif`;
    ctx.fillText('COSMIX', lx - mark / 2 - 6, headerY + 3);
    ctx.textAlign = 'left';
  }

  let ty = y + 18 + mark + 14 * u;
  if (showAthlete && athlete) {
    ctx.fillStyle = 'rgba(226,232,240,0.92)';
    ctx.font = `600 ${Math.max(13, 14 * u)}px system-ui, sans-serif`;
    ctx.fillText(athlete, x + 18, ty);
    ty += 18 * u;
  }
  if (showTitle) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.max(22, 26 * u)}px system-ui, sans-serif`;
    ctx.fillText(runName, x + 18, ty + 6);
  }

  const fadeH = Math.min(h * 0.58, 390 * u);
  const fade = ctx.createLinearGradient(x, y + h - fadeH, x, y + h);
  fade.addColorStop(0, 'rgba(2,6,23,0)');
  fade.addColorStop(0.28, 'rgba(2,8,20,0.42)');
  fade.addColorStop(1, 'rgba(2,8,20,0.92)');
  ctx.fillStyle = fade;
  ctx.fillRect(x, y + h - fadeH, w, fadeH);

  let by = y + h - 22;
  if (showSplits && splitRows.length) {
    drawSplitsPanel(ctx, splitRows, {
      x,
      y: by - 96,
      w,
      h: 96,
      s: Math.max(s, 0.85),
      overlay: true,
    });
    by -= 104;
  }

  if (showStats && extraStats.length) {
    const chips = extraStats.slice(0, 3);
    const gap = 8;
    const chipW = (w - 36 - gap * (chips.length - 1)) / chips.length;
    const chipH = 70;
    const cy = by - chipH;
    chips.forEach((stat, i) => {
      const cx = x + 18 + i * (chipW + gap);
      drawRoundedRect(ctx, cx, cy, chipW, chipH, 16);
      ctx.fillStyle = 'rgba(15,23,42,0.78)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(148,163,184,0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(186,198,214,0.95)';
      ctx.font = `800 ${Math.max(11, 12 * u)}px system-ui, sans-serif`;
      ctx.fillText(stat.label, cx + 12, cy + 22);
      ctx.fillStyle = '#f8fafc';
      ctx.font = `800 ${Math.max(22, 24 * u)}px system-ui, sans-serif`;
      ctx.fillText(stat.value, cx + 12, cy + 52);
      if (stat.unit) {
        const vw = ctx.measureText(stat.value).width;
        ctx.fillStyle = stat.color;
        ctx.font = `700 ${Math.max(12, 13 * u)}px system-ui, sans-serif`;
        ctx.fillText(stat.unit, cx + 12 + vw + 6, cy + 52);
      }
    });
    by = cy - 14;
  }

  if (showHero) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.max(48, 56 * u)}px system-ui, sans-serif`;
    const distText = distance ? distance.toFixed(2) : '--';
    ctx.fillText(distText, x + 18, by - 28);
    const distWidth = ctx.measureText(distText).width;
    ctx.fillStyle = '#fdba74';
    ctx.font = `800 ${Math.max(16, 18 * u)}px system-ui, sans-serif`;
    ctx.fillText('km', x + 18 + distWidth + 8, by - 28);
    ctx.fillStyle = 'rgba(248,250,252,0.95)';
    ctx.font = `800 ${Math.max(15, 16 * u)}px system-ui, sans-serif`;
    const paceTime = [pace ? `${fmtPace(pace)} /km` : null, minutes ? fmtMins(minutes) : null].filter(Boolean).join('   ·   ');
    ctx.fillText(paceTime, x + 18, by - 4);
  }
}

/**
 * Render one frame of the share reel onto ctx.
 */
export function drawRunShareFrame(ctx, {
  width,
  height,
  polyline = [],
  summary = {},
  splits = [],
  progress,
  athleteName = '',
  logoImage = null,
  mapCanvas = null,
  mode = 'video',
  clockMs = 0,
  options = {},
}) {
  const opt = normalizeShareOptions({ ...options, format: options.format || mode });
  const isPhoto = opt.format === 'photo' || mode === 'photo';
  const t = isPhoto ? 1 : clamp(progress, 0, 1);
  const mapReveal = isPhoto ? 1 : clamp((t - 0.04) / 0.9, 0, 1);
  const statsReveal = isPhoto ? 1 : easeOutCubic(clamp((t - 0.16) / 0.5, 0, 1));
  const s = Math.max(0.45, width / 1080);

  const distance = Number(summary.distanceKm || summary.distance || 0);
  const minutes = Number(summary.minutes || 0);
  const pace = Number(summary.paceMinPerKm || (distance > 0 && minutes > 0 ? minutes / distance : 0));
  const runName = String(summary.name || 'Morning Run').slice(0, 36);
  const place = String(summary.locationCity || '').slice(0, 28);
  const dateLabel = fmtRunDate(summary.date || summary.startDate);
  const athlete = String(athleteName || '').trim();
  const extraStats = buildAnalytics(summary, statsReveal).filter((item) => !['DISTANCE', 'AVG PACE', 'TIME'].includes(item.label));
  const splitRows = Array.isArray(splits) ? splits : [];
  const showMap = Boolean(opt.showMap && polyline?.length >= 2);
  const showSplits = Boolean(opt.showSplits && splitRows.length);
  const showStats = Boolean(opt.showStats && extraStats.length);

  drawShareBackground(ctx, width, height, clockMs, opt.theme);

  const padX = 18;
  const padY = 16;

  if (showMap) {
    const cardX = padX;
    const cardY = padY;
    const cardW = width - padX * 2;
    const cardH = height - padY * 2;
    const mapW = mapCanvas?.width || Math.round(cardW);
    const mapH = mapCanvas?.height || Math.round(cardH);
    const rawRoute = projectPolyline(polyline, mapW, mapH, 40);
    const sx = cardW / mapW;
    const sy = cardH / mapH;
    const useTilt = opt.mapStyle === 'satellite3d' || opt.mapStyle === 'space';
    const route = rawRoute.map((p) => {
      const q = mapCanvas && useTilt ? projectPointPerspective(p.x, p.y, mapW, mapH) : p;
      return { ...p, x: q.x * sx, y: q.y * sy };
    });

    ctx.save();
    ctx.shadowColor = 'rgba(56,189,248,0.22)';
    ctx.shadowBlur = 28;
    drawRoundedRect(ctx, cardX + 8, cardY + 18, cardW - 16, cardH - 10, 26);
    ctx.fillStyle = '#0b1220';
    ctx.fill();
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 26);
    ctx.clip();
    ctx.translate(cardX, cardY);
    if (mapCanvas) ctx.drawImage(mapCanvas, 0, 0, cardW, cardH);
    else drawProceduralTerrain(ctx, cardW, cardH);
    if (route.length >= 2) {
      drawRouteOnMap(ctx, route, mapReveal, clockMs, opt.showRunner, distance);
    }
    ctx.restore();

    ctx.save();
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 26);
    ctx.clip();
    drawMapHud(ctx, {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH,
      distance,
      pace,
      minutes,
      extraStats,
      splitRows,
      showHero: opt.showHero,
      showStats,
      showSplits,
      showLogo: opt.showLogo,
      showPlace: opt.showPlace,
      showAthlete: opt.showAthlete,
      showTitle: opt.showTitle,
      runName,
      place,
      dateLabel,
      athlete,
      logoImage,
      clockMs,
      s,
      logoSize: opt.logoSize,
      textSize: opt.textSize,
      logoPlace: opt.logoPlace,
    });
    ctx.restore();

    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 26);
    ctx.strokeStyle = 'rgba(186,230,253,0.35)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    return;
  }

  let y = 22 * s;
  const mark = Math.max(22, 26 * sizeMultiplier(opt.logoSize, { small: 0.85, medium: 1, large: 1.15 }));
  if (opt.showPlace) {
    ctx.fillStyle = 'rgba(148,163,184,0.92)';
    ctx.font = `700 ${Math.max(13, 15 * s)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText([dateLabel, place].filter(Boolean).join('  ·  ') || 'Outdoor run', 36 * s, y + mark * 0.45);
  }
  if (opt.showLogo) {
    drawCircleLogo(ctx, width - 36 * s - mark / 2, y + mark / 2, mark, { logoImage });
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(186,230,253,0.9)';
    ctx.font = `800 ${Math.max(9, 10 * s)}px system-ui, sans-serif`;
    ctx.fillText('COSMIX', width - 36 * s - mark - 6, y + mark * 0.58);
    ctx.textAlign = 'left';
  }
  y += mark + 16 * s;

  if (opt.showAthlete && athlete) {
    ctx.fillStyle = 'rgba(226,232,240,0.8)';
    ctx.font = `600 ${Math.max(14, 16 * s)}px system-ui, sans-serif`;
    ctx.fillText(athlete, 36 * s, y + 14 * s);
    y += 26 * s;
  }

  if (opt.showTitle) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.max(24, 28 * s)}px system-ui, sans-serif`;
    ctx.fillText(runName, 36 * s, y + 22 * s);
    y += 36 * s;
  } else {
    y += 8 * s;
  }

  if (opt.showHero) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = `900 ${Math.max(54, 64 * s)}px system-ui, sans-serif`;
    const distText = distance ? distance.toFixed(2) : '--';
    ctx.fillText(distText, 36 * s, y + 56 * s);
    const distWidth = ctx.measureText(distText).width;
    ctx.fillStyle = '#fdba74';
    ctx.font = `800 ${Math.max(18, 20 * s)}px system-ui, sans-serif`;
    ctx.fillText('km', 36 * s + distWidth + 8 * s, y + 56 * s);
    ctx.fillStyle = 'rgba(226,232,240,0.9)';
    ctx.font = `800 ${Math.max(16, 18 * s)}px system-ui, sans-serif`;
    const paceTime = [pace ? `${fmtPace(pace)} /km` : null, minutes ? fmtMins(minutes) : null].filter(Boolean).join('   ·   ');
    ctx.fillText(paceTime, 36 * s, y + 86 * s);
    y += 108 * s;
  } else {
    y += 8 * s;
  }

  const cardX = padX;
  const cardW = width - padX * 2;
  if (showSplits) {
    drawSplitsPanel(ctx, splitRows, {
      x: cardX,
      y,
      w: cardW,
      h: 128,
      s: Math.max(s, 0.85),
      overlay: false,
    });
    y += 140;
  }

  if (showStats) {
    drawStatGrid(ctx, extraStats, {
      gridX: cardX,
      gridY: y,
      width,
      s: Math.max(s, 0.9),
      reveal: statsReveal,
      cols: 3,
      boxH: 96,
      maxRows: 3,
    });
  }
}

/**
 * Record a Cosmix run share video, or a stats-only photo.
 * Also returns a PNG poster for WhatsApp / Instagram when video isn't accepted.
 */
export async function renderRunShareReel({
  polyline = [],
  summary = {},
  splits = [],
  athleteName = '',
  durationMs = 11000,
  width = 540,
  height = 960,
  fps = 24,
  preferShareableImage = false,
  includePoster = true,
  mode = 'video',
  options = {},
  onProgress,
} = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Share reel only runs in the browser');
  }

  const opt = normalizeShareOptions({ ...options, format: options.format || mode });
  const isPhoto = opt.format === 'photo' || preferShareableImage;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const logoImage = await loadCosmixLogo();
  let mapCanvas = null;
  if (opt.showMap && polyline?.length >= 2) {
    onProgress?.('Loading map…');
    try {
      mapCanvas = await loadRouteMapBackdrop(
        polyline,
        Math.round((width - 36) * 2),
        Math.round((height - 32) * 2),
        40,
        { style: opt.mapStyle, color: opt.mapColor },
      );
    } catch (_) {
      mapCanvas = null;
    }
  }

  const draw = (progress, clockMs = progress * durationMs) => {
    drawRunShareFrame(ctx, {
      width,
      height,
      polyline,
      summary,
      splits,
      progress,
      athleteName,
      logoImage,
      mapCanvas,
      mode: isPhoto ? 'photo' : 'video',
      clockMs,
      options: opt,
    });
  };

  async function makePoster() {
    draw(1, durationMs);
    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    return {
      blob, url, mimeType: 'image/png', width, height, isImage: true,
    };
  }

  const mimeType = pickMimeType();
  const canRecord = Boolean(mimeType && typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined');

  if (!canRecord || isPhoto) {
    onProgress?.('Building photo…');
    return makePoster();
  }

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_500_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) {
          reject(new Error('Empty recording'));
          return;
        }
        const url = URL.createObjectURL(blob);
        resolve({
          blob, url, mimeType, width, height, isImage: false,
        });
      } catch (err) {
        reject(err);
      }
    };
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  recorder.start(80);
  const start = performance.now();
  onProgress?.('Filming your run…');

  await new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = now - start;
      const progress = clamp(elapsed / durationMs, 0, 1);
      draw(progress, elapsed);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setTimeout(() => {
          try { recorder.stop(); } catch (_) { /* ignore */ }
          stream.getTracks().forEach((tr) => tr.stop());
          resolve();
        }, 120);
      }
    };
    requestAnimationFrame(tick);
  });

  try {
    const video = await done;
    if (includePoster) {
      const poster = await makePoster();
      return { ...video, poster };
    }
    return video;
  } catch (_) {
    return makePoster();
  }
}

export async function shareOrDownloadRunReel(result, {
  title = 'My Cosmix run',
  text = 'Check out my run on Cosmix',
  filename,
  preferPosterForShare = false,
  forceImage = false,
  onProgress,
} = {}) {
  if (!result?.blob) throw new Error('Nothing to share');

  // Build a WhatsApp-friendly MP4 when the browser only recorded WebM.
  let shareResult = result;
  if (!forceImage && !result.isImage && !isLikelyShareableVideo(result.mimeType)) {
    try {
      const mp4Blob = await convertReelToMp4(result.blob, { onProgress });
      const mp4Url = URL.createObjectURL(mp4Blob);
      shareResult = {
        ...result,
        blob: mp4Blob,
        url: mp4Url,
        mimeType: 'video/mp4',
        isImage: false,
        convertedFromWebm: true,
      };
    } catch (error) {
      console.error('MP4 conversion failed, falling back:', error);
      onProgress?.(friendlyShareError(error).includes('Could not reach')
        ? 'Could not convert video — sharing photo instead…'
        : 'Could not convert video — trying photo…');
    }
  }

  const candidates = [];
  const pushVideo = () => {
    if (shareResult.isImage) return;
    // Never offer WebM to the share sheet — WhatsApp drops it.
    if (!isLikelyShareableVideo(shareResult.mimeType)) return;
    candidates.push({
      blob: shareResult.blob,
      url: shareResult.url,
      mimeType: 'video/mp4',
      isImage: false,
      name: filename || 'cosmix-run.mp4',
    });
  };
  const pushImage = () => {
    const poster = shareResult.poster?.blob ? shareResult.poster : (shareResult.isImage ? shareResult : null);
    if (!poster?.blob) return;
    candidates.push({
      blob: poster.blob,
      url: poster.url,
      mimeType: 'image/png',
      isImage: true,
      name: 'cosmix-run.png',
    });
  };

  if (forceImage) {
    pushImage();
  } else if (preferPosterForShare) {
    pushImage();
    pushVideo();
  } else {
    pushVideo();
    // Only fall back to photo if video share isn't possible.
    if (!candidates.length) pushImage();
  }

  if (!candidates.length && shareResult.blob) {
    candidates.push({
      blob: shareResult.blob,
      url: shareResult.url,
      mimeType: shareResult.mimeType || shareResult.blob.type,
      isImage: Boolean(shareResult.isImage),
      name: filename || (shareResult.isImage ? 'cosmix-run.png' : 'cosmix-run.mp4'),
    });
  }

  onProgress?.('Opening share…');
  for (const item of candidates) {
    const file = new File([item.blob], item.name, { type: item.mimeType || (item.isImage ? 'image/png' : 'video/mp4') });
    const shared = await tryShareFiles([file], { title, text });
    if (shared.ok) return { method: 'share', sharedAs: item.isImage ? 'image' : 'video' };
    if (shared.cancelled) return { method: 'cancelled' };
  }

  // If video share failed (e.g. canShare false), offer photo as last resort.
  if (!forceImage && !preferPosterForShare) {
    const poster = shareResult.poster?.blob ? shareResult.poster : null;
    if (poster?.blob) {
      const file = new File([poster.blob], 'cosmix-run.png', { type: 'image/png' });
      const shared = await tryShareFiles([file], { title, text });
      if (shared.ok) return { method: 'share', sharedAs: 'image' };
      if (shared.cancelled) return { method: 'cancelled' };
    }
  }

  const fallback = candidates[0];
  if (!fallback) throw new Error('Nothing to share');
  const a = document.createElement('a');
  a.href = fallback.url;
  a.download = fallback.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { method: 'download', sharedAs: fallback.isImage ? 'image' : 'video' };
}

export function yieldToUi() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'undefined') {
      setTimeout(resolve, 32);
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setTimeout(resolve, 16));
    });
  });
}

/** Fetch latest (or specific) run detail for sharing. */
export async function fetchShareableRun(userId, activityId, wellnessApiUrl) {
  if (!userId || !wellnessApiUrl) return null;
  try {
    let id = activityId;
    if (!id) {
      const mapsRes = await shareFetch(wellnessApiUrl(`/wellness/strava/maps/${encodeURIComponent(userId)}?limit=8`));
      const maps = await mapsRes.json().catch(() => null);
      const cards = maps?.cards || maps?.runs || [];
      const card = cards.find((c) => (c.polyline || []).length >= 2) || cards[0];
      id = card?.id || card?.stravaId || card?.activityId;
      if (!id) return null;
    }

    let res = await shareFetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`));
    let detail = await res.json().catch(() => null);
    let polyline = Array.isArray(detail?.polyline) && detail.polyline.length
      ? detail.polyline
      : (Array.isArray(detail?.streams?.latlng) ? detail.streams.latlng : []);

    if ((!polyline || polyline.length < 2) && id) {
      try {
        await shareFetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/enrich-details`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ activityIds: [id], limit: 1 }),
        });
        res = await shareFetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`));
        detail = await res.json().catch(() => null);
        polyline = Array.isArray(detail?.polyline) && detail.polyline.length
          ? detail.polyline
          : (Array.isArray(detail?.streams?.latlng) ? detail.streams.latlng : []);
      } catch (_) {
        // Enrich is best-effort.
      }
    }

    if (!res.ok || !detail) return null;
    return {
      activityId: id,
      summary: detail.summary || {},
      polyline,
      splits: Array.isArray(detail.splits) ? detail.splits : [],
      detail,
    };
  } catch (error) {
    console.warn('fetchShareableRun failed', error);
    return null;
  }
}
