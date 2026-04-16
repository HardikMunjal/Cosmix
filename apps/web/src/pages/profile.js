import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { persistClientUser, restoreUserSession } from '../lib/auth-client';
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

export default function Profile() {
  const router = useRouter();
  const fileRef = useRef(null);
  const { theme, themeId, setTheme } = useTheme();
  const [user, setUser] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [profileForm, setProfileForm] = useState({
    username: '',
    quote: '',
    avatar: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const styles = useMemo(() => getStyles(theme), [theme]);

  useEffect(() => {
    let active = true;

    restoreUserSession(router, setUser).then((sessionUser) => {
      if (!active || !sessionUser) return;
      setProfileForm({
        username: sessionUser.username || '',
        quote: sessionUser.quote || 'Building better decisions, one signal at a time.',
        avatar: sessionUser.avatar || '',
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
      updateForm('avatar', avatar);
      setStatus('New profile photo ready to save.');
    } catch (error) {
      console.error('Profile image read error', error);
      setStatus('Could not read that image. Try another file.');
    }
  };

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
          avatar: profileForm.avatar || '',
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.user) {
        throw new Error(data.error || 'Could not update profile.');
      }

      persistClientUser(data.user);
      setUser(data.user);
      setProfileForm({
        username: data.user.username,
        quote: data.user.quote || '',
        avatar: data.user.avatar || '',
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
          .profile-stats { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div style={styles.header} className="profile-header">
        <div>
          <div style={styles.eyebrow}>Account settings</div>
          <h1 style={styles.title}>Profile</h1>
          <p style={styles.subtitle}>Update your identity, image, theme, and track the personal stats that matter on one page.</p>
        </div>
        <div style={styles.headerActions} className="profile-actions">
          <button type="button" onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back to Dashboard</button>
          <button type="button" onClick={handleSave} style={styles.primaryButton} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
        </div>
      </div>

      <div style={styles.shell} className="profile-shell">
        <section style={styles.visualCard}>
          <div style={styles.avatarWrap}>
            {profileForm.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profileForm.avatar} alt="Profile" style={styles.avatarImage} />
            ) : (
              <div style={styles.avatarFallback}>{(profileForm.username || user.username || 'U').slice(0, 1).toUpperCase()}</div>
            )}
          </div>

          <div style={styles.visualMeta}>
            <div style={styles.profileName}>{profileForm.username || user.username}</div>
            <div style={styles.profileQuote}>"{profileForm.quote || 'Add your profile quote'}"</div>
          </div>

          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={styles.secondaryButton}>Upload Profile Photo</button>

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

        <section style={styles.formCard}>
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
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    avatarFallback: {
      fontSize: '84px',
      fontWeight: 800,
      color: theme.orange,
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