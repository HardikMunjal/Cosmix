const AVATAR_META_PREFIX = 'cosmix-avatar-v1:';

const DEFAULT_AVATAR_FRAMES = {
  face: { x: 0, y: -10, scale: 1.18 },
  body: { x: 0, y: 6, scale: 0.96 },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function normalizeFrame(frame, mode) {
  const fallback = DEFAULT_AVATAR_FRAMES[mode] || DEFAULT_AVATAR_FRAMES.face;
  return {
    x: clamp(frame?.x ?? fallback.x, -45, 45),
    y: clamp(frame?.y ?? fallback.y, -45, 45),
    scale: clamp(frame?.scale ?? fallback.scale, 0.72, 1.85),
  };
}

export function normalizeAvatarFrames(frames) {
  return {
    face: normalizeFrame(frames?.face, 'face'),
    body: normalizeFrame(frames?.body, 'body'),
  };
}

function safeBase64Encode(value) {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return window.btoa(unescape(encodeURIComponent(value)));
  }
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function safeBase64Decode(value) {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return decodeURIComponent(escape(window.atob(value)));
  }
  return Buffer.from(String(value), 'base64').toString('utf8');
}

export function parseAvatarProfile(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return {
      src: '',
      cutoutSrc: '',
      mode: 'face',
      removeBackground: false,
      frames: normalizeAvatarFrames(),
    };
  }

  if (!rawValue.startsWith(AVATAR_META_PREFIX)) {
    return {
      src: rawValue,
      cutoutSrc: '',
      mode: 'face',
      removeBackground: false,
      frames: normalizeAvatarFrames(),
    };
  }

  try {
    const decoded = safeBase64Decode(rawValue.slice(AVATAR_META_PREFIX.length));
    const parsed = JSON.parse(decoded || '{}');
    return {
      src: String(parsed.src || ''),
      cutoutSrc: String(parsed.cutoutSrc || ''),
      mode: parsed.mode === 'body' ? 'body' : 'face',
      removeBackground: Boolean(parsed.removeBackground && parsed.cutoutSrc),
      frames: normalizeAvatarFrames(parsed.frames),
    };
  } catch (_) {
    return {
      src: '',
      cutoutSrc: '',
      mode: 'face',
      removeBackground: false,
      frames: normalizeAvatarFrames(),
    };
  }
}

export function serializeAvatarProfile(profile) {
  const normalized = {
    src: String(profile?.src || ''),
    cutoutSrc: String(profile?.cutoutSrc || ''),
    mode: profile?.mode === 'body' ? 'body' : 'face',
    removeBackground: Boolean(profile?.removeBackground && profile?.cutoutSrc),
    frames: normalizeAvatarFrames(profile?.frames),
  };

  if (!normalized.src && !normalized.cutoutSrc) return '';
  if (!normalized.cutoutSrc && normalized.mode === 'face' && !normalized.removeBackground) {
    return normalized.src;
  }

  return `${AVATAR_META_PREFIX}${safeBase64Encode(JSON.stringify(normalized))}`;
}

export function resolveAvatarPresentation(value) {
  const profile = parseAvatarProfile(value);
  return {
    ...profile,
    displaySrc: profile.removeBackground && profile.cutoutSrc ? profile.cutoutSrc : profile.src,
    isCutout: Boolean(profile.removeBackground && profile.cutoutSrc),
    activeFrame: profile.frames[profile.mode === 'body' ? 'body' : 'face'],
  };
}
