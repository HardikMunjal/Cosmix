import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';

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
  const [user, setUser] = useState(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    quote: '',
    avatar: '',
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/');
      return;
    }

    const parsedUser = JSON.parse(storedUser);
    setUser(parsedUser);
    setProfileForm({
      username: parsedUser.username || '',
      quote: parsedUser.quote || 'Building better decisions, one signal at a time.',
      avatar: parsedUser.avatar || '',
    });
  }, [router]);

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

  const handleSave = () => {
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
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const nextUser = {
      ...storedUser,
      username: nextUsername,
      quote: nextQuote,
      avatar: profileForm.avatar || '',
    };
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
    setProfileForm({
      username: nextUser.username,
      quote: nextUser.quote,
      avatar: nextUser.avatar || '',
    });
    setSaving(false);
    setStatus('Profile updated successfully.');
  };

  if (!user) return <div style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>Loading...</div>;

  const authLabel = user.authMethod === 'gmail'
    ? 'Gmail sign-in'
    : user.authMethod === 'mobile-otp'
      ? 'Mobile OTP'
      : 'Local account';

  return (
    <div style={styles.page} className="profile-page">
      <style>{`
        @media (max-width: 960px) {
          .profile-shell { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 640px) {
          .profile-page { padding: 14px !important; }
          .profile-header { flex-direction: column !important; align-items: flex-start !important; }
          .profile-actions { width: 100%; }
          .profile-actions button { width: 100%; }
        }
      `}</style>

      <div style={styles.header} className="profile-header">
        <div>
          <div style={styles.eyebrow}>Account settings</div>
          <h1 style={styles.title}>Profile</h1>
          <p style={styles.subtitle}>Update your name, quote, and profile photo from one place.</p>
        </div>
        <div style={styles.headerActions} className="profile-actions">
          <button onClick={() => router.push('/dashboard')} style={styles.secondaryButton}>Back to Dashboard</button>
          <button onClick={handleSave} style={styles.primaryButton} disabled={saving}>{saving ? 'Saving...' : 'Save Profile'}</button>
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
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <button onClick={() => fileRef.current?.click()} style={styles.secondaryButton}>Upload Profile Photo</button>
          <div style={styles.helperText}>The uploaded image is used directly. No cartoon effect is applied.</div>
        </section>

        <section style={styles.formCard}>
          <div style={styles.sectionTitle}>Personal details</div>

          <label style={styles.label}>
            Username
            <input
              value={profileForm.username}
              onChange={(event) => updateForm('username', event.target.value)}
              style={styles.input}
              placeholder="Enter your username"
            />
          </label>

          <label style={styles.label}>
            Profile quote
            <textarea
              value={profileForm.quote}
              onChange={(event) => updateForm('quote', event.target.value)}
              style={{ ...styles.input, ...styles.textarea }}
              placeholder="Write a short line for your profile"
            />
          </label>

          <div style={styles.infoGrid}>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Sign-in method</div>
              <div style={styles.infoValue}>{authLabel}</div>
            </div>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Email</div>
              <div style={styles.infoValue}>{user.email || 'Not added'}</div>
            </div>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Mobile</div>
              <div style={styles.infoValue}>{user.mobile || 'Not added'}</div>
            </div>
            <div style={styles.infoCard}>
              <div style={styles.infoLabel}>Workspace</div>
              <div style={styles.infoValue}>Cosmix Web</div>
            </div>
          </div>

          {status ? <div style={styles.status}>{status}</div> : null}
        </section>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    padding: '24px',
    background: 'linear-gradient(180deg, #fff8ef, #fff1e6)',
    color: '#1f2937',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    maxWidth: '1180px',
    margin: '0 auto 22px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    padding: '22px 24px',
    borderRadius: '24px',
    background: 'rgba(255, 253, 248, 0.94)',
    border: '1px solid #f3d2b1',
    boxShadow: '0 20px 60px rgba(249, 115, 22, 0.12)',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: '#8b98ab',
    marginBottom: '8px',
  },
  title: {
    margin: 0,
    fontSize: '32px',
    fontWeight: 800,
    color: '#0f172a',
  },
  subtitle: {
    margin: '8px 0 0',
    maxWidth: '560px',
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#5b6472',
  },
  headerActions: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  shell: {
    maxWidth: '1180px',
    margin: '0 auto',
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr)',
    gap: '22px',
  },
  visualCard: {
    display: 'grid',
    gap: '18px',
    alignContent: 'start',
    padding: '24px',
    borderRadius: '24px',
    background: 'linear-gradient(180deg, #fffdf8, #fff4e7)',
    border: '1px solid #f3d2b1',
    boxShadow: '0 20px 60px rgba(249, 115, 22, 0.1)',
  },
  avatarWrap: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: '28px',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #fde7cf, #fff8ef)',
    border: '1px solid #fdba74',
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
    color: '#ea580c',
  },
  visualMeta: {
    display: 'grid',
    gap: '8px',
  },
  profileName: {
    fontSize: '28px',
    fontWeight: 800,
    color: '#0f172a',
  },
  profileQuote: {
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#5b6472',
  },
  formCard: {
    display: 'grid',
    gap: '18px',
    padding: '24px',
    borderRadius: '24px',
    background: 'rgba(255, 253, 248, 0.94)',
    border: '1px solid #f3d2b1',
    boxShadow: '0 20px 60px rgba(249, 115, 22, 0.1)',
  },
  sectionTitle: {
    fontSize: '19px',
    fontWeight: 800,
    color: '#0f172a',
  },
  label: {
    display: 'grid',
    gap: '8px',
    fontSize: '13px',
    fontWeight: 700,
    color: '#475569',
  },
  input: {
    width: '100%',
    borderRadius: '16px',
    border: '1px solid #fdba74',
    background: '#fff7ed',
    padding: '14px 16px',
    fontSize: '15px',
    color: '#0f172a',
    outline: 'none',
  },
  textarea: {
    minHeight: '120px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '12px',
  },
  infoCard: {
    padding: '16px',
    borderRadius: '18px',
    border: '1px solid #f3d2b1',
    background: '#fffaf5',
  },
  infoLabel: {
    fontSize: '11px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#8b98ab',
    marginBottom: '8px',
  },
  infoValue: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#0f172a',
    wordBreak: 'break-word',
  },
  helperText: {
    fontSize: '13px',
    lineHeight: 1.6,
    color: '#5b6472',
  },
  status: {
    padding: '14px 16px',
    borderRadius: '16px',
    background: '#fff1e6',
    border: '1px solid #fdba74',
    color: '#9a3412',
    fontSize: '14px',
    fontWeight: 600,
  },
  primaryButton: {
    border: 'none',
    borderRadius: '14px',
    padding: '12px 18px',
    background: '#ea580c',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '1px solid #fdba74',
    borderRadius: '14px',
    padding: '12px 18px',
    background: '#fff7ed',
    color: '#0f172a',
    fontSize: '14px',
    fontWeight: 700,
    cursor: 'pointer',
  },
};
