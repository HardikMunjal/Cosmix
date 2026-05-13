import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { persistClientUser, restoreUserSession } from '../lib/auth-client';
import { normalizeAvatarFrames, parseAvatarProfile, serializeAvatarProfile, resolveAvatarPresentation } from '../lib/avatarProfile';
import { ThemePicker, useTheme } from '../lib/ThemePicker';
import { buildProfileInsights, formatCurrency, formatPace } from '../lib/userInsights';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function loadImageElement(src) {
  const image = new Image();
  image.decoding = 'async';
  const loaded = new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = reject;
  });
  image.src = src;
  return loaded;
}

async function buildCutoutSource(file, fallbackDataUrl) {
  const sourceUrl = file ? URL.createObjectURL(file) : fallbackDataUrl;
  try {
    const image = await loadImageElement(sourceUrl);
    const maxDimension = 1280;
    const longestSide = Math.max(image.naturalWidth || image.width || 0, image.naturalHeight || image.height || 0, 1);
    const scale = Math.min(1, maxDimension / longestSide);
    const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: true });
    context.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Unable to prepare image for cutout.'));
          return;
        }
        resolve(blob);
      }, 'image/png', 0.92);
    });
  } finally {
    if (file && sourceUrl) URL.revokeObjectURL(sourceUrl);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

function getAvatarMediaStyle({ avatar, frame, mode }) {
  const activeMode = mode === 'body' ? 'body' : 'face';
  const width = avatar.isCutout ? (activeMode === 'body' ? '84%' : '70%') : '112%';
  const height = avatar.isCutout ? (activeMode === 'body' ? '118%' : '82%') : '112%';

  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width,
    height,
    objectFit: avatar.isCutout ? 'contain' : 'cover',
    objectPosition: 'center center',
    transform: `translate(calc(-50% + ${frame.x}%), calc(-50% + ${frame.y}%)) scale(${frame.scale})`,
    filter: avatar.isCutout
      ? 'drop-shadow(0 28px 32px rgba(15, 23, 42, 0.34))'
      : 'drop-shadow(0 18px 24px rgba(15, 23, 42, 0.16))',
    pointerEvents: 'none',
    userSelect: 'none',
  };
}

function GuideOverlay({ mode, theme, frameX, frameY, markPos }) {
  const isFace = mode !== 'body';
  // Shift guide inversely to frame offset so it appears over the subject
  const shiftX = -(frameX || 0) * 0.55;
  const shiftY = -(frameY || 0) * 0.55;

  const faceRx = 20;
  const faceRy = 23;
  const faceCx = 50 + shiftX;
  const faceCy = 35 + shiftY;

  const bodyW = 50;
  const bodyH = 68;
  const bodyX = 50 - bodyW / 2 + shiftX;
  const bodyY = 15 + shiftY;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="guide-glow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {isFace ? (
        <>
          {/* Outer glow */}
          <ellipse cx={faceCx} cy={faceCy} rx={faceRx + 3} ry={faceRy + 3}
            fill="none" stroke={theme.orange} strokeWidth="4" opacity="0.12" filter="url(#guide-glow)" />
          {/* Dashed ellipse */}
          <ellipse cx={faceCx} cy={faceCy} rx={faceRx} ry={faceRy}
            fill="none" stroke={theme.orange} strokeWidth="1.4"
            strokeDasharray="5 3" opacity="0.85" />
          {/* Corner ticks */}
          <line x1={faceCx - faceRx} y1={faceCy} x2={faceCx - faceRx + 5} y2={faceCy} stroke={theme.orange} strokeWidth="2" opacity="0.9" />
          <line x1={faceCx + faceRx - 5} y1={faceCy} x2={faceCx + faceRx} y2={faceCy} stroke={theme.orange} strokeWidth="2" opacity="0.9" />
          <line x1={faceCx} y1={faceCy - faceRy} x2={faceCx} y2={faceCy - faceRy + 5} stroke={theme.orange} strokeWidth="2" opacity="0.9" />
          <line x1={faceCx} y1={faceCy + faceRy - 5} x2={faceCx} y2={faceCy + faceRy} stroke={theme.orange} strokeWidth="2" opacity="0.9" />
        </>
      ) : (
        <>
          {/* Outer glow */}
          <rect x={bodyX - 3} y={bodyY - 3} width={bodyW + 6} height={bodyH + 6} rx="8" ry="8"
            fill="none" stroke={theme.orange} strokeWidth="4" opacity="0.12" filter="url(#guide-glow)" />
          {/* Dashed body rect */}
          <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} rx="6" ry="6"
            fill="none" stroke={theme.orange} strokeWidth="1.4"
            strokeDasharray="5 3" opacity="0.85" />
          {/* Corner brackets */}
          {[
            [bodyX, bodyY, 6, 0, 0, 6],
            [bodyX + bodyW, bodyY, -6, 0, 0, 6],
            [bodyX, bodyY + bodyH, 6, 0, 0, -6],
            [bodyX + bodyW, bodyY + bodyH, -6, 0, 0, -6],
          ].map(([x, y, dx1, dy1, dx2, dy2], i) => (
            <path key={i} d={`M${x + dx1},${y + dy1} L${x},${y} L${x + dx2},${y + dy2}`}
              fill="none" stroke={theme.orange} strokeWidth="2" opacity="0.9" />
          ))}
        </>
      )}

      {/* Click flash */}
      {markPos && (
        <>
          <circle cx={markPos.x} cy={markPos.y} r="8"
            fill="none" stroke={theme.orange} strokeWidth="1.6" opacity="0.7" />
          <circle cx={markPos.x} cy={markPos.y} r="2.5"
            fill={theme.orange} opacity="0.95" />
          <line x1={markPos.x - 5} y1={markPos.y} x2={markPos.x + 5} y2={markPos.y}
            stroke={theme.orange} strokeWidth="1.2" opacity="0.7" />
          <line x1={markPos.x} y1={markPos.y - 5} x2={markPos.x} y2={markPos.y + 5}
            stroke={theme.orange} strokeWidth="1.2" opacity="0.7" />
        </>
      )}
    </svg>
  );
}

