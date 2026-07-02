import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useTheme } from '../../../lib/ThemePicker';
import { CosmixLoader } from '../../../lib/CosmixLoader';
import { BuddySafetyTripView } from '../../../lib/BuddySafetyTripView';
import { BuddySafetyStyles, LiveBadge, PageBackdrop } from '../../../lib/buddySafetyUI';
import { buildPublicWatchUrl, buildSmsUrl, buildWhatsAppUrl, formatAlertMessage } from '../../../lib/buddySafetyLinks';

function playAlarmSound() {
  if (typeof window === 'undefined') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 900);
  } catch (_) { /* ignore */ }
}

export default function BuddySafetyPublicWatchPage() {
  const router = useRouter();
  const { token } = router.query;
  const { theme } = useTheme();

  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seenAlertIds = useRef(new Set());

  const watchUrl = useMemo(() => {
    if (typeof window === 'undefined' || !token) return '';
    return buildPublicWatchUrl(window.location.origin, token);
  }, [token]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const response = await fetch(`/api/buddy-safety/public/${encodeURIComponent(String(token))}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Trip not found.');
    setTrip(data.trip);

    const freshAlerts = (data.trip?.alerts || []).filter((a) => !seenAlertIds.current.has(a.id));
    for (const alert of freshAlerts) {
      seenAlertIds.current.add(alert.id);
      if (alert.type === 'stall' && typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Buddy Safety Alert', { body: alert.message });
        playAlarmSound();
      } else if (alert.type === 'milestone' && typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification('Buddy on the move', { body: alert.message });
      }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    setLoading(true);
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      refresh().catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [token, refresh]);

  const shareWhatsApp = useCallback(() => {
    if (!trip || typeof window === 'undefined') return;
    const message = formatAlertMessage(trip, { message: 'Track my live trip on Cosmix' }, watchUrl);
    window.open(buildWhatsAppUrl('', message), '_blank', 'noopener,noreferrer');
  }, [trip, watchUrl]);

  const shareSms = useCallback(() => {
    if (!trip || typeof window === 'undefined') return;
    const message = formatAlertMessage(trip, { message: 'Track my live trip on Cosmix' }, watchUrl);
    window.location.href = buildSmsUrl('', message);
  }, [trip, watchUrl]);

  if (!router.isReady || loading) {
    return <CosmixLoader message="Loading live trip…" />;
  }

  if (error || !trip) {
    return (
      <div className="bs-page">
        <BuddySafetyStyles />
        <PageBackdrop />
        <div className="bs-container">
          <div className="bs-card" style={{ marginTop: 40 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900 }}>Trip not found</h1>
            <p style={{ color: '#94a3b8', marginTop: 10 }}>{error || 'This safety link may have expired.'}</p>
            <button type="button" className="bs-btn-ghost" style={{ marginTop: 16 }} onClick={() => router.push('/login')}>Log in to Cosmix</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bs-page">
      <BuddySafetyStyles />
      <PageBackdrop />
      <div className="bs-container">
        <div style={{ marginBottom: 20 }}>
          <div className="bs-eyebrow">Buddy Safety · Public watch</div>
          <h1 className="bs-hero-title">Live trip tracking</h1>
          <p style={{ fontSize: 14, color: '#94a3b8', marginTop: 10 }}>No login required — 3D map refreshes every 10 seconds.</p>
          <div style={{ marginTop: 12 }}><LiveBadge label="Public live view" /></div>
        </div>

        <BuddySafetyTripView
          trip={trip}
          theme={theme}
          showShareActions
          watchUrl={watchUrl}
          onShareWhatsApp={shareWhatsApp}
          onShareSms={shareSms}
        />
      </div>
    </div>
  );
}
