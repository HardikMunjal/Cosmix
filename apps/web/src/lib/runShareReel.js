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
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || null;
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
  const speed = distance > 0 && minutes > 0 ? distance / (minutes / 60) : 0;

  const cards = [
    { label: 'DISTANCE', value: distance ? (distance * reveal).toFixed(2) : '--', unit: 'km', color: '#fdba74' },
    { label: 'AVG PACE', value: pace ? fmtPace(pace) : '--', unit: '/km', color: '#7dd3fc' },
    { label: 'TIME', value: minutes ? fmtMins(minutes * reveal) : '--', unit: '', color: '#c4b5fd' },
    { label: 'AVG HR', value: hr ? String(Math.round(hr * reveal)) : '--', unit: hr ? 'bpm' : '', color: '#fda4af' },
  ];

  if (split > 0) {
    cards.push({ label: 'BEST 1 KM', value: fmtPace(split), unit: '/km', color: '#86efac' });
  } else if (speed > 0) {
    cards.push({ label: 'AVG SPEED', value: (speed * reveal).toFixed(1), unit: 'km/h', color: '#86efac' });
  }

  if (elev > 0) {
    cards.push({ label: 'ELEVATION', value: String(Math.round(elev * reveal)), unit: 'm', color: '#a5b4fc' });
  } else if (maxHr > 0) {
    cards.push({ label: 'MAX HR', value: String(Math.round(maxHr * reveal)), unit: 'bpm', color: '#a5b4fc' });
  }

  if (cadence > 0) {
    cards.push({ label: 'CADENCE', value: String(Math.round(cadence * reveal)), unit: 'spm', color: '#f9a8d4' });
  } else if (calories > 0) {
    cards.push({ label: 'CALORIES', value: String(Math.round(calories * reveal)), unit: 'kcal', color: '#f9a8d4' });
  } else if (speed > 0 && split > 0) {
    cards.push({ label: 'AVG SPEED', value: (speed * reveal).toFixed(1), unit: 'km/h', color: '#f9a8d4' });
  }

  return cards.slice(0, 8);
}

