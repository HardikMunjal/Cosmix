/**
 * Cosmix branded run share reel — canvas animation of route + moving marker + analytics.
 * Outputs WebM (or mp4 where supported) for Instagram / WhatsApp share.
 */

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

/**
 * Fit [[lat,lng]] fully inside a box, centered on the run bounds.
 * pad is inset from edges so the whole route stays visible.
 */
export function projectPolyline(polyline = [], width, height, pad = 48) {
  const points = (polyline || [])
    .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null))
    .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (points.length < 2) return [];

  // Light downsample for very dense GPS streams (keep shape)
  let pts = points;
  if (pts.length > 600) {
    const step = Math.ceil(pts.length / 500);
    pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  }

  const lats = pts.map((p) => p[0]);
  const lngs = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  // Pad geo bounds ~6% so edges aren't clipped by stroke width
  const latPad = Math.max(0.00005, (maxLat - minLat) * 0.06);
  const lngPad = Math.max(0.00005, (maxLng - minLng) * 0.06);
  const spanLat = Math.max(0.00008, (maxLat - minLat) + latPad * 2);
  const spanLng = Math.max(0.00008, (maxLng - minLng) + lngPad * 2);
  const usableW = Math.max(40, width - pad * 2);
  const usableH = Math.max(40, height - pad * 2);
  const scale = Math.min(usableW / spanLng, usableH / spanLat);
  const offsetX = (width - spanLng * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;
  const originLat = maxLat + latPad;
  const originLng = minLng - lngPad;

  return pts.map((p) => ({
    x: offsetX + (p[1] - originLng) * scale,
    y: offsetY + (originLat - p[0]) * scale,
    lat: p[0],
    lng: p[1],
  }));
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

let logoImagePromise = null;

function loadCosmixLogo() {
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

function drawUniverseMark(ctx, x, y, size) {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  const space = ctx.createRadialGradient(cx, cy - r * 0.15, r * 0.1, cx, cy, r);
  space.addColorStop(0, '#1e293b');
  space.addColorStop(1, '#020617');
  drawRoundedRect(ctx, x, y, size, size, size * 0.22);
  ctx.fillStyle = space;
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.45);
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

/**
 * Render one frame of the share reel onto ctx.
 * Athletic layout: big race numbers first, subtle brand mark, dense stats.
 */
export function drawRunShareFrame(ctx, {
  width,
  height,
  polyline = [],
  summary = {},
  progress,
  athleteName = '',
  logoImage = null,
}) {
  const t = clamp(progress, 0, 1);
  const mapReveal = easeInOut(clamp((t - 0.04) / 0.72, 0, 1));
  const statsReveal = easeOutCubic(clamp((t - 0.18) / 0.45, 0, 1));
  const s = Math.max(0.45, width / 1080);

  const distance = Number(summary.distanceKm || summary.distance || 0);
  const minutes = Number(summary.minutes || 0);
  const pace = Number(summary.paceMinPerKm || (distance > 0 && minutes > 0 ? minutes / distance : 0));
  const runName = String(summary.name || 'Morning Run').slice(0, 42);
  const place = String(summary.locationCity || '').slice(0, 28);
  const dateLabel = fmtRunDate(summary.date || summary.startDate);
  const athlete = String(athleteName || '').trim();

  // Clean dark field (less “space poster”, more race card)
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#07111f');
  bg.addColorStop(0.55, '#0b1526');
  bg.addColorStop(1, '#050b14');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Soft side glow only
  const glow = ctx.createRadialGradient(width * 0.85, height * 0.18, 10, width * 0.85, height * 0.18, width * 0.55);
  glow.addColorStop(0, 'rgba(56,189,248,0.12)');
  glow.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  // Top meta row: date / place left, subtle logo mark right
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.font = `700 ${18 * s}px system-ui, sans-serif`;
  const meta = [dateLabel, place].filter(Boolean).join('  ·  ') || 'Outdoor run';
  ctx.fillText(meta, 48 * s, 56 * s);

  const markSize = 40 * s;
  const markX = width - 48 * s - markSize;
  const markY = 28 * s;
  ctx.globalAlpha = 0.9;
  if (logoImage) {
    drawRoundedRect(ctx, markX, markY, markSize, markSize, 12 * s);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logoImage, markX, markY, markSize, markSize);
    ctx.restore();
  } else {
    drawUniverseMark(ctx, markX, markY, markSize);
  }
  ctx.globalAlpha = 1;

  // Athlete + run title
  if (athlete) {
    ctx.fillStyle = 'rgba(226,232,240,0.72)';
    ctx.font = `600 ${20 * s}px system-ui, sans-serif`;
    ctx.fillText(athlete, 48 * s, 96 * s);
  }
  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${44 * s}px system-ui, sans-serif`;
  ctx.fillText(runName, 48 * s, athlete ? 148 * s : 118 * s);

  // Hero race numbers — distance dominant
  const heroY = athlete ? 190 * s : 160 * s;
  ctx.fillStyle = '#f8fafc';
  ctx.font = `900 ${110 * s}px system-ui, sans-serif`;
  const distText = distance ? distance.toFixed(2) : '--';
  ctx.fillText(distText, 48 * s, heroY + 100 * s);
  const distWidth = ctx.measureText(distText).width;
  ctx.fillStyle = '#fdba74';
  ctx.font = `800 ${34 * s}px system-ui, sans-serif`;
  ctx.fillText('km', 48 * s + distWidth + 14 * s, heroY + 100 * s);

  // Pace + time under hero
  const chipY = heroY + 130 * s;
  const chips = [
    { label: 'PACE', value: pace ? `${fmtPace(pace)} /km` : '--' },
    { label: 'TIME', value: minutes ? fmtMins(minutes) : '--' },
  ];
  let chipX = 48 * s;
  chips.forEach((chip) => {
    drawRoundedRect(ctx, chipX, chipY, 250 * s, 64 * s, 16 * s);
    ctx.fillStyle = 'rgba(15,23,42,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 1.5 * s;
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.9)';
    ctx.font = `800 ${14 * s}px system-ui, sans-serif`;
    ctx.fillText(chip.label, chipX + 18 * s, chipY + 24 * s);
    ctx.fillStyle = '#f1f5f9';
    ctx.font = `800 ${26 * s}px system-ui, sans-serif`;
    ctx.fillText(chip.value, chipX + 18 * s, chipY + 50 * s);
    chipX += 270 * s;
  });

  // Map stage
  const cardX = 40 * s;
  const cardY = chipY + 90 * s;
  const cardW = width - 80 * s;
  const cardH = Math.round(height * 0.34);
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28 * s);
  ctx.fillStyle = 'rgba(8,15,30,0.94)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,211,252,0.2)';
  ctx.lineWidth = 1.5 * s;
  ctx.stroke();
  ctx.clip();

  const route = projectPolyline(polyline, cardW, cardH, 48 * s).map((p) => ({
    x: p.x + cardX,
    y: p.y + cardY,
    lat: p.lat,
    lng: p.lng,
  }));

  if (route.length >= 2) {
    const fullLen = pathLength(route);
    let drawn = 0;
    const target = mapReveal * fullLen;

    ctx.beginPath();
    route.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 7 * s;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(route[0].x, route[0].y);
    for (let i = 1; i < route.length; i += 1) {
      const a = route[i - 1];
      const b = route[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y) || 0.0001;
      if (drawn + seg <= target) {
        ctx.lineTo(b.x, b.y);
        drawn += seg;
      } else {
        const u = (target - drawn) / seg;
        ctx.lineTo(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u);
        drawn = target;
        break;
      }
    }
    ctx.strokeStyle = '#f97316';
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 16 * s;
    ctx.lineWidth = 9 * s;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 3 * s;
    ctx.stroke();

    const start = route[0];
    const end = route[route.length - 1];
    ctx.beginPath();
    ctx.arc(start.x, start.y, 9 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#86efac';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(end.x, end.y, 9 * s, 0, Math.PI * 2);
    ctx.fillStyle = mapReveal > 0.92 ? '#38bdf8' : 'rgba(56,189,248,0.35)';
    ctx.fill();

    const runner = pointAlong(route, mapReveal);
    if (runner) {
      const orb = ctx.createRadialGradient(runner.x - 3 * s, runner.y - 3 * s, 1 * s, runner.x, runner.y, 12 * s);
      orb.addColorStop(0, '#ecfeff');
      orb.addColorStop(0.5, '#7dd3fc');
      orb.addColorStop(1, '#f97316');
      ctx.beginPath();
      ctx.arc(runner.x, runner.y, 12 * s, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 16 * s;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else {
    ctx.fillStyle = 'rgba(148,163,184,0.75)';
    ctx.font = `600 ${24 * s}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Route not available', width / 2, cardY + cardH / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Detail stats grid
  const stats = buildAnalytics(summary, statsReveal).filter((item) => !['DISTANCE', 'AVG PACE', 'TIME'].includes(item.label));
  const cols = 3;
  const gap = 12 * s;
  const gridX = 40 * s;
  const gridY = cardY + cardH + 24 * s;
  const boxW = (width - 80 * s - gap * (cols - 1)) / cols;
  const boxH = 92 * s;
  const maxRows = 2;

  stats.slice(0, cols * maxRows).forEach((stat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (boxW + gap);
    const y = gridY + row * (boxH + gap);
    const lift = (1 - statsReveal) * 16 * s;
    ctx.save();
    ctx.globalAlpha = 0.45 + statsReveal * 0.55;
    drawRoundedRect(ctx, x, y + lift, boxW, boxH, 16 * s);
    ctx.fillStyle = 'rgba(15,23,42,0.88)';
    ctx.fill();
    ctx.strokeStyle = `${stat.color}44`;
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.font = `700 ${13 * s}px system-ui, sans-serif`;
    ctx.fillText(stat.label, x + 14 * s, y + lift + 28 * s);
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${28 * s}px system-ui, sans-serif`;
    ctx.fillText(stat.value, x + 14 * s, y + lift + 62 * s);
    if (stat.unit) {
      const vw = ctx.measureText(stat.value).width;
      ctx.fillStyle = stat.color;
      ctx.font = `700 ${14 * s}px system-ui, sans-serif`;
      ctx.fillText(stat.unit, x + 14 * s + vw + 8 * s, y + lift + 62 * s);
    }
    ctx.restore();
  });

  // Subtle footer watermark — small mark + wordmark, not a loud banner
  const footY = height - 56 * s;
  ctx.globalAlpha = 0.55;
  if (logoImage) {
    ctx.drawImage(logoImage, 48 * s, footY - 4 * s, 26 * s, 26 * s);
  } else {
    drawUniverseMark(ctx, 48 * s, footY - 4 * s, 26 * s);
  }
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = 'rgba(226,232,240,0.75)';
  ctx.font = `700 ${16 * s}px system-ui, sans-serif`;
  ctx.fillText('cosmix', 84 * s, footY + 16 * s);
  ctx.globalAlpha = 1;
}

/**
 * Record a Cosmix run share video (quick preview by default).
 * Also returns a PNG poster for WhatsApp / Instagram when video isn't accepted.
 */
export async function renderRunShareReel({
  polyline = [],
  summary = {},
  athleteName = '',
  durationMs = 2800,
  width = 540,
  height = 960,
  fps = 24,
  preferShareableImage = false,
  includePoster = true,
} = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Share reel only runs in the browser');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const logoImage = await loadCosmixLogo();

  const draw = (progress) => {
    drawRunShareFrame(ctx, {
      width,
      height,
      polyline,
      summary,
      progress,
      athleteName,
      logoImage,
    });
  };

  async function makePoster() {
    draw(1);
    const blob = await canvasToPngBlob(canvas);
    const url = URL.createObjectURL(blob);
    return {
      blob, url, mimeType: 'image/png', width, height, isImage: true,
    };
  }

  const mimeType = pickMimeType();
  const canRecord = Boolean(mimeType && typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined');

  if (!canRecord || preferShareableImage) {
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

  await new Promise((resolve) => {
    const tick = (now) => {
      const elapsed = now - start;
      const progress = clamp(elapsed / durationMs, 0, 1);
      draw(progress);
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
} = {}) {
  if (!result?.blob) throw new Error('Nothing to share');

  const candidates = [];
  const pushVideo = () => {
    if (result.isImage) return;
    const ext = isLikelyShareableVideo(result.mimeType) ? 'mp4' : 'webm';
    candidates.push({
      blob: result.blob,
      url: result.url,
      mimeType: result.mimeType || result.blob.type || `video/${ext}`,
      isImage: false,
      name: filename || `cosmix-run.${ext}`,
    });
  };
  const pushImage = () => {
    const poster = result.poster?.blob ? result.poster : (result.isImage ? result : null);
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
    // Prefer video for WhatsApp / Instagram status / reels.
    pushVideo();
    pushImage();
  }

  if (!candidates.length && result.blob) {
    candidates.push({
      blob: result.blob,
      url: result.url,
      mimeType: result.mimeType || result.blob.type,
      isImage: Boolean(result.isImage),
      name: filename || (result.isImage ? 'cosmix-run.png' : 'cosmix-run.webm'),
    });
  }

  for (const item of candidates) {
    const file = new File([item.blob], item.name, { type: item.mimeType || (item.isImage ? 'image/png' : 'video/webm') });
    const shared = await tryShareFiles([file], { title, text });
    if (shared.ok) return { method: 'share', sharedAs: item.isImage ? 'image' : 'video' };
    if (shared.cancelled) return { method: 'cancelled' };
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
  const fetchOpts = { credentials: 'include' };
  let id = activityId;
  if (!id) {
    const mapsRes = await fetch(wellnessApiUrl(`/wellness/strava/maps/${encodeURIComponent(userId)}?limit=8`), fetchOpts);
    const maps = await mapsRes.json().catch(() => null);
    const cards = maps?.cards || maps?.runs || [];
    const card = cards.find((c) => (c.polyline || []).length >= 2) || cards[0];
    id = card?.id || card?.stravaId || card?.activityId;
    if (!id) return null;
  }

  let res = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`), fetchOpts);
  let detail = await res.json().catch(() => null);
  let polyline = Array.isArray(detail?.polyline) && detail.polyline.length
    ? detail.polyline
    : (Array.isArray(detail?.streams?.latlng) ? detail.streams.latlng : []);

  if ((!polyline || polyline.length < 2) && id) {
    try {
      await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/enrich-details`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activityIds: [id], limit: 1 }),
      });
      res = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`), fetchOpts);
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
    detail,
  };
}
