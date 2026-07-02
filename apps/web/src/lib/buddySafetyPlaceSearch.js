import { useEffect, useState } from 'react';

/**
 * Debounced place search via server geocode API (Nominatim proxy).
 */
export function useGeocodeSearch(query, { minLength = 2, debounceMs = 350 } = {}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = String(query || '').trim();
    if (q.length < minLength) {
      setResults([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          `/api/buddy-safety/geocode?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Location search failed.');
        }
        const next = Array.isArray(data.results) ? data.results : [];
        setResults(next);
        if (!next.length) {
          setError('No places found. Try a landmark plus city, e.g. "Manyata, Bengaluru".');
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        setResults([]);
        setError(err.message || 'Could not search locations.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, minLength, debounceMs]);

  return { results, loading, error };
}

/** Resolve lat/lng to a labelled place via server reverse geocode. */
export async function fetchPlaceFromCoords(lat, lng) {
  const response = await fetch(
    `/api/buddy-safety/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not resolve address.');
  }
  if (!data.place) {
    return {
      lat: Number(lat),
      lng: Number(lng),
      label: 'Current location (GPS)',
      shortLabel: 'Current location',
      type: 'gps',
    };
  }
  return data.place;
}

export function geolocationErrorMessage(err) {
  const code = err?.code;
  if (code === 1) {
    return 'Location permission denied. Allow location access in your browser or phone settings, then tap again.';
  }
  if (code === 2) {
    return 'GPS signal unavailable. Turn on location services and try again.';
  }
  if (code === 3) {
    return 'GPS timed out. Move near a window or open sky and try again.';
  }
  return err?.message || 'Could not read GPS location.';
}

export function assertGeolocationAvailable() {
  if (typeof window === 'undefined') {
    throw new Error('Location is only available in the browser.');
  }
  if (!window.isSecureContext) {
    throw new Error('Location needs HTTPS. Use https:// or open the app on localhost.');
  }
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported on this device.');
  }
}

export function CurrentLocationPicker({
  label = 'Use current location',
  active = false,
  loading = false,
  place = null,
  onPick,
  hint = 'Default — uses your phone GPS',
  error = '',
}) {
  return (
    <div className={`bs-current-loc${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className={active ? 'bs-btn-primary' : 'bs-btn-ghost'}
        disabled={loading}
        onClick={onPick}
        style={active ? undefined : { width: '100%' }}
      >
        {loading ? 'Getting GPS…' : `📍 ${label}`}
      </button>
      {error ? <div className="bs-search-error">{error}</div> : null}
      {hint && !active && !error ? <div className="bs-search-hint">{hint}</div> : null}
      {active && place ? (
        <div className="bs-current-loc-label">
          <span className="bs-search-result-title">{place.shortLabel || place.label}</span>
          {place.label && place.shortLabel !== place.label ? (
            <span className="bs-search-result-sub">{place.label}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PlaceSearchResults({ results = [], onSelect, loading = false, error = '', query = '' }) {
  const trimmed = String(query || '').trim();

  if (trimmed.length > 0 && trimmed.length < 2) {
    return <div className="bs-search-hint">Type at least 2 characters to search.</div>;
  }
  if (loading) {
    return <div className="bs-search-hint">Searching places…</div>;
  }
  if (error) {
    return <div className="bs-search-error">{error}</div>;
  }
  if (trimmed.length >= 2 && !results.length) {
    return <div className="bs-search-hint">No matches yet. Try a landmark plus city.</div>;
  }
  if (!results.length) return null;

  return (
    <div className="bs-search-results" role="listbox" aria-label="Place search results">
      {results.map((row) => (
        <button
          key={`${row.lat}-${row.lng}-${row.label}`}
          type="button"
          className="bs-search-result"
          role="option"
          onClick={() => onSelect(row)}
        >
          <span className="bs-search-result-title">{row.shortLabel || row.label}</span>
          {row.shortLabel && row.label !== row.shortLabel ? (
            <span className="bs-search-result-sub">{row.label}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