export default function Profile() {
  const router = useRouter();
  const fileRef = useRef(null);
  const avatarFileRef = useRef(null);
  const { theme, themeId, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [profileForm, setProfileForm] = useState({
    username: '',
    quote: '',
    avatar: '',
    avatarCutout: '',
    avatarMode: 'face',
    avatarRemoveBackground: false,
    avatarFrames: normalizeAvatarFrames(),
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [cutoutLoading, setCutoutLoading] = useState(false);
  const [editorTarget, setEditorTarget] = useState('face');
  const [markPos, setMarkPos] = useState(null);
  const markTimerRef = useRef(null);
  const styles = useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    let active = true;

    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!active || !sessionUser) return;
      const avatarProfile = parseAvatarProfile(sessionUser.avatar || '');
      setProfileForm({
        username: sessionUser.username || '',
        quote: sessionUser.quote || 'Building better decisions, one signal at a time.',
        avatar: avatarProfile.src || '',
        avatarCutout: avatarProfile.cutoutSrc || '',
        avatarMode: avatarProfile.mode || 'face',
        avatarRemoveBackground: avatarProfile.removeBackground || false,
        avatarFrames: normalizeAvatarFrames(avatarProfile.frames),
      });
    });

    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;

    fetch('/api/options-strategies')
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setStrategies(data?.strategies || []))
      .catch(() => setStrategies([]));
  }, [user]);

  const insights = useMemo(() => buildProfileInsights({ strategies, userId: user?.id }), [strategies, user?.id]);

  const updateForm = (key, value) => {
    setProfileForm((current) => ({ ...current, [key]: value }));
    setStatus('');
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    try {
      const avatar = await readFileAsDataUrl(file);
      avatarFileRef.current = file;
      setProfileForm((current) => ({
        ...current,
        avatar,
        avatarCutout: '',
        avatarMode: 'face',
        avatarRemoveBackground: false,
        avatarFrames: normalizeAvatarFrames(),
      }));
      setEditorTarget('face');
      setStatus('New profile photo ready. You can keep it original or generate a cutout.');
    } catch (error) {
      console.error('Profile image read error', error);
      setStatus('Could not read that image. Try another file.');
    }
  };

  const handleGenerateCutout = async () => {
    if (!profileForm.avatar) {
      setStatus('Upload a profile photo first.');
      return;
    }

    setCutoutLoading(true);
    setStatus('Preparing image for cutout...');
    try {
      const preparedBlob = await buildCutoutSource(avatarFileRef.current, profileForm.avatar);
      const preparedBuffer = await preparedBlob.arrayBuffer();

      setStatus('Starting cutout in background (page stays responsive)...');

      const cutoutDataUrl = await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('../workers/cutout.worker.js', import.meta.url));
        worker.onmessage = async (event) => {
          const { type } = event.data;
          if (type === 'progress') {
            setStatus(`Downloading cutout model... ${event.data.percent}%`);
          } else if (type === 'done') {
            worker.terminate();
            const resultBlob = new Blob([event.data.arrayBuffer], { type: 'image/png' });
            try {
              resolve(await readBlobAsDataUrl(resultBlob));
            } catch (readError) {
              reject(readError);
            }
          } else if (type === 'error') {
            worker.terminate();
            reject(new Error(event.data.message || 'Cutout worker failed'));
          }
        };
        worker.onerror = (err) => {
          worker.terminate();
          reject(err);
        };
        worker.postMessage({ arrayBuffer: preparedBuffer }, [preparedBuffer]);
      });

      setProfileForm((current) => ({
        ...current,
        avatarCutout: cutoutDataUrl,
        avatarRemoveBackground: true,
        avatarMode: current.avatarMode === 'body' ? 'body' : 'face',
      }));
      setStatus('Cutout ready. Choose face or body framing, then save.');
    } catch (error) {
      console.error('Avatar cutout error', error);
      setStatus('Could not generate cutout right now. Try another image or keep the original.');
    } finally {
      setCutoutLoading(false);
    }
  };

  const updateAvatarFrame = (target, updates) => {
    setProfileForm((current) => ({
      ...current,
      avatarFrames: normalizeAvatarFrames({
        ...current.avatarFrames,
        [target]: {
          ...current.avatarFrames?.[target],
          ...updates,
        },
      }),
    }));
    setStatus('');
  };

  const handlePreviewMark = (event) => {
    if (!avatarPreview.displaySrc) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const relativeX = (event.clientX - bounds.left) / Math.max(1, bounds.width);
    const relativeY = (event.clientY - bounds.top) / Math.max(1, bounds.height);
    const x = clamp((0.5 - relativeX) * 70, -35, 35);
    const y = clamp((0.5 - relativeY) * 80, -35, 35);
    updateAvatarFrame(editorTarget, { x, y });
    // Show click flash
    setMarkPos({ x: relativeX * 100, y: relativeY * 100 });
    if (markTimerRef.current) clearTimeout(markTimerRef.current);
    markTimerRef.current = setTimeout(() => setMarkPos(null), 700);
    setStatus(`${editorTarget === 'body' ? 'Body' : 'Face'} frame updated. Adjust with sliders if needed.`);
  };

  const avatarPreview = useMemo(() => resolveAvatarPresentation(serializeAvatarProfile({
    src: profileForm.avatar,
    cutoutSrc: profileForm.avatarCutout,
    mode: profileForm.avatarMode,
    removeBackground: profileForm.avatarRemoveBackground,
    frames: profileForm.avatarFrames,
  })), [profileForm.avatar, profileForm.avatarCutout, profileForm.avatarMode, profileForm.avatarRemoveBackground, profileForm.avatarFrames]);

  const editorFrame = profileForm.avatarFrames?.[editorTarget] || normalizeAvatarFrames()[editorTarget];
  const previewMode = editorTarget === 'body' ? 'body' : 'face';
  const previewFrame = avatarPreview.frames?.[previewMode] || editorFrame;

  const handleSave = async () => {
    const nextUsername = profileForm.username.trim();
    const nextQuote = profileForm.quote.trim();

    if (!nextUsername) {
      setStatus('Username is required.');
      return;
    }

    if (!nextQuote) {
      setStatus('Profile quote is required.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: nextUsername,
          quote: nextQuote,
          avatar: serializeAvatarProfile({
            src: profileForm.avatar || '',
            cutoutSrc: profileForm.avatarCutout || '',
            mode: profileForm.avatarMode,
            removeBackground: profileForm.avatarRemoveBackground,
            frames: profileForm.avatarFrames,
          }),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Could not update profile.');
      }

      const avatarProfile = parseAvatarProfile(data.user.avatar || '');
      persistClientUser(data.user);
      setUser(data.user);
      setProfileForm({
        username: data.user.username,
        quote: data.user.quote || '',
        avatar: avatarProfile.src || '',
        avatarCutout: avatarProfile.cutoutSrc || '',
        avatarMode: avatarProfile.mode || 'face',
        avatarRemoveBackground: avatarProfile.removeBackground || false,
        avatarFrames: normalizeAvatarFrames(avatarProfile.frames),
      });
      setStatus('Profile updated successfully.');
    } catch (error) {
      setStatus(error.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: theme.pageBgSolid, color: theme.textPrimary, fontFamily: theme.font }}>Loading...</div>;
  }

  const authLabel = user.authMethod === 'gmail' ? 'Gmail sign-in' : 'Username and password';
  const statCards = [
    { label: 'Total profit', value: formatCurrency(insights.totalProfit), hint: 'Across your saved strategies', accent: insights.totalProfit >= 0 ? theme.green : theme.red },
    { label: 'Total fitness score', value: String(insights.totalFitnessScore), hint: 'From your logged wellness entries', accent: theme.blue },
    { label: 'Total friends', value: String(insights.totalFriends), hint: 'Known chat contacts', accent: theme.orange },
    { label: 'Running streak', value: `${insights.runningStreak} day${insights.runningStreak === 1 ? '' : 's'}`, hint: `${insights.weeklyRunningKm} km this week`, accent: theme.emerald },
    { label: 'Highest run', value: `${insights.highestRunKm.toFixed(2)} km`, hint: 'Best logged distance', accent: theme.cyan },
    { label: 'Fastest run', value: formatPace(insights.fastestRunPace), hint: 'Runs above 2 km only', accent: theme.purple },
  ];

  return (
    <div style={styles.page} className="profile-page">
      <style>{`
        * { box-sizing: border-box; }
        html, body, #__next { min-height: 100%; margin: 0; }
        @media (max-width: 1080px) {
          .profile-shell { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 720px) {
          .profile-page { padding: 14px !important; }
          .profile-header { flex-direction: column !important; align-items: flex-start !important; }
          .profile-actions { width: 100%; }
          .profile-actions button { width: 100%; }
          .profile-visual-card,
          .profile-form-card { padding: 16px !important; border-radius: 20px !important; }
          .profile-avatar-wrap { aspect-ratio: 1 / 1 !important; border-radius: 22px !important; }
          .profile-cutout-modes { grid-template-columns: 1fr !important; }
          .profile-editor-targets { grid-template-columns: 1fr 1fr !important; }
          .profile-stats { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 520px) {
          .profile-page { padding: 10px !important; }
          .profile-title-copy { font-size: 13px !important; line-height: 1.5 !important; }
          .profile-avatar-wrap { min-height: 280px !important; }
          .profile-editor-targets { grid-template-columns: 1fr !important; }
          .profile-actions { position: sticky !important; bottom: 10px; z-index: 3; }
          .profile-actions button { box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16) !important; }
        }
      `}</style>

      <div style={styles.header} className="profile-header">
        <div>
          <div style={styles.eyebrow}>Account settings</div>
          <h1 style={styles.title}>Profile</h1>
          <p style={styles.subtitle} className="profile-title-copy">Update your identity, image, theme, and track the personal stats that matter on one page.</p>
        </div>
        <div style={styles.headerActions} className="profile-actions">
          <button type="button" onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back to Dashboard</button>
          <button type="button" onClick={handleSave} style={styles.primaryButton} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>
      </div>

      <div style={styles.shell} className="profile-shell">
        <section style={styles.visualCard} className="profile-visual-card">
          <div style={{ ...styles.avatarWrap, cursor: avatarPreview.displaySrc ? 'crosshair' : 'default' }} className="profile-avatar-wrap" onClick={handlePreviewMark}>
            {avatarPreview.displaySrc ? (
              <>
                <div style={styles.previewAura} />
                <div style={styles.previewFloor} />
                <div style={{ ...styles.previewStage, ...(avatarPreview.isCutout ? styles.previewStageCutout : null) }}>
                  <img src={avatarPreview.displaySrc} alt="Profile" style={getAvatarMediaStyle({ avatar: avatarPreview, frame: previewFrame, mode: previewMode })} />
                </div>
                <GuideOverlay mode={editorTarget} theme={theme} frameX={editorFrame.x} frameY={editorFrame.y} markPos={markPos} />
              </>
            ) : (
              <div style={styles.avatarFallback}>{(profileForm.username || user.username || 'U').slice(0, 1).toUpperCase()}</div>
            )}
          </div>

          <div style={styles.visualMeta}>
            <div style={styles.profileName}>{profileForm.username || user.username}</div>
            <div style={styles.profileQuote}>"{profileForm.quote || 'Add your profile quote'}"</div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          <div style={styles.avatarActionStack}>
            <button type="button" onClick={() => fileRef.current?.click()} style={styles.secondaryButton}>Upload Profile Photo</button>
            <button type="button" onClick={handleGenerateCutout} style={styles.primaryButton} disabled={cutoutLoading || !profileForm.avatar}>
              {cutoutLoading ? 'Cutting out...' : 'Generate Cutout'}
            </button>
          </div>

          <div style={styles.cutoutCard}>
            <div style={styles.infoLabel}>Avatar style</div>
            <div style={styles.cutoutModeRow} className="profile-cutout-modes">
              <button type="button" onClick={() => setProfileForm((current) => ({ ...current, avatarRemoveBackground: false }))} style={{ ...styles.cutoutModeButton, ...(!profileForm.avatarRemoveBackground ? styles.cutoutModeButtonActive : {}) }}>Original</button>
              <button type="button" onClick={() => { setEditorTarget('face'); setProfileForm((current) => ({ ...current, avatarRemoveBackground: true, avatarMode: 'face' })); }} style={{ ...styles.cutoutModeButton, ...(profileForm.avatarRemoveBackground && profileForm.avatarMode === 'face' ? styles.cutoutModeButtonActive : {}) }} disabled={!profileForm.avatarCutout}>Face cutout</button>
              <button type="button" onClick={() => { setEditorTarget('body'); setProfileForm((current) => ({ ...current, avatarRemoveBackground: true, avatarMode: 'body' })); }} style={{ ...styles.cutoutModeButton, ...(profileForm.avatarRemoveBackground && profileForm.avatarMode === 'body' ? styles.cutoutModeButtonActive : {}) }} disabled={!profileForm.avatarCutout}>Body cutout</button>
            </div>
            <div style={styles.cutoutHint}>Upload a portrait, then generate a cutout. Face mode keeps a tighter hero crop. Body mode leaves more full-length silhouette for the dashboard.</div>

            <div style={styles.manualEditorCard}>
              <div style={styles.infoLabel}>Manual mark and framing</div>
              <div style={styles.editorTargetRow} className="profile-editor-targets">
                <button type="button" onClick={() => { setEditorTarget('face'); setProfileForm((current) => ({ ...current, avatarMode: 'face' })); }} style={{ ...styles.cutoutModeButton, ...(editorTarget === 'face' ? styles.cutoutModeButtonActive : {}) }}>Mark face</button>
                <button type="button" onClick={() => { setEditorTarget('body'); setProfileForm((current) => ({ ...current, avatarMode: 'body' })); }} style={{ ...styles.cutoutModeButton, ...(editorTarget === 'body' ? styles.cutoutModeButtonActive : {}) }}>Mark body</button>
              </div>
              <div style={styles.cutoutHint}>Tap the preview to center the selected area, then fine-tune with the sliders below. Face and body are saved separately.</div>
              <label style={styles.rangeLabel}>
                Zoom
                <input type="range" min="72" max="185" value={Math.round(editorFrame.scale * 100)} onChange={(event) => updateAvatarFrame(editorTarget, { scale: Number(event.target.value) / 100 })} style={styles.rangeInput} />
              </label>
              <label style={styles.rangeLabel}>
                Horizontal
                <input type="range" min="-35" max="35" value={Math.round(editorFrame.x)} onChange={(event) => updateAvatarFrame(editorTarget, { x: Number(event.target.value) })} style={styles.rangeInput} />
              </label>
              <label style={styles.rangeLabel}>
                Vertical
                <input type="range" min="-35" max="35" value={Math.round(editorFrame.y)} onChange={(event) => updateAvatarFrame(editorTarget, { y: Number(event.target.value) })} style={styles.rangeInput} />
              </label>
            </div>
          </div>

          <div style={styles.quickInfoCard}>
            <div style={styles.infoLabel}>Sign-in method</div>
            <div style={styles.infoValue}>{authLabel}</div>
          </div>
          <div style={styles.quickInfoCard}>
            <div style={styles.infoLabel}>Email</div>
            <div style={styles.infoValue}>{user.email || 'Not added'}</div>
          </div>
          <div style={styles.quickInfoCard}>
            <div style={styles.infoLabel}>Mobile</div>
            <div style={styles.infoValue}>{user.mobile || 'Not added'}</div>
          </div>
        </section>

        <section style={styles.formCard} className="profile-form-card">
          <div style={styles.block}>
            <div style={styles.sectionTitle}>Personal details</div>

            <label style={styles.label}>
              Username
              <input value={profileForm.username} onChange={(event) => updateForm('username', event.target.value)} style={styles.input} placeholder="Enter your username" />
            </label>

            <label style={styles.label}>
              Profile quote
              <textarea value={profileForm.quote} onChange={(event) => updateForm('quote', event.target.value)} style={{ ...styles.input, ...styles.textarea }} placeholder="Write a short line for your profile" />
            </label>
          </div>

          <div style={styles.block}>
            <div style={styles.sectionTitle}>Profile stats</div>
            <div style={styles.statsGrid} className="profile-stats">
              {statCards.map((card) => (
                <div key={card.label} style={styles.statCard}>
                  <div style={styles.infoLabel}>{card.label}</div>
                  <div style={{ ...styles.statValue, color: card.accent }}>{card.value}</div>
                  <div style={styles.statHint}>{card.hint}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.themeCard}>
            <div style={styles.sectionTitle}>Theme settings</div>
            <div style={styles.themeHint}>Theme selection lives here so the dashboard can stay focused on work and live metrics.</div>
            <ThemePicker theme={theme} themeId={themeId} setTheme={setTheme} />
          </div>

          {status ? <div style={styles.status}>{status}</div> : null}
        </section>
      </div>
    </div>
  );
}

function getStyles(theme) {
  return {
    page: {
      minHeight: '100vh',
      padding: '24px',
      background: theme.pageBg,
      color: theme.textPrimary,
      fontFamily: theme.font,
    },
    header: {
      maxWidth: '1240px',
      margin: '0 auto 22px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '16px',
      padding: '22px 24px',
      borderRadius: '24px',
      background: theme.panelBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: `0 20px 60px ${theme.shadow}`,
    },
    eyebrow: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.14em',
      color: theme.textMuted,
      marginBottom: '8px',
    },
    title: {
      margin: 0,
      fontSize: '32px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    subtitle: {
      margin: '8px 0 0',
      maxWidth: '620px',
      fontSize: '15px',
      lineHeight: 1.6,
      color: theme.textSecondary,
    },
    headerActions: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center',
    },
    shell: {
      maxWidth: '1240px',
      margin: '0 auto',
      display: 'grid',
      gridTemplateColumns: '340px minmax(0, 1fr)',
      gap: '22px',
    },
    visualCard: {
      display: 'grid',
      gap: '16px',
      alignContent: 'start',
      padding: '24px',
      borderRadius: '26px',
      background: theme.cardBgGradient,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: `0 20px 60px ${theme.shadow}`,
    },
    avatarWrap: {
      width: '100%',
      aspectRatio: '1 / 1',
      borderRadius: '30px',
      overflow: 'hidden',
      background: `linear-gradient(135deg, ${theme.sectionBg}, ${theme.cardBg})`,
      border: `1px solid ${theme.inputBorder}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    previewAura: {
      position: 'absolute',
      width: '62%',
      height: '62%',
      borderRadius: '50%',
      background: `${theme.cyan}26`,
      filter: 'blur(36px)',
    },
    previewFloor: {
      position: 'absolute',
      bottom: '10%',
      width: '62%',
      height: '12%',
      borderRadius: '999px',
      background: `${theme.shadow}44`,
      filter: 'blur(12px)',
    },
    previewStage: {
      position: 'absolute',
      inset: '0',
      overflow: 'hidden',
    },
    previewStageCutout: {
      background: 'transparent',
    },
    avatarFallback: {
      fontSize: '84px',
      fontWeight: 800,
      color: theme.orange,
    },
    avatarActionStack: {
      display: 'grid',
      gap: '10px',
    },
    cutoutCard: {
      padding: '14px 16px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: '10px',
    },
    cutoutModeRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '8px',
    },
    cutoutModeButton: {
      border: `1px solid ${theme.inputBorder}`,
      borderRadius: '12px',
      padding: '10px 12px',
      background: theme.inputBg,
      color: theme.textSecondary,
      fontSize: '12px',
      fontWeight: 700,
      cursor: 'pointer',
    },
    cutoutModeButtonActive: {
      background: theme.orange,
      border: `1px solid ${theme.orange}`,
      color: '#fff',
      boxShadow: `0 14px 28px ${theme.shadow}`,
    },
    cutoutHint: {
      fontSize: '12px',
      lineHeight: 1.5,
      color: theme.textSecondary,
    },
    manualEditorCard: {
      marginTop: '6px',
      paddingTop: '12px',
      borderTop: `1px solid ${theme.cardBorder}`,
      display: 'grid',
      gap: '10px',
    },
    editorTargetRow: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '8px',
    },
    rangeLabel: {
      display: 'grid',
      gap: '6px',
      fontSize: '12px',
      fontWeight: 700,
      color: theme.textSecondary,
    },
    rangeInput: {
      width: '100%',
      accentColor: theme.orange,
      cursor: 'pointer',
    },
    visualMeta: {
      display: 'grid',
      gap: '8px',
    },
    profileName: {
      fontSize: '28px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    profileQuote: {
      fontSize: '15px',
      lineHeight: 1.6,
      color: theme.textSecondary,
    },
    quickInfoCard: {
      padding: '14px 16px',
      borderRadius: '18px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: '8px',
    },
    formCard: {
      display: 'grid',
      gap: '18px',
      padding: '24px',
      borderRadius: '26px',
      background: theme.panelBg,
      border: `1px solid ${theme.cardBorder}`,
      boxShadow: `0 20px 60px ${theme.shadow}`,
    },
    block: {
      display: 'grid',
      gap: '16px',
    },
    sectionTitle: {
      fontSize: '20px',
      fontWeight: 800,
      color: theme.textHeading,
    },
    label: {
      display: 'grid',
      gap: '8px',
      fontSize: '13px',
      fontWeight: 700,
      color: theme.textMid,
    },
    input: {
      width: '100%',
      borderRadius: '16px',
      border: `1px solid ${theme.inputBorder}`,
      background: theme.inputBg,
      padding: '14px 16px',
      fontSize: '15px',
      color: theme.textHeading,
      outline: 'none',
      fontFamily: theme.font,
    },
    textarea: {
      minHeight: '120px',
      resize: 'vertical',
    },
    statsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: '14px',
    },
    statCard: {
      padding: '16px',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
      display: 'grid',
      gap: '8px',
    },
    infoLabel: {
      fontSize: '11px',
      fontWeight: 800,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: theme.textMuted,
    },
    infoValue: {
      fontSize: '15px',
      fontWeight: 700,
      color: theme.textHeading,
      wordBreak: 'break-word',
    },
    statValue: {
      fontSize: '24px',
      fontWeight: 800,
      color: theme.textHeading,
      wordBreak: 'break-word',
    },
    statHint: {
      fontSize: '13px',
      lineHeight: 1.5,
      color: theme.textSecondary,
    },
    themeCard: {
      display: 'grid',
      gap: '12px',
      padding: '18px',
      borderRadius: '20px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.cardBg,
    },
    themeHint: {
      fontSize: '14px',
      lineHeight: 1.6,
      color: theme.textSecondary,
    },
    status: {
      padding: '14px 16px',
      borderRadius: '16px',
      background: theme.btnSecondaryBg,
      border: `1px solid ${theme.inputBorder}`,
      color: theme.textPrimary,
      fontSize: '14px',
      fontWeight: 600,
    },
    primaryButton: {
      border: 'none',
      borderRadius: '14px',
      padding: '12px 18px',
      background: theme.orange,
      color: '#fff',
      fontSize: '14px',
      fontWeight: 700,
      cursor: 'pointer',
    },
    secondaryButton: {
      border: `1px solid ${theme.inputBorder}`,
      borderRadius: '14px',
      padding: '12px 18px',
      background: theme.btnSecondaryBg,
      color: theme.btnSecondaryText,
      fontSize: '14px',
      fontWeight: 700,
      cursor: 'pointer',
    },
  };
}