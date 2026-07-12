import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { restoreUserSession } from '../lib/auth-client';
import { useTheme } from '../lib/ThemePicker';
import { MobileBottomNav } from '../lib/MobileNav';
import { CosmixLoader } from '../lib/CosmixLoader';
import { formatKm } from '../lib/buddySafetyGeo';
import { subscribeToWebPush } from '../lib/webPush';
import { BuddySafetyTripView } from '../lib/BuddySafetyTripView';
import {
  BuddySafetyStyles,
  LiveBadge,
  MobileStickyCTA,
  PageBackdrop,
  TiltCard,
} from '../lib/buddySafetyUI';
import {
  buildPublicWatchUrl,
  buildSmsUrl,
  buildWhatsAppUrl,
  formatAlertMessage,
} from '../lib/buddySafetyLinks';
import { StartTripModal } from '../lib/StartTripModal';
import { SavedPlacesModal, formatSavedDestinationsSummary } from '../lib/SavedPlacesModal';
import { MyActiveTripPanel } from '../lib/MyActiveTripPanel';
import {
  assertGeolocationAvailable,
  geolocationErrorMessage,
} from '../lib/buddySafetyPlaceSearch';

const DEFAULT_FAMILY_PHONE = '9717060569';

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
    setTimeout(() => {
      osc.stop();
      ctx.close();
    }, 900);
  } catch (_) { /* ignore */ }
}

function getCurrentPosition() {
  assertGeolocationAvailable();
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        ts: Date.now(),
      }),
      (err) => reject(Object.assign(new Error(geolocationErrorMessage(err)), { code: err.code })),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    );
  });
}

function notifyBrowser(title, body, { alarm = false } = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
  if (alarm) playAlarmSound();
}