/**
 * Render one frame of the share reel onto ctx.
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
  const mapReveal = easeInOut(clamp((t - 0.05) / 0.7, 0, 1));
  const statsReveal = easeOutCubic(clamp((t - 0.2) / 0.4, 0, 1));
  const brandPulse = 0.55 + Math.sin(t * Math.PI * 5) * 0.1;

  // Space background
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#020617');
  bg.addColorStop(0.5, '#0b1226');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const blobA = ctx.createRadialGradient(width * 0.18, height * 0.12, 10, width * 0.18, height * 0.12, width * 0.5);
  blobA.addColorStop(0, `rgba(249,115,22,${0.16 * brandPulse})`);
  blobA.addColorStop(1, 'rgba(249,115,22,0)');
  ctx.fillStyle = blobA;
  ctx.fillRect(0, 0, width, height);

  const blobB = ctx.createRadialGradient(width * 0.88, height * 0.42, 10, width * 0.88, height * 0.42, width * 0.48);
  blobB.addColorStop(0, 'rgba(56,189,248,0.14)');
  blobB.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = blobB;
  ctx.fillRect(0, 0, width, height);

  // Soft stars
  ctx.fillStyle = 'rgba(226,232,240,0.35)';
  for (let i = 0; i < 28; i += 1) {
    const sx = (i * 97) % width;
    const sy = (i * 53 + Math.sin(t * 8 + i) * 4) % (height * 0.55);
    ctx.beginPath();
    ctx.arc(sx, sy, i % 5 === 0 ? 2.2 : 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Header: logo + Cosmix name
  const logoSize = 72;
  const logoX = 56;
  const logoY = 52;
  if (logoImage) {
    drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 18);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
    ctx.restore();
    ctx.strokeStyle = 'rgba(103,232,249,0.35)';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 18);
    ctx.stroke();
  } else {
    drawUniverseMark(ctx, logoX, logoY, logoSize);
  }

  ctx.fillStyle = '#f8fafc';
  ctx.font = '900 42px system-ui, sans-serif';
  ctx.fillText('COSMIX', logoX + logoSize + 18, logoY + 42);
  ctx.fillStyle = 'rgba(148,163,184,0.95)';
  ctx.font = '600 22px system-ui, sans-serif';
  const sub = athleteName ? `${athleteName}'s run replay` : 'Universe of your run';
  ctx.fillText(sub, logoX + logoSize + 18, logoY + 72);

  // Map stage — larger, centered route
  const cardX = 40;
  const cardY = 150;
  const cardW = width - 80;
  const cardH = Math.round(height * 0.46);
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 32);
  ctx.fillStyle = 'rgba(8,15,30,0.92)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,211,252,0.28)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.clip();

  // Map vignette
  const mapGlow = ctx.createRadialGradient(
    cardX + cardW / 2,
    cardY + cardH / 2,
    40,
    cardX + cardW / 2,
    cardY + cardH / 2,
    cardW * 0.55,
  );
  mapGlow.addColorStop(0, 'rgba(56,189,248,0.1)');
  mapGlow.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = mapGlow;
  ctx.fillRect(cardX, cardY, cardW, cardH);

  const route = projectPolyline(polyline, cardW, cardH, 56).map((p) => ({
    x: p.x + cardX,
    y: p.y + cardY,
    lat: p.lat,
    lng: p.lng,
  }));

  if (route.length >= 2) {
    const fullLen = pathLength(route);
    let drawn = 0;
    const target = mapReveal * fullLen;

    // Ghost full route (always show complete shape faintly)
    ctx.beginPath();
    route.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = 'rgba(148,163,184,0.28)';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Progressive glow trail
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
    ctx.shadowBlur = 20;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Start / finish
    const start = route[0];
    const end = route[route.length - 1];
    ctx.beginPath();
    ctx.arc(start.x, start.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#86efac';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(end.x, end.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = mapReveal > 0.92 ? '#38bdf8' : 'rgba(56,189,248,0.35)';
    ctx.fill();

    const runner = pointAlong(route, mapReveal);
    if (runner) {
      for (let s = 0; s < 8; s += 1) {
        const ang = (s / 8) * Math.PI * 2 + t * 12;
        const rad = 16 + (s % 3) * 7;
        ctx.beginPath();
        ctx.arc(runner.x + Math.cos(ang) * rad, runner.y + Math.sin(ang) * rad, 2, 0, Math.PI * 2);
        ctx.fillStyle = s % 2 === 0 ? 'rgba(125,211,252,0.85)' : 'rgba(253,186,116,0.8)';
        ctx.fill();
      }
      for (let i = 3; i >= 1; i -= 1) {
        ctx.beginPath();
        ctx.arc(runner.x, runner.y, 11 + i * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56,189,248,${0.18 / i})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const orb = ctx.createRadialGradient(runner.x - 4, runner.y - 4, 2, runner.x, runner.y, 15);
      orb.addColorStop(0, '#ecfeff');
      orb.addColorStop(0.45, '#7dd3fc');
      orb.addColorStop(1, '#f97316');
      ctx.beginPath();
      ctx.arc(runner.x, runner.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = orb;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Location chip
    const place = summary.locationCity || summary.name || '';
    if (place) {
      ctx.fillStyle = 'rgba(2,6,23,0.72)';
      drawRoundedRect(ctx, cardX + 20, cardY + cardH - 58, Math.min(cardW - 40, 420), 38, 12);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText(String(place).slice(0, 34), cardX + 34, cardY + cardH - 32);
    }
  } else {
    ctx.fillStyle = 'rgba(148,163,184,0.75)';
    ctx.font = '600 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Route not available', width / 2, cardY + cardH / 2);
    ctx.textAlign = 'left';
  }
  ctx.restore();

  // Analytics grid
  const stats = buildAnalytics(summary, statsReveal);
  const cols = Math.min(4, Math.max(2, Math.ceil(stats.length / 2)));
  const rows = Math.ceil(stats.length / cols);
  const gap = 14;
  const gridX = 40;
  const gridY = cardY + cardH + 28;
  const boxW = (width - 80 - gap * (cols - 1)) / cols;
  const boxH = 112;

  stats.forEach((stat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridX + col * (boxW + gap);
    const y = gridY + row * (boxH + gap);
    const lift = (1 - statsReveal) * 24;
    ctx.save();
    ctx.globalAlpha = 0.4 + statsReveal * 0.6;
    drawRoundedRect(ctx, x, y + lift, boxW, boxH, 20);
    ctx.fillStyle = 'rgba(15,23,42,0.92)';
    ctx.fill();
    ctx.strokeStyle = `${stat.color}55`;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.95)';
    ctx.font = '700 15px "DM Mono", ui-monospace, monospace';
    ctx.fillText(stat.label, x + 16, y + lift + 32);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 32px system-ui, sans-serif';
    ctx.fillText(stat.value, x + 16, y + lift + 72);
    if (stat.unit) {
      ctx.fillStyle = stat.color;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillText(stat.unit, x + 16, y + lift + 96);
    }
    ctx.restore();
  });

  // Bottom Cosmix brand bar
  const barY = height - 130;
  drawRoundedRect(ctx, 40, barY, width - 80, 78, 22);
  const barGrad = ctx.createLinearGradient(40, barY, width - 40, barY + 78);
  barGrad.addColorStop(0, 'rgba(249,115,22,0.92)');
  barGrad.addColorStop(0.55, 'rgba(56,189,248,0.88)');
  barGrad.addColorStop(1, 'rgba(129,140,248,0.9)');
  ctx.fillStyle = barGrad;
  ctx.fill();

  if (logoImage) {
    ctx.drawImage(logoImage, 58, barY + 12, 54, 54);
  } else {
    drawUniverseMark(ctx, 58, barY + 12, 54);
  }
  ctx.fillStyle = '#0f172a';
  ctx.font = '900 34px system-ui, sans-serif';
  ctx.fillText('COSMIX', 128, barY + 40);
  ctx.font = '700 18px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(15,23,42,0.78)';
  ctx.fillText('Train · Track · Share the universe', 128, barY + 64);

  void rows;
}

/**
 * Record a Cosmix run share video.
 */
