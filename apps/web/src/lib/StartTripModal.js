import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PlaceSearchResults,
  assertGeolocationAvailable,
  fetchPlaceFromCoords,
  geolocationErrorMessage,
  useGeocodeSearch,
} from './buddySafetyPlaceSearch';

const SHARE_DURATIONS = [
  { value: 60, label: '1 hour' },
  { value: 120, label: '2 hours' },
  { value: 0, label: 'Until I arrive' },
];

function getCurrentPosition() {
  assertGeolocationAvailable();
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      (err) => reject(Object.assign(new Error(geolocationErrorMessage(err)), { code: err.code })),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 },
    );
  });
}

export function StartTripModal({
  open,
  onClose,
  onStart,
  loading = false,
  profile = {},
  defaultWatcherPhone = '9717060569',
  actorUsername = '',
}) {
  const [origin, setOrigin] = useState(null);
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [destination, setDestination] = useState(null);
  const [shareMinutes, setShareMinutes] = useState(0);
  const [watcherUsername, setWatcherUsername] = useState('');
  const [watcherPhone, setWatcherPhone] = useState(defaultWatcherPhone);
  const [notifySms, setNotifySms] = useState(true);
  const [notifyWhatsApp, setNotifyWhatsApp] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [notifyEveryKm, setNotifyEveryKm] = useState(2);
  const [notifyIntervalMinutes, setNotifyIntervalMinutes] = useState(15);
  const [stallMinutes, setStallMinutes] = useState(8);
  const [buddies, setBuddies] = useState([]);
  const [buddiesLoading, setBuddiesLoading] = useState(false);

  function chatApiBase() {
    if (typeof window === 'undefined') return '';
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    return isLocalHost ? `http://${host}:3002/chat` : `${window.location.origin}/chat-api/chat`;
  }

  const proximity = useMemo(() => ({
    lat: origin?.lat,
    lng: origin?.lng,
    city: origin?.city || 'Bengaluru',
  }), [origin]);

  const destSearch = useGeocodeSearch(destQuery, { proximity });

  const destLabel = destination?.shortLabel || destination?.label?.split(',')[0] || '';

  const loadCurrentLocation = useCallback(async () => {
    setOriginLoading(true);
    setOriginError('');
    try {
      const pos = await getCurrentPosition();
      const place = await fetchPlaceFromCoords(pos.lat, pos.lng);
      setOrigin({ ...place, type: place.type || 'gps' });
    } catch (err) {
      setOriginError(err.message);
      setOrigin(null);
    } finally {
      setOriginLoading(false);
    }
  }, []);

  const resetForm = useCallback(() => {
    setOrigin(null);
    setOriginError('');
    setDestQuery('');
    setDestination(null);
    setShareMinutes(0);
    setWatcherUsername('');
    setWatcherPhone(defaultWatcherPhone);
    setNotifySms(true);
    setNotifyWhatsApp(true);
    setShowAdvanced(false);
    setNotifyEveryKm(2);
    setNotifyIntervalMinutes(15);
    setStallMinutes(8);
  }, [defaultWatcherPhone]);

  useEffect(() => {
    if (!open) return;
    resetForm();
    loadCurrentLocation();
  }, [open, resetForm, loadCurrentLocation]);

  useEffect(() => {
    if (!open || !actorUsername) return undefined;
    let cancelled = false;
    (async () => {
      setBuddiesLoading(true);
      try {
        const base = chatApiBase();
        const response = await fetch(`${base}/bootstrap?username=${encodeURIComponent(actorUsername)}`);
        const data = await response.json().catch(() => ({}));
        const friendNames = Array.isArray(data.friends) ? data.friends : [];
        if (!friendNames.length) {
          if (!cancelled) setBuddies([]);
          return;
        }
        const batchRes = await fetch('/api/chat/buddy-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernames: friendNames }),
        });
        const batchData = await batchRes.json().catch(() => ({}));
        if (!cancelled) setBuddies(Array.isArray(batchData.results) ? batchData.results : []);
      } catch (_) {
        if (!cancelled) setBuddies([]);
      } finally {
        if (!cancelled) setBuddiesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, actorUsername]);

  const pickDestination = useCallback((place) => {
    setDestination(place);
    setDestQuery('');
  }, []);

  const handleStart = useCallback(() => {
    if (!origin) {
      setOriginError('Allow location access to start your trip.');
      loadCurrentLocation();
      return;
    }
    if (!destination) return;

    const title = `Trip → ${destLabel || 'Destination'}`;
    onStart({
      title,
      origin,
      destination,
      watcherUsername,
      watcherPhone,
      notifySms,
      notifyWhatsApp,
      notifyEveryKm,
      notifyIntervalMinutes,
      stallMinutes,
      shareDurationMinutes: shareMinutes || null,
    });
  }, [origin, destination, destLabel, watcherUsername, watcherPhone, notifySms, notifyWhatsApp, notifyEveryKm, notifyIntervalMinutes, stallMinutes, shareMinutes, onStart, loadCurrentLocation]);

  if (!open) return null;

  return (
    <div className="bs-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="bs-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bs-start-trip-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bs-modal-header">
          <div>
            <div className="bs-eyebrow">Family safety</div>
            <h2 id="bs-start-trip-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 900 }}>Share your trip</h2>
          </div>
          <button type="button" className="bs-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="bs-modal-body">
          {originError ? <div className="bs-search-error">{originError}</div> : null}

          {destination && !destQuery ? (
            <div className="bs-modal-success-chip" style={{ marginBottom: 14 }}>
              Going to {destLabel}
            </div>
          ) : null}

          <div className="bs-modal-section">
            <div className="bs-modal-section-title">Where are you going?</div>

            {(profile.destinations || []).length ? (
              <div className="bs-modal-quick-picks">
                {(profile.destinations || []).map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    className={`bs-quick-pick${destination?.lat === saved.lat && destination?.lng === saved.lng ? ' is-active' : ''}`}
                    onClick={() => pickDestination(saved)}
                  >
                    {saved.name || saved.label?.split(',')[0] || 'Saved destination'}
                  </button>
                ))}
              </div>
            ) : null}

            <input
              value={destQuery}
              onChange={(e) => setDestQuery(e.target.value)}
              className="bs-input"
              placeholder="Search destination, e.g. Prestige Tech Park"
              autoComplete="off"
              spellCheck={false}
            />

            <PlaceSearchResults
              results={destSearch.results}
              loading={destSearch.loading}
              error={destSearch.error}
              query={destQuery}
              onSelect={pickDestination}
            />
          </div>

          <div className="bs-modal-section">
            <div className="bs-modal-section-title">Family contact</div>
            <p className="bs-modal-section-hint">Alerts are sent even when their browser is closed (SMS, WhatsApp, or app notification).</p>

            <label className="bs-modal-field">
              <span>Select buddy / family member</span>
              <select
                className="bs-input bs-select"
                value={watcherUsername}
                onChange={(e) => setWatcherUsername(e.target.value)}
              >
                <option value="">{buddiesLoading ? 'Loading buddies…' : 'Choose from your buddies'}</option>
                {buddies.map((buddy) => (
                  <option key={buddy.username} value={buddy.username}>
                    {(buddy.name || buddy.username)} (@{buddy.username})
                  </option>
                ))}
              </select>
            </label>

            <label className="bs-modal-field">
              <span>Family phone (SMS / WhatsApp)</span>
              <input
                value={watcherPhone}
                onChange={(e) => setWatcherPhone(e.target.value)}
                className="bs-input"
                inputMode="tel"
                placeholder="9717060569"
                autoComplete="tel"
              />
            </label>
            <div className="bs-modal-checks">
              <label className="bs-check-row">
                <input type="checkbox" checked={notifySms} onChange={(e) => setNotifySms(e.target.checked)} />
                SMS updates
              </label>
              <label className="bs-check-row">
                <input type="checkbox" checked={notifyWhatsApp} onChange={(e) => setNotifyWhatsApp(e.target.checked)} />
                WhatsApp updates
              </label>
            </div>
          </div>

          <div className="bs-modal-section">
            <div className="bs-modal-section-title">Share live location for</div>
            <div className="bs-duration-grid">
              {SHARE_DURATIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`bs-duration-btn${shareMinutes === opt.value ? ' is-active' : ''}`}
                  onClick={() => setShareMinutes(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="bs-advanced-toggle"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? '▾ Hide alert settings' : '▸ Alert settings (km / stall)'}
          </button>

          {showAdvanced ? (
            <div className="bs-form-grid">
              <label className="bs-modal-field">
                <span>Notify family every (km)</span>
                <input type="number" min="0.5" step="0.5" value={notifyEveryKm} onChange={(e) => setNotifyEveryKm(Number(e.target.value))} className="bs-input" inputMode="decimal" />
              </label>
              <label className="bs-modal-field">
                <span>Update family every (min)</span>
                <input type="number" min="5" step="5" value={notifyIntervalMinutes} onChange={(e) => setNotifyIntervalMinutes(Number(e.target.value))} className="bs-input" inputMode="numeric" />
              </label>
              <label className="bs-modal-field">
                <span>Emergency if stopped (min)</span>
                <input type="number" min="3" step="1" value={stallMinutes} onChange={(e) => setStallMinutes(Number(e.target.value))} className="bs-input" inputMode="numeric" />
              </label>
            </div>
          ) : null}

          <button
            type="button"
            className="bs-btn-primary"
            style={{ width: '100%', marginTop: 4 }}
            disabled={loading || !origin || !destination || originLoading}
            onClick={handleStart}
          >
            {loading ? 'Starting…' : 'Start sharing with family'}
          </button>
        </div>
      </div>
    </div>
  );
}
