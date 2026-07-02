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
import { CurrentLocationPicker, PlaceSearchResults, assertGeolocationAvailable, fetchPlaceFromCoords, geolocationErrorMessage, useGeocodeSearch } from '../lib/buddySafetyPlaceSearch';

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

function SavedPlaceEditor({
  label,
  place,
  searchQuery,
  onSearchQueryChange,
  search,
  onSelect,
  onPickCurrent,
  onClear,
  theme,
  gpsLoading = false,
  gpsError = '',
  useCurrentByDefault = true,
}) {
  const isCurrentActive = place?.type === 'gps' || place?.label?.includes('(GPS)');
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: theme.textPrimary }}>{label}</div>
      <CurrentLocationPicker
        label={`Set ${label.toLowerCase()} from current location`}
        active={Boolean(place) && isCurrentActive}
        loading={gpsLoading}
        place={isCurrentActive ? place : null}
        error={gpsError}
        onPick={onPickCurrent}
        hint={useCurrentByDefault ? 'Default option — uses your phone GPS' : 'Tap to use GPS'}
      />
      <div className="bs-place-divider">or search address</div>
      <input
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        className="bs-input"
        placeholder="e.g. Manyata Tech Park, Bengaluru"
        autoComplete="off"
        spellCheck={false}
      />
      <PlaceSearchResults
        results={search.results}
        loading={search.loading}
        error={search.error}
        query={searchQuery}
        onSelect={onSelect}
      />
      {place && !isCurrentActive ? (
        <div style={{ fontSize: 12, color: theme.green }}>Saved · {place.label?.slice(0, 90)}</div>
      ) : null}
      {place ? (
        <button type="button" className="bs-btn-ghost" onClick={onClear}>Clear</button>
      ) : null}
    </div>
  );
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
  const [tab, setTab] = useState('watch');
  const [trips, setTrips] = useState([]);
  const [selectedTripId, setSelectedTripId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const [title, setTitle] = useState('Office → Home');
  const [buddyQuery, setBuddyQuery] = useState('');
  const [buddyResults, setBuddyResults] = useState([]);
  const [watcherUsername, setWatcherUsername] = useState('');
  const [destSearchQuery, setDestSearchQuery] = useState('');
  const [destination, setDestination] = useState(null);
  const [tripOrigin, setTripOrigin] = useState(null);
  const [destFromGps, setDestFromGps] = useState(false);
  const [gpsLoading, setGpsLoading] = useState('');
  const [gpsError, setGpsError] = useState({ origin: '', dest: '', home: '', work: '' });
  const [notifyEveryKm, setNotifyEveryKm] = useState(2);
  const [stallMinutes, setStallMinutes] = useState(8);
  const [watcherPhone, setWatcherPhone] = useState('');
  const [notifySms, setNotifySms] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);

  const [profile, setProfile] = useState({ home: null, work: null, phone: '', notifySms: true, notifyWhatsApp: true, preferCurrentLocation: true });
  const [homeQuery, setHomeQuery] = useState('');
  const [workQuery, setWorkQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

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

  const destSearch = useGeocodeSearch(destSearchQuery);
  const homeSearch = useGeocodeSearch(homeQuery);
  const workSearch = useGeocodeSearch(workQuery);

  const pickCurrentPlace = useCallback(async (fallbackLabel = 'Current location') => {
    const pos = await getCurrentPosition();
    const fallback = {
      lat: pos.lat,
      lng: pos.lng,
      label: `${fallbackLabel} (GPS)`,
      shortLabel: fallbackLabel,
      type: 'gps',
    };
    try {
      const place = await fetchPlaceFromCoords(pos.lat, pos.lng);
      return { ...place, type: place.type || 'gps' };
    } catch (_) {
      return fallback;
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const response = await fetch('/api/buddy-safety/profile');
    const data = await response.json();
    if (!response.ok) return;
    const next = data.profile || {};
    setProfile(next);
    if (next.phone) setWatcherPhone(next.phone);
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
      setStatusNote('Saved addresses & alert settings.');
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

  useEffect(() => {
    if (!buddyQuery.trim()) {
      setBuddyResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/chat/buddy-search?q=${encodeURIComponent(buddyQuery)}`);
      const data = await response.json();
      setBuddyResults(data.results || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [buddyQuery]);

  const setGpsFieldError = useCallback((field, message = '') => {
    setGpsError((prev) => ({ ...prev, [field]: message }));
  }, []);

  useEffect(() => {
    if (!user || tab !== 'share' || tripOrigin) return undefined;
    if (profile.preferCurrentLocation === false) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const place = await pickCurrentPlace('Trip start');
        if (!cancelled) {
          setTripOrigin(place);
          setGpsFieldError('origin', '');
        }
      } catch (err) {
        if (!cancelled) setGpsFieldError('origin', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user, tab, tripOrigin, profile.preferCurrentLocation, pickCurrentPlace, setGpsFieldError]);

  useEffect(() => {
    if (!user || tab !== 'share' || destination) return;
    if (profile.home) {
      setDestination(profile.home);
      setDestFromGps(false);
      setTitle(profile.work ? 'Office → Home' : 'Trip → Home');
    }
  }, [user, tab, destination, profile.home, profile.work]);

  const pickHomeFromGps = useCallback(async () => {
    setGpsLoading('home');
    setGpsFieldError('home', '');
    setError('');
    try {
      const place = await pickCurrentPlace('Home');
      setProfile((p) => ({ ...p, home: place }));
      setHomeQuery('');
    } catch (err) {
      setGpsFieldError('home', err.message);
      setError(err.message);
    } finally {
      setGpsLoading('');
    }
  }, [pickCurrentPlace, setGpsFieldError]);

  const pickWorkFromGps = useCallback(async () => {
    setGpsLoading('work');
    setGpsFieldError('work', '');
    setError('');
    try {
      const place = await pickCurrentPlace('Work');
      setProfile((p) => ({ ...p, work: place }));
      setWorkQuery('');
    } catch (err) {
      setGpsFieldError('work', err.message);
      setError(err.message);
    } finally {
      setGpsLoading('');
    }
  }, [pickCurrentPlace, setGpsFieldError]);

  const pickDestFromGps = useCallback(async () => {
    setGpsLoading('dest');
    setGpsFieldError('dest', '');
    setError('');
    try {
      const place = await pickCurrentPlace('Destination');
      setDestination(place);
      setDestFromGps(true);
      setDestSearchQuery('');
    } catch (err) {
      setGpsFieldError('dest', err.message);
      setError(err.message);
    } finally {
      setGpsLoading('');
    }
  }, [pickCurrentPlace, setGpsFieldError]);

  const pickOriginFromGps = useCallback(async () => {
    setGpsLoading('origin');
    setGpsFieldError('origin', '');
    setError('');
    try {
      const place = await pickCurrentPlace('Trip start');
      setTripOrigin(place);
    } catch (err) {
      setGpsFieldError('origin', err.message);
      setError(err.message);
    } finally {
      setGpsLoading('');
    }
  }, [pickCurrentPlace, setGpsFieldError]);

  const createAndStartTrip = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!watcherUsername && !watcherPhone) {
        throw new Error('Select a buddy username or enter a phone for SMS/WhatsApp alerts.');
      }
      if (!destination) throw new Error('Set your destination (home / end point).');
      const response = await fetch('/api/buddy-safety', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          watcherUsername,
          watcherPhone,
          watcherNotifySms: notifySms,
          watcherNotifyWhatsApp: notifyWhatsApp,
          destination,
          origin: tripOrigin,
          notifyEveryKm,
          stallMinutes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start trip.');
      await loadTrips(data.trip.id);
      setTab('share');
      await startTracking(data.trip.id);
      const watchUrl = typeof window !== 'undefined'
        ? buildPublicWatchUrl(window.location.origin, data.trip.shareToken)
        : '';
      setStatusNote(`Trip started${watcherUsername ? ` — @${watcherUsername} can watch` : ''}.${watchUrl ? ` Share link: ${watchUrl}` : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [watcherUsername, watcherPhone, notifySms, notifyWhatsApp, destination, tripOrigin, title, notifyEveryKm, stallMinutes, loadTrips, startTracking]);

  const endSelectedTrip = useCallback(async () => {
    if (!trackingTripId && !myActiveShare?.id) return;
    const tripId = trackingTripId || myActiveShare.id;
    stopTracking();
    await fetch(`/api/buddy-safety/${tripId}/end`, { method: 'POST' });
    await loadTrips();
    setStatusNote('Trip ended safely.');
  }, [trackingTripId, myActiveShare, stopTracking, loadTrips]);

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

  const useSavedHome = useCallback(() => {
    if (!profile.home) {
      setError('Save your home address in settings first.');
      return;
    }
    setDestination(profile.home);
    setDestFromGps(false);
    setDestSearchQuery('');
    setTitle(profile.work ? 'Office → Home' : 'Trip → Home');
  }, [profile]);

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
            <h1 className="bs-hero-title">Buddy Safety</h1>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.55, maxWidth: 520, marginTop: 10 }}>
              Mobile-first live tracking — GPS route, km alerts, and safety stall warnings.
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
              <div className="bs-eyebrow">Saved places</div>
              <h2 style={{ margin: 0, fontSize: 'clamp(1rem, 3.5vw, 1.25rem)', fontWeight: 800 }}>Home & alert settings</h2>
            </div>
            <button type="button" className="bs-btn-ghost" onClick={() => setSettingsOpen((v) => !v)}>
              {settingsOpen ? 'Hide' : 'Edit'}
            </button>
          </div>
          {settingsOpen ? (
            <div style={{ display: 'grid', gap: 16, marginTop: 14, position: 'relative', zIndex: 1 }}>
              <SavedPlaceEditor
                label="Home"
                place={profile.home}
                searchQuery={homeQuery}
                onSearchQueryChange={setHomeQuery}
                search={homeSearch}
                onSelect={(row) => { setProfile((p) => ({ ...p, home: row })); setHomeQuery(''); }}
                onPickCurrent={pickHomeFromGps}
                onClear={() => { setProfile((p) => ({ ...p, home: null })); setHomeQuery(''); }}
                theme={theme}
                gpsLoading={gpsLoading === 'home'}
                gpsError={gpsError.home}
                useCurrentByDefault={profile.preferCurrentLocation !== false}
              />
              <SavedPlaceEditor
                label="Work / Office"
                place={profile.work}
                searchQuery={workQuery}
                onSearchQueryChange={setWorkQuery}
                search={workSearch}
                onSelect={(row) => { setProfile((p) => ({ ...p, work: row })); setWorkQuery(''); }}
                onPickCurrent={pickWorkFromGps}
                onClear={() => { setProfile((p) => ({ ...p, work: null })); setWorkQuery(''); }}
                theme={theme}
                gpsLoading={gpsLoading === 'work'}
                gpsError={gpsError.work}
                useCurrentByDefault={profile.preferCurrentLocation !== false}
              />
              <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                Your phone (for receiving alerts when you watch others)
                <input value={profile.phone || ''} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} className="bs-input" placeholder="+91 98765 43210" inputMode="tel" autoComplete="tel" />
              </label>
              <div style={{ display: 'grid', gap: 6 }}>
                <label className="bs-check-row">
                  <input type="checkbox" checked={profile.preferCurrentLocation !== false} onChange={(e) => setProfile((p) => ({ ...p, preferCurrentLocation: e.target.checked }))} />
                  Prefer current location (GPS) by default
                </label>
                <label className="bs-check-row">
                  <input type="checkbox" checked={profile.notifySms !== false} onChange={(e) => setProfile((p) => ({ ...p, notifySms: e.target.checked }))} />
                  SMS alerts
                </label>
                <label className="bs-check-row">
                  <input type="checkbox" checked={profile.notifyWhatsApp !== false} onChange={(e) => setProfile((p) => ({ ...p, notifyWhatsApp: e.target.checked }))} />
                  WhatsApp alerts
                </label>
              </div>
              <button type="button" className="bs-btn-primary" disabled={profileSaving} onClick={() => saveProfile(profile)}>
                {profileSaving ? 'Saving…' : 'Save home & alert settings'}
              </button>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 10, position: 'relative', zIndex: 1 }}>
              {profile.home ? `Home: ${profile.home.label?.slice(0, 70)}` : 'No home saved yet.'}
              {profile.work ? ` · Work: ${profile.work.label?.slice(0, 50)}` : ''}
            </p>
          )}
        </TiltCard>

        <TiltCard style={{ animationDelay: '0.06s' }}>
          <div className="bs-tab-row" style={{ position: 'relative', zIndex: 1 }}>
            <button type="button" className={`bs-tab${tab === 'watch' ? ' is-active' : ''}`} onClick={() => setTab('watch')}>Watch buddy</button>
            <button type="button" className={`bs-tab${tab === 'share' ? ' is-active' : ''}`} onClick={() => setTab('share')}>Share my trip</button>
          </div>

          {tab === 'share' ? (
            <div style={{ display: 'grid', gap: 14, position: 'relative', zIndex: 1 }}>
              {myActiveShare || isTracking ? (
                <div className="bs-success-banner">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                    <LiveBadge label="Live sharing" />
                    <span>{myActiveShare?.title || 'Trip'} · @{myActiveShare?.watcherUsername || watcherUsername || 'public link'}</span>
                  </div>
                  {publicWatchUrl ? (
                    <div style={{ marginTop: 8, fontSize: 12, wordBreak: 'break-all', opacity: 0.9 }}>{publicWatchUrl}</div>
                  ) : null}
                  <div className="bs-btn-row" style={{ marginTop: 12 }}>
                    <button type="button" className="bs-btn-danger" onClick={endSelectedTrip}>End trip</button>
                    {!isTracking && myActiveShare ? (
                      <button type="button" className="bs-btn-primary" onClick={() => startTracking(myActiveShare.id)}>Resume GPS</button>
                    ) : null}
                    {activeShareTrip ? (
                      <>
                        <button type="button" className="bs-btn-ghost" onClick={() => copyWatchLink(activeShareTrip)}>Copy watch link</button>
                        <button type="button" className="bs-btn-primary" style={{ background: 'linear-gradient(135deg, #128C7E, #25D366)' }} onClick={() => openWhatsAppShare(activeShareTrip)}>WhatsApp</button>
                        <button type="button" className="bs-btn-ghost" onClick={() => openSmsShare(activeShareTrip)}>SMS</button>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>Trip name
                <input value={title} onChange={(e) => setTitle(e.target.value)} className="bs-input" placeholder="Office → Home" />
              </label>

              <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>Buddy who will watch you (optional if using phone / public link)
                <input value={buddyQuery} onChange={(e) => setBuddyQuery(e.target.value)} className="bs-input" placeholder="Search username" />
              </label>
              {buddyResults.length ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {buddyResults.map((buddy) => (
                    <button
                      key={buddy.username}
                      type="button"
                      className={`bs-trip-row${watcherUsername === buddy.username ? ' is-selected' : ''}`}
                      onClick={() => { setWatcherUsername(buddy.username); setBuddyQuery(buddy.username); }}
                    >
                      <span>@{buddy.username}</span>
                      <span style={{ color: theme.textMuted, fontSize: 12 }}>{buddy.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: theme.textPrimary }}>Starting from</div>
                <CurrentLocationPicker
                  label="Use current location"
                  active={Boolean(tripOrigin)}
                  loading={gpsLoading === 'origin'}
                  place={tripOrigin}
                  error={gpsError.origin}
                  onPick={pickOriginFromGps}
                  hint="Default — your live GPS position when the trip starts"
                />
              </div>

              <div style={{ display: 'grid', gap: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: theme.textPrimary }}>Destination (home / end point)</div>
                {destination && !destFromGps ? (
                  <div style={{ fontSize: 12, color: theme.green, padding: '8px 10px', borderRadius: 10, background: 'rgba(6,78,59,0.15)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    Selected · {destination.shortLabel || destination.label?.slice(0, 80) || `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}`}
                  </div>
                ) : null}
                <CurrentLocationPicker
                  label="Use current location"
                  active={destFromGps && Boolean(destination)}
                  loading={gpsLoading === 'dest'}
                  place={destFromGps ? destination : null}
                  error={gpsError.dest}
                  onPick={pickDestFromGps}
                  hint="Pick a spot on the map via GPS"
                />
                {profile.home ? (
                  <button type="button" className="bs-btn-ghost" onClick={useSavedHome}>Use saved home</button>
                ) : null}
                <div className="bs-place-divider">or search address</div>
                <input
                  value={destSearchQuery}
                  onChange={(e) => setDestSearchQuery(e.target.value)}
                  className="bs-input"
                  placeholder="e.g. Manyata, Bengaluru"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <PlaceSearchResults
                results={destSearch.results}
                loading={destSearch.loading}
                error={destSearch.error}
                query={destSearchQuery}
                onSelect={(place) => {
                  setDestination(place);
                  setDestFromGps(false);
                  setDestSearchQuery('');
                  setGpsFieldError('dest', '');
                }}
              />
              {profile.work && !destFromGps ? (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>
                  Work saved: {profile.work.label?.slice(0, 50)} — start is set from your GPS above.
                </p>
              ) : null}

              <div className="bs-form-grid">
                <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>Notify every (km)
                  <input type="number" min="0.5" step="0.5" value={notifyEveryKm} onChange={(e) => setNotifyEveryKm(Number(e.target.value))} className="bs-input" inputMode="decimal" />
                </label>
                <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>Stall alert after (min)
                  <input type="number" min="3" step="1" value={stallMinutes} onChange={(e) => setStallMinutes(Number(e.target.value))} className="bs-input" inputMode="numeric" />
                </label>
                <label style={{ display: 'grid', gap: 8, fontSize: 13 }}>Watcher phone (SMS / WhatsApp)
                  <input value={watcherPhone} onChange={(e) => setWatcherPhone(e.target.value)} className="bs-input" placeholder="+91 98765 43210" inputMode="tel" autoComplete="tel" />
                </label>
              </div>
              <div style={{ display: 'grid', gap: 4 }}>
                <label className="bs-check-row">
                  <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} />
                  Send SMS on km / stall alerts
                </label>
                <label className="bs-check-row">
                  <input type="checkbox" checked={notifyWhatsApp} onChange={(e) => setNotifyWhatsApp(e.target.checked)} />
                  Send WhatsApp on km / stall alerts
                </label>
              </div>

              <button type="button" className="bs-btn-primary bs-inline-cta" disabled={loading || isTracking} onClick={createAndStartTrip}>
                {loading ? 'Starting…' : 'Start live sharing'}
              </button>
              <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>Buddy gets browser + SMS/WhatsApp alerts every {notifyEveryKm} km. Stall alarm if distance stops decreasing for {stallMinutes} min.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12, position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 13, color: '#94a3b8' }}>Active trips update on the 3D map below in real time.</p>
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
                <div style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0' }}>No active buddy trips. Ask your friend to start sharing.</div>
              )}
            </div>
          )}
        </TiltCard>

        {selectedTrip ? (
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

      <MobileStickyCTA visible={tab === 'share' && !isTracking && !myActiveShare}>
        <button type="button" className="bs-btn-primary" disabled={loading} onClick={createAndStartTrip}>
          {loading ? 'Starting GPS…' : 'Start live sharing'}
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