export async function renderRunShareReel({
  polyline = [],
  summary = {},
  athleteName = '',
  durationMs = 6200,
  width = 1080,
  height = 1920,
  fps = 30,
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

  const mimeType = pickMimeType();
  if (!mimeType || typeof canvas.captureStream !== 'function') {
    draw(1);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    return {
      blob, url, mimeType: 'image/png', width, height, isImage: true,
    };
  }

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 7_500_000,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
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

  recorder.start(100);
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
        }, 260);
      }
    };
    requestAnimationFrame(tick);
  });

  return done;
}

export async function shareOrDownloadRunReel(result, {
  title = 'My Cosmix run',
  text = 'Check out my run on Cosmix',
  filename,
} = {}) {
  if (!result?.blob) throw new Error('Nothing to share');
  const ext = result.isImage ? 'png' : (String(result.mimeType || '').includes('mp4') ? 'mp4' : 'webm');
  const name = filename || `cosmix-run.${ext}`;
  const file = new File([result.blob], name, { type: result.mimeType || result.blob.type });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return { method: 'share' };
  }

  if (typeof navigator !== 'undefined' && navigator.share && result.isImage) {
    try {
      await navigator.share({ files: [file], title, text });
      return { method: 'share' };
    } catch (_) { /* fall through */ }
  }

  const a = document.createElement('a');
  a.href = result.url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return { method: 'download' };
}

/** Fetch latest (or specific) run detail for sharing. */
export async function fetchShareableRun(userId, activityId, wellnessApiUrl) {
  if (!userId || !wellnessApiUrl) return null;
  let id = activityId;
  if (!id) {
    const mapsRes = await fetch(wellnessApiUrl(`/wellness/strava/maps/${encodeURIComponent(userId)}?limit=8`));
    const maps = await mapsRes.json().catch(() => null);
    const card = (maps?.cards || maps?.runs || []).find((c) => (c.polyline || []).length >= 2)
      || (maps?.cards || maps?.runs || [])[0];
    id = card?.id || card?.stravaId || card?.activityId;
    if (!id) return null;
  }
  const res = await fetch(wellnessApiUrl(`/wellness/strava/runs/${encodeURIComponent(userId)}/${encodeURIComponent(id)}`));
  const detail = await res.json().catch(() => null);
  if (!res.ok || !detail) return null;
  const polyline = detail.polyline?.length
    ? detail.polyline
    : (detail.streams?.latlng || []);
  return {
    activityId: id,
    summary: detail.summary || {},
    polyline,
    detail,
  };
}
