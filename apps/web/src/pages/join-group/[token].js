import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

export default function JoinGroupPage({ siteOrigin }) {
  const router = useRouter();
  const token = String(router.query.token || '').trim();
  const [sessionUser, setSessionUser] = useState(null);
  const [groupInfo, setGroupInfo] = useState(null);
  const [displayName, setDisplayName] = useState('');
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

    fetch('/api/auth/session')
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.user) return;
        setSessionUser(payload.user);
      })
      .catch(() => {});
  }, [token]);

  const canJoin = useMemo(() => Boolean(groupInfo && groupInfo.allowJoinByLink !== false), [groupInfo]);

  async function handleQuickJoin(event) {
    event.preventDefault();
    if (!token || !displayName.trim() || submitting || !canJoin) return;
    setSubmitting(true);
    setStatus('Creating your account...');

    try {
      const response = await fetch('/api/auth/quick-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || 'Unable to create account.');
      setStatus('Account created. Opening group chat...');
      router.replace(`/chat?groupInvite=${encodeURIComponent(token)}`);
    } catch (error) {
      setStatus(error.message || 'Unable to create account.');
      setSubmitting(false);
    }
  }

  function openChat() {
    if (!token || !canJoin) return;
    router.replace(`/chat?groupInvite=${encodeURIComponent(token)}`);
  }

  const imageUrl = `${siteOrigin || ''}/cosmix-share-logo.svg`;

  return (
    <>
      <Head>
        <title>Join Group on Cosmix</title>
        <meta property="og:title" content="Join Group on Cosmix" />
        <meta property="og:description" content="Join your Cosmix group chat with one tap." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:type" content="image/svg+xml" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Join Group on Cosmix" />
        <meta name="twitter:description" content="Join your Cosmix group chat with one tap." />
        <meta name="twitter:image" content={imageUrl} />
      </Head>

      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #020617, #1d4ed8)', color: '#e2e8f0', padding: 16, fontFamily: 'Verdana, Geneva, sans-serif' }}>
        <section style={{ width: '100%', maxWidth: 560, borderRadius: 24, padding: 24, border: '1px solid rgba(148,163,184,0.35)', background: 'rgba(15,23,42,0.86)', boxShadow: '0 22px 56px rgba(2,6,23,0.45)', display: 'grid', gap: 14 }}>
          <img src="/cosmix-share-logo.svg" alt="Cosmix" style={{ width: '100%', borderRadius: 18, border: '1px solid rgba(148,163,184,0.3)' }} />
          <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.2 }}>{groupInfo ? `Join ${groupInfo.name}` : 'Join Group on Cosmix'}</h1>
          <p style={{ margin: 0, color: '#bfdbfe' }}>{groupInfo?.description || 'Use this invite to join the group chat, folders, and bookmarks.'}</p>
          <p style={{ margin: 0, color: '#cbd5e1' }}>{status}</p>

          {sessionUser ? (
            <button type="button" onClick={openChat} disabled={!canJoin} style={{ border: 'none', borderRadius: 14, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: canJoin ? 'pointer' : 'not-allowed', background: canJoin ? 'linear-gradient(135deg,#22d3ee,#f97316)' : '#334155', color: '#0f172a' }}>
              Continue as {sessionUser.name || sessionUser.username}
            </button>
          ) : (
            <form onSubmit={handleQuickJoin} style={{ display: 'grid', gap: 10 }}>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Enter your name"
                style={{ borderRadius: 14, border: '1px solid rgba(148,163,184,0.4)', background: '#0f172a', color: '#e2e8f0', padding: '12px 14px', fontSize: 15, outline: 'none' }}
              />
              <button type="submit" disabled={submitting || !canJoin} style={{ border: 'none', borderRadius: 14, padding: '12px 14px', fontWeight: 700, fontSize: 15, cursor: submitting || !canJoin ? 'not-allowed' : 'pointer', background: submitting || !canJoin ? '#334155' : 'linear-gradient(135deg,#22d3ee,#f97316)', color: '#0f172a' }}>
                {submitting ? 'Creating...' : 'Create Account and Join'}
              </button>
            </form>
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
