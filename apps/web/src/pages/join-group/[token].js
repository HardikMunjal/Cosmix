import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

export default function JoinGroupPage({ siteOrigin }) {
  const router = useRouter();
  const token = String(router.query.token || router.query.t || '').trim();
  const [sessionUser, setSessionUser] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [username, setUsername] = useState('');
  const [usernameValidation, setUsernameValidation] = useState({ status: 'idle', message: '' });
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [status, setStatus] = useState('Loading invite...');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetch(`/api/chat/group-public?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.message || 'Invite link not valid.');
        setGroupInfo(payload);
        if (payload.allowJoinByLink === false) {
          setStatus('Group owner has disabled joining by link.');
        } else {
          setStatus('Invite ready.');
        }
      })
      .catch((error) => {
        setStatus(error.message || 'Invite link not valid.');
      });

    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.user) return;
        setSessionUser(payload.user);
      })
      .catch(() => {});
  }, [token]);

  const canJoin = useMemo(() => Boolean(groupInfo && groupInfo.allowJoinByLink !== false), [groupInfo]);

  useEffect(() => {
    if (!canJoin || sessionUser) return;
    const normalized = String(username || '').trim();
    if (!normalized) {
      setUsernameValidation({ status: 'idle', message: '' });
      return;
    }
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(normalized)) {
      setUsernameValidation({ status: 'invalid', message: 'Username must be 3-40 chars and use letters, numbers, dot, underscore, or dash.' });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setUsernameValidation({ status: 'checking', message: 'Checking username...' });
        const response = await fetch(`/api/auth/check-username?username=${encodeURIComponent(normalized)}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setUsernameValidation({ status: 'invalid', message: payload.error || 'Unable to validate username.' });
          return;
        }
        if (payload.available) {
          setUsernameValidation({ status: 'valid', message: 'Username is available.' });
          return;
        }
        setUsernameValidation({ status: 'invalid', message: 'Username is already taken. Try another one.' });
      } catch (error) {
        if (error.name === 'AbortError') return;
        setUsernameValidation({ status: 'invalid', message: 'Unable to validate username right now.' });
      }
    }, 260);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [canJoin, sessionUser, username]);

  async function handleQuickJoin(event) {
    event.preventDefault();
    if (!token || !username.trim() || submitting || !canJoin) return;
    if (usernameValidation.status !== 'valid') {
      setStatus('Please choose a valid and available username first.');
      return;
    }
    setSubmitting(true);
    setStatus('Creating your account with temporary password 123...');

    try {
      const response = await fetch('/api/auth/quick-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), name: username.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to create account.');
      setCreatedCredentials({ username: payload?.user?.username || username.trim(), password: payload?.temporaryPassword || '123' });
      setStatus('Account created. You can log in later with password 123. Opening group chat...');
      window.setTimeout(() => {
        router.replace(`/chat?groupInvite=${encodeURIComponent(token)}`);
      }, 1200);
    } catch (error) {
      setStatus(error.message || 'Unable to create account.');
      setSubmitting(false);
    }
  }

  function openChat() {
    if (!token || !canJoin) return;
    router.replace(`/chat?groupInvite=${encodeURIComponent(token)}`);
  }

  const imageUrl = `${siteOrigin || ''}/cosmix-share-logo.png`;
  const canonicalUrl = token
    ? `${siteOrigin || ''}/join-group/${encodeURIComponent(token)}`
    : `${siteOrigin || ''}/join-group`;

  return (
    <>
      <Head>
        <title>Join Group on Cosmix</title>
        <meta property="og:title" content="Join Group on Cosmix" />
        <meta property="og:description" content="Join your Cosmix group chat with one tap." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Cosmix app invite" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Join Group on Cosmix" />
        <meta name="twitter:description" content="Join your Cosmix group chat with one tap." />
        <meta name="twitter:image" content={imageUrl} />
        <meta name="twitter:image:alt" content="Cosmix app invite" />
      </Head>

      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #020617, #1d4ed8)', color: '#e2e8f0', padding: 16, fontFamily: 'Verdana, Geneva, sans-serif' }}>
        <section style={{ width: '100%', maxWidth: 560, borderRadius: 24, padding: 24, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.86)', boxShadow: '0 22px 56px rgba(2,6,23,0.45)', display: 'grid', gap: 14 }}>
          <img src="/cosmix-share-logo.png" alt="Cosmix" style={{ width: '100%', borderRadius: 18, border: '1px solid rgba(148,163,184,0.3)' }} />
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.2 }}>{groupInfo ? `Join ${groupInfo.name}` : 'Join Group on Cosmix'}</h1>
          <p style={{ margin: 0, color: '#bfdbfe' }}>{groupInfo?.description || 'Use this invite to join the group chat, folders, and bookmarks.'}</p>
          <p style={{ margin: 0, color: '#cbd5e1' }}>{status}</p>

          {sessionUser ? (
            <button type="button" onClick={openChat} disabled={!canJoin} style={{ border: 'none', borderRadius: 14, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: canJoin ? 'pointer' : 'not-allowed', background: canJoin ? 'linear-gradient(135deg,#22d3ee,#f97316)' : '#334155', color: '#0f172a' }}>
              Continue as {sessionUser.name || sessionUser.username}
            </button>
          ) : (
            <>
              <button type="button" disabled={!canJoin} style={{ border: 'none', borderRadius: 14, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: canJoin ? 'pointer' : 'not-allowed', background: canJoin ? 'linear-gradient(135deg,#22d3ee,#f97316)' : '#334155', color: '#0f172a' }}>
                Enter username to join
              </button>
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.68)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 14 }}>
                <form onSubmit={handleQuickJoin} style={{ width: '100%', maxWidth: 460, borderRadius: 18, background: '#0f172a', border: '1px solid rgba(148,163,184,0.35)', padding: 18, display: 'grid', gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 22 }}>Join {groupInfo?.name || 'this thread'}</h2>
                  <p style={{ margin: 0, color: '#bfdbfe', fontSize: 13 }}>Pick a username. We will create your account and set temporary password as 123.</p>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="Choose username"
                    style={{ borderRadius: 12, border: '1px solid rgba(148,163,184,0.4)', background: '#020617', color: '#e2e8f0', padding: '12px 14px', fontSize: 15, outline: 'none' }}
                  />
                  {usernameValidation.message ? (
                    <p style={{ margin: 0, color: usernameValidation.status === 'valid' ? '#22c55e' : usernameValidation.status === 'checking' ? '#f59e0b' : '#f87171', fontSize: 12 }}>
                      {usernameValidation.message}
                    </p>
                  ) : null}
                  {createdCredentials ? (
                    <p style={{ margin: 0, color: '#22c55e', fontSize: 12 }}>
                      Account created for {createdCredentials.username}. You can login anytime with password {createdCredentials.password}.
                    </p>
                  ) : null}
                  <button type="submit" disabled={submitting || !canJoin || usernameValidation.status !== 'valid'} style={{ border: 'none', borderRadius: 12, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: submitting || !canJoin || usernameValidation.status !== 'valid' ? 'not-allowed' : 'pointer', background: submitting || !canJoin || usernameValidation.status !== 'valid' ? '#334155' : 'linear-gradient(135deg,#22d3ee,#f97316)', color: '#0f172a' }}>
                    {submitting ? 'Creating...' : 'Register and Join Thread'}
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}

export async function getServerSideProps(context) {
  const host = String(context.req.headers.host || 'localhost:3005');
  const forwardedProto = String(context.req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return {
    props: {
      siteOrigin: `${protocol}://${host}`,
    },
  };
}