export default function BuddySafetyPage() {
  const router = useRouter();
  const { theme } = useTheme();

  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('share');
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const [endingTrip, setEndingTrip] = useState(false);
  const shareTimerRef = useRef(null);
  const [startModalOpen, setStartModalOpen] = useState(false);

  const [title, setTitle] = useState('');
  const [watcherUsername, setWatcherUsername] = useState('');
  const [destination, setDestination] = useState(null);
  const [notifyEveryKm, setNotifyEveryKm] = useState(2);
  const [stallMinutes, setStallMinutes] = useState(8);
  const [watcherPhone, setWatcherPhone] = useState(DEFAULT_FAMILY_PHONE);
  const [notifySms, setNotifySms] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  const [profile, setProfile] = useState({ destinations: [], phone: '', notifySms: true, notifyWhatsApp: true });
  const [savedPlacesModalOpen, setSavedPlacesModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [pushNote, setPushNote] = useState('');

  const enableFamilyPush = useCallback(async () => {
    const result = await subscribeToWebPush(user?.username, { force: true });
    if (result.ok) {
      setPushNote('Notifications enabled — you will get trip alerts even when this page is closed.');
    } else {
      setPushNote(result.reason === 'permission-denied'
        ? 'Allow notifications in your browser settings to receive trip alerts.'
        : 'Could not enable notifications on this device.');
    }
  }, [user?.username]);

  const [trackingTripId, setTrackingTripId] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);
  const lastPingRef = useRef(0);
  const seenEventIdsRef = useRef(new Set());

  const selectedTrip = useMemo(
    () => trips.find((t) => t.id === selectedTripId) || null,
    [trips, selectedTripId],
  );

  const myActiveShare = useMemo(
    () => trips.find((t) => t.travellerId === user?.id && t.status === 'active') || null,
    [trips, user],
  );

  const watchingTrips = useMemo(
    () => trips.filter((t) => t.travellerId !== user?.id && t.status === 'active'),
    [trips, user],
  );

  const activeShareTrip = myActiveShare || (trackingTripId ? trips.find((t) => t.id === trackingTripId) : null);
  const publicWatchUrl = useMemo(() => {
    if (typeof window === 'undefined' || !activeShareTrip?.shareToken) return '';
    return buildPublicWatchUrl(window.location.origin, activeShareTrip.shareToken);
  }, [activeShareTrip?.shareToken]);

  const loadProfile = useCallback(async () => {
    const response = await fetch('/api/buddy-safety/profile');
    const data = await response.json();
    if (!response.ok) return;
    const next = data.profile || {};
    setProfile(next);
    if (next.phone) setWatcherPhone(next.phone);
    else setWatcherPhone(DEFAULT_FAMILY_PHONE);
    setNotifySms(next.notifySms !== false);
    setNotifyWhatsApp(next.notifyWhatsApp !== false);
  }, []);

  const saveProfile = useCallback(async (partial) => {
    setProfileSaving(true);
    try {
      const response = await fetch('/api/buddy-safety/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, ...partial }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save profile.');
      setProfile(data.profile);
      setSavedPlacesModalOpen(false);
      setStatusNote('Saved destinations updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setProfileSaving(false);
    }
  }, [profile]);

  const loadTrips = useCallback(async (tripIdToSelect) => {
    const response = await fetch('/api/buddy-safety');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load trips.');
    const nextTrips = data.trips || [];
    setTrips(nextTrips);
    if (tripIdToSelect) setSelectedTripId(tripIdToSelect);
    else if (!selectedTripId && nextTrips.length) setSelectedTripId(nextTrips[0].id);
    return nextTrips;
  }, [selectedTripId]);

  const refreshTrip = useCallback(async (tripId) => {
    const response = await fetch(`/api/buddy-safety/${tripId}`);
    const data = await response.json();
    if (!response.ok) return null;
    const trip = data.trip;
    setTrips((prev) => {
      const idx = prev.findIndex((t) => t.id === trip.id);
      if (idx < 0) return [trip, ...prev];
      const copy = [...prev];
      copy[idx] = trip;
      return copy;
    });
    return trip;
  }, []);

  const handleTripEvents = useCallback((trip, events = []) => {
    for (const event of events) {
      const key = event.id || `${event.type}-${event.at}-${event.km}`;
      if (seenEventIdsRef.current.has(key)) continue;
      seenEventIdsRef.current.add(key);
      if (event.type === 'stall') {
        notifyBrowser('Buddy Safety Alert', event.message, { alarm: true });
        setStatusNote(event.message);
      } else if (event.type === 'milestone') {
        notifyBrowser('Buddy on the move', event.message);
        setStatusNote(event.message);
      } else if (event.type === 'arrived') {
        notifyBrowser('Buddy arrived', event.message);
        setStatusNote(event.message);
      }
    }
    if (trip?.alerts?.some((a) => a.type === 'stall' && !a.acknowledged)) {
      playAlarmSound();
    }
  }, []);

  const sendPing = useCallback(async (tripId, coords) => {
    const now = Date.now();
    if (now - lastPingRef.current < 8000) return;
    lastPingRef.current = now;
    const response = await fetch(`/api/buddy-safety/${tripId}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coords),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Location update failed.');
    setTrips((prev) => prev.map((t) => (t.id === tripId ? data.trip : t)));
    handleTripEvents(data.trip, data.events);
    return data.trip;
  }, [handleTripEvents]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
    setTrackingTripId('');
  }, []);

  const startTracking = useCallback(async (tripId) => {
    stopTracking();
    setTrackingTripId(tripId);
    setIsTracking(true);
    setStatusNote('Sharing live location with your buddy…');

    try {
      const first = await getCurrentPosition();
      await sendPing(tripId, first);
    } catch (err) {
      setError(err.message);
      setIsTracking(false);
      return;
    }

    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await sendPing(tripId, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            speed: pos.coords.speed,
            heading: pos.coords.heading,
            ts: Date.now(),
          });
        } catch (_) { /* ignore transient */ }
      },
      () => setStatusNote('GPS signal weak — keep screen on for safety tracking.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 },
    );
  }, [sendPing, stopTracking]);

  useEffect(() => { restoreUserSession(router, setUser); }, [router]);

  useEffect(() => {
    if (!user) return;
    subscribeToWebPush(user.username);
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
    loadProfile().catch(() => {});
    loadTrips().catch(() => setTrips([]));
  }, [user, loadTrips, loadProfile]);

  useEffect(() => {
    if (!user || !selectedTripId) return undefined;
    const interval = setInterval(async () => {
      const trip = await refreshTrip(selectedTripId);
      if (trip?.alerts?.length) {
        const fresh = trip.alerts.filter((a) => !seenEventIdsRef.current.has(a.id));
        handleTripEvents(trip, fresh);
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [user, selectedTripId, refreshTrip, handleTripEvents]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  const createAndStartTrip = useCallback(async (payload = {}) => {
    setError('');
    setLoading(true);
    try {
      const tripTitle = payload.title || title;
      const tripDestination = payload.destination || destination;
      const resolvedOrigin = payload.origin;
      const tripWatcherUsername = payload.watcherUsername ?? watcherUsername;
      const tripWatcherPhone = payload.watcherPhone ?? watcherPhone;
      const tripNotifySms = payload.notifySms ?? notifySms;
      const tripNotifyWhatsApp = payload.notifyWhatsApp ?? notifyWhatsApp;
      const tripNotifyEveryKm = payload.notifyEveryKm ?? notifyEveryKm;
      const tripNotifyIntervalMinutes = payload.notifyIntervalMinutes ?? 15;
      const tripStallMinutes = payload.stallMinutes ?? stallMinutes;
      const tripShareDuration = payload.shareDurationMinutes ?? null;

      if (!resolvedOrigin) throw new Error('Allow location access to start your trip.');
      if (!tripDestination) throw new Error('Set your destination.');
      const response = await fetch('/api/buddy-safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tripTitle,
          watcherUsername: tripWatcherUsername,
          watcherPhone: tripWatcherPhone,
          watcherNotifySms: tripNotifySms,
          watcherNotifyWhatsApp: tripNotifyWhatsApp,
          destination: tripDestination,
          origin: resolvedOrigin,
          notifyEveryKm: tripNotifyEveryKm,
          notifyIntervalMinutes: tripNotifyIntervalMinutes,
          stallMinutes: tripStallMinutes,
          shareDurationMinutes: tripShareDuration,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start trip.');
      setStartModalOpen(false);
      setTitle(tripTitle);
      setDestination(tripDestination);
      setWatcherUsername(tripWatcherUsername);
      setWatcherPhone(tripWatcherPhone);
      await loadTrips(data.trip.id);
      setTab('share');
      await startTracking(data.trip.id);

      if (shareTimerRef.current) clearTimeout(shareTimerRef.current);
      if (data.trip.shareEndsAt) {
        const msLeft = Math.max(0, data.trip.shareEndsAt - Date.now());
        shareTimerRef.current = setTimeout(() => {
          endSelectedTripRef.current?.();
          setStatusNote('Live sharing ended — share duration reached.');
        }, msLeft);
      }

      const watchUrl = typeof window !== 'undefined'
        ? buildPublicWatchUrl(window.location.origin, data.trip.shareToken)
        : '';
      setStatusNote(`Trip started${tripWatcherUsername ? ` — @${tripWatcherUsername} can watch` : ''}.${watchUrl ? ` Share link: ${watchUrl}` : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [watcherUsername, watcherPhone, notifySms, notifyWhatsApp, destination, title, notifyEveryKm, stallMinutes, loadTrips, startTracking]);

  const endSelectedTripRef = useRef(null);

  const endSelectedTrip = useCallback(async () => {
    const tripId = trackingTripId || myActiveShare?.id;
    if (!tripId) {
      setError('No active trip to end.');
      return;
    }
    setEndingTrip(true);
    setError('');
    try {
      stopTracking();
      if (shareTimerRef.current) {
        clearTimeout(shareTimerRef.current);
        shareTimerRef.current = null;
      }
      const response = await fetch(`/api/buddy-safety/${tripId}/end`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not end trip.');
      setDestination(null);
      setTrackingTripId('');
      await loadTrips();
      setStatusNote('Trip ended.');
    } catch (err) {
      setError(err.message);
    } finally {
      setEndingTrip(false);
    }
  }, [trackingTripId, myActiveShare, stopTracking, loadTrips]);

  endSelectedTripRef.current = endSelectedTrip;

  const handleStartNewTrip = useCallback(async () => {
    if (myActiveShare || isTracking) {
      const ok = typeof window !== 'undefined'
        ? window.confirm('End your current trip and start a new one?')
        : true;
      if (!ok) return;
      await endSelectedTrip();
    }
    setStartModalOpen(true);
  }, [myActiveShare, isTracking, endSelectedTrip]);

  const copyWatchLink = useCallback((trip) => {
    if (typeof window === 'undefined' || !trip?.shareToken) return;
    const url = buildPublicWatchUrl(window.location.origin, trip.shareToken);
    navigator.clipboard?.writeText(url);
    setStatusNote('Public watch link copied — no login needed.');
  }, []);

  const openWhatsAppShare = useCallback((trip) => {
    if (typeof window === 'undefined' || !trip?.shareToken) return;
    const url = buildPublicWatchUrl(window.location.origin, trip.shareToken);
    const message = formatAlertMessage(trip, { message: 'Track my live trip on Cosmix Buddy Safety' }, url);
    window.open(buildWhatsAppUrl(watcherPhone, message), '_blank', 'noopener,noreferrer');
  }, [watcherPhone]);

  const openSmsShare = useCallback((trip) => {
    if (typeof window === 'undefined' || !trip?.shareToken) return;
    const url = buildPublicWatchUrl(window.location.origin, trip.shareToken);
    const message = formatAlertMessage(trip, { message: 'Track my live trip on Cosmix Buddy Safety' }, url);
    window.location.href = buildSmsUrl(watcherPhone, message);
  }, [watcherPhone]);

  if (!user) {
    return <CosmixLoader message="Loading Buddy Safety…" />;
  }

  const unackedStall = (selectedTrip?.alerts || []).filter((a) => a.type === 'stall' && !a.acknowledged);

  return (
    <div className="bs-page">
      <BuddySafetyStyles />
      <PageBackdrop />
      <div className="bs-container">
        <div className="bs-page-header">
          <div>
            <div className="bs-eyebrow">Wellness Club</div>
            <h1 className="bs-hero-title">Family Trip Safety</h1>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.55, maxWidth: 520, marginTop: 10 }}>
              Share your live route with family. They get location updates and emergency alerts if you stop unexpectedly.
            </p>
            {(myActiveShare || isTracking) ? <div style={{ marginTop: 12 }}><LiveBadge label="You are sharing live" /></div> : null}
          </div>
          <div className="bs-header-actions">
            <button type="button" className="bs-btn-ghost" onClick={() => router.push('/dashboard')}>Dashboard</button>
            <button type="button" className="bs-btn-ghost" onClick={() => router.push('/chat')}>Threads</button>
          </div>
        </div>

        {unackedStall.length ? (
          <div className="bs-alert-banner" style={{ marginBottom: 16 }}>
            <strong>Safety alert:</strong> {unackedStall[unackedStall.length - 1].message}
          </div>
        ) : null}

        {statusNote ? (
          <div className="bs-success-banner" style={{ marginBottom: 16 }}>{statusNote}</div>
        ) : null}

        {error ? (
          <div className="bs-alert-banner" style={{ marginBottom: 16 }}>{error}</div>
        ) : null}

        <TiltCard>
          <div className="bs-settings-header" style={{ position: 'relative', zIndex: 1 }}>
            <div>
              <div className="bs-eyebrow">Quick picks</div>
              <h2 style={{ margin: 0, fontSize: 'clamp(1rem, 3.5vw, 1.25rem)', fontWeight: 800 }}>Saved destinations</h2>
            </div>
            <button type="button" className="bs-btn-ghost" onClick={() => setSavedPlacesModalOpen(true)}>
              Add
            </button>
          </div>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10, position: 'relative', zIndex: 1 }}>
            {formatSavedDestinationsSummary(profile.destinations)}
          </p>
        </TiltCard>

        <TiltCard style={{ animationDelay: '0.06s' }}>
          <div className="bs-tab-row" style={{ position: 'relative', zIndex: 1 }}>
            <button type="button" className={`bs-tab${tab === 'share' ? ' is-active' : ''}`} onClick={() => setTab('share')}>My trip</button>
            <button type="button" className={`bs-tab${tab === 'watch' ? ' is-active' : ''}`} onClick={() => setTab('watch')}>Family watching</button>
          </div>

          {tab === 'share' ? (
            <div style={{ position: 'relative', zIndex: 1 }}>
              {myActiveShare || isTracking ? (
                <MyActiveTripPanel
                  trip={activeShareTrip || myActiveShare}
                  isTracking={isTracking}
                  watchUrl={publicWatchUrl}
                  onEndTrip={endSelectedTrip}
                  onResumeGps={() => myActiveShare && startTracking(myActiveShare.id)}
                  onCopyLink={() => activeShareTrip && copyWatchLink(activeShareTrip)}
                  onShareWhatsApp={() => activeShareTrip && openWhatsAppShare(activeShareTrip)}
                  onStartNew={handleStartNewTrip}
                  ending={endingTrip}
                />
              ) : (
                <div className="bs-start-card">
                  <p>Share your live route with family.</p>
                  <button type="button" className="bs-btn-primary bs-start-card-btn" onClick={() => setStartModalOpen(true)}>
                    Start trip
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, position: 'relative', zIndex: 1 }}>
              <div className="bs-family-notify">
                <p>Enable notifications to get trip updates and emergency alerts without keeping this page open.</p>
                <button type="button" className="bs-my-trip-action" onClick={enableFamilyPush}>Enable notifications</button>
                {pushNote ? <p className="bs-my-trip-meta">{pushNote}</p> : null}
              </div>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>Trips your family is sharing with you.</p>
              {watchingTrips.length ? watchingTrips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  className={`bs-trip-row${selectedTripId === trip.id ? ' is-selected' : ''}`}
                  onClick={() => setSelectedTripId(trip.id)}
                >
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800 }}>{trip.title}</div>
                    <div style={{ fontSize: 12, color: theme.textSecondary }}>@{trip.travellerUsername} · {trip.status}</div>
                  </div>
                  <div style={{ fontSize: 12, color: theme.yellow, fontWeight: 700 }}>
                    {trip.pings?.length ? formatKm(trip.pings[trip.pings.length - 1].distanceToDest) : 'Waiting…'}
                  </div>
                </button>
              )) : (
                <div style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0' }}>No family trips to watch right now.</div>
              )}
            </div>
          )}
        </TiltCard>

        {tab === 'watch' && selectedTrip ? (
          <BuddySafetyTripView
            trip={selectedTrip}
            theme={theme}
            showShareActions={Boolean(selectedTrip.shareToken)}
            watchUrl={selectedTrip.shareToken && typeof window !== 'undefined'
              ? buildPublicWatchUrl(window.location.origin, selectedTrip.shareToken)
              : ''}
            onShareWhatsApp={() => openWhatsAppShare(selectedTrip)}
            onShareSms={() => openSmsShare(selectedTrip)}
          />
        ) : null}
      </div>

      <SavedPlacesModal
        open={savedPlacesModalOpen}
        onClose={() => setSavedPlacesModalOpen(false)}
        profile={profile}
        onSave={saveProfile}
        saving={profileSaving}
      />

      <StartTripModal
        open={startModalOpen}
        onClose={() => setStartModalOpen(false)}
        onStart={createAndStartTrip}
        loading={loading}
        profile={profile}
        defaultWatcherPhone={watcherPhone || DEFAULT_FAMILY_PHONE}
        actorUsername={user?.username}
      />

      <MobileStickyCTA visible={tab === 'share' && !myActiveShare && !isTracking}>
        <button
          type="button"
          className="bs-btn-primary"
          disabled={loading}
          onClick={() => setStartModalOpen(true)}
        >
          Start trip
        </button>
      </MobileStickyCTA>

      <MobileBottomNav
        theme={theme}
        activeId="safety"
        items={[
          { id: 'home', label: 'Home', icon: '⌂', href: '/dashboard' },
          { id: 'safety', label: 'Safety', icon: '🛡', href: '/buddy-safety', matchPaths: ['/buddy-safety'] },
          { id: 'chat', label: 'Chat', icon: '💬', href: '/chat' },
        ]}
      />
    </div>
  );
}
